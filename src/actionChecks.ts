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
import { getGuildLocationForSkill, getSkillForGuildLocation } from "./world.js"
import { hasMasteryUnlock, getSpeedForMaterial, getMaterialMastery } from "./masteryData.js"

/**
 * Result of checking action preconditions
 */
export interface ActionCheckResult {
  valid: boolean
  failureType?: FailureType
  failureReason?: string // NEW - sub-reason for the failure
  failureContext?: Record<string, unknown> // NEW - context data for hint generation
  timeCost: number
  successProbability: number
}

/**
 * Check if inventory has all required items
 * Non-stacking: counts all slots with matching itemId
 */
export function hasItems(inventory: ItemStack[], required: ItemStack[]): boolean {
  for (const req of required) {
    // Count all slots with this itemId
    const itemCount = inventory.filter((i) => i.itemId === req.itemId).length
    if (itemCount < req.quantity) {
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
 * Non-stacking: checks total item count (each unit = 1 slot)
 */
export function canFitItems(
  state: WorldState,
  itemsToAdd: ItemStack[],
  itemsToRemove: ItemStack[] = []
): boolean {
  const currentCount = state.player.inventory.length
  const removeCount = itemsToRemove.reduce((sum, i) => sum + i.quantity, 0)
  const addCount = itemsToAdd.reduce((sum, i) => sum + i.quantity, 0)

  return currentCount - removeCount + addCount <= state.player.inventoryCapacity
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
    return {
      valid: false,
      failureType: "CONTRACT_NOT_FOUND",
      failureReason: "not_found",
      failureContext: { contractId: action.contractId },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Must be at the specific location where this contract is offered
  if (getCurrentLocationId(state) !== contract.acceptLocationId) {
    return {
      valid: false,
      failureType: "WRONG_LOCATION",
      failureReason: "must_be_at_contract_location",
      failureContext: {
        requiredLocationId: contract.acceptLocationId,
        currentLocationId: getCurrentLocationId(state),
        contractId: contract.id,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Check guild hall level meets contract level
  const location = getCurrentLocation(state)
  if (location?.type === ExplorationLocationType.GUILD_HALL) {
    if (location.guildLevel !== undefined && location.guildLevel < contract.level) {
      return {
        valid: false,
        failureType: "GUILD_LEVEL_TOO_LOW",
        failureReason: "contract_level_too_high",
        failureContext: {
          requiredLevel: contract.level,
          currentLevel: location.guildLevel,
          contractId: contract.id,
          guildType: contract.guildType,
        },
        timeCost: 0,
        successProbability: 0,
      }
    }
  }

  if (state.player.activeContracts.includes(action.contractId)) {
    return {
      valid: false,
      failureType: "ALREADY_HAS_CONTRACT",
      failureReason: "already_active",
      failureContext: {
        contractId: action.contractId,
      },
      timeCost: 0,
      successProbability: 0,
    }
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
 * Get required skill level to access a location based on its distance band.
 * Location access is no longer gated by skill level - materials are gated instead.
 * Per mining-levels-1-200.md, material unlock levels control progression.
 */
export function getLocationSkillRequirement(_locationId: string): number {
  // No location-based gating - material levels control progression instead
  return 1
}

/**
 * Get base time cost for gathering mode (legacy - used by non-mastery code)
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
 * Get time cost based on mastery for the canonical gathering system.
 * APPRAISE: 1 tick
 * FOCUS: Based on material's speed mastery (20/15/10/5 ticks)
 * CAREFUL: 2x the slowest material's speed among careful-unlocked materials
 */
function getMasteryBasedTimeCost(
  mode: GatherMode,
  skillLevel: number,
  node: Node,
  focusMaterialId?: string
): number {
  if (mode === GatherMode.APPRAISE) return 1

  if (mode === GatherMode.FOCUS && focusMaterialId) {
    return getSpeedForMaterial(skillLevel, focusMaterialId)
  }

  if (mode === GatherMode.CAREFUL_ALL) {
    // Find materials with Careful unlock
    const carefulMaterials = node.materials.filter(
      (m) => m.remainingUnits > 0 && hasMasteryUnlock(skillLevel, m.materialId, "Careful")
    )

    if (carefulMaterials.length === 0) {
      return 20 * 2 // Fallback to base speed * 2
    }

    // 2x the slowest material's speed
    const slowest = Math.max(
      ...carefulMaterials.map((m) => getSpeedForMaterial(skillLevel, m.materialId))
    )
    return slowest * 2
  }

  return 20 // Default fallback
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
    return {
      valid: false,
      failureType: "NODE_NOT_FOUND",
      failureReason: "node_does_not_exist",
      failureContext: {
        nodeId: action.nodeId,
        currentAreaId: getCurrentAreaId(state),
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Check location
  if (getCurrentAreaId(state) !== node.areaId) {
    return {
      valid: false,
      failureType: "WRONG_LOCATION",
      failureReason: "wrong_area",
      failureContext: {
        requiredAreaId: node.areaId,
        currentAreaId: getCurrentAreaId(state),
        nodeId: node.nodeId,
      },
      timeCost: 0,
      successProbability: 0,
    }
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
        failureReason: "not_discovered",
        failureContext: {
          locationId,
          nodeType: node.nodeType,
        },
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
        failureReason: "wrong_location",
        failureContext: {
          requiredLocationId: locationId,
          currentLocationId,
          nodeType: node.nodeType,
        },
        timeCost: 0,
        successProbability: 0,
      }
    }
  }

  // Check if node is depleted
  const hasAnyMaterials = node.materials.some((m) => m.remainingUnits > 0)
  if (!hasAnyMaterials || node.depleted) {
    return {
      valid: false,
      failureType: "NODE_DEPLETED",
      failureReason: "no_materials_remaining",
      failureContext: {
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        areaId: node.areaId,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  const skill = getNodeSkill(node)
  const skillLevel = state.player.skills[skill].level

  // Check guild enrollment (must have skill level >= 1)
  if (skillLevel < 1) {
    return {
      valid: false,
      failureType: "NOT_ENROLLED",
      failureReason: "must_enrol_in_guild",
      failureContext: {
        skill,
        requiredGuild: `${skill} Guild`,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Check inventory capacity before extracting (not for APPRAISE)
  if (mode !== GatherMode.APPRAISE) {
    const inventoryCapacity = state.player.inventoryCapacity ?? 10
    if (state.player.inventory.length >= inventoryCapacity) {
      return {
        valid: false,
        failureType: "INVENTORY_FULL",
        failureReason: "no_space_for_materials",
        failureContext: {
          capacity: inventoryCapacity,
          current: state.player.inventory.length,
        },
        timeCost: 0,
        successProbability: 0,
      }
    }
  }

  // Check if mode is unlocked (check mode first for better UX - more specific error)
  if (!isModeUnlocked(mode, skillLevel)) {
    const nextUnlock = getNextModeUnlock(skillLevel)
    return {
      valid: false,
      failureType: "MODE_NOT_UNLOCKED",
      failureReason: "skill_level_too_low",
      failureContext: {
        mode,
        currentSkillLevel: skillLevel,
        skill,
        nextMode: nextUnlock?.mode,
        nextModeLevel: nextUnlock?.level,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Check location access based on skill level (L5 for MID, L9 for FAR)
  const locationRequirement = getLocationSkillRequirement(node.areaId)
  if (skillLevel < locationRequirement) {
    return {
      valid: false,
      failureType: "INSUFFICIENT_SKILL",
      failureReason: "location_access",
      failureContext: {
        skill,
        currentLevel: skillLevel,
        requiredLevel: locationRequirement,
        nodeAreaId: node.areaId,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // FOCUS mode requires focusMaterialId
  if (mode === GatherMode.FOCUS) {
    if (!action.focusMaterialId) {
      return {
        valid: false,
        failureType: "MISSING_FOCUS_MATERIAL",
        failureReason: "no_material_specified",
        failureContext: {
          nodeId: node.nodeId,
          availableMaterials: node.materials.map((m) => m.materialId),
        },
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
        failureReason: focusMaterial ? "material_depleted" : "material_not_in_node",
        failureContext: {
          materialId: action.focusMaterialId,
          nodeId: node.nodeId,
          availableMaterials: node.materials
            .filter((m) => m.remainingUnits > 0)
            .map((m) => m.materialId),
        },
        timeCost: 0,
        successProbability: 0,
      }
    }

    // Check mastery unlock for focus material (M1 = Unlock)
    if (!hasMasteryUnlock(skillLevel, action.focusMaterialId, "Unlock")) {
      return {
        valid: false,
        failureType: "MATERIAL_NOT_UNLOCKED",
        failureReason: "need_mastery_unlock",
        failureContext: {
          skill,
          currentMastery: getMaterialMastery(skillLevel, action.focusMaterialId),
          requiredMastery: 1,
          materialId: action.focusMaterialId,
        },
        timeCost: 0,
        successProbability: 0,
      }
    }
  }

  // CAREFUL mode requires at least one material with M16 (Careful) unlock
  if (mode === GatherMode.CAREFUL_ALL) {
    const carefulMaterials = node.materials.filter(
      (m) => m.remainingUnits > 0 && hasMasteryUnlock(skillLevel, m.materialId, "Careful")
    )

    if (carefulMaterials.length === 0) {
      return {
        valid: false,
        failureType: "NO_CAREFUL_MATERIALS",
        failureReason: "no_materials_with_careful_mastery",
        failureContext: {
          nodeId: node.nodeId,
          materials: node.materials.map((m) => m.materialId),
          carefulUnlockLevel: "M16",
        },
        timeCost: 0,
        successProbability: 0,
      }
    }
  }

  // Calculate time cost based on mastery
  const timeCost = getMasteryBasedTimeCost(mode, skillLevel, node, action.focusMaterialId)

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
/**
 * Check Fight action preconditions
 * NOTE: Combat is not yet fully implemented - enemies are not generated in the world
 */
export function checkFightAction(state: WorldState, _action: FightAction): ActionCheckResult {
  // Get current location to provide context
  const currentLocation = getCurrentLocation(state)
  const currentAreaId = getCurrentAreaId(state)

  // Combat not yet implemented - no enemies exist in the world
  // But we can provide helpful context about the current location
  if (currentLocation?.type === ExplorationLocationType.MOB_CAMP) {
    // At a mob camp, but enemies not implemented yet
    return {
      valid: false,
      failureType: "ENEMY_NOT_FOUND",
      failureReason: "enemies_not_implemented",
      failureContext: {
        locationId: currentLocation.id,
        locationType: currentLocation.type,
        creatureType: currentLocation.creatureType,
      },
      timeCost: 0,
      successProbability: 0,
    }
  } else {
    // Not at a mob camp - no enemy here
    return {
      valid: false,
      failureType: "ENEMY_NOT_FOUND",
      failureReason: "not_at_mob_camp",
      failureContext: {
        currentAreaId,
        currentLocationId: getCurrentLocationId(state),
      },
      timeCost: 0,
      successProbability: 0,
    }
  }
}

/**
 * Check Craft action preconditions
 */
export function checkCraftAction(state: WorldState, action: CraftAction): ActionCheckResult {
  const recipe = state.world.recipes.find((r) => r.id === action.recipeId)

  if (!recipe) {
    return {
      valid: false,
      failureType: "RECIPE_NOT_FOUND",
      failureReason: "recipe_does_not_exist",
      failureContext: {
        recipeId: action.recipeId,
        currentLocationId: getCurrentLocationId(state),
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Must be at a guild hall of the correct type
  const { at, location } = isAtGuildHallOfType(state, recipe.guildType)
  if (!at) {
    const currentLocation = getCurrentLocation(state)
    return {
      valid: false,
      failureType: "WRONG_GUILD_TYPE",
      failureReason: "wrong_guild",
      failureContext: {
        requiredGuildType: recipe.guildType,
        currentGuildType: currentLocation?.guildType,
        currentLocationId: getCurrentLocationId(state),
        recipeId: recipe.id,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Check guild hall level meets recipe level
  if (location?.guildLevel !== undefined && location.guildLevel < recipe.requiredSkillLevel) {
    return {
      valid: false,
      failureType: "GUILD_LEVEL_TOO_LOW",
      failureReason: "recipe_level_too_high",
      failureContext: {
        requiredLevel: recipe.requiredSkillLevel,
        currentLevel: location.guildLevel,
        recipeId: recipe.id,
        guildType: recipe.guildType,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Check player has required skill level
  const skillLevel = state.player.skills[recipe.guildType]?.level ?? 0
  if (skillLevel < recipe.requiredSkillLevel) {
    return {
      valid: false,
      failureType: "INSUFFICIENT_SKILL",
      failureReason: "recipe_level",
      failureContext: {
        skill: recipe.guildType,
        currentLevel: skillLevel,
        requiredLevel: recipe.requiredSkillLevel,
        recipeId: recipe.id,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  if (!hasItems(state.player.inventory, recipe.inputs)) {
    // Calculate missing items
    const missing: { itemId: string; have: number; need: number }[] = []
    for (const req of recipe.inputs) {
      const have = state.player.inventory.filter((i) => i.itemId === req.itemId).length
      if (have < req.quantity) {
        missing.push({ itemId: req.itemId, have, need: req.quantity })
      }
    }
    return {
      valid: false,
      failureType: "MISSING_ITEMS",
      failureReason: "craft_materials",
      failureContext: {
        recipeId: recipe.id,
        missingItems: missing,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Check if output will fit after consuming inputs
  const outputItem = { itemId: recipe.output.itemId, quantity: recipe.output.quantity }
  const inputItems = recipe.inputs.map((i) => ({ itemId: i.itemId, quantity: i.quantity }))
  if (!canFitItems(state, [outputItem], inputItems)) {
    return {
      valid: false,
      failureType: "INVENTORY_FULL",
      failureReason: "craft_output",
      failureContext: {
        outputItem: recipe.output.itemId,
        outputQuantity: recipe.output.quantity,
        currentInventoryCount: state.player.inventory.length,
        maxInventoryCapacity: state.player.inventoryCapacity,
        slotsNeeded: recipe.output.quantity - recipe.inputs.reduce((sum, i) => sum + i.quantity, 0),
      },
      timeCost: 0,
      successProbability: 0,
    }
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
    return {
      valid: false,
      failureType: "WRONG_LOCATION",
      failureReason: "must_be_at_warehouse",
      failureContext: {
        requiredLocationType: ExplorationLocationType.WAREHOUSE,
        currentLocationId: getCurrentLocationId(state),
        currentLocationType: location?.type,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Non-stacking: count all slots with matching itemId
  const itemCount = state.player.inventory.filter((i) => i.itemId === action.itemId).length
  if (itemCount === 0) {
    return {
      valid: false,
      failureType: "ITEM_NOT_FOUND",
      failureReason: "not_in_inventory",
      failureContext: {
        itemId: action.itemId,
        actionType: "Store",
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  if (itemCount < action.quantity) {
    return { valid: false, failureType: "MISSING_ITEMS", timeCost: 0, successProbability: 0 }
  }

  return { valid: true, timeCost: 0, successProbability: 1 }
}

/**
 * Check Drop action preconditions
 */
export function checkDropAction(state: WorldState, action: DropAction): ActionCheckResult {
  const dropTime = 1

  // Non-stacking: count all slots with matching itemId
  const itemCount = state.player.inventory.filter((i) => i.itemId === action.itemId).length
  if (itemCount === 0) {
    return {
      valid: false,
      failureType: "ITEM_NOT_FOUND",
      failureReason: "not_in_inventory",
      failureContext: {
        itemId: action.itemId,
        actionType: "Drop",
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  if (itemCount < action.quantity) {
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
  _action: GuildEnrolmentAction
): ActionCheckResult {
  const enrolTime = 3

  // Resolve skill from current location
  const currentLocationId = getCurrentLocationId(state)
  const skill = getSkillForGuildLocation(currentLocationId)

  // Must be at a guild hall
  if (!skill) {
    return {
      valid: false,
      failureType: "WRONG_LOCATION",
      failureReason: "must_be_at_guild_hall",
      failureContext: {
        currentLocationId: currentLocationId,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Check if skill exists (defensive check for invalid skill names)
  const skillState = state.player.skills[skill]
  if (!skillState) {
    return {
      valid: false,
      failureType: "INSUFFICIENT_SKILL",
      failureReason: "invalid_skill",
      failureContext: { skill },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Check if skill is already level 1 or higher
  if (skillState.level >= 1) {
    return {
      valid: false,
      failureType: "ALREADY_ENROLLED",
      failureReason: "already_member",
      failureContext: {
        skill,
        currentLevel: skillState.level,
      },
      timeCost: 0,
      successProbability: 0,
    }
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
    return {
      valid: false,
      failureType: "WRONG_LOCATION",
      failureReason: "must_be_at_combat_guild",
      failureContext: {
        requiredLocationId: requiredLocation,
        currentLocationId: getCurrentLocationId(state),
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Must have COMBAT_GUILD_TOKEN
  const token = state.player.inventory.find((i) => i.itemId === "COMBAT_GUILD_TOKEN")
  if (!token || token.quantity < 1) {
    return {
      valid: false,
      failureType: "MISSING_ITEMS",
      failureReason: "token_required",
      failureContext: {
        itemId: "COMBAT_GUILD_TOKEN",
        have: token?.quantity ?? 0,
        need: 1,
      },
      timeCost: 0,
      successProbability: 0,
    }
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
    return {
      valid: false,
      failureType: "ALREADY_AT_LOCATION",
      failureReason: "already_here",
      failureContext: { locationId: action.locationId },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Location must exist in current area (check before hub check for better error message)
  const area = state.exploration.areas.get(currentAreaId)
  const location = area?.locations.find((loc) => loc.id === action.locationId)
  if (!location) {
    return {
      valid: false,
      failureType: "UNKNOWN_LOCATION",
      failureReason: "not_found",
      failureContext: {
        locationId: action.locationId,
        currentAreaId,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Must be at hub (null) to travel to a location
  if (currentLocationId !== null) {
    return {
      valid: false,
      failureType: "NOT_AT_HUB",
      failureReason: "at_location",
      failureContext: { currentLocationId },
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
      failureReason: "not_discovered",
      failureContext: {
        locationId: action.locationId,
        locationType: location.type,
      },
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
    return {
      valid: false,
      failureType: "ALREADY_AT_HUB",
      failureReason: "at_hub",
      failureContext: { currentAreaId: getCurrentAreaId(state) },
      timeCost: 0,
      successProbability: 0,
    }
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
