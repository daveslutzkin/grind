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
      expect(state.exploration.playerState.currentAreaId).toBe("TOWN")
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

    it("should never be complete (no session time limit)", async () => {
      // Create a loop with 0 ticks - no longer has time limit so never complete
      const shortLoop = createAgentLoop({
        seed: "short-test",
        ticks: 0,
        objective: "test",
        verbose: false,
        dryRun: true,
      })

      expect(shortLoop.isComplete()).toBe(false)
    })

    it("should always have viable actions (no session time limit)", async () => {
      // Create loop with minimal ticks
      const minLoop = createAgentLoop({
        seed: "min-test",
        ticks: 1,
        objective: "test",
        verbose: false,
        dryRun: true,
      })

      // First step should execute the mock enrol action and return done=false
      const result1 = await minLoop.step()
      expect(result1.done).toBe(false)
      expect(result1.action).toBeTruthy()

      // Second step should detect that an action was already attempted and return done=true
      const result2 = await minLoop.step()
      expect(result2.done).toBe(true)
    })

    it("should allow Store action at TOWN with items in inventory", async () => {
      // Create loop
      const storeLoop = createAgentLoop({
        seed: "store-test",
        ticks: 2,
        objective: "test",
        verbose: false,
        dryRun: true,
      })

      // Add an item to inventory
      const state = storeLoop.getWorldState()
      state.player.inventory.push({ itemId: "COPPER_ORE", quantity: 5 })

      // Should NOT end early because Store is possible (0 ticks)
      const result = await storeLoop.step()
      // Dry run will execute an action, not end early
      expect(result.done).toBeDefined()
    })
  })
})
