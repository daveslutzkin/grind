import type {
  WorldState,
  Action,
  ActionLog,
  RngRoll,
  MoveAction,
  AcceptContractAction,
  GatherAction,
  FightAction,
  CraftAction,
  StoreAction,
  DropAction,
  GuildEnrolmentAction,
  TurnInCombatTokenAction,
  FailureType,
  ItemID,
  ContractCompletion,
  SkillID,
  LevelUp,
} from "./types.js"
import { addXPToSkill } from "./types.js"
import { roll } from "./rng.js"

import {
  checkMoveAction,
  checkAcceptContractAction,
  checkGatherAction,
  checkFightAction,
  checkCraftAction,
  checkStoreAction,
  checkDropAction,
  checkGuildEnrolmentAction,
  checkTurnInCombatTokenAction,
} from "./actionChecks.js"

/**
 * Grant XP to a skill and handle level-ups
 * Returns any level-ups that occurred
 */
function grantXP(state: WorldState, skill: SkillID, amount: number): LevelUp[] {
  const result = addXPToSkill(state.player.skills[skill], amount)
  state.player.skills[skill] = result.skill
  // Fill in the skill ID for each level-up
  return result.levelUps.map((lu) => ({ ...lu, skill }))
}

/**
 * Collect all level-ups from contract completions
 */
function collectContractLevelUps(completions: ContractCompletion[]): LevelUp[] {
  const allLevelUps: LevelUp[] = []
  for (const c of completions) {
    if (c.levelUps) {
      allLevelUps.push(...c.levelUps)
    }
  }
  return allLevelUps
}

/**
 * Merge action level-ups with contract level-ups
 */
function mergeLevelUps(
  actionLevelUps: LevelUp[],
  contractCompletions: ContractCompletion[]
): LevelUp[] | undefined {
  const contractLevelUps = collectContractLevelUps(contractCompletions)
  const allLevelUps = [...actionLevelUps, ...contractLevelUps]
  return allLevelUps.length > 0 ? allLevelUps : undefined
}

function createFailureLog(
  state: WorldState,
  action: Action,
  failureType: FailureType,
  timeConsumed: number = 0
): ActionLog {
  return {
    tickBefore: state.time.currentTick,
    actionType: action.type,
    parameters: extractParameters(action),
    success: false,
    failureType,
    timeConsumed,
    rngRolls: [],
    stateDeltaSummary: `Failed: ${failureType}`,
  }
}

function extractParameters(action: Action): Record<string, unknown> {
  const { type: _type, ...params } = action
  return params
}

function consumeTime(state: WorldState, ticks: number): void {
  state.time.currentTick += ticks
  state.time.sessionRemainingTicks -= ticks
}

function addToInventory(state: WorldState, itemId: ItemID, quantity: number): void {
  const existing = state.player.inventory.find((i) => i.itemId === itemId)
  if (existing) {
    existing.quantity += quantity
  } else {
    state.player.inventory.push({ itemId, quantity })
  }
}

function removeFromInventory(state: WorldState, itemId: ItemID, quantity: number): void {
  const item = state.player.inventory.find((i) => i.itemId === itemId)
  if (item) {
    item.quantity -= quantity
    if (item.quantity <= 0) {
      const index = state.player.inventory.indexOf(item)
      state.player.inventory.splice(index, 1)
    }
  }
}

function addToStorage(state: WorldState, itemId: ItemID, quantity: number): void {
  const existing = state.player.storage.find((i) => i.itemId === itemId)
  if (existing) {
    existing.quantity += quantity
  } else {
    state.player.storage.push({ itemId, quantity })
  }
}

/**
 * Check if contract rewards will fit in inventory after consuming requirements.
 * Returns true if rewards will fit, false otherwise.
 */
function canFitContractRewards(
  state: WorldState,
  requirements: { itemId: ItemID; quantity: number }[],
  rewards: { itemId: ItemID; quantity: number }[]
): boolean {
  // Simulate inventory state after consuming requirements
  // Track which item types will be completely removed (freeing slots)
  const simulatedInventory = new Map<ItemID, number>()
  for (const item of state.player.inventory) {
    simulatedInventory.set(item.itemId, item.quantity)
  }

  // Simulate consuming requirements from inventory
  for (const req of requirements) {
    const current = simulatedInventory.get(req.itemId) ?? 0
    // We consume from inventory first; if not enough, remainder comes from storage
    // For slot calculation, we only care about inventory
    const toConsume = Math.min(current, req.quantity)
    if (toConsume >= current) {
      simulatedInventory.delete(req.itemId) // Slot freed
    } else {
      simulatedInventory.set(req.itemId, current - toConsume)
    }
  }

  // Simulate adding rewards
  for (const reward of rewards) {
    const current = simulatedInventory.get(reward.itemId) ?? 0
    simulatedInventory.set(reward.itemId, current + reward.quantity)
  }

  // Check if simulated inventory fits in capacity
  return simulatedInventory.size <= state.player.inventoryCapacity
}

function checkContractCompletion(state: WorldState): ContractCompletion[] {
  const completions: ContractCompletion[] = []

  // Check each active contract
  for (const contractId of [...state.player.activeContracts]) {
    const contract = state.world.contracts.find((c) => c.id === contractId)
    if (!contract) continue

    // Check if all item requirements are met (in inventory or storage)
    const allItemRequirementsMet = contract.requirements.every((req) => {
      const inInventory = state.player.inventory.find((i) => i.itemId === req.itemId)
      const inStorage = state.player.storage.find((i) => i.itemId === req.itemId)
      const totalQuantity = (inInventory?.quantity ?? 0) + (inStorage?.quantity ?? 0)
      return totalQuantity >= req.quantity
    })

    // Check if all kill requirements are met
    const allKillRequirementsMet = (contract.killRequirements ?? []).every((req) => {
      const progress = state.player.contractKillProgress[contractId]?.[req.enemyId] ?? 0
      return progress >= req.count
    })

    // Check if rewards will fit in inventory (respecting slot capacity)
    const rewardsWillFit = canFitContractRewards(state, contract.requirements, contract.rewards)

    if (allItemRequirementsMet && allKillRequirementsMet && rewardsWillFit) {
      // Record what we're consuming for the log
      const itemsConsumed = contract.requirements.map((req) => ({
        itemId: req.itemId,
        quantity: req.quantity,
      }))

      // Consume required items (from inventory first, then storage)
      for (const req of contract.requirements) {
        let remaining = req.quantity

        // Take from inventory first
        const invItem = state.player.inventory.find((i) => i.itemId === req.itemId)
        if (invItem) {
          const takeFromInv = Math.min(invItem.quantity, remaining)
          invItem.quantity -= takeFromInv
          remaining -= takeFromInv
          if (invItem.quantity <= 0) {
            const index = state.player.inventory.indexOf(invItem)
            state.player.inventory.splice(index, 1)
          }
        }

        // Take remainder from storage
        if (remaining > 0) {
          const storageItem = state.player.storage.find((i) => i.itemId === req.itemId)
          if (storageItem) {
            storageItem.quantity -= remaining
            if (storageItem.quantity <= 0) {
              const index = state.player.storage.indexOf(storageItem)
              state.player.storage.splice(index, 1)
            }
          }
        }
      }

      // Record what we're granting for the log
      const rewardsGranted = contract.rewards.map((reward) => ({
        itemId: reward.itemId,
        quantity: reward.quantity,
      }))

      // Grant contract rewards (items go to inventory)
      for (const reward of contract.rewards) {
        addToInventory(state, reward.itemId, reward.quantity)
      }

      // Award reputation
      state.player.guildReputation += contract.reputationReward

      // Award XP if contract has xpReward and capture level-ups
      let contractLevelUps: LevelUp[] = []
      if (contract.xpReward) {
        contractLevelUps = grantXP(state, contract.xpReward.skill, contract.xpReward.amount)
      }

      // Remove from active contracts
      const index = state.player.activeContracts.indexOf(contractId)
      state.player.activeContracts.splice(index, 1)

      completions.push({
        contractId,
        itemsConsumed,
        rewardsGranted,
        reputationGained: contract.reputationReward,
        xpGained: contract.xpReward,
        levelUps: contractLevelUps.length > 0 ? contractLevelUps : undefined,
      })
    }
  }

  return completions
}

function executeMove(state: WorldState, action: MoveAction, rolls: RngRoll[]): ActionLog {
  const tickBefore = state.time.currentTick
  const fromLocation = state.player.location
  const destination = action.destination

  // Use shared precondition check
  const check = checkMoveAction(state, action)
  if (!check.valid) {
    return createFailureLog(state, action, check.failureType!)
  }

  // Check if enough time remaining
  if (state.time.sessionRemainingTicks < check.timeCost) {
    return createFailureLog(state, action, "SESSION_ENDED")
  }

  // Move player
  state.player.location = destination
  consumeTime(state, check.timeCost)

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkContractCompletion(state)

  return {
    tickBefore,
    actionType: "Move",
    parameters: { destination },
    success: true,
    timeConsumed: check.timeCost,
    levelUps: mergeLevelUps([], contractsCompleted),
    contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    rngRolls: rolls,
    stateDeltaSummary: `Moved from ${fromLocation} to ${destination}`,
  }
}

export function executeAction(state: WorldState, action: Action): ActionLog {
  const rolls: RngRoll[] = []

  // Check if session has ended
  if (state.time.sessionRemainingTicks <= 0) {
    return createFailureLog(state, action, "SESSION_ENDED")
  }

  switch (action.type) {
    case "Move":
      return executeMove(state, action, rolls)
    case "AcceptContract":
      return executeAcceptContract(state, action, rolls)
    case "Gather":
      return executeGather(state, action, rolls)
    case "Fight":
      return executeFight(state, action, rolls)
    case "Craft":
      return executeCraft(state, action, rolls)
    case "Store":
      return executeStore(state, action, rolls)
    case "Drop":
      return executeDrop(state, action, rolls)
    case "Enrol":
      return executeGuildEnrolment(state, action, rolls)
    case "TurnInCombatToken":
      return executeTurnInCombatToken(state, action, rolls)
  }
}

function executeAcceptContract(
  state: WorldState,
  action: AcceptContractAction,
  rolls: RngRoll[]
): ActionLog {
  const tickBefore = state.time.currentTick
  const contractId = action.contractId

  // Use shared precondition check
  const check = checkAcceptContractAction(state, action)
  if (!check.valid) {
    return createFailureLog(state, action, check.failureType!)
  }

  // Accept contract
  state.player.activeContracts.push(contractId)

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkContractCompletion(state)

  return {
    tickBefore,
    actionType: "AcceptContract",
    parameters: { contractId },
    success: true,
    timeConsumed: 0,
    levelUps: mergeLevelUps([], contractsCompleted),
    contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    rngRolls: rolls,
    stateDeltaSummary: `Accepted contract ${contractId}`,
  }
}

function executeGather(state: WorldState, action: GatherAction, rolls: RngRoll[]): ActionLog {
  const tickBefore = state.time.currentTick
  const nodeId = action.nodeId

  // Use shared precondition check
  const check = checkGatherAction(state, action)
  if (!check.valid) {
    return createFailureLog(state, action, check.failureType!)
  }

  // Check if enough time remaining
  if (state.time.sessionRemainingTicks < check.timeCost) {
    return createFailureLog(state, action, "SESSION_ENDED")
  }

  // Get node for additional info
  const node = state.world.resourceNodes.find((n) => n.id === nodeId)!

  // Consume time
  consumeTime(state, check.timeCost)

  // Roll for success
  const success = roll(state.rng, check.successProbability, `gather:${nodeId}`, rolls)

  if (!success) {
    return {
      tickBefore,
      actionType: "Gather",
      parameters: { nodeId },
      success: false,
      failureType: "GATHER_FAILURE",
      timeConsumed: check.timeCost,
      rngRolls: rolls,
      stateDeltaSummary: `Failed to gather from ${nodeId}`,
    }
  }

  // Add item to inventory
  addToInventory(state, node.itemId, 1)

  // Grant XP (uses node-specific skill type)
  const levelUps = grantXP(state, node.skillType, 1)

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkContractCompletion(state)

  return {
    tickBefore,
    actionType: "Gather",
    parameters: { nodeId },
    success: true,
    timeConsumed: check.timeCost,
    skillGained: { skill: node.skillType, amount: 1 },
    levelUps: mergeLevelUps(levelUps, contractsCompleted),
    contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    rngRolls: rolls,
    stateDeltaSummary: `Gathered 1 ${node.itemId} from ${nodeId}`,
  }
}

function executeFight(state: WorldState, action: FightAction, rolls: RngRoll[]): ActionLog {
  const tickBefore = state.time.currentTick
  const enemyId = action.enemyId

  // Use shared precondition check
  const check = checkFightAction(state, action)
  if (!check.valid) {
    return createFailureLog(state, action, check.failureType!)
  }

  // Check if enough time remaining
  if (state.time.sessionRemainingTicks < check.timeCost) {
    return createFailureLog(state, action, "SESSION_ENDED")
  }

  // Get enemy for additional info
  const enemy = state.world.enemies.find((e) => e.id === enemyId)!

  // Consume time
  consumeTime(state, check.timeCost)

  // Roll for success
  const success = roll(state.rng, check.successProbability, `fight:${enemyId}`, rolls)

  if (!success) {
    // Per spec: On failure, time is consumed but player is NOT relocated
    return {
      tickBefore,
      actionType: "Fight",
      parameters: { enemyId },
      success: false,
      failureType: "COMBAT_FAILURE",
      timeConsumed: check.timeCost,
      rngRolls: rolls,
      stateDeltaSummary: `Lost fight to ${enemyId}`,
    }
  }

  // Add standard loot to inventory
  for (const loot of enemy.loot) {
    addToInventory(state, loot.itemId, loot.quantity)
  }

  // Track kills for active contracts with kill requirements
  for (const contractId of state.player.activeContracts) {
    const contract = state.world.contracts.find((c) => c.id === contractId)
    if (contract?.killRequirements) {
      for (const req of contract.killRequirements) {
        if (req.enemyId === enemyId) {
          if (!state.player.contractKillProgress[contractId]) {
            state.player.contractKillProgress[contractId] = {}
          }
          const current = state.player.contractKillProgress[contractId][enemyId] || 0
          state.player.contractKillProgress[contractId][enemyId] = current + 1
        }
      }
    }
  }

  // Roll for ImprovedWeapon drop (10%)
  const improvedWeaponDrop = roll(state.rng, 0.1, "improved-weapon-drop", rolls)
  if (improvedWeaponDrop) {
    // Remove CrudeWeapon if present
    removeFromInventory(state, "CRUDE_WEAPON", 1)
    // Add ImprovedWeapon
    addToInventory(state, "IMPROVED_WEAPON", 1)
    // Auto-equip
    state.player.equippedWeapon = "IMPROVED_WEAPON"
  }

  // Roll for CombatGuildToken drop (1%)
  const tokenDrop = roll(state.rng, 0.01, "combat-token-drop", rolls)
  if (tokenDrop) {
    addToInventory(state, "COMBAT_GUILD_TOKEN", 1)
  }

  // Grant XP
  const levelUps = grantXP(state, "Combat", 1)

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkContractCompletion(state)

  return {
    tickBefore,
    actionType: "Fight",
    parameters: { enemyId },
    success: true,
    timeConsumed: check.timeCost,
    skillGained: { skill: "Combat", amount: 1 },
    levelUps: mergeLevelUps(levelUps, contractsCompleted),
    contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    rngRolls: rolls,
    stateDeltaSummary: `Defeated ${enemyId}, gained loot`,
  }
}

function executeCraft(state: WorldState, action: CraftAction, rolls: RngRoll[]): ActionLog {
  const tickBefore = state.time.currentTick
  const recipeId = action.recipeId

  // Use shared precondition check
  const check = checkCraftAction(state, action)
  if (!check.valid) {
    return createFailureLog(state, action, check.failureType!)
  }

  // Check if enough time remaining
  if (state.time.sessionRemainingTicks < check.timeCost) {
    return createFailureLog(state, action, "SESSION_ENDED")
  }

  // Get recipe for additional info
  const recipe = state.world.recipes.find((r) => r.id === recipeId)!

  // Consume inputs
  for (const input of recipe.inputs) {
    removeFromInventory(state, input.itemId, input.quantity)
  }

  // Consume time
  consumeTime(state, check.timeCost)

  // Produce output
  addToInventory(state, recipe.output.itemId, recipe.output.quantity)

  // Grant XP
  const levelUps = grantXP(state, "Smithing", 1)

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkContractCompletion(state)

  return {
    tickBefore,
    actionType: "Craft",
    parameters: { recipeId },
    success: true,
    timeConsumed: check.timeCost,
    skillGained: { skill: "Smithing", amount: 1 },
    levelUps: mergeLevelUps(levelUps, contractsCompleted),
    contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    rngRolls: rolls,
    stateDeltaSummary: `Crafted ${recipe.output.quantity} ${recipe.output.itemId}`,
  }
}

function executeStore(state: WorldState, action: StoreAction, rolls: RngRoll[]): ActionLog {
  const tickBefore = state.time.currentTick
  const { itemId, quantity } = action

  // Use shared precondition check
  const check = checkStoreAction(state, action)
  if (!check.valid) {
    return createFailureLog(state, action, check.failureType!)
  }

  // Store is a free action (0 ticks), no time check needed

  // Move item to storage (no time consumed, no XP)
  removeFromInventory(state, itemId, quantity)
  addToStorage(state, itemId, quantity)

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkContractCompletion(state)

  return {
    tickBefore,
    actionType: "Store",
    parameters: { itemId, quantity },
    success: true,
    timeConsumed: 0,
    levelUps: mergeLevelUps([], contractsCompleted),
    contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    rngRolls: rolls,
    stateDeltaSummary: `Stored ${quantity} ${itemId}`,
  }
}

function executeDrop(state: WorldState, action: DropAction, rolls: RngRoll[]): ActionLog {
  const tickBefore = state.time.currentTick
  const { itemId, quantity } = action

  // Use shared precondition check
  const check = checkDropAction(state, action)
  if (!check.valid) {
    return createFailureLog(state, action, check.failureType!)
  }

  // Check if enough time remaining
  if (state.time.sessionRemainingTicks < check.timeCost) {
    return createFailureLog(state, action, "SESSION_ENDED")
  }

  // Consume time
  consumeTime(state, check.timeCost)

  // Remove item from inventory
  removeFromInventory(state, itemId, quantity)

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkContractCompletion(state)

  return {
    tickBefore,
    actionType: "Drop",
    parameters: { itemId, quantity },
    success: true,
    timeConsumed: check.timeCost,
    levelUps: mergeLevelUps([], contractsCompleted),
    contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    rngRolls: rolls,
    stateDeltaSummary: `Dropped ${quantity} ${itemId}`,
  }
}

function executeTurnInCombatToken(
  state: WorldState,
  action: TurnInCombatTokenAction,
  rolls: RngRoll[]
): ActionLog {
  const tickBefore = state.time.currentTick

  // Use shared precondition check
  const check = checkTurnInCombatTokenAction(state, action)
  if (!check.valid) {
    return createFailureLog(state, action, check.failureType!)
  }

  // Consume the token
  removeFromInventory(state, "COMBAT_GUILD_TOKEN", 1)

  // Add combat-guild-1 contract to the world if not already present
  if (!state.world.contracts.find((c) => c.id === "combat-guild-1")) {
    state.world.contracts.push({
      id: "combat-guild-1",
      guildLocation: "TOWN",
      requirements: [],
      killRequirements: [{ enemyId: "cave-rat", count: 2 }],
      rewards: [],
      reputationReward: 0,
      xpReward: { skill: "Combat", amount: 5 }, // 4-6 XP, using 5 as fixed value
    })
  }

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkContractCompletion(state)

  return {
    tickBefore,
    actionType: "TurnInCombatToken",
    parameters: {},
    success: true,
    timeConsumed: 0,
    levelUps: mergeLevelUps([], contractsCompleted),
    contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    rngRolls: rolls,
    stateDeltaSummary: "Turned in Combat Guild Token, unlocked combat-guild-1 contract",
  }
}

function executeGuildEnrolment(
  state: WorldState,
  action: GuildEnrolmentAction,
  rolls: RngRoll[]
): ActionLog {
  const tickBefore = state.time.currentTick
  const { skill } = action

  // Use shared precondition check
  const check = checkGuildEnrolmentAction(state, action)
  if (!check.valid) {
    return createFailureLog(state, action, check.failureType!)
  }

  // Check if enough time remaining
  if (state.time.sessionRemainingTicks < check.timeCost) {
    return createFailureLog(state, action, "SESSION_ENDED")
  }

  // Consume time
  consumeTime(state, check.timeCost)

  // Set skill to level 1 (unlock it)
  state.player.skills[skill] = { level: 1, xp: 0 }

  // Combat enrolment grants and equips CRUDE_WEAPON
  if (skill === "Combat") {
    addToInventory(state, "CRUDE_WEAPON", 1)
    state.player.equippedWeapon = "CRUDE_WEAPON"
  }

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkContractCompletion(state)

  return {
    tickBefore,
    actionType: "Enrol",
    parameters: { skill },
    success: true,
    timeConsumed: check.timeCost,
    levelUps: mergeLevelUps([], contractsCompleted),
    contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    rngRolls: rolls,
    stateDeltaSummary: `Enrolled in ${skill} guild`,
  }
}
