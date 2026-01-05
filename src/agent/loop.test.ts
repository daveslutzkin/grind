import { describe, it, expect, beforeEach } from "@jest/globals"
import { createAgentLoop, AgentLoopConfig, AgentLoop } from "./loop.js"

describe("Agent Loop", () => {
  describe("createAgentLoop", () => {
    it("should create an agent loop with valid config", () => {
      const config: AgentLoopConfig = {
        seed: "test-seed",
        ticks: 25,
        objective: "explore the game",
        verbose: false,
        dryRun: true, // Don't actually call LLM
      }

      const loop = createAgentLoop(config)
      expect(loop).toBeDefined()
    })
  })

  describe("AgentLoop", () => {
    let loop: AgentLoop

    beforeEach(() => {
      const config: AgentLoopConfig = {
        seed: "test-seed",
        ticks: 25,
        objective: "explore the game",
        verbose: false,
        dryRun: true,
      }
      loop = createAgentLoop(config)
    })

    it("should initialize world with seed", () => {
      const state = loop.getWorldState()
      expect(state).toBeDefined()
      expect(state.player.location).toBe("TOWN")
      expect(state.time.sessionRemainingTicks).toBe(25)
    })

    it("should track session stats", () => {
      const stats = loop.getStats()
      expect(stats.actionsAttempted).toBe(0)
      expect(stats.actionsSucceeded).toBe(0)
      expect(stats.actionsFailed).toBe(0)
    })

    it("should execute a single step in dry run mode", async () => {
      // In dry run mode, it should return a mock response
      const result = await loop.step()

      expect(result).toBeDefined()
      expect(result.done).toBeDefined()
    })

    it("should track learnings", () => {
      loop.addLearning("TOWN is the starting location")
      const knowledge = loop.getKnowledge()

      expect(
        knowledge.world.length +
          knowledge.mechanics.length +
          knowledge.items.length +
          knowledge.strategies.length
      ).toBeGreaterThan(0)
    })

    it("should detect when session is complete", async () => {
      // Create a loop with 0 ticks - should be done immediately
      const shortLoop = createAgentLoop({
        seed: "short-test",
        ticks: 0,
        objective: "test",
        verbose: false,
        dryRun: true,
      })

      expect(shortLoop.isComplete()).toBe(true)
    })
  })
})
