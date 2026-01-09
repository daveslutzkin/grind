import { executeAction } from "./engine.js"
import { evaluatePlan } from "./evaluate.js"
import { createWorld, TOWN_LOCATIONS, MATERIALS } from "./world.js"
import type { Action, ActionLog, WorldState, AreaID } from "./types.js"
import { GatherMode, NodeType, ExplorationLocationType } from "./types.js"

/** Set player to be at a specific location in town */
function setTownLocation(state: WorldState, locationId: string | null): void {
  state.exploration.playerState.currentAreaId = "TOWN"
  state.exploration.playerState.currentLocationId = locationId
}

/**
 * Test helpers for procedural area IDs
 */

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
  // Also add return connection
  const returnConnectionId = `${areaId}->TOWN`
  if (!state.exploration.playerState.knownConnectionIds.includes(returnConnectionId)) {
    state.exploration.playerState.knownConnectionIds.push(returnConnectionId)
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

/** Get the location ID for a node */
function getNodeLocationId(nodeId: string, areaId: string): string {
  const nodeIndexMatch = nodeId.match(/-node-(\d+)$/)
  if (nodeIndexMatch) {
    return `${areaId}-loc-${nodeIndexMatch[1]}`
  }
  return ""
}

describe("Integration: Full Session Flow", () => {
  it("should run a complete session with various actions", () => {
    const state = createWorld("integration-test-seed")
    // Set skills to level 1 to allow actions
    state.player.skills.Mining = { level: 1, xp: 0 }
    state.player.skills.Smithing = { level: 1, xp: 0 }
    const logs: ActionLog[] = []

    // Accept a contract at Miners Guild
    setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD)
    logs.push(executeAction(state, { type: "AcceptContract", contractId: "miners-guild-1" }))
    expect(logs[logs.length - 1].success).toBe(true)
    expect(state.player.activeContracts).toContain("miners-guild-1")

    // Return to Town Square before traveling
    state.exploration.playerState.currentLocationId = null

    // Get ore area and make it known
    const oreAreaId = getOreAreaId(state)
    makeAreaKnown(state, oreAreaId)
    discoverAllLocations(state, oreAreaId)

    // Move to ore area
    logs.push(executeAction(state, { type: "Move", destination: oreAreaId }))
    expect(logs[logs.length - 1].success).toBe(true)
    expect(state.exploration.playerState.currentAreaId).toBe(oreAreaId)

    // Get a copper ore node ID from the area
    const copperNode = state.world.nodes.find(
      (n) => n.areaId === oreAreaId && n.materials.some((m) => m.materialId === "COPPER_ORE")
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
    expect(state.time.sessionRemainingTicks).toBeLessThan(20000)

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

    // Get ore area and make it known
    const oreAreaId = getOreAreaId(state)
    makeAreaKnown(state, oreAreaId)
    discoverAllLocations(state, oreAreaId)

    // Move to ore area
    logs.push(executeAction(state, { type: "Move", destination: oreAreaId }))

    // Get a node from the area
    const mineNode = state.world.nodes.find((n) => n.areaId === oreAreaId)
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

    // Get ore area and make it known
    const oreAreaId = getOreAreaId(state)
    makeAreaKnown(state, oreAreaId)
    discoverAllLocations(state, oreAreaId)

    // Get a node from the area
    const mineNode = state.world.nodes.find((n) => n.areaId === oreAreaId)!
    const material = mineNode.materials[0]
    const nodeLocationId = getNodeLocationId(mineNode.nodeId, oreAreaId)

    // Valid plan: move to ore area, travel to node location, gather, gather, leave, move back
    const validPlan: Action[] = [
      { type: "Move", destination: oreAreaId },
      { type: "TravelToLocation", locationId: nodeLocationId },
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
      { type: "Leave" },
      { type: "Move", destination: "TOWN" },
    ]

    const validResult = evaluatePlan(state, validPlan)
    expect(validResult.violations).toHaveLength(0)
    // Move (0) + TravelToLocation (1) + Gather FOCUS (5) + Gather FOCUS (5) + Leave (1) + Move (0) = 12
    expect(validResult.expectedTime).toBe(12)

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

    // Get two distance-1 areas and make them known
    const areas: AreaID[] = []
    for (const area of state.exploration.areas.values()) {
      if (area.distance === 1 && areas.length < 2) {
        areas.push(area.id)
        makeAreaKnown(state, area.id)
      }
    }
    const destinations: AreaID[] = [...areas, "TOWN"]

    // Keep moving until session ends
    let sessionEnded = false
    let i = 0

    while (!sessionEnded && i < 10000) {
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

    // Get ore area and make it known
    const oreAreaId = getOreAreaId(state)
    makeAreaKnown(state, oreAreaId)
    discoverAllLocations(state, oreAreaId)

    // Get an ore vein node and its first material
    const mineNode = state.world.nodes.find(
      (n) => n.areaId === oreAreaId && n.nodeType === NodeType.ORE_VEIN
    )!
    const material = mineNode.materials[0]
    const nodeLocationId = getNodeLocationId(mineNode.nodeId, oreAreaId)

    // Set skill levels based on material requirements (need enough to gather)
    const requiredMiningLevel = MATERIALS[material.materialId]?.requiredLevel ?? 1
    state.player.skills.Mining = { level: requiredMiningLevel, xp: 0 }
    state.player.skills.Combat = { level: 1, xp: 0 } // Need level 1 to fight
    state.player.inventory.push({ itemId: "CRUDE_WEAPON", quantity: 1 })
    state.player.equippedWeapon = "CRUDE_WEAPON" // Need weapon to fight

    // Add an enemy at this location for fight strategy
    state.world.enemies = state.world.enemies || []
    state.world.enemies.push({
      id: "cave-rat",
      areaId: oreAreaId,
      fightTime: 3,
      successProbability: 0.7,
      requiredSkillLevel: 1,
      lootTable: [{ itemId: "COPPER_ORE", quantity: 1, weight: 1 }],
      failureAreaId: "TOWN",
    })

    // Strategy 1: Pure gathering (move to area, travel to node, gather 4 times)
    const gatherStrategy: Action[] = [
      { type: "Move", destination: oreAreaId },
      { type: "TravelToLocation", locationId: nodeLocationId },
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
      { type: "Move", destination: oreAreaId },
      { type: "Fight", enemyId: "cave-rat" },
      { type: "Fight", enemyId: "cave-rat" },
      { type: "Fight", enemyId: "cave-rat" },
    ]

    const gatherEval = evaluatePlan(state, gatherStrategy)
    const fightEval = evaluatePlan(state, fightStrategy)

    // We can compare strategies
    // Gathering: Move (0) + TravelToLocation (1) + 4 * Gather FOCUS (5) = 21 ticks, expected XP = 0 + 0 + 4*1 = 4
    // Fighting: Move (0) + 3 * Fight (3) = 9 ticks, expected XP = 0 (Move) + 3*0.7 = 2.1

    expect(gatherEval.expectedTime).toBe(21)
    expect(gatherEval.expectedXP).toBeCloseTo(4)

    expect(fightEval.expectedTime).toBe(9)
    expect(fightEval.expectedXP).toBeCloseTo(2.1)

    // Gathering appears more efficient for pure XP gain
    // This is the kind of insight that reveals dominant strategies
  })

  it("should demonstrate contract completion consumes items and cannot be exploited", () => {
    const state = createWorld("contract-exploit-test")
    setTownLocation(state, TOWN_LOCATIONS.MINERS_GUILD) // Must be at miners guild to accept

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

  it("should include contract XP level-ups in ActionLog.levelUps", () => {
    const state = createWorld("contract-levelup-test")
    // Set Smithing to level 1 so contract XP causes level up from 1->2
    state.player.skills.Smithing = { level: 1, xp: 0 }

    // Create a contract that gives XP reward
    state.world.contracts.push({
      id: "xp-contract",
      level: 1,
      acceptLocationId: "TOWN_SMITHING_GUILD",
      guildType: "Smithing",
      requirements: [{ itemId: "IRON_BAR", quantity: 1 }],
      rewards: [],
      reputationReward: 5,
      xpReward: { skill: "Smithing", amount: 5 }, // Enough to level up (need 4 XP for level 2)
    })

    // Must be at the guild location to accept
    state.exploration.playerState.currentLocationId = "TOWN_SMITHING_GUILD"

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

    // Get ore area and make it known
    const oreAreaId = getOreAreaId(state)
    makeAreaKnown(state, oreAreaId)
    discoverAllLocations(state, oreAreaId)

    // Get a node from the area
    const mineNode = state.world.nodes.find((n) => n.areaId === oreAreaId)!

    // Create a location in the ore area for the contract
    const miningOutpostId = `${oreAreaId}-mining-outpost`
    const oreArea = state.exploration.areas.get(oreAreaId)!
    oreArea.locations.push({
      id: miningOutpostId,
      areaId: oreAreaId,
      type: ExplorationLocationType.GUILD_HALL,
      guildType: "Mining",
      guildLevel: 100,
    })
    state.exploration.playerState.knownLocationIds.push(miningOutpostId)

    // Create a contract that gives XP reward
    state.world.contracts.push({
      id: "mining-xp-contract",
      level: 1,
      acceptLocationId: miningOutpostId,
      guildType: "Mining",
      requirements: [{ itemId: "COPPER_ORE", quantity: 1 }],
      rewards: [],
      reputationReward: 5,
      xpReward: { skill: "Combat", amount: 5 }, // Enough to level up Combat
    })

    // Move to ore area and go to the mining outpost to accept contract
    executeAction(state, { type: "Move", destination: oreAreaId })
    state.exploration.playerState.currentLocationId = miningOutpostId
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

  // Get ore area and make it known
  const oreAreaId = getOreAreaId(state)
  makeAreaKnown(state, oreAreaId)
  discoverAllLocations(state, oreAreaId)

  // Add an enemy at this location
  state.world.enemies = state.world.enemies || []
  state.world.enemies.push({
    id: "cave-rat",
    areaId: oreAreaId,
    fightTime: 3,
    successProbability: 0.7,
    requiredSkillLevel: 1,
    lootTable: [{ itemId: "COPPER_ORE", quantity: 1, weight: 1 }],
    failureAreaId: "TOWN",
  })

  // Get a node from the area
  const mineNode = state.world.nodes.find((n) => n.areaId === oreAreaId)!
  const material = mineNode.materials[0]

  logs.push(executeAction(state, { type: "Move", destination: oreAreaId }))
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
