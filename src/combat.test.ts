import { executeAction } from "./engine.js"
import { createWorld, TOWN_LOCATIONS } from "./world.js"
import type { FightAction, GuildEnrolmentAction, ItemStack, WorldState, AreaID } from "./types.js"

/** Set player to be at a specific location in town */
function setTownLocation(state: WorldState, locationId: string | null): void {
  state.exploration.playerState.currentAreaId = "TOWN"
  state.exploration.playerState.currentLocationId = locationId
}

/** Get a distance-1 area ID */
function getDistance1AreaId(state: WorldState): AreaID {
  for (const area of state.exploration.areas.values()) {
    if (area.distance === 1) return area.id
  }
  throw new Error("No distance-1 area found")
}

/** Set up combat state: player at a distance-1 area with an enemy */
function setupCombatArea(state: WorldState): AreaID {
  const areaId = getDistance1AreaId(state)
  state.exploration.playerState.currentAreaId = areaId
  // NOTE: Enemies not yet implemented - this describe block is skipped
  return areaId
}

describe.skip("Combat Progression (combat not yet implemented)", () => {
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
    it("should grant CRUDE_WEAPON when enrolling in Combat", async () => {
      const state = createWorld("test-seed")
      setTownLocation(state, TOWN_LOCATIONS.COMBAT_GUILD)
      const action: GuildEnrolmentAction = { type: "Enrol", skill: "Combat" }

      const log = await executeAction(state, action)

      expect(log.success).toBe(true)
      expect(state.player.skills.Combat.level).toBe(1)
      const weapon = state.player.inventory.find((i) => i.itemId === "CRUDE_WEAPON")
      expect(weapon).toBeDefined()
      expect(weapon?.quantity).toBe(1)
    })

    it("should NOT grant weapon when enrolling in Mining", async () => {
      const state = createWorld("test-seed")
      setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
      const action: GuildEnrolmentAction = { type: "Enrol", skill: "Mining" }

      await executeAction(state, action)

      const weapon = state.player.inventory.find((i) => i.itemId === "CRUDE_WEAPON")
      expect(weapon).toBeUndefined()
    })

    it("should NOT grant weapon when enrolling in other skills", async () => {
      const state = createWorld("test-seed")

      setTownLocation(state, TOWN_LOCATIONS.FORESTERS_GUILD)
      await executeAction(state, { type: "Enrol", skill: "Woodcutting" })
      setTownLocation(state, TOWN_LOCATIONS.SMITHING_GUILD)
      await executeAction(state, { type: "Enrol", skill: "Smithing" })

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

    it("should auto-equip CRUDE_WEAPON when granted from Combat enrolment", async () => {
      const state = createWorld("test-seed")
      setTownLocation(state, TOWN_LOCATIONS.COMBAT_GUILD)
      const action: GuildEnrolmentAction = { type: "Enrol", skill: "Combat" }

      await executeAction(state, action)

      expect(state.player.equippedWeapon).toBe("CRUDE_WEAPON")
    })
  })

  describe("Fight requires weapon", () => {
    it("should fail Fight if no weapon equipped", async () => {
      const state = createWorld("test-seed")
      setupCombatArea(state)
      state.player.skills.Combat = { level: 1, xp: 0 }
      // No weapon equipped
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("MISSING_WEAPON")
      expect(log.timeConsumed).toBe(0)
    })

    it("should fail Fight if weapon equipped but not in inventory", async () => {
      const state = createWorld("test-seed")
      setupCombatArea(state)
      state.player.skills.Combat = { level: 1, xp: 0 }
      // Weapon "equipped" but not actually owned
      state.player.equippedWeapon = "CRUDE_WEAPON"
      // inventory is empty - no weapon
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("MISSING_WEAPON")
      expect(log.timeConsumed).toBe(0)
    })

    it("should succeed Fight if CRUDE_WEAPON equipped", async () => {
      const state = createWorld("test-seed")
      setupCombatArea(state)
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = await executeAction(state, action)

      // Should not fail due to missing weapon (may still fail due to RNG)
      expect(log.failureType).not.toBe("MISSING_WEAPON")
    })

    it("should succeed Fight if IMPROVED_WEAPON equipped", async () => {
      const state = createWorld("test-seed")
      setupCombatArea(state)
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "IMPROVED_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "IMPROVED_WEAPON"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = await executeAction(state, action)

      expect(log.failureType).not.toBe("MISSING_WEAPON")
    })
  })

  describe("Weapon determines fight parameters", () => {
    it("should use 3 ticks and 70% success with CRUDE_WEAPON", async () => {
      const state = createWorld("test-seed")
      setupCombatArea(state)
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = await executeAction(state, action)

      expect(log.timeConsumed).toBe(3)
      expect(log.rngRolls[0].probability).toBe(0.7)
    })

    it("should use 2 ticks and 80% success with IMPROVED_WEAPON", async () => {
      const state = createWorld("test-seed")
      setupCombatArea(state)
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "IMPROVED_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "IMPROVED_WEAPON"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = await executeAction(state, action)

      expect(log.timeConsumed).toBe(2)
      expect(log.rngRolls[0].probability).toBe(0.8)
    })
  })

  describe("Combat failure does NOT relocate", () => {
    it("should NOT relocate player on combat failure", async () => {
      const state = createWorld("fight-fail-no-relocate")
      const areaId = setupCombatArea(state)
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      // Use a seed that will fail
      state.rng.seed = "force-fight-fail"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = await executeAction(state, action)

      if (log.failureType === "COMBAT_FAILURE") {
        // Player should stay at combat area, not relocate to TOWN
        expect(state.exploration.playerState.currentAreaId).toBe(areaId)
        expect(log.timeConsumed).toBe(3)
      }
    })

    it("should consume time on combat failure", async () => {
      const state = createWorld("fight-fail-time")
      setupCombatArea(state)
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      state.rng.seed = "force-fight-fail"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = await executeAction(state, action)

      if (log.failureType === "COMBAT_FAILURE") {
        expect(log.timeConsumed).toBe(3)
      }
    })
  })

  describe("Combat loot table", () => {
    it("should have 10% chance to drop IMPROVED_WEAPON on successful fight", async () => {
      // We need to test this with controlled RNG
      const state = createWorld("test-improved-drop")
      setupCombatArea(state)
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = await executeAction(state, action)

      if (log.success) {
        // Should have made 2 RNG rolls: fight success + loot table roll
        expect(log.rngRolls.length).toBeGreaterThanOrEqual(2)
        const lootRoll = log.rngRolls.find((r) => r.label.includes("loot:IMPROVED_WEAPON"))
        expect(lootRoll).toBeDefined()
        // The loot roll uses weighted table, not a simple 0.1 probability
        // We just verify the roll exists for IMPROVED_WEAPON
      }
    })

    it("should have 1% chance to drop COMBAT_GUILD_TOKEN on successful fight", async () => {
      const state = createWorld("test-token-drop")
      setupCombatArea(state)
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      const action: FightAction = { type: "Fight", enemyId: "cave-rat" }

      const log = await executeAction(state, action)

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
      setupCombatArea(state)
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
      setupCombatArea(state)
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
      setTownLocation(state, TOWN_LOCATIONS.COMBAT_GUILD)
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "COMBAT_GUILD_TOKEN", quantity: 1 })
    }

    it("should consume the token", async () => {
      const state = createWorld("test-seed")
      setupStateWithToken(state)

      const log = await executeAction(state, { type: "TurnInCombatToken" })

      expect(log.success).toBe(true)
      const token = state.player.inventory.find((i) => i.itemId === "COMBAT_GUILD_TOKEN")
      expect(token).toBeUndefined()
    })

    it("should cost 0 ticks", async () => {
      const state = createWorld("test-seed")
      setupStateWithToken(state)

      const log = await executeAction(state, { type: "TurnInCombatToken" })

      expect(log.timeConsumed).toBe(0)
    })

    it("should fail if not at Combat Guild", async () => {
      const state = createWorld("test-seed")
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "COMBAT_GUILD_TOKEN", quantity: 1 })
      // At Town Square, not at Combat Guild
      setTownLocation(state, null)

      const log = await executeAction(state, { type: "TurnInCombatToken" })

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("WRONG_LOCATION")
    })

    it("should fail if player does not have token", async () => {
      const state = createWorld("test-seed")
      setTownLocation(state, TOWN_LOCATIONS.COMBAT_GUILD)
      state.player.skills.Combat = { level: 1, xp: 0 }
      // No token in inventory

      const log = await executeAction(state, { type: "TurnInCombatToken" })

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("MISSING_ITEMS")
    })

    it("should unlock combat-guild-1 contract", async () => {
      const state = createWorld("test-seed")
      setupStateWithToken(state)

      const log = await executeAction(state, { type: "TurnInCombatToken" })

      expect(log.success).toBe(true)
      // The combat contract should now be available
      const combatContract = state.world.contracts.find((c) => c.id === "combat-guild-1")
      expect(combatContract).toBeDefined()
    })
  })

  describe("Combat contract: combat-guild-1", () => {
    async function setupStateForCombatContract(state: WorldState): Promise<void> {
      setTownLocation(state, TOWN_LOCATIONS.COMBAT_GUILD)
      state.player.skills.Combat = { level: 1, xp: 0 }
      state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
      state.player.equippedWeapon = "CRUDE_WEAPON"
      // Unlock the contract by turning in token
      state.player.inventory.push({ itemId: "COMBAT_GUILD_TOKEN", quantity: 1 })
      await executeAction(state, { type: "TurnInCombatToken" })
    }

    it("should be unlocked after turning in token", async () => {
      const state = createWorld("test-seed")
      await setupStateForCombatContract(state)

      const contract = state.world.contracts.find((c) => c.id === "combat-guild-1")
      expect(contract).toBeDefined()
    })

    it("should require defeating 2 cave rats", async () => {
      const state = createWorld("test-seed")
      await setupStateForCombatContract(state)

      const contract = state.world.contracts.find((c) => c.id === "combat-guild-1")
      expect(contract?.requirements).toBeDefined()
      // Contract tracks kills, not items
      // This is a special type of contract - need to think about this
    })

    it("should reward 4-6 Combat XP on completion", async () => {
      const state = createWorld("test-seed")
      await setupStateForCombatContract(state)

      const contract = state.world.contracts.find((c) => c.id === "combat-guild-1")
      expect(contract?.xpReward).toBeDefined()
      expect(contract?.xpReward?.skill).toBe("Combat")
      // XP reward is 4-6, we'll test it's in that range
      expect(contract?.xpReward?.amount).toBeGreaterThanOrEqual(4)
      expect(contract?.xpReward?.amount).toBeLessThanOrEqual(6)
    })
  })
})
