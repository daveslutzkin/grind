import { describe, it, expect } from "@jest/globals"
import { formatWorldState, formatActionLog, formatTickFeedback } from "./formatters.js"
import { createWorld, TOWN_LOCATIONS } from "../world.js"
import { executeAction } from "../engine.js"
import { refreshMiningContracts } from "../contracts.js"
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

    it("should show player gold when non-zero", () => {
      const state = createWorld("gold-display-test")
      state.player.gold = 12.5
      const formatted = formatWorldState(state)

      expect(formatted).toContain("Gold: 12.5")
    })

    it("should round gold to 1 decimal place", () => {
      const state = createWorld("gold-rounding-test")
      state.player.gold = 1.39051475
      const formatted = formatWorldState(state)

      expect(formatted).toContain("Gold: 1.4")
      expect(formatted).not.toContain("Gold: 1.39")
    })

    it("should not show gold when zero", () => {
      const state = createWorld("gold-zero-test")
      state.player.gold = 0
      const formatted = formatWorldState(state)

      expect(formatted).not.toContain("Gold:")
    })

    it("should show gold reward for mining contracts", () => {
      const state = createWorld("contract-display-test")
      state.player.skills.Mining = { level: 10, xp: 0 }

      // Refresh contracts
      refreshMiningContracts(state)

      // Position player at miners guild
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)

      const formatted = formatWorldState(state)

      // Should show gold reward instead of empty rewards
      expect(formatted).toContain("Contracts:")
      expect(formatted).toMatch(/\d+(\.\d+)? gold/)
      expect(formatted).not.toContain(" → ,") // Should not have empty arrow
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
        expect(formatted).toContain("Gathering:")
        expect(formatted).toContain("  Ore vein")
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
        await executeAction(state, { type: "Enrol" })
        state.exploration.playerState.currentAreaId = areaId

        const formatted = formatWorldState(state)

        // Should show node type and materials on same line with dash separator
        expect(formatted).toContain("Gathering:")
        expect(formatted).toContain("  Ore vein -")
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
        await executeAction(state, { type: "Enrol" })
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

      it("should show quantities after APPRAISE with mastery", async () => {
        const state = createWorld("mat-vis-4")
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId
        discoverAllLocations(state, areaId)

        // Enrol in Mining and level up to L6 for APPRAISE mastery on STONE
        setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
        await executeAction(state, { type: "Enrol" })
        state.player.skills.Mining = { level: 6, xp: 0 } // L6 = STONE M6 (Appraise)
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

        // After appraisal with L6, STONE should show quantities like "80/80 Stone ✓"
        expect(formatted).toMatch(/\d+\/\d+ [A-Z][a-z]+( [A-Z][a-z]+)? ✓/)
      })

      it("should show ???/??? for materials without Appraise mastery", async () => {
        const state = createWorld("mat-vis-no-mastery")
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId
        discoverAllLocations(state, areaId)

        // Mining L3 can use APPRAISE mode but doesn't have M6 Appraise for any material
        state.player.skills.Mining = { level: 3, xp: 0 }
        state.exploration.playerState.currentAreaId = areaId

        // Find a node and appraise it
        const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
        if (!node) throw new Error("No node found for test")

        // Move to the node location before APPRAISE
        moveToNodeLocation(state, node.nodeId, areaId)

        // Perform APPRAISE action
        const log = await executeAction(state, {
          type: "Gather",
          nodeId: node.nodeId,
          mode: "APPRAISE" as GatherMode,
        })

        // Format the action log with state to test formatter
        const formatted = formatActionLog(log, state)

        // Should show ???/??? for materials without Appraise mastery
        expect(formatted).toContain("???/???")
      })
    })

    describe("wilderness exploration status", () => {
      it("should show 'unexplored' when nothing discovered in area", () => {
        const state = createWorld("explore-status-1")
        state.player.skills.Exploration = { level: 1, xp: 0 } // Need Exploration skill to see status
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId
        // No locations or connections from this area discovered
        const formatted = formatWorldState(state)

        expect(formatted).toContain("Unexplored")
        expect(formatted).not.toContain("Fully explored")
        expect(formatted).not.toContain("Gathering:")
      })

      it("should show 'unexplored' when only one connection is discovered", () => {
        const state = createWorld("explore-status-2")
        state.player.skills.Exploration = { level: 1, xp: 0 } // Need Exploration skill to see status
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

        expect(formatted).toContain("Unexplored")
        expect(formatted).not.toContain("Partly explored")
        expect(formatted).not.toContain("Fully explored")
      })

      it("should show 'partly explored' when locations done but unknown-area connections remain", () => {
        const state = createWorld("explore-status-3")
        state.player.skills.Exploration = { level: 1, xp: 0 } // Need Exploration skill to see status
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId

        // Discover all locations
        discoverAllLocations(state, areaId)

        // Add an undiscovered connection from this area to an UNKNOWN area
        // Unknown-area connections can still be discovered via explore, so they count
        const fakeTargetAreaId = "fake-undiscovered-area"
        state.exploration.connections.push({
          fromAreaId: areaId,
          toAreaId: fakeTargetAreaId,
          travelTimeMultiplier: 2,
        })

        const formatted = formatWorldState(state)

        // Should show "partly explored" because there's still an unknown-area connection to discover
        expect(formatted).toContain("Partly explored")
        expect(formatted).not.toContain("Unexplored")
        expect(formatted).not.toContain("Fully explored")
        expect(formatted).toContain("Gathering:")
      })

      it("should show 'fully explored' when all locations AND connections discovered", () => {
        const state = createWorld("explore-status-4")
        state.player.skills.Exploration = { level: 1, xp: 0 } // Need Exploration skill to see status
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

        // Should show "fully explored" when all locations and known-area connections are discovered
        expect(formatted).toContain("Fully explored")
        expect(formatted).not.toContain("Partly explored")
        expect(formatted).not.toContain("Unexplored")
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
        state.player.skills.Exploration = { level: 1, xp: 0 } // Need Exploration skill to see status
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId

        // Add a mob camp and discover it
        const campLocationId = addMobCampToArea(state, areaId, 3)
        state.exploration.playerState.knownLocationIds.push(campLocationId)

        const formatted = formatWorldState(state)

        expect(formatted).toContain("Enemy camps:")
        expect(formatted).toContain("enemy camp (difficulty 3)")
        expect(formatted).toContain("Partly explored")
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

      it("should show creature type and difficulty when at enemy camp location", () => {
        const state = createWorld("mob-camp-at-location")
        const areaId = getOreAreaId(state)
        makeAreaKnown(state, areaId)
        state.exploration.playerState.currentAreaId = areaId

        // Add a mob camp and discover it
        const campLocationId = addMobCampToArea(state, areaId, 5)
        state.exploration.playerState.knownLocationIds.push(campLocationId)

        // Move player TO the camp location
        state.exploration.playerState.currentLocationId = campLocationId

        const formatted = formatWorldState(state)

        // Should show enemy camp details
        expect(formatted).toContain("Enemy camp: creature")
        expect(formatted).toContain("Difficulty: 5")
        // Should show available actions section with leave (fight not available - combat not implemented)
        expect(formatted).toContain("Available actions:")
        expect(formatted).toContain("- leave (1t)")

        // Should NOT show the general area information (connections, etc) when at camp
        expect(formatted).not.toContain("Connections:")
      })
    })

    it("should show 'varies' for variable actions with timeCost 0", async () => {
      const state = createWorld("test-seed")
      state.player.skills.Exploration = { level: 1, xp: 0 }

      // Discover some distance 1 areas
      const explorationGuild = TOWN_LOCATIONS.EXPLORERS_GUILD
      setTownLocation(state, explorationGuild)
      await executeAction(state, { type: "Enrol" })

      // Get the exploration guild benefit to discover an area
      const area = state.exploration.areas.get("TOWN")
      if (area) {
        const location = area.locations.find((l) => l.id === explorationGuild)
        if (location && location.type === ExplorationLocationType.GUILD_HALL) {
          const explorationSkill = state.player.skills.Exploration
          if (explorationSkill) {
            location.guildLevel = explorationSkill.level
          }
        }
      }

      // Move to a wilderness area hub with no locations discovered
      const wildernessAreaId = state.exploration.playerState.knownAreaIds.find(
        (id) => id !== "TOWN"
      )
      if (wildernessAreaId) {
        state.exploration.playerState.currentAreaId = wildernessAreaId
        state.exploration.playerState.currentLocationId = null

        // Remove all location IDs from known list for this area
        const area = state.exploration.areas.get(wildernessAreaId)
        if (area && area.locations) {
          state.exploration.playerState.knownLocationIds =
            state.exploration.playerState.knownLocationIds.filter(
              (id) => !id.startsWith(wildernessAreaId)
            )
        }

        const formatted = formatWorldState(state)

        // Should show "go <area> (varies)" not "go <area> (~0t, varies)"
        expect(formatted).toContain("Available actions:")
        expect(formatted).toContain("- go <area> (varies)")
        expect(formatted).not.toContain("~0t")
      }
    })
  })

  describe("formatActionLog", () => {
    it("should show gold earned in contract completion for mining contracts", () => {
      const state = createWorld("gold-completion-test")
      state.player.skills.Mining = { level: 10, xp: 0 }
      refreshMiningContracts(state)

      // Find the at-level contract
      const contract = state.world.contracts.find(
        (c) => c.guildType === "Mining" && c.slot === "at-level"
      )
      expect(contract).toBeDefined()
      const goldReward = contract!.goldReward ?? 0

      // Create a mock action log with contract completion
      const mockLog = {
        tickBefore: 0,
        success: true,
        actionType: "Gather" as const,
        parameters: {},
        timeConsumed: 10,
        stateDeltaSummary: "Mining contract completed",
        contractsCompleted: [
          {
            contractId: contract!.id,
            itemsConsumed: [{ itemId: "STONE", quantity: 5 }],
            rewardsGranted: [],
            reputationGained: 5,
            goldEarned: goldReward,
          },
        ],
        rngRolls: [],
      }

      const formatted = formatActionLog(mockLog)

      expect(formatted).toContain("CONTRACT DONE")
      expect(formatted).toMatch(/\d+(\.\d+)? gold/)
    })

    it("should format successful action log", async () => {
      const state = createWorld("ore-test")
      // Enrol in Mining first (must be at guild)
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
      await executeAction(state, { type: "Enrol" })
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

    it.skip("should show 'Inventory full!' error message (combat not yet implemented)", async () => {
      const state = createWorld("inventory-test")
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"

      // Setup a combat area
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      // NOTE: Enemies not yet implemented - this test is skipped

      // Fill inventory to exactly 20 slots (max capacity)
      // Add 19 more items to reach capacity (already have 1 weapon)
      for (let i = 0; i < 19; i++) {
        state.player.inventory.push({ itemId: `filler_${i}`, quantity: 1 })
      }

      const log = await executeAction(state, {
        type: "Fight",
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

      // Try to gather without enrolling in Mining - should fail with NOT_ENROLLED
      const log = await executeAction(state, {
        type: "Gather",
        nodeId: node.nodeId,
        mode: "FOCUS" as GatherMode,
        focusMaterialId: node.materials[0].materialId,
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ Not enrolled in guild!")
      expect(formatted).not.toContain("Gather:")
      expect(formatted).not.toContain("NOT_ENROLLED")
    })

    it("should show 'Missing required items!' error message", async () => {
      const state = createWorld("craft-test")
      setTownLocation(state, TOWN_LOCATIONS.SMITHING_GUILD)
      state.player.skills.Smithing = { level: 1, xp: 0 }
      // Don't add IRON_ORE to inventory

      const log = await executeAction(state, {
        type: "Craft",
        recipeId: "iron-bar",
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ Missing required items!")
      expect(formatted).not.toContain("Craft:")
      expect(formatted).not.toContain("MISSING_ITEMS")
    })

    it("should show 'Node depleted!' error message", async () => {
      const state = createWorld("depleted-test")
      await executeAction(state, { type: "Enrol" })
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
      await executeAction(state, { type: "Enrol" })

      // Try to enrol again
      const log = await executeAction(state, { type: "Enrol" })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ Already enrolled!")
      expect(formatted).not.toContain("Enrol:")
      expect(formatted).not.toContain("ALREADY_ENROLLED")
    })

    it.skip("should show 'No weapon equipped!' error message (combat not yet implemented)", async () => {
      const state = createWorld("weapon-test")
      state.player.skills.Combat = { level: 1, xp: 0 }
      // Don't equip weapon

      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      // NOTE: Enemies not yet implemented - this test is skipped

      const log = await executeAction(state, {
        type: "Fight",
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ No weapon equipped!")
      expect(formatted).not.toContain("Fight:")
      expect(formatted).not.toContain("MISSING_WEAPON")
    })

    it("should show 'Wrong location!' error message", async () => {
      const state = createWorld("location-test")
      await executeAction(state, { type: "Enrol" })

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
      await executeAction(state, { type: "Enrol" })

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
      })

      const formatted = formatActionLog(log)

      expect(formatted).toContain("✗ Enemy not found!")
      expect(formatted).not.toContain("ENEMY_NOT_FOUND")
    })

    it("should show 'Mode not unlocked!' error message", async () => {
      const state = createWorld("mode-test")
      await executeAction(state, { type: "Enrol" })
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
      await executeAction(state, { type: "Enrol" })
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
      await executeAction(state, { type: "Enrol" })
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
      await executeAction(state, { type: "Enrol" })
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
      await executeAction(state, { type: "Enrol" })
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

    it("should always show Time line when variance data is present, even with zero luck", () => {
      // Item 3: Always show Time line in extraction results
      const mockLog = {
        tickBefore: 0,
        success: true,
        actionType: "Gather" as const,
        parameters: {},
        timeConsumed: 20,
        stateDeltaSummary: "Focused extraction of STONE",
        extraction: {
          mode: "FOCUS" as GatherMode,
          focusMaterial: "STONE",
          extracted: [{ itemId: "STONE", quantity: 1 }],
          focusWaste: 0,
          collateralDamage: {},
          variance: {
            expected: 20,
            actual: 20,
            range: [0, 0] as [number, number],
            luckDelta: 0, // Zero luck - should still show Time line
          },
        },
        rngRolls: [],
      }

      const formatted = formatActionLog(mockLog)

      // Should show Time line even when luckDelta is 0
      expect(formatted).toContain("Time: 20 ticks (20 base, 0 luck)")
    })

    it("should show message about undiscovered materials when invisible collateral exists", () => {
      // Item 4: Show collateral damage for undiscovered materials
      const state = createWorld("collateral-test")
      // Player has Mining L1, can see STONE (L1) but not IRON_ORE (L5 requires L3+ to see)
      state.player.skills.Mining = { level: 1, xp: 0 }

      // Add a node with materials at different levels so isMaterialVisible can check them
      state.world.nodes = [
        {
          nodeId: "test-node",
          nodeType: NodeType.ORE_VEIN,
          areaId: "area-d1-i0",
          depleted: false,
          materials: [
            {
              materialId: "STONE",
              remainingUnits: 100,
              maxUnitsInitial: 100,
              requiresSkill: "Mining",
              requiredLevel: 1, // Visible at L1
              tier: 1,
            },
            {
              materialId: "IRON_ORE",
              remainingUnits: 50,
              maxUnitsInitial: 50,
              requiresSkill: "Mining",
              requiredLevel: 5, // Requires L3+ to see (L+2 visibility rule)
              tier: 3,
            },
          ],
        },
      ]

      const mockLog = {
        tickBefore: 0,
        success: true,
        actionType: "Gather" as const,
        parameters: {},
        timeConsumed: 20,
        stateDeltaSummary: "Focused extraction of STONE",
        extraction: {
          mode: "FOCUS" as GatherMode,
          focusMaterial: "STONE",
          extracted: [{ itemId: "STONE", quantity: 1 }],
          focusWaste: 0,
          collateralDamage: {
            STONE: 2, // Visible at L1
            IRON_ORE: 1, // Not visible at L1 (requires L5, visibility max is L+2=3)
          },
          variance: {
            expected: 20,
            actual: 20,
            range: [0, 0] as [number, number],
            luckDelta: 0,
          },
        },
        rngRolls: [],
      }

      const formatted = formatActionLog(mockLog, state)

      // Should show visible collateral
      expect(formatted).toContain("-2 STONE")
      // Should indicate undiscovered materials had collateral
      expect(formatted).toContain("undiscovered materials")
    })

    it("should show only undiscovered materials message when no visible collateral", () => {
      // Item 4: When collateral is only for undiscovered materials
      const state = createWorld("collateral-invisible-test")
      // Player has Mining L1, but all collateral materials require higher levels
      state.player.skills.Mining = { level: 1, xp: 0 }

      // Add a node with a high-level material that won't be visible at L1
      state.world.nodes = [
        {
          nodeId: "test-node",
          nodeType: NodeType.ORE_VEIN,
          areaId: "area-d1-i0",
          depleted: false,
          materials: [
            {
              materialId: "MITHRIL_ORE",
              remainingUnits: 30,
              maxUnitsInitial: 30,
              requiresSkill: "Mining",
              requiredLevel: 10, // Not visible at L1 (max visible is L1+2=3)
              tier: 5,
            },
          ],
        },
      ]

      const mockLog = {
        tickBefore: 0,
        success: true,
        actionType: "Gather" as const,
        parameters: {},
        timeConsumed: 20,
        stateDeltaSummary: "Careful extraction",
        extraction: {
          mode: "CAREFUL_ALL" as GatherMode,
          extracted: [{ itemId: "STONE", quantity: 1 }],
          focusWaste: 0,
          collateralDamage: {
            MITHRIL_ORE: 1, // Not visible at L1 (requires L10)
          },
          variance: {
            expected: 20,
            actual: 20,
            range: [0, 0] as [number, number],
            luckDelta: 0,
          },
        },
        rngRolls: [],
      }

      const formatted = formatActionLog(mockLog, state)

      // Should indicate undiscovered materials had collateral on the Gained line
      expect(formatted).toContain(
        "Gained: +1 STONE (some collateral loss of undiscovered materials)"
      )
    })

    it("should show XP progress with percentage when state is provided", async () => {
      const state = createWorld("xp-test")
      // Join Explorers Guild to start gaining XP
      setTownLocation(state, TOWN_LOCATIONS.EXPLORERS_GUILD)
      await executeAction(state, { type: "Enrol" })

      // Survey to discover an area and gain XP
      const log = await executeAction(state, { type: "Survey" })
      const formatted = formatActionLog(log, state)

      if (log.skillGained) {
        // Should show XP progress with format: "+N XP (X to next level, Y% there)"
        expect(formatted).toMatch(/\+\d+ Exploration XP \(\d+ to next level, \d+% there\)/)
      }
    })

    it("should use exploration XP thresholds for Mining skill display", async () => {
      // Bug: formatters.ts was using N² thresholds for Mining, but Mining uses
      // exploration thresholds (25 XP for L1→L2). This caused negative "to next level"
      // values and percentages over 100%.
      const state = createWorld("mining-xp-threshold-test")

      // Join Miners Guild
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
      await executeAction(state, { type: "Enrol" })

      // Set Mining to level 1 with 20 XP (80% of the 25 XP threshold)
      // With N² threshold (buggy): would be 20/4 = 500% and -16 remaining
      // With exploration threshold (correct): 20/25 = 80% and 5 remaining
      state.player.skills.Mining = { level: 1, xp: 20 }

      // Create a mock action log for mining
      const mockLog = {
        tickBefore: 0,
        success: true,
        actionType: "Gather" as const,
        parameters: {},
        timeConsumed: 20,
        skillGained: { skill: "Mining" as const, amount: 1 },
        rngRolls: [],
        stateDeltaSummary: "Extracted resources",
      }

      const formatted = formatActionLog(mockLog, state)

      // Should show correct remaining (5 to next level) not negative
      // and correct percentage (80%) not over 100%
      // With 20 XP and 25 threshold: remaining = 25-20 = 5, percent = 20/25 = 80%
      expect(formatted).toContain("Mining XP")
      expect(formatted).toMatch(/\(5 to next level, 80% there\)/)
      // Ensure we're not showing buggy negative values or percentages over 100
      expect(formatted).not.toMatch(/-\d+ to next level/)
      expect(formatted).not.toMatch(/1\d\d% there/) // No 100%+ percentages
    })

    it("should show connection travel time for discovered connections", async () => {
      const state = createWorld("connection-test")
      setTownLocation(state, TOWN_LOCATIONS.EXPLORERS_GUILD)
      await executeAction(state, { type: "Enrol" })

      // First discover an area via Survey
      await executeAction(state, { type: "Survey" })

      // Now explore to find a known connection
      const log = await executeAction(state, { type: "Explore" })
      const formatted = formatActionLog(log, state)

      if (
        log.explorationLog?.discoveredConnectionId &&
        !log.explorationLog.connectionToUnknownArea
      ) {
        // Should show travel time with format: "connection to X (Nt travel time)"
        expect(formatted).toMatch(/connection to .+ \(\d+t travel time\)/)
      }
    })

    it("should show RNG percentile for exploration discoveries", async () => {
      const state = createWorld("rng-test")
      setTownLocation(state, TOWN_LOCATIONS.EXPLORERS_GUILD)
      await executeAction(state, { type: "Enrol" })

      // Explore to discover something
      const log = await executeAction(state, { type: "Explore" })
      const formatted = formatActionLog(log, state)

      if (log.explorationLog?.luckInfo) {
        // Should show percentile with format: "RNG: <label> (N% percentile) - took Nt, Nt faster/slower than expected"
        expect(formatted).toMatch(
          /RNG: .+ \(\d+% percentile\) - took \d+t, \d+t (faster|slower) than expected/
        )
      }
    })
  })

  describe("formatTickFeedback", () => {
    it("should show ticks elapsed for discovered items", () => {
      const feedback = {
        discovered: {
          type: "connection" as const,
          name: "connection to Town",
          id: "test-id",
        },
      }

      const result = formatTickFeedback(feedback, 6)
      expect(result).toBe("*found after 5 ticks*")
    })

    it("should show damage feedback", () => {
      const feedback = {
        damage: {
          target: "enemy" as const,
          amount: 10,
          enemyHpRemaining: 20,
        },
      }

      const result = formatTickFeedback(feedback, 1)
      expect(result).toBe("(-10 enemy, 20 HP left)")
    })

    it("should show gathered items", () => {
      const feedback = {
        gathered: {
          itemId: "copper_ore",
          quantity: 3,
        },
      }

      const result = formatTickFeedback(feedback, 2)
      expect(result).toBe("(+3 copper_ore)")
    })
  })
})
