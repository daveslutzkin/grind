import { executeAction } from "./engine.js"
import { evaluatePlan } from "./evaluate.js"
import { createToyWorld } from "./world.js"
import type { Action, ActionLog, LocationID } from "./types.js"

describe("Integration: Full Session Flow", () => {
  it("should run a complete session with various actions", () => {
    const state = createToyWorld("integration-test-seed")
    const logs: ActionLog[] = []

    // Accept a contract at TOWN
    logs.push(executeAction(state, { type: "AcceptContract", contractId: "miners-guild-1" }))
    expect(logs[logs.length - 1].success).toBe(true)
    expect(state.player.activeContracts).toContain("miners-guild-1")

    // Move to MINE
    logs.push(executeAction(state, { type: "Move", destination: "MINE" }))
    expect(logs[logs.length - 1].success).toBe(true)
    expect(state.player.location).toBe("MINE")

    // Gather iron ore multiple times
    for (let i = 0; i < 3; i++) {
      logs.push(executeAction(state, { type: "Gather", nodeId: "iron-node" }))
    }

    // Move back to TOWN
    logs.push(executeAction(state, { type: "Move", destination: "TOWN" }))

    // Try to craft if we have enough iron
    const ironOre = state.player.inventory.find((i) => i.itemId === "IRON_ORE")
    if (ironOre && ironOre.quantity >= 2) {
      logs.push(executeAction(state, { type: "Craft", recipeId: "iron-bar-recipe" }))
    }

    // Session should have consumed ticks
    expect(state.time.currentTick).toBeGreaterThan(0)
    expect(state.time.sessionRemainingTicks).toBeLessThan(20)

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
    const state = createToyWorld("logging-test")
    const logs: ActionLog[] = []

    // Move to mine
    logs.push(executeAction(state, { type: "Move", destination: "MINE" }))

    // Gather (may succeed or fail based on RNG)
    logs.push(executeAction(state, { type: "Gather", nodeId: "iron-node" }))

    const gatherLog = logs[1]

    // Log should show:
    // - What happened (success/failure)
    expect(typeof gatherLog.success).toBe("boolean")

    // - Why (RNG rolls)
    expect(gatherLog.rngRolls.length).toBeGreaterThan(0)
    expect(gatherLog.rngRolls[0].label).toContain("gather")
    expect(gatherLog.rngRolls[0].probability).toBe(0.8)

    // - What skill advanced (if success)
    if (gatherLog.success) {
      expect(gatherLog.skillGained?.skill).toBe("Mining") // iron-node grants Mining XP
      expect(gatherLog.skillGained?.amount).toBe(1)
    }

    // - State change summary
    expect(gatherLog.stateDeltaSummary).toBeDefined()
  })

  it("should demonstrate plan evaluation finds violations", () => {
    const state = createToyWorld("plan-test")

    // Valid plan: move to mine, gather, move back, craft
    const validPlan: Action[] = [
      { type: "Move", destination: "MINE" },
      { type: "Gather", nodeId: "iron-node" },
      { type: "Gather", nodeId: "iron-node" },
      { type: "Move", destination: "TOWN" },
    ]

    const validResult = evaluatePlan(state, validPlan)
    expect(validResult.violations).toHaveLength(0)
    expect(validResult.expectedTime).toBe(8) // 2 + 2 + 2 + 2

    // Invalid plan: try to gather at wrong location
    const invalidPlan: Action[] = [
      { type: "Gather", nodeId: "iron-node" }, // Can't gather at TOWN
    ]

    const invalidResult = evaluatePlan(state, invalidPlan)
    expect(invalidResult.violations.length).toBeGreaterThan(0)
  })

  it("should demonstrate session ends when ticks run out", () => {
    const state = createToyWorld("session-end-test")
    const logs: ActionLog[] = []

    // Keep moving until session ends
    let sessionEnded = false
    const destinations: LocationID[] = ["MINE", "FOREST", "TOWN"]
    let i = 0

    while (!sessionEnded && i < 20) {
      const dest = destinations[i % 3]
      if (state.player.location !== dest) {
        const log = executeAction(state, { type: "Move", destination: dest })
        logs.push(log)

        if (log.failureType === "SESSION_ENDED") {
          sessionEnded = true
        }
      }
      i++
    }

    // Session should have ended
    expect(state.time.sessionRemainingTicks).toBeLessThanOrEqual(0)
  })

  it("should show how dominant strategies might form", () => {
    // This test demonstrates that we can evaluate different strategies
    const state = createToyWorld("strategy-test")

    // Strategy 1: Pure gathering
    const gatherStrategy: Action[] = [
      { type: "Move", destination: "MINE" },
      { type: "Gather", nodeId: "iron-node" },
      { type: "Gather", nodeId: "iron-node" },
      { type: "Gather", nodeId: "iron-node" },
      { type: "Gather", nodeId: "iron-node" },
    ]

    // Strategy 2: Fighting
    const fightStrategy: Action[] = [
      { type: "Move", destination: "MINE" },
      { type: "Fight", enemyId: "cave-rat" },
      { type: "Fight", enemyId: "cave-rat" },
      { type: "Fight", enemyId: "cave-rat" },
    ]

    const gatherEval = evaluatePlan(state, gatherStrategy)
    const fightEval = evaluatePlan(state, fightStrategy)

    // We can compare strategies
    // Gathering: 2 + 4*2 = 10 ticks, expected XP = 0 (Move) + 4*0.8 = 3.2
    // Fighting: 2 + 3*3 = 11 ticks, expected XP = 0 (Move) + 3*0.7 = 2.1

    expect(gatherEval.expectedTime).toBe(10)
    expect(gatherEval.expectedXP).toBeCloseTo(3.2)

    expect(fightEval.expectedTime).toBe(11)
    expect(fightEval.expectedXP).toBeCloseTo(2.1)

    // Gathering appears more efficient for pure XP gain
    // This is the kind of insight that reveals dominant strategies
  })

  it("should demonstrate contract completion consumes items and cannot be exploited", () => {
    const state = createToyWorld("contract-exploit-test")

    // Give player 2 IRON_BAR directly (simulating they crafted them)
    state.player.inventory.push({ itemId: "IRON_BAR", quantity: 2 })

    // Accept the miners-guild-1 contract (requires 2 IRON_BAR, rewards 5 IRON_ORE, 10 rep)
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
      { itemId: "IRON_BAR", quantity: 2 },
    ])
    expect(acceptLog.contractsCompleted![0].rewardsGranted).toEqual([
      { itemId: "IRON_ORE", quantity: 5 },
    ])
    expect(acceptLog.contractsCompleted![0].reputationGained).toBe(10)

    // Verify state changes:
    // - IRON_BAR consumed (should be gone)
    expect(state.player.inventory.find((i) => i.itemId === "IRON_BAR")).toBeUndefined()

    // - IRON_ORE granted (should have 5)
    expect(state.player.inventory.find((i) => i.itemId === "IRON_ORE")?.quantity).toBe(5)

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
})

// Helper function to run a standard session
function runSession(seed: string): { logs: ActionLog[]; state: ReturnType<typeof createToyWorld> } {
  const state = createToyWorld(seed)
  const logs: ActionLog[] = []

  logs.push(executeAction(state, { type: "Move", destination: "MINE" }))
  logs.push(executeAction(state, { type: "Gather", nodeId: "iron-node" }))
  logs.push(executeAction(state, { type: "Gather", nodeId: "iron-node" }))
  logs.push(executeAction(state, { type: "Fight", enemyId: "cave-rat" }))
  logs.push(executeAction(state, { type: "Move", destination: "TOWN" }))

  return { logs, state }
}
