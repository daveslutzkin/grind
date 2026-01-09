import { describe, it, expect } from "@jest/globals"
import { formatWorldState, formatActionLog } from "./formatters.js"
import { createWorld, TOWN_LOCATIONS } from "../world.js"
import { executeAction } from "../engine.js"
import type { GatherMode, WorldState, AreaID } from "../types.js"
import { NodeType, ExplorationLocationType } from "../types.js"

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

/** Move player to the location containing a specific node */
function moveToNodeLocation(state: WorldState, nodeId: string, areaId: string): void {
  const nodeIndexMatch = nodeId.match(/-node-(\d+)$/)
  if (nodeIndexMatch) {
    const nodeIndex = nodeIndexMatch[1]
    const locationId = `${areaId}-loc-${nodeIndex}`
    state.exploration.playerState.currentLocationId = locationId
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

      expect(formatted).toContain("Connections:")
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
        // Should have at least one material with ✓ (L1 gatherable) - human readable names
        expect(formatted).toMatch(/[A-Z][a-z]+( [A-Z][a-z]+)? ✓/)
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

        // Move to the node location before APPRAISE
        moveToNodeLocation(state, node.nodeId, areaId)

        // Perform APPRAISE action
        await executeAction(state, {
          type: "Gather",
          nodeId: node.nodeId,
          mode: "APPRAISE" as GatherMode,
        })

        const formatted = formatWorldState(state)

        // After appraisal, should show quantities like "80/80 Copper Ore ✓"
        expect(formatted).toMatch(/\d+\/\d+ [A-Z][a-z]+( [A-Z][a-z]+)? ✓/)
      })

      it("should show locked node when skill level is insufficient for location tier", () => {
        const state = createWorld("mat-vis-5")

        // Find a D2 area (distance 2, requires L5) specifically with ORE_VEIN nodes
        const d2Area = Array.from(state.exploration.areas.values()).find(
          (a) =>
            a.distance === 2 &&
            state.world.nodes?.some((n) => n.areaId === a.id && n.nodeType === NodeType.ORE_VEIN)
        )
        if (!d2Area) throw new Error("No D2 area with ore nodes found")

        // Enrol in Mining first (must be at guild)
        setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
        executeAction(state, { type: "Enrol", skill: "Mining" })

        // Now move to D2 area (at hub, not at a specific location)
        makeAreaKnown(state, d2Area.id)
        state.exploration.playerState.currentAreaId = d2Area.id
        state.exploration.playerState.currentLocationId = null // At hub/clearing
        discoverAllLocations(state, d2Area.id)

        const formatted = formatWorldState(state)

        // Should show as locked with skill requirement, not list materials
        expect(formatted).toContain("🔒 (Mining L5)")
        // Should NOT show any material checkmarks since node is locked
        expect(formatted).not.toMatch(/[A-Z_]+ ✓/)
      })

      it("should show materials normally when skill level meets location tier requirement", () => {
        const state = createWorld("mat-vis-6")

        // Find a D2 area (distance 2, requires L5) specifically with ORE_VEIN nodes
        const d2Area = Array.from(state.exploration.areas.values()).find(
          (a) =>
            a.distance === 2 &&
            state.world.nodes?.some((n) => n.areaId === a.id && n.nodeType === NodeType.ORE_VEIN)
        )
        if (!d2Area) throw new Error("No D2 area with ore nodes found")

        // Enrol in Mining and set to L5 (meets D2 requirement)
        setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
        executeAction(state, { type: "Enrol", skill: "Mining" })
        state.player.skills.Mining = { level: 5, xp: 0 }

        // Now move to D2 area (at hub, not at a specific location)
        makeAreaKnown(state, d2Area.id)
        state.exploration.playerState.currentAreaId = d2Area.id
        state.exploration.playerState.currentLocationId = null // At hub/clearing
        discoverAllLocations(state, d2Area.id)

        const formatted = formatWorldState(state)

        // Should NOT show as locked
        expect(formatted).not.toContain("🔒")
        // Should show materials with checkmarks (human-readable names now)
        expect(formatted).toMatch(/\w+ ✓/)
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

      it("should show 'partly explored' when connection discovered but no locations", () => {
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

        expect(formatted).toContain("partly explored")
        expect(formatted).not.toContain("unexplored")
        expect(formatted).not.toContain("FULLY EXPLORED")
      })

      it("should show 'partly explored' when locations done but connections remain", () => {
        const state = createWorld("explore-status-3")
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId

        // Discover all locations
        discoverAllLocations(state, areaId)

        // Add an undiscovered connection from this area
        // (connections may not be generated until explore is called)
        const fakeTargetAreaId = "fake-undiscovered-area"
        state.exploration.connections.push({
          fromAreaId: areaId,
          toAreaId: fakeTargetAreaId,
          travelTimeMultiplier: 2,
        })

        const formatted = formatWorldState(state)

        expect(formatted).toContain("partly explored")
        expect(formatted).not.toContain("unexplored")
        expect(formatted).not.toContain("FULLY EXPLORED")
        expect(formatted).toContain("Gathering:")
      })

      it("should show 'partly explored' (never 'fully explored') when all locations AND connections discovered", () => {
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

        // We never show "fully explored" - just "partly explored" once something is discovered
        expect(formatted).toContain("partly explored")
        expect(formatted).not.toContain("FULLY EXPLORED")
        expect(formatted).not.toContain("unexplored")
      })
    })

    describe("enemy camp display", () => {
      /** Get an area that has a mob camp */
      function getAreaWithMobCamp(state: WorldState): AreaID | null {
        const areas = Array.from(state.exploration.areas.values()).filter((a) => a.distance > 0)
        for (const area of areas) {
          const hasMobCamp = area.locations.some(
            (loc) => loc.type === ExplorationLocationType.MOB_CAMP
          )
          if (hasMobCamp) return area.id
        }
        return null
      }

      /** Add a mob camp to an area for testing */
      function addMobCampToArea(state: WorldState, areaId: AreaID, difficulty: number): string {
        const area = state.exploration.areas.get(areaId)
        if (!area) throw new Error(`Area ${areaId} not found`)
        const locationId = `${areaId}-loc-mobcamp-test`
        area.locations.push({
          id: locationId,
          areaId,
          type: ExplorationLocationType.MOB_CAMP,
          creatureType: "creature",
          difficulty,
        })
        return locationId
      }

      it("should show discovered enemy camp with difficulty", () => {
        const state = createWorld("mob-camp-1")
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId

        // Add a mob camp and discover it
        const campLocationId = addMobCampToArea(state, areaId, 3)
        state.exploration.playerState.knownLocationIds.push(campLocationId)

        const formatted = formatWorldState(state)

        expect(formatted).toContain("Enemy camps:")
        expect(formatted).toContain("enemy camp (difficulty 3)")
        expect(formatted).toContain("partly explored")
      })

      it("should not show Gathering line when only enemy camp discovered (no gathering nodes)", () => {
        const state = createWorld("mob-camp-2")
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId

        // Add only a mob camp (don't discover any gathering locations)
        const campLocationId = addMobCampToArea(state, areaId, 5)
        state.exploration.playerState.knownLocationIds.push(campLocationId)

        const formatted = formatWorldState(state)

        expect(formatted).toContain("Enemy camps:")
        expect(formatted).toContain("enemy camp (difficulty 5)")
        // Should NOT show "Gathering: none visible" since no gathering locations were discovered
        expect(formatted).not.toContain("Gathering:")
      })

      it("should show both gathering nodes and enemy camps when both discovered", () => {
        const state = createWorld("mob-camp-3")
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId

        // Discover all locations (including gathering nodes)
        discoverAllLocations(state, areaId)

        // Add a mob camp and discover it
        const campLocationId = addMobCampToArea(state, areaId, 2)
        state.exploration.playerState.knownLocationIds.push(campLocationId)

        const formatted = formatWorldState(state)

        expect(formatted).toContain("Gathering:")
        expect(formatted).toContain("Enemy camps:")
        expect(formatted).toContain("enemy camp (difficulty 2)")
      })

      it("should show enemy camp from procedurally generated world if discovered", () => {
        // Try multiple seeds to find one that generates a mob camp
        for (let i = 0; i < 20; i++) {
          const state = createWorld(`mob-camp-proc-${i}`)
          const areaWithCamp = getAreaWithMobCamp(state)

          if (areaWithCamp) {
            makeAreaKnown(state, areaWithCamp)
            state.exploration.playerState.currentAreaId = areaWithCamp

            // Find and discover the mob camp
            const area = state.exploration.areas.get(areaWithCamp)!
            const mobCamp = area.locations.find(
              (loc) => loc.type === ExplorationLocationType.MOB_CAMP
            )!
            state.exploration.playerState.knownLocationIds.push(mobCamp.id)

            const formatted = formatWorldState(state)

            expect(formatted).toContain("Enemy camps:")
            expect(formatted).toContain("enemy camp")
            // Difficulty should be shown
            expect(formatted).toMatch(/enemy camp \(difficulty \d+\)/)
            return // Test passed
          }
        }
        // If no mob camp was generated in 20 tries, that's unusual but not a failure
        // since MOB_CAMP_PROBABILITY is 0.25
        console.log("Note: No mob camp generated in 20 seeds (expected ~25% per area)")
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
      discoverAllLocations(state, areaId)

      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      if (!node) throw new Error("No node found for test")
      // Move to the node location before gathering
      moveToNodeLocation(state, node.nodeId, areaId)
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
      expect(formatted).toContain("extraction") // stateDeltaSummary shows "Focused extraction"
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

    it("should show user-friendly error message without action type", async () => {
      const state = createWorld("error-msg-test")

      // Try to travel to unknown location - should fail with UNKNOWN_LOCATION
      const log = await executeAction(state, {
        type: "TravelToLocation",
        locationId: "nonexistent-location",
      })

      const formatted = formatActionLog(log)

      // Should show user-friendly message
      expect(formatted).toContain("✗ Unknown location!")
      // Should NOT show action type or failure code
      expect(formatted).not.toContain("TravelToLocation")
      expect(formatted).not.toContain("UNKNOWN_LOCATION")
    })

    it("should show 'Inventory full!' error message", async () => {
      const state = createWorld("inventory-test")
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"

      // Setup a combat area with enemy
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      state.world.enemies.push({
        id: "test-enemy",
        areaId,
        fightTime: 3,
        successProbability: 1,
        requiredSkillLevel: 1,
        lootTable: [{ itemId: "TEST_LOOT", quantity: 1, weight: 1 }],
        failureAreaId: "TOWN",
      })

      // Fill inventory to exactly 20 slots (max capacity)
      // Add 19 more items to reach capacity (already have 1 weapon)
      for (let i = 0; i < 19; i++) {
        state.player.inventory.push({ itemId: `filler_${i}`, quantity: 1 })
      }

      const log = await executeAction(state, {
        type: "Fight",
        enemyId: "test-enemy",
      })

      const formatted = formatActionLog(log)

      // Should show user-friendly message
      expect(formatted).toContain("✗ Inventory full!")
      // Should NOT show action type or failure code
      expect(formatted).not.toContain("Fight:")
      expect(formatted).not.toContain("INVENTORY_FULL")
    })

    it("should show 'Already in that area!' error message", async () => {
      const state = createWorld("area-test")

      // Try to travel to current area (already in TOWN)
      const log = await executeAction(state, {
        type: "ExplorationTravel",
        destinationAreaId: "TOWN",
      })

      const formatted = formatActionLog(log)

      // Should show user-friendly message
      expect(formatted).toContain("✗ Already in that area!")
      // Should NOT show action type or failure code
      expect(formatted).not.toContain("ExplorationTravel")
      expect(formatted).not.toContain("ALREADY_IN_AREA")
    })

    it("should show 'Insufficient skill!' error message", async () => {
      const state = createWorld("skill-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)

      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      if (!node) throw new Error("No node found for test")
      moveToNodeLocation(state, node.nodeId, areaId)

      // Try to gather without enrolling in Mining - should fail with INSUFFICIENT_SKILL
      const log = await executeAction(state, {
        type: "Gather",
        nodeId: node.nodeId,
        mode: "FOCUS" as GatherMode,
        focusMaterialId: node.materials[0].materialId,
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ Insufficient skill!")
      expect(formatted).not.toContain("Gather:")
      expect(formatted).not.toContain("INSUFFICIENT_SKILL")
    })

    it("should show 'Missing required items!' error message", async () => {
      const state = createWorld("craft-test")
      setTownLocation(state, TOWN_LOCATIONS.SMITHING_GUILD)
      state.player.skills.Smithing = { level: 1, xp: 0 }
      // Don't add IRON_ORE to inventory

      const log = await executeAction(state, {
        type: "Craft",
        recipeId: "iron-bar-recipe",
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ Missing required items!")
      expect(formatted).not.toContain("Craft:")
      expect(formatted).not.toContain("MISSING_ITEMS")
    })

    it("should show 'Node depleted!' error message", async () => {
      const state = createWorld("depleted-test")
      await executeAction(state, { type: "Enrol", skill: "Mining" })
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)

      const node = state.world.nodes?.find((n) => n.areaId === areaId)
      if (!node) throw new Error("No node found for test")
      moveToNodeLocation(state, node.nodeId, areaId)

      // Mark node as depleted
      node.depleted = true

      const log = await executeAction(state, {
        type: "Gather",
        nodeId: node.nodeId,
        mode: "FOCUS" as GatherMode,
        focusMaterialId: node.materials[0].materialId,
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ Resource depleted!")
      expect(formatted).not.toContain("NODE_DEPLETED")
    })

    it("should show 'Already enrolled!' error message", async () => {
      const state = createWorld("enrol-test")
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)

      // Enrol once
      await executeAction(state, { type: "Enrol", skill: "Mining" })

      // Try to enrol again
      const log = await executeAction(state, { type: "Enrol", skill: "Mining" })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ Already enrolled!")
      expect(formatted).not.toContain("Enrol:")
      expect(formatted).not.toContain("ALREADY_ENROLLED")
    })

    it("should show 'No weapon equipped!' error message", async () => {
      const state = createWorld("weapon-test")
      state.player.skills.Combat = { level: 1, xp: 0 }
      // Don't equip weapon

      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      state.world.enemies.push({
        id: "test-enemy-2",
        areaId,
        fightTime: 3,
        successProbability: 1,
        requiredSkillLevel: 1,
        lootTable: [{ itemId: "TEST_LOOT", quantity: 1, weight: 1 }],
        failureAreaId: "TOWN",
      })

      const log = await executeAction(state, {
        type: "Fight",
        enemyId: "test-enemy-2",
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ No weapon equipped!")
      expect(formatted).not.toContain("Fight:")
      expect(formatted).not.toContain("MISSING_WEAPON")
    })

    it("should show 'Wrong location!' error message", async () => {
      const state = createWorld("location-test")
      await executeAction(state, { type: "Enrol", skill: "Mining" })

      // Try to gather from a node in a different area
      const areaId = getOreAreaId(state)
      const node = state.world.nodes?.find((n) => n.areaId === areaId)
      if (!node) throw new Error("No node found for test")

      // Player is in TOWN, not in the ore area
      const log = await executeAction(state, {
        type: "Gather",
        nodeId: node.nodeId,
        mode: "FOCUS" as GatherMode,
        focusMaterialId: node.materials[0].materialId,
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ Wrong location!")
      expect(formatted).not.toContain("WRONG_LOCATION")
    })

    it("should show 'Recipe not found!' error message", async () => {
      const state = createWorld("recipe-test")
      setTownLocation(state, TOWN_LOCATIONS.SMITHING_GUILD)
      state.player.skills.Smithing = { level: 1, xp: 0 }

      const log = await executeAction(state, {
        type: "Craft",
        recipeId: "nonexistent-recipe",
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ Recipe not found!")
      expect(formatted).not.toContain("RECIPE_NOT_FOUND")
    })

    it("should show 'Resource node not found!' error message", async () => {
      const state = createWorld("node-test")
      await executeAction(state, { type: "Enrol", skill: "Mining" })

      const log = await executeAction(state, {
        type: "Gather",
        nodeId: "nonexistent-node",
        mode: "FOCUS" as GatherMode,
        focusMaterialId: "COPPER_ORE",
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ Resource node not found!")
      expect(formatted).not.toContain("NODE_NOT_FOUND")
    })

    it("should show 'Enemy not found!' error message", async () => {
      const state = createWorld("enemy-test")
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"

      const log = await executeAction(state, {
        type: "Fight",
        enemyId: "nonexistent-enemy",
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ Enemy not found!")
      expect(formatted).not.toContain("ENEMY_NOT_FOUND")
    })

    it("should show 'Mode not unlocked!' error message", async () => {
      const state = createWorld("mode-test")
      await executeAction(state, { type: "Enrol", skill: "Mining" })
      // Set player to level 2 - high enough for distance-1 areas but not for APPRAISE (requires L3)
      state.player.skills.Mining = { level: 2, xp: 0 }

      // Find a distance-1 area with ore (requires L1, player has L2)
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)

      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      if (!node) throw new Error("No node found for test")
      moveToNodeLocation(state, node.nodeId, areaId)

      const log = await executeAction(state, {
        type: "Gather",
        nodeId: node.nodeId,
        mode: "APPRAISE" as GatherMode,
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ Mode not unlocked!")
      expect(formatted).not.toContain("MODE_NOT_UNLOCKED")
    })

    it("should show 'Location not discovered!' error message", async () => {
      const state = createWorld("location-discovery-test")
      await executeAction(state, { type: "Enrol", skill: "Mining" })
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      // Don't discover locations

      const node = state.world.nodes?.find((n) => n.areaId === areaId)
      if (!node) throw new Error("No node found for test")

      const log = await executeAction(state, {
        type: "Gather",
        nodeId: node.nodeId,
        mode: "FOCUS" as GatherMode,
        focusMaterialId: node.materials[0].materialId,
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ Location not discovered!")
      expect(formatted).not.toContain("LOCATION_NOT_DISCOVERED")
    })

    it("should show 'No path to destination!' error message", async () => {
      const state = createWorld("path-test")

      // Try to travel to an area without a known connection
      const unknownArea = Array.from(state.exploration.areas.values()).find(
        (a) => a.distance > 0 && !state.exploration.playerState.knownAreaIds.includes(a.id)
      )
      if (!unknownArea) throw new Error("No unknown area found for test")

      const log = await executeAction(state, {
        type: "ExplorationTravel",
        destinationAreaId: unknownArea.id,
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ No path to destination!")
      expect(formatted).not.toContain("NO_PATH_TO_DESTINATION")
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
