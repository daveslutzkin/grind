/**
 * Tests for policies - Safe miner
 */

import { safeMiner } from "./policies/safe.js"
import type { PolicyObservation, KnownArea } from "./types.js"

// Helper to create a minimal observation
function createObservation(overrides: Partial<PolicyObservation> = {}): PolicyObservation {
  return {
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
    ...overrides,
  }
}

// Helper to create a known area with mineable nodes
function createMineableArea(
  areaId: string,
  distance: number,
  travelTicks: number,
  tier: number = 1
): KnownArea {
  return {
    areaId,
    distance,
    travelTicksFromCurrent: travelTicks,
    discoveredNodes: [
      {
        nodeId: `${areaId}-node-0`,
        primaryMaterial: "COPPER_ORE",
        primaryMaterialTier: tier,
        secondaryMaterials: [],
        isMineable: true,
        remainingCharges: 100,
        locationId: `${areaId}-loc-0`,
      },
    ],
    isFullyExplored: false,
  }
}

describe("policies", () => {
  describe("safeMiner", () => {
    it("returns valid action for empty observation", () => {
      const obs = createObservation()
      const action = safeMiner.decide(obs)

      expect(action).toBeDefined()
      expect(action.type).toBeDefined()
    })

    it("handles full inventory correctly", () => {
      const obs = createObservation({
        inventorySlotsUsed: 10,
        inventoryCapacity: 10,
        isInTown: false,
        currentAreaId: "area-d1-i0",
      })

      const action = safeMiner.decide(obs)

      // Should return to town when inventory is full and not in town
      expect(action.type).toBe("ReturnToTown")
    })

    it("deposits when in town with full inventory", () => {
      const obs = createObservation({
        inventorySlotsUsed: 10,
        inventoryCapacity: 10,
        isInTown: true,
      })

      const action = safeMiner.decide(obs)

      expect(action.type).toBe("DepositInventory")
    })

    it("handles no known nodes (empty world)", () => {
      const obs = createObservation({
        knownAreas: [],
      })

      const action = safeMiner.decide(obs)

      // Should either wait or try to explore
      expect(["Wait", "Explore"].includes(action.type)).toBe(true)
    })

    it("prefers lower distance areas", () => {
      const obs = createObservation({
        isInTown: true,
        knownAreas: [
          createMineableArea("area-d2-i0", 2, 30, 3), // Further, higher tier
          createMineableArea("area-d1-i0", 1, 15, 1), // Closer, lower tier
        ],
      })

      const action = safeMiner.decide(obs)

      expect(action.type).toBe("Travel")
      if (action.type === "Travel") {
        expect(action.toAreaId).toBe("area-d1-i0") // Prefers closer
      }
    })

    it("mines when at area with mineable node", () => {
      const area = createMineableArea("area-d1-i0", 1, 0)
      const obs = createObservation({
        isInTown: false,
        currentAreaId: "area-d1-i0",
        currentArea: area,
        knownAreas: [area],
      })

      const action = safeMiner.decide(obs)

      expect(action.type).toBe("Mine")
    })
  })
})
