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
  FailureType,
  ItemID,
  ItemStack,
  ContractCompletion,
} from "./types.js"
import { roll } from "./rng.js"

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

function executeMove(state: WorldState, action: MoveAction, rolls: RngRoll[]): ActionLog {
  const tickBefore = state.time.currentTick
  const fromLocation = state.player.location
  const destination = action.destination

  // Check if already at destination
  if (fromLocation === destination) {
    return createFailureLog(state, action, "WRONG_LOCATION")
  }

  // Get travel cost (only check reachability, no skill gating)
  const travelKey = `${fromLocation}->${destination}`
  const travelCost = state.world.travelCosts[travelKey]

  if (travelCost === undefined) {
    return createFailureLog(state, action, "WRONG_LOCATION")
  }

  // Check if enough time remaining
  if (state.time.sessionRemainingTicks < travelCost) {
    return createFailureLog(state, action, "SESSION_ENDED")
  }

  // Move player
  state.player.location = destination
  consumeTime(state, travelCost)

  // No XP for Move - Travel is purely logistical

  return {
    tickBefore,
    actionType: "Move",
    parameters: { destination },
    success: true,
    timeConsumed: travelCost,
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
  }
}

function executeAcceptContract(
  state: WorldState,
  action: AcceptContractAction,
  rolls: RngRoll[]
): ActionLog {
  const tickBefore = state.time.currentTick
  const contractId = action.contractId

  // Find contract
  const contract = state.world.contracts.find((c) => c.id === contractId)
  if (!contract) {
    return createFailureLog(state, action, "CONTRACT_NOT_FOUND")
  }

  // Check if at guild location
  if (state.player.location !== contract.guildLocation) {
    return createFailureLog(state, action, "WRONG_LOCATION")
  }

  // Check if already has contract
  if (state.player.activeContracts.includes(contractId)) {
    return createFailureLog(state, action, "ALREADY_HAS_CONTRACT")
  }

  // Accept contract
  state.player.activeContracts.push(contractId)

  return {
    tickBefore,
    actionType: "AcceptContract",
    parameters: { contractId },
    success: true,
    timeConsumed: 0,
    rngRolls: rolls,
    stateDeltaSummary: `Accepted contract ${contractId}`,
  }
}

function addToInventory(state: WorldState, itemId: ItemID, quantity: number): void {
  const existing = state.player.inventory.find((i) => i.itemId === itemId)
  if (existing) {
    existing.quantity += quantity
  } else {
    state.player.inventory.push({ itemId, quantity })
  }
}

function getInventorySlotCount(state: WorldState): number {
  return state.player.inventory.length
}

function checkContractCompletion(state: WorldState): ContractCompletion[] {
  const completions: ContractCompletion[] = []

  // Check each active contract
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
      // Award reputation
      state.player.guildReputation += contract.reputationReward

      // Remove from active contracts
      const index = state.player.activeContracts.indexOf(contractId)
      state.player.activeContracts.splice(index, 1)

      completions.push({
        contractId,
        reputationGained: contract.reputationReward,
      })
    }
  }

  return completions
}

function executeGather(state: WorldState, action: GatherAction, rolls: RngRoll[]): ActionLog {
  const tickBefore = state.time.currentTick
  const nodeId = action.nodeId

  // Find node
  const node = state.world.resourceNodes.find((n) => n.id === nodeId)
  if (!node) {
    return createFailureLog(state, action, "NODE_NOT_FOUND")
  }

  // Check if at node location
  if (state.player.location !== node.location) {
    return createFailureLog(state, action, "WRONG_LOCATION")
  }

  // Check skill requirement (uses node-specific skill type)
  if (state.player.skills[node.skillType] < node.requiredSkillLevel) {
    return createFailureLog(state, action, "INSUFFICIENT_SKILL")
  }

  // Check inventory capacity (slot-based)
  if (getInventorySlotCount(state) >= state.player.inventoryCapacity) {
    // Only check if this item would need a new slot
    const existingItem = state.player.inventory.find((i) => i.itemId === node.itemId)
    if (!existingItem) {
      return createFailureLog(state, action, "INVENTORY_FULL")
    }
  }

  // Check if enough time remaining
  if (state.time.sessionRemainingTicks < node.gatherTime) {
    return createFailureLog(state, action, "SESSION_ENDED")
  }

  // Consume time
  consumeTime(state, node.gatherTime)

  // Roll for success
  const success = roll(state.rng, node.successProbability, `gather:${nodeId}`, rolls)

  if (!success) {
    return {
      tickBefore,
      actionType: "Gather",
      parameters: { nodeId },
      success: false,
      failureType: "GATHER_FAILURE",
      timeConsumed: node.gatherTime,
      rngRolls: rolls,
      stateDeltaSummary: `Failed to gather from ${nodeId}`,
    }
  }

  // Add item to inventory
  addToInventory(state, node.itemId, 1)

  // Grant XP (uses node-specific skill type)
  state.player.skills[node.skillType] += 1

  // Check for contract completion
  const contractsCompleted = checkContractCompletion(state)

  return {
    tickBefore,
    actionType: "Gather",
    parameters: { nodeId },
    success: true,
    timeConsumed: node.gatherTime,
    skillGained: { skill: node.skillType, amount: 1 },
    contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    rngRolls: rolls,
    stateDeltaSummary: `Gathered 1 ${node.itemId} from ${nodeId}`,
  }
}

function executeFight(state: WorldState, action: FightAction, rolls: RngRoll[]): ActionLog {
  const tickBefore = state.time.currentTick
  const enemyId = action.enemyId

  // Find enemy
  const enemy = state.world.enemies.find((e) => e.id === enemyId)
  if (!enemy) {
    return createFailureLog(state, action, "ENEMY_NOT_FOUND")
  }

  // Check if at enemy location
  if (state.player.location !== enemy.location) {
    return createFailureLog(state, action, "WRONG_LOCATION")
  }

  // Check skill requirement
  if (state.player.skills.Combat < enemy.requiredSkillLevel) {
    return createFailureLog(state, action, "INSUFFICIENT_SKILL")
  }

  // Check if enough time remaining
  if (state.time.sessionRemainingTicks < enemy.fightTime) {
    return createFailureLog(state, action, "SESSION_ENDED")
  }

  // Consume time
  consumeTime(state, enemy.fightTime)

  // Roll for success
  const success = roll(state.rng, enemy.successProbability, `fight:${enemyId}`, rolls)

  if (!success) {
    // Relocate player on failure
    state.player.location = enemy.failureRelocation

    return {
      tickBefore,
      actionType: "Fight",
      parameters: { enemyId },
      success: false,
      failureType: "COMBAT_FAILURE",
      timeConsumed: enemy.fightTime,
      rngRolls: rolls,
      stateDeltaSummary: `Lost fight to ${enemyId}, relocated to ${enemy.failureRelocation}`,
    }
  }

  // Add loot to inventory
  for (const loot of enemy.loot) {
    addToInventory(state, loot.itemId, loot.quantity)
  }

  // Grant XP
  state.player.skills.Combat += 1

  // Check for contract completion
  const contractsCompleted = checkContractCompletion(state)

  return {
    tickBefore,
    actionType: "Fight",
    parameters: { enemyId },
    success: true,
    timeConsumed: enemy.fightTime,
    skillGained: { skill: "Combat", amount: 1 },
    contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    rngRolls: rolls,
    stateDeltaSummary: `Defeated ${enemyId}, gained loot`,
  }
}

function hasItems(inventory: ItemStack[], required: ItemStack[]): boolean {
  for (const req of required) {
    const item = inventory.find((i) => i.itemId === req.itemId)
    if (!item || item.quantity < req.quantity) {
      return false
    }
  }
  return true
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

function executeCraft(state: WorldState, action: CraftAction, rolls: RngRoll[]): ActionLog {
  const tickBefore = state.time.currentTick
  const recipeId = action.recipeId

  // Find recipe
  const recipe = state.world.recipes.find((r) => r.id === recipeId)
  if (!recipe) {
    return createFailureLog(state, action, "RECIPE_NOT_FOUND")
  }

  // Check if at required location
  if (state.player.location !== recipe.requiredLocation) {
    return createFailureLog(state, action, "WRONG_LOCATION")
  }

  // Check skill requirement
  if (state.player.skills.Crafting < recipe.requiredSkillLevel) {
    return createFailureLog(state, action, "INSUFFICIENT_SKILL")
  }

  // Check if has required inputs
  if (!hasItems(state.player.inventory, recipe.inputs)) {
    return createFailureLog(state, action, "MISSING_ITEMS")
  }

  // Check if enough time remaining
  if (state.time.sessionRemainingTicks < recipe.craftTime) {
    return createFailureLog(state, action, "SESSION_ENDED")
  }

  // Consume inputs
  for (const input of recipe.inputs) {
    removeFromInventory(state, input.itemId, input.quantity)
  }

  // Consume time
  consumeTime(state, recipe.craftTime)

  // Produce output
  addToInventory(state, recipe.output.itemId, recipe.output.quantity)

  // Grant XP
  state.player.skills.Smithing += 1

  // Check for contract completion
  const contractsCompleted = checkContractCompletion(state)

  return {
    tickBefore,
    actionType: "Craft",
    parameters: { recipeId },
    success: true,
    timeConsumed: recipe.craftTime,
    skillGained: { skill: "Smithing", amount: 1 },
    contractsCompleted: contractsCompleted.length > 0 ? contractsCompleted : undefined,
    rngRolls: rolls,
    stateDeltaSummary: `Crafted ${recipe.output.quantity} ${recipe.output.itemId}`,
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

function executeStore(state: WorldState, action: StoreAction, rolls: RngRoll[]): ActionLog {
  const tickBefore = state.time.currentTick
  const { itemId, quantity } = action
  const storeTime = 1

  // Check if at storage location
  if (state.player.location !== state.world.storageLocation) {
    return createFailureLog(state, action, "WRONG_LOCATION")
  }

  // Check skill requirement
  if (state.player.skills.Logistics < state.world.storageRequiredSkillLevel) {
    return createFailureLog(state, action, "INSUFFICIENT_SKILL")
  }

  // Check if item exists in inventory
  const item = state.player.inventory.find((i) => i.itemId === itemId)
  if (!item) {
    return createFailureLog(state, action, "ITEM_NOT_FOUND")
  }

  // Check if has enough quantity
  if (item.quantity < quantity) {
    return createFailureLog(state, action, "MISSING_ITEMS")
  }

  // Check if enough time remaining
  if (state.time.sessionRemainingTicks < storeTime) {
    return createFailureLog(state, action, "SESSION_ENDED")
  }

  // Consume time
  consumeTime(state, storeTime)

  // Move item to storage
  removeFromInventory(state, itemId, quantity)
  addToStorage(state, itemId, quantity)

  // Grant XP
  state.player.skills.Logistics += 1

  return {
    tickBefore,
    actionType: "Store",
    parameters: { itemId, quantity },
    success: true,
    timeConsumed: storeTime,
    skillGained: { skill: "Logistics", amount: 1 },
    rngRolls: rolls,
    stateDeltaSummary: `Stored ${quantity} ${itemId}`,
  }
}

function executeDrop(state: WorldState, action: DropAction, rolls: RngRoll[]): ActionLog {
  const tickBefore = state.time.currentTick
  const { itemId, quantity } = action
  const dropTime = 1

  // Check if item exists in inventory
  const item = state.player.inventory.find((i) => i.itemId === itemId)
  if (!item) {
    return createFailureLog(state, action, "ITEM_NOT_FOUND")
  }

  // Check if has enough quantity
  if (item.quantity < quantity) {
    return createFailureLog(state, action, "MISSING_ITEMS")
  }

  // Check if enough time remaining
  if (state.time.sessionRemainingTicks < dropTime) {
    return createFailureLog(state, action, "SESSION_ENDED")
  }

  // Consume time
  consumeTime(state, dropTime)

  // Remove item from inventory
  removeFromInventory(state, itemId, quantity)

  return {
    tickBefore,
    actionType: "Drop",
    parameters: { itemId, quantity },
    success: true,
    timeConsumed: dropTime,
    rngRolls: rolls,
    stateDeltaSummary: `Dropped ${quantity} ${itemId}`,
  }
}
