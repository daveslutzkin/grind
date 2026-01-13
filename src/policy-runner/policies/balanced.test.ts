/**
 * Tests for balanced.ts - Balanced Miner Policy
 */

import { balancedMiner } from "./balanced.js"
import type { PolicyObservation, KnownArea, KnownNode } from "../types.js"

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

// Helper to create a known node
function createNode(nodeId: string, tier: number, isMineable: boolean = true): KnownNode {
  return {
    nodeId,
    primaryMaterial: `TIER_${tier}_ORE`,
    primaryMaterialTier: tier,
    secondaryMaterials: [],
    isMineable,
    remainingCharges: 100,
    locationId: `${nodeId}-loc`,
  }
}

// Helper to create a known area with specific nodes
function createArea(
  areaId: string,
  distance: number,
  travelTicks: number,
  nodes: KnownNode[]
): KnownArea {
  return {
    areaId,
    distance,
    travelTicksFromCurrent: travelTicks,
    discoveredNodes: nodes,
  }
}

describe("balancedMiner", () => {
  it("has correct id and name", () => {
    expect(balancedMiner.id).toBe("balanced")
    expect(balancedMiner.name).toBe("Balanced Miner")
  })

  it("returns to town when inventory is full", () => {
    const obs = createObservation({
      inventorySlotsUsed: 10,
      inventoryCapacity: 10,
      isInTown: false,
      currentAreaId: "area-d1-i0",
    })

    const action = balancedMiner.decide(obs)
    expect(action.type).toBe("ReturnToTown")
  })

  it("deposits when in town with full inventory", () => {
    const obs = createObservation({
      inventorySlotsUsed: 10,
      inventoryCapacity: 10,
      isInTown: true,
    })

    const action = balancedMiner.decide(obs)
    expect(action.type).toBe("DepositInventory")
  })

  it("chooses node with highest XP/tick ratio", () => {
    // Node A: tier 1, travel 5 -> XP/tick = (1*5)/(5+5) = 0.5
    // Node B: tier 3, travel 50 -> XP/tick = (3*5)/(50+5) = 0.27
    // Should choose A
    const obs = createObservation({
      isInTown: true,
      knownAreas: [
        createArea("area-a", 1, 5, [createNode("node-a", 1)]),
        createArea("area-b", 1, 50, [createNode("node-b", 3)]),
      ],
    })

    const action = balancedMiner.decide(obs)
    expect(action.type).toBe("Travel")
    if (action.type === "Travel") {
      expect(action.toAreaId).toBe("area-a")
    }
  })

  it("prefers current area node when travel time is factored in", () => {
    // Current: tier 1, travel 0 -> XP/tick = 5/5 = 1.0
    // Other: tier 2, travel 20 -> XP/tick = 10/25 = 0.4
    const currentArea = createArea("current", 1, 0, [createNode("node-current", 1)])
    const obs = createObservation({
      isInTown: false,
      currentAreaId: "current",
      currentArea,
      knownAreas: [currentArea, createArea("other", 1, 20, [createNode("node-other", 2)])],
    })

    const action = balancedMiner.decide(obs)
    expect(action.type).toBe("Mine")
  })

  it("chooses distant high-tier node when travel cost is worth it", () => {
    // Current: tier 1, travel 0 -> XP/tick = 5/5 = 1.0
    // Other: tier 10, travel 20 -> XP/tick = 50/25 = 2.0 (better!)
    const currentArea = createArea("current", 1, 0, [createNode("node-current", 1)])
    const obs = createObservation({
      isInTown: false,
      currentAreaId: "current",
      currentArea,
      knownAreas: [currentArea, createArea("other", 2, 20, [createNode("node-other", 10)])],
    })

    const action = balancedMiner.decide(obs)
    expect(action.type).toBe("Travel")
    if (action.type === "Travel") {
      expect(action.toAreaId).toBe("other")
    }
  })

  it("mines when at area with best XP/tick node", () => {
    const area = createArea("area-d1-i0", 1, 0, [createNode("node-1", 2)])
    const obs = createObservation({
      isInTown: false,
      currentAreaId: "area-d1-i0",
      currentArea: area,
      knownAreas: [area],
    })

    const action = balancedMiner.decide(obs)
    expect(action.type).toBe("Mine")
    if (action.type === "Mine") {
      expect(action.nodeId).toBe("node-1")
    }
  })

  it("explores when no mineable nodes available", () => {
    const obs = createObservation({
      knownAreas: [
        createArea("area-d1-i0", 1, 10, []), // No nodes
      ],
    })

    const action = balancedMiner.decide(obs)
    expect(action.type).toBe("Explore")
  })

  it("ignores non-mineable nodes in XP calculation", () => {
    const obs = createObservation({
      knownAreas: [
        createArea("area-a", 1, 5, [createNode("node-a", 1, true)]), // Mineable
        createArea("area-b", 1, 5, [createNode("node-b", 10, false)]), // Not mineable - high tier but locked
      ],
    })

    const action = balancedMiner.decide(obs)
    expect(action.type).toBe("Travel")
    if (action.type === "Travel") {
      expect(action.toAreaId).toBe("area-a") // Only option
    }
  })

  it("ignores depleted nodes", () => {
    const depletedNode: KnownNode = {
      nodeId: "depleted",
      primaryMaterial: "GOLD_ORE",
      primaryMaterialTier: 5,
      secondaryMaterials: [],
      isMineable: true,
      remainingCharges: null, // Depleted
      locationId: "depleted-loc",
    }

    const obs = createObservation({
      knownAreas: [
        createArea("area-a", 1, 5, [createNode("node-a", 1)]),
        createArea("area-b", 1, 5, [depletedNode]),
      ],
    })

    const action = balancedMiner.decide(obs)
    expect(action.type).toBe("Travel")
    if (action.type === "Travel") {
      expect(action.toAreaId).toBe("area-a")
    }
  })

  it("waits when nothing else to do", () => {
    const obs = createObservation({
      knownAreas: [],
    })

    const action = balancedMiner.decide(obs)
    expect(action.type).toBe("Wait")
  })
})
