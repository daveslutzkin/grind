/**
 * Tests for action-converter.ts - PolicyAction to engine Action conversion
 */

import { createWorld } from "./../world.js"
import { GatherMode } from "./../types.js"
import { toEngineAction, toEngineActions } from "./action-converter.js"

describe("action-converter", () => {
  describe("toEngineActions", () => {
    it("converts Mine action with default mode", () => {
      expect.assertions(3)
      const state = createWorld("test-seed")

      // Set up Mining skill (level 5 to ensure we can mine most materials)
      state.player.skills.Mining.level = 5

      // Find a node that has mineable materials at our level
      const node = state.world.nodes?.find((n) =>
        n.materials.some(
          (m) => m.requiresSkill === "Mining" && m.requiredLevel <= 5 && m.remainingUnits > 0
        )
      )
      // Node should always exist with this seed
      if (!node) {
        throw new Error("Test setup failed: no mineable node found")
      }

      const result = toEngineActions({ type: "Mine", nodeId: node.nodeId }, state)

      expect(result.isWait).toBe(false)
      expect(result.actions.length).toBe(1)
      expect(result.actions[0].type).toBe("Mine")
    })

    it("converts Mine action with explicit mode", () => {
      expect.assertions(3)
      const state = createWorld("test-seed")
      state.player.skills.Mining.level = 5

      // Find a node that has mineable materials
      const node = state.world.nodes?.find((n) =>
        n.materials.some(
          (m) => m.requiresSkill === "Mining" && m.requiredLevel <= 5 && m.remainingUnits > 0
        )
      )
      if (!node) {
        throw new Error("Test setup failed: no mineable node found")
      }

      const result = toEngineActions(
        { type: "Mine", nodeId: node.nodeId, mode: GatherMode.CAREFUL_ALL },
        state
      )

      expect(result.isWait).toBe(false)
      expect(result.actions[0].type).toBe("Mine")
      const mineAction = result.actions[0] as { mode: GatherMode }
      expect(mineAction.mode).toBe(GatherMode.CAREFUL_ALL)
    })

    it("converts Travel action to FarTravel", () => {
      const state = createWorld("test-seed")

      const result = toEngineActions({ type: "Travel", toAreaId: "area-d1-i0" }, state)

      expect(result.isWait).toBe(false)
      expect(result.actions.length).toBe(1)
      expect(result.actions[0].type).toBe("FarTravel")
    })

    it("converts ReturnToTown action", () => {
      const state = createWorld("test-seed")

      const result = toEngineActions({ type: "ReturnToTown" }, state)

      expect(result.isWait).toBe(false)
      expect(result.actions.length).toBe(1)
      expect(result.actions[0].type).toBe("FarTravel")
      expect((result.actions[0] as { destinationAreaId: string }).destinationAreaId).toBe("TOWN")
    })

    it("converts Explore action when at target area", () => {
      const state = createWorld("test-seed")
      state.exploration.playerState.currentAreaId = "area-d1-i0"

      const result = toEngineActions({ type: "Explore", areaId: "area-d1-i0" }, state)

      expect(result.isWait).toBe(false)
      expect(result.actions[0].type).toBe("Explore")
    })

    it("converts Explore action to FarTravel when not at target area", () => {
      const state = createWorld("test-seed")
      state.exploration.playerState.currentAreaId = "TOWN"

      const result = toEngineActions({ type: "Explore", areaId: "area-d1-i0" }, state)

      expect(result.isWait).toBe(false)
      expect(result.actions[0].type).toBe("FarTravel")
    })

    it("converts DepositInventory to Store actions", () => {
      const state = createWorld("test-seed")

      // Add items to inventory
      state.player.inventory.push({ itemId: "COPPER_ORE", quantity: 1 })
      state.player.inventory.push({ itemId: "COPPER_ORE", quantity: 1 })
      state.player.inventory.push({ itemId: "STONE", quantity: 1 })

      const result = toEngineActions({ type: "DepositInventory" }, state)

      expect(result.isWait).toBe(false)
      // Should have Store actions for each item type
      expect(result.actions.length).toBe(2) // COPPER_ORE and STONE
      expect(result.actions.every((a) => a.type === "Store")).toBe(true)
    })

    it("treats empty DepositInventory as wait", () => {
      const state = createWorld("test-seed")

      const result = toEngineActions({ type: "DepositInventory" }, state)

      expect(result.isWait).toBe(true)
      expect(result.actions.length).toBe(0)
    })

    it("converts Wait action", () => {
      const state = createWorld("test-seed")

      const result = toEngineActions({ type: "Wait" }, state)

      expect(result.isWait).toBe(true)
      expect(result.actions.length).toBe(0)
    })
  })

  describe("toEngineAction", () => {
    it("returns null for Wait action", () => {
      const state = createWorld("test-seed")

      const result = toEngineAction({ type: "Wait" }, state)

      expect(result).toBeNull()
    })

    it("throws for multi-action conversions", () => {
      const state = createWorld("test-seed")

      // Add multiple item types to inventory
      state.player.inventory.push({ itemId: "COPPER_ORE", quantity: 1 })
      state.player.inventory.push({ itemId: "STONE", quantity: 1 })

      expect(() => {
        toEngineAction({ type: "DepositInventory" }, state)
      }).toThrow()
    })

    it("throws for unknown node", () => {
      const state = createWorld("test-seed")
      state.player.skills.Mining.level = 1

      expect(() => {
        toEngineAction({ type: "Mine", nodeId: "nonexistent-node" }, state)
      }).toThrow()
    })
  })
})
