/**
 * Tests for observation.ts - PolicyObservation building from WorldState
 */

import { createWorld } from "./../world.js"
import { executeAction } from "./../engine.js"
import {
  getObservation,
  findNearestMineableArea,
  findBestNodeInArea,
  ObservationManager,
  diffObservations,
} from "./observation.js"
import type { PolicyObservation } from "./types.js"

describe("observation", () => {
  describe("getObservation", () => {
    it("returns correct initial state for new world", async () => {
      const state = createWorld("test-seed")

      // Enrol in Mining guild first
      state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
      await executeAction(state, { type: "Enrol" })
      state.exploration.playerState.currentLocationId = null

      const obs = getObservation(state)

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

      const obs = getObservation(state)

      expect(obs.inventorySlotsUsed).toBe(3)
      expect(obs.inventoryByItem["COPPER_ORE"]).toBe(5) // 2 + 3
      expect(obs.inventoryByItem["STONE"]).toBe(1)
    })

    it("filters to only known areas", async () => {
      const state = createWorld("test-seed")

      // Initially only TOWN is known
      const obs = getObservation(state)

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
      const obs = getObservation(state)

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
      let obs = getObservation(state)
      expect(obs.canDeposit).toBe(false)

      // At warehouse, no items
      state.exploration.playerState.currentLocationId = "TOWN_WAREHOUSE"
      obs = getObservation(state)
      expect(obs.canDeposit).toBe(false)

      // At warehouse, with items
      state.player.inventory.push({ itemId: "COPPER_ORE", quantity: 1 })
      obs = getObservation(state)
      expect(obs.canDeposit).toBe(true)

      // Not at warehouse, with items
      state.exploration.playerState.currentLocationId = null
      obs = getObservation(state)
      expect(obs.canDeposit).toBe(false)
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
      const directObs = getObservation(state)

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
      const initialObs = getObservation(state)
      if (initialObs.knownAreas.length > 0) {
        const targetArea = initialObs.knownAreas[0].areaId
        // Directly update player state to simulate travel (avoids Travel action complexity)
        state.exploration.playerState.currentAreaId = targetArea
      }

      const manager = new ObservationManager()
      const managerObs = manager.getObservation(state)
      const directObs = getObservation(state)

      expect(managerObs).toEqual(directObs)
    })

    it("produces identical output with inventory items", async () => {
      const state = createWorld("test-seed-3")

      // Add items to inventory
      state.player.inventory.push({ itemId: "COPPER_ORE", quantity: 2 })
      state.player.inventory.push({ itemId: "STONE", quantity: 5 })

      const manager = new ObservationManager()
      const managerObs = manager.getObservation(state)
      const directObs = getObservation(state)

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
      const directObs = getObservation(state)

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
