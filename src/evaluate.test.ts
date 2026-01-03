import { evaluateAction, evaluatePlan } from "./evaluate.js"
import { createToyWorld } from "./world.js"
import type { Action } from "./types.js"

describe("Evaluation APIs", () => {
  describe("evaluateAction", () => {
    it("should evaluate Move action", () => {
      const state = createToyWorld("test-seed")
      const action: Action = { type: "Move", destination: "MINE" }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(2)
      expect(result.expectedXP).toBe(0) // Move grants no XP (travel is purely logistical)
      expect(result.successProbability).toBe(1) // Move always succeeds if valid
    })

    it("should evaluate AcceptContract action", () => {
      const state = createToyWorld("test-seed")
      const action: Action = { type: "AcceptContract", contractId: "miners-guild-1" }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(0)
      expect(result.expectedXP).toBe(0) // No XP for accepting contract
      expect(result.successProbability).toBe(1)
    })

    it("should evaluate Gather action", () => {
      const state = createToyWorld("test-seed")
      state.player.location = "MINE"
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      const action: Action = { type: "Gather", nodeId: "iron-node" }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(2)
      expect(result.expectedXP).toBe(0.8) // 1 * 0.8 probability
      expect(result.successProbability).toBe(0.8)
    })

    it("should evaluate Fight action", () => {
      const state = createToyWorld("test-seed")
      state.player.location = "MINE"
      state.player.skills.Combat = { level: 1, xp: 0 } // Need level 1 to fight
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      const action: Action = { type: "Fight", enemyId: "cave-rat" }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(3)
      expect(result.expectedXP).toBe(0.7) // 1 * 0.7 probability
      expect(result.successProbability).toBe(0.7)
    })

    it("should evaluate Craft action", () => {
      const state = createToyWorld("test-seed")
      state.player.skills.Smithing = { level: 1, xp: 0 } // Need level 1 to craft
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 2 })
      const action: Action = { type: "Craft", recipeId: "iron-bar-recipe" }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(3)
      expect(result.expectedXP).toBe(1)
      expect(result.successProbability).toBe(1)
    })

    it("should evaluate Store action", () => {
      const state = createToyWorld("test-seed")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const action: Action = { type: "Store", itemId: "IRON_ORE", quantity: 1 }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(0) // Store is free
      expect(result.expectedXP).toBe(0) // No XP for Store
      expect(result.successProbability).toBe(1)
    })

    it("should evaluate Drop action", () => {
      const state = createToyWorld("test-seed")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const action: Action = { type: "Drop", itemId: "IRON_ORE", quantity: 1 }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(1) // Drop takes 1 tick
      expect(result.expectedXP).toBe(0) // No XP for drop
      expect(result.successProbability).toBe(1)
    })

    it("should return 0 probability for invalid action", () => {
      const state = createToyWorld("test-seed")
      // Player is at TOWN, but Move to TOWN is invalid
      const action: Action = { type: "Move", destination: "TOWN" }

      const result = evaluateAction(state, action)

      expect(result.successProbability).toBe(0)
    })

    it("should return 0 probability for Gather with insufficient skill level", () => {
      const state = createToyWorld("test-seed")
      state.player.location = "MINE"
      // Skills start at 0, so action should fail
      const action: Action = { type: "Gather", nodeId: "iron-node" }

      const result = evaluateAction(state, action)

      expect(result.successProbability).toBe(0)
    })

    it("should not mutate state", () => {
      const state = createToyWorld("test-seed")
      const stateBefore = JSON.stringify(state)
      const action: Action = { type: "Move", destination: "MINE" }

      evaluateAction(state, action)

      expect(JSON.stringify(state)).toBe(stateBefore)
    })
  })

  describe("evaluatePlan", () => {
    it("should evaluate empty plan", () => {
      const state = createToyWorld("test-seed")

      const result = evaluatePlan(state, [])

      expect(result.expectedTime).toBe(0)
      expect(result.expectedXP).toBe(0)
      expect(result.violations).toHaveLength(0)
    })

    it("should evaluate simple plan", () => {
      const state = createToyWorld("test-seed")
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      const actions: Action[] = [
        { type: "Move", destination: "MINE" },
        { type: "Gather", nodeId: "iron-node" },
      ]

      const result = evaluatePlan(state, actions)

      expect(result.expectedTime).toBe(4) // 2 + 2
      expect(result.expectedXP).toBe(0.8) // 0 (no XP for Move) + 0.8
      expect(result.violations).toHaveLength(0)
    })

    it("should detect violations in plan", () => {
      const state = createToyWorld("test-seed")
      const actions: Action[] = [
        { type: "Gather", nodeId: "iron-node" }, // Invalid - not at MINE
      ]

      const result = evaluatePlan(state, actions)

      expect(result.violations).toHaveLength(1)
      expect(result.violations[0].actionIndex).toBe(0)
      expect(result.violations[0].reason).toContain("WRONG_LOCATION")
    })

    it("should track state changes through plan", () => {
      const state = createToyWorld("test-seed")
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      state.player.skills.Smithing = { level: 1, xp: 0 } // Need level 1 to craft
      const actions: Action[] = [
        { type: "Move", destination: "MINE" },
        { type: "Gather", nodeId: "iron-node" },
        { type: "Move", destination: "TOWN" },
        { type: "Craft", recipeId: "iron-bar-recipe" }, // Will fail - needs 2 ore
      ]

      const result = evaluatePlan(state, actions)

      // First gather might succeed (0.8) giving 1 ore, but need 2 for craft
      expect(result.violations.length).toBeGreaterThan(0)
    })

    it("should not mutate state", () => {
      const state = createToyWorld("test-seed")
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      const stateBefore = JSON.stringify(state)
      const actions: Action[] = [
        { type: "Move", destination: "MINE" },
        { type: "Gather", nodeId: "iron-node" },
      ]

      evaluatePlan(state, actions)

      expect(JSON.stringify(state)).toBe(stateBefore)
    })

    it("should detect session time exceeded", () => {
      const state = createToyWorld("test-seed")
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      state.time.sessionRemainingTicks = 3 // Only 3 ticks remaining
      const actions: Action[] = [
        { type: "Move", destination: "MINE" }, // 2 ticks
        { type: "Gather", nodeId: "iron-node" }, // 2 ticks - exceeds
      ]

      const result = evaluatePlan(state, actions)

      expect(result.violations.length).toBeGreaterThan(0)
      expect(
        result.violations.some(
          (v) => v.reason.includes("SESSION_ENDED") || v.reason.includes("time")
        )
      ).toBe(true)
    })

    it("should reject 0-tick action when session has ended", () => {
      const state = createToyWorld("test-seed")
      state.time.sessionRemainingTicks = 0 // Session already ended
      const actions: Action[] = [
        { type: "AcceptContract", contractId: "miners-guild-1" }, // 0 ticks but session ended
      ]

      const result = evaluatePlan(state, actions)

      expect(result.violations).toHaveLength(1)
      expect(result.violations[0].actionIndex).toBe(0)
      expect(result.violations[0].reason).toContain("SESSION_ENDED")
    })
  })
})
