// Shared action validation logic used by both engine execution and evaluation
// This ensures consistency: "Evaluation must call the same logic paths as execution"

import type {
  WorldState,
  Action,
  AcceptContractAction,
  GatherAction,
  FightAction,
  CraftAction,
  StoreAction,
  DropAction,
  GuildEnrolmentAction,
  TurnInCombatTokenAction,
  TravelToLocationAction,
  LeaveAction,
  FailureType,
  ItemStack,
  Node,
  GatheringSkillID,
  ExplorationLocation,
} from "./types.js"
import {
  GatherMode,
  getCurrentAreaId,
  getCurrentLocationId,
  isInTown,
  ExplorationLocationType,
} from "./types.js"
import { getGuildLocationForSkill } from "./world.js"

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
 * Check if adding items would exceed inventory capacity
 * Takes into account items that will be removed first (for crafting)
 */
export function canFitItems(
  state: WorldState,
  itemsToAdd: ItemStack[],
  itemsToRemove: ItemStack[] = []
): boolean {
  // Simulate the inventory after removing items
  const simulatedInventory = new Map<string, number>()
  for (const item of state.player.inventory) {
    simulatedInventory.set(item.itemId, item.quantity)
  }

  // Remove items
  for (const item of itemsToRemove) {
    const current = simulatedInventory.get(item.itemId) ?? 0
    const newQty = current - item.quantity
    if (newQty <= 0) {
      simulatedInventory.delete(item.itemId)
    } else {
      simulatedInventory.set(item.itemId, newQty)
    }
  }

  // Add items
  for (const item of itemsToAdd) {
    const current = simulatedInventory.get(item.itemId) ?? 0
    simulatedInventory.set(item.itemId, current + item.quantity)
  }

  // Check slot count
  return simulatedInventory.size <= state.player.inventoryCapacity
}

/**
 * Get a location from the current area by ID
 */
export function getLocationInCurrentArea(
  state: WorldState,
  locationId: string
): ExplorationLocation | undefined {
  const currentAreaId = getCurrentAreaId(state)
  const area = state.exploration.areas.get(currentAreaId)
  return area?.locations.find((loc) => loc.id === locationId)
}

/**
 * Get the current location object (or undefined if at hub/null)
 */
export function getCurrentLocation(state: WorldState): ExplorationLocation | undefined {
  const locationId = getCurrentLocationId(state)
  if (locationId === null) return undefined
  return getLocationInCurrentArea(state, locationId)
}

/**
 * Check if player is at a guild hall of a specific type
 */
export function isAtGuildHallOfType(
  state: WorldState,
  guildType: string
): { at: boolean; location?: ExplorationLocation } {
  const location = getCurrentLocation(state)
  if (!location) return { at: false }
  if (location.type !== ExplorationLocationType.GUILD_HALL) return { at: false }
  if (location.guildType !== guildType) return { at: false }
  return { at: true, location }
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

  // Must be at the specific location where this contract is offered
  if (getCurrentLocationId(state) !== contract.acceptLocationId) {
    return { valid: false, failureType: "WRONG_LOCATION", timeCost: 0, successProbability: 0 }
  }

  // Check guild hall level meets contract level
  const location = getCurrentLocation(state)
  if (location?.type === ExplorationLocationType.GUILD_HALL) {
    if (location.guildLevel !== undefined && location.guildLevel < contract.level) {
      return {
        valid: false,
        failureType: "GUILD_LEVEL_TOO_LOW",
        timeCost: 0,
        successProbability: 0,
      }
    }
  }

  if (state.player.activeContracts.includes(action.contractId)) {
    return { valid: false, failureType: "ALREADY_HAS_CONTRACT", timeCost: 0, successProbability: 0 }
  }

  return { valid: true, timeCost: 0, successProbability: 1 }
}

/**
 * Get the skill required to gather from a multi-material node
 */
function getNodeSkill(node: Node): GatheringSkillID {
  // All materials in a node require the same skill type
  return node.materials[0]?.requiresSkill ?? "Mining"
}

/**
 * Check if a mode is unlocked based on skill level
 * Per spec:
 * - L1: Basic FOCUS mode
 * - L3: Unlock APPRAISE_NODE
 * - L4: Unlock GATHER_CAREFUL_ALL
 */
function isModeUnlocked(mode: GatherMode, skillLevel: number): boolean {
  switch (mode) {
    case GatherMode.APPRAISE:
      return skillLevel >= 3 // L3 unlocks APPRAISE_NODE
    case GatherMode.FOCUS:
      return true // FOCUS available at L1
    case GatherMode.CAREFUL_ALL:
      return skillLevel >= 4 // L4 unlocks CAREFUL_ALL
  }
}

/**
 * Get list of unlocked gathering modes for a skill level.
 * Returns modes in order of unlock (FOCUS first, then APPRAISE, then CAREFUL_ALL).
 */
export function getUnlockedModes(skillLevel: number): GatherMode[] {
  const modes: GatherMode[] = []
  if (skillLevel >= 1) modes.push(GatherMode.FOCUS)
  if (skillLevel >= 3) modes.push(GatherMode.APPRAISE)
  if (skillLevel >= 4) modes.push(GatherMode.CAREFUL_ALL)
  return modes
}

/**
 * Get next mode unlock info for a skill level.
 * Returns null if all modes are unlocked.
 */
export function getNextModeUnlock(skillLevel: number): { mode: GatherMode; level: number } | null {
  if (skillLevel < 3) return { mode: GatherMode.APPRAISE, level: 3 }
  if (skillLevel < 4) return { mode: GatherMode.CAREFUL_ALL, level: 4 }
  return null
}

/**
 * Get required skill level to access a location based on its distance band
 * Per spec:
 * - NEAR (distance 1): L1
 * - MID (distance 2): L5
 * - FAR (distance 3+): L9
 */
export function getLocationSkillRequirement(locationId: string): number {
  // TOWN has no gating
  if (locationId === "TOWN") {
    return 1
  }

  // Parse procedural area IDs (format: area-d{distance}-i{index})
  const match = locationId.match(/^area-d(\d+)-i\d+$/)
  if (match) {
    const distance = parseInt(match[1], 10)
    if (distance === 1) return 1 // NEAR - no gating
    if (distance === 2) return 5 // MID - requires L5
    if (distance >= 3) return 9 // FAR - requires L9
  }

  // Fallback for legacy area IDs (kept for compatibility)
  if (locationId.includes("OUTSKIRTS") || locationId.includes("COPSE")) {
    return 1 // NEAR - no gating
  } else if (locationId.includes("QUARRY") || locationId.includes("DEEP_FOREST")) {
    return 5 // MID - requires L5
  } else if (locationId.includes("SHAFT") || locationId.includes("GROVE")) {
    return 9 // FAR - requires L9
  }

  return 1 // Default to no gating
}

/**
 * Get base time cost for gathering mode
 */
function getGatheringTimeCost(mode: GatherMode): number {
  switch (mode) {
    case GatherMode.APPRAISE:
      return 1
    case GatherMode.FOCUS:
      return 5 // Base time for focus extraction
    case GatherMode.CAREFUL_ALL:
      return 10 // Slower but safer
  }
}

/**
 * Check Gather action preconditions for multi-material nodes
 */
export function checkGatherAction(state: WorldState, action: GatherAction): ActionCheckResult {
  return checkMultiMaterialGatherAction(state, action)
}

/**
 * Check multi-material node Gather action preconditions
 */
function checkMultiMaterialGatherAction(
  state: WorldState,
  action: GatherAction
): ActionCheckResult {
  const mode = action.mode!
  const node = state.world.nodes?.find((n) => n.nodeId === action.nodeId)

  if (!node) {
    return { valid: false, failureType: "NODE_NOT_FOUND", timeCost: 0, successProbability: 0 }
  }

  // Check location
  if (getCurrentAreaId(state) !== node.areaId) {
    return { valid: false, failureType: "WRONG_LOCATION", timeCost: 0, successProbability: 0 }
  }

  // Check if node's location has been discovered via Explore
  // AND that player is currently at that location
  const nodeIndexMatch = node.nodeId.match(/-node-(\d+)$/)
  if (nodeIndexMatch) {
    const nodeIndex = nodeIndexMatch[1]
    const locationId = `${node.areaId}-loc-${nodeIndex}`
    const knownLocationIds = state.exploration.playerState.knownLocationIds
    if (!knownLocationIds.includes(locationId)) {
      return {
        valid: false,
        failureType: "LOCATION_NOT_DISCOVERED",
        timeCost: 0,
        successProbability: 0,
      }
    }
    // Player must be at the node's location to gather
    const currentLocationId = getCurrentLocationId(state)
    if (currentLocationId !== locationId) {
      return {
        valid: false,
        failureType: "NOT_AT_NODE_LOCATION",
        timeCost: 0,
        successProbability: 0,
      }
    }
  }

  // Check if node is depleted
  const hasAnyMaterials = node.materials.some((m) => m.remainingUnits > 0)
  if (!hasAnyMaterials || node.depleted) {
    return { valid: false, failureType: "NODE_DEPLETED", timeCost: 0, successProbability: 0 }
  }

  const skill = getNodeSkill(node)
  const skillLevel = state.player.skills[skill].level

  // Check location access based on skill level (L5 for MID, L9 for FAR)
  const locationRequirement = getLocationSkillRequirement(node.areaId)
  if (skillLevel < locationRequirement) {
    return { valid: false, failureType: "INSUFFICIENT_SKILL", timeCost: 0, successProbability: 0 }
  }

  // Check if mode is unlocked
  if (!isModeUnlocked(mode, skillLevel)) {
    return { valid: false, failureType: "MODE_NOT_UNLOCKED", timeCost: 0, successProbability: 0 }
  }

  // FOCUS mode requires focusMaterialId
  if (mode === GatherMode.FOCUS) {
    if (!action.focusMaterialId) {
      return {
        valid: false,
        failureType: "MISSING_FOCUS_MATERIAL",
        timeCost: 0,
        successProbability: 0,
      }
    }

    // Check if the material exists in the node and has remaining units
    const focusMaterial = node.materials.find((m) => m.materialId === action.focusMaterialId)
    if (!focusMaterial || focusMaterial.remainingUnits <= 0) {
      return {
        valid: false,
        failureType: "MISSING_FOCUS_MATERIAL",
        timeCost: 0,
        successProbability: 0,
      }
    }

    // Check skill level for focus material
    if (skillLevel < focusMaterial.requiredLevel) {
      return { valid: false, failureType: "INSUFFICIENT_SKILL", timeCost: 0, successProbability: 0 }
    }
  }

  const timeCost = getGatheringTimeCost(mode)

  return { valid: true, timeCost, successProbability: 1 }
}

/**
 * Export for engine use
 */
export { getNodeSkill, getGatheringTimeCost }

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

  if (getCurrentAreaId(state) !== enemy.areaId) {
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

  // Check if loot will fit in inventory (at least 1 slot for the single drop from loot table)
  const maxLootQuantity = Math.max(...enemy.lootTable.map((l) => l.quantity))
  const lootItems = [{ itemId: enemy.lootTable[0].itemId, quantity: maxLootQuantity }]
  if (!canFitItems(state, lootItems)) {
    return { valid: false, failureType: "INVENTORY_FULL", timeCost: 0, successProbability: 0 }
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

  // Must be at a guild hall of the correct type
  const { at, location } = isAtGuildHallOfType(state, recipe.guildType)
  if (!at) {
    return { valid: false, failureType: "WRONG_GUILD_TYPE", timeCost: 0, successProbability: 0 }
  }

  // Check guild hall level meets recipe level
  if (location?.guildLevel !== undefined && location.guildLevel < recipe.requiredSkillLevel) {
    return { valid: false, failureType: "GUILD_LEVEL_TOO_LOW", timeCost: 0, successProbability: 0 }
  }

  // Check player has required skill level
  const skillLevel = state.player.skills[recipe.guildType]?.level ?? 0
  if (skillLevel < recipe.requiredSkillLevel) {
    return { valid: false, failureType: "INSUFFICIENT_SKILL", timeCost: 0, successProbability: 0 }
  }

  if (!hasItems(state.player.inventory, recipe.inputs)) {
    return { valid: false, failureType: "MISSING_ITEMS", timeCost: 0, successProbability: 0 }
  }

  // Check if output will fit after consuming inputs
  const outputItem = { itemId: recipe.output.itemId, quantity: recipe.output.quantity }
  const inputItems = recipe.inputs.map((i) => ({ itemId: i.itemId, quantity: i.quantity }))
  if (!canFitItems(state, [outputItem], inputItems)) {
    return { valid: false, failureType: "INVENTORY_FULL", timeCost: 0, successProbability: 0 }
  }

  return { valid: true, timeCost: recipe.craftTime, successProbability: 1 }
}

/**
 * Check Store action preconditions
 * Store is a free action (0 ticks, no skill required)
 * Must be at the warehouse location
 */
export function checkStoreAction(state: WorldState, action: StoreAction): ActionCheckResult {
  // Must be at a warehouse location
  const location = getCurrentLocation(state)
  if (!location || location.type !== ExplorationLocationType.WAREHOUSE) {
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

  // Must be at the correct guild hall for this skill
  const requiredLocation = getGuildLocationForSkill(action.skill)
  if (getCurrentLocationId(state) !== requiredLocation) {
    return { valid: false, failureType: "WRONG_LOCATION", timeCost: 0, successProbability: 0 }
  }

  // Check if skill exists (defensive check for invalid skill names)
  const skillState = state.player.skills[action.skill]
  if (!skillState) {
    return { valid: false, failureType: "INSUFFICIENT_SKILL", timeCost: 0, successProbability: 0 }
  }

  // Check if skill is already level 1 or higher
  if (skillState.level >= 1) {
    return { valid: false, failureType: "ALREADY_ENROLLED", timeCost: 0, successProbability: 0 }
  }

  return { valid: true, timeCost: enrolTime, successProbability: 1 }
}

/**
 * Check TurnInCombatToken action preconditions
 * Cost: 0 ticks, requires being at Combat Guild and having COMBAT_GUILD_TOKEN
 */
export function checkTurnInCombatTokenAction(
  state: WorldState,
  _action: TurnInCombatTokenAction
): ActionCheckResult {
  // Must be at Combat Guild
  const requiredLocation = getGuildLocationForSkill("Combat")
  if (getCurrentLocationId(state) !== requiredLocation) {
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
 * Check TravelToLocation action preconditions
 * Cost: 0 ticks in town, 1 tick in wilderness
 * Must be at hub (currentLocationId = null)
 */
export function checkTravelToLocationAction(
  state: WorldState,
  action: TravelToLocationAction
): ActionCheckResult {
  const currentAreaId = getCurrentAreaId(state)
  const currentLocationId = getCurrentLocationId(state)

  // Can't travel to current location (more specific error first)
  if (action.locationId === currentLocationId) {
    return { valid: false, failureType: "ALREADY_AT_LOCATION", timeCost: 0, successProbability: 0 }
  }

  // Must be at hub (null) to travel to a location
  if (currentLocationId !== null) {
    return { valid: false, failureType: "NOT_AT_HUB", timeCost: 0, successProbability: 0 }
  }

  // Location must exist in current area
  const area = state.exploration.areas.get(currentAreaId)
  const location = area?.locations.find((loc) => loc.id === action.locationId)
  if (!location) {
    return {
      valid: false,
      failureType: "UNKNOWN_LOCATION",
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Location must be discovered (known)
  const knownLocationIds = state.exploration.playerState.knownLocationIds
  if (!knownLocationIds.includes(action.locationId)) {
    return {
      valid: false,
      failureType: "LOCATION_NOT_DISCOVERED",
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Time cost: 0 in town, 1 in wilderness
  const timeCost = isInTown(state) ? 0 : 1

  return { valid: true, timeCost, successProbability: 1 }
}

/**
 * Check Leave action preconditions
 * Cost: 0 ticks in town, 1 tick in wilderness
 * Must be at a location (not at hub)
 */
export function checkLeaveAction(state: WorldState, _action: LeaveAction): ActionCheckResult {
  const currentLocationId = getCurrentLocationId(state)

  // Must be at a location (not at hub)
  if (currentLocationId === null) {
    return { valid: false, failureType: "ALREADY_AT_HUB", timeCost: 0, successProbability: 0 }
  }

  // Time cost: 0 in town, 1 in wilderness
  const timeCost = isInTown(state) ? 0 : 1

  return { valid: true, timeCost, successProbability: 1 }
}

/**
 * Check any action's preconditions
 */
export function checkAction(state: WorldState, action: Action): ActionCheckResult {
  switch (action.type) {
    case "AcceptContract":
      return checkAcceptContractAction(state, action)
    case "Gather":
      return checkGatherAction(state, action)
    case "Mine":
    case "Chop":
      // Mine/Chop are resolved to Gather at runtime; validation happens there
      return { valid: true, timeCost: 0, successProbability: 1 }
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
    case "TravelToLocation":
      return checkTravelToLocationAction(state, action)
    case "Leave":
      return checkLeaveAction(state, action)
    // Movement and exploration actions have their own validation in exploration.ts/engine.ts
    case "Move":
    case "Survey":
    case "Explore":
    case "ExplorationTravel":
    case "FarTravel":
      return { valid: true, timeCost: 0, successProbability: 1 }
  }
}
