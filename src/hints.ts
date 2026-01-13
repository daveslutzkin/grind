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
