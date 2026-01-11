import type {
  WorldState,
  Action,
  ActionLog,
  RngRoll,
  AcceptContractAction,
  GatherAction,
  MineAction,
  ChopAction,
  FightAction,
  CraftAction,
  StoreAction,
  DropAction,
  GuildEnrolmentAction,
  TurnInCombatTokenAction,
  TravelToLocationAction,
  LeaveAction,
  FailureType,
  ContractCompletion,
  LevelUp,
  ExtractionLog,
  ItemStack,
  Node,
  GatheringSkillID,
  ActionGenerator,
} from "./types.js"
import { isInTown, GatherMode, NodeType, getCurrentAreaId } from "./types.js"
import { rollFloat } from "./rng.js"
import {
  executeSurvey,
  executeExplore,
  executeExplorationTravel,
  executeFarTravel,
  grantExplorationGuildBenefits,
  getAreaDisplayName,
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
  checkTravelToLocationAction,
  checkLeaveAction,
  getNodeSkill,
} from "./actionChecks.js"
import {
  consumeTime,
  addToInventory,
  removeFromInventory,
  addToStorage,
  grantXP,
  checkAndCompleteContracts,
} from "./stateHelpers.js"
import { getLocationDisplayName } from "./world.js"

/**
 * Helper to consume an action generator and return the final ActionLog.
 * Used for backward compatibility during transition.
 */
export async function executeToCompletion(generator: ActionGenerator): Promise<ActionLog> {
  let log: ActionLog | null = null
  for await (const tick of generator) {
    if (tick.done) {
      log = tick.log
    }
  }
  if (!log) {
    throw new Error("Generator completed without producing a final log")
  }
  return log
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

export async function executeAction(state: WorldState, action: Action): Promise<ActionLog> {
  switch (action.type) {
    case "Move":
      // Move is an alias for ExplorationTravel
      return executeToCompletion(
        executeExplorationTravel(state, {
          type: "ExplorationTravel",
          destinationAreaId: action.destination,
        })
      )
    case "AcceptContract":
      return executeToCompletion(executeAcceptContract(state, action))
    case "Gather":
      return executeToCompletion(executeGather(state, action))
    case "Mine":
      return executeToCompletion(executeMine(state, action))
    case "Chop":
      return executeToCompletion(executeChop(state, action))
    case "Fight":
      return executeToCompletion(executeFight(state, action))
    case "Craft":
      return executeToCompletion(executeCraft(state, action))
    case "Store":
      return executeToCompletion(executeStore(state, action))
    case "Drop":
      return executeToCompletion(executeDrop(state, action))
    case "Enrol":
      return executeToCompletion(executeGuildEnrolment(state, action))
    case "TurnInCombatToken":
      return executeToCompletion(executeTurnInCombatToken(state, action))
    case "Survey":
      return executeToCompletion(executeSurvey(state, action))
    case "Explore":
      return executeToCompletion(executeExplore(state, action))
    case "ExplorationTravel":
      return executeToCompletion(executeExplorationTravel(state, action))
    case "FarTravel":
      return executeToCompletion(executeFarTravel(state, action))
    case "TravelToLocation":
      return executeToCompletion(executeTravelToLocation(state, action))
    case "Leave":
      return executeToCompletion(executeLeave(state, action))
  }
}

async function* executeAcceptContract(
  state: WorldState,
  action: AcceptContractAction
): ActionGenerator {
  const tickBefore = state.time.currentTick
  const contractId = action.contractId

  // Use shared precondition check
  const check = checkAcceptContractAction(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog(state, action, check.failureType!) }
    return
  }

  // Accept contract
  state.player.activeContracts.push(contractId)

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkAndCompleteContracts(state)

  // 0-tick action - yield only the final done tick
  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "AcceptContract",
      parameters: { contractId },
      success: true,
      timeConsumed: 0,
      levelUps: mergeLevelUps([], contractsCompleted),
      contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
      rngRolls: [],
      stateDeltaSummary: `Accepted contract ${contractId}`,
    },
  }
}

async function* executeGather(state: WorldState, action: GatherAction): ActionGenerator {
  const tickBefore = state.time.currentTick
  const rolls: RngRoll[] = []

  // Use shared precondition check
  const check = checkGatherAction(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog(state, action, check.failureType!) }
    return
  }

  const totalTicks = check.timeCost

  // Yield ticks during gathering
  for (let tick = 0; tick < totalTicks; tick++) {
    consumeTime(state, 1)
    yield { done: false }
  }

  // Execute multi-material node gather (keep existing logic)
  const log = executeMultiMaterialGatherInternal(state, action, rolls, tickBefore, check.timeCost)

  yield { done: true, log }
}

// Renamed from executeMultiMaterialGather to avoid confusion
function executeMultiMaterialGatherInternal(
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
    const contractsCompleted = checkAndCompleteContracts(state)

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
 * Find a node by type in the player's current area
 */
function findNodeByTypeInCurrentArea(state: WorldState, nodeType: NodeType): Node | undefined {
  const currentAreaId = getCurrentAreaId(state)
  return state.world.nodes?.find(
    (n) => n.areaId === currentAreaId && n.nodeType === nodeType && !n.depleted
  )
}

/**
 * Execute Mine action - alias for Gather at ORE_VEIN
 * Finds the ore vein node in the current area and executes gather
 */
async function* executeMine(state: WorldState, action: MineAction): ActionGenerator {
  // Find ORE_VEIN node in current area
  const node = findNodeByTypeInCurrentArea(state, NodeType.ORE_VEIN)

  if (!node) {
    yield { done: true, log: createFailureLog(state, action, "NODE_NOT_FOUND") }
    return
  }

  // Convert to GatherAction and execute
  const gatherAction: GatherAction = {
    type: "Gather",
    nodeId: node.nodeId,
    mode: action.mode,
    focusMaterialId: action.focusMaterialId,
  }

  yield* executeGather(state, gatherAction)
}

/**
 * Execute Chop action - alias for Gather at TREE_STAND
 * Finds the tree stand node in the current area and executes gather
 */
async function* executeChop(state: WorldState, action: ChopAction): ActionGenerator {
  // Find TREE_STAND node in current area
  const node = findNodeByTypeInCurrentArea(state, NodeType.TREE_STAND)

  if (!node) {
    yield { done: true, log: createFailureLog(state, action, "NODE_NOT_FOUND") }
    return
  }

  // Convert to GatherAction and execute
  const gatherAction: GatherAction = {
    type: "Gather",
    nodeId: node.nodeId,
    mode: action.mode,
    focusMaterialId: action.focusMaterialId,
  }

  yield* executeGather(state, gatherAction)
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
  const contractsCompleted = checkAndCompleteContracts(state)

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
  const contractsCompleted = checkAndCompleteContracts(state)

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

/**
 * Execute Fight action
 * NOTE: Combat is not yet fully implemented - this will always fail with ENEMY_NOT_FOUND
 */
async function* executeFight(state: WorldState, action: FightAction): ActionGenerator {
  // Use shared precondition check (will always fail - no enemies exist)
  const check = checkFightAction(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog(state, action, check.failureType!) }
    return
  }

  // This code is unreachable until combat is fully implemented
  throw new Error("Combat execution reached despite no enemies existing - this should not happen")
}

async function* executeCraft(state: WorldState, action: CraftAction): ActionGenerator {
  const tickBefore = state.time.currentTick
  const recipeId = action.recipeId

  // Use shared precondition check
  const check = checkCraftAction(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog(state, action, check.failureType!) }
    return
  }

  // Get recipe for additional info
  const recipe = state.world.recipes.find((r) => r.id === recipeId)!
  const totalTicks = recipe.craftTime

  // Consume materials on first tick
  for (const input of recipe.inputs) {
    removeFromInventory(state, input.itemId, input.quantity)
  }

  // Yield ticks
  for (let tick = 0; tick < totalTicks; tick++) {
    consumeTime(state, 1)

    if (tick === 0) {
      // Show materials consumed on first tick
      yield {
        done: false,
        feedback: {
          materialsConsumed: recipe.inputs.map((i) => ({ itemId: i.itemId, quantity: i.quantity })),
        },
      }
    } else if (tick === totalTicks - 1) {
      // Produce output on last tick
      addToInventory(state, recipe.output.itemId, recipe.output.quantity)
      yield {
        done: false,
        feedback: { crafted: { itemId: recipe.output.itemId, quantity: recipe.output.quantity } },
      }
    } else {
      // Intermediate ticks
      yield { done: false }
    }
  }

  // Grant XP to the skill matching the recipe's guild type
  const levelUps = grantXP(state, recipe.guildType, 1)

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkAndCompleteContracts(state)

  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "Craft",
      parameters: { recipeId },
      success: true,
      timeConsumed: check.timeCost,
      skillGained: { skill: recipe.guildType, amount: 1 },
      levelUps: mergeLevelUps(levelUps, contractsCompleted),
      contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
      rngRolls: [],
      stateDeltaSummary: `Crafted ${recipe.output.quantity} ${recipe.output.itemId}`,
    },
  }
}

async function* executeStore(state: WorldState, action: StoreAction): ActionGenerator {
  const tickBefore = state.time.currentTick
  const { itemId, quantity } = action

  // Use shared precondition check
  const check = checkStoreAction(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog(state, action, check.failureType!) }
    return
  }

  // Store is a free action (0 ticks), no time check needed

  // Move item to storage (no time consumed, no XP)
  removeFromInventory(state, itemId, quantity)
  addToStorage(state, itemId, quantity)

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkAndCompleteContracts(state)

  // 0-tick action - yield only the final done tick
  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "Store",
      parameters: { itemId, quantity },
      success: true,
      timeConsumed: 0,
      levelUps: mergeLevelUps([], contractsCompleted),
      contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
      rngRolls: [],
      stateDeltaSummary: `Stored ${quantity} ${itemId}`,
    },
  }
}

async function* executeDrop(state: WorldState, action: DropAction): ActionGenerator {
  const tickBefore = state.time.currentTick
  const { itemId, quantity } = action

  // Use shared precondition check
  const check = checkDropAction(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog(state, action, check.failureType!) }
    return
  }

  // Consume time (1 tick)
  consumeTime(state, 1)

  // Remove item from inventory
  removeFromInventory(state, itemId, quantity)

  // Yield tick with feedback
  yield { done: false, feedback: { message: `Dropped ${quantity}x ${itemId}` } }

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkAndCompleteContracts(state)

  // Final yield with log
  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "Drop",
      parameters: { itemId, quantity },
      success: true,
      timeConsumed: check.timeCost,
      levelUps: mergeLevelUps([], contractsCompleted),
      contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
      rngRolls: [],
      stateDeltaSummary: `Dropped ${quantity} ${itemId}`,
    },
  }
}

async function* executeTurnInCombatToken(
  state: WorldState,
  action: TurnInCombatTokenAction
): ActionGenerator {
  const tickBefore = state.time.currentTick

  // Use shared precondition check
  const check = checkTurnInCombatTokenAction(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog(state, action, check.failureType!) }
    return
  }

  // Consume the token
  removeFromInventory(state, "COMBAT_GUILD_TOKEN", 1)

  // Add combat-guild-1 contract to the world if not already present
  if (!state.world.contracts.find((c) => c.id === "combat-guild-1")) {
    state.world.contracts.push({
      id: "combat-guild-1",
      level: 1,
      acceptLocationId: "TOWN_COMBAT_GUILD",
      guildType: "Combat",
      requirements: [],
      killRequirements: [{ enemyId: "cave-rat", count: 2 }],
      rewards: [],
      reputationReward: 0,
      xpReward: { skill: "Combat", amount: 5 }, // 4-6 XP, using 5 as fixed value
    })
  }

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkAndCompleteContracts(state)

  // 0-tick action - yield only the final done tick
  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "TurnInCombatToken",
      parameters: {},
      success: true,
      timeConsumed: 0,
      levelUps: mergeLevelUps([], contractsCompleted),
      contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
      rngRolls: [],
      stateDeltaSummary: "Turned in Combat Guild Token, unlocked combat-guild-1 contract",
    },
  }
}

async function* executeGuildEnrolment(
  state: WorldState,
  action: GuildEnrolmentAction
): ActionGenerator {
  const tickBefore = state.time.currentTick
  const { skill } = action

  // Use shared precondition check
  const check = checkGuildEnrolmentAction(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog(state, action, check.failureType!) }
    return
  }

  // Enrol takes 3 ticks
  for (let tick = 0; tick < 3; tick++) {
    consumeTime(state, 1)
    yield { done: false }
  }

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
    explorationBenefits = await grantExplorationGuildBenefits(state)
  }

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkAndCompleteContracts(state)

  const discoveredAreaId = explorationBenefits?.discoveredAreaId
  const discoveredArea = discoveredAreaId
    ? state.exploration?.areas.get(discoveredAreaId)
    : undefined
  const summary =
    discoveredArea && discoveredAreaId
      ? `Enrolled in ${skill} guild, discovered ${getAreaDisplayName(discoveredAreaId, discoveredArea)}`
      : `Enrolled in ${skill} guild`

  // Feedback after enrolment completes
  yield { done: false, feedback: { message: `Enrolled in ${skill} guild!` } }

  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "Enrol",
      parameters: { skill },
      success: true,
      timeConsumed: check.timeCost,
      levelUps: mergeLevelUps([], contractsCompleted),
      contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
      rngRolls: [],
      stateDeltaSummary: summary,
      explorationLog: explorationBenefits
        ? {
            discoveredAreaId: explorationBenefits.discoveredAreaId,
            discoveredConnectionId: explorationBenefits.discoveredConnectionId,
          }
        : undefined,
    },
  }
}

async function* executeTravelToLocation(
  state: WorldState,
  action: TravelToLocationAction
): ActionGenerator {
  const tickBefore = state.time.currentTick
  const { locationId } = action

  // Use shared precondition check
  const check = checkTravelToLocationAction(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog(state, action, check.failureType!) }
    return
  }

  const ticks = check.timeCost

  // Yield a tick if > 0
  if (ticks > 0) {
    consumeTime(state, 1)
    yield { done: false }
  }

  // Move to location
  state.exploration.playerState.currentLocationId = locationId

  // Track visited locations (for knowledge/discovery tracking)
  if (!state.exploration.playerState.visitedLocationIds.includes(locationId)) {
    state.exploration.playerState.visitedLocationIds.push(locationId)
  }

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkAndCompleteContracts(state)

  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "TravelToLocation",
      parameters: { locationId },
      success: true,
      timeConsumed: check.timeCost,
      levelUps: mergeLevelUps([], contractsCompleted),
      contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
      rngRolls: [],
      stateDeltaSummary: `Traveled to ${getLocationDisplayName(locationId, state.exploration.playerState.currentAreaId, state)}`,
    },
  }
}

async function* executeLeave(state: WorldState, action: LeaveAction): ActionGenerator {
  const tickBefore = state.time.currentTick
  const previousLocation = state.exploration.playerState.currentLocationId

  // Use shared precondition check
  const check = checkLeaveAction(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog(state, action, check.failureType!) }
    return
  }

  const ticks = check.timeCost

  // Yield a tick if > 0
  if (ticks > 0) {
    consumeTime(state, 1)
    yield { done: false }
  }

  // Return to hub (null)
  state.exploration.playerState.currentLocationId = null

  // Check for contract completion (after every successful action)
  const contractsCompleted = checkAndCompleteContracts(state)

  const hubName = isInTown(state) ? "Town Square" : "clearing"

  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "Leave",
      parameters: {},
      success: true,
      timeConsumed: check.timeCost,
      levelUps: mergeLevelUps([], contractsCompleted),
      contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
      rngRolls: [],
      stateDeltaSummary: `Left ${getLocationDisplayName(previousLocation, state.exploration.playerState.currentAreaId, state)} for ${hubName}`,
    },
  }
}

// Export generator functions for use in interactive.ts
export {
  executeAcceptContract,
  executeGather,
  executeMine,
  executeChop,
  executeFight,
  executeCraft,
  executeStore,
  executeDrop,
  executeGuildEnrolment,
  executeTurnInCombatToken,
  executeTravelToLocation,
  executeLeave,
}
