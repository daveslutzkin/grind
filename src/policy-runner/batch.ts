/**
 * Batch Executor (Monte Carlo Harness)
 *
 * Runs multiple simulations across different seeds and policies,
 * then aggregates results for analysis.
 */

import type { BatchConfig, BatchResult, RunResult, Policy } from "./types.js"
import { runSimulation } from "./runner.js"
import { computeAllAggregates } from "./metrics.js"

/**
 * Generate deterministic seed strings.
 */
function generateSeeds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `seed-${i}`)
}

/**
 * Run batch simulations across multiple seeds and policies.
 *
 * @param config Batch configuration
 * @returns Aggregated results
 */
export async function runBatch(config: BatchConfig): Promise<BatchResult> {
  const seeds = config.seeds ?? generateSeeds(config.seedCount ?? 100)
  const results: RunResult[] = []

  // Run each seed with each policy
  for (const seed of seeds) {
    for (const policy of config.policies) {
      const result = await runSimulation({
        seed,
        policy,
        targetLevel: config.targetLevel,
        maxTicks: config.maxTicks,
        stallWindowSize: config.stallWindowSize,
      })
      results.push(result)
      config.onProgress?.()
    }
  }

  // Compute aggregates
  const policyIds = config.policies.map((p) => p.id)
  const aggregates = computeAllAggregates(results, policyIds)

  return {
    results,
    aggregates: {
      byPolicy: aggregates,
    },
  }
}

/**
 * Run a quick validation batch with fewer seeds.
 * Useful for testing that policies don't crash.
 */
export async function runValidation(
  policies: Policy[],
  targetLevel: number = 5,
  seedCount: number = 10,
  maxTicks: number = 10000
): Promise<BatchResult> {
  return runBatch({
    seedCount,
    policies,
    targetLevel,
    maxTicks,
  })
}
