// Hint generation for structured failure messages

import type { FailureDetails, WorldState } from "./types.js"

export interface FormattedFailure {
  message: string // What failed
  reason?: string // Why
  hint?: string // Remediation
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
export function generateFailureHint(details: FailureDetails, _state: WorldState): FormattedFailure {
  // Stub implementation - returns generic messages
  // Will be populated with specific hints in subsequent packages

  const { type, reason } = details

  // For now, just return a generic message based on the failure type
  // This will be replaced with context-aware hints in later packages
  return {
    message: getGenericFailureMessage(type),
    reason: reason,
    hint: "More specific hints will be added in later packages",
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
