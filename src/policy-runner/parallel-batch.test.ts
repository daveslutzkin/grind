/**
 * Tests for parallel-batch.ts - Parallel batch runner using worker threads
 */

import { runBatch } from "./batch.js"
import { runBatchParallel } from "./parallel-batch.js"
import { safeMiner } from "./policies/safe.js"

describe("parallel-batch", () => {
  describe("runBatchParallel", () => {
    it("produces the same results as sequential runBatch", async () => {
      const seeds = ["seed-1", "seed-2", "seed-3"]
      const config = {
        seeds,
        policies: [safeMiner],
        targetLevel: 2,
        maxTicks: 10000,
      }

      const sequentialResult = await runBatch(config)
      const parallelResult = await runBatchParallel(config)

      // Same number of results
      expect(parallelResult.results).toHaveLength(sequentialResult.results.length)

      // Results should match (order may differ, so compare sorted)
      const sortBySeed = (a: { seed: string }, b: { seed: string }) => a.seed.localeCompare(b.seed)

      const sortedSequential = [...sequentialResult.results].sort(sortBySeed)
      const sortedParallel = [...parallelResult.results].sort(sortBySeed)

      for (let i = 0; i < sortedSequential.length; i++) {
        expect(sortedParallel[i].seed).toBe(sortedSequential[i].seed)
        expect(sortedParallel[i].policyId).toBe(sortedSequential[i].policyId)
        expect(sortedParallel[i].terminationReason).toBe(sortedSequential[i].terminationReason)
        expect(sortedParallel[i].finalLevel).toBe(sortedSequential[i].finalLevel)
        expect(sortedParallel[i].totalTicks).toBe(sortedSequential[i].totalTicks)
      }
    })

    it("runs multiple policies for each seed", async () => {
      const result = await runBatchParallel({
        seeds: ["seed-1", "seed-2"],
        policies: [safeMiner],
        targetLevel: 2,
        maxTicks: 10000,
      })

      expect(result.results).toHaveLength(2)
      expect(result.results.every((r) => r.policyId === "safe")).toBe(true)
    })

    it("generates seeds when seedCount is provided", async () => {
      const result = await runBatchParallel({
        seedCount: 5,
        policies: [safeMiner],
        targetLevel: 2,
        maxTicks: 10000,
      })

      expect(result.results).toHaveLength(5)
      const seeds = new Set(result.results.map((r) => r.seed))
      expect(seeds.size).toBe(5)
    })

    it("computes aggregates for each policy", async () => {
      const result = await runBatchParallel({
        seeds: ["seed-1", "seed-2"],
        policies: [safeMiner],
        targetLevel: 2,
        maxTicks: 20000,
      })

      expect(result.aggregates.byPolicy["safe"]).toBeDefined()
      expect(result.aggregates.byPolicy["safe"].runCount).toBe(2)
    })

    it("calls onProgress callback for each completed simulation", async () => {
      let progressCount = 0
      await runBatchParallel({
        seeds: ["seed-1", "seed-2", "seed-3"],
        policies: [safeMiner],
        targetLevel: 2,
        maxTicks: 10000,
        onProgress: () => {
          progressCount++
        },
      })

      expect(progressCount).toBe(3)
    })

    it("respects maxWorkers option", async () => {
      // With maxWorkers=1, should still produce correct results
      const result = await runBatchParallel({
        seeds: ["seed-1", "seed-2"],
        policies: [safeMiner],
        targetLevel: 2,
        maxTicks: 10000,
        maxWorkers: 1,
      })

      expect(result.results).toHaveLength(2)
    })
  })
})
