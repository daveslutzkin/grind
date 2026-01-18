/**
 * Resolution module - converts raw user input strings to specific IDs
 * This module centralizes all destination/target resolution logic that was previously
 * scattered across parsers (REPL and agent).
 */

import type { WorldState, ExplorationLocation, GatheringSkillID } from "./types.js"
import { ExplorationLocationType } from "./types.js"
import { LOCATION_DISPLAY_NAMES } from "./world.js"
import { getAreaDisplayName } from "./exploration.js"

/**
 * Result of destination resolution
 */
export interface ResolvedDestination {
  type: "location" | "area" | "farTravel" | "notFound"
  locationId?: string
  areaId?: string
  reason?: string
}

/**
 * Normalize a name for comparison by removing punctuation (apostrophes, periods, etc.)
 * and converting underscores to spaces for flexible matching
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/_/g, " ") // Convert underscores to spaces
    .replace(/[^\w\s-]/g, "") // Remove punctuation
}

/**
 * Convert a name to a slug for use in commands.
 * For example: "Rocky Clearing" -> "rocky-clearing"
 */
export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove punctuation
    .trim()
    .replace(/\s+/g, "-") // Convert spaces to dashes
}

/**
 * Constants for gathering node aliases
 */
export const GATHERING_NODE_ALIASES: Record<string, GatheringSkillID> = {
  ore: "Mining",
  "ore vein": "Mining",
  mining: "Mining",
  mine: "Mining",
  tree: "Woodcutting",
  "tree stand": "Woodcutting",
  woodcutting: "Woodcutting",
  chop: "Woodcutting",
}

/**
 * Constants for enemy camp aliases
 */
export const ENEMY_CAMP_ALIASES = ["enemy camp", "camp", "mob camp"]

/**
 * Resolve a raw destination string to a specific location or area
 * Resolution order (most specific to least specific):
 * 1. Gathering node aliases ("ore", "ore vein", "mining", "mine", "tree", "tree stand", "woodcutting", "chop")
 * 2. Enemy camp aliases ("camp", "enemy camp", "mob camp")
 * 3. LOCATION_DISPLAY_NAMES (fuzzy match)
 * 4. Known area names (exact match, then prefix match)
 * 5. Raw area IDs
 * 6. Return notFound
 *
 * @param state - Current world state
 * @param input - Raw destination string from user
 * @param mode - "near" for adjacent areas only, "far" for all reachable areas
 * @returns Resolved destination with type and ID
 */
export function resolveDestination(
  state: WorldState,
  input: string,
  mode: "near" | "far" = "near"
): ResolvedDestination {
  const inputLower = input.toLowerCase().trim()
  const normalizedInput = normalizeName(input)

  // 1. Check for gathering node aliases
  if (inputLower in GATHERING_NODE_ALIASES) {
    const skillType = GATHERING_NODE_ALIASES[inputLower]
    const locationId = findGatheringNodeLocation(state, skillType)
    if (locationId) {
      return { type: "location", locationId }
    }
    return {
      type: "notFound",
      reason: `No ${skillType} node found in current area`,
    }
  }

  // 2. Check for enemy camp aliases
  const enemyCampAlias = ENEMY_CAMP_ALIASES.find((alias) => inputLower.startsWith(alias))
  if (enemyCampAlias) {
    // Extract optional index (e.g., "enemy camp 2" -> index 2)
    const remainder = inputLower.slice(enemyCampAlias.length).trim()
    const index = remainder ? parseInt(remainder, 10) : 1

    const locationId = findEnemyCampLocation(state, index)
    if (locationId) {
      return { type: "location", locationId }
    }
    return {
      type: "notFound",
      reason:
        index > 1
          ? `No enemy camp ${index} found in current area`
          : "No enemy camps found in current area",
    }
  }

  // 3. Check LOCATION_DISPLAY_NAMES (fuzzy match - check if input contains display name)
  const matchedLocation = Object.entries(LOCATION_DISPLAY_NAMES).find(([, displayName]) => {
    const normalizedDisplayName = normalizeName(displayName)
    // Match if input contains display name or display name contains input
    return (
      normalizedInput.includes(normalizedDisplayName) ||
      normalizedDisplayName.includes(normalizedInput)
    )
  })
  if (matchedLocation) {
    return { type: "location", locationId: matchedLocation[0] }
  }

  // 4. Check known area names (exact and prefix matches)
  const areaMatch = matchAreaByName(state, input, mode)
  if (areaMatch) {
    // If mode is "far", use farTravel type
    if (mode === "far") {
      return { type: "farTravel", areaId: areaMatch }
    }
    return { type: "area", areaId: areaMatch }
  }

  // 5. Not found
  return {
    type: "notFound",
    reason: `Unknown destination: "${input}"`,
  }
}

/**
 * Find a gathering node location in the current area by skill type
 * @returns locationId if found, null otherwise
 */
function findGatheringNodeLocation(state: WorldState, skillType: GatheringSkillID): string | null {
  const currentAreaId = state.exploration.playerState.currentAreaId
  const area = state.exploration.areas.get(currentAreaId)
  const knownLocationIds = new Set(state.exploration.playerState.knownLocationIds)

  if (!area) return null

  const matchingLocation = area.locations.find(
    (loc: ExplorationLocation) =>
      loc.type === ExplorationLocationType.GATHERING_NODE &&
      loc.gatheringSkillType === skillType &&
      knownLocationIds.has(loc.id)
  )

  return matchingLocation?.id ?? null
}

/**
 * Find an enemy camp location in the current area by index (1-based)
 * @returns locationId if found, null otherwise
 */
function findEnemyCampLocation(state: WorldState, index: number): string | null {
  const currentAreaId = state.exploration.playerState.currentAreaId
  const area = state.exploration.areas.get(currentAreaId)
  const knownLocationIds = new Set(state.exploration.playerState.knownLocationIds)

  if (!area) return null

  const mobCampLocations = area.locations.filter(
    (loc: ExplorationLocation) =>
      loc.type === ExplorationLocationType.MOB_CAMP && knownLocationIds.has(loc.id)
  )

  if (mobCampLocations.length === 0) {
    return null
  }

  if (isNaN(index) || index < 1 || index > mobCampLocations.length) {
    return null
  }

  return mobCampLocations[index - 1].id
}

/**
 * Match an area name to an area ID
 * @param state - Current world state
 * @param input - Raw area name/ID from user
 * @param mode - "near" for adjacent areas only, "far" for all known areas
 * @returns areaId if found, null otherwise
 */
function matchAreaByName(state: WorldState, input: string, mode: "near" | "far"): string | null {
  const inputLower = input.toLowerCase().trim()
  const normalizedInput = normalizeName(input)
  const inputWithDashes = inputLower.replace(/\s+/g, "-")

  // Determine which areas to search
  let searchAreaIds: string[]
  if (mode === "far") {
    // Far travel: search all known areas
    searchAreaIds = state.exploration.playerState.knownAreaIds
  } else {
    // Near travel: search only adjacent areas
    const currentArea = state.exploration.playerState.currentAreaId
    const reachableAreas = new Set([currentArea])

    // Add all areas connected via known connections
    for (const connId of state.exploration.playerState.knownConnectionIds) {
      const [from, to] = connId.split("->")
      if (from === currentArea) reachableAreas.add(to)
      if (to === currentArea) reachableAreas.add(from)
    }

    searchAreaIds = Array.from(reachableAreas)
  }

  // Collect exact and prefix matches
  const exactMatches: string[] = []
  const prefixMatches: string[] = []

  for (const areaId of searchAreaIds) {
    const area = state.exploration.areas.get(areaId)

    // Match against area name (LLM-generated if available)
    if (area?.name) {
      const normalizedAreaName = normalizeName(area.name)
      if (normalizedAreaName === normalizedInput) {
        exactMatches.push(areaId)
      } else if (normalizedAreaName.startsWith(normalizedInput)) {
        prefixMatches.push(areaId)
      }
    } else {
      // Match against fallback display name (e.g., "a nearby area", "a distant area")
      const fallbackName = getAreaDisplayName(areaId, area)
      const normalizedFallback = normalizeName(fallbackName)
      if (normalizedFallback === normalizedInput) {
        exactMatches.push(areaId)
      }
    }

    // Match against raw area ID
    if (areaId.toLowerCase() === inputLower || areaId.toLowerCase() === inputWithDashes) {
      if (!exactMatches.includes(areaId)) exactMatches.push(areaId)
    } else if (
      areaId.toLowerCase().startsWith(inputLower) ||
      areaId.toLowerCase().startsWith(inputWithDashes)
    ) {
      if (!prefixMatches.includes(areaId)) prefixMatches.push(areaId)
    }
  }

  // Prefer exact matches, then unique prefix matches
  if (exactMatches.length === 1) {
    return exactMatches[0]
  }
  if (exactMatches.length === 0 && prefixMatches.length === 1) {
    return prefixMatches[0]
  }

  // If multiple matches, don't guess - return null
  return null
}
