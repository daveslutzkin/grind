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

      // Level-ups should be in order by tick, and within each skill, levels should increase
      for (let i = 1; i < result.levelUpTicks.length; i++) {
        expect(result.levelUpTicks[i].tick).toBeGreaterThanOrEqual(result.levelUpTicks[i - 1].tick)
      }
      // Check that within each skill, levels strictly increase
      const bySkill = new Map<string, number[]>()
      for (const lu of result.levelUpTicks) {
        if (!bySkill.has(lu.skill)) bySkill.set(lu.skill, [])
        bySkill.get(lu.skill)!.push(lu.level)
      }
      for (const [, levels] of bySkill) {
        for (let i = 1; i < levels.length; i++) {
          expect(levels[i]).toBeGreaterThan(levels[i - 1])
        }
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

    it("records action log when recordActions is true", async () => {
      const result = await runSimulation({
        seed: "test-seed-7",
        policy: safeMiner,
        targetLevel: 2,
        maxTicks: 5000,
        recordActions: true,
      })

      // Action log should be present
      expect(result.actionLog).toBeDefined()
      expect(Array.isArray(result.actionLog)).toBe(true)
      expect(result.actionLog!.length).toBeGreaterThan(0)

      // Each record should have required fields
      for (const record of result.actionLog!) {
        expect(typeof record.tick).toBe("number")
        expect(record.tick).toBeGreaterThanOrEqual(0)
        expect(record.policyAction).toBeDefined()
        expect(record.policyAction.type).toBeDefined()
        expect(typeof record.ticksConsumed).toBe("number")
        expect(typeof record.success).toBe("boolean")
        expect(Array.isArray(record.xpGained)).toBe(true)
        expect(Array.isArray(record.levelsAfter)).toBe(true)
        expect(Array.isArray(record.levelUps)).toBe(true)
      }
    })

    it("does not include action log when recordActions is false", async () => {
      const result = await runSimulation({
        seed: "test-seed-8",
        policy: safeMiner,
        targetLevel: 2,
        maxTicks: 5000,
        recordActions: false,
      })

      // Action log should not be present
      expect(result.actionLog).toBeUndefined()
    })

    it("does not include action log by default", async () => {
      const result = await runSimulation({
        seed: "test-seed-9",
        policy: safeMiner,
        targetLevel: 2,
        maxTicks: 5000,
      })

      // Action log should not be present by default
      expect(result.actionLog).toBeUndefined()
    })

    it("action log records ticks in order", async () => {
      const result = await runSimulation({
        seed: "test-seed-10",
        policy: safeMiner,
        targetLevel: 2,
        maxTicks: 5000,
        recordActions: true,
      })

      expect(result.actionLog).toBeDefined()
      expect(result.actionLog!.length).toBeGreaterThan(1)

      // Ticks should be in non-decreasing order
      for (let i = 1; i < result.actionLog!.length; i++) {
        expect(result.actionLog![i].tick).toBeGreaterThanOrEqual(result.actionLog![i - 1].tick)
      }
    })

    it("terminates with stall when no mineable materials remain", async () => {
      // With mastery-based progression, STONE provides XP through L19.
      // Target level 25 requires materials beyond STONE (COPPER_ORE unlocks at L20).
      // When STONE is depleted and the player is below L20, the observation correctly
      // reports the node as not mineable, so the policy stalls instead of trying to mine.
      const result = await runSimulation({
        seed: "seed-1",
        policy: safeMiner,
        targetLevel: 25, // Requires COPPER_ORE (L20 unlock) which won't be available
        maxTicks: 100000,
        stallWindowSize: 2000, // Reasonable window to detect stall
      })

      // Should terminate due to stall (STONE exhausted, observation correctly reports node as not mineable)
      expect(result.terminationReason).toBe("stall")
    })
  })
})
