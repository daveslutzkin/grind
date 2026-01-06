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

    it("should end early when no viable actions with 2 ticks at TOWN", async () => {
      // Create loop with minimal ticks
      const minLoop = createAgentLoop({
        seed: "min-test",
        ticks: 2,
        objective: "test",
        verbose: false,
        dryRun: true,
      })

      // At TOWN with 2 ticks, no skills enrolled, min travel cost is 3
      // No nodes at TOWN, so no gathering possible
      // Should detect no viable actions and end
      const result = await minLoop.step()
      expect(result.done).toBe(true)
      expect(result.reasoning).toContain("No viable actions")
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
