/**
 * Tests for policies - Safe, Greedy, and Balanced miners
 */

import { safeMiner } from "./policies/safe.js"
import { greedyMiner } from "./policies/greedy.js"
import { balancedMiner } from "./policies/balanced.js"
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
  describe("all policies", () => {
    const policies = [safeMiner, greedyMiner, balancedMiner]

    it.each(policies)("%s returns valid action for empty observation", (policy) => {
      const obs = createObservation()
      const action = policy.decide(obs)

      expect(action).toBeDefined()
      expect(action.type).toBeDefined()
    })

    it.each(policies)("%s handles full inventory correctly", (policy) => {
      const obs = createObservation({
        inventorySlotsUsed: 10,
        inventoryCapacity: 10,
        isInTown: false,
        currentAreaId: "area-d1-i0",
      })

      const action = policy.decide(obs)

      // Should return to town when inventory is full and not in town
      expect(action.type).toBe("ReturnToTown")
    })

    it.each(policies)("%s deposits when in town with full inventory", (policy) => {
      const obs = createObservation({
        inventorySlotsUsed: 10,
        inventoryCapacity: 10,
        isInTown: true,
      })

      const action = policy.decide(obs)

      expect(action.type).toBe("DepositInventory")
    })

    it.each(policies)("%s handles no known nodes (empty world)", (policy) => {
      const obs = createObservation({
        knownAreas: [],
      })

      const action = policy.decide(obs)

      // Should either wait or try to explore
      expect(["Wait", "Explore"].includes(action.type)).toBe(true)
    })
  })

  describe("safeMiner", () => {
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

  describe("greedyMiner", () => {
    it("prefers higher distance areas when level allows", () => {
      const obs = createObservation({
        miningLevel: 5, // Unlocks distance 2
        isInTown: true,
        knownAreas: [
          createMineableArea("area-d1-i0", 1, 15, 1),
          createMineableArea("area-d2-i0", 2, 30, 3),
        ],
      })

      const action = greedyMiner.decide(obs)

      expect(action.type).toBe("Travel")
      if (action.type === "Travel") {
        expect(action.toAreaId).toBe("area-d2-i0") // Prefers higher distance
      }
    })

    it("falls back to lower distance when nothing at preferred", () => {
      const obs = createObservation({
        miningLevel: 5, // Unlocks distance 2
        isInTown: true,
        knownAreas: [
          createMineableArea("area-d1-i0", 1, 15, 1), // Only d1 available
        ],
      })

      const action = greedyMiner.decide(obs)

      expect(action.type).toBe("Travel")
      if (action.type === "Travel") {
        expect(action.toAreaId).toBe("area-d1-i0")
      }
    })
  })

  describe("balancedMiner", () => {
    it("picks highest XP/tick node accounting for travel", () => {
      const obs = createObservation({
        isInTown: true,
        knownAreas: [
          createMineableArea("area-d1-i0", 1, 5, 1), // Close, low tier: 5/(5+5) = 0.5
          createMineableArea("area-d1-i1", 1, 50, 3), // Far, high tier: 15/(50+5) = 0.27
        ],
      })

      const action = balancedMiner.decide(obs)

      expect(action.type).toBe("Travel")
      if (action.type === "Travel") {
        // Should prefer higher XP/tick
        expect(action.toAreaId).toBe("area-d1-i0")
      }
    })

    it("prefers current area node when travel time is factored in", () => {
      const currentArea = createMineableArea("area-d1-i0", 1, 0, 1) // At this area
      const obs = createObservation({
        isInTown: false,
        currentAreaId: "area-d1-i0",
        currentArea,
        knownAreas: [
          currentArea,
          createMineableArea("area-d1-i1", 1, 20, 2), // Better tier but far
        ],
      })

      const action = balancedMiner.decide(obs)

      // Current area: tier 1, 0 travel = 5/5 = 1.0 XP/tick
      // Other area: tier 2, 20 travel = 10/25 = 0.4 XP/tick
      expect(action.type).toBe("Mine")
    })
  })
})
