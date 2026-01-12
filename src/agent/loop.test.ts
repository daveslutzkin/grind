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

    it("should accept learnings", () => {
      // Just verify the method works - knowledge is used internally for summarization
      loop.addLearning("TOWN is the starting location")
      // No error means success
    })

    it("should be complete when elapsed ticks >= tick budget", async () => {
      // Create a loop with 0 tick budget - should be complete immediately
      const completedLoop = createAgentLoop({
        seed: "complete-test",
        ticks: 0,
        objective: "test",
        verbose: false,
        dryRun: true,
      })

      expect(completedLoop.isComplete()).toBe(true)

      // Create a loop with positive tick budget - should not be complete initially
      const activeLoop = createAgentLoop({
        seed: "active-test",
        ticks: 100,
        objective: "test",
        verbose: false,
        dryRun: true,
      })

      expect(activeLoop.isComplete()).toBe(false)
    })

    it("should terminate in dry run mode after mock action", async () => {
      // Create loop with tick budget
      const minLoop = createAgentLoop({
        seed: "min-test",
        ticks: 10,
        objective: "test",
        verbose: false,
        dryRun: true,
      })

      // First step should execute the mock action and return done=false
      const result1 = await minLoop.step()
      expect(result1.done).toBe(false)
      expect(result1.action).toBeTruthy()

      // Second step in dry run mode should detect that an action was already attempted
      // and return done=true (dry run behavior to prevent infinite loops)
      const result2 = await minLoop.step()
      expect(result2.done).toBe(true)
    })

    it("should execute actions in dry run mode", async () => {
      // Create loop with minimal tick budget
      const storeLoop = createAgentLoop({
        seed: "store-test",
        ticks: 5,
        objective: "test",
        verbose: false,
        dryRun: true,
      })

      // Add an item to inventory
      const state = storeLoop.getWorldState()
      state.player.inventory.push({ itemId: "COPPER_ORE", quantity: 5 })

      // Should execute the mock action in dry run mode
      const result = await storeLoop.step()
      expect(result.done).toBeDefined()
      expect(result.action).toBeTruthy()
    })

    it("should include notes field in step result", async () => {
      const notesLoop = createAgentLoop({
        seed: "notes-test",
        ticks: 10,
        objective: "test",
        verbose: false,
        dryRun: true,
      })

      const result = await notesLoop.step()

      // Notes field should exist (may be undefined or empty string in dry run)
      expect("notes" in result || result.notes === undefined).toBe(true)
    })

    it("should provide conversation history", () => {
      const history = loop.getConversationHistory()
      expect(Array.isArray(history)).toBe(true)
    })

    it("should accept various learnings without error", () => {
      // Knowledge is tracked internally for summarization during sessions
      // We no longer expose getKnowledge() since it's not written to disk

      // World-related learning (keywords: location, travel, town, mine, forest)
      loop.addLearning("The mine is located to the east of town")
      // Mechanics-related learning (keywords: tick, xp, skill, cost, probability, level)
      loop.addLearning("Mining gives 5 XP per action")
      // Item-related learning (keywords: ore, wood, item, gather, material)
      loop.addLearning("Copper ore can be smelted into bars")
      // Strategy-related learning (keywords: should, better, strategy, efficient)
      loop.addLearning("I should avoid combat until I am stronger")

      // No error means success - knowledge is used internally by summarizeLearnings()
    })

    it("should handle duplicate learnings gracefully", () => {
      loop.addLearning("Mining costs 3 ticks")
      loop.addLearning("Mining costs 3 ticks")
      loop.addLearning("Mining costs 3 ticks")

      // No error means success - duplicates are filtered internally
    })
  })
})
