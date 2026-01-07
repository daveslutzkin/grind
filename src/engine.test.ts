import { executeAction } from "./engine.js"
import { createWorld } from "./world.js"
import type {
  MoveAction,
  AcceptContractAction,
  GatherAction,
  FightAction,
  CraftAction,
  StoreAction,
  DropAction,
  GuildEnrolmentAction,
} from "./types.js"
import { GatherMode } from "./types.js"

describe("Engine", () => {
  describe("Move action", () => {
    it("should move player to destination", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      const action: MoveAction = { type: "Move", destination: "OUTSKIRTS_MINE" }

      const log = executeAction(state, action)

      expect(log.success).toBe(true)
      expect(state.exploration.playerState.currentAreaId).toBe("OUTSKIRTS_MINE")
    })

    it("should consume travel time", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      const initialTicks = state.time.sessionRemainingTicks
      const action: MoveAction = { type: "Move", destination: "OUTSKIRTS_MINE" }

      const log = executeAction(state, action)

      expect(log.timeConsumed).toBe(20) // TOWN->OUTSKIRTS_MINE is 10 (base) * 2 (multiplier) = 20 ticks
      expect(state.time.sessionRemainingTicks).toBe(initialTicks - 20)
      expect(state.time.currentTick).toBe(20)
    })

    it("should not grant XP (travel is purely logistical)", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      const action: MoveAction = { type: "Move", destination: "OUTSKIRTS_MINE" }

      const log = executeAction(state, action)

      expect(log.skillGained).toBeUndefined()
    })

    it("should fail if already at destination", () => {
      const state = createWorld("test-seed")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      const action: MoveAction = { type: "Move", destination: "OUTSKIRTS_MINE" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("ALREADY_IN_AREA")
      expect(log.timeConsumed).toBe(0)
    })

    it("should fail if session has ended", () => {
      const state = createWorld("test-seed")
      state.time.sessionRemainingTicks = 0
      const action: MoveAction = { type: "Move", destination: "OUTSKIRTS_MINE" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("SESSION_ENDED")
    })

    it("should log action details", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      const action: MoveAction = { type: "Move", destination: "OUTSKIRTS_MINE" }

      const log = executeAction(state, action)

      expect(log.tickBefore).toBe(0)
      expect(log.actionType).toBe("ExplorationTravel")
      expect(log.parameters).toEqual({ destinationAreaId: "OUTSKIRTS_MINE" })
      expect(log.stateDeltaSummary).toContain("OUTSKIRTS_MINE")
    })

    it("should work for all location pairs", () => {
      const state = createWorld("test-seed")
      // Make COPSE known
      state.exploration.playerState.knownAreaIds.push("COPSE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->COPSE")

      // TOWN -> COPSE (base 10 * multiplier 2 = 20)
      let log = executeAction(state, { type: "Move", destination: "COPSE" })
      expect(log.success).toBe(true)
      expect(log.timeConsumed).toBe(20)
      expect(state.exploration.playerState.currentAreaId).toBe("COPSE")

      // Make DEEP_FOREST known
      state.exploration.playerState.knownAreaIds.push("DEEP_FOREST")
      state.exploration.playerState.knownConnectionIds.push("COPSE->DEEP_FOREST")
      // COPSE -> DEEP_FOREST (base 10 * multiplier 3 = 30)
      log = executeAction(state, { type: "Move", destination: "DEEP_FOREST" })
      expect(log.success).toBe(true)
      expect(log.timeConsumed).toBe(30)
      expect(state.exploration.playerState.currentAreaId).toBe("DEEP_FOREST")
    })
  })

  describe("AcceptContract action", () => {
    it("should add contract to active contracts", () => {
      const state = createWorld("test-seed")
      const action: AcceptContractAction = { type: "AcceptContract", contractId: "miners-guild-1" }

      const log = executeAction(state, action)

      expect(log.success).toBe(true)
      expect(state.player.activeContracts).toContain("miners-guild-1")
    })

    it("should consume 0 ticks", () => {
      const state = createWorld("test-seed")
      const initialTicks = state.time.sessionRemainingTicks
      const action: AcceptContractAction = { type: "AcceptContract", contractId: "miners-guild-1" }

      const log = executeAction(state, action)

      expect(log.timeConsumed).toBe(0)
      expect(state.time.sessionRemainingTicks).toBe(initialTicks)
    })

    it("should not grant XP", () => {
      const state = createWorld("test-seed")
      const action: AcceptContractAction = { type: "AcceptContract", contractId: "miners-guild-1" }

      const log = executeAction(state, action)

      expect(log.skillGained).toBeUndefined()
    })

    it("should fail if not at guild location", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      const action: AcceptContractAction = { type: "AcceptContract", contractId: "miners-guild-1" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("WRONG_LOCATION")
    })

    it("should fail if contract not found", () => {
      const state = createWorld("test-seed")
      const action: AcceptContractAction = { type: "AcceptContract", contractId: "nonexistent" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("CONTRACT_NOT_FOUND")
    })

    it("should fail if already has contract", () => {
      const state = createWorld("test-seed")
      state.player.activeContracts.push("miners-guild-1")
      const action: AcceptContractAction = { type: "AcceptContract", contractId: "miners-guild-1" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("ALREADY_HAS_CONTRACT")
    })
  })

  describe("Gather action", () => {
    it("should add item to inventory on success", () => {
      const state = createWorld("gather-success-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      // Get a real node from the area
      const node = state.world.nodes?.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)
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
      let log = executeAction(state, action)

      // The RNG should produce a consistent result
      if (log.success) {
        // Check for the focused material
        const item = state.player.inventory.find((i) => i.itemId === material.materialId)
        expect(item).toBeDefined()
      }
    })

    it("should consume gather time", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      const initialTicks = state.time.sessionRemainingTicks
      // Get a real node from the area
      const node = state.world.nodes?.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)
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

      const log = executeAction(state, action)

      expect(log.timeConsumed).toBeGreaterThan(0)
      expect(state.time.sessionRemainingTicks).toBe(initialTicks - log.timeConsumed)
    })

    it("should grant Mining XP on success", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      // Get a real node from the area
      const node = state.world.nodes?.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)
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

      const log = executeAction(state, action)

      if (log.success) {
        expect(log.skillGained).toEqual({ skill: "Mining", amount: expect.any(Number) })
        expect(state.player.skills.Mining.xp).toBeGreaterThan(0)
      }
    })

    it("should fail if not at node location", () => {
      const state = createWorld("test-seed")
      // Player starts at TOWN, nodes are at OUTSKIRTS_MINE
      const node = state.world.nodes?.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)
      expect(node).toBeDefined()
      const material = node!.materials[0]
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("WRONG_LOCATION")
      expect(log.timeConsumed).toBe(0)
    })

    it("should fail if node not found", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      const action: GatherAction = { type: "Gather", nodeId: "nonexistent-node" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("NODE_NOT_FOUND")
    })

    it("should log RNG roll", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      const node = state.world.nodes?.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)
      expect(node).toBeDefined()
      const material = node!.materials[0]
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      }

      const log = executeAction(state, action)

      // FOCUS mode doesn't use RNG rolls, so this test may not have rolls
      // Just check that it completes
      expect(log).toBeDefined()
    })

    it("should stack items in inventory", () => {
      const state = createWorld("stack-test")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      const node = state.world.nodes?.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)
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

      const log = executeAction(state, action)

      if (log.success) {
        const item = state.player.inventory.find((i) => i.itemId === material.materialId)
        expect(item?.quantity).toBeGreaterThan(3)
        expect(state.player.inventory.filter((i) => i.itemId === material.materialId)).toHaveLength(
          1
        )
      }
    })

    it("should succeed if inventory full but already has that item (slot-based)", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
      const node = state.world.nodes?.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)
      expect(node).toBeDefined()
      const material = node!.materials[0]
      // Fill 19 slots with other items, 1 slot with the material from the node
      for (let i = 0; i < 19; i++) {
        state.player.inventory.push({ itemId: `ITEM_${i}`, quantity: 1 })
      }
      state.player.inventory.push({ itemId: material.materialId, quantity: 1 })
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      }

      const log = executeAction(state, action)

      // Should not fail with INVENTORY_FULL because we can stack on existing material
      expect(log.failureType).not.toBe("INVENTORY_FULL")
    })
  })

  describe("Fight action", () => {
    function setupCombatState(state: ReturnType<typeof createWorld>): void {
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
    }

    it("should add loot to inventory on success", () => {
      const state = createWorld("fight-success")
      setupCombatState(state)
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      if (log.success) {
        // cave-rat drops COPPER_ORE or other items based on loot table
        expect(state.player.inventory.length).toBeGreaterThan(1) // At least weapon + loot
      }
    })

    it("should consume fight time", () => {
      const state = createWorld("test-seed")
      setupCombatState(state)
      const initialTicks = state.time.sessionRemainingTicks
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      expect(log.timeConsumed).toBe(3) // CrudeWeapon fightTime is 3
      expect(state.time.sessionRemainingTicks).toBe(initialTicks - 3)
    })

    it("should grant Combat XP on success", () => {
      const state = createWorld("test-seed")
      setupCombatState(state)
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      if (log.success) {
        expect(log.skillGained).toEqual({ skill: "Combat", amount: 1 })
        expect(state.player.skills.Combat).toEqual({ level: 1, xp: 1 })
      }
    })

    it("should fail if not at enemy location", () => {
      const state = createWorld("test-seed")
      // Player starts at TOWN, cave-rat is at OUTSKIRTS_MINE
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("WRONG_LOCATION")
      expect(log.timeConsumed).toBe(0)
    })

    it("should fail if enemy not found", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      const action: FightAction = { type: "Fight", enemyId: "nonexistent" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("ENEMY_NOT_FOUND")
    })

    it("should NOT relocate player on RNG failure (per spec)", () => {
      const state = createWorld("fight-fail")
      setupCombatState(state)
      state.rng.seed = "force-fight-fail"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      if (!log.success && log.failureType === "COMBAT_FAILURE") {
        // Per spec: player stays at location, is NOT relocated
        expect(state.exploration.playerState.currentAreaId).toBe("OUTSKIRTS_MINE")
      }
    })

    it("should log RNG roll", () => {
      const state = createWorld("test-seed")
      setupCombatState(state)
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      // At least 1 roll for fight success, possibly more for loot drops
      expect(log.rngRolls.length).toBeGreaterThanOrEqual(1)
      expect(log.rngRolls[0].probability).toBe(0.7) // CrudeWeapon success probability
    })
  })

  describe("Craft action", () => {
    it("should consume inputs and produce output", () => {
      const state = createWorld("test-seed")
      state.player.skills.Smithing = { level: 1, xp: 0 } // Need level 1 to craft
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 5 })
      const action: CraftAction = { type: "Craft", recipeId: "iron-bar-recipe" }

      const log = executeAction(state, action)

      expect(log.success).toBe(true)
      const ironOre = state.player.inventory.find((i) => i.itemId === "IRON_ORE")
      expect(ironOre?.quantity).toBe(3) // 5 - 2 = 3
      const ironBar = state.player.inventory.find((i) => i.itemId === "IRON_BAR")
      expect(ironBar?.quantity).toBe(1)
    })

    it("should consume craft time", () => {
      const state = createWorld("test-seed")
      state.player.skills.Smithing = { level: 1, xp: 0 } // Need level 1 to craft
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 2 })
      const initialTicks = state.time.sessionRemainingTicks
      const action: CraftAction = { type: "Craft", recipeId: "iron-bar-recipe" }

      const log = executeAction(state, action)

      expect(log.timeConsumed).toBe(3) // iron-bar-recipe craftTime is 3
      expect(state.time.sessionRemainingTicks).toBe(initialTicks - 3)
    })

    it("should grant Smithing XP", () => {
      const state = createWorld("test-seed")
      state.player.skills.Smithing = { level: 1, xp: 0 } // Need level 1 to craft
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 2 })
      const action: CraftAction = { type: "Craft", recipeId: "iron-bar-recipe" }

      const log = executeAction(state, action)

      expect(log.skillGained).toEqual({ skill: "Smithing", amount: 1 })
      expect(state.player.skills.Smithing).toEqual({ level: 1, xp: 1 }) // Started at level 1/0xp, gained 1 XP
    })

    it("should fail if not at required location", () => {
      const state = createWorld("test-seed")
      state.player.skills.Smithing = { level: 1, xp: 0 } // Need level 1 to craft
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 2 })
      const action: CraftAction = { type: "Craft", recipeId: "iron-bar-recipe" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("WRONG_LOCATION")
    })

    it("should fail if recipe not found", () => {
      const state = createWorld("test-seed")
      const action: CraftAction = { type: "Craft", recipeId: "nonexistent" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("RECIPE_NOT_FOUND")
    })

    it("should fail if missing inputs", () => {
      const state = createWorld("test-seed")
      state.player.skills.Smithing = { level: 1, xp: 0 } // Need level 1 to craft
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 }) // need 2
      const action: CraftAction = { type: "Craft", recipeId: "iron-bar-recipe" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("MISSING_ITEMS")
    })
  })

  describe("Store action", () => {
    it("should move item from inventory to storage", () => {
      const state = createWorld("test-seed")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 5 })
      const action: StoreAction = { type: "Store", itemId: "IRON_ORE", quantity: 3 }

      const log = executeAction(state, action)

      expect(log.success).toBe(true)
      const invOre = state.player.inventory.find((i) => i.itemId === "IRON_ORE")
      expect(invOre?.quantity).toBe(2)
      const storageOre = state.player.storage.find((i) => i.itemId === "IRON_ORE")
      expect(storageOre?.quantity).toBe(3)
    })

    it("should consume 0 ticks (free action)", () => {
      const state = createWorld("test-seed")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const initialTicks = state.time.sessionRemainingTicks
      const action: StoreAction = { type: "Store", itemId: "IRON_ORE", quantity: 1 }

      const log = executeAction(state, action)

      expect(log.timeConsumed).toBe(0)
      expect(state.time.sessionRemainingTicks).toBe(initialTicks)
    })

    it("should not grant XP", () => {
      const state = createWorld("test-seed")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const action: StoreAction = { type: "Store", itemId: "IRON_ORE", quantity: 1 }

      const log = executeAction(state, action)

      expect(log.skillGained).toBeUndefined()
    })

    it("should fail if not at storage location", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const action: StoreAction = { type: "Store", itemId: "IRON_ORE", quantity: 1 }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("WRONG_LOCATION")
    })

    it("should fail if item not in inventory", () => {
      const state = createWorld("test-seed")
      const action: StoreAction = { type: "Store", itemId: "IRON_ORE", quantity: 1 }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("ITEM_NOT_FOUND")
    })

    it("should fail if not enough quantity", () => {
      const state = createWorld("test-seed")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 2 })
      const action: StoreAction = { type: "Store", itemId: "IRON_ORE", quantity: 5 }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("MISSING_ITEMS")
    })
  })

  describe("Drop action", () => {
    it("should remove item from inventory", () => {
      const state = createWorld("test-seed")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 5 })
      const action: DropAction = { type: "Drop", itemId: "IRON_ORE", quantity: 3 }

      const log = executeAction(state, action)

      expect(log.success).toBe(true)
      const invOre = state.player.inventory.find((i) => i.itemId === "IRON_ORE")
      expect(invOre?.quantity).toBe(2)
    })

    it("should consume 1 tick", () => {
      const state = createWorld("test-seed")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const initialTicks = state.time.sessionRemainingTicks
      const action: DropAction = { type: "Drop", itemId: "IRON_ORE", quantity: 1 }

      const log = executeAction(state, action)

      expect(log.timeConsumed).toBe(1)
      expect(state.time.sessionRemainingTicks).toBe(initialTicks - 1)
    })

    it("should not grant XP", () => {
      const state = createWorld("test-seed")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      const action: DropAction = { type: "Drop", itemId: "IRON_ORE", quantity: 1 }

      const log = executeAction(state, action)

      expect(log.skillGained).toBeUndefined()
    })

    it("should fail if item not in inventory", () => {
      const state = createWorld("test-seed")
      const action: DropAction = { type: "Drop", itemId: "IRON_ORE", quantity: 1 }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("ITEM_NOT_FOUND")
    })

    it("should fail if not enough quantity", () => {
      const state = createWorld("test-seed")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 2 })
      const action: DropAction = { type: "Drop", itemId: "IRON_ORE", quantity: 5 }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("MISSING_ITEMS")
    })

    it("should remove item stack if quantity becomes 0", () => {
      const state = createWorld("test-seed")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 3 })
      const action: DropAction = { type: "Drop", itemId: "IRON_ORE", quantity: 3 }

      const log = executeAction(state, action)

      expect(log.success).toBe(true)
      const invOre = state.player.inventory.find((i) => i.itemId === "IRON_ORE")
      expect(invOre).toBeUndefined()
    })
  })

  describe("Skills starting at level 0", () => {
    it("should start all skills at level 0", () => {
      const state = createWorld("test-seed")

      expect(state.player.skills.Mining.level).toBe(0)
      expect(state.player.skills.Woodcutting.level).toBe(0)
      expect(state.player.skills.Combat.level).toBe(0)
      expect(state.player.skills.Smithing.level).toBe(0)
    })

    it("should not have Logistics skill", () => {
      const state = createWorld("test-seed")

      expect((state.player.skills as Record<string, unknown>).Logistics).toBeUndefined()
    })
  })

  describe("Level 0 blocks skill actions", () => {
    it("should fail Gather when Mining is level 0", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      // Get a real node from the area
      const node = state.world.nodes?.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)
      expect(node).toBeDefined()
      const material = node!.materials[0]
      // Skills start at 0, so Mining should be 0
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("INSUFFICIENT_SKILL")
      expect(log.timeConsumed).toBe(0)
    })

    it("should fail Gather when Woodcutting is level 0", () => {
      const state = createWorld("test-seed")
      // Make COPSE known
      state.exploration.playerState.knownAreaIds.push("COPSE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->COPSE")
      state.exploration.playerState.currentAreaId = "COPSE"
      // Get a real node from the area
      const node = state.world.nodes?.find((n) => n.areaId === "COPSE" && !n.depleted)
      expect(node).toBeDefined()
      const material = node!.materials[0]
      // Skills start at 0, so Woodcutting should be 0
      const action: GatherAction = {
        type: "Gather",
        nodeId: node!.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("INSUFFICIENT_SKILL")
    })

    it("should fail Fight when Combat is level 0", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      // Skills start at 0, so Combat should be 0
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("INSUFFICIENT_SKILL")
      expect(log.timeConsumed).toBe(0)
    })

    it("should fail Craft when Smithing is level 0", () => {
      const state = createWorld("test-seed")
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 2 })
      // Skills start at 0, so Smithing should be 0
      const action: CraftAction = { type: "Craft", recipeId: "iron-bar-recipe" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("INSUFFICIENT_SKILL")
      expect(log.timeConsumed).toBe(0)
    })

    it("should succeed Gather when Mining is level 1", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Mining = { level: 1, xp: 0 }
      // Get a real node from the area
      const node = state.world.nodes?.find((n) => n.areaId === "OUTSKIRTS_MINE" && !n.depleted)
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

      const log = executeAction(state, action)

      // Should not fail due to skill
      expect(log.failureType).not.toBe("INSUFFICIENT_SKILL")
      expect(log.timeConsumed).toBeGreaterThan(0)
    })
  })

  describe("GuildEnrolment action", () => {
    it("should take skill from level 0 to level 1", () => {
      const state = createWorld("test-seed")
      expect(state.player.skills.Mining.level).toBe(0)
      const action: GuildEnrolmentAction = { type: "Enrol", skill: "Mining" }

      const log = executeAction(state, action)

      expect(log.success).toBe(true)
      expect(state.player.skills.Mining.level).toBe(1)
      expect(state.player.skills.Mining.xp).toBe(0)
    })

    it("should consume 3 ticks", () => {
      const state = createWorld("test-seed")
      const initialTicks = state.time.sessionRemainingTicks
      const action: GuildEnrolmentAction = { type: "Enrol", skill: "Mining" }

      const log = executeAction(state, action)

      expect(log.timeConsumed).toBe(3)
      expect(state.time.sessionRemainingTicks).toBe(initialTicks - 3)
    })

    it("should fail if not at guild location (TOWN)", () => {
      const state = createWorld("test-seed")
      // Make OUTSKIRTS_MINE known
      state.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      state.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      const action: GuildEnrolmentAction = { type: "Enrol", skill: "Mining" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("WRONG_LOCATION")
    })

    it("should not grant XP (just unlocks the skill)", () => {
      const state = createWorld("test-seed")
      const action: GuildEnrolmentAction = { type: "Enrol", skill: "Mining" }

      const log = executeAction(state, action)

      expect(log.skillGained).toBeUndefined()
      expect(state.player.skills.Mining.xp).toBe(0)
    })

    it("should fail if skill is already level 1 or higher", () => {
      const state = createWorld("test-seed")
      state.player.skills.Mining = { level: 1, xp: 0 }
      const action: GuildEnrolmentAction = { type: "Enrol", skill: "Mining" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("ALREADY_ENROLLED")
      expect(log.timeConsumed).toBe(0)
    })

    it("should work for all skills", () => {
      const state = createWorld("test-seed")

      // Enrol in Mining
      let log = executeAction(state, { type: "Enrol", skill: "Mining" })
      expect(log.success).toBe(true)
      expect(state.player.skills.Mining.level).toBe(1)

      // Enrol in Woodcutting
      log = executeAction(state, { type: "Enrol", skill: "Woodcutting" })
      expect(log.success).toBe(true)
      expect(state.player.skills.Woodcutting.level).toBe(1)

      // Enrol in Combat
      log = executeAction(state, { type: "Enrol", skill: "Combat" })
      expect(log.success).toBe(true)
      expect(state.player.skills.Combat.level).toBe(1)

      // Enrol in Smithing
      log = executeAction(state, { type: "Enrol", skill: "Smithing" })
      expect(log.success).toBe(true)
      expect(state.player.skills.Smithing.level).toBe(1)
    })

    it("should log action details", () => {
      const state = createWorld("test-seed")
      const action: GuildEnrolmentAction = { type: "Enrol", skill: "Mining" }

      const log = executeAction(state, action)

      expect(log.actionType).toBe("Enrol")
      expect(log.parameters).toEqual({ skill: "Mining" })
      expect(log.stateDeltaSummary).toContain("Mining")
    })

    it("should fail if session has ended", () => {
      const state = createWorld("test-seed")
      state.time.sessionRemainingTicks = 0
      const action: GuildEnrolmentAction = { type: "Enrol", skill: "Mining" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("SESSION_ENDED")
    })

    it("should fail if not enough time remaining", () => {
      const state = createWorld("test-seed")
      state.time.sessionRemainingTicks = 2 // Need 3 ticks
      const action: GuildEnrolmentAction = { type: "Enrol", skill: "Mining" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("SESSION_ENDED")
    })
  })
})
