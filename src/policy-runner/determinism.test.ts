/**
 * Tests for determinism - Critical test to verify reproducibility
 *
 * The policy runner must produce identical results for the same seed and policy.
 * This is essential for debugging, analysis, and reproducible experiments.
 */

import { runSimulation } from "./runner.js"
import { safeMiner } from "./policies/safe.js"

describe("determinism", () => {
  it("produces identical results for same seed and policy", async () => {
    const config = {
      seed: "determinism-test-seed-123",
      policy: safeMiner,
      targetLevel: 2,
      maxTicks: 20000,
    }

    const result1 = await runSimulation(config)
    const result2 = await runSimulation(config)

    // Core results must match exactly
    expect(result1.terminationReason).toBe(result2.terminationReason)
    expect(result1.finalLevel).toBe(result2.finalLevel)
    expect(result1.finalXp).toBe(result2.finalXp)
    expect(result1.totalTicks).toBe(result2.totalTicks)

    // Time breakdown must match
    expect(result1.ticksSpent).toEqual(result2.ticksSpent)

    // Level-up records must match
    expect(result1.levelUpTicks).toEqual(result2.levelUpTicks)

    // Max distance must match
    expect(result1.maxDistanceReached).toBe(result2.maxDistanceReached)
  })

  it("produces different results for different seeds", async () => {
    const baseConfig = {
      policy: safeMiner,
      targetLevel: 2,
      maxTicks: 20000,
    }

    const result1 = await runSimulation({ ...baseConfig, seed: "seed-alpha" })
    const result2 = await runSimulation({ ...baseConfig, seed: "seed-beta" })

    // At minimum, SOMETHING should differ between runs
    // (could be ticks, XP, level-up timing, etc.)
    const differs =
      result1.totalTicks !== result2.totalTicks ||
      result1.finalXp !== result2.finalXp ||
      result1.terminationReason !== result2.terminationReason ||
      result1.maxDistanceReached !== result2.maxDistanceReached

    expect(differs).toBe(true)
  })
})
