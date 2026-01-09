import { describe, it, expect } from "@jest/globals"
import { formatWorldState, formatActionLog } from "./formatters.js"
import { createWorld } from "../world.js"
import { executeAction } from "../engine.js"
import type { GatherMode, WorldState, AreaID } from "../types.js"
import { NodeType } from "../types.js"

/**
 * Test helpers for procedural area IDs
 */

/** Get an area that has ore nodes (any distance) */
function getOreAreaId(state: WorldState): AreaID {
  // Sort areas by distance so we prefer closer ones
  const areas = Array.from(state.exploration.areas.values())
    .filter((a) => a.distance > 0)
    .sort((a, b) => a.distance - b.distance)
  for (const area of areas) {
    const hasOre = state.world.nodes?.some(
      (n) => n.areaId === area.id && n.nodeType === NodeType.ORE_VEIN
    )
    if (hasOre) return area.id
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

/** Discover all locations in an area (required for nodes to be visible and Gather to work) */
function discoverAllLocations(state: WorldState, areaId: AreaID): void {
  const area = state.exploration.areas.get(areaId)
  if (area) {
    for (const loc of area.locations) {
      if (!state.exploration.playerState.knownLocationIds.includes(loc.id)) {
        state.exploration.playerState.knownLocationIds.push(loc.id)
      }
    }
  }
}

describe("Formatters", () => {
  describe("formatWorldState", () => {
    it("should format basic world state as readable text", () => {
      const state = createWorld("ore-test")
      const formatted = formatWorldState(state)

      expect(formatted).toContain("Location: TOWN")
      expect(formatted).toContain("Inventory:")
    })

    it("should include player skills", () => {
      const state = createWorld("ore-test")
      const formatted = formatWorldState(state)

      expect(formatted).toContain("Skills:")
    })

    it("should show inventory items", () => {
      const state = createWorld("ore-test")
      state.player.inventory = [{ itemId: "iron_ore", quantity: 5 }]
      const formatted = formatWorldState(state)

      expect(formatted).toContain("5 iron_ore")
    })

    it("should show available areas", () => {
      const state = createWorld("ore-test")
      const formatted = formatWorldState(state)

      expect(formatted).toContain("Travel:")
    })

    it("should show nearby resource nodes at current location", () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      // Set player at the ore area directly (not testing travel here)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId) // Must discover locations to see nodes
      const formatted = formatWorldState(state)

      expect(formatted).toContain("Gathering:")
    })
  })

  describe("formatActionLog", () => {
    it("should format successful action log", () => {
      const state = createWorld("ore-test")
      // Enrol in Mining first
      executeAction(state, { type: "Enrol", skill: "Mining" })
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      // Position player at ore area and gather (testing gather log, not travel)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)

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

      expect(formatted).toContain("✓")
      expect(formatted).toContain("Gather")
      expect(formatted).toMatch(/\(\d+t\)/)
    })

    it("should format failed action log with failure reason", () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      // Position player at ore area directly
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)

      // Find a node
      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      if (!node) throw new Error("No node found for test")

      // Try to gather without enrolling - should fail
      const log = executeAction(state, {
        type: "Gather",
        nodeId: node.nodeId,
        mode: "FOCUS" as GatherMode,
        focusMaterialId: node.materials[0].materialId,
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗")
    })

    it("should include XP gain information when present", () => {
      const state = createWorld("ore-test")
      executeAction(state, { type: "Enrol", skill: "Mining" })
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      // Position player at ore area directly
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)

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
        expect(formatted).toContain("XP")
      }
    })

    it("should include RNG roll outcomes when present", () => {
      const state = createWorld("ore-test")
      executeAction(state, { type: "Enrol", skill: "Mining" })
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      // Position player at ore area directly
      state.exploration.playerState.currentAreaId = areaId

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
      const state = createWorld("ore-test")
      executeAction(state, { type: "Enrol", skill: "Mining" })
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      // Position player at ore area directly
      state.exploration.playerState.currentAreaId = areaId

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
        expect(formatted).toContain("Gained:")
      }
    })
  })
})
