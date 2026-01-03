// Shared action validation logic used by both engine execution and evaluation
// This ensures consistency: "Evaluation must call the same logic paths as execution"

import type {
  WorldState,
  Action,
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
  ItemStack,
} from "./types.js"

/**
 * Result of checking action preconditions
 */
export interface ActionCheckResult {
  valid: boolean
  failureType?: FailureType
  timeCost: number
  successProbability: number
}

/**
 * Check if inventory has all required items
 */
export function hasItems(inventory: ItemStack[], required: ItemStack[]): boolean {
  for (const req of required) {
    const item = inventory.find((i) => i.itemId === req.itemId)
    if (!item || item.quantity < req.quantity) {
      return false
    }
  }
  return true
}

/**
 * Get the number of inventory slots used (slot-based capacity)
 */
export function getInventorySlotCount(state: WorldState): number {
  return state.player.inventory.length
}

/**
 * Check if gathering would exceed inventory capacity
 */
export function canGatherItem(state: WorldState, itemId: string): boolean {
  if (getInventorySlotCount(state) < state.player.inventoryCapacity) {
    return true
  }
  const existingItem = state.player.inventory.find((i) => i.itemId === itemId)
  return existingItem !== undefined
}

/**
 * Check Move action preconditions
 */
export function checkMoveAction(state: WorldState, action: MoveAction): ActionCheckResult {
  const fromLocation = state.player.location
  const destination = action.destination

  if (fromLocation === destination) {
    return { valid: false, failureType: "WRONG_LOCATION", timeCost: 0, successProbability: 0 }
  }

  const travelKey = `${fromLocation}->${destination}`
  const travelCost = state.world.travelCosts[travelKey]

  if (travelCost === undefined) {
    return { valid: false, failureType: "WRONG_LOCATION", timeCost: 0, successProbability: 0 }
  }

  return { valid: true, timeCost: travelCost, successProbability: 1 }
}

/**
 * Check AcceptContract action preconditions
 */
export function checkAcceptContractAction(
  state: WorldState,
  action: AcceptContractAction
): ActionCheckResult {
  const contract = state.world.contracts.find((c) => c.id === action.contractId)

  if (!contract) {
    return { valid: false, failureType: "CONTRACT_NOT_FOUND", timeCost: 0, successProbability: 0 }
  }

  if (state.player.location !== contract.guildLocation) {
    return { valid: false, failureType: "WRONG_LOCATION", timeCost: 0, successProbability: 0 }
  }

  if (state.player.activeContracts.includes(action.contractId)) {
    return { valid: false, failureType: "ALREADY_HAS_CONTRACT", timeCost: 0, successProbability: 0 }
  }

  return { valid: true, timeCost: 0, successProbability: 1 }
}

/**
 * Check Gather action preconditions
 */
export function checkGatherAction(state: WorldState, action: GatherAction): ActionCheckResult {
  const node = state.world.resourceNodes.find((n) => n.id === action.nodeId)

  if (!node) {
    return { valid: false, failureType: "NODE_NOT_FOUND", timeCost: 0, successProbability: 0 }
  }

  if (state.player.location !== node.location) {
    return { valid: false, failureType: "WRONG_LOCATION", timeCost: 0, successProbability: 0 }
  }

  if (state.player.skills[node.skillType].level < node.requiredSkillLevel) {
    return { valid: false, failureType: "INSUFFICIENT_SKILL", timeCost: 0, successProbability: 0 }
  }

  if (!canGatherItem(state, node.itemId)) {
    return { valid: false, failureType: "INVENTORY_FULL", timeCost: 0, successProbability: 0 }
  }

  return { valid: true, timeCost: node.gatherTime, successProbability: node.successProbability }
}

/**
 * Get weapon parameters for combat
 */
export function getWeaponParameters(
  equippedWeapon: string | null
): { timeCost: number; successProbability: number } | null {
  switch (equippedWeapon) {
    case "CRUDE_WEAPON":
      return { timeCost: 3, successProbability: 0.7 }
    case "IMPROVED_WEAPON":
      return { timeCost: 2, successProbability: 0.8 }
    default:
      return null
  }
}

/**
 * Check Fight action preconditions
 */
export function checkFightAction(state: WorldState, action: FightAction): ActionCheckResult {
  const enemy = state.world.enemies.find((e) => e.id === action.enemyId)

  if (!enemy) {
    return { valid: false, failureType: "ENEMY_NOT_FOUND", timeCost: 0, successProbability: 0 }
  }

  if (state.player.location !== enemy.location) {
    return { valid: false, failureType: "WRONG_LOCATION", timeCost: 0, successProbability: 0 }
  }

  if (state.player.skills.Combat.level < enemy.requiredSkillLevel) {
    return { valid: false, failureType: "INSUFFICIENT_SKILL", timeCost: 0, successProbability: 0 }
  }

  // Check for equipped weapon
  const weaponParams = getWeaponParameters(state.player.equippedWeapon)
  if (!weaponParams) {
    return { valid: false, failureType: "MISSING_WEAPON", timeCost: 0, successProbability: 0 }
  }

  // Verify the equipped weapon actually exists in inventory
  const weaponInInventory = state.player.inventory.find(
    (i) => i.itemId === state.player.equippedWeapon && i.quantity >= 1
  )
  if (!weaponInInventory) {
    return { valid: false, failureType: "MISSING_WEAPON", timeCost: 0, successProbability: 0 }
  }

  // Use weapon parameters instead of enemy parameters
  return {
    valid: true,
    timeCost: weaponParams.timeCost,
    successProbability: weaponParams.successProbability,
  }
}

/**
 * Check Craft action preconditions
 */
export function checkCraftAction(state: WorldState, action: CraftAction): ActionCheckResult {
  const recipe = state.world.recipes.find((r) => r.id === action.recipeId)

  if (!recipe) {
    return { valid: false, failureType: "RECIPE_NOT_FOUND", timeCost: 0, successProbability: 0 }
  }

  if (state.player.location !== recipe.requiredLocation) {
    return { valid: false, failureType: "WRONG_LOCATION", timeCost: 0, successProbability: 0 }
  }

  if (state.player.skills.Smithing.level < recipe.requiredSkillLevel) {
    return { valid: false, failureType: "INSUFFICIENT_SKILL", timeCost: 0, successProbability: 0 }
  }

  if (!hasItems(state.player.inventory, recipe.inputs)) {
    return { valid: false, failureType: "MISSING_ITEMS", timeCost: 0, successProbability: 0 }
  }

  return { valid: true, timeCost: recipe.craftTime, successProbability: 1 }
}

/**
 * Check Store action preconditions
 * Store is a free action (0 ticks, no skill required)
 */
export function checkStoreAction(state: WorldState, action: StoreAction): ActionCheckResult {
  if (state.player.location !== state.world.storageLocation) {
    return { valid: false, failureType: "WRONG_LOCATION", timeCost: 0, successProbability: 0 }
  }

  const item = state.player.inventory.find((i) => i.itemId === action.itemId)
  if (!item) {
    return { valid: false, failureType: "ITEM_NOT_FOUND", timeCost: 0, successProbability: 0 }
  }

  if (item.quantity < action.quantity) {
    return { valid: false, failureType: "MISSING_ITEMS", timeCost: 0, successProbability: 0 }
  }

  return { valid: true, timeCost: 0, successProbability: 1 }
}

/**
 * Check Drop action preconditions
 */
export function checkDropAction(state: WorldState, action: DropAction): ActionCheckResult {
  const dropTime = 1

  const item = state.player.inventory.find((i) => i.itemId === action.itemId)
  if (!item) {
    return { valid: false, failureType: "ITEM_NOT_FOUND", timeCost: 0, successProbability: 0 }
  }

  if (item.quantity < action.quantity) {
    return { valid: false, failureType: "MISSING_ITEMS", timeCost: 0, successProbability: 0 }
  }

  return { valid: true, timeCost: dropTime, successProbability: 1 }
}

/**
 * Check GuildEnrolment action preconditions
 * Takes a skill from level 0 to level 1
 */
export function checkGuildEnrolmentAction(
  state: WorldState,
  action: GuildEnrolmentAction
): ActionCheckResult {
  const enrolTime = 3

  if (state.player.location !== "TOWN") {
    return { valid: false, failureType: "WRONG_LOCATION", timeCost: 0, successProbability: 0 }
  }

  // Check if skill is already level 1 or higher
  if (state.player.skills[action.skill].level >= 1) {
    return { valid: false, failureType: "ALREADY_ENROLLED", timeCost: 0, successProbability: 0 }
  }

  return { valid: true, timeCost: enrolTime, successProbability: 1 }
}

/**
 * Check TurnInCombatToken action preconditions
 * Cost: 0 ticks, requires being at TOWN (Combat Guild) and having COMBAT_GUILD_TOKEN
 */
export function checkTurnInCombatTokenAction(
  state: WorldState,
  _action: TurnInCombatTokenAction
): ActionCheckResult {
  // Must be at Combat Guild (TOWN)
  if (state.player.location !== "TOWN") {
    return { valid: false, failureType: "WRONG_LOCATION", timeCost: 0, successProbability: 0 }
  }

  // Must have COMBAT_GUILD_TOKEN
  const token = state.player.inventory.find((i) => i.itemId === "COMBAT_GUILD_TOKEN")
  if (!token || token.quantity < 1) {
    return { valid: false, failureType: "MISSING_ITEMS", timeCost: 0, successProbability: 0 }
  }

  return { valid: true, timeCost: 0, successProbability: 1 }
}

/**
 * Check any action's preconditions
 */
export function checkAction(state: WorldState, action: Action): ActionCheckResult {
  switch (action.type) {
    case "Move":
      return checkMoveAction(state, action)
    case "AcceptContract":
      return checkAcceptContractAction(state, action)
    case "Gather":
      return checkGatherAction(state, action)
    case "Fight":
      return checkFightAction(state, action)
    case "Craft":
      return checkCraftAction(state, action)
    case "Store":
      return checkStoreAction(state, action)
    case "Drop":
      return checkDropAction(state, action)
    case "Enrol":
      return checkGuildEnrolmentAction(state, action)
    case "TurnInCombatToken":
      return checkTurnInCombatTokenAction(state, action)
  }
}
