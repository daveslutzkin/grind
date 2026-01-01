import { createRng, roll } from "./rng.js"
import type { RngState, RngRoll } from "./types.js"

describe("RNG", () => {
  describe("createRng", () => {
    it("should create RNG state with seed and counter at 0", () => {
      const rng = createRng("test-seed")
      expect(rng.seed).toBe("test-seed")
      expect(rng.counter).toBe(0)
    })
  })

  describe("roll", () => {
    it("should return result and increment counter", () => {
      const rng: RngState = { seed: "test-seed", counter: 0 }
      const rolls: RngRoll[] = []

      const result = roll(rng, 0.5, "test-roll", rolls)

      expect(typeof result).toBe("boolean")
      expect(rng.counter).toBe(1)
      expect(rolls).toHaveLength(1)
      expect(rolls[0].label).toBe("test-roll")
      expect(rolls[0].probability).toBe(0.5)
      expect(rolls[0].rngCounter).toBe(0) // counter before increment
    })

    it("should be deterministic with same seed and counter", () => {
      const results1: boolean[] = []
      const results2: boolean[] = []

      for (let i = 0; i < 10; i++) {
        const rng1: RngState = { seed: "determinism-test", counter: i }
        const rng2: RngState = { seed: "determinism-test", counter: i }
        const rolls: RngRoll[] = []

        results1.push(roll(rng1, 0.5, "test", rolls))
        results2.push(roll(rng2, 0.5, "test", rolls))
      }

      expect(results1).toEqual(results2)
    })

    it("should produce different results with different seeds", () => {
      const resultsA: boolean[] = []
      const resultsB: boolean[] = []

      for (let i = 0; i < 20; i++) {
        const rngA: RngState = { seed: "seed-A", counter: i }
        const rngB: RngState = { seed: "seed-B", counter: i }
        const rolls: RngRoll[] = []

        resultsA.push(roll(rngA, 0.5, "test", rolls))
        resultsB.push(roll(rngB, 0.5, "test", rolls))
      }

      // With 20 rolls at 50%, it's extremely unlikely they'd all be the same
      expect(resultsA).not.toEqual(resultsB)
    })

    it("should always succeed with probability 1", () => {
      for (let i = 0; i < 10; i++) {
        const rng: RngState = { seed: "always-succeed", counter: i }
        const rolls: RngRoll[] = []
        expect(roll(rng, 1, "certain", rolls)).toBe(true)
      }
    })

    it("should always fail with probability 0", () => {
      for (let i = 0; i < 10; i++) {
        const rng: RngState = { seed: "always-fail", counter: i }
        const rolls: RngRoll[] = []
        expect(roll(rng, 0, "impossible", rolls)).toBe(false)
      }
    })

    it("should log all roll details", () => {
      const rng: RngState = { seed: "log-test", counter: 5 }
      const rolls: RngRoll[] = []

      const result = roll(rng, 0.75, "gather-iron", rolls)

      expect(rolls[0]).toEqual({
        label: "gather-iron",
        probability: 0.75,
        result: result,
        rngCounter: 5,
      })
    })
  })
})
