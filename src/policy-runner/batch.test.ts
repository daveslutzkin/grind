/**
 * Tests for batch.ts - Batch/Monte Carlo simulation runner
 */

import { runBatch } from "./batch.js"
import { safeMiner } from "./policies/safe.js"

describe("batch", () => {
  describe("runBatch", () => {
    it("runs multiple seeds with a single policy", async () => {
      const result = await runBatch({
        seeds: ["seed-1", "seed-2", "seed-3"],
        policies: [safeMiner],
        targetLevel: 2,
        maxTicks: 10000,
      })

      expect(result.results).toHaveLength(3)
      expect(result.results.every((r) => r.policyId === "safe")).toBe(true)
    })

    it("runs all policies for each seed", async () => {
      const mockPolicy1 = {
        id: "mock1",
        name: "Mock Policy 1",
        decide: () => ({ type: "Wait" as const }),
      }
      const mockPolicy2 = {
        id: "mock2",
        name: "Mock Policy 2",
        decide: () => ({ type: "Wait" as const }),
      }

      const result = await runBatch({
        seeds: ["seed-1"],
        policies: [mockPolicy1, mockPolicy2],
        targetLevel: 2,
        maxTicks: 100,
        stallWindowSize: 50,
      })

      expect(result.results).toHaveLength(2)
      expect(result.results.map((r) => r.policyId).sort()).toEqual(["mock1", "mock2"])
    })

    it("generates seeds when seedCount is provided", async () => {
      const result = await runBatch({
        seedCount: 3,
        policies: [safeMiner],
        targetLevel: 2,
        maxTicks: 10000,
      })

      expect(result.results).toHaveLength(3)
      // Each result should have a unique seed
      const seeds = new Set(result.results.map((r) => r.seed))
      expect(seeds.size).toBe(3)
    })

    it("computes aggregates for each policy", async () => {
      const result = await runBatch({
        seeds: ["seed-1", "seed-2"],
        policies: [safeMiner],
        targetLevel: 2,
        maxTicks: 20000,
      })

      expect(result.aggregates.byPolicy["safe"]).toBeDefined()
      expect(result.aggregates.byPolicy["safe"].runCount).toBe(2)
    })

    it("defaults to 100 seeds when neither seeds nor seedCount provided", async () => {
      // This test would be slow with 100 seeds, so we just verify the batch config defaults
      const mockPolicy = {
        id: "instant-stall",
        name: "Instant Stall",
        decide: () => ({ type: "Wait" as const }),
      }

      const result = await runBatch({
        policies: [mockPolicy],
        targetLevel: 2,
        maxTicks: 50,
        stallWindowSize: 10, // Very short to stall quickly
      })

      // Should have run 100 times with default seedCount
      expect(result.results).toHaveLength(100)
    })
  })
})

