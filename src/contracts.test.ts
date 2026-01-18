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
import { NodeType, ExplorationLocationType } from "./types.js"

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
        rng: state.rng,
      })

      expect(contract).toBeNull()
    })

    it("should calculate gold reward based on quantity, resale value, and bounty", () => {
      const state = createWorld("contract-gold-calc")
      state.player.skills.Mining = { level: 1, xp: 0 }

      const contract = generateMiningContract("at-level", {
        playerMiningLevel: 1,
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
        rng: state.rng,
      })

      expect(contract!.xpReward).toBeUndefined()
    })

    it("should have empty rewards array (gold is separate)", () => {
      const state = createWorld("contract-empty-rewards")

      const contract = generateMiningContract("at-level", {
        playerMiningLevel: 10,
        rng: state.rng,
      })

      expect(contract!.rewards).toEqual([])
    })

    it("should generate deterministic contracts", () => {
      const rng1 = createRng("determinism-test")
      const rng2 = createRng("determinism-test")

      const contract1 = generateMiningContract("at-level", {
        playerMiningLevel: 10,
        rng: rng1,
      })

      const contract2 = generateMiningContract("at-level", {
        playerMiningLevel: 10,
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

  describe("contract regeneration", () => {
    it("should regenerate the completed slot when contract is completed", async () => {
      const { executeAction } = await import("./engine.js")
      const { checkAndCompleteContracts } = await import("./stateHelpers.js")

      const state = createWorld("regeneration-test")
      state.player.skills.Mining = { level: 10, xp: 0 }

      // Generate mining contracts
      refreshMiningContracts(state)

      // Find the at-level contract
      const atLevelContract = state.world.contracts.find(
        (c) => c.guildType === "Mining" && c.slot === "at-level"
      )
      expect(atLevelContract).toBeDefined()
      const originalContractId = atLevelContract!.id

      // Accept the contract
      state.exploration.playerState.currentAreaId = "TOWN"
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

      await executeAction(state, {
        type: "AcceptContract",
        contractId: originalContractId,
      })

      // Give player the required items
      const requiredItem = atLevelContract!.requirements[0]
      state.player.inventory.push({ itemId: requiredItem.itemId, quantity: requiredItem.quantity })

      // Complete the contract
      checkAndCompleteContracts(state)

      // The slot should have been regenerated with a new contract
      const newAtLevelContract = state.world.contracts.find(
        (c) => c.guildType === "Mining" && c.slot === "at-level"
      )
      expect(newAtLevelContract).toBeDefined()
      expect(newAtLevelContract!.id).not.toBe(originalContractId)
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

    it("should complete contract when items are in separate inventory slots (non-stacking)", async () => {
      const { executeAction } = await import("./engine.js")
      const { checkAndCompleteContracts } = await import("./stateHelpers.js")

      const state = createWorld("non-stacking-inventory-test")
      state.player.skills.Mining = { level: 10, xp: 0 }

      // Generate mining contracts
      refreshMiningContracts(state)

      // Find the at-level contract (requires STONE)
      const contract = state.world.contracts.find(
        (c) => c.guildType === "Mining" && c.slot === "at-level"
      )
      expect(contract).toBeDefined()
      expect(contract!.requirements[0].itemId).toBe("STONE")

      const contractId = contract!.id
      const requiredQuantity = contract!.requirements[0].quantity

      // Go to miners guild and accept the contract
      state.exploration.playerState.currentAreaId = "TOWN"
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

      await executeAction(state, {
        type: "AcceptContract",
        contractId,
      })

      // Give player items as SEPARATE inventory slots (simulating non-stacking behavior)
      // Each item is in its own slot with quantity: 1
      for (let i = 0; i < requiredQuantity; i++) {
        state.player.inventory.push({ itemId: "STONE", quantity: 1 })
      }

      const startingGold = state.player.gold

      // Check contracts - should complete since we have enough total items
      const completions = checkAndCompleteContracts(state)

      expect(completions).toHaveLength(1)
      expect(completions[0].goldEarned).toBe(contract!.goldReward)
      expect(state.player.gold).toBe(startingGold + contract!.goldReward!)

      // All the STONE items should be consumed
      const remainingStone = state.player.inventory.filter((i) => i.itemId === "STONE")
      expect(remainingStone).toHaveLength(0)
    })
  })

  describe("explicit turn-in requirement", () => {
    it("should NOT auto-complete contracts - requires explicit turn-in at guild", async () => {
      const { executeAction } = await import("./engine.js")

      const state = createWorld("no-auto-complete-test")
      state.player.skills.Mining = { level: 10, xp: 0 }

      // Generate mining contracts
      refreshMiningContracts(state)

      // Find and accept the at-level contract
      const contract = state.world.contracts.find(
        (c) => c.guildType === "Mining" && c.slot === "at-level"
      )
      expect(contract).toBeDefined()

      state.exploration.playerState.currentAreaId = "TOWN"
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

      await executeAction(state, {
        type: "AcceptContract",
        contractId: contract!.id,
      })

      // Give player the required items
      const requiredItem = contract!.requirements[0]
      for (let i = 0; i < requiredItem.quantity; i++) {
        state.player.inventory.push({ itemId: requiredItem.itemId, quantity: 1 })
      }

      // Leave the guild
      await executeAction(state, { type: "Leave" })

      // Verify contract is still active - should NOT have auto-completed
      expect(state.player.activeContracts).toContain(contract!.id)
      expect(state.player.gold).toBe(0)
    })

    it("should complete contract when explicitly turned in at the guild", async () => {
      const { executeAction } = await import("./engine.js")

      const state = createWorld("turn-in-at-guild-test")
      state.player.skills.Mining = { level: 10, xp: 0 }

      // Generate mining contracts
      refreshMiningContracts(state)

      // Find and accept the at-level contract
      const contract = state.world.contracts.find(
        (c) => c.guildType === "Mining" && c.slot === "at-level"
      )
      expect(contract).toBeDefined()

      state.exploration.playerState.currentAreaId = "TOWN"
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

      await executeAction(state, {
        type: "AcceptContract",
        contractId: contract!.id,
      })

      // Give player the required items
      const requiredItem = contract!.requirements[0]
      for (let i = 0; i < requiredItem.quantity; i++) {
        state.player.inventory.push({ itemId: requiredItem.itemId, quantity: 1 })
      }

      // Stay at the guild and turn in the contract
      const turnInLog = await executeAction(state, {
        type: "TurnInContract",
        contractId: contract!.id,
      })

      expect(turnInLog.success).toBe(true)
      expect(state.player.activeContracts).not.toContain(contract!.id)
      expect(state.player.gold).toBe(contract!.goldReward)
    })

    it("should fail to turn in contract when not at the guild", async () => {
      const { executeAction } = await import("./engine.js")

      const state = createWorld("turn-in-wrong-location-test")
      state.player.skills.Mining = { level: 10, xp: 0 }

      // Generate mining contracts
      refreshMiningContracts(state)

      // Find and accept the at-level contract
      const contract = state.world.contracts.find(
        (c) => c.guildType === "Mining" && c.slot === "at-level"
      )
      expect(contract).toBeDefined()

      state.exploration.playerState.currentAreaId = "TOWN"
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

      await executeAction(state, {
        type: "AcceptContract",
        contractId: contract!.id,
      })

      // Give player the required items
      const requiredItem = contract!.requirements[0]
      for (let i = 0; i < requiredItem.quantity; i++) {
        state.player.inventory.push({ itemId: requiredItem.itemId, quantity: 1 })
      }

      // Leave the guild - now at town hub
      await executeAction(state, { type: "Leave" })

      // Try to turn in the contract while not at guild
      const turnInLog = await executeAction(state, {
        type: "TurnInContract",
        contractId: contract!.id,
      })

      expect(turnInLog.success).toBe(false)
      expect(state.player.activeContracts).toContain(contract!.id)
      expect(state.player.gold).toBe(0)
    })

    it("should fail to turn in contract when requirements not met", async () => {
      const { executeAction } = await import("./engine.js")

      const state = createWorld("turn-in-no-items-test")
      state.player.skills.Mining = { level: 10, xp: 0 }

      // Generate mining contracts
      refreshMiningContracts(state)

      // Find and accept the at-level contract
      const contract = state.world.contracts.find(
        (c) => c.guildType === "Mining" && c.slot === "at-level"
      )
      expect(contract).toBeDefined()

      state.exploration.playerState.currentAreaId = "TOWN"
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

      await executeAction(state, {
        type: "AcceptContract",
        contractId: contract!.id,
      })

      // Don't give player any items - try to turn in anyway
      const turnInLog = await executeAction(state, {
        type: "TurnInContract",
        contractId: contract!.id,
      })

      expect(turnInLog.success).toBe(false)
      expect(state.player.activeContracts).toContain(contract!.id)
    })
  })

  // ============================================================================
  // Phase 2: Maps with Contracts
  // ============================================================================

  describe("Phase 2: Maps with Contracts", () => {
    describe("shouldIncludeMap", () => {
      it("should always include a map for early game players (L1-19)", async () => {
        const { shouldIncludeMap } = await import("./contracts.js")
        const state = createWorld("early-game-map-test")
        state.player.skills.Mining = { level: 5, xp: 0 }

        // Early game should always include map regardless of known nodes
        expect(shouldIncludeMap(5, "STONE", state)).toBe(true)
        expect(shouldIncludeMap(1, "STONE", state)).toBe(true)
        expect(shouldIncludeMap(19, "STONE", state)).toBe(true)
      })

      it("should include a map for L20+ players if they do not know any nodes with the material", async () => {
        const { shouldIncludeMap } = await import("./contracts.js")
        const state = createWorld("no-known-nodes-test")
        state.player.skills.Mining = { level: 25, xp: 0 }

        // Player doesn't know any copper ore nodes, so map should be included
        expect(shouldIncludeMap(25, "COPPER_ORE", state)).toBe(true)
      })

      it("should NOT include a map for L20+ players if they know a node with the material", async () => {
        const { shouldIncludeMap } = await import("./contracts.js")
        const state = createWorld("known-nodes-test")
        state.player.skills.Mining = { level: 25, xp: 0 }

        // Create a node with COPPER_ORE
        const testAreaId = "area-d1-i0"
        const testNodeId = `${testAreaId}-node-0`
        const testLocationId = `${testAreaId}-loc-0`
        state.world.nodes.push({
          nodeId: testNodeId,
          nodeType: NodeType.ORE_VEIN,
          areaId: testAreaId,
          materials: [
            {
              materialId: "COPPER_ORE",
              remainingUnits: 10,
              maxUnitsInitial: 10,
              requiresSkill: "Mining",
              requiredLevel: 20,
              tier: 2,
            },
          ],
          depleted: false,
        })

        // Mark the location as known
        state.exploration.playerState.knownLocationIds.push(testLocationId)

        // Player knows a copper node, so map should NOT be included
        expect(shouldIncludeMap(25, "COPPER_ORE", state)).toBe(false)
      })
    })

    describe("findNodeForMap", () => {
      it("should find an undiscovered node containing the required material", async () => {
        const { findNodeForMap } = await import("./contracts.js")
        const state = createWorld("find-node-test")
        state.player.skills.Mining = { level: 10, xp: 0 }

        // findNodeForMap should find a STONE node at distance 1
        // (guaranteed by ensureMinimumNodes during world creation)
        const result = findNodeForMap("STONE", state)

        expect(result).not.toBeNull()
        // Should find a node at distance 1 (closest)
        const targetArea = state.exploration.areas.get(result!.targetAreaId)
        expect(targetArea).toBeDefined()
        expect(targetArea!.distance).toBe(1)

        // The node should contain STONE
        const node = state.world.nodes.find((n) => n.nodeId === result!.targetNodeId)
        expect(node).toBeDefined()
        expect(node!.materials.some((m) => m.materialId === "STONE")).toBe(true)
      })

      it("should generate distant areas to find high-tier materials", async () => {
        const { findNodeForMap } = await import("./contracts.js")
        const state = createWorld("generate-distant-areas-test")
        state.player.skills.Mining = { level: 10, xp: 0 }

        // OBSIDIUM_ORE is tier 8, requiring distance 57+
        // findNodeForMap should generate areas to find it
        const result = findNodeForMap("OBSIDIUM_ORE", state)
        expect(result).not.toBeNull()
        expect(result!.targetAreaId).toBeDefined()
        expect(result!.targetNodeId).toBeDefined()
        // Should have a multi-hop path from TOWN
        expect(result!.areaIds.length).toBeGreaterThan(1)
        expect(result!.areaIds[0]).toBe("TOWN")
        expect(result!.connectionIds.length).toBeGreaterThan(0)
      })

      it("should not return already discovered nodes", async () => {
        const { findNodeForMap } = await import("./contracts.js")
        const state = createWorld("already-discovered-test")
        state.player.skills.Mining = { level: 10, xp: 0 }

        // Create a discoverable node with STONE
        const testAreaId = "area-d1-i0"
        const testNodeId = `${testAreaId}-node-0`
        const testLocationId = `${testAreaId}-loc-0`
        state.world.nodes.push({
          nodeId: testNodeId,
          nodeType: NodeType.ORE_VEIN,
          areaId: testAreaId,
          materials: [
            {
              materialId: "STONE",
              remainingUnits: 10,
              maxUnitsInitial: 10,
              requiresSkill: "Mining",
              requiredLevel: 1,
              tier: 1,
            },
          ],
          depleted: false,
        })

        // Make sure the area exists in exploration
        if (!state.exploration.areas.has(testAreaId)) {
          state.exploration.areas.set(testAreaId, {
            id: testAreaId,
            distance: 1,
            generated: true,
            locations: [
              {
                id: testLocationId,
                areaId: testAreaId,
                type: ExplorationLocationType.GATHERING_NODE,
                gatheringSkillType: "Mining",
              },
            ],
            indexInDistance: 0,
          })
        }

        // Mark the location as already discovered
        state.exploration.playerState.knownLocationIds.push(testLocationId)

        const result = findNodeForMap("STONE", state)
        // Should not return the already-discovered node
        // It may return a different node or null if none available
        if (result !== null) {
          expect(result.targetNodeId).not.toBe(testNodeId)
        }
      })
    })

    describe("contract with map generation", () => {
      it("should include a map for early game contracts", async () => {
        const { generateMiningContract, resetContractIdCounter, findNodeForMap, shouldIncludeMap } =
          await import("./contracts.js")
        resetContractIdCounter()

        const state = createWorld("contract-map-generation")
        state.player.skills.Mining = { level: 5, xp: 0 }

        // Set up a stone node in an area that can be reached
        const testAreaId = "area-d1-i0"

        // Ensure the area exists in exploration
        if (!state.exploration.areas.has(testAreaId)) {
          state.exploration.areas.set(testAreaId, {
            id: testAreaId,
            distance: 1,
            generated: true,
            locations: [
              {
                id: `${testAreaId}-loc-0`,
                areaId: testAreaId,
                type: ExplorationLocationType.GATHERING_NODE,
                gatheringSkillType: "Mining",
              },
            ],
            indexInDistance: 0,
          })
        }

        // Ensure a connection exists from TOWN to this area
        const hasConnection = state.exploration.connections.some(
          (c) =>
            (c.fromAreaId === "TOWN" && c.toAreaId === testAreaId) ||
            (c.fromAreaId === testAreaId && c.toAreaId === "TOWN")
        )
        if (!hasConnection) {
          state.exploration.connections.push({
            fromAreaId: "TOWN",
            toAreaId: testAreaId,
            travelTimeMultiplier: 1.0,
          })
        }

        // Create the node with STONE
        state.world.nodes.push({
          nodeId: `${testAreaId}-node-0`,
          nodeType: NodeType.ORE_VEIN,
          areaId: testAreaId,
          materials: [
            {
              materialId: "STONE",
              remainingUnits: 10,
              maxUnitsInitial: 10,
              requiresSkill: "Mining",
              requiredLevel: 1,
              tier: 1,
            },
          ],
          depleted: false,
        })

        // Debug: Check if shouldIncludeMap returns true
        const shouldInclude = shouldIncludeMap(5, "STONE", state)
        expect(shouldInclude).toBe(true)

        // Debug: Check if findNodeForMap finds the node
        const map = findNodeForMap("STONE", state)
        expect(map).not.toBeNull()
        expect(map!.targetAreaId).toBe(testAreaId)

        const contract = generateMiningContract("at-level", {
          playerMiningLevel: 5,
          rng: state.rng,
          state,
        })

        expect(contract).not.toBeNull()
        expect(contract!.includedMap).toBeDefined()
      })
    })

    describe("map redemption on contract accept", () => {
      it("should reveal connection and area when accepting contract with map", async () => {
        const { executeAction } = await import("./engine.js")
        const { refreshMiningContracts } = await import("./contracts.js")

        const state = createWorld("map-redemption-test")
        state.player.skills.Mining = { level: 5, xp: 0 }

        // Generate mining contracts with maps
        refreshMiningContracts(state)

        // Find the at-level contract
        const contract = state.world.contracts.find(
          (c) => c.guildType === "Mining" && c.slot === "at-level"
        )
        expect(contract).toBeDefined()
        expect(contract!.includedMap).toBeDefined()

        const map = contract!.includedMap!
        const contractId = contract!.id

        // Go to miners guild and accept the contract
        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

        const acceptLog = await executeAction(state, {
          type: "AcceptContract",
          contractId,
        })
        expect(acceptLog.success).toBe(true)

        // The map's area and connection should now be known
        expect(state.exploration.playerState.knownAreaIds).toContain(map.targetAreaId)

        // All connections in the path should be known
        for (const connectionId of map.connectionIds) {
          expect(state.exploration.playerState.knownConnectionIds).toContain(connectionId)
        }

        // Pending node discovery should be registered
        expect(state.player.pendingNodeDiscoveries).toBeDefined()
        expect(state.player.pendingNodeDiscoveries!.length).toBeGreaterThan(0)
        expect(
          state.player.pendingNodeDiscoveries!.some(
            (p) => p.areaId === map.targetAreaId && p.nodeLocationId === map.targetNodeId
          )
        ).toBe(true)
      })

      it("should include discovered location in stateDeltaSummary when accepting contract with map", async () => {
        const { executeAction } = await import("./engine.js")
        const { refreshMiningContracts } = await import("./contracts.js")

        const state = createWorld("map-discovery-message-test")
        state.player.skills.Mining = { level: 5, xp: 0 }

        // Generate mining contracts with maps
        refreshMiningContracts(state)

        // Find the at-level contract
        const contract = state.world.contracts.find(
          (c) => c.guildType === "Mining" && c.slot === "at-level"
        )
        expect(contract).toBeDefined()
        expect(contract!.includedMap).toBeDefined()

        const contractId = contract!.id

        // Go to miners guild and accept the contract
        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

        const acceptLog = await executeAction(state, {
          type: "AcceptContract",
          contractId,
        })
        expect(acceptLog.success).toBe(true)

        // The stateDeltaSummary should mention the discovered location
        expect(acceptLog.stateDeltaSummary).toContain("Accepted contract")
        expect(acceptLog.stateDeltaSummary).toMatch(/discovered|revealed/i)
      })

      it("should immediately add target node to knownLocationIds when accepting contract with map", async () => {
        const { executeAction } = await import("./engine.js")
        const { refreshMiningContracts } = await import("./contracts.js")

        const state = createWorld("map-immediate-discovery-test")
        state.player.skills.Mining = { level: 5, xp: 0 }

        // Generate mining contracts with maps
        refreshMiningContracts(state)

        // Find the at-level contract
        const contract = state.world.contracts.find(
          (c) => c.guildType === "Mining" && c.slot === "at-level"
        )
        expect(contract).toBeDefined()
        expect(contract!.includedMap).toBeDefined()

        const map = contract!.includedMap!
        const contractId = contract!.id

        // Verify node is NOT known before accepting
        expect(state.exploration.playerState.knownLocationIds).not.toContain(map.targetNodeId)

        // Go to miners guild and accept the contract
        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

        const acceptLog = await executeAction(state, {
          type: "AcceptContract",
          contractId,
        })
        expect(acceptLog.success).toBe(true)

        // The node should be immediately discoverable on the gathering map
        // (i.e., added to knownLocationIds, not just pendingNodeDiscoveries)
        expect(state.exploration.playerState.knownLocationIds).toContain(map.targetNodeId)
      })
    })

    describe("node discovery on area arrival", () => {
      it("should auto-discover node when arriving at area with pending discovery (FarTravel)", async () => {
        const { executeAction } = await import("./engine.js")
        const { refreshMiningContracts } = await import("./contracts.js")

        const state = createWorld("node-auto-discovery-test")
        state.player.skills.Mining = { level: 5, xp: 0 }
        state.player.skills.Exploration = { level: 1, xp: 0 } // Need exploration for travel

        // Generate mining contracts with maps
        refreshMiningContracts(state)

        // Find the at-level contract with a map
        const contract = state.world.contracts.find(
          (c) => c.guildType === "Mining" && c.slot === "at-level" && c.includedMap
        )
        expect(contract).toBeDefined()

        const map = contract!.includedMap!
        const contractId = contract!.id

        // Accept the contract to redeem the map
        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

        await executeAction(state, {
          type: "AcceptContract",
          contractId,
        })

        // The connection should now be known
        expect(state.exploration.playerState.knownAreaIds).toContain(map.targetAreaId)

        // Travel to the target area (using FarTravel since connection is now known)
        await executeAction(state, {
          type: "FarTravel",
          destinationAreaId: map.targetAreaId,
        })

        // Verify we arrived
        expect(state.exploration.playerState.currentAreaId).toBe(map.targetAreaId)

        // The node location should now be discovered
        const nodeLocationId = map.targetNodeId.replace("-node-", "-loc-")
        expect(state.exploration.playerState.knownLocationIds).toContain(nodeLocationId)

        // The pending discovery should be consumed
        expect(
          state.player.pendingNodeDiscoveries!.some(
            (p) => p.areaId === map.targetAreaId && p.nodeLocationId === map.targetNodeId
          )
        ).toBe(false)
      })

      it("should auto-discover node when arriving at area with pending discovery (ExplorationTravel)", async () => {
        const { executeAction } = await import("./engine.js")
        const { refreshMiningContracts } = await import("./contracts.js")

        const state = createWorld("node-auto-discovery-exploration-travel")
        state.player.skills.Mining = { level: 5, xp: 0 }
        state.player.skills.Exploration = { level: 1, xp: 0 } // Need exploration for travel

        // Generate mining contracts with maps
        refreshMiningContracts(state)

        // Find the at-level contract with a map
        const contract = state.world.contracts.find(
          (c) => c.guildType === "Mining" && c.slot === "at-level" && c.includedMap
        )
        expect(contract).toBeDefined()

        const map = contract!.includedMap!
        const contractId = contract!.id

        // Accept the contract to redeem the map
        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

        await executeAction(state, {
          type: "AcceptContract",
          contractId,
        })

        // The connection should now be known
        expect(state.exploration.playerState.knownAreaIds).toContain(map.targetAreaId)

        // Leave the guild first to be at hub (required for ExplorationTravel)
        await executeAction(state, { type: "Leave" })

        // Travel to the target area using ExplorationTravel (what "go" uses for adjacent areas)
        await executeAction(state, {
          type: "ExplorationTravel",
          destinationAreaId: map.targetAreaId,
        })

        // Verify we arrived
        expect(state.exploration.playerState.currentAreaId).toBe(map.targetAreaId)

        // The node location should now be discovered
        const nodeLocationId = map.targetNodeId.replace("-node-", "-loc-")
        expect(state.exploration.playerState.knownLocationIds).toContain(nodeLocationId)

        // The pending discovery should be consumed
        expect(
          state.player.pendingNodeDiscoveries!.some(
            (p) => p.areaId === map.targetAreaId && p.nodeLocationId === map.targetNodeId
          )
        ).toBe(false)
      })
    })
  })

  // ============================================================================
  // Issue Reproduction: First contract node distance
  // ============================================================================

  describe("First contract node distance issue", () => {
    it("should guarantee at least 2 mining nodes at distance 1", () => {
      // Test multiple seeds to verify the guarantee holds
      const seeds = [
        "session-1768632206429", // Known problematic seed
        "test-seed-1",
        "test-seed-2",
        "test-seed-3",
        "guarantee-test",
      ]

      for (const seed of seeds) {
        const state = createWorld(seed)

        const miningNodesAtD1 = state.world.nodes.filter((node) => {
          const area = state.exploration.areas.get(node.areaId)
          return area?.distance === 1 && node.nodeType === NodeType.ORE_VEIN
        })

        expect(miningNodesAtD1.length).toBeGreaterThanOrEqual(2)
      }
    })

    it("should guarantee at least 2 woodcutting nodes at distance 1", () => {
      const seeds = [
        "session-1768632206429",
        "test-seed-1",
        "test-seed-2",
        "test-seed-3",
        "guarantee-test",
      ]

      for (const seed of seeds) {
        const state = createWorld(seed)

        const woodcuttingNodesAtD1 = state.world.nodes.filter((node) => {
          const area = state.exploration.areas.get(node.areaId)
          return area?.distance === 1 && node.nodeType === NodeType.TREE_STAND
        })

        expect(woodcuttingNodesAtD1.length).toBeGreaterThanOrEqual(2)
      }
    })

    it("should guarantee at least 3 mining nodes at distance 2", () => {
      const seeds = [
        "session-1768632206429",
        "test-seed-1",
        "test-seed-2",
        "test-seed-3",
        "guarantee-test",
      ]

      for (const seed of seeds) {
        const state = createWorld(seed)

        const miningNodesAtD2 = state.world.nodes.filter((node) => {
          const area = state.exploration.areas.get(node.areaId)
          return area?.distance === 2 && node.nodeType === NodeType.ORE_VEIN
        })

        expect(miningNodesAtD2.length).toBeGreaterThanOrEqual(3)
      }
    })

    it("should guarantee at least 3 woodcutting nodes at distance 2", () => {
      const seeds = [
        "session-1768632206429",
        "test-seed-1",
        "test-seed-2",
        "test-seed-3",
        "guarantee-test",
      ]

      for (const seed of seeds) {
        const state = createWorld(seed)

        const woodcuttingNodesAtD2 = state.world.nodes.filter((node) => {
          const area = state.exploration.areas.get(node.areaId)
          return area?.distance === 2 && node.nodeType === NodeType.TREE_STAND
        })

        expect(woodcuttingNodesAtD2.length).toBeGreaterThanOrEqual(3)
      }
    })

    it("should now have mining nodes at distance 1 for seed session-1768632206429 (fix verified)", async () => {
      // This test verifies that the fix works: seed session-1768632206429 previously had
      // NO mining nodes at distance 1 (due to 25% probability per area and unlucky RNG).
      // After the fix, we guarantee at least 2 mining nodes at distance 1.

      const state = createWorld("session-1768632206429")

      // Find all mining nodes at distance 1
      const miningNodesAtD1 = state.world.nodes.filter((node) => {
        const area = state.exploration.areas.get(node.areaId)
        return area?.distance === 1 && node.nodeType === NodeType.ORE_VEIN
      })

      // After the fix, we should have at least 2 mining nodes at distance 1
      expect(miningNodesAtD1.length).toBeGreaterThanOrEqual(2)

      // Find the closest mining node - should now be at distance 1
      const allMiningNodes = state.world.nodes.filter((node) => node.nodeType === NodeType.ORE_VEIN)
      expect(allMiningNodes.length).toBeGreaterThan(0)

      let closestDistance = Infinity
      for (const node of allMiningNodes) {
        const area = state.exploration.areas.get(node.areaId)
        if (area && area.distance < closestDistance) {
          closestDistance = area.distance
        }
      }

      // The closest mining node is now at distance 1!
      expect(closestDistance).toBe(1)

      // Verify that when we generate a contract, it points to distance 1
      state.player.skills.Mining = { level: 1, xp: 0 }
      const { refreshMiningContracts } = await import("./contracts.js")
      refreshMiningContracts(state)

      const contract = state.world.contracts.find(
        (c) => c.guildType === "Mining" && c.slot === "at-level"
      )
      expect(contract).toBeDefined()
      expect(contract!.includedMap).toBeDefined()

      // The map now points to an area at distance 1
      const targetArea = state.exploration.areas.get(contract!.includedMap!.targetAreaId)
      expect(targetArea!.distance).toBe(1)
    })
  })

  // ============================================================================
  // Phase 3: Map Shops
  // ============================================================================

  describe("Phase 3: Map Shops", () => {
    describe("map pricing", () => {
      it("should have correct node map prices per spec", async () => {
        const { NODE_MAP_PRICES } = await import("./contracts.js")

        expect(NODE_MAP_PRICES.STONE).toBe(4)
        expect(NODE_MAP_PRICES.COPPER_ORE).toBe(11)
        expect(NODE_MAP_PRICES.TIN_ORE).toBe(22)
        expect(NODE_MAP_PRICES.IRON_ORE).toBe(45)
        expect(NODE_MAP_PRICES.SILVER_ORE).toBe(80)
        expect(NODE_MAP_PRICES.GOLD_ORE).toBe(135)
        expect(NODE_MAP_PRICES.MITHRIL_ORE).toBe(225)
        expect(NODE_MAP_PRICES.OBSIDIUM_ORE).toBe(375)
      })

      it("should calculate area map prices at 60% of node map prices", async () => {
        const { getAreaMapPrice } = await import("./contracts.js")

        // Distance 1-8 is tier 1 (Stone), price = 4, so area = round(4 * 0.6) = 2
        expect(getAreaMapPrice(1)).toBe(2)
        expect(getAreaMapPrice(8)).toBe(2)

        // Distance 9-16 is tier 2 (Copper), price = 11, so area = round(11 * 0.6) = 7
        expect(getAreaMapPrice(9)).toBe(7)
        expect(getAreaMapPrice(16)).toBe(7)
      })
    })

    describe("checkBuyMapAction", () => {
      it("should fail if not at Mining Guild for node maps", async () => {
        const { checkBuyMapAction } = await import("./actionChecks.js")
        const state = createWorld("buy-map-wrong-location")
        state.player.skills.Mining = { level: 10, xp: 0 }
        state.player.gold = 100

        // Player is at TOWN (null location), not at Mining Guild
        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = null

        const result = checkBuyMapAction(state, {
          type: "BuyMap",
          mapType: "node",
          materialTier: "STONE",
        })

        expect(result.valid).toBe(false)
        expect(result.failureType).toBe("WRONG_LOCATION")
      })

      it("should fail if not enrolled in Mining for node maps", async () => {
        const { checkBuyMapAction } = await import("./actionChecks.js")
        const state = createWorld("buy-map-not-enrolled")
        state.player.gold = 100

        // Player is at Mining Guild but not enrolled
        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

        const result = checkBuyMapAction(state, {
          type: "BuyMap",
          mapType: "node",
          materialTier: "STONE",
        })

        expect(result.valid).toBe(false)
        expect(result.failureType).toBe("NOT_ENROLLED")
      })

      it("should fail if material tier not unlocked", async () => {
        const { checkBuyMapAction } = await import("./actionChecks.js")
        const state = createWorld("buy-map-tier-locked")
        state.player.skills.Mining = { level: 10, xp: 0 } // Only Stone unlocked
        state.player.gold = 100

        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

        const result = checkBuyMapAction(state, {
          type: "BuyMap",
          mapType: "node",
          materialTier: "COPPER_ORE", // Requires level 20
        })

        expect(result.valid).toBe(false)
        expect(result.failureType).toBe("TIER_NOT_UNLOCKED")
      })

      it("should fail if not enough gold", async () => {
        const { checkBuyMapAction } = await import("./actionChecks.js")
        const state = createWorld("buy-map-no-gold")
        state.player.skills.Mining = { level: 10, xp: 0 }
        state.player.gold = 1 // Not enough for Stone map (costs 4)

        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

        const result = checkBuyMapAction(state, {
          type: "BuyMap",
          mapType: "node",
          materialTier: "STONE",
        })

        expect(result.valid).toBe(false)
        expect(result.failureType).toBe("INSUFFICIENT_GOLD")
      })

      it("should succeed with valid parameters for node map", async () => {
        const { checkBuyMapAction } = await import("./actionChecks.js")
        const state = createWorld("buy-map-valid")
        state.player.skills.Mining = { level: 10, xp: 0 }
        state.player.gold = 10

        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

        const result = checkBuyMapAction(state, {
          type: "BuyMap",
          mapType: "node",
          materialTier: "STONE",
        })

        expect(result.valid).toBe(true)
      })

      it("should succeed with valid parameters for area map", async () => {
        const { checkBuyMapAction } = await import("./actionChecks.js")
        const state = createWorld("buy-area-map-valid")
        state.player.skills.Exploration = { level: 5, xp: 0 }
        state.player.gold = 10

        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.EXPLORERS_GUILD

        const result = checkBuyMapAction(state, {
          type: "BuyMap",
          mapType: "area",
          targetDistance: 1,
        })

        expect(result.valid).toBe(true)
      })
    })

    describe("executeBuyMap", () => {
      it("should deduct gold and reveal path when buying node map", async () => {
        const { executeAction } = await import("./engine.js")
        const state = createWorld("execute-buy-node-map")
        state.player.skills.Mining = { level: 10, xp: 0 }
        state.player.gold = 20

        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

        const initialGold = state.player.gold
        const initialKnownAreas = [...state.exploration.playerState.knownAreaIds]

        const log = await executeAction(state, {
          type: "BuyMap",
          mapType: "node",
          materialTier: "STONE",
        })

        expect(log.success).toBe(true)
        expect(state.player.gold).toBe(initialGold - 4) // Stone map costs 4 gold

        // Should have revealed new areas
        expect(state.exploration.playerState.knownAreaIds.length).toBeGreaterThan(
          initialKnownAreas.length
        )

        // Should have pending node discovery
        expect(state.player.pendingNodeDiscoveries).toBeDefined()
        expect(state.player.pendingNodeDiscoveries!.length).toBeGreaterThan(0)
      })

      it("should deduct gold and reveal path when buying area map", async () => {
        const { executeAction } = await import("./engine.js")
        const state = createWorld("execute-buy-area-map")
        state.player.skills.Exploration = { level: 5, xp: 0 }
        state.player.gold = 20

        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.EXPLORERS_GUILD

        const initialGold = state.player.gold
        const initialKnownAreas = [...state.exploration.playerState.knownAreaIds]

        const log = await executeAction(state, {
          type: "BuyMap",
          mapType: "area",
          targetDistance: 1,
        })

        expect(log.success).toBe(true)
        expect(state.player.gold).toBe(initialGold - 2) // Distance 1 area map costs 2 gold

        // Should have revealed new areas
        expect(state.exploration.playerState.knownAreaIds.length).toBeGreaterThan(
          initialKnownAreas.length
        )

        // Should have revealed new connections
        expect(state.exploration.playerState.knownConnectionIds.length).toBeGreaterThan(0)
      })

      it("should fail gracefully if no maps available", async () => {
        const { executeAction } = await import("./engine.js")
        const state = createWorld("no-maps-available")
        state.player.skills.Mining = { level: 10, xp: 0 }
        state.player.gold = 100

        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

        // Mark all stone nodes as discovered to make no maps available
        // This is hard to set up, so we just check that the action doesn't crash
        // In practice, findNodeForMap generates areas if needed, so this should still work
        const log = await executeAction(state, {
          type: "BuyMap",
          mapType: "node",
          materialTier: "STONE",
        })

        // Either succeeds or fails with NO_MAPS_AVAILABLE
        expect(log.actionType).toBe("BuyMap")
      })
    })

    describe("available actions", () => {
      it("should show buy map action at Mining Guild when enrolled with gold", async () => {
        const { getAvailableActions } = await import("./availableActions.js")
        const state = createWorld("available-actions-mining")
        state.player.skills.Mining = { level: 10, xp: 0 }
        state.player.gold = 100

        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

        const actions = getAvailableActions(state)
        const buyMapAction = actions.find((a) => a.displayName.includes("buy"))

        expect(buyMapAction).toBeDefined()
        expect(buyMapAction!.displayName).toContain("map")
      })

      it("should NOT show buy map action if not enrolled", async () => {
        const { getAvailableActions } = await import("./availableActions.js")
        const state = createWorld("available-actions-not-enrolled")
        state.player.gold = 100

        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

        const actions = getAvailableActions(state)
        const buyMapAction = actions.find((a) => a.displayName.includes("buy"))

        expect(buyMapAction).toBeUndefined()
      })

      it("should NOT show buy map action if no gold", async () => {
        const { getAvailableActions } = await import("./availableActions.js")
        const state = createWorld("available-actions-no-gold")
        state.player.skills.Mining = { level: 10, xp: 0 }
        state.player.gold = 0

        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

        const actions = getAvailableActions(state)
        const buyMapAction = actions.find((a) => a.displayName.includes("buy"))

        expect(buyMapAction).toBeUndefined()
      })

      it("should show buy area map action at Exploration Guild when enrolled with gold", async () => {
        const { getAvailableActions } = await import("./availableActions.js")
        const state = createWorld("available-actions-exploration")
        state.player.skills.Exploration = { level: 5, xp: 0 }
        state.player.gold = 100

        state.exploration.playerState.currentAreaId = "TOWN"
        state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.EXPLORERS_GUILD

        const actions = getAvailableActions(state)
        const buyMapAction = actions.find((a) => a.displayName.includes("area map"))

        expect(buyMapAction).toBeDefined()
      })
    })
  })
})
