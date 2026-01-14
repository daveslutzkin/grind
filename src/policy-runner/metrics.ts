/**
 * Metrics Collection and Aggregation
 *
 * Provides utilities for tracking simulation metrics during a run
 * and aggregating results across multiple runs.
 */

import type { SkillID } from "../types.js"
import type {
  MetricsCollector,
  TicksSpent,
  LevelUpRecord,
  TerminationReason,
  StallSnapshot,
  RunResult,
  PolicyAggregates,
  PolicyAction,
  SkillSnapshot,
  ErrorCounts,
} from "./types.js"

/**
 * Create a new metrics collector for a simulation run.
 */
export function createMetricsCollector(): MetricsCollector {
  const ticksSpent: TicksSpent = {
    mining: 0,
    traveling: 0,
    exploring: 0,
    inventoryManagement: 0,
    waiting: 0,
  }
  const levelUpTicks: LevelUpRecord[] = []
  let maxDistanceReached = 0

  return {
    recordAction(actionType: PolicyAction["type"], ticksConsumed: number): void {
      switch (actionType) {
        case "Mine":
          ticksSpent.mining += ticksConsumed
          break
        case "Travel":
        case "ReturnToTown":
          ticksSpent.traveling += ticksConsumed
          break
        case "Explore":
          ticksSpent.exploring += ticksConsumed
          break
        case "DepositInventory":
          ticksSpent.inventoryManagement += ticksConsumed
          break
        case "Wait":
          ticksSpent.waiting += ticksConsumed
          break
      }
    },

    recordLevelUp(
      skill: SkillID,
      level: number,
      tick: number,
      cumulativeXp: number,
      distance: number,
      actionCount: number
    ): void {
      levelUpTicks.push({ skill, level, tick, cumulativeXp, distance, actionCount })
    },

    recordMaxDistance(distance: number): void {
      if (distance > maxDistanceReached) {
        maxDistanceReached = distance
      }
    },

    finalize(
      terminationReason: TerminationReason,
      finalLevel: number,
      finalXp: number,
      finalSkills: SkillSnapshot[],
      totalTicks: number,
      stallSnapshot?: StallSnapshot
    ): Omit<RunResult, "seed" | "policyId" | "actionLog"> {
      return {
        terminationReason,
        finalLevel,
        finalXp,
        finalSkills,
        totalTicks,
        ticksSpent: { ...ticksSpent },
        levelUpTicks: [...levelUpTicks],
        stallSnapshot,
        maxDistanceReached,
      }
    },
  }
}

/**
 * Calculate percentile from a sorted array of numbers.
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0
  const index = Math.ceil(p * sortedValues.length) - 1
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))]
}

/**
 * Compute aggregated statistics for a set of run results.
 */
export function computeAggregates(results: RunResult[], policyId: string): PolicyAggregates {
  const policyResults = results.filter((r) => r.policyId === policyId)

  if (policyResults.length === 0) {
    return {
      policyId,
      runCount: 0,
      errorCounts: {},
      ticksToTarget: { p10: 0, p50: 0, p90: 0 },
      avgXpPerTick: 0,
      avgMaxDistance: 0,
    }
  }

  // Count errors by type (all non-success termination reasons)
  const errorCounts: ErrorCounts = {}
  for (const result of policyResults) {
    if (result.terminationReason !== "target_reached") {
      errorCounts[result.terminationReason] = (errorCounts[result.terminationReason] ?? 0) + 1
    }
  }

  // Ticks to target (only for runs that reached target)
  const successfulRuns = policyResults.filter((r) => r.terminationReason === "target_reached")
  const sortedTicks = successfulRuns.map((r) => r.totalTicks).sort((a, b) => a - b)

  const ticksToTarget = {
    p10: percentile(sortedTicks, 0.1),
    p50: percentile(sortedTicks, 0.5),
    p90: percentile(sortedTicks, 0.9),
  }

  // Average XP per tick
  const totalXp = policyResults.reduce((sum, r) => sum + r.finalXp, 0)
  const totalTicksAll = policyResults.reduce((sum, r) => sum + r.totalTicks, 0)
  const avgXpPerTick = totalTicksAll > 0 ? totalXp / totalTicksAll : 0

  // Average max distance
  const avgMaxDistance =
    policyResults.reduce((sum, r) => sum + r.maxDistanceReached, 0) / policyResults.length

  return {
    policyId,
    runCount: policyResults.length,
    errorCounts,
    ticksToTarget,
    avgXpPerTick,
    avgMaxDistance,
  }
}

/**
 * Compute aggregates for all policies in a batch result.
 */
export function computeAllAggregates(
  results: RunResult[],
  policyIds: string[]
): Record<string, PolicyAggregates> {
  const aggregates: Record<string, PolicyAggregates> = {}

  for (const policyId of policyIds) {
    aggregates[policyId] = computeAggregates(results, policyId)
  }

  return aggregates
}
