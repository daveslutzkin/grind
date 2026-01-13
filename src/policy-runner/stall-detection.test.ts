/**
 * Tests for stall-detection.ts - Rolling window stall detection
 */

import { createStallDetector, DEFAULT_STALL_WINDOW_SIZE } from "./stall-detection.js"

describe("stall-detection", () => {
  describe("createStallDetector", () => {
    it("is not stalled initially", () => {
      const detector = createStallDetector(100)
      expect(detector.isStalled()).toBe(false)
    })

    it("XP gain resets counter", () => {
      const detector = createStallDetector(10)

      // Record 9 ticks without progress
      for (let i = 0; i < 9; i++) {
        detector.recordTick(0, 0)
      }
      expect(detector.isStalled()).toBe(false)

      // XP gain resets the counter
      detector.recordTick(5, 0)
      expect(detector.isStalled()).toBe(false)

      // Need another 10 ticks without progress to stall
      for (let i = 0; i < 9; i++) {
        detector.recordTick(0, 0)
      }
      expect(detector.isStalled()).toBe(false)
    })

    it("node discovery resets counter", () => {
      const detector = createStallDetector(10)

      // Record 9 ticks without progress
      for (let i = 0; i < 9; i++) {
        detector.recordTick(0, 0)
      }
      expect(detector.isStalled()).toBe(false)

      // Node discovery resets the counter
      detector.recordTick(0, 1)
      expect(detector.isStalled()).toBe(false)

      // Need another 10 ticks without progress to stall
      for (let i = 0; i < 9; i++) {
        detector.recordTick(0, 0)
      }
      expect(detector.isStalled()).toBe(false)
    })

    it("stall triggers after windowSize ticks of no progress", () => {
      const detector = createStallDetector(10)

      // Record 9 ticks without progress
      for (let i = 0; i < 9; i++) {
        detector.recordTick(0, 0)
      }
      expect(detector.isStalled()).toBe(false)

      // 10th tick triggers stall
      detector.recordTick(0, 0)
      expect(detector.isStalled()).toBe(true)
    })

    it("uses default window size when not specified", () => {
      const detector = createStallDetector()

      // Not stalled after many ticks (but less than default)
      for (let i = 0; i < 500; i++) {
        detector.recordTick(0, 0)
      }
      expect(detector.isStalled()).toBe(false)

      // Stalled after default window size
      for (let i = 0; i < DEFAULT_STALL_WINDOW_SIZE - 500; i++) {
        detector.recordTick(0, 0)
      }
      expect(detector.isStalled()).toBe(true)
    })

    it("reset clears the counter", () => {
      const detector = createStallDetector(10)

      // Get close to stall
      for (let i = 0; i < 9; i++) {
        detector.recordTick(0, 0)
      }

      // Reset
      detector.reset()

      // Not stalled after reset
      for (let i = 0; i < 9; i++) {
        detector.recordTick(0, 0)
      }
      expect(detector.isStalled()).toBe(false)
    })
  })
})
