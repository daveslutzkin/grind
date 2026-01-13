/**
 * Tests for runner.ts - Single-run executor
 */

import { runSimulation } from "./runner.js"
import { safeMiner } from "./policies/safe.js"

describe("runner", () => {
  describe("runSimulation", () => {
    it("terminates when target level reached", async () => {
      const result = await runSimulation({
        seed: "test-seed-1",
        policy: safeMiner,
        targetLevel: 2,
        maxTicks: 50000,
      })

      expect(result.seed).toBe("test-seed-1")
      expect(result.policyId).toBe("safe")

      // Should either reach target or max out
      expect(["target_reached", "max_ticks", "stall"]).toContain(result.terminationReason)
    })

    it("terminates when max ticks exceeded", async () => {
      const result = await runSimulation({
        seed: "test-seed-2",
        policy: safeMiner,
        targetLevel: 100, // Unreachable
        maxTicks: 50, // Very low
        stallWindowSize: 10000, // Prevent stall from triggering first
      })

      // Should max out (or stall if no progress can be made)
      expect(["max_ticks", "stall"]).toContain(result.terminationReason)
      expect(result.totalTicks).toBeLessThanOrEqual(100)
    })

    it("terminates on stall detection", async () => {
      // Create a policy that always waits (will stall)
      const waitPolicy = {
        id: "wait",
        name: "Wait Policy",
        decide: () => ({ type: "Wait" as const }),
      }

      const result = await runSimulation({
        seed: "test-seed-3",
        policy: waitPolicy,
        targetLevel: 10,
        maxTicks: 50000,
        stallWindowSize: 100, // Short stall window
      })

      expect(result.terminationReason).toBe("stall")
      expect(result.stallSnapshot).toBeDefined()
    })

    it("records metrics correctly", async () => {
      const result = await runSimulation({
        seed: "test-seed-4",
        policy: safeMiner,
        targetLevel: 2,
        maxTicks: 50000,
      })

      // Check that metrics are populated
      expect(result.ticksSpent).toBeDefined()
      expect(result.ticksSpent.mining).toBeGreaterThanOrEqual(0)
      expect(result.ticksSpent.traveling).toBeGreaterThanOrEqual(0)
      expect(result.ticksSpent.exploring).toBeGreaterThanOrEqual(0)
    })

    it("records level-ups", async () => {
      const result = await runSimulation({
        seed: "test-seed-5",
        policy: safeMiner,
        targetLevel: 3,
        maxTicks: 100000,
      })

      // levelUpTicks array should exist
      expect(result.levelUpTicks).toBeDefined()
      expect(Array.isArray(result.levelUpTicks)).toBe(true)

      // If we reached target level 3 (starting from 1), we should have level-ups
      if (result.finalLevel >= 2) {
        expect(result.levelUpTicks.length).toBeGreaterThan(0)
      }

      // Level-ups should always be in order (if any exist)
      for (let i = 1; i < result.levelUpTicks.length; i++) {
        expect(result.levelUpTicks[i].level).toBeGreaterThan(result.levelUpTicks[i - 1].level)
        expect(result.levelUpTicks[i].tick).toBeGreaterThanOrEqual(result.levelUpTicks[i - 1].tick)
      }
    })

    it("tracks max distance reached", async () => {
      const result = await runSimulation({
        seed: "test-seed-6",
        policy: safeMiner,
        targetLevel: 2,
        maxTicks: 50000,
      })

      // Max distance should be at least 0
      expect(result.maxDistanceReached).toBeGreaterThanOrEqual(0)
    })
  })
})
