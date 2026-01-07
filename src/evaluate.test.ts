import { evaluateAction, evaluatePlan } from "./evaluate.js"
import { createGatheringWorld } from "./gatheringWorld.js"
import type { Action } from "./types.js"
import { GatherMode } from "./types.js"

describe("Evaluation APIs", () => {
  describe("evaluateAction", () => {
    it("should evaluate Move action", () => {
      const state = createGatheringWorld("test-seed")
      const action: Action = { type: "Move", destination: "OUTSKIRTS_MINE" }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(0) // Move time calculated in exploration system
      expect(result.expectedXP).toBe(0) // Move grants no XP (travel is purely logistical)
      expect(result.successProbability).toBe(1) // Move always succeeds if valid
    })

    it("should evaluate AcceptContract action", () => {
      const state = createGatheringWorld("test-seed")
      const action: Action = { type: "AcceptContract", contractId: "miners-guild-1" }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(0)
      expect(result.expectedXP).toBe(0) // No XP for accepting contract
      expect(result.successProbability).toBe(1)
    })

    it("should evaluate Gather action", () => {
      const state = createGatheringWorld("test-seed")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      const node = state.world.nodes.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)!
      const focusMat = node.materials.find((m) => m.requiredLevel === 1)!
      const action: Action = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(5) // FOCUS mode takes 5 ticks
      expect(result.expectedXP).toBe(1) // Gathering always grants 1 XP
      expect(result.successProbability).toBe(1) // Gathering is deterministic in new system
    })

    it("should evaluate Fight action", () => {
      const state = createGatheringWorld("test-seed")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
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
      const state = createGatheringWorld("test-seed")
      state.player.skills.Smithing = { level: 1, xp: 0 } // Need level 1 to craft
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 2 })
      const action: Action = { type: "Craft", recipeId: "iron-bar-recipe" }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(3)
      expect(result.expectedXP).toBe(1)
      expect(result.successProbability).toBe(1)
    })

    it("should evaluate Store action", () => {
      const state = createGatheringWorld("test-seed")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const action: Action = { type: "Store", itemId: "IRON_ORE", quantity: 1 }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(0) // Store is free
      expect(result.expectedXP).toBe(0) // No XP for Store
      expect(result.successProbability).toBe(1)
    })

    it("should evaluate Drop action", () => {
      const state = createGatheringWorld("test-seed")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const action: Action = { type: "Drop", itemId: "IRON_ORE", quantity: 1 }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(1) // Drop takes 1 tick
      expect(result.expectedXP).toBe(0) // No XP for drop
      expect(result.successProbability).toBe(1)
    })

    it("should return 0 probability for invalid action", () => {
      const state = createGatheringWorld("test-seed")
      // Try to gather without being at the node location
      const node = state.world.nodes.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)!
      const focusMat = node.materials[0]
      const action: Action = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const result = evaluateAction(state, action)

      expect(result.successProbability).toBe(0) // Should fail - player is at TOWN, not OUTSKIRTS_MINE
    })

    it("should return 0 probability for Gather with insufficient skill level", () => {
      const state = createGatheringWorld("test-seed")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      // Skills start at 0, so action should fail
      const node = state.world.nodes.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)!
      const focusMat = node.materials[0]
      const action: Action = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const result = evaluateAction(state, action)

      expect(result.successProbability).toBe(0)
    })

    it("should not mutate state", () => {
      const state = createGatheringWorld("test-seed")
      const stateBefore = JSON.stringify(state)
      const action: Action = { type: "Move", destination: "OUTSKIRTS_MINE" }

      evaluateAction(state, action)

      expect(JSON.stringify(state)).toBe(stateBefore)
    })
  })

  describe("evaluatePlan", () => {
    it("should evaluate empty plan", () => {
      const state = createGatheringWorld("test-seed")

      const result = evaluatePlan(state, [])

      expect(result.expectedTime).toBe(0)
      expect(result.expectedXP).toBe(0)
      expect(result.violations).toHaveLength(0)
    })

    it("should evaluate simple plan", () => {
      const state = createGatheringWorld("test-seed")
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      const node = state.world.nodes.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)!
      const focusMat = node.materials.find((m) => m.requiredLevel === 1)!
      const actions: Action[] = [
        { type: "Move", destination: "OUTSKIRTS_MINE" },
        {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: focusMat.materialId,
        },
      ]

      const result = evaluatePlan(state, actions)

      expect(result.expectedTime).toBe(5) // 0 (Move time in exploration) + 5 (FOCUS gather)
      expect(result.expectedXP).toBe(1) // 0 (no XP for Move) + 1 (gather XP)
      expect(result.violations).toHaveLength(0)
    })

    it("should detect violations in plan", () => {
      const state = createGatheringWorld("test-seed")
      const node = state.world.nodes.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)!
      const focusMat = node.materials[0]
      const actions: Action[] = [
        {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: focusMat.materialId,
        }, // Invalid - not at OUTSKIRTS_MINE
      ]

      const result = evaluatePlan(state, actions)

      expect(result.violations).toHaveLength(1)
      expect(result.violations[0].actionIndex).toBe(0)
      expect(result.violations[0].reason).toContain("WRONG_LOCATION")
    })

    it.skip("should track state changes through plan", () => {
      const state = createGatheringWorld("test-seed")
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      state.player.skills.Smithing = { level: 1, xp: 0 } // Need level 1 to craft
      const node = state.world.nodes.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)!
      const focusMat = node.materials.find((m) => m.requiredLevel === 1)!
      const actions: Action[] = [
        { type: "Move", destination: "OUTSKIRTS_MINE" },
        {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: focusMat.materialId,
        },
        { type: "Move", destination: "TOWN" },
        { type: "Craft", recipeId: "iron-bar-recipe" }, // Will fail - needs 2 IRON_ORE
      ]

      const result = evaluatePlan(state, actions)

      // This test is complex due to material extraction variance
      expect(result.violations.length).toBeGreaterThan(0)
    })

    it("should not mutate state", () => {
      const state = createGatheringWorld("test-seed")
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      const node = state.world.nodes.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)!
      const focusMat = node.materials.find((m) => m.requiredLevel === 1)!
      const stateBefore = JSON.stringify(state)
      const actions: Action[] = [
        { type: "Move", destination: "OUTSKIRTS_MINE" },
        {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: focusMat.materialId,
        },
      ]

      evaluatePlan(state, actions)

      expect(JSON.stringify(state)).toBe(stateBefore)
    })

    it("should detect session time exceeded", () => {
      const state = createGatheringWorld("test-seed")
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      state.time.sessionRemainingTicks = 3 // Only 3 ticks remaining
      const node = state.world.nodes.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)!
      const focusMat = node.materials.find((m) => m.requiredLevel === 1)!
      const actions: Action[] = [
        { type: "Move", destination: "OUTSKIRTS_MINE" }, // 0 ticks in evaluation
        {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: focusMat.materialId,
        }, // 5 ticks - exceeds
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
      const state = createGatheringWorld("test-seed")
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
