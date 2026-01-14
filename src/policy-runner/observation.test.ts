/**
 * Tests for observation.ts - PolicyObservation building from WorldState
 */

import { createWorld } from "./../world.js"
import { executeAction } from "./../engine.js"
import { getObservation, findNearestMineableArea, findBestNodeInArea } from "./observation.js"

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

      // Nodes in known areas should only include discovered nodes
      // Initially, no nodes are discovered
      const firstArea = obs.knownAreas[0]
      expect(firstArea.discoveredNodes.length).toBe(0)
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
})
