import { getAvailableActions, type AvailableAction } from "./availableActions.js"
import { createWorld, TOWN_LOCATIONS } from "./world.js"
import type { WorldState } from "./types.js"
import { ExplorationLocationType, NodeType } from "./types.js"
import { grantExplorationGuildBenefits } from "./exploration.js"

/**
 * Helper to find an action by display name pattern
 */
function findAction(actions: AvailableAction[], pattern: string): AvailableAction | undefined {
  return actions.find((a) => a.displayName.includes(pattern))
}

/**
 * Helper to check if an action exists
 */
function hasAction(actions: AvailableAction[], pattern: string): boolean {
  return findAction(actions, pattern) !== undefined
}

describe("getAvailableActions", () => {
  describe("At guild hall", () => {
    it("should include enrol when at a guild hall with unenrolled skill", () => {
      const state = createWorld("test-seed")
      // Go to Miners Guild
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

      const actions = getAvailableActions(state)
      const enrolAction = findAction(actions, "enrol")

      expect(enrolAction).toBeDefined()
      expect(enrolAction?.timeCost).toBe(3)
      expect(enrolAction?.isVariable).toBe(false)
      expect(enrolAction?.successProbability).toBe(1)
    })

    it("should NOT include enrol when already enrolled in the skill", () => {
      const state = createWorld("test-seed")
      // Go to Miners Guild
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD
      // Already enrolled
      state.player.skills.Mining = { level: 1, xp: 0 }

      const actions = getAvailableActions(state)

      expect(hasAction(actions, "enrol")).toBe(false)
    })

    it("should include leave when at a guild hall", () => {
      const state = createWorld("test-seed")
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

      const actions = getAvailableActions(state)
      const leaveAction = findAction(actions, "leave")

      expect(leaveAction).toBeDefined()
      // In town, leave is 0t
      expect(leaveAction?.timeCost).toBe(0)
    })
  })

  describe("At gathering node", () => {
    let state: WorldState

    beforeEach(async () => {
      state = createWorld("test-seed-for-nodes")
      // Enrol in Mining and Exploration
      state.player.skills.Mining = { level: 1, xp: 0 }
      state.player.skills.Exploration = { level: 1, xp: 0 }

      // Get an exploration guild benefit to discover a distance 1 area
      await grantExplorationGuildBenefits(state)

      // Find a known area with a gathering node
      const knownAreaIds = state.exploration.playerState.knownAreaIds
      let foundNode = false

      for (const areaId of knownAreaIds) {
        if (areaId === "TOWN") continue
        const area = state.exploration.areas.get(areaId)
        if (!area) continue

        // Check if this area has any nodes
        const nodesInArea = state.world.nodes?.filter((n) => n.areaId === areaId) ?? []
        for (const node of nodesInArea) {
          const match = node.nodeId.match(/-node-(\d+)$/)
          if (!match) continue

          const locationId = `${areaId}-loc-${match[1]}`
          // Discover the location
          if (!state.exploration.playerState.knownLocationIds.includes(locationId)) {
            state.exploration.playerState.knownLocationIds.push(locationId)
          }

          // Move to this area and location
          state.exploration.playerState.currentAreaId = areaId
          state.exploration.playerState.currentLocationId = locationId
          foundNode = true
          break
        }
        if (foundNode) break
      }

      // If no node found in discovered areas, manually create a test scenario
      if (!foundNode) {
        // Create a simple test node in area-d1-i0
        const areaId = "area-d1-i0"
        const locationId = `${areaId}-loc-0`
        const testLocation = {
          id: locationId,
          areaId,
          type: ExplorationLocationType.GATHERING_NODE,
          gatheringSkillType: "Mining" as const,
        }

        // Ensure area exists with the location
        let area = state.exploration.areas.get(areaId)
        if (!area) {
          area = {
            id: areaId,
            distance: 1,
            generated: true,
            locations: [testLocation],
            indexInDistance: 0,
          }
          state.exploration.areas.set(areaId, area)
        } else {
          // Area exists but may have empty locations - add the test location
          const existingLoc = area.locations.find((loc) => loc.id === locationId)
          if (!existingLoc) {
            area.locations.push(testLocation)
          }
        }

        // Ensure node exists with STONE (available at L1 mastery)
        const existingNode = state.world.nodes?.find((n) => n.areaId === areaId)
        if (!existingNode) {
          state.world.nodes = state.world.nodes ?? []
          state.world.nodes.push({
            nodeId: `${areaId}-node-0`,
            nodeType: NodeType.ORE_VEIN,
            areaId,
            materials: [
              {
                materialId: "STONE",
                remainingUnits: 50,
                maxUnitsInitial: 50,
                requiresSkill: "Mining",
                requiredLevel: 1,
                tier: 1,
              },
            ],
            depleted: false,
          })
        }

        // Discover the location and move there
        if (!state.exploration.playerState.knownLocationIds.includes(locationId)) {
          state.exploration.playerState.knownLocationIds.push(locationId)
        }
        if (!state.exploration.playerState.knownAreaIds.includes(areaId)) {
          state.exploration.playerState.knownAreaIds.push(areaId)
        }
        state.exploration.playerState.currentAreaId = areaId
        state.exploration.playerState.currentLocationId = locationId
      }
    })

    it("should include gather modes for player skill level", () => {
      const actions = getAvailableActions(state)

      // At Mining L1, should have FOCUS mode available (with placeholder)
      expect(hasAction(actions, "mine focus <resource>")).toBe(true)

      // Should NOT have APPRAISE at L1 (requires L3)
      expect(hasAction(actions, "mine appraise")).toBe(false)

      // Should NOT have CAREFUL_ALL at L1 (requires L16 for STONE M16 Careful)
      expect(hasAction(actions, "mine careful_all")).toBe(false)
    })

    it("should include leave action at gathering node", () => {
      const actions = getAvailableActions(state)
      const leaveAction = findAction(actions, "leave")

      expect(leaveAction).toBeDefined()
      // In wilderness, leave is 1t
      expect(leaveAction?.timeCost).toBe(1)
    })

    it("should have correct time cost for FOCUS mode", () => {
      const actions = getAvailableActions(state)
      const focusAction = findAction(actions, "mine focus <resource>")

      expect(focusAction).toBeDefined()
      // Now mastery-based: L1 STONE = 20 ticks (base speed)
      expect(focusAction?.timeCost).toBe(20)
      expect(focusAction?.isVariable).toBe(false)
    })

    it("should unlock APPRAISE at higher skill level", () => {
      // Level up to L3
      state.player.skills.Mining = { level: 3, xp: 0 }

      const actions = getAvailableActions(state)

      expect(hasAction(actions, "mine appraise")).toBe(true)

      const appraiseAction = findAction(actions, "mine appraise")
      expect(appraiseAction?.timeCost).toBe(1)
    })

    it("should unlock CAREFUL_ALL at skill level 16 (STONE M16 Careful)", () => {
      state.player.skills.Mining = { level: 16, xp: 0 }

      const actions = getAvailableActions(state)

      expect(hasAction(actions, "mine careful_all")).toBe(true)

      const carefulAction = findAction(actions, "mine careful_all")
      // Now mastery-based: L16 STONE = M16 → Speed_II (M9) = 10 ticks base * 2 = 20 ticks
      expect(carefulAction?.timeCost).toBe(20)
    })
  })

  describe("At hub with discovered areas", () => {
    it("should include fartravel for known reachable areas", async () => {
      const state = createWorld("test-seed")
      state.player.skills.Exploration = { level: 1, xp: 0 }

      // Discover a distance 1 area
      await grantExplorationGuildBenefits(state)

      // Stay at TOWN hub
      state.exploration.playerState.currentLocationId = null

      const actions = getAvailableActions(state)

      // Should have fartravel option with placeholder
      expect(hasAction(actions, "fartravel <area>")).toBe(true)

      // Fartravel uses placeholder so time varies by destination
      const farTravelAction = findAction(actions, "fartravel <area>")
      expect(farTravelAction?.isVariable).toBe(true)
    })
  })

  describe("At explored area (wilderness hub)", () => {
    let state: WorldState

    beforeEach(async () => {
      state = createWorld("test-seed")
      state.player.skills.Exploration = { level: 1, xp: 0 }

      // Discover and travel to a distance 1 area
      await grantExplorationGuildBenefits(state)

      // Move to the discovered area's hub
      const discoveredAreaId = state.exploration.playerState.knownAreaIds.find(
        (id) => id !== "TOWN"
      )
      if (discoveredAreaId) {
        state.exploration.playerState.currentAreaId = discoveredAreaId
        state.exploration.playerState.currentLocationId = null
      }
    })

    it("should include survey when there are undiscovered areas", () => {
      const actions = getAvailableActions(state)

      expect(hasAction(actions, "survey")).toBe(true)

      const surveyAction = findAction(actions, "survey")
      expect(surveyAction?.isVariable).toBe(true)
      expect(surveyAction?.successProbability).toBe(1)
    })

    it("should include explore when area has undiscovered locations", () => {
      const actions = getAvailableActions(state)

      expect(hasAction(actions, "explore")).toBe(true)

      const exploreAction = findAction(actions, "explore")
      expect(exploreAction?.isVariable).toBe(true)
      expect(exploreAction?.successProbability).toBe(1)
    })

    it("should include fartravel action", () => {
      const actions = getAvailableActions(state)

      expect(hasAction(actions, "fartravel <area>")).toBe(true)
    })
  })

  describe("With craftable recipes", () => {
    it("should include craft action when ingredients are available", () => {
      const state = createWorld("test-seed")
      // Go to Smithing Guild
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.SMITHING_GUILD
      // Enrol in Smithing
      state.player.skills.Smithing = { level: 1, xp: 0 }
      // Add ingredients for copper-bar recipe (2 COPPER_ORE) - non-stacking
      state.player.inventory = [
        { itemId: "COPPER_ORE", quantity: 1 },
        { itemId: "COPPER_ORE", quantity: 1 },
      ]

      const actions = getAvailableActions(state)

      expect(hasAction(actions, "craft <recipe>")).toBe(true)

      const craftAction = findAction(actions, "craft <recipe>")
      expect(craftAction?.timeCost).toBeGreaterThan(0)
      expect(craftAction?.isVariable).toBe(true) // Time varies by recipe
    })

    it("should NOT include craft when missing ingredients", () => {
      const state = createWorld("test-seed")
      // Go to Smithing Guild
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.SMITHING_GUILD
      state.player.skills.Smithing = { level: 1, xp: 0 }
      // Empty inventory - no ingredients
      state.player.inventory = []

      const actions = getAvailableActions(state)

      expect(hasAction(actions, "craft <recipe>")).toBe(false)
    })
  })

  describe("With inventory items", () => {
    it("should include store action when at warehouse", () => {
      const state = createWorld("test-seed")
      // Go to Warehouse
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.WAREHOUSE
      // Add some items
      state.player.inventory = [{ itemId: "COPPER_ORE", quantity: 5 }]

      const actions = getAvailableActions(state)

      expect(hasAction(actions, "store")).toBe(true)

      const storeAction = findAction(actions, "store")
      expect(storeAction?.timeCost).toBe(0)
    })

    it("should include drop action when has inventory", () => {
      const state = createWorld("test-seed")
      state.player.inventory = [{ itemId: "STONE", quantity: 10 }]

      const actions = getAvailableActions(state)

      expect(hasAction(actions, "drop")).toBe(true)

      const dropAction = findAction(actions, "drop")
      expect(dropAction?.timeCost).toBe(1)
    })

    it("should NOT include drop when inventory is empty", () => {
      const state = createWorld("test-seed")
      state.player.inventory = []

      const actions = getAvailableActions(state)

      expect(hasAction(actions, "drop")).toBe(false)
    })
  })

  describe("Travel to location", () => {
    it("should include go action for discovered locations in current area", () => {
      const state = createWorld("test-seed")
      // At Town hub
      state.exploration.playerState.currentLocationId = null

      const actions = getAvailableActions(state)

      // Should show placeholder for go action
      expect(hasAction(actions, "go <location>")).toBe(true)
    })

    it("should have 0t cost for travel in town", () => {
      const state = createWorld("test-seed")
      state.exploration.playerState.currentLocationId = null

      const actions = getAvailableActions(state)
      const goAction = findAction(actions, "go <location>")

      expect(goAction?.timeCost).toBe(0)
    })

    it("should include go action for connected areas in wilderness", async () => {
      const state = createWorld("test-seed")
      state.player.skills.Exploration = { level: 1, xp: 0 }

      // Discover some distance 1 areas
      await grantExplorationGuildBenefits(state)

      // Move to a wilderness area hub (no locations discovered yet)
      const wildernessAreaId = state.exploration.playerState.knownAreaIds.find(
        (id) => id !== "TOWN"
      )
      if (wildernessAreaId) {
        state.exploration.playerState.currentAreaId = wildernessAreaId
        state.exploration.playerState.currentLocationId = null // At hub

        // Ensure there are no discovered locations in this area
        // (so TravelToLocation won't be available)
        const area = state.exploration.areas.get(wildernessAreaId)
        if (area && area.locations) {
          // Remove all location IDs from known list for this area
          state.exploration.playerState.knownLocationIds =
            state.exploration.playerState.knownLocationIds.filter(
              (id) => !id.startsWith(wildernessAreaId)
            )
        }
      }

      const actions = getAvailableActions(state)

      // Should show go action for traveling to adjacent areas
      // Either "go <location>" or "go <area>" depending on implementation
      // The key is that "go" should be available to travel to known connected areas
      expect(hasAction(actions, "go")).toBe(true)
    })

    it("should show go <area> with timeCost 0 when only areas available", async () => {
      const state = createWorld("test-seed")
      state.player.skills.Exploration = { level: 1, xp: 0 }

      // Discover some distance 1 areas
      await grantExplorationGuildBenefits(state)

      // Move to a wilderness area hub (no locations discovered yet)
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
      }

      const actions = getAvailableActions(state)
      const goAction = findAction(actions, "go")

      expect(goAction).toBeDefined()
      expect(goAction?.displayName).toBe("go <area>")
      // timeCost should be 0 to trigger "varies" display without misleading estimate
      expect(goAction?.timeCost).toBe(0)
      expect(goAction?.isVariable).toBe(true)
    })

    it("should show both go <location> and go <area> when both available", () => {
      const state = createWorld("test-seed")

      // Stay at Town hub - this has both locations AND area connections
      state.exploration.playerState.currentLocationId = null

      // In Town, we have:
      // - Locations: Miners Guild, Foresters Guild, etc. (for "go <location>")
      // - Area connections: No adjacent areas yet, so need to discover some

      // For this test to work, we need adjacent areas. Let's discover one.
      state.player.skills.Exploration = { level: 1, xp: 0 }

      // Manually discover an adjacent area and its connection
      const adjacentAreaId = "area-d1-i0"
      if (!state.exploration.playerState.knownAreaIds.includes(adjacentAreaId)) {
        state.exploration.playerState.knownAreaIds.push(adjacentAreaId)
      }
      const connectionId = `TOWN->${adjacentAreaId}`
      if (!state.exploration.playerState.knownConnectionIds.includes(connectionId)) {
        state.exploration.playerState.knownConnectionIds.push(connectionId)
      }

      const actionsWithBoth = getAvailableActions(state)

      // Should have BOTH actions
      const goLocationAction = findAction(actionsWithBoth, "go <location>")
      const goAreaAction = findAction(actionsWithBoth, "go <area>")

      expect(goLocationAction).toBeDefined()
      expect(goLocationAction?.timeCost).toBe(0) // Town location travel is free
      expect(goLocationAction?.isVariable).toBe(false)

      expect(goAreaAction).toBeDefined()
      expect(goAreaAction?.timeCost).toBe(0) // Shows "varies"
      expect(goAreaAction?.isVariable).toBe(true)
    })
  })

  describe("Variable time costs", () => {
    it("survey should be marked as variable", async () => {
      const state = createWorld("test-seed")
      state.player.skills.Exploration = { level: 1, xp: 0 }

      await grantExplorationGuildBenefits(state)

      // Move to wilderness hub
      const discoveredAreaId = state.exploration.playerState.knownAreaIds.find(
        (id) => id !== "TOWN"
      )
      if (discoveredAreaId) {
        state.exploration.playerState.currentAreaId = discoveredAreaId
        state.exploration.playerState.currentLocationId = null
      }

      const actions = getAvailableActions(state)
      const surveyAction = findAction(actions, "survey")

      expect(surveyAction?.isVariable).toBe(true)
      expect(surveyAction?.timeCost).toBeGreaterThan(0)
    })

    it("explore should be marked as variable", async () => {
      const state = createWorld("test-seed")
      state.player.skills.Exploration = { level: 1, xp: 0 }

      await grantExplorationGuildBenefits(state)

      // Move to wilderness hub
      const discoveredAreaId = state.exploration.playerState.knownAreaIds.find(
        (id) => id !== "TOWN"
      )
      if (discoveredAreaId) {
        state.exploration.playerState.currentAreaId = discoveredAreaId
        state.exploration.playerState.currentLocationId = null
      }

      const actions = getAvailableActions(state)
      const exploreAction = findAction(actions, "explore")

      expect(exploreAction?.isVariable).toBe(true)
      expect(exploreAction?.timeCost).toBeGreaterThan(0)
    })
  })

  describe("Success probability", () => {
    it("fight should show success probability based on weapon", () => {
      // Note: Combat is not fully implemented - checkFightAction always returns invalid
      // This test documents expected behavior if combat were implemented
      const state = createWorld("test-seed")

      // Even with setup, fight won't be available because enemies don't exist yet
      const actions = getAvailableActions(state)

      // Fight should not be available (combat not implemented)
      expect(hasAction(actions, "fight")).toBe(false)
    })
  })

  describe("Edge cases", () => {
    it("should return empty list when somehow no actions available", () => {
      // This is a contrived edge case - normally there's always at least
      // travel/fartravel options
      const state = createWorld("test-seed")

      // Even at minimum, there should be go actions in town
      const actions = getAvailableActions(state)

      // Should still have actions (go to various town locations)
      expect(actions.length).toBeGreaterThan(0)
    })

    it("should handle depleted gathering nodes", async () => {
      const state = createWorld("test-seed-depleted")
      state.player.skills.Mining = { level: 1, xp: 0 }
      state.player.skills.Exploration = { level: 1, xp: 0 }

      await grantExplorationGuildBenefits(state)

      // Create a depleted node scenario
      const areaId = "area-d1-i0"
      const locationId = `${areaId}-loc-0`

      state.exploration.areas.set(areaId, {
        id: areaId,
        distance: 1,
        generated: true,
        locations: [
          {
            id: locationId,
            areaId,
            type: ExplorationLocationType.GATHERING_NODE,
            gatheringSkillType: "Mining",
          },
        ],
        indexInDistance: 0,
      })

      state.world.nodes = state.world.nodes ?? []
      state.world.nodes.push({
        nodeId: `${areaId}-node-0`,
        nodeType: NodeType.ORE_VEIN,
        areaId,
        materials: [
          {
            materialId: "COPPER_ORE",
            remainingUnits: 0, // Depleted!
            maxUnitsInitial: 50,
            requiresSkill: "Mining",
            requiredLevel: 1,
            tier: 1,
          },
        ],
        depleted: true, // Mark as depleted
      })

      if (!state.exploration.playerState.knownLocationIds.includes(locationId)) {
        state.exploration.playerState.knownLocationIds.push(locationId)
      }
      if (!state.exploration.playerState.knownAreaIds.includes(areaId)) {
        state.exploration.playerState.knownAreaIds.push(areaId)
      }

      state.exploration.playerState.currentAreaId = areaId
      state.exploration.playerState.currentLocationId = locationId

      const actions = getAvailableActions(state)

      // Should NOT have mining actions for depleted node
      expect(hasAction(actions, "mine")).toBe(false)

      // Should still have leave
      expect(hasAction(actions, "leave")).toBe(true)
    })
  })
})
