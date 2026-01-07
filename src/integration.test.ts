import { executeAction } from "./engine.js"
import { evaluatePlan } from "./evaluate.js"
import { createWorld } from "./world.js"
import type { Action, ActionLog, LocationID } from "./types.js"
import { GatherMode } from "./types.js"

describe("Integration: Full Session Flow", () => {
  it("should run a complete session with various actions", () => {
    const state = createWorld("integration-test-seed")
    // Set skills to level 1 to allow actions
    state.player.skills.Mining = { level: 1, xp: 0 }
    state.player.skills.Smithing = { level: 1, xp: 0 }
    const logs: ActionLog[] = []

    // Accept a contract at TOWN
    logs.push(executeAction(state, { type: "AcceptContract", contractId: "miners-guild-1" }))
    expect(logs[logs.length - 1].success).toBe(true)
    expect(state.player.activeContracts).toContain("miners-guild-1")

    // Move to OUTSKIRTS_MINE
    logs.push(executeAction(state, { type: "Move", destination: "OUTSKIRTS_MINE" }))
    expect(logs[logs.length - 1].success).toBe(true)
    expect(state.exploration.playerState.currentAreaId).toBe("OUTSKIRTS_MINE")

    // Get a copper ore node ID from the mine
    const copperNode = state.world.nodes.find(
      (n) => n.areaId === "OUTSKIRTS_MINE" && n.materials.some((m) => m.materialId === "COPPER_ORE")
    )

    // Gather copper ore multiple times
    if (copperNode) {
      for (let i = 0; i < 3; i++) {
        logs.push(
          executeAction(state, {
            type: "Gather",
            nodeId: copperNode.nodeId,
            mode: GatherMode.FOCUS,
            focusMaterialId: "COPPER_ORE",
          })
        )
      }
    }

    // Move back to TOWN
    logs.push(executeAction(state, { type: "Move", destination: "TOWN" }))

    // Try to craft if we have enough copper ore
    const copperOre = state.player.inventory.find((i) => i.itemId === "COPPER_ORE")
    if (copperOre && copperOre.quantity >= 2) {
      logs.push(executeAction(state, { type: "Craft", recipeId: "copper-bar-recipe" }))
    }

    // Session should have consumed ticks
    expect(state.time.currentTick).toBeGreaterThan(0)
    expect(state.time.sessionRemainingTicks).toBeLessThan(200)

    // All logs should have valid structure
    for (const log of logs) {
      expect(log.tickBefore).toBeDefined()
      expect(log.actionType).toBeDefined()
      expect(log.success).toBeDefined()
      expect(log.timeConsumed).toBeDefined()
      expect(log.rngRolls).toBeDefined()
      expect(log.stateDeltaSummary).toBeDefined()
    }
  })

  it("should demonstrate RNG determinism", () => {
    // Run the same sequence twice with the same seed
    const results1 = runSession("determinism-test")
    const results2 = runSession("determinism-test")

    // Results should be identical
    expect(results1.logs.length).toBe(results2.logs.length)
    for (let i = 0; i < results1.logs.length; i++) {
      expect(results1.logs[i].success).toBe(results2.logs[i].success)
      expect(results1.logs[i].rngRolls).toEqual(results2.logs[i].rngRolls)
    }
  })

  it("should demonstrate logging shows what happened and why", () => {
    const state = createWorld("logging-test")
    state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
    const logs: ActionLog[] = []

    // Move to mine
    logs.push(executeAction(state, { type: "Move", destination: "OUTSKIRTS_MINE" }))

    // Get a node from the mine
    const mineNode = state.world.nodes.find((n) => n.areaId === "OUTSKIRTS_MINE")
    const material = mineNode?.materials[0]

    // Gather (may succeed or fail based on RNG)
    if (mineNode && material) {
      logs.push(
        executeAction(state, {
          type: "Gather",
          nodeId: mineNode.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: material.materialId,
        })
      )
    }

    const gatherLog = logs[1]

    // Log should show:
    // - What happened (success/failure)
    expect(typeof gatherLog.success).toBe("boolean")

    // - Why (RNG rolls) - FOCUS mode uses RNG for extraction rolls
    if (gatherLog.rngRolls && gatherLog.rngRolls.length > 0) {
      expect(gatherLog.rngRolls[0].label).toContain("extract")
    }

    // - What skill advanced (if success)
    if (gatherLog.success) {
      expect(gatherLog.skillGained?.skill).toBe("Mining")
      expect(gatherLog.skillGained?.amount).toBeGreaterThan(0)
    }

    // - State change summary
    expect(gatherLog.stateDeltaSummary).toBeDefined()
  })

  it("should demonstrate plan evaluation finds violations", () => {
    const state = createWorld("plan-test")
    state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather

    // Get a node from the mine
    const mineNode = state.world.nodes.find((n) => n.areaId === "OUTSKIRTS_MINE")!
    const material = mineNode.materials[0]

    // Valid plan: move to mine, gather, move back
    const validPlan: Action[] = [
      { type: "Move", destination: "OUTSKIRTS_MINE" },
      {
        type: "Gather",
        nodeId: mineNode.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      },
      {
        type: "Gather",
        nodeId: mineNode.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      },
      { type: "Move", destination: "TOWN" },
    ]

    const validResult = evaluatePlan(state, validPlan)
    expect(validResult.violations).toHaveLength(0)
    // Move (0) + Gather FOCUS (5) + Gather FOCUS (5) + Move (0) = 10
    expect(validResult.expectedTime).toBe(10)

    // Invalid plan: try to gather at wrong location
    const invalidPlan: Action[] = [
      {
        type: "Gather",
        nodeId: mineNode.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      }, // Can't gather at TOWN
    ]

    const invalidResult = evaluatePlan(state, invalidPlan)
    expect(invalidResult.violations.length).toBeGreaterThan(0)
  })

  it("should demonstrate session ends when ticks run out", () => {
    const state = createWorld("session-end-test")
    const logs: ActionLog[] = []

    // Keep moving until session ends
    let sessionEnded = false
    const destinations: LocationID[] = ["OUTSKIRTS_MINE", "COPSE", "TOWN"]
    let i = 0

    while (!sessionEnded && i < 100) {
      const dest = destinations[i % 3]
      if (state.exploration.playerState.currentAreaId !== dest) {
        const log = executeAction(state, { type: "Move", destination: dest })
        logs.push(log)

        if (log.failureType === "SESSION_ENDED") {
          sessionEnded = true
        }
      }
      i++
    }

    // Session should have ended (either flag set or no ticks remaining)
    expect(sessionEnded || state.time.sessionRemainingTicks <= 0).toBe(true)
  })

  it("should show how dominant strategies might form", () => {
    // This test demonstrates that we can evaluate different strategies
    const state = createWorld("strategy-test")
    state.player.skills.Mining = { level: 1, xp: 0 } // Need level 1 to gather
    state.player.skills.Combat = { level: 1, xp: 0 } // Need level 1 to fight
    state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
    state.player.equippedWeapon = "CRUDE_WEAPON" // Need weapon to fight

    // Get a node from the mine
    const mineNode = state.world.nodes.find((n) => n.areaId === "OUTSKIRTS_MINE")!
    const material = mineNode.materials[0]

    // Strategy 1: Pure gathering
    const gatherStrategy: Action[] = [
      { type: "Move", destination: "OUTSKIRTS_MINE" },
      {
        type: "Gather",
        nodeId: mineNode.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      },
      {
        type: "Gather",
        nodeId: mineNode.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      },
      {
        type: "Gather",
        nodeId: mineNode.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      },
      {
        type: "Gather",
        nodeId: mineNode.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      },
    ]

    // Strategy 2: Fighting
    const fightStrategy: Action[] = [
      { type: "Move", destination: "OUTSKIRTS_MINE" },
      { type: "Fight", enemyId: "cave-rat" },
      { type: "Fight", enemyId: "cave-rat" },
      { type: "Fight", enemyId: "cave-rat" },
    ]

    const gatherEval = evaluatePlan(state, gatherStrategy)
    const fightEval = evaluatePlan(state, fightStrategy)

    // We can compare strategies
    // Gathering: Move (0) + 4 * Gather FOCUS (5) = 20 ticks, expected XP = 0 (Move) + 4*1 = 4
    // Fighting: Move (0) + 3 * Fight (3) = 9 ticks, expected XP = 0 (Move) + 3*0.7 = 2.1

    expect(gatherEval.expectedTime).toBe(20)
    expect(gatherEval.expectedXP).toBeCloseTo(4)

    expect(fightEval.expectedTime).toBe(9)
    expect(fightEval.expectedXP).toBeCloseTo(2.1)

    // Gathering appears more efficient for pure XP gain
    // This is the kind of insight that reveals dominant strategies
  })

  it("should demonstrate contract completion consumes items and cannot be exploited", () => {
    const state = createWorld("contract-exploit-test")

    // Give player 2 COPPER_BAR directly (simulating they crafted them)
    state.player.inventory.push({ itemId: "COPPER_BAR", quantity: 2 })

    // Accept the miners-guild-1 contract (requires 2 COPPER_BAR, rewards 5 COPPER_ORE, 10 rep)
    // Since requirements are already met, contract completes immediately
    const acceptLog = executeAction(state, {
      type: "AcceptContract",
      contractId: "miners-guild-1",
    })
    expect(acceptLog.success).toBe(true)

    // Contract completes immediately since requirements were met
    expect(acceptLog.contractsCompleted).toBeDefined()
    expect(acceptLog.contractsCompleted).toHaveLength(1)
    expect(acceptLog.contractsCompleted![0].contractId).toBe("miners-guild-1")

    // Verify log shows what was consumed and granted
    expect(acceptLog.contractsCompleted![0].itemsConsumed).toEqual([
      { itemId: "COPPER_BAR", quantity: 2 },
    ])
    expect(acceptLog.contractsCompleted![0].rewardsGranted).toEqual([
      { itemId: "COPPER_ORE", quantity: 5 },
    ])
    expect(acceptLog.contractsCompleted![0].reputationGained).toBe(10)

    // Verify state changes:
    // - COPPER_BAR consumed (should be gone)
    expect(state.player.inventory.find((i) => i.itemId === "COPPER_BAR")).toBeUndefined()

    // - COPPER_ORE granted (should have 5)
    expect(state.player.inventory.find((i) => i.itemId === "COPPER_ORE")?.quantity).toBe(5)

    // - Reputation awarded
    expect(state.player.guildReputation).toBe(10)

    // - Contract removed from active (it completed)
    expect(state.player.activeContracts).not.toContain("miners-guild-1")

    // EXPLOIT TEST: Try to accept the same contract again
    // This should succeed (contract can be re-accepted after completion)
    const acceptLog2 = executeAction(state, {
      type: "AcceptContract",
      contractId: "miners-guild-1",
    })
    expect(acceptLog2.success).toBe(true)

    // Contract does NOT complete because we don't have the required items anymore
    expect(acceptLog2.contractsCompleted).toBeUndefined()

    // Contract is now active, waiting for items
    expect(state.player.activeContracts).toContain("miners-guild-1")

    // Reputation should still be 10 (no double reward without items)
    expect(state.player.guildReputation).toBe(10)

    // This proves the exploit is fixed: you can't get infinite reputation
    // because items are consumed on completion
  })

  it.skip("should not complete contract if rewards would overflow inventory", () => {
    const state = createWorld("true-overflow-test")

    // Create a custom contract that would overflow
    // Requires: 2 IRON_BAR (1 slot)
    // Rewards: 5 IRON_ORE + 3 WOOD_LOG (2 new slots)
    // Net: -1 slot + 2 slots = +1 slot overflow

    state.world.contracts.push({
      id: "overflow-contract",
      guildAreaId: "TOWN",
      requirements: [{ itemId: "IRON_BAR", quantity: 2 }],
      rewards: [
        { itemId: "IRON_ORE", quantity: 5 },
        { itemId: "WOOD_LOG", quantity: 3 },
      ],
      reputationReward: 20,
    })

    // Fill inventory to capacity with different items
    for (let i = 0; i < 9; i++) {
      state.player.inventory.push({ itemId: `FILLER_${i}` as never, quantity: 1 })
    }
    state.player.inventory.push({ itemId: "IRON_BAR", quantity: 2 })
    expect(state.player.inventory.length).toBe(10)

    // Accept the overflow contract
    const acceptLog = executeAction(state, {
      type: "AcceptContract",
      contractId: "overflow-contract",
    })
    expect(acceptLog.success).toBe(true)

    // Contract should NOT complete because rewards would overflow
    // - Consuming IRON_BAR frees 1 slot (9 slots used)
    // - Adding IRON_ORE needs 1 new slot (10 slots)
    // - Adding WOOD_LOG needs 1 more slot (11 slots) - OVERFLOW!
    expect(acceptLog.contractsCompleted).toBeUndefined()

    // Contract stays active
    expect(state.player.activeContracts).toContain("overflow-contract")

    // Reputation unchanged
    expect(state.player.guildReputation).toBe(0)

    // Items not consumed
    expect(state.player.inventory.find((i) => i.itemId === "IRON_BAR")?.quantity).toBe(2)

    // Now free up a slot and try again
    state.player.inventory.splice(0, 1) // Remove one filler item
    expect(state.player.inventory.length).toBe(9)

    // Do any action to trigger contract completion check
    const moveLog = executeAction(state, { type: "Move", destination: "OUTSKIRTS_MINE" })
    expect(moveLog.success).toBe(true)

    // NOW the contract should complete
    expect(moveLog.contractsCompleted).toBeDefined()
    expect(moveLog.contractsCompleted![0].contractId).toBe("overflow-contract")

    // Verify items consumed and rewards granted
    expect(state.player.inventory.find((i) => i.itemId === "IRON_BAR")).toBeUndefined()
    expect(state.player.inventory.find((i) => i.itemId === "IRON_ORE")?.quantity).toBe(5)
    expect(state.player.inventory.find((i) => i.itemId === "WOOD_LOG")?.quantity).toBe(3)
    expect(state.player.guildReputation).toBe(20)
  })

  it("should include contract XP level-ups in ActionLog.levelUps", () => {
    const state = createWorld("contract-levelup-test")
    // Set Smithing to level 1 so contract XP causes level up from 1->2
    state.player.skills.Smithing = { level: 1, xp: 0 }

    // Create a contract that gives XP reward
    state.world.contracts.push({
      id: "xp-contract",
      guildAreaId: "TOWN",
      requirements: [{ itemId: "IRON_BAR", quantity: 1 }],
      rewards: [],
      reputationReward: 5,
      xpReward: { skill: "Smithing", amount: 5 }, // Enough to level up (need 4 XP for level 2)
    })

    // Give player the required items
    state.player.inventory.push({ itemId: "IRON_BAR", quantity: 1 })

    // Accept the contract - it should complete immediately and grant XP
    const acceptLog = executeAction(state, {
      type: "AcceptContract",
      contractId: "xp-contract",
    })

    expect(acceptLog.success).toBe(true)
    expect(acceptLog.contractsCompleted).toHaveLength(1)
    expect(acceptLog.contractsCompleted![0].xpGained).toEqual({ skill: "Smithing", amount: 5 })

    // Level-ups from contract should appear in ContractCompletion.levelUps
    expect(acceptLog.contractsCompleted![0].levelUps).toBeDefined()
    expect(acceptLog.contractsCompleted![0].levelUps).toHaveLength(1)
    expect(acceptLog.contractsCompleted![0].levelUps![0]).toEqual({
      skill: "Smithing",
      fromLevel: 1,
      toLevel: 2,
    })

    // Level-ups from contract should ALSO appear in ActionLog.levelUps
    expect(acceptLog.levelUps).toBeDefined()
    expect(acceptLog.levelUps).toHaveLength(1)
    expect(acceptLog.levelUps![0]).toEqual({
      skill: "Smithing",
      fromLevel: 1,
      toLevel: 2,
    })

    // Verify skill actually leveled up
    expect(state.player.skills.Smithing.level).toBe(2)
    expect(state.player.skills.Smithing.xp).toBe(1) // 5 - 4 (threshold) = 1 carry-over
  })

  it("should merge action level-ups with contract level-ups", () => {
    const state = createWorld("merged-levelup-test")
    // Set skills to level 1 so we can do actions and level up
    state.player.skills.Mining = { level: 1, xp: 0 }
    state.player.skills.Combat = { level: 1, xp: 0 }

    // Get a node from the mine
    const mineNode = state.world.nodes.find((n) => n.areaId === "OUTSKIRTS_MINE")!

    // Create a contract that gives XP reward
    state.world.contracts.push({
      id: "mining-xp-contract",
      guildAreaId: "OUTSKIRTS_MINE",
      requirements: [{ itemId: "COPPER_ORE", quantity: 1 }],
      rewards: [],
      reputationReward: 5,
      xpReward: { skill: "Combat", amount: 5 }, // Enough to level up Combat
    })

    // Move to mine and accept contract
    executeAction(state, { type: "Move", destination: "OUTSKIRTS_MINE" })
    executeAction(state, { type: "AcceptContract", contractId: "mining-xp-contract" })

    // Give player enough Mining XP to be close to level up (need 4 XP total)
    state.player.skills.Mining.xp = 3

    // Gather to gain 1 Mining XP (if successful) and trigger contract completion
    // with 1 COPPER_ORE in inventory, contract will complete
    state.player.inventory.push({ itemId: "COPPER_ORE", quantity: 1 })

    const material = mineNode.materials.find((m) => m.materialId === "COPPER_ORE")!
    const gatherLog = executeAction(state, {
      type: "Gather",
      nodeId: mineNode.nodeId,
      mode: GatherMode.FOCUS,
      focusMaterialId: material.materialId,
    })

    if (gatherLog.success) {
      // Gather succeeded: should have Mining level-up from action
      // Contract should have completed and given Combat level-up
      expect(gatherLog.levelUps).toBeDefined()
      expect(gatherLog.levelUps!.length).toBeGreaterThanOrEqual(1)

      // Should have both Mining (from gather) and Combat (from contract) level-ups
      const miningLevelUp = gatherLog.levelUps!.find((lu) => lu.skill === "Mining")
      const combatLevelUp = gatherLog.levelUps!.find((lu) => lu.skill === "Combat")

      expect(miningLevelUp).toBeDefined()
      expect(miningLevelUp!.fromLevel).toBe(1)
      expect(miningLevelUp!.toLevel).toBe(2)

      if (gatherLog.contractsCompleted) {
        expect(combatLevelUp).toBeDefined()
        expect(combatLevelUp!.fromLevel).toBe(1)
        expect(combatLevelUp!.toLevel).toBe(2)
      }
    }
  })
})

// Helper function to run a standard session
function runSession(seed: string): {
  logs: ActionLog[]
  state: ReturnType<typeof createWorld>
} {
  const state = createWorld(seed)
  // Set skills to level 1 to allow actions
  state.player.skills.Mining = { level: 1, xp: 0 }
  state.player.skills.Combat = { level: 1, xp: 0 }
  state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
  state.player.equippedWeapon = "CRUDE_WEAPON"
  const logs: ActionLog[] = []

  // Get a node from the mine
  const mineNode = state.world.nodes.find((n) => n.areaId === "OUTSKIRTS_MINE")!
  const material = mineNode.materials[0]

  logs.push(executeAction(state, { type: "Move", destination: "OUTSKIRTS_MINE" }))
  logs.push(
    executeAction(state, {
      type: "Gather",
      nodeId: mineNode.nodeId,
      mode: GatherMode.FOCUS,
      focusMaterialId: material.materialId,
    })
  )
  logs.push(
    executeAction(state, {
      type: "Gather",
      nodeId: mineNode.nodeId,
      mode: GatherMode.FOCUS,
      focusMaterialId: material.materialId,
    })
  )
  logs.push(executeAction(state, { type: "Fight", enemyId: "cave-rat" }))
  logs.push(executeAction(state, { type: "Move", destination: "TOWN" }))

  return { logs, state }
}
