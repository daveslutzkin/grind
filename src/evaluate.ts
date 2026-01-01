import type {
  WorldState,
  Action,
  ActionEvaluation,
  PlanEvaluation,
  PlanViolation,
} from "./types.js"
import { checkAction } from "./actionChecks.js"

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

/**
 * Simulate contract completion (matches engine checkContractCompletion)
 */
function simulateContractCompletion(state: WorldState): void {
  for (const contractId of [...state.player.activeContracts]) {
    const contract = state.world.contracts.find((c) => c.id === contractId)
    if (!contract) continue

    // Check if all requirements are met (in inventory or storage)
    const allRequirementsMet = contract.requirements.every((req) => {
      const inInventory = state.player.inventory.find((i) => i.itemId === req.itemId)
      const inStorage = state.player.storage.find((i) => i.itemId === req.itemId)
      const totalQuantity = (inInventory?.quantity ?? 0) + (inStorage?.quantity ?? 0)
      return totalQuantity >= req.quantity
    })

    if (allRequirementsMet) {
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

      // Grant contract rewards (items go to inventory)
      for (const reward of contract.rewards) {
        const existing = state.player.inventory.find((i) => i.itemId === reward.itemId)
        if (existing) {
          existing.quantity += reward.quantity
        } else {
          state.player.inventory.push({ itemId: reward.itemId, quantity: reward.quantity })
        }
      }

      // Award reputation
      state.player.guildReputation += contract.reputationReward

      // Remove from active contracts
      const index = state.player.activeContracts.indexOf(contractId)
      state.player.activeContracts.splice(index, 1)
    }
  }
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
    case "AcceptContract":
    case "Drop":
      // These actions grant no XP
      expectedXP = 0
      break
    case "Gather":
    case "Fight":
      // RNG-based actions: expected XP = 1 * successProbability
      expectedXP = 1 * check.successProbability
      break
    case "Craft":
    case "Store":
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
 * Uses shared precondition checks to ensure consistency with execution
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
  state.time.currentTick += check.timeCost
  state.time.sessionRemainingTicks -= check.timeCost

  switch (action.type) {
    case "Move":
      state.player.location = action.destination
      // No skill gain for Move
      break
    case "AcceptContract":
      state.player.activeContracts.push(action.contractId)
      // No skill gain for AcceptContract
      break
    case "Gather": {
      const node = state.world.resourceNodes.find((n) => n.id === action.nodeId)
      if (node) {
        const existing = state.player.inventory.find((i) => i.itemId === node.itemId)
        if (existing) {
          existing.quantity += 1
        } else {
          state.player.inventory.push({ itemId: node.itemId, quantity: 1 })
        }
        state.player.skills[node.skillType] += 1
      }
      break
    }
    case "Fight": {
      const enemy = state.world.enemies.find((e) => e.id === action.enemyId)
      if (enemy) {
        for (const loot of enemy.loot) {
          const existing = state.player.inventory.find((i) => i.itemId === loot.itemId)
          if (existing) {
            existing.quantity += loot.quantity
          } else {
            state.player.inventory.push({ itemId: loot.itemId, quantity: loot.quantity })
          }
        }
        state.player.skills.Combat += 1
      }
      break
    }
    case "Craft": {
      const recipe = state.world.recipes.find((r) => r.id === action.recipeId)
      if (recipe) {
        // Remove inputs
        for (const input of recipe.inputs) {
          const item = state.player.inventory.find((i) => i.itemId === input.itemId)
          if (item) {
            item.quantity -= input.quantity
            if (item.quantity <= 0) {
              const index = state.player.inventory.indexOf(item)
              state.player.inventory.splice(index, 1)
            }
          }
        }
        // Add output
        const existing = state.player.inventory.find((i) => i.itemId === recipe.output.itemId)
        if (existing) {
          existing.quantity += recipe.output.quantity
        } else {
          state.player.inventory.push({
            itemId: recipe.output.itemId,
            quantity: recipe.output.quantity,
          })
        }
        state.player.skills.Smithing += 1
      }
      break
    }
    case "Store": {
      const invItem = state.player.inventory.find((i) => i.itemId === action.itemId)
      if (invItem) {
        invItem.quantity -= action.quantity
        if (invItem.quantity <= 0) {
          const index = state.player.inventory.indexOf(invItem)
          state.player.inventory.splice(index, 1)
        }
        const storageItem = state.player.storage.find((i) => i.itemId === action.itemId)
        if (storageItem) {
          storageItem.quantity += action.quantity
        } else {
          state.player.storage.push({ itemId: action.itemId, quantity: action.quantity })
        }
        state.player.skills.Logistics += 1
      }
      break
    }
    case "Drop": {
      const item = state.player.inventory.find((i) => i.itemId === action.itemId)
      if (item) {
        item.quantity -= action.quantity
        if (item.quantity <= 0) {
          const index = state.player.inventory.indexOf(item)
          state.player.inventory.splice(index, 1)
        }
      }
      // No skill gain for Drop
      break
    }
  }

  // Check for contract completion (after every successful action)
  simulateContractCompletion(state)

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
