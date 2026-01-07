import { describe, it, expect } from "@jest/globals"
import { formatWorldState, formatActionLog } from "./formatters.js"
import { createWorld } from "../world.js"
import { executeAction } from "../engine.js"
import type { GatherMode, WorldState, AreaID } from "../types.js"
import { NodeType } from "../types.js"

/**
 * Test helpers for procedural area IDs
 */

/** Get a distance-1 area that has ore nodes */
function getOreAreaId(state: WorldState): AreaID {
  for (const area of state.exploration.areas.values()) {
    if (area.distance === 1) {
      const hasOre = state.world.nodes?.some(
        (n) => n.areaId === area.id && n.nodeType === NodeType.ORE_VEIN
      )
      if (hasOre) return area.id
    }
  }
  throw new Error("No ore area found")
}

/** Make an area and its connection from TOWN known */
function makeAreaKnown(state: WorldState, areaId: AreaID): void {
  if (!state.exploration.playerState.knownAreaIds.includes(areaId)) {
    state.exploration.playerState.knownAreaIds.push(areaId)
  }
  const connectionId = `TOWN->${areaId}`
  if (!state.exploration.playerState.knownConnectionIds.includes(connectionId)) {
    state.exploration.playerState.knownConnectionIds.push(connectionId)
  }
}

describe("Formatters", () => {
  describe("formatWorldState", () => {
    it("should format basic world state as readable text", () => {
      const state = createWorld("test-seed")
      const formatted = formatWorldState(state)

      expect(formatted).toContain("Location: TOWN")
      expect(formatted).toContain("Ticks remaining:")
      expect(formatted).toContain("Inventory:")
    })

    it("should include player skills", () => {
      const state = createWorld("test-seed")
      const formatted = formatWorldState(state)

      expect(formatted).toContain("Skills:")
    })

    it("should show inventory items", () => {
      const state = createWorld("test-seed")
      state.player.inventory = [{ itemId: "iron_ore", quantity: 5 }]
      const formatted = formatWorldState(state)

      expect(formatted).toContain("iron_ore: 5")
    })

    it("should show available areas", () => {
      const state = createWorld("test-seed")
      const formatted = formatWorldState(state)

      expect(formatted).toContain("Available areas:")
    })

    it("should show nearby resource nodes at current location", () => {
      const state = createWorld("test-seed")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      // Move to a location with nodes
      executeAction(state, { type: "Move", destination: areaId })
      const formatted = formatWorldState(state)

      expect(formatted).toContain("Resource nodes here:")
    })
  })

  describe("formatActionLog", () => {
    it("should format successful action log", () => {
      const state = createWorld("test-seed")
      // Enrol in Mining first
      executeAction(state, { type: "Enrol", skill: "Mining" })
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      const log = executeAction(state, {
        type: "Move",
        destination: areaId,
      })
      const formatted = formatActionLog(log)

      expect(formatted).toContain("SUCCESS")
      expect(formatted).toContain("ExplorationTravel") // Move translates to ExplorationTravel
      expect(formatted).toContain("Time used:")
    })

    it("should format failed action log with failure reason", () => {
      const state = createWorld("test-seed")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      // Try to gather without enrolling - should fail
      executeAction(state, { type: "Move", destination: areaId })

      // Find a node
      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      if (!node) throw new Error("No node found for test")

      const log = executeAction(state, {
        type: "Gather",
        nodeId: node.nodeId,
        mode: "FOCUS" as GatherMode,
        focusMaterialId: node.materials[0].materialId,
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("FAILED")
    })

    it("should include XP gain information when present", () => {
      const state = createWorld("test-seed")
      executeAction(state, { type: "Enrol", skill: "Mining" })
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      executeAction(state, { type: "Move", destination: areaId })

      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      if (!node) throw new Error("No node found for test")

      // Find a material we can actually gather (level 1)
      const material = node.materials.find((m) => m.requiredLevel <= 1)
      if (!material) throw new Error("No material found for test")

      const log = executeAction(state, {
        type: "Gather",
        nodeId: node.nodeId,
        mode: "FOCUS" as GatherMode,
        focusMaterialId: material.materialId,
      })

      const formatted = formatActionLog(log)

      if (log.skillGained) {
        expect(formatted).toContain("XP gained:")
      }
    })

    it("should include RNG roll outcomes when present", () => {
      const state = createWorld("test-seed")
      executeAction(state, { type: "Enrol", skill: "Mining" })
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      executeAction(state, { type: "Move", destination: areaId })

      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      if (!node) throw new Error("No node found for test")

      const material = node.materials.find((m) => m.requiredLevel <= 1)
      if (!material) throw new Error("No material found for test")

      const log = executeAction(state, {
        type: "Gather",
        nodeId: node.nodeId,
        mode: "FOCUS" as GatherMode,
        focusMaterialId: material.materialId,
      })

      const formatted = formatActionLog(log)

      if (log.rngRolls.length > 0) {
        expect(formatted).toContain("RNG:")
      }
    })

    it("should include items gained/lost", () => {
      const state = createWorld("test-seed")
      executeAction(state, { type: "Enrol", skill: "Mining" })
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      executeAction(state, { type: "Move", destination: areaId })

      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      if (!node) throw new Error("No node found for test")

      const material = node.materials.find((m) => m.requiredLevel <= 1)
      if (!material) throw new Error("No material found for test")

      const log = executeAction(state, {
        type: "Gather",
        nodeId: node.nodeId,
        mode: "FOCUS" as GatherMode,
        focusMaterialId: material.materialId,
      })

      const formatted = formatActionLog(log)

      if (log.extraction && log.extraction.extracted.length > 0) {
        expect(formatted).toContain("Items gained:")
      }
    })
  })
})
