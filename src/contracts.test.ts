/**
 * Tests for Mining Contract Generation
 */

import { createWorld, TOWN_LOCATIONS } from "./world.js"
import {
  MATERIAL_TIERS,
  getMaterialTierForLevel,
  getQuantityForLevel,
  rollBounty,
  generateMiningContract,
  refreshMiningContracts,
  initializeMiningContracts,
} from "./contracts.js"
import { createRng } from "./rng.js"

describe("Contract Generation", () => {
  describe("MATERIAL_TIERS constant", () => {
    it("should have 8 material tiers matching the design spec", () => {
      expect(Object.keys(MATERIAL_TIERS)).toHaveLength(8)
    })

    it("should have correct unlock levels per spec", () => {
      expect(MATERIAL_TIERS.STONE.unlockLevel).toBe(1)
      expect(MATERIAL_TIERS.COPPER_ORE.unlockLevel).toBe(20)
      expect(MATERIAL_TIERS.TIN_ORE.unlockLevel).toBe(40)
      expect(MATERIAL_TIERS.IRON_ORE.unlockLevel).toBe(60)
      expect(MATERIAL_TIERS.SILVER_ORE.unlockLevel).toBe(80)
      expect(MATERIAL_TIERS.GOLD_ORE.unlockLevel).toBe(100)
      expect(MATERIAL_TIERS.MITHRIL_ORE.unlockLevel).toBe(120)
      expect(MATERIAL_TIERS.OBSIDIUM_ORE.unlockLevel).toBe(140)
    })

    it("should have correct resale values per spec", () => {
      expect(MATERIAL_TIERS.STONE.resaleValue).toBe(0.1)
      expect(MATERIAL_TIERS.COPPER_ORE.resaleValue).toBe(0.4)
      expect(MATERIAL_TIERS.TIN_ORE.resaleValue).toBe(1.0)
      expect(MATERIAL_TIERS.IRON_ORE.resaleValue).toBe(2.5)
      expect(MATERIAL_TIERS.SILVER_ORE.resaleValue).toBe(6.0)
      expect(MATERIAL_TIERS.GOLD_ORE.resaleValue).toBe(15.0)
      expect(MATERIAL_TIERS.MITHRIL_ORE.resaleValue).toBe(35.0)
      expect(MATERIAL_TIERS.OBSIDIUM_ORE.resaleValue).toBe(80.0)
    })

    it("should have correct reputation values per spec", () => {
      expect(MATERIAL_TIERS.STONE.reputation).toBe(5)
      expect(MATERIAL_TIERS.COPPER_ORE.reputation).toBe(10)
      expect(MATERIAL_TIERS.TIN_ORE.reputation).toBe(20)
      expect(MATERIAL_TIERS.IRON_ORE.reputation).toBe(40)
      expect(MATERIAL_TIERS.SILVER_ORE.reputation).toBe(80)
      expect(MATERIAL_TIERS.GOLD_ORE.reputation).toBe(160)
      expect(MATERIAL_TIERS.MITHRIL_ORE.reputation).toBe(320)
      expect(MATERIAL_TIERS.OBSIDIUM_ORE.reputation).toBe(640)
    })
  })

  describe("getMaterialTierForLevel", () => {
    it("should return STONE for levels 1-19", () => {
      expect(getMaterialTierForLevel(1)).toBe("STONE")
      expect(getMaterialTierForLevel(10)).toBe("STONE")
      expect(getMaterialTierForLevel(19)).toBe("STONE")
    })

    it("should return COPPER_ORE for levels 20-39", () => {
      expect(getMaterialTierForLevel(20)).toBe("COPPER_ORE")
      expect(getMaterialTierForLevel(30)).toBe("COPPER_ORE")
      expect(getMaterialTierForLevel(39)).toBe("COPPER_ORE")
    })

    it("should return higher tiers for higher levels", () => {
      expect(getMaterialTierForLevel(40)).toBe("TIN_ORE")
      expect(getMaterialTierForLevel(60)).toBe("IRON_ORE")
      expect(getMaterialTierForLevel(80)).toBe("SILVER_ORE")
      expect(getMaterialTierForLevel(100)).toBe("GOLD_ORE")
      expect(getMaterialTierForLevel(120)).toBe("MITHRIL_ORE")
      expect(getMaterialTierForLevel(140)).toBe("OBSIDIUM_ORE")
    })

    it("should return highest tier for very high levels", () => {
      expect(getMaterialTierForLevel(200)).toBe("OBSIDIUM_ORE")
    })
  })

  describe("getQuantityForLevel", () => {
    it("should return ~5 at start of tier", () => {
      // Stone tier starts at L1
      expect(getQuantityForLevel(1)).toBeGreaterThanOrEqual(4)
      expect(getQuantityForLevel(1)).toBeLessThanOrEqual(6)
    })

    it("should return ~12 at mid-tier", () => {
      // Stone tier mid-point is around L10
      expect(getQuantityForLevel(10)).toBeGreaterThanOrEqual(10)
      expect(getQuantityForLevel(10)).toBeLessThanOrEqual(14)
    })

    it("should return ~20 at end of tier", () => {
      // Stone tier ends at L19
      expect(getQuantityForLevel(19)).toBeGreaterThanOrEqual(18)
      expect(getQuantityForLevel(19)).toBeLessThanOrEqual(22)
    })

    it("should reset quantity at new tier start", () => {
      // Copper tier starts at L20
      expect(getQuantityForLevel(20)).toBeGreaterThanOrEqual(4)
      expect(getQuantityForLevel(20)).toBeLessThanOrEqual(6)
    })
  })

  describe("rollBounty", () => {
    it("should return values between 0.1 and 2.0", () => {
      const rng = createRng("bounty-test")
      for (let i = 0; i < 100; i++) {
        const bounty = rollBounty(rng)
        expect(bounty).toBeGreaterThanOrEqual(0.1)
        expect(bounty).toBeLessThanOrEqual(2.0)
      }
    })

    it("should be deterministic based on RNG", () => {
      const rng1 = createRng("bounty-determinism")
      const rng2 = createRng("bounty-determinism")

      const bounty1 = rollBounty(rng1)
      const bounty2 = rollBounty(rng2)

      expect(bounty1).toBe(bounty2)
    })
  })

  describe("generateMiningContract", () => {
    it("should generate a valid at-level contract", () => {
      const state = createWorld("contract-gen-test")
      state.player.skills.Mining = { level: 10, xp: 0 }

      const contract = generateMiningContract("at-level", {
        playerMiningLevel: 10,
        existingContracts: [],
        rng: state.rng,
      })

      expect(contract).not.toBeNull()
      expect(contract!.id).toBeDefined()
      expect(contract!.guildType).toBe("Mining")
      expect(contract!.acceptLocationId).toBe(TOWN_LOCATIONS.MINERS_GUILD)
      expect(contract!.requirements).toHaveLength(1)
      expect(contract!.requirements[0].itemId).toBe("STONE") // L10 is in Stone tier
      expect(contract!.goldReward).toBeGreaterThan(0)
      expect(contract!.reputationReward).toBe(5) // Stone tier rep
    })

    it("should generate aspirational contract with next tier material", () => {
      const state = createWorld("contract-gen-aspirational")
      state.player.skills.Mining = { level: 10, xp: 0 }

      const contract = generateMiningContract("aspirational", {
        playerMiningLevel: 10,
        existingContracts: [],
        rng: state.rng,
      })

      expect(contract).not.toBeNull()
      // L10 is Stone tier, so aspirational should be Copper
      expect(contract!.requirements[0].itemId).toBe("COPPER_ORE")
      expect(contract!.reputationReward).toBe(10) // Copper tier rep
    })

    it("should return null for aspirational if at max tier", () => {
      const state = createWorld("contract-gen-max-tier")

      const contract = generateMiningContract("aspirational", {
        playerMiningLevel: 140, // Max tier (Obsidium)
        existingContracts: [],
        rng: state.rng,
      })

      expect(contract).toBeNull()
    })

    it("should calculate gold reward based on quantity, resale value, and bounty", () => {
      const state = createWorld("contract-gold-calc")
      state.player.skills.Mining = { level: 1, xp: 0 }

      const contract = generateMiningContract("at-level", {
        playerMiningLevel: 1,
        existingContracts: [],
        rng: state.rng,
      })

      // Gold = quantity * resaleValue * (1 + bounty)
      // Stone resale = 0.1, bounty is between 0.1 and 2.0
      // So gold should be between quantity * 0.1 * 1.1 and quantity * 0.1 * 3.0
      const quantity = contract!.requirements[0].quantity
      const minGold = quantity * 0.1 * 1.1
      const maxGold = quantity * 0.1 * 3.0

      expect(contract!.goldReward).toBeGreaterThanOrEqual(minGold - 0.01)
      expect(contract!.goldReward).toBeLessThanOrEqual(maxGold + 0.01)
    })

    it("should not grant XP (player earned XP from mining)", () => {
      const state = createWorld("contract-no-xp")

      const contract = generateMiningContract("at-level", {
        playerMiningLevel: 10,
        existingContracts: [],
        rng: state.rng,
      })

      expect(contract!.xpReward).toBeUndefined()
    })

    it("should have empty rewards array (gold is separate)", () => {
      const state = createWorld("contract-empty-rewards")

      const contract = generateMiningContract("at-level", {
        playerMiningLevel: 10,
        existingContracts: [],
        rng: state.rng,
      })

      expect(contract!.rewards).toEqual([])
    })

    it("should generate deterministic contracts", () => {
      const rng1 = createRng("determinism-test")
      const rng2 = createRng("determinism-test")

      const contract1 = generateMiningContract("at-level", {
        playerMiningLevel: 10,
        existingContracts: [],
        rng: rng1,
      })

      const contract2 = generateMiningContract("at-level", {
        playerMiningLevel: 10,
        existingContracts: [],
        rng: rng2,
      })

      expect(contract1!.requirements).toEqual(contract2!.requirements)
      expect(contract1!.goldReward).toBe(contract2!.goldReward)
      expect(contract1!.reputationReward).toBe(contract2!.reputationReward)
    })
  })

  describe("refreshMiningContracts", () => {
    it("should generate both at-level and aspirational contracts when enrolled", () => {
      const state = createWorld("refresh-test")
      state.player.skills.Mining = { level: 10, xp: 0 }

      refreshMiningContracts(state)

      const miningContracts = state.world.contracts.filter((c) => c.guildType === "Mining")
      expect(miningContracts).toHaveLength(2)

      const atLevel = miningContracts.find((c) => c.slot === "at-level")
      const aspirational = miningContracts.find((c) => c.slot === "aspirational")

      expect(atLevel).toBeDefined()
      expect(aspirational).toBeDefined()

      // At-level should require Stone (L10 tier)
      expect(atLevel!.requirements[0].itemId).toBe("STONE")
      // Aspirational should require Copper (next tier)
      expect(aspirational!.requirements[0].itemId).toBe("COPPER_ORE")
    })

    it("should not generate contracts if player not enrolled in Mining", () => {
      const state = createWorld("refresh-not-enrolled")
      // Mining level is 0 by default

      refreshMiningContracts(state)

      const miningContracts = state.world.contracts.filter((c) => c.guildType === "Mining")
      expect(miningContracts).toHaveLength(0)
    })

    it("should only generate at-level at max tier (no aspirational)", () => {
      const state = createWorld("refresh-max-tier")
      state.player.skills.Mining = { level: 140, xp: 0 }

      refreshMiningContracts(state)

      const miningContracts = state.world.contracts.filter((c) => c.guildType === "Mining")
      expect(miningContracts).toHaveLength(1)
      expect(miningContracts[0].slot).toBe("at-level")
      expect(miningContracts[0].requirements[0].itemId).toBe("OBSIDIUM_ORE")
    })

    it("should refresh only the specified slot", () => {
      const state = createWorld("refresh-single-slot")
      state.player.skills.Mining = { level: 10, xp: 0 }

      // First, generate both contracts
      refreshMiningContracts(state)
      const originalAtLevel = state.world.contracts.find(
        (c) => c.guildType === "Mining" && c.slot === "at-level"
      )
      const originalAspirational = state.world.contracts.find(
        (c) => c.guildType === "Mining" && c.slot === "aspirational"
      )

      // Refresh only at-level slot
      refreshMiningContracts(state, "at-level")

      const newAtLevel = state.world.contracts.find(
        (c) => c.guildType === "Mining" && c.slot === "at-level"
      )
      const newAspirational = state.world.contracts.find(
        (c) => c.guildType === "Mining" && c.slot === "aspirational"
      )

      // At-level should have new ID
      expect(newAtLevel!.id).not.toBe(originalAtLevel!.id)
      // Aspirational should be unchanged
      expect(newAspirational!.id).toBe(originalAspirational!.id)
    })

    it("should remove existing mining contracts when refreshing all", () => {
      const state = createWorld("refresh-remove-old")
      state.player.skills.Mining = { level: 10, xp: 0 }

      // Generate initial contracts
      refreshMiningContracts(state)
      const originalIds = state.world.contracts
        .filter((c) => c.guildType === "Mining")
        .map((c) => c.id)

      // Refresh all contracts
      refreshMiningContracts(state)
      const newIds = state.world.contracts.filter((c) => c.guildType === "Mining").map((c) => c.id)

      // All IDs should be different
      expect(newIds).not.toEqual(originalIds)
    })
  })

  describe("initializeMiningContracts", () => {
    it("should not initialize contracts if player not enrolled", () => {
      const state = createWorld("init-not-enrolled")

      initializeMiningContracts(state)

      const miningContracts = state.world.contracts.filter((c) => c.guildType === "Mining")
      expect(miningContracts).toHaveLength(0)
    })

    it("should initialize contracts if player already enrolled", () => {
      const state = createWorld("init-enrolled")
      state.player.skills.Mining = { level: 1, xp: 0 }

      initializeMiningContracts(state)

      const miningContracts = state.world.contracts.filter((c) => c.guildType === "Mining")
      expect(miningContracts.length).toBeGreaterThan(0)
    })
  })

  describe("gold rewards", () => {
    it("should award gold when completing a mining contract", async () => {
      const { executeAction } = await import("./engine.js")
      const { checkAndCompleteContracts } = await import("./stateHelpers.js")

      const state = createWorld("gold-reward-test")
      state.player.skills.Mining = { level: 10, xp: 0 }

      // Generate mining contracts
      refreshMiningContracts(state)

      // Find the at-level contract
      const contract = state.world.contracts.find(
        (c) => c.guildType === "Mining" && c.slot === "at-level"
      )
      expect(contract).toBeDefined()
      expect(contract!.goldReward).toBeDefined()
      expect(contract!.goldReward).toBeGreaterThan(0)

      const contractId = contract!.id

      // Go to miners guild and accept the contract
      state.exploration.playerState.currentAreaId = "TOWN"
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

      const acceptLog = await executeAction(state, {
        type: "AcceptContract",
        contractId,
      })
      expect(acceptLog.success).toBe(true)

      // Verify the contract is still in world.contracts and in activeContracts
      expect(state.player.activeContracts).toContain(contractId)
      const contractAfterAccept = state.world.contracts.find((c) => c.id === contractId)
      expect(contractAfterAccept).toBeDefined()

      // Give player the required items (all in one stack)
      const requiredItem = contract!.requirements[0]
      state.player.inventory.push({ itemId: requiredItem.itemId, quantity: requiredItem.quantity })

      // Starting gold
      const startingGold = state.player.gold
      expect(startingGold).toBe(0)

      // Check contracts - should complete and award gold
      const completions = checkAndCompleteContracts(state)

      expect(completions).toHaveLength(1)
      expect(completions[0].goldEarned).toBe(contract!.goldReward)
      expect(state.player.gold).toBe(contract!.goldReward)
    })
  })
})
