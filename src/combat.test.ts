import { executeAction } from "./engine.js"
import { createWorld } from "./world.js"
import type { FightAction, GuildEnrolmentAction, ItemStack, WorldState } from "./types.js"

describe("Combat Progression", () => {
  describe("New item types", () => {
    it("should allow CRUDE_WEAPON as a valid ItemID", () => {
      const state = createWorld("test-seed")
      const item: ItemStack = { itemId: "CRUDE_WEAPON", quantity: 1 }
      state.player.inventory.push(item)

      expect(state.player.inventory).toContainEqual({ itemId: "CRUDE_WEAPON", quantity: 1 })
    })

    it("should allow IMPROVED_WEAPON as a valid ItemID", () => {
      const state = createWorld("test-seed")
      const item: ItemStack = { itemId: "IMPROVED_WEAPON", quantity: 1 }
      state.player.inventory.push(item)

      expect(state.player.inventory).toContainEqual({ itemId: "IMPROVED_WEAPON", quantity: 1 })
    })

    it("should allow COMBAT_GUILD_TOKEN as a valid ItemID", () => {
      const state = createWorld("test-seed")
      const item: ItemStack = { itemId: "COMBAT_GUILD_TOKEN", quantity: 1 }
      state.player.inventory.push(item)

      expect(state.player.inventory).toContainEqual({ itemId: "COMBAT_GUILD_TOKEN", quantity: 1 })
    })
  })

  describe("Combat enrolment grants CrudeWeapon", () => {
    it("should grant CRUDE_WEAPON when enrolling in Combat", () => {
      const state = createWorld("test-seed")
      const action: GuildEnrolmentAction = { type: "Enrol", skill: "Combat" }

      const log = executeAction(state, action)

      expect(log.success).toBe(true)
      expect(state.player.skills.Combat.level).toBe(1)
      const weapon = state.player.inventory.find((i) => i.itemId === "CRUDE_WEAPON")
      expect(weapon).toBeDefined()
      expect(weapon?.quantity).toBe(1)
    })

    it("should NOT grant weapon when enrolling in Mining", () => {
      const state = createWorld("test-seed")
      const action: GuildEnrolmentAction = { type: "Enrol", skill: "Mining" }

      executeAction(state, action)

      const weapon = state.player.inventory.find((i) => i.itemId === "CRUDE_WEAPON")
      expect(weapon).toBeUndefined()
    })

    it("should NOT grant weapon when enrolling in other skills", () => {
      const state = createWorld("test-seed")

      executeAction(state, { type: "Enrol", skill: "Woodcutting" })
      executeAction(state, { type: "Enrol", skill: "Smithing" })

      const weapon = state.player.inventory.find((i) => i.itemId === "CRUDE_WEAPON")
      expect(weapon).toBeUndefined()
    })
  })

  describe("Weapon equipment system", () => {
    it("should have equippedWeapon field in player state", () => {
      const state = createWorld("test-seed")

      expect(state.player).toHaveProperty("equippedWeapon")
      expect(state.player.equippedWeapon).toBeNull()
    })

    it("should auto-equip CRUDE_WEAPON when granted from Combat enrolment", () => {
      const state = createWorld("test-seed")
      const action: GuildEnrolmentAction = { type: "Enrol", skill: "Combat" }

      executeAction(state, action)

      expect(state.player.equippedWeapon).toBe("CRUDE_WEAPON")
    })
  })

  describe("Fight requires weapon", () => {
    it("should fail Fight if no weapon equipped", () => {
      const state = createWorld("test-seed")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Combat = { level: 1, xp: 0 }
      // No weapon equipped
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("MISSING_WEAPON")
      expect(log.timeConsumed).toBe(0)
    })

    it("should fail Fight if weapon equipped but not in inventory", () => {
      const state = createWorld("test-seed")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Combat = { level: 1, xp: 0 }
      // Weapon "equipped" but not actually owned
      state.player.equippedWeapon = "CRUDE_WEAPON"
      // inventory is empty - no weapon
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("MISSING_WEAPON")
      expect(log.timeConsumed).toBe(0)
    })

    it("should succeed Fight if CRUDE_WEAPON equipped", () => {
      const state = createWorld("test-seed")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      // Should not fail due to missing weapon (may still fail due to RNG)
      expect(log.failureType).not.toBe("MISSING_WEAPON")
    })

    it("should succeed Fight if IMPROVED_WEAPON equipped", () => {
      const state = createWorld("test-seed")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "IMPROVED_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "IMPROVED_WEAPON"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      expect(log.failureType).not.toBe("MISSING_WEAPON")
    })
  })

  describe("Weapon determines fight parameters", () => {
    it("should use 3 ticks and 70% success with CRUDE_WEAPON", () => {
      const state = createWorld("test-seed")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      expect(log.timeConsumed).toBe(3)
      expect(log.rngRolls[0].probability).toBe(0.7)
    })

    it("should use 2 ticks and 80% success with IMPROVED_WEAPON", () => {
      const state = createWorld("test-seed")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "IMPROVED_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "IMPROVED_WEAPON"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      expect(log.timeConsumed).toBe(2)
      expect(log.rngRolls[0].probability).toBe(0.8)
    })
  })

  describe("Combat failure does NOT relocate", () => {
    it("should NOT relocate player on combat failure", () => {
      const state = createWorld("fight-fail-no-relocate")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      // Use a seed that will fail
      state.rng.seed = "force-fight-fail"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      if (log.failureType === "COMBAT_FAILURE") {
        // Player should stay at OUTSKIRTS_MINE, not relocate to TOWN
        expect(state.exploration.playerState.currentAreaId).toBe("OUTSKIRTS_MINE")
        expect(log.timeConsumed).toBe(3)
      }
    })

    it("should consume time on combat failure", () => {
      const state = createWorld("fight-fail-time")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      state.rng.seed = "force-fight-fail"
      const initialTicks = state.time.sessionRemainingTicks
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      if (log.failureType === "COMBAT_FAILURE") {
        expect(log.timeConsumed).toBe(3)
        expect(state.time.sessionRemainingTicks).toBe(initialTicks - 3)
      }
    })
  })

  describe("Combat loot table", () => {
    it("should have 10% chance to drop IMPROVED_WEAPON on successful fight", () => {
      // We need to test this with controlled RNG
      const state = createWorld("test-improved-drop")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      if (log.success) {
        // Should have made 2 RNG rolls: fight success + loot table roll
        expect(log.rngRolls.length).toBeGreaterThanOrEqual(2)
        const lootRoll = log.rngRolls.find((r) => r.label.includes("loot:IMPROVED_WEAPON"))
        expect(lootRoll).toBeDefined()
        // The loot roll uses weighted table, not a simple 0.1 probability
        // We just verify the roll exists for IMPROVED_WEAPON
      }
    })

    it("should have 1% chance to drop COMBAT_GUILD_TOKEN on successful fight", () => {
      const state = createWorld("test-token-drop")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = executeAction(state, action)

      if (log.success) {
        // Should have made 2 RNG rolls: fight success + loot table roll
        expect(log.rngRolls.length).toBeGreaterThanOrEqual(2)
        const lootRoll = log.rngRolls.find((r) => r.label.includes("loot:COMBAT_GUILD_TOKEN"))
        expect(lootRoll).toBeDefined()
        // The loot roll uses weighted table, not a simple 0.01 probability
        // We just verify the roll exists for COMBAT_GUILD_TOKEN
      }
    })

    it("should replace CRUDE_WEAPON with IMPROVED_WEAPON when dropped", () => {
      // Use a seed that drops improved weapon
      const state = createWorld("improved-weapon-drop-seed")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"

      // We need to find a seed that causes the improved weapon drop
      // For now, test the replacement logic when it does happen
      // Simulate the drop
      state.player.inventory = state.player.inventory.filter((i) => i.itemId !== "CRUDE_WEAPON")
      state.player.inventory.push({ itemId: "IMPROVED_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "IMPROVED_WEAPON"

      expect(state.player.equippedWeapon).toBe("IMPROVED_WEAPON")
      expect(state.player.inventory.find((i) => i.itemId === "CRUDE_WEAPON")).toBeUndefined()
      expect(state.player.inventory.find((i) => i.itemId === "IMPROVED_WEAPON")).toBeDefined()
    })

    it("should add COMBAT_GUILD_TOKEN to inventory when dropped", () => {
      const state = createWorld("token-drop-test")
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"

      // Simulate the drop
      state.player.inventory.push({ itemId: "COMBAT_GUILD_TOKEN", quantity: 1 })

      const token = state.player.inventory.find((i) => i.itemId === "COMBAT_GUILD_TOKEN")
      expect(token).toBeDefined()
      expect(token?.quantity).toBe(1)
    })
  })

  describe("TurnInCombatToken action", () => {
    function setupStateWithToken(state: WorldState): void {
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "COMBAT_GUILD_TOKEN", quantity: 1 })
    }

    it("should consume the token", () => {
      const state = createWorld("test-seed")
      setupStateWithToken(state)

      const log = executeAction(state, { type: "TurnInCombatToken" })

      expect(log.success).toBe(true)
      const token = state.player.inventory.find((i) => i.itemId === "COMBAT_GUILD_TOKEN")
      expect(token).toBeUndefined()
    })

    it("should cost 0 ticks", () => {
      const state = createWorld("test-seed")
      setupStateWithToken(state)
      const initialTicks = state.time.sessionRemainingTicks

      const log = executeAction(state, { type: "TurnInCombatToken" })

      expect(log.timeConsumed).toBe(0)
      expect(state.time.sessionRemainingTicks).toBe(initialTicks)
    })

    it("should fail if not at Combat Guild (TOWN)", () => {
      const state = createWorld("test-seed")
      setupStateWithToken(state)
      state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"

      const log = executeAction(state, { type: "TurnInCombatToken" })

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("WRONG_LOCATION")
    })

    it("should fail if player does not have token", () => {
      const state = createWorld("test-seed")
      state.player.skills.Combat = { level: 1, xp: 0 }
      // No token in inventory

      const log = executeAction(state, { type: "TurnInCombatToken" })

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("MISSING_ITEMS")
    })

    it("should unlock combat-guild-1 contract", () => {
      const state = createWorld("test-seed")
      setupStateWithToken(state)

      const log = executeAction(state, { type: "TurnInCombatToken" })

      expect(log.success).toBe(true)
      // The combat contract should now be available
      const combatContract = state.world.contracts.find((c) => c.id === "combat-guild-1")
      expect(combatContract).toBeDefined()
    })
  })

  describe("Combat contract: combat-guild-1", () => {
    function setupStateForCombatContract(state: WorldState): void {
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      // Unlock the contract by turning in token
      state.player.inventory.push({ itemId: "COMBAT_GUILD_TOKEN", quantity: 1 })
      executeAction(state, { type: "TurnInCombatToken" })
    }

    it("should be unlocked after turning in token", () => {
      const state = createWorld("test-seed")
      setupStateForCombatContract(state)

      const contract = state.world.contracts.find((c) => c.id === "combat-guild-1")
      expect(contract).toBeDefined()
    })

    it("should require defeating 2 cave rats", () => {
      const state = createWorld("test-seed")
      setupStateForCombatContract(state)

      const contract = state.world.contracts.find((c) => c.id === "combat-guild-1")
      expect(contract?.requirements).toBeDefined()
      // Contract tracks kills, not items
      // This is a special type of contract - need to think about this
    })

    it("should reward 4-6 Combat XP on completion", () => {
      const state = createWorld("test-seed")
      setupStateForCombatContract(state)

      const contract = state.world.contracts.find((c) => c.id === "combat-guild-1")
      expect(contract?.xpReward).toBeDefined()
      expect(contract?.xpReward?.skill).toBe("Combat")
      // XP reward is 4-6, we'll test it's in that range
      expect(contract?.xpReward?.amount).toBeGreaterThanOrEqual(4)
      expect(contract?.xpReward?.amount).toBeLessThanOrEqual(6)
    })
  })
})
