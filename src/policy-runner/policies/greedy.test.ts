/**
 * Tests for greedy.ts - Greedy Miner Policy
 */

import { greedyMiner } from "./greedy.js"
import type { PolicyObservation, KnownArea } from "../types.js"

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
    currentArea: null,
    isInTown: true,
    canDeposit: false,
    returnTimeToTown: 0,
    ...overrides,
  }
}

// Helper to create a known area with mineable nodes
function createMineableArea(areaId: string, distance: number, travelTicks: number): KnownArea {
  return {
    areaId,
    distance,
    travelTicksFromCurrent: travelTicks,
    discoveredNodes: [
      {
        nodeId: `${areaId}-node-0`,
        primaryMaterial: "COPPER_ORE",
        primaryMaterialTier: 1,
        secondaryMaterials: [],
        isMineable: true,
        remainingCharges: 100,
        locationId: `${areaId}-loc-0`,
      },
    ],
  }
}

describe("greedyMiner", () => {
  it("has correct id and name", () => {
    expect(greedyMiner.id).toBe("greedy")
    expect(greedyMiner.name).toBe("Greedy Miner")
  })

  it("returns to town when inventory is full", () => {
    const obs = createObservation({
      inventorySlotsUsed: 10,
      inventoryCapacity: 10,
      isInTown: false,
      currentAreaId: "area-d1-i0",
    })

    const action = greedyMiner.decide(obs)
    expect(action.type).toBe("ReturnToTown")
  })

  it("deposits when in town with full inventory", () => {
    const obs = createObservation({
      inventorySlotsUsed: 10,
      inventoryCapacity: 10,
      isInTown: true,
    })

    const action = greedyMiner.decide(obs)
    expect(action.type).toBe("DepositInventory")
  })

  it("prefers highest unlocked distance at level 1 (distance 1)", () => {
    const obs = createObservation({
      miningLevel: 1,
      isInTown: true,
      knownAreas: [
        createMineableArea("area-d1-i0", 1, 10),
        createMineableArea("area-d2-i0", 2, 20),
      ],
    })

    const action = greedyMiner.decide(obs)
    expect(action.type).toBe("Travel")
    if (action.type === "Travel") {
      expect(action.toAreaId).toBe("area-d1-i0") // Only d1 is unlocked
    }
  })

  it("prefers distance 2 areas at level 3-5", () => {
    const obs = createObservation({
      miningLevel: 5,
      isInTown: true,
      knownAreas: [
        createMineableArea("area-d1-i0", 1, 10),
        createMineableArea("area-d2-i0", 2, 20),
      ],
    })

    const action = greedyMiner.decide(obs)
    expect(action.type).toBe("Travel")
    if (action.type === "Travel") {
      expect(action.toAreaId).toBe("area-d2-i0") // Prefers higher distance
    }
  })

  it("prefers distance 3 areas at level 6+", () => {
    const obs = createObservation({
      miningLevel: 10,
      isInTown: true,
      knownAreas: [
        createMineableArea("area-d2-i0", 2, 15),
        createMineableArea("area-d3-i0", 3, 30),
      ],
    })

    const action = greedyMiner.decide(obs)
    expect(action.type).toBe("Travel")
    if (action.type === "Travel") {
      expect(action.toAreaId).toBe("area-d3-i0") // Prefers highest distance
    }
  })

  it("falls back to lower distance when preferred distance unavailable", () => {
    const obs = createObservation({
      miningLevel: 5, // Unlocks distance 2
      isInTown: true,
      knownAreas: [
        createMineableArea("area-d1-i0", 1, 10), // Only d1 available
      ],
    })

    const action = greedyMiner.decide(obs)
    expect(action.type).toBe("Travel")
    if (action.type === "Travel") {
      expect(action.toAreaId).toBe("area-d1-i0")
    }
  })

  it("explores at preferred distance when no mineable nodes there", () => {
    const obs = createObservation({
      miningLevel: 5,
      knownAreas: [
        createMineableArea("area-d1-i0", 1, 10),
        {
          areaId: "area-d2-i0",
          distance: 2,
          travelTicksFromCurrent: 20,
          discoveredNodes: [], // No nodes discovered yet
        },
      ],
    })

    const action = greedyMiner.decide(obs)
    expect(action.type).toBe("Explore")
    if (action.type === "Explore") {
      expect(action.areaId).toBe("area-d2-i0")
    }
  })

  it("mines when at area with mineable node at preferred distance", () => {
    const area = createMineableArea("area-d2-i0", 2, 0)
    const obs = createObservation({
      miningLevel: 5,
      isInTown: false,
      currentAreaId: "area-d2-i0",
      currentArea: area,
      knownAreas: [createMineableArea("area-d1-i0", 1, 15), area],
    })

    const action = greedyMiner.decide(obs)
    expect(action.type).toBe("Mine")
  })
})
