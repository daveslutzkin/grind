/**
 * Tests for types.ts - Type definitions for the Policy Runner
 *
 * This file primarily contains type definitions which don't require
 * runtime tests. This test file verifies that types can be imported
 * and used correctly.
 */

import { GatherMode } from "../types.js"
import type {
  KnownNode,
  KnownArea,
  PolicyObservation,
  PolicyAction,
  Policy,
  TerminationReason,
  RunResult,
  ErrorCounts,
  PolicyAggregates,
} from "./types.js"

describe("types", () => {
  it("exports all required types", () => {
    // This test verifies that all types can be imported.
    // TypeScript compilation ensures type correctness.

    // Create a mock policy to verify Policy interface
    const mockPolicy: Policy = {
      id: "test",
      name: "Test Policy",
      decide: (obs: PolicyObservation): PolicyAction => {
        // Use the observation to verify its shape
        void obs.miningLevel
        void obs.miningXpInLevel
        void obs.miningTotalXp
        void obs.inventoryCapacity
        void obs.inventorySlotsUsed
        void obs.inventoryByItem
        void obs.currentAreaId
        void obs.knownAreas
        void obs.knownMineableMaterials
        void obs.currentArea
        void obs.isInTown
        void obs.canDeposit
        void obs.returnTimeToTown

        return { type: "Wait" }
      },
    }

    expect(mockPolicy.id).toBe("test")
    expect(mockPolicy.name).toBe("Test Policy")
    expect(typeof mockPolicy.decide).toBe("function")
  })

  it("PolicyAction covers all action types", () => {
    // Verify all action types are valid
    const actions: PolicyAction[] = [
      { type: "Mine", nodeId: "node-1" },
      { type: "Mine", nodeId: "node-1", mode: GatherMode.FOCUS },
      { type: "Explore", areaId: "area-1" },
      { type: "Travel", toAreaId: "area-1" },
      { type: "ReturnToTown" },
      { type: "DepositInventory" },
      { type: "Wait" },
    ]

    expect(actions).toHaveLength(7)
    expect(actions.every((a) => a.type)).toBe(true)
  })

  it("TerminationReason covers all termination types", () => {
    const reasons: TerminationReason[] = ["target_reached", "max_ticks", "stall", "node_depleted"]

    expect(reasons).toHaveLength(4)
  })

  it("ErrorCounts tracks errors by termination reason", () => {
    const counts: ErrorCounts = {
      stall: 2,
      node_depleted: 3,
      max_ticks: 1,
    }

    expect(counts.stall).toBe(2)
    expect(counts.node_depleted).toBe(3)
    expect(counts.max_ticks).toBe(1)
  })

  it("PolicyAggregates uses errorCounts instead of stallRate", () => {
    const agg: PolicyAggregates = {
      policyId: "test",
      runCount: 10,
      errorCounts: { stall: 2, node_depleted: 1 },
      ticksToTarget: { p10: 100, p50: 200, p90: 300 },
      avgXpPerTick: 0.1,
      avgMaxDistance: 2.5,
    }

    expect(agg.errorCounts.stall).toBe(2)
    expect(agg.errorCounts.node_depleted).toBe(1)
  })

  it("KnownNode has correct shape", () => {
    const node: KnownNode = {
      nodeId: "test-node",
      primaryMaterial: "COPPER_ORE",
      primaryMaterialTier: 1,
      secondaryMaterials: ["STONE"],
      isMineable: true,
      remainingCharges: 100,
      locationId: "test-loc",
    }

    expect(node.nodeId).toBe("test-node")
    expect(node.isMineable).toBe(true)
  })

  it("KnownArea has correct shape", () => {
    const area: KnownArea = {
      areaId: "test-area",
      distance: 1,
      travelTicksFromCurrent: 10,
      discoveredNodes: [],
      isFullyExplored: false,
    }

    expect(area.areaId).toBe("test-area")
    expect(area.distance).toBe(1)
  })

  it("RunResult has correct shape", () => {
    const result: RunResult = {
      seed: "test-seed",
      policyId: "test",
      terminationReason: "target_reached",
      finalLevel: 5,
      finalXp: 100,
      finalSkills: [{ skill: "Mining", level: 5, totalXp: 100 }],
      totalTicks: 1000,
      ticksSpent: {
        mining: 500,
        traveling: 200,
        exploring: 150,
        inventoryManagement: 100,
        waiting: 50,
      },
      levelUpTicks: [
        { skill: "Mining", level: 2, tick: 100, cumulativeXp: 4, distance: 1, actionCount: 10 },
        { skill: "Mining", level: 3, tick: 250, cumulativeXp: 13, distance: 1, actionCount: 25 },
      ],
      maxDistanceReached: 2,
      summary: {
        areasDiscovered: 10,
        areasFullyExplored: 3,
        miningLocationsDiscovered: 4,
        byDistance: [
          {
            distance: 1,
            areasDiscovered: 5,
            areasFullyExplored: 2,
            miningLocationsDiscovered: 3,
          },
        ],
      },
    }

    expect(result.terminationReason).toBe("target_reached")
    expect(result.ticksSpent.mining).toBe(500)
  })
})
