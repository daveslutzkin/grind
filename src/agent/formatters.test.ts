import { describe, it, expect } from "@jest/globals"
import { formatWorldState, formatActionLog } from "./formatters.js"
import { createWorld, TOWN_LOCATIONS } from "../world.js"
import { executeAction } from "../engine.js"
import type { GatherMode, WorldState, AreaID } from "../types.js"
import { NodeType } from "../types.js"

/** Set player to be at a specific location in town */
function setTownLocation(state: WorldState, locationId: string | null): void {
  state.exploration.playerState.currentAreaId = "TOWN"
  state.exploration.playerState.currentLocationId = locationId
}

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

      expect(formatted).toContain("Location: Town Square in TOWN")
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

    describe("material visibility with skill requirements", () => {
      it("should show only node type when player has no skill", () => {
        const state = createWorld("mat-vis-1")
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId
        discoverAllLocations(state, areaId)

        // Player has no Mining skill (not enrolled)
        const formatted = formatWorldState(state)

        // Should show node type but NO material details
        expect(formatted).toContain("Gathering: Ore vein")
        expect(formatted).not.toContain("✓")
        expect(formatted).not.toMatch(/\(L\d+\)/)
      })

      it("should show materials with ✓ and (L#) indicators when player has skill", async () => {
        const state = createWorld("mat-vis-2")
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId
        discoverAllLocations(state, areaId)

        // Enrol in Mining at L1
        setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
        await executeAction(state, { type: "Enrol", skill: "Mining" })
        state.exploration.playerState.currentAreaId = areaId

        const formatted = formatWorldState(state)

        // Should show node type on one line, materials on next
        expect(formatted).toContain("Gathering: Ore vein")
        // Should have at least one material with ✓ (L1 gatherable)
        expect(formatted).toMatch(/[A-Z_]+ ✓/)
      })

      it("should show (L#) for materials requiring higher level", async () => {
        const state = createWorld("mat-vis-3")
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId
        discoverAllLocations(state, areaId)

        // Enrol in Mining at L1
        setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
        await executeAction(state, { type: "Enrol", skill: "Mining" })
        state.exploration.playerState.currentAreaId = areaId

        // Find a node with a material requiring level > 1
        const node = state.world.nodes?.find(
          (n) => n.areaId === areaId && n.materials.some((m) => m.requiredLevel > 1)
        )

        const formatted = formatWorldState(state)

        // If there's a higher-level material, it should show (L#)
        if (node) {
          const higherLevelMat = node.materials.find((m) => m.requiredLevel > 1)
          if (higherLevelMat && higherLevelMat.requiredLevel <= 3) {
            // Only visible if within skillLevel + 2
            expect(formatted).toMatch(/\(L\d+\)/)
          }
        }
      })

      it("should show quantities after APPRAISE", async () => {
        const state = createWorld("mat-vis-4")
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId
        discoverAllLocations(state, areaId)

        // Enrol in Mining and level up to L3 for APPRAISE
        setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
        await executeAction(state, { type: "Enrol", skill: "Mining" })
        state.player.skills.Mining = { level: 3, xp: 0 } // L3 unlocks APPRAISE
        state.exploration.playerState.currentAreaId = areaId

        // Find a node and appraise it
        const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
        if (!node) throw new Error("No node found for test")

        // Perform APPRAISE action
        await executeAction(state, {
          type: "Gather",
          nodeId: node.nodeId,
          mode: "APPRAISE" as GatherMode,
        })

        const formatted = formatWorldState(state)

        // After appraisal, should show quantities like "80/80 COPPER_ORE ✓"
        expect(formatted).toMatch(/\d+\/\d+ [A-Z_]+ ✓/)
      })
    })

    describe("wilderness exploration status", () => {
      it("should show 'unexplored' when nothing discovered in area", () => {
        const state = createWorld("explore-status-1")
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId
        // No locations or connections from this area discovered
        const formatted = formatWorldState(state)

        expect(formatted).toContain("unexplored")
        expect(formatted).not.toContain("FULLY EXPLORED")
        expect(formatted).not.toContain("Gathering:")
      })

      it("should NOT show 'unexplored' when connection discovered but no locations", () => {
        const state = createWorld("explore-status-2")
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId

        // Add a connection FROM this area and mark it as discovered
        // (connections are generated lazily, so we add one manually)
        const targetAreaId = "discovered-target-area"
        state.exploration.connections.push({
          fromAreaId: areaId,
          toAreaId: targetAreaId,
          travelTimeMultiplier: 2,
        })
        const connId = `${areaId}->${targetAreaId}`
        state.exploration.playerState.knownConnectionIds.push(connId)
        state.exploration.playerState.knownAreaIds.push(targetAreaId)

        const formatted = formatWorldState(state)

        expect(formatted).not.toContain("unexplored")
        expect(formatted).not.toContain("FULLY EXPLORED")
      })

      it("should NOT show 'FULLY EXPLORED' when locations done but connections remain", () => {
        const state = createWorld("explore-status-3")
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId

        // Discover all locations
        discoverAllLocations(state, areaId)

        // Add an undiscovered connection from this area to ensure it's not "fully explored"
        // (connections may not be generated until explore is called)
        const fakeTargetAreaId = "fake-undiscovered-area"
        state.exploration.connections.push({
          fromAreaId: areaId,
          toAreaId: fakeTargetAreaId,
          travelTimeMultiplier: 2,
        })

        const formatted = formatWorldState(state)

        expect(formatted).not.toContain("unexplored")
        expect(formatted).not.toContain("FULLY EXPLORED")
        expect(formatted).toContain("Gathering:")
      })

      it("should show 'FULLY EXPLORED' when all locations AND connections discovered", () => {
        const state = createWorld("explore-status-4")
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId

        // Discover all locations
        discoverAllLocations(state, areaId)

        // Discover ALL connections from this area
        const connectionsFromArea = state.exploration.connections.filter(
          (c) => c.fromAreaId === areaId || c.toAreaId === areaId
        )
        for (const conn of connectionsFromArea) {
          const connId = `${conn.fromAreaId}->${conn.toAreaId}`
          if (!state.exploration.playerState.knownConnectionIds.includes(connId)) {
            state.exploration.playerState.knownConnectionIds.push(connId)
          }
          // Also make target areas known
          const targetId = conn.fromAreaId === areaId ? conn.toAreaId : conn.fromAreaId
          if (!state.exploration.playerState.knownAreaIds.includes(targetId)) {
            state.exploration.playerState.knownAreaIds.push(targetId)
          }
        }

        const formatted = formatWorldState(state)

        expect(formatted).toContain("FULLY EXPLORED")
        expect(formatted).not.toContain("unexplored")
      })
    })
  })

  describe("formatActionLog", () => {
    it("should format successful action log", async () => {
      const state = createWorld("ore-test")
      // Enrol in Mining first (must be at guild)
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
      await executeAction(state, { type: "Enrol", skill: "Mining" })
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      // Position player at ore area and gather (testing gather log, not travel)
      state.exploration.playerState.currentAreaId = areaId
      state.exploration.playerState.currentLocationId = null // At clearing
      discoverAllLocations(state, areaId)

      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      if (!node) throw new Error("No node found for test")
      const material = node.materials.find((m) => m.requiredLevel <= 1)
      if (!material) throw new Error("No material found for test")

      const log = await executeAction(state, {
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

    it("should format failed action log with failure reason", async () => {
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
      const log = await executeAction(state, {
        type: "Gather",
        nodeId: node.nodeId,
        mode: "FOCUS" as GatherMode,
        focusMaterialId: node.materials[0].materialId,
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗")
    })

    it("should include XP gain information when present", async () => {
      const state = createWorld("ore-test")
      await executeAction(state, { type: "Enrol", skill: "Mining" })
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

      const log = await executeAction(state, {
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

    it("should include RNG roll outcomes when present", async () => {
      const state = createWorld("ore-test")
      await executeAction(state, { type: "Enrol", skill: "Mining" })
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      // Position player at ore area directly
      state.exploration.playerState.currentAreaId = areaId

      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      if (!node) throw new Error("No node found for test")

      const material = node.materials.find((m) => m.requiredLevel <= 1)
      if (!material) throw new Error("No material found for test")

      const log = await executeAction(state, {
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

    it("should include items gained/lost", async () => {
      const state = createWorld("ore-test")
      await executeAction(state, { type: "Enrol", skill: "Mining" })
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      // Position player at ore area directly
      state.exploration.playerState.currentAreaId = areaId

      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      if (!node) throw new Error("No node found for test")

      const material = node.materials.find((m) => m.requiredLevel <= 1)
      if (!material) throw new Error("No material found for test")

      const log = await executeAction(state, {
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
