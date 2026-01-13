/**
 * Tests for safe.ts - Safe Miner Policy
 */

import { safeMiner } from "./safe.js"
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

describe("safeMiner", () => {
  it("has correct id and name", () => {
    expect(safeMiner.id).toBe("safe")
    expect(safeMiner.name).toBe("Safe Miner")
  })

  it("returns to town when inventory is full", () => {
    const obs = createObservation({
      inventorySlotsUsed: 10,
      inventoryCapacity: 10,
      isInTown: false,
      currentAreaId: "area-d1-i0",
    })

    const action = safeMiner.decide(obs)
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

  it("travels to nearest mineable area from town", () => {
    const obs = createObservation({
      isInTown: true,
      knownAreas: [
        createMineableArea("area-d1-i0", 1, 15),
        createMineableArea("area-d1-i1", 1, 10), // Nearer
      ],
    })

    const action = safeMiner.decide(obs)
    expect(action.type).toBe("Travel")
    if (action.type === "Travel") {
      expect(action.toAreaId).toBe("area-d1-i1")
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

  it("prefers closer areas over further ones", () => {
    const obs = createObservation({
      isInTown: true,
      knownAreas: [
        createMineableArea("area-d2-i0", 2, 30),
        createMineableArea("area-d1-i0", 1, 15),
      ],
    })

    const action = safeMiner.decide(obs)
    expect(action.type).toBe("Travel")
    if (action.type === "Travel") {
      expect(action.toAreaId).toBe("area-d1-i0")
    }
  })

  it("explores when no mineable nodes available", () => {
    const obs = createObservation({
      knownAreas: [
        {
          areaId: "area-d1-i0",
          distance: 1,
          travelTicksFromCurrent: 10,
          discoveredNodes: [], // No nodes discovered
        },
      ],
    })

    const action = safeMiner.decide(obs)
    expect(action.type).toBe("Explore")
  })

  it("waits when nothing else to do", () => {
    const obs = createObservation({
      knownAreas: [],
    })

    const action = safeMiner.decide(obs)
    expect(action.type).toBe("Wait")
  })
})
