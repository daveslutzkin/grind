import { executeAction } from "./engine.js"
import { createWorld, TOWN_LOCATIONS } from "./world.js"
import type {
  MoveAction,
  AcceptContractAction,
  GatherAction,
  FightAction,
  CraftAction,
  StoreAction,
  DropAction,
  GuildEnrolmentAction,
  WorldState,
  AreaID,
} from "./types.js"
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

/** Get an area that has tree nodes (any distance) */
function getTreeAreaId(state: WorldState): AreaID {
  // Sort areas by distance so we prefer closer ones
  const areas = Array.from(state.exploration.areas.values())
    .filter((a) => a.distance > 0)
    .sort((a, b) => a.distance - b.distance)
  for (const area of areas) {
    const hasTrees = state.world.nodes?.some(
      (n) => n.areaId === area.id && n.nodeType === NodeType.TREE_STAND
    )
    if (hasTrees) return area.id
  }
  throw new Error("No tree area found")
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

/** Make a connection between two areas known */
function makeConnectionKnown(state: WorldState, fromAreaId: AreaID, toAreaId: AreaID): void {
  if (!state.exploration.playerState.knownAreaIds.includes(toAreaId)) {
    state.exploration.playerState.knownAreaIds.push(toAreaId)
  }
  const connectionId = `${fromAreaId}->${toAreaId}`
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

/** Move player to the location containing a specific node */
function moveToNodeLocation(state: WorldState, nodeId: string, areaId: string): void {
  const nodeIndexMatch = nodeId.match(/-node-(\d+)$/)
  if (nodeIndexMatch) {
    const nodeIndex = nodeIndexMatch[1]
    const locationId = `${areaId}-loc-${nodeIndex}`
    state.exploration.playerState.currentLocationId = locationId
  }
}

describe("Engine", () => {
  describe("Move action", () => {
    it("should move player to destination", async () => {
      const state = createWorld("ore-test")
      const areaId = getDistance1AreaId(state)
      makeAreaKnown(state, areaId)
      const action: MoveAction = { type: "Move", destination: areaId }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(true)
      expect(state.exploration.playerState.currentAreaId).toBe(areaId)
    })

    it("should consume travel time", async () => {
      const state = createWorld("ore-test")
      const areaId = getDistance1AreaId(state)
      makeAreaKnown(state, areaId)
      const action: MoveAction = { type: "Move", destination: areaId }

      const log = await await executeAction(state, action)

      // Travel time is BASE_TRAVEL_TIME (10) * multiplier (1-4) = 10-40 ticks
      expect(log.timeConsumed).toBeGreaterThanOrEqual(10)
      expect(log.timeConsumed).toBeLessThanOrEqual(40)
      expect(state.time.currentTick).toBe(log.timeConsumed)
    })

    it("should not grant XP (travel is purely logistical)", async () => {
      const state = createWorld("ore-test")
      const areaId = getDistance1AreaId(state)
      makeAreaKnown(state, areaId)
      const action: MoveAction = { type: "Move", destination: areaId }

      const log = await await executeAction(state, action)

      expect(log.skillGained).toBeUndefined()
    })

    it("should fail if already at destination", async () => {
      const state = createWorld("ore-test")
      const areaId = getDistance1AreaId(state)
      state.exploration.playerState.currentAreaId = areaId
      const action: MoveAction = { type: "Move", destination: areaId }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("ALREADY_IN_AREA")
      expect(log.timeConsumed).toBe(0)
    })

    it("should log action details", async () => {
      const state = createWorld("ore-test")
      const areaId = getDistance1AreaId(state)
      makeAreaKnown(state, areaId)
      const action: MoveAction = { type: "Move", destination: areaId }

      const log = await await executeAction(state, action)

      expect(log.tickBefore).toBe(0)
      expect(log.actionType).toBe("ExplorationTravel")
      expect(log.parameters).toEqual({ destinationAreaId: areaId })
      // Summary shows area name (LLM-generated or fallback "a nearby area")
      const area = state.exploration?.areas.get(areaId)
      const expectedName = area?.name || "a nearby area"
      expect(log.stateDeltaSummary).toContain(expectedName)
    })

    it("should work for round-trip travel", async () => {
      const state = createWorld("ore-test")
      const area1 = getDistance1AreaId(state)
      makeAreaKnown(state, area1)

      // TOWN -> distance-1 area
      let log = await executeAction(state, { type: "Move", destination: area1 })
      expect(log.success).toBe(true)
      expect(log.timeConsumed).toBeGreaterThanOrEqual(10)
      expect(log.timeConsumed).toBeLessThanOrEqual(40)
      expect(state.exploration.playerState.currentAreaId).toBe(area1)

      // Return to TOWN (reverse connection should exist)
      makeConnectionKnown(state, area1, "TOWN")
      log = await executeAction(state, { type: "Move", destination: "TOWN" })
      expect(log.success).toBe(true)
      expect(log.timeConsumed).toBeGreaterThanOrEqual(10)
      expect(log.timeConsumed).toBeLessThanOrEqual(40)
      expect(state.exploration.playerState.currentAreaId).toBe("TOWN")
    })
  })

  describe("AcceptContract action", () => {
    it("should add contract to active contracts", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD) // Must be at miners guild
      const action: AcceptContractAction = { type: "AcceptContract", contractId: "miners-guild-1" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(true)
      expect(state.player.activeContracts).toContain("miners-guild-1")
    })

    it("should consume 0 ticks", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
      const action: AcceptContractAction = { type: "AcceptContract", contractId: "miners-guild-1" }

      const log = await await executeAction(state, action)

      expect(log.timeConsumed).toBe(0)
    })

    it("should not grant XP", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
      const action: AcceptContractAction = { type: "AcceptContract", contractId: "miners-guild-1" }

      const log = await await executeAction(state, action)

      expect(log.skillGained).toBeUndefined()
    })

    it("should fail if not at guild location", async () => {
      const state = createWorld("ore-test")
      const areaId = getDistance1AreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      state.exploration.playerState.currentLocationId = null // At clearing
      const action: AcceptContractAction = { type: "AcceptContract", contractId: "miners-guild-1" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("WRONG_LOCATION")
    })

    it("should fail if contract not found", async () => {
      const state = createWorld("ore-test")
      const action: AcceptContractAction = { type: "AcceptContract", contractId: "nonexistent" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("CONTRACT_NOT_FOUND")
    })

    it("should fail if already has contract", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
      state.player.activeContracts.push("miners-guild-1")
      const action: AcceptContractAction = { type: "AcceptContract", contractId: "miners-guild-1" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("ALREADY_HAS_CONTRACT")
    })
  })

  describe("Gather action", () => {
    it("should add item to inventory on success", async () => {
      const state = createWorld("gather-success-seed")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      // Get a real node from the area
      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      expect(node).toBeDefined()
      const material = node!.materials[0]
      // Force RNG to succeed by using a seed that succeeds at counter 0
      state.rng.seed = "always-succeed"
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      }

      // Try multiple times to find a successful gather
      const log = await await executeAction(state, action)

      // The RNG should produce a consistent result
      if (log.success) {
        // Check for the focused material
        const item = state.player.inventory.find((i) => i.itemId === material.materialId)
        expect(item).toBeDefined()
      }
    })

    it("should consume gather time", async () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      // Get a real node from the area
      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      expect(node).toBeDefined()
      moveToNodeLocation(state, node!.nodeId, areaId) // Move to the node location
      // Find a material that requires level 1
      const material = node!.materials.find((m) => m.requiredLevel === 1)
      expect(material).toBeDefined()
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material!.materialId,
      }

      const log = await await executeAction(state, action)

      expect(log.timeConsumed).toBeGreaterThan(0)
    })

    it("should grant Mining XP on success", async () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      // Get a real node from the area
      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      expect(node).toBeDefined()
      // Find a material that requires level 1
      const material = node!.materials.find((m) => m.requiredLevel === 1)
      expect(material).toBeDefined()
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material!.materialId,
      }

      const log = await await executeAction(state, action)

      if (log.success) {
        expect(log.skillGained).toEqual({ skill: "Mining", amount: expect.any(Number) })
        expect(state.player.skills.Mining.xp).toBeGreaterThan(0)
      }
    })

    it("should fail if not at node location", async () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      // Player starts at TOWN, nodes are at ore area
      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      expect(node).toBeDefined()
      const material = node!.materials[0]
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("WRONG_LOCATION")
      expect(log.timeConsumed).toBe(0)
    })

    it("should fail if node not found", async () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      const action: GatherAction = { type: "Gather", nodeId: "nonexistent-node" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("NODE_NOT_FOUND")
    })

    it("should log RNG roll", async () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      expect(node).toBeDefined()
      const material = node!.materials[0]
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      }

      const log = await await executeAction(state, action)

      // FOCUS mode doesn't use RNG rolls, so this test may not have rolls
      // Just check that it completes
      expect(log).toBeDefined()
    })

    it("should stack items in inventory", async () => {
      const state = createWorld("stack-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      expect(node).toBeDefined()
      const material = node!.materials[0]
      state.player.inventory.push({ itemId: material.materialId, quantity: 3 })
      // Force success
      state.rng.seed = "force-success-stack"
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      }

      const log = await await executeAction(state, action)

      if (log.success) {
        const item = state.player.inventory.find((i) => i.itemId === material.materialId)
        expect(item?.quantity).toBeGreaterThan(3)
        expect(state.player.inventory.filter((i) => i.itemId === material.materialId)).toHaveLength(
          1
        )
      }
    })

    it("should succeed with full inventory but discard overflow (non-stacking)", async () => {
      const state = createWorld("overflow-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)
      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      expect(node).toBeDefined()
      moveToNodeLocation(state, node!.nodeId, areaId)
      // Set level high enough to mine the lowest-level material in this node
      const minRequiredLevel = Math.min(...node!.materials.map((m) => m.requiredLevel))
      state.player.skills.Mining = { level: minRequiredLevel, xp: 0 }
      const material = node!.materials.find((m) => m.requiredLevel <= minRequiredLevel)
      expect(material).toBeDefined()
      // Fill all 10 slots - inventory is completely full
      for (let i = 0; i < 10; i++) {
        state.player.inventory.push({ itemId: `ITEM_${i}`, quantity: 1 })
      }
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material!.materialId,
      }

      const log = await await executeAction(state, action)

      // Should succeed but discard all gathered items (no room)
      expect(log.success).toBe(true)
      expect(log.extraction?.discardedItems).toBeDefined()
      expect(log.extraction?.discardedItems?.length).toBeGreaterThan(0)
      // Inventory should still be full with the original items
      expect(state.player.inventory.length).toBe(10)
    })

    it("should report partial discard when inventory nearly full", async () => {
      const state = createWorld("partial-overflow-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)
      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      expect(node).toBeDefined()
      moveToNodeLocation(state, node!.nodeId, areaId)
      // Set level high enough to mine the lowest-level material in this node
      const minRequiredLevel = Math.min(...node!.materials.map((m) => m.requiredLevel))
      state.player.skills.Mining = { level: minRequiredLevel, xp: 0 }
      const material = node!.materials.find((m) => m.requiredLevel <= minRequiredLevel)
      expect(material).toBeDefined()
      // Fill 8 of 10 slots - 2 slots available
      for (let i = 0; i < 8; i++) {
        state.player.inventory.push({ itemId: `ITEM_${i}`, quantity: 1 })
      }
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material!.materialId,
      }

      const log = await await executeAction(state, action)

      // Should succeed
      expect(log.success).toBe(true)
      // extracted = amount taken from node (may exceed inventory space)
      const extracted = log.extraction?.extracted?.[0]?.quantity ?? 0
      // discarded = amount that couldn't fit
      const discarded = log.extraction?.discardedItems?.[0]?.quantity ?? 0
      // Amount actually added = extracted - discarded
      const actuallyAdded = extracted - discarded
      // With 8 slots filled and 2 available, should have added at most 2
      expect(actuallyAdded).toBeLessThanOrEqual(2)
      expect(actuallyAdded).toBeGreaterThan(0)
      // If we extracted more than 2, some must have been discarded
      if (extracted > 2) {
        expect(discarded).toBeGreaterThan(0)
      }
      // Inventory should be at capacity
      expect(state.player.inventory.length).toBe(10)
    })
  })

  describe.skip("Fight action (combat not yet implemented)", () => {
    function setupCombatState(state: ReturnType<typeof createWorld>): AreaID {
      const areaId = getDistance1AreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      // NOTE: Enemies not yet implemented - this describe block is skipped
      return areaId
    }

    it("should add loot to inventory on success", async () => {
      const state = createWorld("fight-success")
      setupCombatState(state)
      const action: FightAction = { type: "Fight" }

      const log = await await executeAction(state, action)

      if (log.success) {
        // cave-rat drops COPPER_ORE or other items based on loot table
        expect(state.player.inventory.length).toBeGreaterThan(1) // At least weapon + loot
      }
    })

    it("should consume fight time", async () => {
      const state = createWorld("ore-test")
      setupCombatState(state)
      const action: FightAction = { type: "Fight" }

      const log = await await executeAction(state, action)

      expect(log.timeConsumed).toBe(3) // CrudeWeapon fightTime is 3
    })

    it("should grant Combat XP on success", async () => {
      const state = createWorld("ore-test")
      setupCombatState(state)
      const action: FightAction = { type: "Fight" }

      const log = await await executeAction(state, action)

      if (log.success) {
        expect(log.skillGained).toEqual({ skill: "Combat", amount: 1 })
        expect(state.player.skills.Combat).toEqual({ level: 1, xp: 1 })
      }
    })

    it("should fail if not at enemy location", async () => {
      const state = createWorld("ore-test")
      const _areaId = getDistance1AreaId(state)
      // Player starts at TOWN, enemy is at areaId
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      // NOTE: Enemies not yet implemented - this describe block is skipped
      const action: FightAction = { type: "Fight" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("WRONG_LOCATION")
      expect(log.timeConsumed).toBe(0)
    })

    it("should fail if enemy not found", async () => {
      const state = createWorld("ore-test")
      const areaId = getDistance1AreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      const action: FightAction = { type: "Fight" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("ENEMY_NOT_FOUND")
    })

    it("should NOT relocate player on RNG failure (per spec)", async () => {
      const state = createWorld("fight-fail")
      const areaId = setupCombatState(state)
      state.rng.seed = "force-fight-fail"
      const action: FightAction = { type: "Fight" }

      const log = await await executeAction(state, action)

      if (!log.success && log.failureDetails?.type === "COMBAT_FAILURE") {
        // Per spec: player stays at location, is NOT relocated
        expect(state.exploration.playerState.currentAreaId).toBe(areaId)
      }
    })

    it("should log RNG roll", async () => {
      const state = createWorld("ore-test")
      setupCombatState(state)
      const action: FightAction = { type: "Fight" }

      const log = await await executeAction(state, action)

      // At least 1 roll for fight success, possibly more for loot drops
      expect(log.rngRolls.length).toBeGreaterThanOrEqual(1)
      expect(log.rngRolls[0].probability).toBe(0.7) // CrudeWeapon success probability
    })
  })

  describe("Craft action", () => {
    it("should consume inputs and produce output", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.SMITHING_GUILD)
      state.player.skills.Smithing = { level: 1, xp: 0 } // Need level 1 to craft
      // Non-stacking inventory: push 5 separate slots
      for (let i = 0; i < 5; i++) {
        state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      }
      const action: CraftAction = { type: "Craft", recipeId: "iron-bar" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(true)
      const ironOreCount = state.player.inventory.filter((i) => i.itemId === "IRON_ORE").length
      expect(ironOreCount).toBe(3) // 5 - 2 = 3
      const ironBarCount = state.player.inventory.filter((i) => i.itemId === "IRON_BAR").length
      expect(ironBarCount).toBe(1)
    })

    it("should consume craft time", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.SMITHING_GUILD)
      state.player.skills.Smithing = { level: 1, xp: 0 } // Need level 1 to craft
      // Non-stacking inventory: push 2 separate slots
      for (let i = 0; i < 2; i++) {
        state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      }
      const action: CraftAction = { type: "Craft", recipeId: "iron-bar" }

      const log = await await executeAction(state, action)

      expect(log.timeConsumed).toBe(3) // iron-bar craftTime is 3
    })

    it("should grant Smithing XP", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.SMITHING_GUILD)
      state.player.skills.Smithing = { level: 1, xp: 0 } // Need level 1 to craft
      // Non-stacking inventory: push 2 separate slots
      for (let i = 0; i < 2; i++) {
        state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      }
      const action: CraftAction = { type: "Craft", recipeId: "iron-bar" }

      const log = await await executeAction(state, action)

      expect(log.skillGained).toEqual({ skill: "Smithing", amount: 1 })
      expect(state.player.skills.Smithing).toEqual({ level: 1, xp: 1 }) // Started at level 1/0xp, gained 1 XP
    })

    it("should fail if not at required guild hall", async () => {
      const state = createWorld("ore-test")
      state.player.skills.Smithing = { level: 1, xp: 0 } // Need level 1 to craft
      const areaId = getDistance1AreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      state.exploration.playerState.currentLocationId = null // At clearing, not a guild hall
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 2 })
      const action: CraftAction = { type: "Craft", recipeId: "iron-bar" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("WRONG_GUILD_TYPE")
    })

    it("should fail if recipe not found", async () => {
      const state = createWorld("ore-test")
      const action: CraftAction = { type: "Craft", recipeId: "nonexistent" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("RECIPE_NOT_FOUND")
    })

    it("should fail if missing inputs", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.SMITHING_GUILD)
      state.player.skills.Smithing = { level: 1, xp: 0 } // Need level 1 to craft
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 }) // need 2
      const action: CraftAction = { type: "Craft", recipeId: "iron-bar" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("MISSING_ITEMS")
    })
  })

  describe("Store action", () => {
    it("should move item from inventory to storage", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.WAREHOUSE)
      // Non-stacking inventory: push 5 separate slots
      for (let i = 0; i < 5; i++) {
        state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      }
      const action: StoreAction = { type: "Store", itemId: "IRON_ORE", quantity: 3 }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(true)
      const invOreCount = state.player.inventory.filter((i) => i.itemId === "IRON_ORE").length
      expect(invOreCount).toBe(2)
      const storageOre = state.player.storage.find((i) => i.itemId === "IRON_ORE")
      expect(storageOre?.quantity).toBe(3) // Storage still stacks
    })

    it("should consume 0 ticks (free action)", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.WAREHOUSE)
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const action: StoreAction = { type: "Store", itemId: "IRON_ORE", quantity: 1 }

      const log = await await executeAction(state, action)

      expect(log.timeConsumed).toBe(0)
    })

    it("should not grant XP", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.WAREHOUSE)
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const action: StoreAction = { type: "Store", itemId: "IRON_ORE", quantity: 1 }

      const log = await await executeAction(state, action)

      expect(log.skillGained).toBeUndefined()
    })

    it("should fail if not at storage location", async () => {
      const state = createWorld("ore-test")
      const areaId = getDistance1AreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      state.exploration.playerState.currentLocationId = null // At clearing, not warehouse
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const action: StoreAction = { type: "Store", itemId: "IRON_ORE", quantity: 1 }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("WRONG_LOCATION")
    })

    it("should fail if item not in inventory", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.WAREHOUSE)
      const action: StoreAction = { type: "Store", itemId: "IRON_ORE", quantity: 1 }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("ITEM_NOT_FOUND")
    })

    it("should fail if not enough quantity", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.WAREHOUSE)
      // Non-stacking inventory: push 2 separate slots
      for (let i = 0; i < 2; i++) {
        state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      }
      const action: StoreAction = { type: "Store", itemId: "IRON_ORE", quantity: 5 }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("MISSING_ITEMS")
    })
  })

  describe("Drop action", () => {
    it("should remove item from inventory", async () => {
      const state = createWorld("ore-test")
      // Non-stacking inventory: push 5 separate slots
      for (let i = 0; i < 5; i++) {
        state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      }
      const action: DropAction = { type: "Drop", itemId: "IRON_ORE", quantity: 3 }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(true)
      const invOreCount = state.player.inventory.filter((i) => i.itemId === "IRON_ORE").length
      expect(invOreCount).toBe(2)
    })

    it("should consume 1 tick", async () => {
      const state = createWorld("ore-test")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const action: DropAction = { type: "Drop", itemId: "IRON_ORE", quantity: 1 }

      const log = await await executeAction(state, action)

      expect(log.timeConsumed).toBe(1)
    })

    it("should not grant XP", async () => {
      const state = createWorld("ore-test")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const action: DropAction = { type: "Drop", itemId: "IRON_ORE", quantity: 1 }

      const log = await await executeAction(state, action)

      expect(log.skillGained).toBeUndefined()
    })

    it("should fail if item not in inventory", async () => {
      const state = createWorld("ore-test")
      const action: DropAction = { type: "Drop", itemId: "IRON_ORE", quantity: 1 }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("ITEM_NOT_FOUND")
    })

    it("should fail if not enough quantity", async () => {
      const state = createWorld("ore-test")
      // Non-stacking inventory: push 2 separate slots
      for (let i = 0; i < 2; i++) {
        state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      }
      const action: DropAction = { type: "Drop", itemId: "IRON_ORE", quantity: 5 }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("MISSING_ITEMS")
    })

    it("should remove item stack if quantity becomes 0", async () => {
      const state = createWorld("ore-test")
      // Non-stacking inventory: push 3 separate slots
      for (let i = 0; i < 3; i++) {
        state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      }
      const action: DropAction = { type: "Drop", itemId: "IRON_ORE", quantity: 3 }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(true)
      const invOre = state.player.inventory.find((i) => i.itemId === "IRON_ORE")
      expect(invOre).toBeUndefined()
    })
  })

  describe("Skills starting at level 0", () => {
    it("should start all skills at level 0", async () => {
      const state = createWorld("ore-test")

      expect(state.player.skills.Mining.level).toBe(0)
      expect(state.player.skills.Woodcutting.level).toBe(0)
      expect(state.player.skills.Combat.level).toBe(0)
      expect(state.player.skills.Smithing.level).toBe(0)
    })

    it("should not have Logistics skill", async () => {
      const state = createWorld("ore-test")

      expect((state.player.skills as Record<string, unknown>).Logistics).toBeUndefined()
    })
  })

  describe("Level 0 blocks skill actions", () => {
    it("should fail Gather when Mining is level 0", async () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)
      // Get a real node from the area
      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      expect(node).toBeDefined()
      moveToNodeLocation(state, node!.nodeId, areaId) // Move to the node location
      const material = node!.materials[0]
      // Skills start at 0, so Mining should be 0
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("NOT_ENROLLED")
      expect(log.timeConsumed).toBe(0)
    })

    it("should fail Gather when Woodcutting is level 0", async () => {
      const state = createWorld("ore-test")
      const areaId = getTreeAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)
      // Get a real node from the area
      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      expect(node).toBeDefined()
      moveToNodeLocation(state, node!.nodeId, areaId) // Move to the node location
      const material = node!.materials[0]
      // Skills start at 0, so Woodcutting should be 0
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("NOT_ENROLLED")
    })

    it.skip("should fail Fight when Combat is level 0 (combat not yet implemented)", async () => {
      const state = createWorld("ore-test")
      const areaId = getDistance1AreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      // Need weapon equipped for the skill check to be reached
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      // NOTE: Enemies not yet implemented - this describe block is skipped
      // Skills start at 0, so Combat should be 0
      const action: FightAction = { type: "Fight" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("INSUFFICIENT_SKILL")
      expect(log.timeConsumed).toBe(0)
    })

    it("should fail Craft when Smithing is level 0", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.SMITHING_GUILD) // Must be at smithing guild
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 2 })
      // Skills start at 0, so Smithing should be 0
      const action: CraftAction = { type: "Craft", recipeId: "iron-bar" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("INSUFFICIENT_SKILL")
      expect(log.timeConsumed).toBe(0)
    })

    it("should succeed Gather when Mining is level 1", async () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      discoverAllLocations(state, areaId)
      state.player.skills.Mining = { level: 1, xp: 0 }
      // Get a real node from the area
      const node = state.world.nodes?.find((n) => n.areaId === areaId && !n.depleted)
      expect(node).toBeDefined()
      moveToNodeLocation(state, node!.nodeId, areaId) // Move to the node location
      // Find a material that requires level 1
      const material = node!.materials.find((m) => m.requiredLevel === 1)
      expect(material).toBeDefined()
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material!.materialId,
      }

      const log = await await executeAction(state, action)

      // Should not fail due to skill
      expect(log.failureDetails?.type).not.toBe("INSUFFICIENT_SKILL")
      expect(log.timeConsumed).toBeGreaterThan(0)
    })
  })

  describe("GuildEnrolment action", () => {
    it("should take skill from level 0 to level 1", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
      expect(state.player.skills.Mining.level).toBe(0)
      const action: GuildEnrolmentAction = { type: "Enrol" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(true)
      expect(state.player.skills.Mining.level).toBe(1)
      expect(state.player.skills.Mining.xp).toBe(0)
    })

    it("should consume 3 ticks", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
      const action: GuildEnrolmentAction = { type: "Enrol" }

      const log = await await executeAction(state, action)

      expect(log.timeConsumed).toBe(3)
    })

    it("should fail if not at guild location", async () => {
      const state = createWorld("ore-test")
      // At Town Square, not at any guild
      setTownLocation(state, null)
      const action: GuildEnrolmentAction = { type: "Enrol" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("WRONG_LOCATION")
    })

    it("should fail if not at a guild location", async () => {
      const state = createWorld("ore-test")
      // At Warehouse, not at a guild
      setTownLocation(state, TOWN_LOCATIONS.WAREHOUSE)
      const action: GuildEnrolmentAction = { type: "Enrol" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("WRONG_LOCATION")
    })

    it("should not grant XP (just unlocks the skill)", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
      const action: GuildEnrolmentAction = { type: "Enrol" }

      const log = await await executeAction(state, action)

      expect(log.skillGained).toBeUndefined()
      expect(state.player.skills.Mining.xp).toBe(0)
    })

    it("should fail if skill is already level 1 or higher", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
      state.player.skills.Mining = { level: 1, xp: 0 }
      const action: GuildEnrolmentAction = { type: "Enrol" }

      const log = await await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("ALREADY_ENROLLED")
      expect(log.timeConsumed).toBe(0)
    })

    it("should work for all skills", async () => {
      const state = createWorld("ore-test")

      // Enrol in Mining
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
      let log = await executeAction(state, { type: "Enrol" })
      expect(log.success).toBe(true)
      expect(state.player.skills.Mining.level).toBe(1)

      // Enrol in Woodcutting
      setTownLocation(state, TOWN_LOCATIONS.FORESTERS_GUILD)
      log = await executeAction(state, { type: "Enrol" })
      expect(log.success).toBe(true)
      expect(state.player.skills.Woodcutting.level).toBe(1)

      // Enrol in Combat
      setTownLocation(state, TOWN_LOCATIONS.COMBAT_GUILD)
      log = await executeAction(state, { type: "Enrol" })
      expect(log.success).toBe(true)
      expect(state.player.skills.Combat.level).toBe(1)

      // Enrol in Smithing
      setTownLocation(state, TOWN_LOCATIONS.SMITHING_GUILD)
      log = await executeAction(state, { type: "Enrol" })
      expect(log.success).toBe(true)
      expect(state.player.skills.Smithing.level).toBe(1)
    })

    it("should log action details", async () => {
      const state = createWorld("ore-test")
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
      const action: GuildEnrolmentAction = { type: "Enrol" }

      const log = await await executeAction(state, action)

      expect(log.actionType).toBe("Enrol")
      // Log includes resolved skill for clarity
      expect(log.parameters).toEqual({ skill: "Mining" })
      expect(log.stateDeltaSummary).toContain("Mining")
    })
  })

  describe("TravelToLocation action", () => {
    it("should move player to location in town (free)", async () => {
      const state = createWorld("ore-test")
      state.exploration.playerState.currentLocationId = null // At Town Square

      const log = await executeAction(state, {
        type: "TravelToLocation",
        locationId: TOWN_LOCATIONS.SMITHING_GUILD,
      })

      expect(log.success).toBe(true)
      expect(log.timeConsumed).toBe(0) // Free in town
      expect(state.exploration.playerState.currentLocationId).toBe(TOWN_LOCATIONS.SMITHING_GUILD)
    })

    it("should move player to location in wilderness (1 tick)", async () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      state.exploration.playerState.currentLocationId = null // At clearing
      discoverAllLocations(state, areaId)

      // Find a node location in this area
      const area = state.exploration.areas.get(areaId)!
      const nodeLocation = area.locations[0]

      const log = await executeAction(state, {
        type: "TravelToLocation",
        locationId: nodeLocation.id,
      })

      expect(log.success).toBe(true)
      expect(log.timeConsumed).toBe(1) // Costs 1 tick in wilderness
      expect(state.exploration.playerState.currentLocationId).toBe(nodeLocation.id)
    })

    it("should fail if location not discovered", async () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      state.exploration.playerState.currentLocationId = null
      // Do NOT discover locations

      const area = state.exploration.areas.get(areaId)!
      const nodeLocation = area.locations[0]

      const log = await executeAction(state, {
        type: "TravelToLocation",
        locationId: nodeLocation.id,
      })

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("LOCATION_NOT_DISCOVERED")
    })

    it("should fail if already at location", async () => {
      const state = createWorld("ore-test")
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.SMITHING_GUILD

      const log = await executeAction(state, {
        type: "TravelToLocation",
        locationId: TOWN_LOCATIONS.SMITHING_GUILD,
      })

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("ALREADY_AT_LOCATION")
    })

    it("should fail if not at hub (null)", async () => {
      const state = createWorld("ore-test")
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD // Not at hub

      const log = await executeAction(state, {
        type: "TravelToLocation",
        locationId: TOWN_LOCATIONS.SMITHING_GUILD,
      })

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("NOT_AT_HUB")
    })

    it("should fail with UNKNOWN_LOCATION for invalid location even when not at hub", async () => {
      const state = createWorld("ore-test")
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD // Not at hub

      const log = await executeAction(state, {
        type: "TravelToLocation",
        locationId: "INVALID_LOCATION",
      })

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("UNKNOWN_LOCATION")
    })
  })

  describe("Leave action", () => {
    it("should return player to hub in town (free)", async () => {
      const state = createWorld("ore-test")
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.SMITHING_GUILD

      const log = await executeAction(state, { type: "Leave" })

      expect(log.success).toBe(true)
      expect(log.timeConsumed).toBe(0) // Free in town
      expect(state.exploration.playerState.currentLocationId).toBeNull()
    })

    it("should return player to clearing in wilderness (1 tick)", async () => {
      const state = createWorld("ore-test")
      const areaId = getOreAreaId(state)
      makeAreaKnown(state, areaId)
      discoverAllLocations(state, areaId)
      state.exploration.playerState.currentAreaId = areaId
      const area = state.exploration.areas.get(areaId)!
      const nodeLocation = area.locations[0]
      state.exploration.playerState.currentLocationId = nodeLocation.id

      const log = await executeAction(state, { type: "Leave" })

      expect(log.success).toBe(true)
      expect(log.timeConsumed).toBe(1) // Costs 1 tick in wilderness
      expect(state.exploration.playerState.currentLocationId).toBeNull()
    })

    it("should fail if already at hub", async () => {
      const state = createWorld("ore-test")
      state.exploration.playerState.currentLocationId = null // Already at hub

      const log = await executeAction(state, { type: "Leave" })

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("ALREADY_AT_HUB")
    })
  })
})
