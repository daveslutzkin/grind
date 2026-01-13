// Hint generation for structured failure messages

import type { FailureDetails, WorldState, AreaID } from "./types.js"
import { getCurrentAreaId } from "./types.js"
import { getAreaDisplayName } from "./exploration.js"

export interface FormattedFailure {
  message: string // What failed
  reason?: string // Why
  hint?: string // Remediation
}

/**
 * Get areas that are adjacent to the current area and have been discovered
 * CRITICAL: Only returns areas the player has already discovered (no spoilers)
 */
function getDiscoveredAdjacentAreas(state: WorldState, currentAreaId: AreaID): string[] {
  const knownConnectionIds = new Set(state.exploration.playerState.knownConnectionIds)
  const knownAreaIds = new Set(state.exploration.playerState.knownAreaIds)
  const adjacentAreas: string[] = []

  // Find all connections from current area
  for (const conn of state.exploration.connections) {
    let adjacentAreaId: string | null = null

    if (conn.fromAreaId === currentAreaId) {
      adjacentAreaId = conn.toAreaId
    } else if (conn.toAreaId === currentAreaId) {
      adjacentAreaId = conn.fromAreaId
    }

    // Only include if connection is known and area is discovered
    if (adjacentAreaId) {
      const connId = `${conn.fromAreaId}->${conn.toAreaId}`
      const reverseConnId = `${conn.toAreaId}->${conn.fromAreaId}`
      const isConnectionKnown =
        knownConnectionIds.has(connId) || knownConnectionIds.has(reverseConnId)

      if (isConnectionKnown && knownAreaIds.has(adjacentAreaId)) {
        const area = state.exploration.areas.get(adjacentAreaId)
        const areaName = getAreaDisplayName(adjacentAreaId, area)
        adjacentAreas.push(areaName)
      }
    }
  }

  return adjacentAreas
}

/**
 * Generate a helpful hint for a failure.
 * This is the main entry point for hint generation.
 *
 * Returns a structured failure message with:
 * - message: What failed
 * - reason: Why it failed (optional)
 * - hint: How to fix it (optional)
 */
export function generateFailureHint(details: FailureDetails, state: WorldState): FormattedFailure {
  const { type, reason, context } = details

  // Travel/Navigation Errors
  switch (type) {
    case "NO_PATH_TO_DESTINATION": {
      const dest = (context?.destination as string) ?? "destination"

      if (reason === "undiscovered") {
        const currentAreaId = getCurrentAreaId(state)
        const adjacent = getDiscoveredAdjacentAreas(state, currentAreaId)
        return {
          message: `No path to ${dest}`,
          reason: "Area is undiscovered",
          hint:
            adjacent.length > 0
              ? `Travel to an adjacent explored area (${adjacent.join(", ")}) first, then explore to discover routes.`
              : "Explore from your current location to discover new routes.",
        }
      }

      if (reason === "no_route") {
        return {
          message: `No path to ${dest}`,
          reason: "No connecting route exists",
          hint: "Areas may connect through intermediate locations. Check your map for possible paths.",
        }
      }

      // reason === "unknown" or no reason
      return {
        message: `Unknown destination: ${dest}`,
        reason: "Destination not recognized",
        hint: "Check spelling or use 'areas' command to see known locations.",
      }
    }

    case "AREA_NOT_KNOWN": {
      const dest = (context?.destination as string) ?? "destination"
      return {
        message: `Cannot travel to ${dest}`,
        reason: "Area is undiscovered",
        hint: "Explore from your current location or travel to adjacent areas to discover new routes.",
      }
    }

    case "ALREADY_IN_AREA": {
      const dest = (context?.destination as string) ?? "area"
      return {
        message: `Already in ${dest}`,
        reason: "You are already at this area",
        hint: "No need to travel - you're already here.",
      }
    }

    case "LOCATION_NOT_DISCOVERED": {
      return {
        message: `Location not discovered`,
        reason: "This location hasn't been found yet",
        hint: "Use the 'explore' action to discover locations in your current area.",
      }
    }

    case "UNKNOWN_LOCATION": {
      const locationId = (context?.locationId as string) ?? "location"
      return {
        message: `Unknown location: ${locationId}`,
        reason: "Location not found in current area",
        hint: "Check available locations with the 'look' command or try exploring.",
      }
    }

    case "ALREADY_AT_LOCATION": {
      return {
        message: `Already at this location`,
        reason: "You are already here",
        hint: "No need to travel - you're already at this location.",
      }
    }

    case "NOT_AT_HUB": {
      return {
        message: `Cannot travel to location`,
        reason: "Must be at area hub to travel to locations",
        hint: "Use the 'leave' action to return to the hub first.",
      }
    }

    case "ALREADY_AT_HUB": {
      return {
        message: `Already at hub`,
        reason: "You are not at a location",
        hint: "Use 'go <location>' to travel to a specific location first.",
      }
    }

    case "NOT_AT_NODE_LOCATION": {
      const nodeType = (context?.nodeType as string) ?? "node"
      return {
        message: `Not at gathering location`,
        reason: `Must be at the ${nodeType} location to gather`,
        hint: "Use 'go <location>' to travel to the gathering node first.",
      }
    }

    // Skill/Resource Errors (Package 3)
    case "INSUFFICIENT_SKILL": {
      const skill = (context?.skill as string) ?? "skill"
      const currentLevel = (context?.currentLevel as number) ?? 0
      const requiredLevel = (context?.requiredLevel as number) ?? 1
      const levelGap = requiredLevel - currentLevel

      if (reason === "location_access") {
        const nodeAreaId = (context?.nodeAreaId as string) ?? "location"
        return {
          message: `Cannot access ${nodeAreaId}`,
          reason: `${skill} level too low (have ${currentLevel}, need ${requiredLevel})`,
          hint: `Gain ${levelGap} more ${skill} ${levelGap === 1 ? "level" : "levels"} by gathering at lower-tier locations.`,
        }
      }

      if (reason === "material_level") {
        const materialId = (context?.materialId as string) ?? "material"
        return {
          message: `Cannot gather ${materialId}`,
          reason: `${skill} level too low (have ${currentLevel}, need ${requiredLevel})`,
          hint: `Gain ${levelGap} more ${skill} ${levelGap === 1 ? "level" : "levels"} by gathering other materials at this node or lower-tier materials.`,
        }
      }

      if (reason === "recipe_level") {
        const recipeId = (context?.recipeId as string) ?? "item"
        return {
          message: `Cannot craft ${recipeId}`,
          reason: `${skill} level too low (have ${currentLevel}, need ${requiredLevel})`,
          hint: `Gain ${levelGap} more ${skill} ${levelGap === 1 ? "level" : "levels"} by crafting lower-tier items.`,
        }
      }

      if (reason === "invalid_skill") {
        return {
          message: `Invalid skill: ${skill}`,
          reason: "Skill not recognized",
          hint: "This is likely a configuration error. Contact support.",
        }
      }

      // Generic skill error
      return {
        message: `${skill} level too low`,
        reason: `Have ${currentLevel}, need ${requiredLevel}`,
        hint: `Gain ${levelGap} more ${skill} ${levelGap === 1 ? "level" : "levels"}.`,
      }
    }

    case "MISSING_ITEMS": {
      if (reason === "craft_materials") {
        const recipeId = (context?.recipeId as string) ?? "item"
        const missingItems =
          (context?.missingItems as Array<{ itemId: string; have: number; need: number }>) ?? []
        const itemsList = missingItems
          .map((item) => {
            const shortfall = item.need - item.have
            return `${shortfall} more ${item.itemId}`
          })
          .join(" and ")
        const gatherHint = missingItems.map((item) => item.itemId).join(", ")
        return {
          message: `Cannot craft ${recipeId}`,
          reason: `Missing materials: need ${itemsList}`,
          hint: `Gather ${gatherHint} from resource nodes.`,
        }
      }

      if (reason === "store_insufficient" || reason === "drop_insufficient") {
        const itemId = (context?.itemId as string) ?? "item"
        const have = (context?.have as number) ?? 0
        const need = (context?.need as number) ?? 1
        const shortfall = need - have
        const action = reason === "store_insufficient" ? "store" : "drop"
        return {
          message: `Cannot ${action} ${need} ${itemId}`,
          reason: `Only have ${have} ${itemId}`,
          hint: `You need ${shortfall} more ${itemId}.`,
        }
      }

      if (reason === "token_required") {
        const itemId = (context?.itemId as string) ?? "token"
        return {
          message: `Missing ${itemId}`,
          reason: "Required to turn in for contract",
          hint: `Obtain ${itemId} by completing combat encounters (1% drop rate).`,
        }
      }

      // Generic missing items error
      return {
        message: "Missing required items",
        reason: reason,
        hint: "Gather or craft the required items.",
      }
    }

    case "INVENTORY_FULL": {
      if (reason === "craft_output") {
        const outputItem = (context?.outputItem as string) ?? "item"
        const _outputQuantity = (context?.outputQuantity as number) ?? 1
        const currentCount = (context?.currentInventoryCount as number) ?? 0
        const maxCapacity = (context?.maxInventoryCapacity as number) ?? 0
        const slotsNeeded = (context?.slotsNeeded as number) ?? 1
        return {
          message: `Cannot craft ${outputItem}`,
          reason: `Inventory full (${currentCount}/${maxCapacity} slots, need ${slotsNeeded} more)`,
          hint: `Store or drop items to free up ${slotsNeeded} inventory ${slotsNeeded === 1 ? "slot" : "slots"}.`,
        }
      }

      // Generic inventory full error
      return {
        message: "Inventory full",
        reason: reason,
        hint: "Store or drop items to free up inventory space.",
      }
    }

    case "MISSING_WEAPON": {
      return {
        message: "No weapon equipped",
        reason: "Combat requires a weapon",
        hint: "Enroll in the Combat Guild to receive a weapon, or craft an improved weapon.",
      }
    }

    case "MISSING_FOCUS_MATERIAL": {
      if (reason === "no_material_specified") {
        const nodeId = (context?.nodeId as string) ?? "node"
        const availableMaterials = (context?.availableMaterials as string[]) ?? []
        const materialsList = availableMaterials.join(", ")
        return {
          message: `Cannot gather from ${nodeId}`,
          reason: "No focus material specified for FOCUS mode",
          hint: `Specify a material to focus on. Available: ${materialsList}.`,
        }
      }

      if (reason === "material_depleted" || reason === "material_not_in_node") {
        const materialId = (context?.materialId as string) ?? "material"
        const nodeId = (context?.nodeId as string) ?? "node"
        const availableMaterials = (context?.availableMaterials as string[]) ?? []
        if (availableMaterials.length === 0) {
          return {
            message: `Cannot gather ${materialId}`,
            reason: `${materialId} ${reason === "material_depleted" ? "depleted" : "not found"} in ${nodeId}`,
            hint: "This node is depleted. Find another node with this material.",
          }
        }
        const materialsList = availableMaterials.join(", ")
        return {
          message: `Cannot gather ${materialId}`,
          reason: `${materialId} ${reason === "material_depleted" ? "depleted" : "not found"} in ${nodeId}`,
          hint: `Focus on available materials instead: ${materialsList}.`,
        }
      }

      // Generic missing focus material error
      return {
        message: "Missing focus material",
        reason: reason,
        hint: "Specify a valid material to focus on.",
      }
    }

    // Exploration Errors
    case "NO_CONNECTIONS": {
      const areaName = (context?.currentAreaName as string) ?? "current area"
      return {
        message: `Cannot survey from ${areaName}`,
        reason: "This area has no connections to other areas",
        hint: "This is unusual - most areas connect to nearby locations. Try exploring to discover hidden connections, or return to a different area.",
      }
    }

    case "NO_UNDISCOVERED_AREAS": {
      const areaName = (context?.currentAreaName as string) ?? "current area"
      return {
        message: `Cannot survey from ${areaName}`,
        reason: "All connected areas have been discovered",
        hint: "Travel to a different area to continue surveying, or try exploring to find new connections.",
      }
    }

    case "AREA_FULLY_EXPLORED": {
      const areaName = (context?.currentAreaName as string) ?? "current area"
      return {
        message: `Area fully explored`,
        reason: `All locations and connections in ${areaName} have been discovered`,
        hint: "Travel to a different area to continue exploration, or accept exploration contracts.",
      }
    }

    // Gathering/Crafting Errors (Package 4)
    case "NODE_NOT_FOUND": {
      const nodeType = (context?.nodeType as string) ?? undefined
      const currentAreaId = (context?.currentAreaId as string) ?? "current area"

      if (reason === "cannot_infer_node") {
        return {
          message: "Cannot gather",
          reason: "No gathering node at current location",
          hint: "Use 'go <location>' to travel to a gathering node, or use 'Mine' or 'Chop' actions with a specific mode.",
        }
      }

      if (reason === "no_node_in_area" && nodeType) {
        const _skill = nodeType === "ORE_VEIN" ? "Mining" : "Woodcutting"
        const action = nodeType === "ORE_VEIN" ? "ore veins" : "tree stands"
        return {
          message: `No ${nodeType} found`,
          reason: `No ${action} in ${currentAreaId}`,
          hint: `Travel to a different area with ${action}. Use 'explore' in each area to discover gathering nodes, or check areas you've already discovered.`,
        }
      }

      // reason === "node_does_not_exist" or generic
      const nodeId = (context?.nodeId as string) ?? "specified node"
      return {
        message: `Node not found`,
        reason: `${nodeId} does not exist`,
        hint: "Check that the node ID is correct, or use 'explore' to discover gathering nodes in your current area.",
      }
    }

    case "NODE_DEPLETED": {
      const nodeType = (context?.nodeType as string) ?? "node"
      const areaId = (context?.areaId as string) ?? "area"
      return {
        message: `Resource depleted`,
        reason: `${nodeType} has no remaining materials`,
        hint: `This ${nodeType} in ${areaId} has been fully harvested. Travel to a different area to find fresh resources, or wait for the world to regenerate (if regeneration is implemented).`,
      }
    }

    case "RECIPE_NOT_FOUND": {
      const recipeId = (context?.recipeId as string) ?? "recipe"
      return {
        message: `Recipe not found`,
        reason: `${recipeId} does not exist`,
        hint: "Check available recipes at guild halls. Recipe names are case-sensitive.",
      }
    }

    case "GATHER_FAILURE": {
      // Note: This failure type is not currently used in the codebase
      // (gathering uses continuous yield variance, not binary success/fail)
      // But we provide a hint in case it's used in the future
      const skill = (context?.skill as string) ?? "gathering skill"
      const successChance = context?.successChance
      return {
        message: "Gathering failed",
        reason: "Skill check unsuccessful",
        hint:
          successChance !== undefined
            ? `Higher ${skill} increases success rate. Current success chance: ${Math.round((successChance as number) * 100)}%.`
            : `Increase your ${skill} to improve success rate.`,
      }
    }

    // Guild/Contract Errors (Package 6)
    case "CONTRACT_NOT_FOUND": {
      const contractId = (context?.contractId as string) ?? "contract"
      return {
        message: `Contract not found: ${contractId}`,
        reason: "Contract does not exist",
        hint: "Check available contracts at guild halls or verify the contract ID.",
      }
    }

    case "ALREADY_HAS_CONTRACT": {
      const contractId = (context?.contractId as string) ?? "contract"
      return {
        message: `Already have contract`,
        reason: `Already accepted contract: ${contractId}`,
        hint: "Complete or abandon your current contract before accepting a new one.",
      }
    }

    case "ALREADY_ENROLLED": {
      const skill = (context?.skill as string) ?? "guild"
      const currentLevel = (context?.currentLevel as number) ?? 1
      return {
        message: `Already enrolled in ${skill} Guild`,
        reason: `Already a member (level ${currentLevel})`,
        hint: "You are already a guild member. Complete contracts to gain reputation and level up.",
      }
    }

    case "NOT_IN_EXPLORATION_GUILD": {
      return {
        message: `Not in Exploration Guild`,
        reason: "Must be enrolled in Exploration Guild",
        hint: "Visit the Exploration Guild and use the 'Enrol' action to join.",
      }
    }

    case "WRONG_GUILD_TYPE": {
      const requiredGuild = (context?.requiredGuildType as string) ?? "correct guild"
      const currentGuild = (context?.currentGuildType as string) ?? undefined
      const reason = currentGuild
        ? `Need ${requiredGuild} Guild, currently at ${currentGuild} Guild`
        : `Need ${requiredGuild} Guild`

      return {
        message: `Wrong guild type`,
        reason,
        hint: `Travel to the ${requiredGuild} Guild Hall to craft this recipe.`,
      }
    }

    case "GUILD_LEVEL_TOO_LOW": {
      const requiredLevel = (context?.requiredLevel as number) ?? 0
      const currentLevel = (context?.currentLevel as number) ?? 0
      const guildType = (context?.guildType as string) ?? "guild"

      // Determine if this is for a contract or recipe
      const isContract = context?.contractId !== undefined
      const itemType = isContract ? "contract" : "recipe"

      return {
        message: `Cannot accept ${itemType}`,
        reason: `Guild level too low (have ${currentLevel}, need ${requiredLevel})`,
        hint: `Complete more ${guildType} Guild contracts to increase reputation and unlock higher level content.`,
      }
    }

    // Combat Errors (Package 5)
    case "COMBAT_FAILURE": {
      const enemyType = (context?.enemyType as string) ?? "enemy"
      const weaponUsed = (context?.weaponUsed as string) ?? "weapon"
      const skillLevel = (context?.combatSkillLevel as number) ?? 1

      // Format enemy type for display
      const formattedEnemy = enemyType.charAt(0).toUpperCase() + enemyType.slice(1)

      return {
        message: "Combat failed",
        reason: `Defeated by ${formattedEnemy}`,
        hint: `Equip a stronger weapon or improve your Combat skill (current: ${skillLevel}). ${weaponUsed === "CRUDE_WEAPON" ? "Try crafting an IMPROVED_WEAPON at the Smithing Guild." : "Consider training more before attempting this fight."}`,
      }
    }

    case "ENEMY_NOT_FOUND": {
      if (reason === "enemies_not_implemented") {
        // At a mob camp, but combat system not implemented yet
        const creatureType = (context?.creatureType as string) ?? "creature"
        return {
          message: "Enemy not found",
          reason: `Combat system not yet implemented`,
          hint: `The ${creatureType} camp is here, but combat functionality is still being developed.`,
        }
      } else if (reason === "not_at_mob_camp") {
        // Not at a mob camp at all
        return {
          message: "No enemy here",
          reason: "Must be at a mob camp to fight",
          hint: "Use 'explore' to discover mob camps in your area, then 'go <camp>' to travel there.",
        }
      } else {
        // Unknown reason
        return {
          message: "Enemy not found",
          reason: "No enemy at current location",
          hint: "Travel to a mob camp to engage in combat. Use 'explore' to discover locations.",
        }
      }
    }

    // Location/Mode Errors (Package 8)
    case "WRONG_LOCATION": {
      if (reason === "must_be_at_contract_location") {
        const requiredLocationId = (context?.requiredLocationId as string) ?? "contract location"
        return {
          message: `Cannot accept contract`,
          reason: `Must be at ${requiredLocationId} to accept this contract`,
          hint: `Travel to ${requiredLocationId} first using 'go <location>'.`,
        }
      }

      if (reason === "wrong_area") {
        const requiredAreaId = (context?.requiredAreaId as string) ?? "required area"
        return {
          message: `Wrong area`,
          reason: `Must be in ${requiredAreaId} to perform this action`,
          hint: `Travel to ${requiredAreaId} first.`,
        }
      }

      if (reason === "must_be_at_warehouse") {
        return {
          message: `Cannot store items`,
          reason: "Must be at warehouse location",
          hint: "Use 'go <warehouse>' to travel to the warehouse, then try storing again.",
        }
      }

      if (reason === "must_be_at_guild_hall") {
        return {
          message: `Cannot enrol`,
          reason: "Must be at a guild hall location",
          hint: "Travel to a guild hall (miners, foresters, or combat guild) to enrol.",
        }
      }

      if (reason === "must_be_at_combat_guild") {
        const requiredLocationId = (context?.requiredLocationId as string) ?? "Combat Guild"
        return {
          message: `Cannot turn in combat token`,
          reason: `Must be at ${requiredLocationId}`,
          hint: `Travel to the ${requiredLocationId} first.`,
        }
      }

      // Generic fallback
      return {
        message: `Wrong location`,
        reason: reason ?? "Not at required location",
        hint: "Check where you need to be and travel there first.",
      }
    }

    case "MODE_NOT_UNLOCKED": {
      const mode = (context?.mode as string) ?? "mode"
      const currentLevel = (context?.currentSkillLevel as number) ?? 0
      const nextMode = (context?.nextMode as string) ?? null
      const nextLevel = (context?.nextModeLevel as number) ?? null

      let hint = "Continue gathering to level up your skill and unlock more modes."
      if (nextMode && nextLevel) {
        hint = `Reach level ${nextLevel} to unlock ${nextMode} mode. Continue gathering to level up.`
      }

      return {
        message: `Cannot use ${mode} mode`,
        reason: `${mode} mode not unlocked at skill level ${currentLevel}`,
        hint,
      }
    }

    case "ITEM_NOT_FOUND": {
      const itemId = (context?.itemId as string) ?? "item"
      const actionType = (context?.actionType as string) ?? "this action"
      return {
        message: `Item not found: ${itemId}`,
        reason: "Item not in inventory",
        hint: `You need ${itemId} in your inventory to ${actionType === "Store" ? "store" : "drop"} it. Check your inventory.`,
      }
    }

    // Other failure types - use generic messages for now
    default:
      return {
        message: getGenericFailureMessage(type),
        reason: reason,
        hint: "More specific hints will be added in later packages",
      }
  }
}

/**
 * Get a generic failure message for a failure type
 * This is a fallback when no specific hint is available
 */
function getGenericFailureMessage(failureType: string): string {
  switch (failureType) {
    case "INSUFFICIENT_SKILL":
      return "Insufficient skill"
    case "WRONG_LOCATION":
      return "Wrong location"
    case "MISSING_ITEMS":
      return "Missing required items"
    case "INVENTORY_FULL":
      return "Inventory full"
    case "GATHER_FAILURE":
      return "Failed to gather"
    case "COMBAT_FAILURE":
      return "Combat failed"
    case "CONTRACT_NOT_FOUND":
      return "Contract not found"
    case "ALREADY_HAS_CONTRACT":
      return "Already have a contract"
    case "NODE_NOT_FOUND":
      return "Resource node not found"
    case "ENEMY_NOT_FOUND":
      return "Enemy not found"
    case "RECIPE_NOT_FOUND":
      return "Recipe not found"
    case "ITEM_NOT_FOUND":
      return "Item not found"
    case "ALREADY_ENROLLED":
      return "Already enrolled"
    case "MISSING_WEAPON":
      return "No weapon equipped"
    case "MISSING_FOCUS_MATERIAL":
      return "Missing focus material"
    case "NODE_DEPLETED":
      return "Resource depleted"
    case "MODE_NOT_UNLOCKED":
      return "Mode not unlocked"
    case "AREA_NOT_FOUND":
      return "Area not found"
    case "AREA_NOT_KNOWN":
      return "Area not known"
    case "NO_PATH_TO_DESTINATION":
      return "No path to destination"
    case "ALREADY_IN_AREA":
      return "Already in that area"
    case "NO_UNDISCOVERED_AREAS":
      return "No undiscovered areas"
    case "AREA_FULLY_EXPLORED":
      return "Area fully explored"
    case "NOT_IN_EXPLORATION_GUILD":
      return "Not in Exploration Guild"
    case "NO_CONNECTIONS":
      return "No connections from here"
    case "LOCATION_NOT_DISCOVERED":
      return "Location not discovered"
    case "UNKNOWN_LOCATION":
      return "Unknown location"
    case "ALREADY_AT_LOCATION":
      return "Already at that location"
    case "NOT_AT_HUB":
      return "Not at hub"
    case "ALREADY_AT_HUB":
      return "Already at hub"
    case "NOT_AT_NODE_LOCATION":
      return "Not at resource node"
    case "WRONG_GUILD_TYPE":
      return "Wrong guild type"
    case "GUILD_LEVEL_TOO_LOW":
      return "Guild level too low"
    default:
      return `Failed: ${failureType}`
  }
}
