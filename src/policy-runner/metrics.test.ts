/**
 * Tests for metrics.ts - Metrics collection and aggregation
 */

import { createMetricsCollector, computeAggregates, computeAllAggregates } from "./metrics.js"
import type { RunResult, TerminationReason } from "./types.js"

describe("metrics", () => {
  describe("createMetricsCollector", () => {
    it("starts with zero ticks in all categories", () => {
      const collector = createMetricsCollector()
      const result = collector.finalize("max_ticks", 1, 0, [], 0)

      expect(result.ticksSpent.mining).toBe(0)
      expect(result.ticksSpent.traveling).toBe(0)
      expect(result.ticksSpent.exploring).toBe(0)
      expect(result.ticksSpent.inventoryManagement).toBe(0)
      expect(result.ticksSpent.waiting).toBe(0)
    })

    it("records mining ticks correctly", () => {
      const collector = createMetricsCollector()
      collector.recordAction("Mine", 5)
      collector.recordAction("Mine", 5)

      const result = collector.finalize("max_ticks", 1, 0, [], 10)
      expect(result.ticksSpent.mining).toBe(10)
    })

    it("records travel ticks correctly", () => {
      const collector = createMetricsCollector()
      collector.recordAction("Travel", 15)
      collector.recordAction("ReturnToTown", 20)

      const result = collector.finalize("max_ticks", 1, 0, [], 35)
      expect(result.ticksSpent.traveling).toBe(35)
    })

    it("records exploration ticks correctly", () => {
      const collector = createMetricsCollector()
      collector.recordAction("Explore", 10)

      const result = collector.finalize("max_ticks", 1, 0, [], 10)
      expect(result.ticksSpent.exploring).toBe(10)
    })

    it("records inventory management ticks correctly", () => {
      const collector = createMetricsCollector()
      collector.recordAction("DepositInventory", 3)

      const result = collector.finalize("max_ticks", 1, 0, [], 3)
      expect(result.ticksSpent.inventoryManagement).toBe(3)
    })

    it("records waiting ticks correctly", () => {
      const collector = createMetricsCollector()
      collector.recordAction("Wait", 1)

      const result = collector.finalize("max_ticks", 1, 0, [], 1)
      expect(result.ticksSpent.waiting).toBe(1)
    })

    it("records level-ups", () => {
      const collector = createMetricsCollector()
      collector.recordLevelUp("Mining", 2, 100, 4, 1, 10)
      collector.recordLevelUp("Mining", 3, 250, 13, 1, 25)

      const result = collector.finalize("target_reached", 3, 13, [], 250)
      expect(result.levelUpTicks).toHaveLength(2)
      expect(result.levelUpTicks[0]).toEqual({
        skill: "Mining",
        level: 2,
        tick: 100,
        cumulativeXp: 4,
        distance: 1,
        actionCount: 10,
      })
      expect(result.levelUpTicks[1]).toEqual({
        skill: "Mining",
        level: 3,
        tick: 250,
        cumulativeXp: 13,
        distance: 1,
        actionCount: 25,
      })
    })

    it("tracks max distance reached", () => {
      const collector = createMetricsCollector()
      collector.recordMaxDistance(1)
      collector.recordMaxDistance(2)
      collector.recordMaxDistance(1) // Going back shouldn't reduce max

      const result = collector.finalize("max_ticks", 1, 0, [], 100)
      expect(result.maxDistanceReached).toBe(2)
    })

    it("includes stall snapshot when provided", () => {
      const collector = createMetricsCollector()
      const stallSnapshot = {
        tick: 1000,
        level: 2,
        distance: 1,
        knownNodeCount: 5,
        lastAction: { type: "Wait" as const },
      }

      const result = collector.finalize("stall", 2, 10, [], 1000, stallSnapshot)
      expect(result.stallSnapshot).toEqual(stallSnapshot)
    })
  })

  describe("computeAggregates", () => {
    const createMockResult = (
      policyId: string,
      terminationReason: TerminationReason,
      totalTicks: number,
      finalXp: number,
      maxDistance: number
    ): RunResult => ({
      seed: "test-seed",
      policyId,
      terminationReason,
      finalLevel: 2,
      finalXp,
      finalSkills: [{ skill: "Mining", level: 2, totalXp: finalXp }],
      totalTicks,
      ticksSpent: { mining: 0, traveling: 0, exploring: 0, inventoryManagement: 0, waiting: 0 },
      levelUpTicks: [],
      maxDistanceReached: maxDistance,
      summary: {
        areasDiscovered: 0,
        areasFullyExplored: 0,
        miningLocationsDiscovered: 0,
        byDistance: [],
      },
    })

    it("returns zeros for empty results", () => {
      const agg = computeAggregates([], "test")

      expect(agg.policyId).toBe("test")
      expect(agg.runCount).toBe(0)
      expect(agg.errorCounts).toEqual({})
      expect(agg.avgXpPerTick).toBe(0)
    })

    it("calculates error counts correctly", () => {
      const results = [
        createMockResult("test", "target_reached", 100, 10, 1),
        createMockResult("test", "stall", 50, 5, 1),
        createMockResult("test", "target_reached", 120, 12, 1),
        createMockResult("test", "stall", 60, 6, 1),
        createMockResult("test", "node_depleted", 40, 4, 1),
      ]

      const agg = computeAggregates(results, "test")
      expect(agg.errorCounts).toEqual({ stall: 2, node_depleted: 1 })
    })

    it("calculates percentiles from successful runs only", () => {
      const results = [
        createMockResult("test", "target_reached", 100, 10, 1),
        createMockResult("test", "target_reached", 200, 20, 1),
        createMockResult("test", "target_reached", 300, 30, 1),
        createMockResult("test", "stall", 50, 5, 1), // Should be excluded
      ]

      const agg = computeAggregates(results, "test")
      expect(agg.ticksToTarget.p50).toBe(200) // Median of [100, 200, 300]
    })

    it("calculates average XP per tick", () => {
      const results = [
        createMockResult("test", "target_reached", 100, 50, 1),
        createMockResult("test", "target_reached", 100, 50, 1),
      ]

      const agg = computeAggregates(results, "test")
      expect(agg.avgXpPerTick).toBe(0.5) // 100 XP / 200 ticks
    })

    it("calculates average max distance", () => {
      const results = [
        createMockResult("test", "target_reached", 100, 10, 1),
        createMockResult("test", "target_reached", 100, 10, 2),
        createMockResult("test", "target_reached", 100, 10, 3),
      ]

      const agg = computeAggregates(results, "test")
      expect(agg.avgMaxDistance).toBe(2)
    })

    it("filters by policy ID", () => {
      const results = [
        createMockResult("policy-a", "target_reached", 100, 10, 1),
        createMockResult("policy-b", "target_reached", 200, 20, 2),
        createMockResult("policy-a", "target_reached", 150, 15, 1),
      ]

      const aggA = computeAggregates(results, "policy-a")
      const aggB = computeAggregates(results, "policy-b")

      expect(aggA.runCount).toBe(2)
      expect(aggB.runCount).toBe(1)
    })
  })

  describe("computeAllAggregates", () => {
    it("computes aggregates for all policy IDs", () => {
      const results: RunResult[] = [
        {
          seed: "s1",
          policyId: "safe",
          terminationReason: "target_reached",
          finalLevel: 2,
          finalXp: 10,
          finalSkills: [{ skill: "Mining", level: 2, totalXp: 10 }],
          totalTicks: 100,
          ticksSpent: {
            mining: 50,
            traveling: 30,
            exploring: 20,
            inventoryManagement: 0,
            waiting: 0,
          },
          levelUpTicks: [],
          maxDistanceReached: 1,
          summary: {
            areasDiscovered: 0,
            areasFullyExplored: 0,
            miningLocationsDiscovered: 0,
            byDistance: [],
          },
        },
        {
          seed: "s1",
          policyId: "greedy",
          terminationReason: "target_reached",
          finalLevel: 2,
          finalXp: 10,
          finalSkills: [{ skill: "Mining", level: 2, totalXp: 10 }],
          totalTicks: 80,
          ticksSpent: {
            mining: 40,
            traveling: 20,
            exploring: 20,
            inventoryManagement: 0,
            waiting: 0,
          },
          levelUpTicks: [],
          maxDistanceReached: 2,
          summary: {
            areasDiscovered: 0,
            areasFullyExplored: 0,
            miningLocationsDiscovered: 0,
            byDistance: [],
          },
        },
      ]

      const allAgg = computeAllAggregates(results, ["safe", "greedy"])

      expect(allAgg["safe"]).toBeDefined()
      expect(allAgg["greedy"]).toBeDefined()
      expect(allAgg["safe"].runCount).toBe(1)
      expect(allAgg["greedy"].runCount).toBe(1)
    })
  })
})
