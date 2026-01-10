import { evaluateAction, evaluatePlan } from "./evaluate.js"
import { createWorld, TOWN_LOCATIONS } from "./world.js"
import type { Action, WorldState, AreaID } from "./types.js"
import { GatherMode, NodeType } from "./types.js"

/** Set player to be at a specific location in town */
function setTownLocation(state: WorldState, locationId: string | null): void {
  state.exploration.playerState.currentAreaId = "TOWN"
  state.exploration.playerState.currentLocationId = locationId
}

/**
 * Test helpers for procedural area IDs
 */

/** Get a distance-1 area ID (first one) */
function getDistance1AreaId(state: WorldState): AreaID {
  for (const area of state.exploration.areas.values()) {
    if (area.distance === 1) return area.id
  }
  throw new Error("No distance-1 area found")
}

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

/** Discover all locations in an area (required for Gather to work) */
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

/** Move player to a node's location (required for gathering) */
function moveToNodeLocation(state: WorldState, nodeId: string): void {
  const nodeIndexMatch = nodeId.match(/-node-(\d+)$/)
  if (nodeIndexMatch) {
    const areaId = nodeId.replace(/-node-\d+$/, "")
    const nodeIndex = nodeIndexMatch[1]
    const locationId = `${areaId}-loc-${nodeIndex}`
    state.exploration.playerState.currentLocationId = locationId
  }
}

describe("Evaluation APIs", () => {
  describe("evaluateAction", () => {
    it("should evaluate Move action", () => {
      const state = createWorld("ore-test")
      const areaId = getDistance1AreaId(state)
      const action: Action = { type: "Move", destination: areaId }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(0) // Move time calculated in exploration system
      expect(result.expectedXP).toBe(0) // Move grants no XP (travel is purely logistical)
      expect(result.successProbability).toBe(1) // Move always succeeds if valid
    })

    it("should evaluate AcceptContract action", () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
      const action: Action = { type: "AcceptContract", contractId: "miners-guild-1" }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(0)
      expect(result.expectedXP).toBe(0) // No XP for accepting contract
      expect(result.successProbability).toBe(1)
    })

    it("should evaluate Gather action", () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      const node = state.world.nodes!.find((n) => n.areaId === areaId && !n.depleted)!
      moveToNodeLocation(state, node.nodeId) // Must be at node location to gather
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

    it.skip("should evaluate Fight action (combat not yet implemented)", () => {
      const state = createWorld("ore-test")
      const areaId = getDistance1AreaId(state)
      state.exploration.playerState.currentAreaId = areaId
      state.player.skills.Combat = { level: 1, xp: 0 } // Need level 1 to fight
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      // NOTE: Enemies not yet implemented - this test is skipped
      const action: Action = { type: "Fight", enemyId: "cave-rat" }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(3)
      expect(result.expectedXP).toBe(0.7) // 1 * 0.7 probability
      expect(result.successProbability).toBe(0.7)
    })

    it("should evaluate Craft action", () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.SMITHING_GUILD)
      state.player.skills.Smithing = { level: 1, xp: 0 } // Need level 1 to craft
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 2 })
      const action: Action = { type: "Craft", recipeId: "iron-bar-recipe" }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(3)
      expect(result.expectedXP).toBe(1)
      expect(result.successProbability).toBe(1)
    })

    it("should evaluate Store action", () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.WAREHOUSE)
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const action: Action = { type: "Store", itemId: "IRON_ORE", quantity: 1 }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(0) // Store is free
      expect(result.expectedXP).toBe(0) // No XP for Store
      expect(result.successProbability).toBe(1)
    })

    it("should evaluate Drop action", () => {
      const state = createWorld("ore-test")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const action: Action = { type: "Drop", itemId: "IRON_ORE", quantity: 1 }

      const result = evaluateAction(state, action)

      expect(result.expectedTime).toBe(1) // Drop takes 1 tick
      expect(result.expectedXP).toBe(0) // No XP for drop
      expect(result.successProbability).toBe(1)
    })

    it("should return 0 probability for invalid action", () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      // Try to gather without being at the node location
      const node = state.world.nodes!.find((n) => n.areaId === areaId && !n.depleted)!
      const focusMat = node.materials[0]
      const action: Action = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const result = evaluateAction(state, action)

      expect(result.successProbability).toBe(0) // Should fail - player is at TOWN, not ore area
    })

    it("should return 0 probability for Gather with insufficient skill level", () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)
      // Skills start at 0, so action should fail
      const node = state.world.nodes!.find((n) => n.areaId === areaId && !n.depleted)!
      moveToNodeLocation(state, node.nodeId) // Must be at node location
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
      const state = createWorld("ore-test")
      const areaId = getDistance1AreaId(state)
      const stateBefore = JSON.stringify(state)
      const action: Action = { type: "Move", destination: areaId }

      evaluateAction(state, action)

      expect(JSON.stringify(state)).toBe(stateBefore)
    })
  })

  describe("evaluatePlan", () => {
    it("should evaluate empty plan", () => {
      const state = createWorld("ore-test")

      const result = evaluatePlan(state, [])

      expect(result.expectedTime).toBe(0)
      expect(result.expectedXP).toBe(0)
      expect(result.violations).toHaveLength(0)
    })

    it("should evaluate simple plan", () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      discoverAllLocations(state, areaId)
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      const node = state.world.nodes!.find((n) => n.areaId === areaId && !n.depleted)!
      // Get the location ID for the node
      const nodeIndexMatch = node.nodeId.match(/-node-(\d+)$/)
      const locationId = nodeIndexMatch ? `${areaId}-loc-${nodeIndexMatch[1]}` : ""
      const focusMat = node.materials.find((m) => m.requiredLevel === 1)!
      const actions: Action[] = [
        { type: "Move", destination: areaId },
        { type: "TravelToLocation", locationId }, // Must travel to node location first
        {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: focusMat.materialId,
        },
      ]

      const result = evaluatePlan(state, actions)

      // 0 (Move) + 1 (TravelToLocation) + 5 (FOCUS gather) = 6
      expect(result.expectedTime).toBe(6)
      expect(result.expectedXP).toBe(1) // 0 (no XP for Move) + 0 (TravelToLocation) + 1 (gather XP)
      expect(result.violations).toHaveLength(0)
    })

    it("should detect violations in plan", () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      const node = state.world.nodes!.find((n) => n.areaId === areaId && !n.depleted)!
      const focusMat = node.materials[0]
      const actions: Action[] = [
        {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: focusMat.materialId,
        }, // Invalid - not at ore area
      ]

      const result = evaluatePlan(state, actions)

      expect(result.violations).toHaveLength(1)
      expect(result.violations[0].actionIndex).toBe(0)
      expect(result.violations[0].reason).toContain("WRONG_LOCATION")
    })

    it("should not mutate state", () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      const node = state.world.nodes!.find((n) => n.areaId === areaId && !n.depleted)!
      const focusMat = node.materials.find((m) => m.requiredLevel === 1)!
      const stateBefore = JSON.stringify(state)
      const actions: Action[] = [
        { type: "Move", destination: areaId },
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
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      discoverAllLocations(state, areaId)
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      state.time.sessionRemainingTicks = 3 // Only 3 ticks remaining
      const node = state.world.nodes!.find((n) => n.areaId === areaId && !n.depleted)!
      // Get the location ID for the node
      const nodeIndexMatch = node.nodeId.match(/-node-(\d+)$/)
      const locationId = nodeIndexMatch ? `${areaId}-loc-${nodeIndexMatch[1]}` : ""
      const focusMat = node.materials.find((m) => m.requiredLevel === 1)!
      const actions: Action[] = [
        { type: "Move", destination: areaId }, // 0 ticks in evaluation
        { type: "TravelToLocation", locationId }, // 1 tick
        {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: focusMat.materialId,
        }, // 5 ticks - total 6 ticks exceeds 3
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
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD) // Must be at correct location
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
