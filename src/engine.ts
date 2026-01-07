import type {
  WorldState,
  Action,
  ActionLog,
  RngRoll,
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
  ExtractionLog,
  ItemStack,
  Node,
  GatheringSkillID,
} from "./types.js"
import { addXPToSkill, GatherMode } from "./types.js"
import { roll, rollLootTable, rollFloat } from "./rng.js"
import {
  executeSurvey,
  executeExplore,
  executeExplorationTravel,
  grantExplorationGuildBenefits,
} from "./exploration.js"

import {
  checkAcceptContractAction,
  checkGatherAction,
  checkFightAction,
  checkCraftAction,
  checkStoreAction,
  checkDropAction,
  checkGuildEnrolmentAction,
  checkTurnInCombatTokenAction,
  getNodeSkill,
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

      // Clean up kill progress for this contract
      delete state.player.contractKillProgress[contractId]

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

export function executeAction(state: WorldState, action: Action): ActionLog {
  const rolls: RngRoll[] = []

  // Check if session has ended
  if (state.time.sessionRemainingTicks <= 0) {
    return createFailureLog(state, action, "SESSION_ENDED")
  }

  switch (action.type) {
    case "Move":
      // Move is an alias for ExplorationTravel
      return executeExplorationTravel(state, {
        type: "ExplorationTravel",
        destinationAreaId: action.destination,
      })
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
    case "Survey":
      return executeSurvey(state, action)
    case "Explore":
      return executeExplore(state, action)
    case "ExplorationTravel":
      return executeExplorationTravel(state, action)
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

  // Use shared precondition check
  const check = checkGatherAction(state, action)
  if (!check.valid) {
    return createFailureLog(state, action, check.failureType!)
  }

  // Check if enough time remaining
  if (state.time.sessionRemainingTicks < check.timeCost) {
    return createFailureLog(state, action, "SESSION_ENDED")
  }

  // Execute multi-material node gather
  return executeMultiMaterialGather(state, action, rolls, tickBefore, check.timeCost)
}

/**
 * Calculate focus yield percentage based on skill level and material required level
 * At unlock level (matching required level): ~40%
 * At level 10 (max level): 100%
 */
function calculateFocusYieldPercent(skillLevel: number, requiredLevel: number): number {
  // Levels above required determine efficiency
  const levelsAboveRequired = Math.max(0, skillLevel - requiredLevel)
  // Base yield at unlock level is 40%
  // Each level above adds ~7% (60% spread over ~9 levels = ~6.67% per level)
  const yieldPercent = 0.4 + levelsAboveRequired * 0.0667
  return Math.min(1.0, yieldPercent) // Cap at 100%
}

/**
 * Calculate collateral damage percentage based on skill level
 * High levels still have a 20% floor
 */
function calculateCollateralPercent(skillLevel: number): number {
  // At level 1: 60% collateral
  // At level 10: 20% collateral (floor)
  const reduction = (skillLevel - 1) * 0.0444 // ~4.44% per level above 1
  const collateral = 0.6 - reduction
  return Math.max(0.2, collateral) // Floor at 20%
}

/**
 * Calculate yield variance range based on distance band
 * NEAR: ±10%, MID: ±20%, FAR: ±30%
 */
function getVarianceRange(locationId: string): [number, number] {
  // Determine band from location ID prefix
  if (locationId.includes("OUTSKIRTS") || locationId.includes("COPSE")) {
    return [0.9, 1.1] // NEAR: ±10%
  } else if (locationId.includes("QUARRY") || locationId.includes("DEEP_FOREST")) {
    return [0.8, 1.2] // MID: ±20%
  } else if (locationId.includes("SHAFT") || locationId.includes("GROVE")) {
    return [0.7, 1.3] // FAR: ±30%
  }
  return [0.95, 1.05] // Default minimal variance
}

/**
 * Execute multi-material node gather with modes
 */
function executeMultiMaterialGather(
  state: WorldState,
  action: GatherAction,
  rolls: RngRoll[],
  tickBefore: number,
  timeCost: number
): ActionLog {
  const mode = action.mode!
  const node = state.world.nodes!.find((n) => n.nodeId === action.nodeId)!
  const skill = getNodeSkill(node)
  const skillLevel = state.player.skills[skill].level

  // Consume time
  consumeTime(state, timeCost)

  const parameters: Record<string, unknown> = {
    nodeId: action.nodeId,
    mode,
  }
  if (action.focusMaterialId) {
    parameters.focusMaterialId = action.focusMaterialId
  }

  // APPRAISE mode - just inspect, no extraction
  if (mode === GatherMode.APPRAISE) {
    const extraction: ExtractionLog = {
      mode: GatherMode.APPRAISE,
      extracted: [],
      focusWaste: 0,
      collateralDamage: {},
      appraisal: {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        materials: node.materials.map((m) => ({
          materialId: m.materialId,
          remaining: m.remainingUnits,
          max: m.maxUnitsInitial,
          requiredLevel: m.requiredLevel,
          requiresSkill: m.requiresSkill,
          tier: m.tier,
        })),
      },
    }

    // Track that this node has been appraised
    if (!state.player.appraisedNodeIds.includes(node.nodeId)) {
      state.player.appraisedNodeIds.push(node.nodeId)
    }

    // Check for contract completion
    const contractsCompleted = checkContractCompletion(state)

    return {
      tickBefore,
      actionType: "Gather",
      parameters,
      success: true,
      timeConsumed: timeCost,
      rngRolls: rolls,
      extraction,
      stateDeltaSummary: `Appraised node ${action.nodeId}`,
      levelUps: mergeLevelUps([], contractsCompleted),
      contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    }
  }

  // FOCUS mode - extract one material with variance and collateral
  if (mode === GatherMode.FOCUS) {
    return executeFocusExtraction(
      state,
      node,
      action.focusMaterialId!,
      skill,
      skillLevel,
      rolls,
      tickBefore,
      timeCost,
      parameters
    )
  }

  // CAREFUL_ALL mode - extract all materials slowly, no collateral
  if (mode === GatherMode.CAREFUL_ALL) {
    return executeCarefulAllExtraction(
      state,
      node,
      skill,
      skillLevel,
      rolls,
      tickBefore,
      timeCost,
      parameters
    )
  }

  // Should not reach here
  return createFailureLog(state, action, "NODE_NOT_FOUND")
}

/**
 * Execute FOCUS mode extraction
 */
function executeFocusExtraction(
  state: WorldState,
  node: Node,
  focusMaterialId: string,
  skill: GatheringSkillID,
  skillLevel: number,
  rolls: RngRoll[],
  tickBefore: number,
  timeCost: number,
  parameters: Record<string, unknown>
): ActionLog {
  const focusMaterial = node.materials.find((m) => m.materialId === focusMaterialId)!

  // Calculate yield
  const yieldPercent = calculateFocusYieldPercent(skillLevel, focusMaterial.requiredLevel)
  const focusWaste = 1 - yieldPercent

  // Get variance range based on area
  const [varMin, varMax] = getVarianceRange(node.areaId)
  const variance = rollFloat(state.rng, varMin, varMax, `variance_${focusMaterialId}`)

  // Base extraction amount (units per 5-tick action)
  const baseExtraction = 10
  const expected = baseExtraction * yieldPercent
  const actual = Math.round(expected * variance)
  const actualExtracted = Math.min(actual, focusMaterial.remainingUnits)

  // Extract from focus material
  focusMaterial.remainingUnits -= actualExtracted
  const extracted: ItemStack[] =
    actualExtracted > 0 ? [{ itemId: focusMaterialId, quantity: actualExtracted }] : []

  // Add to inventory
  if (actualExtracted > 0) {
    addToInventory(state, focusMaterialId, actualExtracted)
  }

  // Calculate and apply collateral damage
  const collateralPercent = calculateCollateralPercent(skillLevel)
  const collateralDamage: Record<string, number> = {}

  for (const material of node.materials) {
    if (material.materialId !== focusMaterialId && material.remainingUnits > 0) {
      // Collateral affects other materials proportionally
      const damageAmount = Math.round(actualExtracted * collateralPercent * 0.5)
      const actualDamage = Math.min(damageAmount, material.remainingUnits)
      material.remainingUnits -= actualDamage
      if (actualDamage > 0) {
        collateralDamage[material.materialId] = actualDamage
      }
    }
  }

  // Check if node is depleted
  const allDepleted = node.materials.every((m) => m.remainingUnits <= 0)
  if (allDepleted) {
    node.depleted = true
  }

  // Grant XP: ticks × tier
  const xpAmount = timeCost * focusMaterial.tier
  const levelUps = grantXP(state, skill, xpAmount)

  const extraction: ExtractionLog = {
    mode: GatherMode.FOCUS,
    focusMaterial: focusMaterialId,
    extracted,
    focusWaste,
    collateralDamage,
    variance: {
      expected,
      actual: actualExtracted,
      range: [Math.round(expected * varMin), Math.round(expected * varMax)],
    },
  }

  // Check for contract completion
  const contractsCompleted = checkContractCompletion(state)

  return {
    tickBefore,
    actionType: "Gather",
    parameters,
    success: true,
    timeConsumed: timeCost,
    skillGained: { skill, amount: xpAmount },
    levelUps: mergeLevelUps(levelUps, contractsCompleted),
    contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    rngRolls: rolls,
    extraction,
    xpSource: "node_extraction",
    stateDeltaSummary: `Focused extraction of ${actualExtracted} ${focusMaterialId}`,
  }
}

/**
 * Execute CAREFUL_ALL mode extraction
 */
function executeCarefulAllExtraction(
  state: WorldState,
  node: Node,
  skill: GatheringSkillID,
  skillLevel: number,
  rolls: RngRoll[],
  tickBefore: number,
  timeCost: number,
  parameters: Record<string, unknown>
): ActionLog {
  const extracted: ItemStack[] = []
  let totalXP = 0

  // Extract from each material the player can gather
  for (const material of node.materials) {
    if (material.remainingUnits <= 0) continue
    if (skillLevel < material.requiredLevel) continue

    // CAREFUL_ALL is slower but gets 100% yield (no waste)
    const baseExtraction = 5 // Slower extraction rate
    const actualExtracted = Math.min(baseExtraction, material.remainingUnits)

    if (actualExtracted > 0) {
      material.remainingUnits -= actualExtracted
      extracted.push({ itemId: material.materialId, quantity: actualExtracted })
      addToInventory(state, material.materialId, actualExtracted)
      totalXP += material.tier
    }
  }

  // Scale XP by time
  const xpAmount =
    timeCost * (totalXP / node.materials.filter((m) => skillLevel >= m.requiredLevel).length || 1)
  const levelUps = grantXP(state, skill, Math.round(xpAmount))

  // Check if node is depleted
  const allDepleted = node.materials.every((m) => m.remainingUnits <= 0)
  if (allDepleted) {
    node.depleted = true
  }

  const extraction: ExtractionLog = {
    mode: GatherMode.CAREFUL_ALL,
    extracted,
    focusWaste: 0,
    collateralDamage: {}, // No collateral in CAREFUL_ALL
  }

  // Check for contract completion
  const contractsCompleted = checkContractCompletion(state)

  return {
    tickBefore,
    actionType: "Gather",
    parameters,
    success: true,
    timeConsumed: timeCost,
    skillGained: { skill, amount: Math.round(xpAmount) },
    levelUps: mergeLevelUps(levelUps, contractsCompleted),
    contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    rngRolls: rolls,
    extraction,
    xpSource: "node_extraction",
    stateDeltaSummary: `Carefully extracted ${extracted.map((e) => `${e.quantity} ${e.itemId}`).join(", ")}`,
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

  // Roll on weighted loot table - exactly one item drops
  const lootWeights = enemy.lootTable.map((entry) => ({
    label: `loot:${entry.itemId}`,
    weight: entry.weight,
  }))
  const selectedLootIndex = rollLootTable(state.rng, lootWeights, rolls)
  const selectedLoot = enemy.lootTable[selectedLootIndex]

  // Handle special loot behaviors
  if (selectedLoot.replacesItem) {
    removeFromInventory(state, selectedLoot.replacesItem, 1)
  }
  addToInventory(state, selectedLoot.itemId, selectedLoot.quantity)
  if (selectedLoot.autoEquip) {
    state.player.equippedWeapon = selectedLoot.itemId as "CRUDE_WEAPON" | "IMPROVED_WEAPON"
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
    stateDeltaSummary: `Defeated ${enemyId}`,
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
      guildAreaId: "TOWN",
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

  // Exploration enrolment grants one distance 1 area and connection
  let explorationBenefits: { discoveredAreaId: string; discoveredConnectionId: string } | undefined
  if (skill === "Exploration") {
    explorationBenefits = grantExplorationGuildBenefits(state)
  }

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkContractCompletion(state)

  const summary = explorationBenefits?.discoveredAreaId
    ? `Enrolled in ${skill} guild, discovered area ${explorationBenefits.discoveredAreaId}`
    : `Enrolled in ${skill} guild`

  return {
    tickBefore,
    actionType: "Enrol",
    parameters: { skill },
    success: true,
    timeConsumed: check.timeCost,
    levelUps: mergeLevelUps([], contractsCompleted),
    contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    rngRolls: rolls,
    stateDeltaSummary: summary,
    explorationLog: explorationBenefits
      ? {
          discoveredAreaId: explorationBenefits.discoveredAreaId,
          discoveredConnectionId: explorationBenefits.discoveredConnectionId,
        }
      : undefined,
  }
}
