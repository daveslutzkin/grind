import type {
  WorldState,
  Action,
  ActionLog,
  RngRoll,
  AcceptContractAction,
  TurnInContractAction,
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
  BuyMapAction,
  SeeGatheringMapAction,
  FailureType,
  ContractCompletion,
  LevelUp,
  ExtractionLog,
  ItemStack,
  Node,
  GatheringSkillID,
  ActionGenerator,
} from "./types.js"
import { isInTown, GatherMode, NodeType, getCurrentAreaId, getCurrentLocationId } from "./types.js"
import { rollFloat, rollNormal } from "./rng.js"
import {
  executeSurvey,
  executeExplore,
  executeExplorationTravel,
  executeFarTravel,
  grantExplorationGuildBenefits,
  getAreaDisplayName,
  ensureAreaFullyGenerated,
} from "./exploration.js"
import {
  checkAcceptContractAction,
  checkTurnInContractAction,
  checkGatherAction,
  checkFightAction,
  checkCraftAction,
  checkStoreAction,
  checkDropAction,
  checkGuildEnrolmentAction,
  checkTurnInCombatTokenAction,
  checkTravelToLocationAction,
  checkLeaveAction,
  checkBuyMapAction,
  checkSeeGatheringMapAction,
  getNodeSkill,
} from "./actionChecks.js"
import { getCollateralRate, getBonusYieldChance, hasMasteryUnlock } from "./masteryData.js"
import {
  refreshMiningContracts,
  findNodeForMap,
  getNodeMapPrice,
  getAreaMapPrice,
  ensureCorridorToDistance,
  findPathUsingAllConnections,
  nodeIdToLocationId,
} from "./contracts.js"
import {
  consumeTime,
  addToInventory,
  removeFromInventory,
  addToInventoryWithOverflow,
  addToStorage,
  grantXP,
  consumeContractRequirements,
  grantContractRewards,
  canFitContractRewards,
} from "./stateHelpers.js"
import { getLocationDisplayName, getSkillForGuildLocation } from "./world.js"
import { resolveDestination } from "./resolution.js"

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

function createFailureLog(
  state: WorldState,
  action: Action,
  failureType: FailureType,
  timeConsumed: number = 0,
  reason?: string,
  context?: Record<string, unknown>
): ActionLog {
  return {
    tickBefore: state.time.currentTick,
    actionType: action.type,
    parameters: extractParameters(action),
    success: false,
    failureDetails: {
      type: failureType,
      reason,
      context,
    },
    timeConsumed,
    rngRolls: [],
    stateDeltaSummary: `Failed: ${failureType}`,
  }
}

function extractParameters(action: Action): Record<string, unknown> {
  const { type: _type, ...params } = action
  return params
}

/**
 * Helper to create a generator that immediately yields a failure log
 */
async function* createFailureGenerator(
  state: WorldState,
  action: Action,
  failureType: FailureType,
  reason?: string,
  context?: Record<string, unknown>
): ActionGenerator {
  yield { done: true, log: createFailureLog(state, action, failureType, 0, reason, context) }
}

/**
 * Get the action generator for any action type, with resolution.
 * This handles destination resolution for Move/FarTravel actions and returns
 * the appropriate generator. Used by both executeAction and interactive mode.
 */
export function getActionGenerator(state: WorldState, action: Action): ActionGenerator {
  switch (action.type) {
    case "Move": {
      // Resolve the destination string to a specific location or area
      const resolved = resolveDestination(state, action.destination, "near")

      switch (resolved.type) {
        case "location":
          return executeTravelToLocation(state, {
            type: "TravelToLocation",
            locationId: resolved.locationId!,
          })
        case "area":
          return executeExplorationTravel(state, {
            type: "ExplorationTravel",
            destinationAreaId: resolved.areaId!,
          })
        case "farTravel":
          return executeFarTravel(state, {
            type: "FarTravel",
            destinationAreaId: resolved.areaId!,
          })
        case "notFound":
          return createFailureGenerator(state, action, "NO_PATH_TO_DESTINATION")
      }
      break
    }
    case "AcceptContract":
      return executeAcceptContract(state, action)
    case "TurnInContract":
      return executeTurnInContract(state, action)
    case "Gather":
      return executeGather(state, action)
    case "Mine":
      return executeMine(state, action)
    case "Chop":
      return executeChop(state, action)
    case "Fight":
      return executeFight(state, action)
    case "Craft":
      return executeCraft(state, action)
    case "Store":
      return executeStore(state, action)
    case "Drop":
      return executeDrop(state, action)
    case "Enrol":
      return executeGuildEnrolment(state, action)
    case "TurnInCombatToken":
      return executeTurnInCombatToken(state, action)
    case "Survey":
      return executeSurvey(state, action)
    case "Explore":
      return executeExplore(state, action)
    case "ExplorationTravel":
      return executeExplorationTravel(state, action)
    case "FarTravel": {
      // Resolve the destination string to an area ID
      const resolved = resolveDestination(state, action.destinationAreaId, "far")

      if (resolved.type === "area" || resolved.type === "farTravel") {
        return executeFarTravel(state, {
          type: "FarTravel",
          destinationAreaId: resolved.areaId!,
          scavenge: action.scavenge,
        })
      } else {
        return createFailureGenerator(state, action, "NO_PATH_TO_DESTINATION")
      }
    }
    case "TravelToLocation":
      return executeTravelToLocation(state, action)
    case "Leave":
      return executeLeave(state, action)
    case "BuyMap":
      return executeBuyMap(state, action)
    case "SeeGatheringMap":
      return executeSeeGatheringMap(state, action)
  }
}

export async function executeAction(state: WorldState, action: Action): Promise<ActionLog> {
  return executeToCompletion(getActionGenerator(state, action))
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
    yield {
      done: true,
      log: createFailureLog(
        state,
        action,
        check.failureType!,
        0,
        check.failureReason,
        check.failureContext
      ),
    }
    return
  }

  // Accept contract
  state.player.activeContracts.push(contractId)

  // Get contract for map redemption and slot refresh
  const contract = state.world.contracts.find((c) => c.id === contractId)

  // Phase 2: Redeem included map if present
  if (contract?.includedMap) {
    const map = contract.includedMap

    // Reveal all areas in the path (add to knownAreaIds) and generate their names
    for (const areaId of map.areaIds) {
      if (!state.exploration.playerState.knownAreaIds.includes(areaId)) {
        state.exploration.playerState.knownAreaIds.push(areaId)
      }
      // Ensure area is fully generated (content + connections + name)
      const area = state.exploration.areas.get(areaId)
      if (area) {
        await ensureAreaFullyGenerated(state, area)
      }
    }

    // Reveal all connections in the path (add to knownConnectionIds)
    for (const connectionId of map.connectionIds) {
      if (!state.exploration.playerState.knownConnectionIds.includes(connectionId)) {
        state.exploration.playerState.knownConnectionIds.push(connectionId)
      }
    }

    // Store pending node discovery for later (when player arrives at area)
    if (!state.player.pendingNodeDiscoveries) {
      state.player.pendingNodeDiscoveries = []
    }
    state.player.pendingNodeDiscoveries.push({
      areaId: map.targetAreaId,
      nodeLocationId: map.targetNodeId,
    })
  }

  // If this is a mining contract, refresh the slot with a new contract
  if (contract?.guildType === "Mining" && contract.slot) {
    refreshMiningContracts(state, contract.slot)
  }

  // Build state delta summary
  let stateDeltaSummary = `Accepted contract ${contractId}`
  if (contract?.includedMap) {
    const targetAreaId = contract.includedMap.targetAreaId
    const targetArea = state.exploration.areas.get(targetAreaId)
    const areaName = getAreaDisplayName(targetAreaId, targetArea)
    stateDeltaSummary += `, discovered path to ${areaName}`
  }

  // 0-tick action - yield only the final done tick
  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "AcceptContract",
      parameters: { contractId },
      success: true,
      timeConsumed: 0,
      levelUps: [],
      rngRolls: [],
      stateDeltaSummary,
    },
  }
}

async function* executeTurnInContract(
  state: WorldState,
  action: TurnInContractAction
): ActionGenerator {
  const tickBefore = state.time.currentTick
  const contractId = action.contractId

  // Use shared precondition check
  const check = checkTurnInContractAction(state, action)
  if (!check.valid) {
    yield {
      done: true,
      log: createFailureLog(
        state,
        action,
        check.failureType!,
        0,
        check.failureReason,
        check.failureContext
      ),
    }
    return
  }

  const contract = state.world.contracts.find((c) => c.id === contractId)!

  // Check if rewards will fit in inventory
  if (!canFitContractRewards(state, contract.requirements, contract.rewards)) {
    yield {
      done: true,
      log: createFailureLog(state, action, "INVENTORY_FULL", 0, "rewards_wont_fit", {
        contractId,
      }),
    }
    return
  }

  // Record what we're consuming for the log
  const itemsConsumed = contract.requirements.map((req) => ({
    itemId: req.itemId,
    quantity: req.quantity,
  }))

  // Consume required items
  consumeContractRequirements(state, contract.requirements)

  // Record what we're granting for the log
  const rewardsGranted = contract.rewards.map((reward) => ({
    itemId: reward.itemId,
    quantity: reward.quantity,
  }))

  // Grant contract rewards
  grantContractRewards(state, contract.rewards)

  // Award reputation
  state.player.guildReputation += contract.reputationReward

  // Award gold if contract has goldReward
  let goldEarned: number | undefined
  if (contract.goldReward) {
    state.player.gold += contract.goldReward
    goldEarned = contract.goldReward
  }

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

  // Regenerate the completed contract's slot immediately
  if (contract.slot && contract.guildType === "Mining") {
    refreshMiningContracts(state, contract.slot)
  }

  // Build completion result
  const completion: ContractCompletion = {
    contractId,
    itemsConsumed,
    rewardsGranted,
    reputationGained: contract.reputationReward,
    goldEarned,
    xpGained: contract.xpReward,
    levelUps: contractLevelUps.length > 0 ? contractLevelUps : undefined,
  }

  // Build summary
  let summary = `Turned in contract ${contractId}`
  if (goldEarned) {
    summary += `, earned ${goldEarned.toFixed(1)} gold`
  }
  summary += `, +${contract.reputationReward} reputation`

  // 0-tick action
  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "TurnInContract",
      parameters: { contractId },
      success: true,
      timeConsumed: 0,
      levelUps: contractLevelUps,
      contractsCompleted: [completion],
      rngRolls: [],
      stateDeltaSummary: summary,
    },
  }
}

async function* executeGather(state: WorldState, action: GatherAction): ActionGenerator {
  const tickBefore = state.time.currentTick
  const rolls: RngRoll[] = []

  // If nodeId is not provided, try to infer from current location
  let nodeId = action.nodeId
  if (!nodeId) {
    const currentLocationId = getCurrentLocationId(state)
    if (currentLocationId) {
      const match = currentLocationId.match(/^(.+?)-(TREE_STAND|ORE_VEIN)-loc-(\d+)$/)
      if (match) {
        const [, areaId, , locIndex] = match
        nodeId = `${areaId}-node-${locIndex}`
      }
    }

    if (!nodeId) {
      yield {
        done: true,
        log: createFailureLog(state, action, "NODE_NOT_FOUND", 0, "cannot_infer_node", {
          currentLocationId: getCurrentLocationId(state),
          currentAreaId: getCurrentAreaId(state),
        }),
      }
      return
    }
  }

  // Create a new action with resolved nodeId for validation
  const resolvedAction: GatherAction = {
    ...action,
    nodeId,
  }

  // Use shared precondition check
  const check = checkGatherAction(state, resolvedAction)
  if (!check.valid) {
    yield {
      done: true,
      log: createFailureLog(
        state,
        resolvedAction,
        check.failureType!,
        0,
        check.failureReason,
        check.failureContext
      ),
    }
    return
  }

  const baseTicks = check.timeCost

  // Apply time variance (±25% using normal distribution)
  // Skip variance for APPRAISE mode (always 1 tick)
  let actualTicks = baseTicks
  let luckDelta = 0
  if (resolvedAction.mode !== GatherMode.APPRAISE && baseTicks > 1) {
    const variance = baseTicks * 0.25 // Standard deviation = 25% of base
    const variedTime = rollNormal(state.rng, baseTicks, variance, "time_variance")
    actualTicks = Math.max(1, Math.round(variedTime))
    luckDelta = baseTicks - actualTicks // Positive = lucky (faster), negative = unlucky (slower)
  }

  // Yield ticks during gathering
  for (let tick = 0; tick < actualTicks; tick++) {
    consumeTime(state, 1)
    yield { done: false }
  }

  // Execute multi-material node gather (keep existing logic)
  const log = executeMultiMaterialGatherInternal(
    state,
    resolvedAction,
    rolls,
    tickBefore,
    actualTicks,
    baseTicks,
    luckDelta
  )

  yield { done: true, log }
}

// Renamed from executeMultiMaterialGather to avoid confusion
function executeMultiMaterialGatherInternal(
  state: WorldState,
  action: GatherAction,
  rolls: RngRoll[],
  tickBefore: number,
  actualTicks: number,
  baseTicks: number,
  luckDelta: number
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
        materials: node.materials.map((m) => {
          // Only show quantities if player has Appraise mastery (M6) for this material
          const canSeeQuantity = hasMasteryUnlock(skillLevel, m.materialId, "Appraise")
          return {
            materialId: m.materialId,
            remaining: canSeeQuantity ? m.remainingUnits : undefined,
            max: canSeeQuantity ? m.maxUnitsInitial : undefined,
            requiredLevel: m.requiredLevel,
            requiresSkill: m.requiresSkill,
            tier: m.tier,
            canSeeQuantity,
          }
        }),
      },
    }

    // Track that this node has been appraised
    if (!state.player.appraisedNodeIds.includes(node.nodeId)) {
      state.player.appraisedNodeIds.push(node.nodeId)
    }

    return {
      tickBefore,
      actionType: "Gather",
      parameters,
      success: true,
      timeConsumed: actualTicks, // Always 1 for APPRAISE
      rngRolls: rolls,
      extraction,
      stateDeltaSummary: `Appraised node ${action.nodeId}`,
      levelUps: [],
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
      actualTicks,
      baseTicks,
      luckDelta,
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
      actualTicks,
      baseTicks,
      luckDelta,
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
    yield {
      done: true,
      log: createFailureLog(state, action, "NODE_NOT_FOUND", 0, "no_node_in_area", {
        nodeType: NodeType.ORE_VEIN,
        currentAreaId: getCurrentAreaId(state),
      }),
    }
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
    yield {
      done: true,
      log: createFailureLog(state, action, "NODE_NOT_FOUND", 0, "no_node_in_area", {
        nodeType: NodeType.TREE_STAND,
        currentAreaId: getCurrentAreaId(state),
      }),
    }
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
 * Execute FOCUS mode extraction
 *
 * New model (Phase 3):
 * - Extract exactly 1 unit (or 2 with bonus yield)
 * - Collateral damage based on material mastery (getCollateralRate)
 * - XP = 1 per unit extracted
 */
function executeFocusExtraction(
  state: WorldState,
  node: Node,
  focusMaterialId: string,
  skill: GatheringSkillID,
  skillLevel: number,
  rolls: RngRoll[],
  tickBefore: number,
  actualTicks: number,
  baseTicks: number,
  luckDelta: number,
  parameters: Record<string, unknown>
): ActionLog {
  const focusMaterial = node.materials.find((m) => m.materialId === focusMaterialId)!

  // Check bonus yield (M10 = 5%, M20 = 10%)
  const bonusChance = getBonusYieldChance(skillLevel, focusMaterialId)
  const bonusRoll = rollFloat(state.rng, 0, 1, "bonus_yield")
  const unitsToExtract = bonusRoll < bonusChance ? 2 : 1

  // Extract from node (max available)
  const actualExtracted = Math.min(unitsToExtract, focusMaterial.remainingUnits)
  focusMaterial.remainingUnits -= actualExtracted

  const extracted: ItemStack[] =
    actualExtracted > 0 ? [{ itemId: focusMaterialId, quantity: actualExtracted }] : []

  // Add to inventory with overflow handling
  const discardedItems: ItemStack[] = []
  if (actualExtracted > 0) {
    const result = addToInventoryWithOverflow(state, focusMaterialId, actualExtracted)
    if (result.discarded > 0) {
      discardedItems.push({ itemId: focusMaterialId, quantity: result.discarded })
    }
  }

  // Apply mastery-based collateral damage to other materials
  const collateralRate = getCollateralRate(skillLevel, focusMaterialId)
  const collateralDamage: Record<string, number> = {}

  for (const material of node.materials) {
    if (material.materialId !== focusMaterialId && material.remainingUnits > 0) {
      // Fractional damage: extracted units × collateral rate
      const damage = actualExtracted * collateralRate
      material.remainingUnits = Math.max(0, material.remainingUnits - damage)
      if (damage > 0) {
        collateralDamage[material.materialId] = damage
      }
    }
  }

  // Check if node is depleted
  const allDepleted = node.materials.every((m) => m.remainingUnits <= 0)
  if (allDepleted) {
    node.depleted = true
  }

  // Grant XP: 1 per unit extracted
  const xpAmount = actualExtracted
  const levelUps = grantXP(state, skill, xpAmount)

  // No focus waste in new model (always 100% of 1 unit)
  const focusWaste = 0

  // Update player's cumulative luck
  state.player.gatheringLuckDelta += luckDelta

  const extraction: ExtractionLog = {
    mode: GatherMode.FOCUS,
    focusMaterial: focusMaterialId,
    extracted,
    discardedItems: discardedItems.length > 0 ? discardedItems : undefined,
    focusWaste,
    collateralDamage,
    variance: {
      expected: baseTicks,
      actual: actualTicks,
      range: [1, bonusChance > 0 ? 2 : 1], // Yield range
      luckDelta,
    },
  }

  return {
    tickBefore,
    actionType: "Gather",
    parameters,
    success: true,
    timeConsumed: actualTicks,
    skillGained: { skill, amount: xpAmount },
    levelUps,
    rngRolls: rolls,
    extraction,
    xpSource: "node_extraction",
    stateDeltaSummary: `Focused extraction of ${actualExtracted} ${focusMaterialId}`,
  }
}

/**
 * Execute CAREFUL_ALL mode extraction
 *
 * New model (Phase 3):
 * - Select 1 random material from M16-unlocked materials
 * - Extract 1 unit (or 2 with bonus yield)
 * - No collateral damage
 * - XP = 1 per unit extracted
 */
function executeCarefulAllExtraction(
  state: WorldState,
  node: Node,
  skill: GatheringSkillID,
  skillLevel: number,
  rolls: RngRoll[],
  tickBefore: number,
  actualTicks: number,
  baseTicks: number,
  luckDelta: number,
  parameters: Record<string, unknown>
): ActionLog {
  // Get materials with Careful (M16) unlock
  const carefulMaterials = node.materials.filter(
    (m) => m.remainingUnits > 0 && hasMasteryUnlock(skillLevel, m.materialId, "Careful")
  )

  // Random selection from careful-unlocked materials
  const selectionRoll = rollFloat(state.rng, 0, carefulMaterials.length, "careful_select")
  const selectedIndex = Math.floor(selectionRoll)
  const selectedMaterial = carefulMaterials[selectedIndex]

  // Check bonus yield for selected material
  const bonusChance = getBonusYieldChance(skillLevel, selectedMaterial.materialId)
  const bonusRoll = rollFloat(state.rng, 0, 1, "bonus_yield")
  const unitsToExtract = bonusRoll < bonusChance ? 2 : 1

  // Extract from node (max available)
  const actualExtracted = Math.min(unitsToExtract, selectedMaterial.remainingUnits)
  selectedMaterial.remainingUnits -= actualExtracted

  const extracted: ItemStack[] =
    actualExtracted > 0 ? [{ itemId: selectedMaterial.materialId, quantity: actualExtracted }] : []

  // Add to inventory with overflow handling
  const discardedItems: ItemStack[] = []
  if (actualExtracted > 0) {
    const result = addToInventoryWithOverflow(state, selectedMaterial.materialId, actualExtracted)
    if (result.discarded > 0) {
      discardedItems.push({ itemId: selectedMaterial.materialId, quantity: result.discarded })
    }
  }

  // No collateral damage in CAREFUL mode

  // Check if node is depleted
  const allDepleted = node.materials.every((m) => m.remainingUnits <= 0)
  if (allDepleted) {
    node.depleted = true
  }

  // Grant XP: 1 per unit extracted
  const xpAmount = actualExtracted
  const levelUps = grantXP(state, skill, xpAmount)

  // Update player's cumulative luck
  state.player.gatheringLuckDelta += luckDelta

  const extraction: ExtractionLog = {
    mode: GatherMode.CAREFUL_ALL,
    extracted,
    discardedItems: discardedItems.length > 0 ? discardedItems : undefined,
    focusWaste: 0,
    collateralDamage: {}, // No collateral in CAREFUL mode
    variance: {
      expected: baseTicks,
      actual: actualTicks,
      range: [1, bonusChance > 0 ? 2 : 1], // Yield range
      luckDelta,
    },
  }

  return {
    tickBefore,
    actionType: "Gather",
    parameters,
    success: true,
    timeConsumed: actualTicks,
    skillGained: { skill, amount: xpAmount },
    levelUps,
    rngRolls: rolls,
    extraction,
    xpSource: "node_extraction",
    stateDeltaSummary: `Carefully extracted ${actualExtracted} ${selectedMaterial.materialId}`,
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
    yield {
      done: true,
      log: createFailureLog(
        state,
        action,
        check.failureType!,
        0,
        check.failureReason,
        check.failureContext
      ),
    }
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
    yield {
      done: true,
      log: createFailureLog(
        state,
        action,
        check.failureType!,
        0,
        check.failureReason,
        check.failureContext
      ),
    }
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

  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "Craft",
      parameters: { recipeId },
      success: true,
      timeConsumed: check.timeCost,
      skillGained: { skill: recipe.guildType, amount: 1 },
      levelUps,
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
    yield {
      done: true,
      log: createFailureLog(
        state,
        action,
        check.failureType!,
        0,
        check.failureReason,
        check.failureContext
      ),
    }
    return
  }

  // Store is a free action (0 ticks), no time check needed

  // Move item to storage (no time consumed, no XP)
  removeFromInventory(state, itemId, quantity)
  addToStorage(state, itemId, quantity)

  // 0-tick action - yield only the final done tick
  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "Store",
      parameters: { itemId, quantity },
      success: true,
      timeConsumed: 0,
      levelUps: [],
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
    yield {
      done: true,
      log: createFailureLog(
        state,
        action,
        check.failureType!,
        0,
        check.failureReason,
        check.failureContext
      ),
    }
    return
  }

  // Consume time (1 tick)
  consumeTime(state, 1)

  // Remove item from inventory
  removeFromInventory(state, itemId, quantity)

  // Yield tick with feedback
  yield { done: false, feedback: { message: `Dropped ${quantity}x ${itemId}` } }

  // Final yield with log
  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "Drop",
      parameters: { itemId, quantity },
      success: true,
      timeConsumed: check.timeCost,
      levelUps: [],
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
    yield {
      done: true,
      log: createFailureLog(
        state,
        action,
        check.failureType!,
        0,
        check.failureReason,
        check.failureContext
      ),
    }
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

  // 0-tick action - yield only the final done tick
  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "TurnInCombatToken",
      parameters: {},
      success: true,
      timeConsumed: 0,
      levelUps: [],
      rngRolls: [],
      stateDeltaSummary: "Turned in Combat Guild Token, unlocked combat-guild-1 contract",
    },
  }
}

/**
 * Grant benefits when enrolling in a gathering guild (Mining or Woodcutting).
 * Discovers the closest unknown gathering node of the appropriate type.
 *
 * Returns the discovered area name for use in the welcome message.
 */
async function grantGatheringGuildBenefits(
  state: WorldState,
  skill: GatheringSkillID
): Promise<{
  discoveredAreaId: string
  discoveredAreaName: string
  discoveredConnectionId: string
  discoveredLocationId: string
}> {
  const exploration = state.exploration
  const nodeType = skill === "Mining" ? NodeType.ORE_VEIN : NodeType.TREE_STAND

  // Find all nodes of this type
  const candidateNodes = state.world.nodes.filter((node) => node.nodeType === nodeType)

  // Get known locations set
  const knownLocationIds = new Set(exploration.playerState.knownLocationIds)

  // Filter to unknown nodes and calculate distances from TOWN
  const unknownNodesWithDistance: Array<{
    node: Node
    locationId: string
    distance: number
    areaId: string
    pathResult: { areaIds: string[]; connectionIds: string[] }
  }> = []

  for (const node of candidateNodes) {
    const locationId = nodeIdToLocationId(node.nodeId)
    if (!locationId) continue

    // Skip if already known
    if (knownLocationIds.has(locationId)) continue

    // Calculate path from TOWN to this node's area
    const pathResult = findPathUsingAllConnections(state, "TOWN", node.areaId)
    if (!pathResult) continue

    // Ensure the area is fully generated
    const area = exploration.areas.get(node.areaId)
    if (area) {
      await ensureAreaFullyGenerated(state, area)
    }

    unknownNodesWithDistance.push({
      node,
      locationId,
      distance: pathResult.areaIds.length - 1, // Number of hops from TOWN
      areaId: node.areaId,
      pathResult,
    })
  }

  // Sort by distance (closest first)
  unknownNodesWithDistance.sort((a, b) => a.distance - b.distance)

  if (unknownNodesWithDistance.length === 0) {
    // Edge case: no unknown nodes found (shouldn't happen normally)
    return {
      discoveredAreaId: "",
      discoveredAreaName: "",
      discoveredConnectionId: "",
      discoveredLocationId: "",
    }
  }

  // Pick the closest unknown node
  const selected = unknownNodesWithDistance[0]

  // Discover all areas and connections along the path
  for (const areaId of selected.pathResult.areaIds) {
    if (!exploration.playerState.knownAreaIds.includes(areaId)) {
      exploration.playerState.knownAreaIds.push(areaId)
    }
  }

  for (const connId of selected.pathResult.connectionIds) {
    if (!exploration.playerState.knownConnectionIds.includes(connId)) {
      exploration.playerState.knownConnectionIds.push(connId)
    }
    // Also add reverse connection for bidirectional travel
    const parts = connId.split("->")
    if (parts.length === 2) {
      const reverseConnId = `${parts[1]}->${parts[0]}`
      if (!exploration.playerState.knownConnectionIds.includes(reverseConnId)) {
        exploration.playerState.knownConnectionIds.push(reverseConnId)
      }
    }
  }

  // Discover the node location
  if (!exploration.playerState.knownLocationIds.includes(selected.locationId)) {
    exploration.playerState.knownLocationIds.push(selected.locationId)
  }

  // Get area display name
  const area = exploration.areas.get(selected.areaId)
  const areaName = getAreaDisplayName(selected.areaId, area)

  return {
    discoveredAreaId: selected.areaId,
    discoveredAreaName: areaName,
    discoveredConnectionId:
      selected.pathResult.connectionIds.length > 0 ? selected.pathResult.connectionIds[0] : "",
    discoveredLocationId: selected.locationId,
  }
}

async function* executeGuildEnrolment(
  state: WorldState,
  action: GuildEnrolmentAction
): ActionGenerator {
  const tickBefore = state.time.currentTick

  // Resolve skill from current location
  const currentLocationId = getCurrentLocationId(state)
  const skill = getSkillForGuildLocation(currentLocationId)

  // Use shared precondition check
  const check = checkGuildEnrolmentAction(state, action)
  if (!check.valid) {
    yield {
      done: true,
      log: createFailureLog(
        state,
        action,
        check.failureType!,
        0,
        check.failureReason,
        check.failureContext
      ),
    }
    return
  }

  // Enrol takes timeCost ticks (20 for gathering guilds, 3 for others)
  const isGatheringGuild = skill === "Mining" || skill === "Woodcutting"
  for (let tick = 0; tick < check.timeCost; tick++) {
    consumeTime(state, 1)
    // Show training progress for gathering guilds
    if (isGatheringGuild) {
      // Show "Training" with accumulating dots (1-5 dots cycling every 4 ticks)
      const dots = ".".repeat(((tick % 20) % 5) + 1)
      yield { done: false, feedback: { message: `Training${dots}` } }
    } else {
      yield { done: false }
    }
  }

  // Set skill to level 1 (unlock it)
  state.player.skills[skill!] = { level: 1, xp: 0 }

  // Combat enrolment grants and equips CRUDE_WEAPON
  if (skill === "Combat") {
    addToInventory(state, "CRUDE_WEAPON", 1)
    state.player.equippedWeapon = "CRUDE_WEAPON"
  }

  // Mining enrolment generates initial mining contracts
  if (skill === "Mining") {
    refreshMiningContracts(state)
  }

  // Gathering guild enrolment discovers a nearby node
  let gatheringBenefits:
    | {
        discoveredAreaId: string
        discoveredAreaName: string
        discoveredConnectionId: string
        discoveredLocationId: string
      }
    | undefined
  if (skill === "Mining" || skill === "Woodcutting") {
    gatheringBenefits = await grantGatheringGuildBenefits(state, skill)
  }

  // Exploration enrolment grants one distance 1 area and connection
  let explorationBenefits: { discoveredAreaId: string; discoveredConnectionId: string } | undefined
  if (skill === "Exploration") {
    explorationBenefits = await grantExplorationGuildBenefits(state)
  }

  // Build summary message
  let summary = `Enrolled in ${skill} guild`
  const discoveredAreaId =
    gatheringBenefits?.discoveredAreaId || explorationBenefits?.discoveredAreaId
  if (discoveredAreaId) {
    const discoveredArea = state.exploration?.areas.get(discoveredAreaId)
    const areaName = getAreaDisplayName(discoveredAreaId, discoveredArea)
    summary = `Enrolled in ${skill} guild, discovered ${areaName}`
  }

  // Feedback after enrolment completes
  // For gathering guilds, show skill-specific orientation text
  let completionMessage = `Enrolled in ${skill} guild!`
  if (skill === "Mining" && gatheringBenefits?.discoveredAreaName) {
    completionMessage = `Enrolled in Miners Guild, congratulations! (${check.timeCost}t)\n\nYou now know how to mine! There's a promising ore vein at ${gatheringBenefits.discoveredAreaName} - go there to begin your mining career. Discover more locations by accepting contracts, or join the Explorers Guild to survey the wilderness yourself.`
  } else if (skill === "Woodcutting" && gatheringBenefits?.discoveredAreaName) {
    completionMessage = `Enrolled in Foresters Guild, congratulations! (${check.timeCost}t)\n\nYou now know how to chop wood! There's a fine stand of trees at ${gatheringBenefits.discoveredAreaName} - go there to start harvesting lumber. Discover more locations by accepting contracts, or join the Explorers Guild to survey the wilderness yourself.`
  }
  yield { done: false, feedback: { message: completionMessage } }

  // Build exploration log for either gathering or exploration benefits
  const explorationLog =
    gatheringBenefits?.discoveredAreaId || explorationBenefits?.discoveredAreaId
      ? {
          discoveredAreaId:
            gatheringBenefits?.discoveredAreaId || explorationBenefits?.discoveredAreaId || "",
          discoveredConnectionId:
            gatheringBenefits?.discoveredConnectionId ||
            explorationBenefits?.discoveredConnectionId ||
            "",
          discoveredLocationId: gatheringBenefits?.discoveredLocationId,
        }
      : undefined

  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "Enrol",
      parameters: { skill },
      success: true,
      timeConsumed: check.timeCost,
      levelUps: [],
      rngRolls: [],
      stateDeltaSummary: summary,
      explorationLog,
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
    yield {
      done: true,
      log: createFailureLog(
        state,
        action,
        check.failureType!,
        0,
        check.failureReason,
        check.failureContext
      ),
    }
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

  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "TravelToLocation",
      parameters: { locationId },
      success: true,
      timeConsumed: check.timeCost,
      levelUps: [],
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
    yield {
      done: true,
      log: createFailureLog(
        state,
        action,
        check.failureType!,
        0,
        check.failureReason,
        check.failureContext
      ),
    }
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

  const hubName = isInTown(state) ? "Town Square" : "clearing"

  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "Leave",
      parameters: {},
      success: true,
      timeConsumed: check.timeCost,
      levelUps: [],
      rngRolls: [],
      stateDeltaSummary: `Left ${getLocationDisplayName(previousLocation, state.exploration.playerState.currentAreaId, state)} for ${hubName}`,
    },
  }
}

/**
 * Execute SeeGatheringMap action
 *
 * Displays a list of all known gathering nodes of the appropriate type
 * based on which guild the player is at.
 */
async function* executeSeeGatheringMap(
  state: WorldState,
  action: SeeGatheringMapAction
): ActionGenerator {
  const tickBefore = state.time.currentTick

  // Use shared precondition check
  const check = checkSeeGatheringMapAction(state, action)
  if (!check.valid) {
    yield {
      done: true,
      log: createFailureLog(
        state,
        action,
        check.failureType!,
        0,
        check.failureReason,
        check.failureContext
      ),
    }
    return
  }

  const skill = check.skill!
  const skillLevel = state.player.skills[skill]?.level ?? 0
  const hasAppraise = skillLevel >= 3 // APPRAISE unlocked at L3
  const nodeType = skill === "Mining" ? NodeType.ORE_VEIN : NodeType.TREE_STAND
  const headerText = skill === "Mining" ? "Known Ore Veins:" : "Known Tree Stands:"
  const emptyText =
    skill === "Mining"
      ? "Known Ore Veins: none\n\nFind ore veins by accepting contracts or joining the Explorers Guild."
      : "Known Tree Stands: none\n\nFind tree stands by accepting contracts or joining the Explorers Guild."

  // Get all known nodes of the appropriate type
  const knownLocationIds = new Set(state.exploration.playerState.knownLocationIds)
  const knownNodes: Array<{
    areaId: string
    areaName: string
    distance: number
    travelTicks: number
    locationId: string
    contents: string
  }> = []

  for (const node of state.world.nodes) {
    if (node.nodeType !== nodeType) continue

    // Convert node ID to location ID
    const locationId = nodeIdToLocationId(node.nodeId)
    if (!locationId) continue

    // Skip if location not known
    if (!knownLocationIds.has(locationId)) continue

    // Get area info
    const area = state.exploration.areas.get(node.areaId)
    if (!area) continue

    // Calculate travel time from TOWN using actual connection multipliers
    const pathResult = findPathUsingAllConnections(state, "TOWN", node.areaId)
    const travelTicks = pathResult ? pathResult.totalTravelTime : 999

    // Build contents string (show quantities if APPRAISE unlocked)
    let contents: string
    if (node.depleted) {
      contents = "depleted, regenerating"
    } else {
      const availableMaterials = node.materials.filter((m) => m.remainingUnits > 0)
      if (availableMaterials.length === 0) {
        contents = "empty"
      } else if (hasAppraise) {
        // Show quantities when APPRAISE is unlocked
        contents = availableMaterials
          .map((m) => `${m.materialId.toLowerCase().replace(/_/g, " ")} (${m.remainingUnits})`)
          .join(", ")
      } else {
        contents = availableMaterials
          .map((m) => m.materialId.toLowerCase().replace(/_/g, " "))
          .join(", ")
      }
    }

    knownNodes.push({
      areaId: node.areaId,
      areaName: getAreaDisplayName(node.areaId, area),
      distance: area.distance,
      travelTicks,
      locationId,
      contents,
    })
  }

  // Sort by travel ticks, then alphabetically by area name
  knownNodes.sort((a, b) => {
    if (a.travelTicks !== b.travelTicks) return a.travelTicks - b.travelTicks
    return a.areaName.localeCompare(b.areaName)
  })

  // Build display message
  let message: string
  if (knownNodes.length === 0) {
    message = emptyText
  } else {
    const lines = [headerText]
    for (const node of knownNodes) {
      lines.push(
        `  ${node.areaName} (distance ${node.distance}, ${node.travelTicks}t) - ${node.contents}`
      )
    }
    lines.push("")
    lines.push("Use 'fartravel <area>' to travel to any of these locations.")
    message = lines.join("\n")
  }

  // Show the message
  yield { done: false, feedback: { message } }

  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "SeeGatheringMap" as const,
      parameters: { skill },
      success: true,
      timeConsumed: 0,
      levelUps: [],
      rngRolls: [],
      stateDeltaSummary: `Viewed ${skill === "Mining" ? "ore veins" : "tree stands"} map`,
    },
  }
}

/**
 * Execute BuyMap action (Phase 3: Map Shops)
 *
 * Handles purchasing maps from guild shops:
 * - Node maps (Mining Guild): Reveal a path to an undiscovered node
 * - Area maps (Exploration Guild): Reveal an area and its connections
 */
async function* executeBuyMap(state: WorldState, action: BuyMapAction): ActionGenerator {
  const tickBefore = state.time.currentTick

  // Use shared precondition check
  const check = checkBuyMapAction(state, action)
  if (!check.valid) {
    yield {
      done: true,
      log: createFailureLog(
        state,
        action,
        check.failureType!,
        0,
        check.failureReason,
        check.failureContext
      ),
    }
    return
  }

  if (action.mapType === "node") {
    // Buy a node map from Mining Guild
    const price = getNodeMapPrice(action.materialTier!)!
    state.player.gold -= price

    // Find a node and generate the map
    const map = findNodeForMap(action.materialTier!, state)
    if (!map) {
      // This shouldn't happen if check passed, but be defensive
      yield {
        done: true,
        log: createFailureLog(state, action, "NO_MAPS_AVAILABLE", 0, "no_undiscovered_nodes", {
          materialTier: action.materialTier,
        }),
      }
      return
    }

    // Reveal all areas in the path (add to knownAreaIds) and generate their names
    for (const areaId of map.areaIds) {
      if (!state.exploration.playerState.knownAreaIds.includes(areaId)) {
        state.exploration.playerState.knownAreaIds.push(areaId)
      }
      // Ensure area is fully generated (content + connections + name)
      const area = state.exploration.areas.get(areaId)
      if (area) {
        await ensureAreaFullyGenerated(state, area)
      }
    }

    // Reveal all connections in the path (add to knownConnectionIds)
    for (const connectionId of map.connectionIds) {
      if (!state.exploration.playerState.knownConnectionIds.includes(connectionId)) {
        state.exploration.playerState.knownConnectionIds.push(connectionId)
      }
    }

    // Store pending node discovery for later (when player arrives at area)
    if (!state.player.pendingNodeDiscoveries) {
      state.player.pendingNodeDiscoveries = []
    }
    state.player.pendingNodeDiscoveries.push({
      areaId: map.targetAreaId,
      nodeLocationId: map.targetNodeId,
    })

    // Get the target area name for the summary
    const targetArea = state.exploration.areas.get(map.targetAreaId)
    const targetAreaName = getAreaDisplayName(map.targetAreaId, targetArea)

    yield {
      done: true,
      log: {
        tickBefore,
        actionType: "BuyMap",
        parameters: { mapType: action.mapType, materialTier: action.materialTier },
        success: true,
        timeConsumed: 0,
        levelUps: [],
        rngRolls: [],
        stateDeltaSummary: `Purchased ${action.materialTier} node map for ${price} gold, revealing path to ${targetAreaName}`,
      },
    }
  } else if (action.mapType === "area") {
    // Buy an area map from Exploration Guild
    const price = getAreaMapPrice(action.targetDistance!)
    state.player.gold -= price

    const targetDistance = action.targetDistance!
    const exploration = state.exploration

    // Find an undiscovered area at target distance
    let targetAreaId: string | null = null
    for (const [areaId, area] of exploration.areas) {
      if (
        area.distance === targetDistance &&
        !exploration.playerState.knownAreaIds.includes(areaId)
      ) {
        targetAreaId = areaId
        break
      }
    }

    // If no undiscovered area exists, use the corridor endpoint
    // (ensureCorridorToDistance will create it if needed)
    const corridorEndpoint = `area-d${targetDistance}-i0`
    if (!targetAreaId) {
      targetAreaId = corridorEndpoint
    }

    // Ensure corridor exists from TOWN to target distance
    ensureCorridorToDistance(state, targetDistance)

    // If target area differs from corridor endpoint, connect them
    if (targetAreaId !== corridorEndpoint) {
      const connectionExists = exploration.connections.some(
        (c) =>
          (c.fromAreaId === corridorEndpoint && c.toAreaId === targetAreaId) ||
          (c.fromAreaId === targetAreaId && c.toAreaId === corridorEndpoint)
      )
      if (!connectionExists) {
        exploration.connections.push({
          fromAreaId: corridorEndpoint,
          toAreaId: targetAreaId,
          travelTimeMultiplier: 1.0,
        })
      }
    }

    // Use BFS to find the full path including the connection to target
    const pathResult = findPathUsingAllConnections(state, "TOWN", targetAreaId)

    if (!pathResult) {
      // This shouldn't happen since we just ensured the corridor and connection
      yield {
        done: true,
        log: createFailureLog(state, action, "NO_MAPS_AVAILABLE", 0, "path_not_found", {
          targetDistance,
          targetAreaId,
        }),
      }
      return
    }

    // Reveal all areas in the path and generate their names
    for (const areaId of pathResult.areaIds) {
      if (!exploration.playerState.knownAreaIds.includes(areaId)) {
        exploration.playerState.knownAreaIds.push(areaId)
      }
      // Ensure area is fully generated (content + connections + name)
      const area = exploration.areas.get(areaId)
      if (area) {
        await ensureAreaFullyGenerated(state, area)
      }
    }

    // Reveal all connections in the path
    for (const connectionId of pathResult.connectionIds) {
      if (!exploration.playerState.knownConnectionIds.includes(connectionId)) {
        exploration.playerState.knownConnectionIds.push(connectionId)
      }
    }

    // Get the target area name for the summary
    const targetAreaForSummary = exploration.areas.get(targetAreaId)
    const targetAreaName = getAreaDisplayName(targetAreaId, targetAreaForSummary)

    yield {
      done: true,
      log: {
        tickBefore,
        actionType: "BuyMap",
        parameters: { mapType: action.mapType, targetDistance: action.targetDistance },
        success: true,
        timeConsumed: 0,
        levelUps: [],
        rngRolls: [],
        stateDeltaSummary: `Purchased area map for ${price} gold, revealing path to ${targetAreaName}`,
      },
    }
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
  executeBuyMap,
}
