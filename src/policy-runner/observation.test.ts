/**
 * Tests for observation.ts - PolicyObservation building from WorldState
 */

import { createWorld } from "./../world.js"
import { executeAction } from "./../engine.js"
import {
  getObservationFresh,
  findNearestMineableArea,
  findBestNodeInArea,
  ObservationManager,
  diffObservations,
  getTravelTicks,
} from "./observation.js"
import type { PolicyObservation } from "./types.js"

describe("observation", () => {
  describe("getObservationFresh", () => {
    it("returns correct initial state for new world", async () => {
      const state = createWorld("test-seed")

      // Enrol in Mining guild first
      state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = null

      const obs = getObservationFresh(state)

      expect(obs.miningLevel).toBe(1)
      expect(obs.miningXpInLevel).toBe(0)
      expect(obs.miningTotalXp).toBe(0)
      expect(obs.inventoryCapacity).toBe(10)
      expect(obs.inventorySlotsUsed).toBe(0)
      expect(obs.currentAreaId).toBe("TOWN")
      expect(obs.isInTown).toBe(true)
      expect(obs.canDeposit).toBe(false)
      expect(obs.currentArea).toBeNull() // Town is not a mining area
    })

    it("shows correct inventory usage and per-item counts", async () => {
      const state = createWorld("test-seed")

      // Add some items to inventory
      state.player.inventory.push({ itemId: "COPPER_ORE", quantity: 2 })
      state.player.inventory.push({ itemId: "COPPER_ORE", quantity: 3 })
      state.player.inventory.push({ itemId: "STONE", quantity: 1 })

      const obs = getObservationFresh(state)

      expect(obs.inventorySlotsUsed).toBe(3)
      expect(obs.inventoryByItem["COPPER_ORE"]).toBe(5) // 2 + 3
      expect(obs.inventoryByItem["STONE"]).toBe(1)
    })

    it("filters to only known areas", async () => {
      const state = createWorld("test-seed")

      // Initially only TOWN is known
      const obs = getObservationFresh(state)

      // knownAreas should not include TOWN (it has no mining)
      expect(obs.knownAreas.every((a) => a.areaId !== "TOWN")).toBe(true)
    })

    it("includes discovered nodes only", async () => {
      const state = createWorld("test-seed")

      // Enrol in Mining and Exploration guilds
      state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = "TOWN_EXPLORERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = null

      // At this point, one distance-1 area should be known
      const obs = getObservationFresh(state)

      // Check that we have at least one known area
      expect(obs.knownAreas.length).toBeGreaterThan(0)

      // Mining enrollment discovers an ore vein, so we should have at least one
      // discovered node across all known areas
      const totalDiscoveredNodes = obs.knownAreas.reduce(
        (sum, area) => sum + area.discoveredNodes.length,
        0
      )
      expect(totalDiscoveredNodes).toBeGreaterThan(0)
    })

    it("correctly identifies canDeposit condition", async () => {
      const state = createWorld("test-seed")

      // Not at warehouse, no items
      let obs = getObservationFresh(state)
      expect(obs.canDeposit).toBe(false)

      // At warehouse, no items
      state.exploration.playerState.currentLocationId = "TOWN_WAREHOUSE"
      obs = getObservationFresh(state)
      expect(obs.canDeposit).toBe(false)

      // At warehouse, with items
      state.player.inventory.push({ itemId: "COPPER_ORE", quantity: 1 })
      obs = getObservationFresh(state)
      expect(obs.canDeposit).toBe(true)

      // Not at warehouse, with items
      state.exploration.playerState.currentLocationId = null
      obs = getObservationFresh(state)
      expect(obs.canDeposit).toBe(false)
    })

    it("sets isFullyExplored correctly even when area has mineable nodes", async () => {
      const state = createWorld("test-seed")

      // Enrol in Mining and Exploration guilds
      state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = "TOWN_EXPLORERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = null

      // Get initial observation to find an area with mineable nodes
      let obs = getObservationFresh(state)
      const areaWithNodes = obs.knownAreas.find((a) => a.discoveredNodes.length > 0)
      expect(areaWithNodes).toBeDefined()

      // Get the actual area from state
      const area = state.exploration.areas.get(areaWithNodes!.areaId)!

      // Mark ALL locations in this area as discovered (making it fully explored)
      for (const location of area.locations) {
        if (!state.exploration.playerState.knownLocationIds.includes(location.id)) {
          state.exploration.playerState.knownLocationIds.push(location.id)
        }
      }

      // Mark ALL connections from this area as discovered (including to unknown areas)
      for (const conn of state.exploration.connections) {
        if (conn.fromAreaId === area.id || conn.toAreaId === area.id) {
          const connId = `${conn.fromAreaId}->${conn.toAreaId}`
          if (!state.exploration.playerState.knownConnectionIds.includes(connId)) {
            state.exploration.playerState.knownConnectionIds.push(connId)
          }
        }
      }

      // Now get observation again - area should be fully explored but still have mineable nodes
      obs = getObservationFresh(state)
      const updatedArea = obs.knownAreas.find((a) => a.areaId === areaWithNodes!.areaId)
      expect(updatedArea).toBeDefined()
      expect(updatedArea!.discoveredNodes.length).toBeGreaterThan(0) // Still has mineable nodes
      expect(updatedArea!.isFullyExplored).toBe(true) // Should be marked as fully explored
    })
  })

  describe("findNearestMineableArea", () => {
    it("returns null when no mineable areas exist", () => {
      const obs = {
        miningLevel: 1,
        miningXpInLevel: 0,
        miningTotalXp: 0,
        inventoryCapacity: 10,
        inventorySlotsUsed: 0,
        inventoryByItem: {},
        currentAreaId: "TOWN",
        currentAreaDistance: 0,
        knownAreas: [],
        knownMineableMaterials: [],
        frontierAreas: [],
        currentArea: null,
        isInTown: true,
        canDeposit: false,
        returnTimeToTown: 0,
      }

      expect(findNearestMineableArea(obs)).toBeNull()
    })

    it("returns nearest area with mineable nodes", () => {
      const obs = {
        miningLevel: 1,
        miningXpInLevel: 0,
        miningTotalXp: 0,
        inventoryCapacity: 10,
        inventorySlotsUsed: 0,
        inventoryByItem: {},
        currentAreaId: "TOWN",
        currentAreaDistance: 0,
        knownAreas: [
          {
            areaId: "area-d1-i0",
            distance: 1,
            travelTicksFromCurrent: 20,
            discoveredNodes: [
              {
                nodeId: "area-d1-i0-node-0",
                primaryMaterial: "COPPER_ORE",
                primaryMaterialTier: 1,
                secondaryMaterials: [],
                isMineable: true,
                remainingCharges: 100,
                locationId: "area-d1-i0-loc-0",
              },
            ],
            isFullyExplored: false,
          },
          {
            areaId: "area-d1-i1",
            distance: 1,
            travelTicksFromCurrent: 10,
            discoveredNodes: [
              {
                nodeId: "area-d1-i1-node-0",
                primaryMaterial: "STONE",
                primaryMaterialTier: 1,
                secondaryMaterials: [],
                isMineable: true,
                remainingCharges: 50,
                locationId: "area-d1-i1-loc-0",
              },
            ],
            isFullyExplored: false,
          },
        ],
        knownMineableMaterials: ["COPPER_ORE", "STONE"],
        frontierAreas: [],
        currentArea: null,
        isInTown: true,
        canDeposit: false,
        returnTimeToTown: 0,
      }

      const result = findNearestMineableArea(obs)
      expect(result?.areaId).toBe("area-d1-i1") // Nearest by travel time
    })
  })

  describe("findBestNodeInArea", () => {
    it("returns null when no mineable nodes exist", () => {
      const area = {
        areaId: "area-d1-i0",
        distance: 1,
        travelTicksFromCurrent: 10,
        discoveredNodes: [],
        isFullyExplored: false,
      }

      expect(findBestNodeInArea(area)).toBeNull()
    })

    it("returns highest tier mineable node", () => {
      const area = {
        areaId: "area-d1-i0",
        distance: 1,
        travelTicksFromCurrent: 10,
        discoveredNodes: [
          {
            nodeId: "node-1",
            primaryMaterial: "STONE",
            primaryMaterialTier: 1,
            secondaryMaterials: [],
            isMineable: true,
            remainingCharges: 100,
            locationId: "loc-1",
          },
          {
            nodeId: "node-2",
            primaryMaterial: "TIN_ORE",
            primaryMaterialTier: 2,
            secondaryMaterials: [],
            isMineable: true,
            remainingCharges: 50,
            locationId: "loc-2",
          },
        ],
        isFullyExplored: false,
      }

      const result = findBestNodeInArea(area)
      expect(result?.nodeId).toBe("node-2") // Higher tier
    })

    it("excludes depleted nodes", () => {
      const area = {
        areaId: "area-d1-i0",
        distance: 1,
        travelTicksFromCurrent: 10,
        discoveredNodes: [
          {
            nodeId: "node-1",
            primaryMaterial: "STONE",
            primaryMaterialTier: 1,
            secondaryMaterials: [],
            isMineable: true,
            remainingCharges: 100,
            locationId: "loc-1",
          },
          {
            nodeId: "node-2",
            primaryMaterial: "TIN_ORE",
            primaryMaterialTier: 2,
            secondaryMaterials: [],
            isMineable: true,
            remainingCharges: null, // Depleted
            locationId: "loc-2",
          },
        ],
        isFullyExplored: false,
      }

      const result = findBestNodeInArea(area)
      expect(result?.nodeId).toBe("node-1") // Only non-depleted
    })
  })

  describe("ObservationManager", () => {
    it("produces identical output to getObservation for initial state", async () => {
      const state = createWorld("test-seed")

      // Enrol in Mining guild
      state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = null

      const manager = new ObservationManager()
      const managerObs = manager.getObservation(state)
      const directObs = getObservationFresh(state)

      expect(managerObs).toEqual(directObs)
    })

    it("produces identical output after exploration actions", async () => {
      const state = createWorld("test-seed-2")

      // Enrol in both guilds
      state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = "TOWN_EXPLORERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = null

      // Simulate exploration by manually setting player location to a known area
      const initialObs = getObservationFresh(state)
      if (initialObs.knownAreas.length > 0) {
        const targetArea = initialObs.knownAreas[0].areaId
        // Directly update player state to simulate travel (avoids Travel action complexity)
        state.exploration.playerState.currentAreaId = targetArea
      }

      const manager = new ObservationManager()
      const managerObs = manager.getObservation(state)
      const directObs = getObservationFresh(state)

      expect(managerObs).toEqual(directObs)
    })

    it("produces identical output with inventory items", async () => {
      const state = createWorld("test-seed-3")

      // Add items to inventory
      state.player.inventory.push({ itemId: "COPPER_ORE", quantity: 2 })
      state.player.inventory.push({ itemId: "STONE", quantity: 5 })

      const manager = new ObservationManager()
      const managerObs = manager.getObservation(state)
      const directObs = getObservationFresh(state)

      expect(managerObs).toEqual(directObs)
    })

    it("reset clears internal state", async () => {
      const state = createWorld("test-seed")
      const manager = new ObservationManager()

      // Get observation (builds internal state)
      manager.getObservation(state)

      // Reset should clear state
      manager.reset()

      // Should still work and produce correct output
      const managerObs = manager.getObservation(state)
      const directObs = getObservationFresh(state)

      expect(managerObs).toEqual(directObs)
    })

    it("validate does not throw when observation matches state", async () => {
      const state = createWorld("test-seed")
      const manager = new ObservationManager(100) // Validate every 100 ticks

      // Get observation at tick 0
      manager.getObservation(state)

      // Validation at tick 100 should pass (no drift)
      expect(() => manager.validate(state, 100)).not.toThrow()
    })

    it("validate only runs at configured interval", async () => {
      const state = createWorld("test-seed")
      const manager = new ObservationManager(100)

      manager.getObservation(state)

      // Validation at non-interval ticks should do nothing (not throw)
      expect(() => manager.validate(state, 50)).not.toThrow()
      expect(() => manager.validate(state, 99)).not.toThrow()
    })

    it("shouldValidate returns true only at interval", () => {
      const manager = new ObservationManager(100)

      expect(manager.shouldValidate(0)).toBe(true)
      expect(manager.shouldValidate(50)).toBe(false)
      expect(manager.shouldValidate(100)).toBe(true)
      expect(manager.shouldValidate(200)).toBe(true)
    })

    it("validation can be disabled", () => {
      const manager = new ObservationManager(100)

      manager.setValidationEnabled(false)
      expect(manager.shouldValidate(100)).toBe(false)

      manager.setValidationEnabled(true)
      expect(manager.shouldValidate(100)).toBe(true)
    })

    it("applyActionResult marks travel times as stale after travel", async () => {
      const state = createWorld("test-seed-travel")

      // Enrol in Mining and Exploration guilds
      state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = "TOWN_EXPLORERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = null

      const manager = new ObservationManager()
      const obs = manager.getObservation(state)

      // Find a known area to travel to
      expect(obs.knownAreas.length).toBeGreaterThan(0)
      const targetArea = obs.knownAreas[0]

      // Verify travel times are initially computed (non-negative)
      expect(targetArea.travelTicksFromCurrent).toBeGreaterThanOrEqual(0)

      // Simulate travel by updating player location
      state.exploration.playerState.currentAreaId = targetArea.areaId

      // Apply travel action result
      manager.applyActionResult(
        state,
        { type: "Travel", toAreaId: targetArea.areaId },
        { ticksConsumed: 22, success: true, nodesDiscovered: 0 }
      )

      // Get the updated observation
      const updatedObs = manager.getObservation(state)

      // Current area distance should be updated
      expect(updatedObs.currentAreaDistance).toBe(targetArea.distance)

      // Other areas should have stale travel times (-1) which getTravelTicks can compute
      for (const area of updatedObs.knownAreas) {
        if (area.areaId !== targetArea.areaId) {
          // Travel time might be stale (-1) or computed, but getTravelTicks should work
          const travelTicks = getTravelTicks(updatedObs, area)
          expect(travelTicks).toBeGreaterThanOrEqual(0)
        }
      }
    })

    it("applyActionResult updates node charges after mining", async () => {
      const state = createWorld("test-seed-mine")

      // Enrol in Mining and Exploration guilds
      state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = "TOWN_EXPLORERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = null

      const manager = new ObservationManager()
      const obs = manager.getObservation(state)

      // Find a mineable node
      const areaWithNode = obs.knownAreas.find((a) =>
        a.discoveredNodes.some((n) => n.isMineable && n.remainingCharges)
      )
      expect(areaWithNode).toBeDefined()

      const mineableNode = areaWithNode!.discoveredNodes.find(
        (n) => n.isMineable && n.remainingCharges
      )
      expect(mineableNode).toBeDefined()
      const originalCharges = mineableNode!.remainingCharges!

      // Directly modify the world state to simulate mining (reduce charges by 1)
      const actualNode = state.world.nodes?.find((n) => n.nodeId === mineableNode!.nodeId)
      expect(actualNode).toBeDefined()
      const material = actualNode!.materials[0]
      material.remainingUnits -= 1

      // Apply the mine action result
      manager.applyActionResult(
        state,
        { type: "Mine", nodeId: mineableNode!.nodeId },
        { ticksConsumed: 10, success: true, nodesDiscovered: 0 }
      )

      // Get the observation (should be the cached one updated incrementally)
      const updatedObs = manager.getObservation(state)

      // Find the same node in the updated observation
      const updatedArea = updatedObs.knownAreas.find((a) => a.areaId === areaWithNode!.areaId)
      expect(updatedArea).toBeDefined()

      const updatedNode = updatedArea!.discoveredNodes.find(
        (n) => n.nodeId === mineableNode!.nodeId
      )
      expect(updatedNode).toBeDefined()
      expect(updatedNode!.remainingCharges).toBe(originalCharges - 1)
    })

    it("applyExploreResult incrementally adds newly discovered node", async () => {
      const state = createWorld("test-seed-explore-node")

      // Enrol in Mining and Exploration guilds
      state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = "TOWN_EXPLORERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = null

      const manager = new ObservationManager()

      // Travel to a known area with undiscovered nodes
      const initialObs = manager.getObservation(state)
      expect(initialObs.knownAreas.length).toBeGreaterThan(0)

      const targetArea = initialObs.knownAreas[0]
      state.exploration.playerState.currentAreaId = targetArea.areaId

      // Apply travel result to update current area
      manager.applyActionResult(
        state,
        { type: "Travel", toAreaId: targetArea.areaId },
        { ticksConsumed: 22, success: true, nodesDiscovered: 0 }
      )

      // Get the current observation
      const obsBeforeExplore = manager.getObservation(state)
      const nodesBeforeExplore = obsBeforeExplore.currentArea?.discoveredNodes.length ?? 0

      // Find an undiscovered location in current area
      const currentAreaData = state.exploration.areas.get(targetArea.areaId)!
      const undiscoveredLoc = currentAreaData.locations.find(
        (loc) => !state.exploration.playerState.knownLocationIds.includes(loc.id)
      )

      if (undiscoveredLoc) {
        // Simulate discovering a location (as Explore action would do)
        state.exploration.playerState.knownLocationIds.push(undiscoveredLoc.id)

        // Apply explore result
        manager.applyActionResult(
          state,
          { type: "Explore", areaId: targetArea.areaId },
          { ticksConsumed: 10, success: true, nodesDiscovered: 1 }
        )

        // Verify the observation still matches fresh rebuild
        const incrementalObs = manager.getObservation(state)
        const freshObs = getObservationFresh(state)

        const diffs = diffObservations(freshObs, incrementalObs)
        expect(diffs).toEqual([])

        // Verify node count increased (if the location was a mining node)
        if (undiscoveredLoc.gatheringSkillType === "Mining") {
          expect(incrementalObs.currentArea?.discoveredNodes.length).toBeGreaterThan(
            nodesBeforeExplore
          )
        }
      }
    })

    it("applyExploreResult incrementally adds new frontier when connection to unknown area discovered", async () => {
      const state = createWorld("test-seed-explore-frontier")

      // Enrol in Mining and Exploration guilds
      state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = "TOWN_EXPLORERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = null

      const manager = new ObservationManager()

      // Travel to a known area
      const initialObs = manager.getObservation(state)
      expect(initialObs.knownAreas.length).toBeGreaterThan(0)

      const targetArea = initialObs.knownAreas[0]
      state.exploration.playerState.currentAreaId = targetArea.areaId

      // Apply travel result
      manager.applyActionResult(
        state,
        { type: "Travel", toAreaId: targetArea.areaId },
        { ticksConsumed: 22, success: true, nodesDiscovered: 0 }
      )

      const obsBeforeExplore = manager.getObservation(state)
      const frontiersBeforeExplore = obsBeforeExplore.frontierAreas.length

      // Find a connection to an unknown area
      const currentAreaData = state.exploration.areas.get(targetArea.areaId)!
      const knownAreaIds = new Set(state.exploration.playerState.knownAreaIds)

      const undiscoveredConnection = state.exploration.connections.find((conn) => {
        const isFromCurrentArea =
          conn.fromAreaId === currentAreaData.id || conn.toAreaId === currentAreaData.id
        if (!isFromCurrentArea) return false

        const targetId = conn.fromAreaId === currentAreaData.id ? conn.toAreaId : conn.fromAreaId
        const connId = `${conn.fromAreaId}->${conn.toAreaId}`
        const reverseConnId = `${conn.toAreaId}->${conn.fromAreaId}`

        return (
          !knownAreaIds.has(targetId) &&
          !state.exploration.playerState.knownConnectionIds.includes(connId) &&
          !state.exploration.playerState.knownConnectionIds.includes(reverseConnId)
        )
      })

      if (undiscoveredConnection) {
        // Simulate discovering the connection
        const connId = `${undiscoveredConnection.fromAreaId}->${undiscoveredConnection.toAreaId}`
        state.exploration.playerState.knownConnectionIds.push(connId)

        // Apply explore result
        manager.applyActionResult(
          state,
          { type: "Explore", areaId: targetArea.areaId },
          { ticksConsumed: 10, success: true, nodesDiscovered: 0 }
        )

        // Verify the observation matches fresh rebuild
        const incrementalObs = manager.getObservation(state)
        const freshObs = getObservationFresh(state)

        const diffs = diffObservations(freshObs, incrementalObs)
        expect(diffs).toEqual([])

        // Verify frontier count increased
        expect(incrementalObs.frontierAreas.length).toBeGreaterThan(frontiersBeforeExplore)
      }
    })

    it("applyExploreResult updates isFullyExplored when area becomes fully explored", async () => {
      const state = createWorld("test-seed-explore-full")

      // Enrol in Mining and Exploration guilds
      state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = "TOWN_EXPLORERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = null

      const manager = new ObservationManager()
      const initialObs = manager.getObservation(state)

      // Find a known area to travel to
      expect(initialObs.knownAreas.length).toBeGreaterThan(0)
      const targetAreaId = initialObs.knownAreas[0].areaId

      // Travel to the area
      state.exploration.playerState.currentAreaId = targetAreaId
      manager.applyActionResult(
        state,
        { type: "Travel", toAreaId: targetAreaId },
        { ticksConsumed: 22, success: true, nodesDiscovered: 0 }
      )

      // Get area data
      const areaData = state.exploration.areas.get(targetAreaId)!

      // Discover ALL locations in this area
      for (const loc of areaData.locations) {
        if (!state.exploration.playerState.knownLocationIds.includes(loc.id)) {
          state.exploration.playerState.knownLocationIds.push(loc.id)
        }
      }

      // Discover ALL connections from this area (including to unknown areas)
      for (const conn of state.exploration.connections) {
        if (conn.fromAreaId === targetAreaId || conn.toAreaId === targetAreaId) {
          const connId = `${conn.fromAreaId}->${conn.toAreaId}`
          if (!state.exploration.playerState.knownConnectionIds.includes(connId)) {
            state.exploration.playerState.knownConnectionIds.push(connId)
          }
        }
      }

      // Apply explore result
      manager.applyActionResult(
        state,
        { type: "Explore", areaId: targetAreaId },
        { ticksConsumed: 10, success: true, nodesDiscovered: 1 }
      )

      // Verify the observation matches fresh rebuild
      const incrementalObs = manager.getObservation(state)
      const freshObs = getObservationFresh(state)

      const diffs = diffObservations(freshObs, incrementalObs)
      expect(diffs).toEqual([])

      // Verify isFullyExplored is true for the current area
      expect(incrementalObs.currentArea?.isFullyExplored).toBe(true)
    })

    it("applyTravelResult incrementally handles frontier travel - adds new area to knownAreas", async () => {
      const state = createWorld("test-seed-frontier-travel")

      // Enrol in Mining and Exploration guilds
      state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = "TOWN_EXPLORERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = null

      const manager = new ObservationManager()

      // First travel to a known area and discover connections to create frontiers
      let initialObs = manager.getObservation(state)
      expect(initialObs.knownAreas.length).toBeGreaterThan(0)

      const knownArea = initialObs.knownAreas[0]
      state.exploration.playerState.currentAreaId = knownArea.areaId

      // Discover connections from the known area to create frontiers
      for (const conn of state.exploration.connections) {
        if (conn.fromAreaId === knownArea.areaId || conn.toAreaId === knownArea.areaId) {
          const connId = `${conn.fromAreaId}->${conn.toAreaId}`
          if (!state.exploration.playerState.knownConnectionIds.includes(connId)) {
            state.exploration.playerState.knownConnectionIds.push(connId)
          }
        }
      }

      // Reset manager to rebuild with new state
      manager.reset()
      initialObs = manager.getObservation(state)

      // Now we should have frontier areas
      expect(initialObs.frontierAreas.length).toBeGreaterThan(0)

      const frontierTarget = initialObs.frontierAreas[0]
      const frontierAreaId = frontierTarget.areaId

      // Verify the frontier is not yet in knownAreas
      expect(initialObs.knownAreas.some((a) => a.areaId === frontierAreaId)).toBe(false)

      // Simulate frontier travel by:
      // 1. Adding the area to knownAreaIds
      // 2. Updating player's currentAreaId
      // 3. Adding some locations/connections
      state.exploration.playerState.knownAreaIds.push(frontierAreaId)
      state.exploration.playerState.currentAreaId = frontierAreaId

      // Get the area data and add initial location discovery
      const areaData = state.exploration.areas.get(frontierAreaId)!
      const initialLoc = areaData.locations[0]
      if (initialLoc && !state.exploration.playerState.knownLocationIds.includes(initialLoc.id)) {
        state.exploration.playerState.knownLocationIds.push(initialLoc.id)
      }

      // Apply travel result with areasDiscovered = 1
      manager.applyActionResult(
        state,
        { type: "Travel", toAreaId: frontierAreaId },
        { ticksConsumed: 22, success: true, nodesDiscovered: 0, areasDiscovered: 1 }
      )

      // Verify the observation matches fresh rebuild
      const incrementalObs = manager.getObservation(state)
      const freshObs = getObservationFresh(state)

      const diffs = diffObservations(freshObs, incrementalObs)
      expect(diffs).toEqual([])

      // Verify new area appears in knownAreas
      expect(incrementalObs.knownAreas.some((a) => a.areaId === frontierAreaId)).toBe(true)

      // Verify new area is no longer in frontierAreas
      expect(incrementalObs.frontierAreas.some((f) => f.areaId === frontierAreaId)).toBe(false)

      // Verify currentArea is set correctly
      expect(incrementalObs.currentArea?.areaId).toBe(frontierAreaId)
      expect(incrementalObs.currentAreaId).toBe(frontierAreaId)
    })

    it("applyTravelResult removes traveled-to area from frontierAreas", async () => {
      const state = createWorld("test-seed-frontier-remove")

      // Enrol in Mining and Exploration guilds
      state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = "TOWN_EXPLORERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = null

      const manager = new ObservationManager()

      // First travel to a known area and discover connections to create frontiers
      let initialObs = manager.getObservation(state)
      expect(initialObs.knownAreas.length).toBeGreaterThan(0)

      const knownArea = initialObs.knownAreas[0]
      state.exploration.playerState.currentAreaId = knownArea.areaId

      // Discover connections from the known area to create frontiers
      for (const conn of state.exploration.connections) {
        if (conn.fromAreaId === knownArea.areaId || conn.toAreaId === knownArea.areaId) {
          const connId = `${conn.fromAreaId}->${conn.toAreaId}`
          if (!state.exploration.playerState.knownConnectionIds.includes(connId)) {
            state.exploration.playerState.knownConnectionIds.push(connId)
          }
        }
      }

      // Reset manager to rebuild with new state
      manager.reset()
      initialObs = manager.getObservation(state)

      expect(initialObs.frontierAreas.length).toBeGreaterThan(0)
      const frontierTarget = initialObs.frontierAreas[0]
      const frontierAreaId = frontierTarget.areaId

      // Simulate frontier travel
      state.exploration.playerState.knownAreaIds.push(frontierAreaId)
      state.exploration.playerState.currentAreaId = frontierAreaId

      const areaData = state.exploration.areas.get(frontierAreaId)!
      const initialLoc = areaData.locations[0]
      if (initialLoc && !state.exploration.playerState.knownLocationIds.includes(initialLoc.id)) {
        state.exploration.playerState.knownLocationIds.push(initialLoc.id)
      }

      // Apply travel result
      manager.applyActionResult(
        state,
        { type: "Travel", toAreaId: frontierAreaId },
        { ticksConsumed: 22, success: true, nodesDiscovered: 0, areasDiscovered: 1 }
      )

      const incrementalObs = manager.getObservation(state)

      // Verify the traveled-to area is no longer a frontier
      expect(incrementalObs.frontierAreas.some((f) => f.areaId === frontierAreaId)).toBe(false)

      // Verify the observation matches fresh rebuild
      const freshObs = getObservationFresh(state)
      expect(diffObservations(freshObs, incrementalObs)).toEqual([])
    })

    it("applyTravelResult adds new frontiers from new area's connections", async () => {
      const state = createWorld("test-seed-frontier-new-connections")

      // Enrol in Mining and Exploration guilds
      state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = "TOWN_EXPLORERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = null

      const manager = new ObservationManager()

      // First travel to a known area and discover connections to create frontiers
      let initialObs = manager.getObservation(state)
      expect(initialObs.knownAreas.length).toBeGreaterThan(0)

      const knownArea = initialObs.knownAreas[0]
      state.exploration.playerState.currentAreaId = knownArea.areaId

      // Discover connections from the known area to create frontiers
      for (const conn of state.exploration.connections) {
        if (conn.fromAreaId === knownArea.areaId || conn.toAreaId === knownArea.areaId) {
          const connId = `${conn.fromAreaId}->${conn.toAreaId}`
          if (!state.exploration.playerState.knownConnectionIds.includes(connId)) {
            state.exploration.playerState.knownConnectionIds.push(connId)
          }
        }
      }

      // Reset manager to rebuild with new state
      manager.reset()
      initialObs = manager.getObservation(state)

      expect(initialObs.frontierAreas.length).toBeGreaterThan(0)
      const frontierTarget = initialObs.frontierAreas[0]
      const frontierAreaId = frontierTarget.areaId

      // Simulate frontier travel
      state.exploration.playerState.knownAreaIds.push(frontierAreaId)
      state.exploration.playerState.currentAreaId = frontierAreaId

      const areaData = state.exploration.areas.get(frontierAreaId)!
      const initialLoc = areaData.locations[0]
      if (initialLoc && !state.exploration.playerState.knownLocationIds.includes(initialLoc.id)) {
        state.exploration.playerState.knownLocationIds.push(initialLoc.id)
      }

      // Also discover some connections from the new area (simulating what happens during travel)
      for (const conn of state.exploration.connections) {
        if (conn.fromAreaId === frontierAreaId || conn.toAreaId === frontierAreaId) {
          const connId = `${conn.fromAreaId}->${conn.toAreaId}`
          if (!state.exploration.playerState.knownConnectionIds.includes(connId)) {
            state.exploration.playerState.knownConnectionIds.push(connId)
          }
        }
      }

      // Apply travel result
      manager.applyActionResult(
        state,
        { type: "Travel", toAreaId: frontierAreaId },
        { ticksConsumed: 22, success: true, nodesDiscovered: 0, areasDiscovered: 1 }
      )

      // Verify the observation matches fresh rebuild (this verifies new frontiers are added correctly)
      const incrementalObs = manager.getObservation(state)
      const freshObs = getObservationFresh(state)

      const diffs = diffObservations(freshObs, incrementalObs)
      expect(diffs).toEqual([])
    })

    it("applyTravelResult updates knownMineableMaterials for new area nodes", async () => {
      const state = createWorld("test-seed-frontier-materials")

      // Enrol in Mining and Exploration guilds
      state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = "TOWN_EXPLORERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = null

      const manager = new ObservationManager()

      // First travel to a known area and discover connections to create frontiers
      let initialObs = manager.getObservation(state)
      expect(initialObs.knownAreas.length).toBeGreaterThan(0)

      const knownArea = initialObs.knownAreas[0]
      state.exploration.playerState.currentAreaId = knownArea.areaId

      // Discover connections from the known area to create frontiers
      for (const conn of state.exploration.connections) {
        if (conn.fromAreaId === knownArea.areaId || conn.toAreaId === knownArea.areaId) {
          const connId = `${conn.fromAreaId}->${conn.toAreaId}`
          if (!state.exploration.playerState.knownConnectionIds.includes(connId)) {
            state.exploration.playerState.knownConnectionIds.push(connId)
          }
        }
      }

      // Reset manager to rebuild with new state
      manager.reset()
      initialObs = manager.getObservation(state)

      expect(initialObs.frontierAreas.length).toBeGreaterThan(0)
      const frontierTarget = initialObs.frontierAreas[0]
      const frontierAreaId = frontierTarget.areaId

      // Simulate frontier travel
      state.exploration.playerState.knownAreaIds.push(frontierAreaId)
      state.exploration.playerState.currentAreaId = frontierAreaId

      // Discover all locations (to ensure we get all the nodes and their materials)
      const areaData = state.exploration.areas.get(frontierAreaId)!
      for (const loc of areaData.locations) {
        if (!state.exploration.playerState.knownLocationIds.includes(loc.id)) {
          state.exploration.playerState.knownLocationIds.push(loc.id)
        }
      }

      // Apply travel result
      manager.applyActionResult(
        state,
        { type: "Travel", toAreaId: frontierAreaId },
        { ticksConsumed: 22, success: true, nodesDiscovered: 0, areasDiscovered: 1 }
      )

      // Verify the observation matches fresh rebuild (this verifies materials are tracked correctly)
      const incrementalObs = manager.getObservation(state)
      const freshObs = getObservationFresh(state)

      const diffs = diffObservations(freshObs, incrementalObs)
      expect(diffs).toEqual([])
    })
  })

  describe("getTravelTicks", () => {
    it("returns cached value when travelTicksFromCurrent is non-negative", () => {
      const obs = {
        currentAreaId: "TOWN",
        currentAreaDistance: 0,
      } as any

      const area = {
        areaId: "area-d1-i0",
        distance: 1,
        travelTicksFromCurrent: 22, // Already computed
      } as any

      expect(getTravelTicks(obs, area)).toBe(22)
    })

    it("computes travel time when travelTicksFromCurrent is -1 (stale)", () => {
      const obs = {
        currentAreaId: "area-d1-i0",
        currentAreaDistance: 1,
      } as any

      const area = {
        areaId: "area-d2-i0",
        distance: 2,
        travelTicksFromCurrent: -1, // Stale - needs computation
      } as any

      // From distance 1 to distance 2 = 1 hop = 22 ticks (BASE_TRAVEL_TICKS)
      expect(getTravelTicks(obs, area)).toBe(22)
    })

    it("returns 0 for current area", () => {
      const obs = {
        currentAreaId: "area-d1-i0",
        currentAreaDistance: 1,
      } as any

      const area = {
        areaId: "area-d1-i0",
        distance: 1,
        travelTicksFromCurrent: -1,
      } as any

      expect(getTravelTicks(obs, area)).toBe(0)
    })
  })

  describe("diffObservations", () => {
    const baseObservation: PolicyObservation = {
      miningLevel: 1,
      miningXpInLevel: 0,
      miningTotalXp: 0,
      inventoryCapacity: 10,
      inventorySlotsUsed: 0,
      inventoryByItem: {},
      currentAreaId: "TOWN",
      currentAreaDistance: 0,
      knownAreas: [],
      knownMineableMaterials: [],
      frontierAreas: [],
      currentArea: null,
      isInTown: true,
      canDeposit: false,
      returnTimeToTown: 0,
    }

    it("returns empty array for identical observations", () => {
      const diffs = diffObservations(baseObservation, { ...baseObservation })
      expect(diffs).toEqual([])
    })

    it("detects miningLevel difference", () => {
      const modified = { ...baseObservation, miningLevel: 2 }
      const diffs = diffObservations(baseObservation, modified)
      expect(diffs).toContainEqual({
        field: "miningLevel",
        expected: 1,
        actual: 2,
      })
    })

    it("detects miningXpInLevel difference", () => {
      const modified = { ...baseObservation, miningXpInLevel: 50 }
      const diffs = diffObservations(baseObservation, modified)
      expect(diffs).toContainEqual({
        field: "miningXpInLevel",
        expected: 0,
        actual: 50,
      })
    })

    it("detects inventoryByItem differences", () => {
      const obs1 = { ...baseObservation, inventoryByItem: { COPPER_ORE: 5 } }
      const obs2 = { ...baseObservation, inventoryByItem: { COPPER_ORE: 3 } }
      const diffs = diffObservations(obs1, obs2)
      expect(diffs).toContainEqual({
        field: "inventoryByItem",
        expected: { COPPER_ORE: 5 },
        actual: { COPPER_ORE: 3 },
      })
    })

    it("detects knownAreas length difference", () => {
      const obs1 = { ...baseObservation, knownAreas: [] }
      const obs2 = {
        ...baseObservation,
        knownAreas: [
          {
            areaId: "area-d1-i0",
            distance: 1,
            travelTicksFromCurrent: 22,
            discoveredNodes: [],
            isFullyExplored: false,
          },
        ],
      }
      const diffs = diffObservations(obs1, obs2)
      expect(diffs.some((d) => d.field === "knownAreas.length")).toBe(true)
    })

    it("detects currentAreaId difference", () => {
      const modified = { ...baseObservation, currentAreaId: "area-d1-i0" as const }
      const diffs = diffObservations(baseObservation, modified)
      expect(diffs).toContainEqual({
        field: "currentAreaId",
        expected: "TOWN",
        actual: "area-d1-i0",
      })
    })

    it("detects isInTown difference", () => {
      const modified = { ...baseObservation, isInTown: false }
      const diffs = diffObservations(baseObservation, modified)
      expect(diffs).toContainEqual({
        field: "isInTown",
        expected: true,
        actual: false,
      })
    })

    it("detects knownMineableMaterials difference", () => {
      const obs1 = { ...baseObservation, knownMineableMaterials: ["COPPER_ORE"] }
      const obs2 = { ...baseObservation, knownMineableMaterials: ["COPPER_ORE", "STONE"] }
      const diffs = diffObservations(obs1, obs2)
      expect(diffs.some((d) => d.field.includes("knownMineableMaterials"))).toBe(true)
    })
  })
})
