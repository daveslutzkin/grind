import type {
  WorldState,
  Action,
  ActionEvaluation,
  PlanEvaluation,
  PlanViolation,
} from "./types.js"
import { checkAction } from "./actionChecks.js"
import {
  consumeTime,
  addToInventory,
  removeFromInventory,
  addToStorage,
  checkAndCompleteContracts,
} from "./stateHelpers.js"

function deepClone<T>(obj: T): T {
  // Handle Map specially
  if (obj instanceof Map) {
    return new Map(obj) as unknown as T
  }
  // Convert Map to object before stringify, then restore after
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const objWithMap = obj as any
  let areasArray: [string, unknown][] = []
  if (objWithMap?.exploration?.areas instanceof Map) {
    areasArray = Array.from(objWithMap.exploration.areas.entries())
    objWithMap.exploration.areas = Object.fromEntries(areasArray)
  }
  const cloned = JSON.parse(JSON.stringify(obj))
  // Restore the original object's Map
  if (areasArray.length > 0) {
    objWithMap.exploration.areas = new Map(areasArray)
  }
  // Restore Map in cloned object
  if (cloned.exploration?.areas && !(cloned.exploration.areas instanceof Map)) {
    const areasMap = new Map()
    for (const [key, value] of Object.entries(cloned.exploration.areas)) {
      areasMap.set(key, value)
    }
    cloned.exploration.areas = areasMap
  }
  return cloned
}

/**
 * Evaluate a single action using shared precondition checks
 */
export function evaluateAction(state: WorldState, action: Action): ActionEvaluation {
  const check = checkAction(state, action)

  if (!check.valid) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 }
  }

  // Calculate expected XP based on action type and success probability
  let expectedXP = 0
  switch (action.type) {
    case "Move":
    case "ExplorationTravel":
    case "AcceptContract":
    case "Drop":
    case "Store":
    case "Enrol":
    case "Survey":
    case "Explore":
    case "TravelToLocation":
    case "Leave":
      // These actions grant no XP (or XP is handled separately)
      expectedXP = 0
      break
    case "Gather":
    case "Fight":
      // RNG-based actions: expected XP = 1 * successProbability
      expectedXP = 1 * check.successProbability
      break
    case "Craft":
      // Deterministic actions: always grant 1 XP
      expectedXP = 1
      break
  }

  return {
    expectedTime: check.timeCost,
    expectedXP,
    successProbability: check.successProbability,
  }
}

/**
 * Simulate applying an action to state (for plan evaluation)
 * Uses shared precondition checks to ensure consistency with execution.
 * Uses shared helpers from stateHelpers.ts to ensure consistency with the engine.
 */
function simulateAction(state: WorldState, action: Action): string | null {
  const check = checkAction(state, action)

  if (!check.valid) {
    return check.failureType!
  }

  // Check if session has ended or would end before action completes
  if (state.time.sessionRemainingTicks <= 0 || state.time.sessionRemainingTicks < check.timeCost) {
    return "SESSION_ENDED"
  }

  // Apply the action effects (optimistically assuming success for RNG-based actions)
  consumeTime(state, check.timeCost)

  switch (action.type) {
    case "Move":
      // Move is now an alias for ExplorationTravel
      state.exploration.playerState.currentAreaId = action.destination
      break
    case "ExplorationTravel":
      state.exploration.playerState.currentAreaId = action.destinationAreaId
      break
    case "AcceptContract":
      state.player.activeContracts.push(action.contractId)
      // No skill gain for AcceptContract
      break
    case "Gather": {
      // Find the node and simulate extraction
      const node = state.world.nodes?.find((n) => n.nodeId === action.nodeId)
      if (node && node.materials.length > 0) {
        // Just track that we did a gather - the actual extraction is complex
        const skill = node.materials[0].requiresSkill === "Mining" ? "Mining" : "Woodcutting"
        state.player.skills[skill].xp += 1
      }
      break
    }
    case "Fight": {
      const enemy = state.world.enemies.find((e) => e.id === action.enemyId)
      if (enemy) {
        // For evaluation, assume the most likely loot (highest weight)
        const bestLoot = enemy.lootTable.reduce((best, entry) =>
          entry.weight > best.weight ? entry : best
        )
        addToInventory(state, bestLoot.itemId, bestLoot.quantity)
        state.player.skills.Combat.xp += 1
      }
      break
    }
    case "Craft": {
      const recipe = state.world.recipes.find((r) => r.id === action.recipeId)
      if (recipe) {
        // Remove inputs
        for (const input of recipe.inputs) {
          removeFromInventory(state, input.itemId, input.quantity)
        }
        // Add output
        addToInventory(state, recipe.output.itemId, recipe.output.quantity)
        // Grant XP to the correct skill (matches engine fix)
        state.player.skills[recipe.guildType].xp += 1
      }
      break
    }
    case "Store": {
      removeFromInventory(state, action.itemId, action.quantity)
      addToStorage(state, action.itemId, action.quantity)
      // Store is a free action - no XP
      break
    }
    case "Enrol": {
      // Guild enrolment takes skill from 0 to 1
      state.player.skills[action.skill] = { level: 1, xp: 0 }
      break
    }
    case "Drop": {
      removeFromInventory(state, action.itemId, action.quantity)
      // No skill gain for Drop
      break
    }
    case "Survey":
    case "Explore":
      // These exploration actions are handled by the exploration system
      // For simulation, we just consume time (which was already done above)
      break
    case "TravelToLocation":
      // Move within an area to a specific location
      state.exploration.playerState.currentLocationId = action.locationId
      break
    case "Leave":
      // Return to the area hub
      state.exploration.playerState.currentLocationId = null
      break
  }

  // Check for contract completion (after every successful action)
  // Uses shared helper which includes kill requirements check
  checkAndCompleteContracts(state)

  return null
}

export function evaluatePlan(state: WorldState, actions: Action[]): PlanEvaluation {
  // Clone state to avoid mutation
  const simState = deepClone(state)

  let expectedTime = 0
  let expectedXP = 0
  const violations: PlanViolation[] = []

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    const eval_ = evaluateAction(simState, action)

    if (eval_.successProbability === 0) {
      const reason = simulateAction(simState, action)
      violations.push({
        actionIndex: i,
        reason: reason || "Invalid action",
      })
      continue
    }

    // Check if session has ended or would end before action completes
    if (
      simState.time.sessionRemainingTicks <= 0 ||
      simState.time.sessionRemainingTicks < eval_.expectedTime
    ) {
      violations.push({
        actionIndex: i,
        reason: "SESSION_ENDED: Not enough time remaining",
      })
      continue
    }

    expectedTime += eval_.expectedTime
    expectedXP += eval_.expectedXP

    // Simulate the action
    simulateAction(simState, action)
  }

  return {
    expectedTime,
    expectedXP,
    violations,
  }
}
