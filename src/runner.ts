/**
 * Shared runner module for REPL and batch execution
 * Contains common types, command parsing, display formatting, and statistics
 */

import type {
  Action,
  ActionLog,
  WorldState,
  SkillID,
  SkillState,
  ExplorationLocation,
  AreaID,
} from "./types.js"
import {
  getTotalXP,
  getCurrentAreaId,
  getCurrentLocationId,
  GatherMode,
  ExplorationLocationType,
} from "./types.js"
import { LOCATION_DISPLAY_NAMES, getSkillForGuildLocation } from "./world.js"
import { getReachableAreas, getAreaDisplayName, BASE_TRAVEL_TIME } from "./exploration.js"
import { formatWorldState, formatActionLog } from "./agent/formatters.js"

// Re-export agent formatters for unified display
export { formatWorldState, formatActionLog }

// ============================================================================
// Types
// ============================================================================

export interface SessionStats {
  logs: ActionLog[]
  startingSkills: Record<SkillID, SkillState>
  totalSession: number
  sessionStartLogIndex: number // Index where current session starts in logs array
}

export interface RngStream {
  name: string
  trials: number
  probability: number
  successes: number
}

// ============================================================================
// Command Parsing
// ============================================================================

export type EnrolSkill = "Exploration" | "Mining" | "Woodcutting" | "Combat" | "Smithing"

const SKILL_MAP: Record<string, EnrolSkill> = {
  exploration: "Exploration",
  mining: "Mining",
  woodcutting: "Woodcutting",
  combat: "Combat",
  smithing: "Smithing",
}

export interface ParseContext {
  /** Known area IDs for area name matching (optional) */
  knownAreaIds?: string[]
  /** Current location ID for context-aware commands (optional) */
  currentLocationId?: string | null
  /** Whether to log parse errors to console */
  logErrors?: boolean
  /** Full world state for context-aware command resolution (optional) */
  state?: WorldState
}

/**
 * Parse a command string into an Action.
 * Supports: move, gather (with modes), fight, craft, store, drop, accept, enrol/enroll, explore, survey
 */
export function parseAction(input: string, context: ParseContext = {}): Action | null {
  const parts = input.trim().toLowerCase().split(/\s+/)
  const cmd = parts[0]

  switch (cmd) {
    case "gather": {
      // Check if first argument is a mode (not a nodeId) - allows omitting nodeId when at a node
      const firstArg = parts[1]?.toLowerCase()
      const possibleModes = ["focus", "careful", "appraise"]
      const isFirstArgMode = possibleModes.includes(firstArg || "")

      let nodeId: string | undefined
      let modeName: string | undefined
      let materialIndex = 3

      if (isFirstArgMode) {
        // Usage: gather <mode> [material] - infer nodeId from current location
        modeName = firstArg
        materialIndex = 2

        // Try to infer nodeId from current location
        const currentLocationId = context.currentLocationId
        if (currentLocationId && context.state) {
          const match = currentLocationId.match(/^(.+?)-(TREE_STAND|ORE_VEIN)-loc-(\d+)$/)
          if (match) {
            const [, areaId, , locIndex] = match
            nodeId = `${areaId}-node-${locIndex}`
          }
        }

        if (!nodeId) {
          if (context.logErrors) {
            console.log("You must be at a gathering node to use 'gather <mode>'.")
            console.log("Usage: gather <node> <mode> [material]")
            console.log("  Or use 'mine <mode>' or 'chop <mode>' as shortcuts")
          }
          return null
        }
      } else {
        // Usage: gather <node> <mode> [material]
        nodeId = parts[1]
        modeName = parts[2]?.toLowerCase()
      }

      if (!nodeId || !modeName) {
        if (context.logErrors) {
          console.log("Usage: gather <node> <mode> [material]")
          console.log("  Or: gather <mode> [material] (when at a gathering node)")
          console.log("  Modes: focus <material>, careful, appraise")
        }
        return null
      }

      if (modeName === "focus") {
        const focusMaterial = parts[materialIndex]?.toUpperCase()
        if (!focusMaterial) {
          if (context.logErrors) {
            console.log("FOCUS mode requires a material: gather focus <material>")
          }
          return null
        }
        return { type: "Gather", nodeId, mode: GatherMode.FOCUS, focusMaterialId: focusMaterial }
      } else if (modeName === "careful") {
        return { type: "Gather", nodeId, mode: GatherMode.CAREFUL_ALL }
      } else if (modeName === "appraise") {
        return { type: "Gather", nodeId, mode: GatherMode.APPRAISE }
      } else {
        if (context.logErrors) {
          console.log("Invalid gather mode. Use: focus, careful, or appraise")
        }
        return null
      }
    }

    case "mine": {
      // Alias for gather mining - finds ore vein in current area
      const modeName = parts[1]?.toLowerCase()

      if (!modeName) {
        if (context.logErrors) {
          console.log("Usage: mine <mode> [material]")
          console.log("  Modes: focus <material>, careful, appraise")
        }
        return null
      }

      if (modeName === "focus") {
        const focusMaterial = parts[2]?.toUpperCase()
        if (!focusMaterial) {
          if (context.logErrors) {
            console.log("FOCUS mode requires a material: mine focus <material>")
          }
          return null
        }
        return { type: "Mine", mode: GatherMode.FOCUS, focusMaterialId: focusMaterial }
      } else if (modeName === "careful") {
        return { type: "Mine", mode: GatherMode.CAREFUL_ALL }
      } else if (modeName === "appraise") {
        return { type: "Mine", mode: GatherMode.APPRAISE }
      } else {
        if (context.logErrors) {
          console.log("Invalid mine mode. Use: focus, careful, or appraise")
        }
        return null
      }
    }

    case "chop": {
      // Alias for gather woodcutting - finds tree stand in current area
      const modeName = parts[1]?.toLowerCase()

      if (!modeName) {
        if (context.logErrors) {
          console.log("Usage: chop <mode> [material]")
          console.log("  Modes: focus <material>, careful, appraise")
        }
        return null
      }

      if (modeName === "focus") {
        const focusMaterial = parts[2]?.toUpperCase()
        if (!focusMaterial) {
          if (context.logErrors) {
            console.log("FOCUS mode requires a material: chop focus <material>")
          }
          return null
        }
        return { type: "Chop", mode: GatherMode.FOCUS, focusMaterialId: focusMaterial }
      } else if (modeName === "careful") {
        return { type: "Chop", mode: GatherMode.CAREFUL_ALL }
      } else if (modeName === "appraise") {
        return { type: "Chop", mode: GatherMode.APPRAISE }
      } else {
        if (context.logErrors) {
          console.log("Invalid chop mode. Use: focus, careful, or appraise")
        }
        return null
      }
    }

    case "explore": {
      // Discover locations (nodes) in the current area
      return { type: "Explore" }
    }

    case "survey": {
      // Discover new areas (connections)
      return { type: "Survey" }
    }

    case "fartravel":
    case "far": {
      // Far travel - multi-hop travel to any known reachable area
      const inputName = parts.slice(1).join(" ").toLowerCase()
      if (!inputName) {
        // No destination - this will be handled as a meta command to show the list
        return null
      }

      // Match against known area names (case-insensitive, prefix match)
      if (context.state?.exploration) {
        const knownAreaIds = context.state.exploration.playerState.knownAreaIds
        const inputWithDashes = inputName.replace(/\s+/g, "-")

        // Collect all matching areas
        const exactMatches: string[] = []
        const prefixMatches: string[] = []

        for (const areaId of knownAreaIds) {
          const area = context.state.exploration.areas.get(areaId)
          if (area?.name) {
            const areaNameLower = area.name.toLowerCase()
            if (areaNameLower === inputName) {
              exactMatches.push(areaId)
            } else if (areaNameLower.startsWith(inputName)) {
              prefixMatches.push(areaId)
            }
          }
          // Also check raw area IDs
          if (areaId.toLowerCase() === inputName || areaId.toLowerCase() === inputWithDashes) {
            if (!exactMatches.includes(areaId)) exactMatches.push(areaId)
          } else if (
            areaId.toLowerCase().startsWith(inputName) ||
            areaId.toLowerCase().startsWith(inputWithDashes)
          ) {
            if (!prefixMatches.includes(areaId)) prefixMatches.push(areaId)
          }
        }

        // Prefer exact matches, then unique prefix matches
        if (exactMatches.length === 1) {
          return { type: "FarTravel", destinationAreaId: exactMatches[0] }
        }
        if (exactMatches.length === 0 && prefixMatches.length === 1) {
          return { type: "FarTravel", destinationAreaId: prefixMatches[0] }
        }
        if (exactMatches.length > 1 || prefixMatches.length > 1) {
          if (context.logErrors) {
            console.log("Ambiguous destination - be more specific")
          }
          return null
        }
      }

      if (context.logErrors) {
        console.log("Unknown destination. Use 'fartravel' to see all reachable areas.")
      }
      return null
    }

    case "fight": {
      const enemyId = parts[1]
      if (!enemyId) {
        if (context.logErrors) console.log("Usage: fight <enemy-id>")
        return null
      }
      return { type: "Fight", enemyId }
    }

    case "craft": {
      const recipeId = parts[1]
      if (!recipeId) {
        if (context.logErrors) console.log("Usage: craft <recipe-id>")
        return null
      }
      return { type: "Craft", recipeId }
    }

    case "store": {
      const storeItem = parts[1]?.toUpperCase()
      const storeQty = parseInt(parts[2] || "1", 10)
      if (!storeItem) {
        if (context.logErrors) console.log("Usage: store <item-id> [quantity]")
        return null
      }
      return { type: "Store", itemId: storeItem, quantity: storeQty }
    }

    case "drop": {
      const dropItem = parts[1]?.toUpperCase()
      const dropQty = parseInt(parts[2] || "1", 10)
      if (!dropItem) {
        if (context.logErrors) console.log("Usage: drop <item-id> [quantity]")
        return null
      }
      return { type: "Drop", itemId: dropItem, quantity: dropQty }
    }

    case "accept": {
      const contractId = parts[1]
      if (!contractId) {
        if (context.logErrors) console.log("Usage: accept <contract-id>")
        return null
      }
      return { type: "AcceptContract", contractId }
    }

    case "enrol":
    case "enroll": {
      const skillName = parts[1]
      if (!skillName) {
        // Auto-detect skill from current guild hall location
        const guildSkill = getSkillForGuildLocation(context.currentLocationId ?? null)
        if (guildSkill) {
          return { type: "Enrol", skill: guildSkill }
        }
        if (context.logErrors) {
          console.log("Usage: enrol <skill>  (Exploration, Mining, Woodcutting, Combat, Smithing)")
        }
        return null
      }
      const skill = SKILL_MAP[skillName.toLowerCase()]
      if (!skill) {
        if (context.logErrors) {
          console.log("Invalid skill. Choose: Exploration, Mining, Woodcutting, Combat, Smithing")
        }
        return null
      }
      return { type: "Enrol", skill }
    }

    case "goto":
    case "go":
    case "move":
    case "travel": {
      // Unified travel command - works for both locations and areas
      const inputName = parts.slice(1).join(" ").toLowerCase()
      if (!inputName) {
        if (context.logErrors) console.log("Usage: goto <destination>  (location or area)")
        return null
      }

      // First, check for gathering node types (move ore vein, move mining, etc.)
      // Resolve to the actual location in the current area
      const oreVeinAliases = ["ore vein", "ore", "mining", "mine"]
      const treeStandAliases = ["tree stand", "tree", "woodcutting", "chop"]
      if (oreVeinAliases.includes(inputName) || treeStandAliases.includes(inputName)) {
        const skillType = oreVeinAliases.includes(inputName) ? "Mining" : "Woodcutting"
        const currentAreaId = context.state?.exploration.playerState.currentAreaId
        const area = context.state?.exploration.areas.get(currentAreaId ?? "")
        const knownLocationIds = new Set(
          context.state?.exploration.playerState.knownLocationIds ?? []
        )
        const matchingLocation = area?.locations.find(
          (loc: ExplorationLocation) =>
            loc.type === ExplorationLocationType.GATHERING_NODE &&
            loc.gatheringSkillType === skillType &&
            knownLocationIds.has(loc.id)
        )
        if (matchingLocation) {
          return { type: "TravelToLocation", locationId: matchingLocation.id }
        }
        // No matching location found - let it fail at execution time with proper error
        if (context.logErrors) {
          console.log(`No discovered ${skillType.toLowerCase()} location in current area`)
        }
        return null
      }

      // Check for enemy camp aliases (camp, enemy camp, mob camp)
      const enemyCampAliases = ["enemy camp", "camp", "mob camp"]
      const baseAlias = enemyCampAliases.find((alias) => inputName.startsWith(alias))
      if (baseAlias) {
        // Extract optional index (e.g., "enemy camp 2" -> index 2)
        const remainder = inputName.slice(baseAlias.length).trim()
        const index = remainder ? parseInt(remainder, 10) : 1

        const currentAreaId = context.state?.exploration.playerState.currentAreaId
        const area = context.state?.exploration.areas.get(currentAreaId ?? "")
        const knownLocationIds = new Set(
          context.state?.exploration.playerState.knownLocationIds ?? []
        )
        const mobCampLocations =
          area?.locations.filter(
            (loc: ExplorationLocation) =>
              loc.type === ExplorationLocationType.MOB_CAMP && knownLocationIds.has(loc.id)
          ) ?? []

        if (mobCampLocations.length === 0) {
          if (context.logErrors) {
            console.log("No discovered enemy camps in current area")
          }
          return null
        }

        if (isNaN(index) || index < 1 || index > mobCampLocations.length) {
          if (context.logErrors) {
            console.log(`Invalid camp index. Found ${mobCampLocations.length} enemy camp(s).`)
          }
          return null
        }

        return { type: "TravelToLocation", locationId: mobCampLocations[index - 1].id }
      }

      // Next, try to match against location display names (case-insensitive, partial match)
      const matchedLocation = Object.entries(LOCATION_DISPLAY_NAMES).find(([, displayName]) =>
        displayName.toLowerCase().includes(inputName)
      )
      if (matchedLocation) {
        return { type: "TravelToLocation", locationId: matchedLocation[0] }
      }

      // Next, check if it matches a known area (for inter-area travel)
      // Match against both raw area IDs and human-readable area names
      if (context.knownAreaIds && context.state?.exploration) {
        const inputWithDashes = inputName.replace(/\s+/g, "-")

        // Collect all matching areas (both exact and prefix matches)
        const exactMatches: string[] = []
        const prefixMatches: string[] = []

        for (const areaId of context.knownAreaIds) {
          const area = context.state.exploration.areas.get(areaId)
          if (area?.name) {
            const areaNameLower = area.name.toLowerCase()
            if (areaNameLower === inputName) {
              exactMatches.push(areaId)
            } else if (areaNameLower.startsWith(inputName)) {
              prefixMatches.push(areaId)
            }
          }
        }

        // Prefer exact matches, then unique prefix matches
        // If ambiguous (multiple prefix matches), fail to let user be more specific
        if (exactMatches.length === 1) {
          return { type: "ExplorationTravel", destinationAreaId: exactMatches[0] }
        }
        if (exactMatches.length === 0 && prefixMatches.length === 1) {
          return { type: "ExplorationTravel", destinationAreaId: prefixMatches[0] }
        }
        // If multiple matches, don't return - let it fall through to fail

        // Fall back to matching raw area IDs (same logic: prefer exact, then unique prefix)
        const exactIdMatches = context.knownAreaIds.filter(
          (a) => a.toLowerCase() === inputName || a.toLowerCase() === inputWithDashes
        )
        const prefixIdMatches = context.knownAreaIds.filter(
          (a) =>
            (a.toLowerCase().startsWith(inputName) ||
              a.toLowerCase().startsWith(inputWithDashes)) &&
            a.toLowerCase() !== inputName &&
            a.toLowerCase() !== inputWithDashes
        )

        if (exactIdMatches.length === 1) {
          return { type: "ExplorationTravel", destinationAreaId: exactIdMatches[0] }
        }
        if (exactIdMatches.length === 0 && prefixIdMatches.length === 1) {
          return { type: "ExplorationTravel", destinationAreaId: prefixIdMatches[0] }
        }
      }

      // Fall back: try as location ID (uppercase with underscores)
      const locationId = parts.slice(1).join("_").toUpperCase()
      return { type: "TravelToLocation", locationId }
    }

    case "leave": {
      // Leave current location, return to hub
      return { type: "Leave" }
    }

    default:
      return null
  }
}

// ============================================================================
// Display Formatting
// ============================================================================

function makePadInner(width: number): (s: string) => string {
  return (s: string) => "│ " + s.padEnd(width - 4) + " │"
}

/**
 * Print a text-based map of known areas and connections
 */
export function printMap(state: WorldState): void {
  const exploration = state.exploration
  const currentAreaId = exploration.playerState.currentAreaId
  const knownAreaIds = exploration.playerState.knownAreaIds
  const knownConnectionIds = new Set(exploration.playerState.knownConnectionIds)

  // Group areas by distance
  const areasByDistance = new Map<number, AreaID[]>()
  for (const areaId of knownAreaIds) {
    const area = exploration.areas.get(areaId)
    if (area) {
      const distance = area.distance
      if (!areasByDistance.has(distance)) {
        areasByDistance.set(distance, [])
      }
      areasByDistance.get(distance)!.push(areaId)
    }
  }

  // Sort distances
  const distances = Array.from(areasByDistance.keys()).sort((a, b) => a - b)

  console.log("\n┌─────────────────────────────────────────────────────────────┐")
  console.log("│ EXPLORATION MAP                                             │")
  console.log("├─────────────────────────────────────────────────────────────┤")

  for (const distance of distances) {
    const areas = areasByDistance.get(distance)!
    const distanceLabel = distance === 0 ? "Town" : `Distance ${distance}`
    console.log(`│                                                             │`)
    console.log(`│ ${distanceLabel}:`.padEnd(62) + "│")

    for (const areaId of areas) {
      const area = exploration.areas.get(areaId)
      const displayName = getAreaDisplayName(areaId, area)
      const isCurrent = areaId === currentAreaId
      const marker = isCurrent ? "→" : " "

      console.log(`│ ${marker} ${displayName}`.padEnd(62) + "│")

      // Find all connections from this area
      const connections: Array<{ targetId: AreaID; travelTime: number }> = []
      for (const conn of exploration.connections) {
        const isKnown =
          knownConnectionIds.has(createConnectionId(conn.fromAreaId, conn.toAreaId)) ||
          knownConnectionIds.has(createConnectionId(conn.toAreaId, conn.fromAreaId))

        if (!isKnown) continue

        let targetId: AreaID | null = null
        if (conn.fromAreaId === areaId && knownAreaIds.includes(conn.toAreaId)) {
          targetId = conn.toAreaId
        } else if (conn.toAreaId === areaId && knownAreaIds.includes(conn.fromAreaId)) {
          targetId = conn.fromAreaId
        }

        if (targetId) {
          const travelTime = Math.round(BASE_TRAVEL_TIME * conn.travelTimeMultiplier)
          connections.push({ targetId, travelTime })
        }
      }

      // Sort connections by travel time
      connections.sort((a, b) => a.travelTime - b.travelTime)

      // Display connections
      for (let i = 0; i < connections.length; i++) {
        const { targetId, travelTime } = connections[i]
        const targetArea = exploration.areas.get(targetId)
        const targetDisplayName = getAreaDisplayName(targetId, targetArea)
        const isLast = i === connections.length - 1
        const prefix = isLast ? "└─" : "├─"

        const connLine = `   ${prefix} ${targetDisplayName} (${travelTime}t)`
        console.log(`│ ${connLine}`.padEnd(62) + "│")
      }
    }
  }

  console.log("│                                                             │")
  console.log("│ Legend: → Current location  (Xt) Travel time in ticks      │")
  console.log("└─────────────────────────────────────────────────────────────┘")
}

/**
 * Helper to create connection ID (imported from exploration module logic)
 */
function createConnectionId(areaId1: AreaID, areaId2: AreaID): string {
  return `${areaId1}->${areaId2}`
}

/**
 * Print help with available actions and current location info
 * @param state - Current world state
 * @param options.showHints - Whether to show contextual hints (default: true)
 */
export function printHelp(state: WorldState, options?: { showHints?: boolean }): void {
  const showHints = options?.showHints ?? true

  console.log("\n┌─────────────────────────────────────────────────────────────┐")
  console.log("│ AVAILABLE ACTIONS                                           │")
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ enrol <skill>       - Enrol in guild (Exploration first!)   │")
  console.log("│ survey              - Discover new areas (connections)      │")
  console.log("│ goto <dest>         - Travel to directly connected area     │")
  console.log("│ fartravel [dest]    - Multi-hop travel to any known area    │")
  console.log("│ leave               - Leave location, return to hub         │")
  console.log("│ explore             - Discover nodes in current area        │")
  console.log("│ gather <node> focus <mat>  - Focus on one material          │")
  console.log("│ gather <node> careful      - Carefully extract all          │")
  console.log("│ gather <node> appraise     - Inspect node contents          │")
  console.log("│ mine <mode> [material]     - Mine ore vein (focus/careful)  │")
  console.log("│ chop <mode> [material]     - Chop tree stand (focus/careful)│")
  console.log("│ fight <enemy>       - Fight an enemy at current area        │")
  console.log("│ craft <recipe>      - Craft at guild hall                   │")
  console.log("│ store <item> <qty>  - Store items at warehouse              │")
  console.log("│ drop <item> <qty>   - Drop items                            │")
  console.log("│ accept <contract>   - Accept a contract at guild            │")
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ map                 - Show map of known areas/connections   │")
  console.log("│ state               - Show current world state              │")
  console.log("│ world               - Show world data (nodes, enemies, etc) │")
  console.log("│ help                - Show this help                        │")
  console.log("│ end                 - End session and show summary          │")
  console.log("│ quit                - Exit without summary                  │")
  console.log("└─────────────────────────────────────────────────────────────┘")

  if (!showHints) return

  // Show what's available at current location (context-sensitive hints)
  const currentAreaId = getCurrentAreaId(state)
  const currentLocationId = getCurrentLocationId(state)
  const area = state.exploration.areas.get(currentAreaId)
  const currentLocation = area?.locations.find((loc) => loc.id === currentLocationId)

  const nodes = state.world.nodes.filter((n) => n.areaId === currentAreaId)

  // Recipes only shown at guild halls of matching type
  const isAtGuildHall =
    currentLocation?.type === ExplorationLocationType.GUILD_HALL && currentLocation.guildType
  const recipes = isAtGuildHall
    ? state.world.recipes.filter((r) => r.guildType === currentLocation.guildType)
    : []

  // Contracts shown at their accept location
  const contracts = state.world.contracts.filter((c) => c.acceptLocationId === currentLocationId)

  // Only show hints section if there's something relevant
  const hasHints =
    nodes.length > 0 ||
    recipes.length > 0 ||
    contracts.length > 0 ||
    currentAreaId === state.world.storageAreaId

  if (hasHints) {
    console.log("\nAvailable here:")
    if (nodes.length > 0) console.log(`  Nodes: ${nodes.map((n) => n.nodeId).join(", ")}`)
    if (recipes.length > 0) console.log(`  Recipes: ${recipes.map((r) => r.id).join(", ")}`)
    if (contracts.length > 0) console.log(`  Contracts: ${contracts.map((c) => c.id).join(", ")}`)
    if (currentAreaId === state.world.storageAreaId) console.log(`  Storage available`)
  }
}

// ============================================================================
// Statistics & Luck
// ============================================================================

/**
 * Standard normal CDF approximation using error function
 */
export function normalCDF(z: number): number {
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.sqrt(2)

  const t = 1.0 / (1.0 + p * x)
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)

  return 0.5 * (1.0 + sign * y)
}

/**
 * Build RNG streams from action logs for luck calculation.
 * Groups rolls by type: combat, gather (by skill), and loot (by item).
 */
export function buildRngStreams(logs: ActionLog[]): RngStream[] {
  const streamMap: Map<string, { trials: number; probability: number; successes: number }> =
    new Map()

  for (const log of logs) {
    const nonLootRolls = log.rngRolls.filter((r) => !r.label.startsWith("loot:"))
    const lootRolls = log.rngRolls.filter((r) => r.label.startsWith("loot:"))

    for (const roll of nonLootRolls) {
      const streamName = roll.label
      let stream = streamMap.get(streamName)
      if (!stream) {
        stream = { trials: 0, probability: roll.probability, successes: 0 }
        streamMap.set(streamName, stream)
      }
      stream.trials++
      if (roll.result) stream.successes++
    }

    for (const roll of lootRolls) {
      const streamName = roll.label
      let stream = streamMap.get(streamName)
      if (!stream) {
        stream = { trials: 0, probability: roll.probability, successes: 0 }
        streamMap.set(streamName, stream)
      }
      stream.trials++
      if (roll.result) stream.successes++
    }
  }

  return Array.from(streamMap.entries()).map(([name, data]) => ({
    name,
    trials: data.trials,
    probability: data.probability,
    successes: data.successes,
  }))
}

/**
 * Compute luck using Stouffer's method for combining z-scores across RNG streams.
 */
export function computeLuckString(streams: RngStream[]): string {
  const validStreams = streams.filter((s) => s.trials > 0 && s.probability > 0 && s.probability < 1)

  if (validStreams.length === 0) return "N/A (no RNG actions)"

  const zScores: number[] = []
  for (const stream of validStreams) {
    const expected = stream.trials * stream.probability
    const variance = stream.trials * stream.probability * (1 - stream.probability)
    if (variance > 0) {
      const z = (stream.successes - expected) / Math.sqrt(variance)
      zScores.push(z)
    }
  }

  if (zScores.length === 0) return "N/A (no variance)"

  const zLuck = zScores.reduce((sum, z) => sum + z, 0) / Math.sqrt(zScores.length)
  const percentile = normalCDF(zLuck) * 100

  let label: string
  if (zLuck >= 1.5) {
    label = "very lucky"
  } else if (zLuck >= 0.5) {
    label = "lucky"
  } else if (zLuck <= -1.5) {
    label = "very unlucky"
  } else if (zLuck <= -0.5) {
    label = "unlucky"
  } else {
    label = "average"
  }

  const position =
    zLuck >= 0 ? `Top ${Math.ceil(100 - percentile)}%` : `Bottom ${Math.ceil(percentile)}%`
  const sigmaStr = zLuck >= 0 ? `+${zLuck.toFixed(2)}σ` : `${zLuck.toFixed(2)}σ`

  return `${position} (${label}) — ${validStreams.length} streams (${sigmaStr})`
}

/**
 * Compute Volatility string for the plan (objective-agnostic)
 */
export function computeVolatility(xpProbabilities: number[]): string {
  if (xpProbabilities.length === 0) return "N/A"

  const totalVariance = xpProbabilities.reduce((sum, p) => sum + p * (1 - p), 0)
  const sigma = Math.sqrt(totalVariance)

  let volLabel: string
  if (sigma < 1.0) {
    volLabel = "Low"
  } else if (sigma <= 2.0) {
    volLabel = "Medium"
  } else {
    volLabel = "High"
  }

  return `${volLabel} (±${sigma.toFixed(1)} XP)`
}

/**
 * Computed statistics for a set of action logs
 */
export interface ComputedStats {
  ticksUsed: number
  totalXP: number
  expectedXP: number
  xpProbabilities: number[]
  actionCount: number // Total number of actions (not breakdown by type)
  contractsCompleted: number
  repGained: number
  skillDelta: string[]
}

/**
 * Internal helper: compute stats from a slice of logs
 */
function computeStatsFromLogs(
  logs: ActionLog[],
  startingSkills: Record<SkillID, SkillState>,
  currentSkills: Record<SkillID, SkillState>
): ComputedStats {
  // Calculate ticks used from logs
  let ticksUsed = 0
  for (const log of logs) {
    ticksUsed += log.timeConsumed
  }

  let totalXP = 0
  let expectedXP = 0
  const xpProbabilities: number[] = []

  for (const log of logs) {
    if (log.skillGained) totalXP += log.skillGained.amount

    if (log.rngRolls.length > 0) {
      const p = log.rngRolls[0].probability
      expectedXP += p
      xpProbabilities.push(p)
    } else if (log.skillGained) {
      expectedXP += 1
      xpProbabilities.push(1)
    }

    if (log.contractsCompleted) {
      for (const c of log.contractsCompleted) {
        if (c.xpGained) {
          totalXP += c.xpGained.amount
          expectedXP += c.xpGained.amount
        }
      }
    }
  }

  let contractsCompleted = 0
  let repGained = 0
  for (const log of logs) {
    if (log.contractsCompleted) {
      contractsCompleted += log.contractsCompleted.length
      for (const c of log.contractsCompleted) {
        repGained += c.reputationGained
      }
    }
  }

  const skillDelta: string[] = []
  const skills: SkillID[] = [
    "Mining",
    "Woodcutting",
    "Combat",
    "Smithing",
    "Woodcrafting",
    "Exploration",
  ]
  for (const skill of skills) {
    const startXP = getTotalXP(startingSkills[skill])
    const endXP = getTotalXP(currentSkills[skill])
    if (endXP > startXP) {
      const startLevel = startingSkills[skill].level
      const endLevel = currentSkills[skill].level
      skillDelta.push(`${skill}: ${startLevel}→${endLevel} (+${endXP - startXP} XP)`)
    }
  }

  return {
    ticksUsed,
    totalXP,
    expectedXP,
    xpProbabilities,
    actionCount: logs.length,
    contractsCompleted,
    repGained,
    skillDelta,
  }
}

/**
 * Compute session statistics (only logs from current session)
 */
export function computeSessionStats(state: WorldState, stats: SessionStats): ComputedStats {
  const sessionLogs = stats.logs.slice(stats.sessionStartLogIndex)
  return computeStatsFromLogs(sessionLogs, stats.startingSkills, state.player.skills)
}

/**
 * Compute game statistics (all logs across all sessions)
 */
export function computeGameStats(state: WorldState, stats: SessionStats): ComputedStats {
  // For game stats, we need the starting skills from the very first session
  // We can reconstruct them from the current skills minus all XP gained in all logs
  const gameStartSkills: Record<SkillID, SkillState> = {} as Record<SkillID, SkillState>
  const skills: SkillID[] = [
    "Mining",
    "Woodcutting",
    "Combat",
    "Smithing",
    "Woodcrafting",
    "Exploration",
  ]

  for (const skill of skills) {
    // Start with current level 0
    gameStartSkills[skill] = { level: 0, xp: 0 }
  }

  return computeStatsFromLogs(stats.logs, gameStartSkills, state.player.skills)
}

/**
 * Print session and game summaries
 */
export function printSummary(state: WorldState, stats: SessionStats): void {
  const W = 120
  const line = "─".repeat(W - 2)
  const dline = "═".repeat(W - 2)
  const pad = makePadInner(W)

  // Compute both session and game stats
  const sessionStats = computeSessionStats(state, stats)
  const gameStats = computeGameStats(state, stats)

  // Session-specific calculations
  const sessionLogs = stats.logs.slice(stats.sessionStartLogIndex)
  const sessionVolatilityStr = computeVolatility(sessionStats.xpProbabilities)
  const sessionRngStreams = buildRngStreams(sessionLogs)
  const sessionLuckStr = computeLuckString(sessionRngStreams)

  // Game-wide calculations
  const gameVolatilityStr = computeVolatility(gameStats.xpProbabilities)
  const gameRngStreams = buildRngStreams(stats.logs)
  const gameLuckStr = computeLuckString(gameRngStreams)

  // Final inventory + storage
  const allItems: Record<string, number> = {}
  for (const item of state.player.inventory) {
    allItems[item.itemId] = (allItems[item.itemId] || 0) + item.quantity
  }
  for (const item of state.player.storage) {
    allItems[`${item.itemId} (stored)`] = (allItems[`${item.itemId} (stored)`] || 0) + item.quantity
  }
  const itemsStr =
    Object.entries(allItems)
      .map(([id, qty]) => `${qty}x ${id}`)
      .join(", ") || "(none)"

  // Print SESSION SUMMARY
  console.log(`\n╔${dline}╗`)
  console.log(`║${"SESSION SUMMARY".padStart(W / 2 + 7).padEnd(W - 2)}║`)
  console.log(`╠${dline}╣`)

  const sessionExpectedXPTick =
    sessionStats.ticksUsed > 0
      ? (sessionStats.expectedXP / sessionStats.ticksUsed).toFixed(2)
      : "0.00"
  const sessionActualXPTick =
    sessionStats.ticksUsed > 0 ? (sessionStats.totalXP / sessionStats.ticksUsed).toFixed(2) : "0.00"
  console.log(
    pad(
      `⏱  TIME: ${sessionStats.ticksUsed}/${stats.totalSession} ticks  │  XP: ${sessionStats.totalXP} actual, ${sessionStats.expectedXP.toFixed(1)} expected  │  XP/tick: ${sessionActualXPTick} actual, ${sessionExpectedXPTick} expected`
    )
  )
  console.log(`├${line}┤`)
  console.log(pad(`📋 ACTIONS: ${sessionStats.actionCount} total`))
  console.log(`├${line}┤`)
  console.log(pad(`🎲 LUCK: ${sessionLuckStr}`))
  console.log(`├${line}┤`)
  console.log(pad(`📉 VOLATILITY: ${sessionVolatilityStr}`))
  console.log(`├${line}┤`)
  console.log(
    pad(
      `📈 SKILLS: ${sessionStats.skillDelta.length > 0 ? sessionStats.skillDelta.join("  │  ") : "(no gains)"}`
    )
  )
  console.log(`├${line}┤`)
  console.log(
    pad(
      `🏆 CONTRACTS: ${sessionStats.contractsCompleted} completed  │  Reputation: ${state.player.guildReputation} (+${sessionStats.repGained} this session)`
    )
  )
  console.log(`├${line}┤`)
  console.log(pad(`🎒 FINAL ITEMS: ${itemsStr}`))
  console.log(`╚${dline}╝`)

  // Print COMPLETE GAME SUMMARY (only if there were previous sessions)
  if (stats.sessionStartLogIndex > 0) {
    console.log(`\n╔${dline}╗`)
    console.log(`║${"COMPLETE GAME SUMMARY".padStart(W / 2 + 10).padEnd(W - 2)}║`)
    console.log(`╠${dline}╣`)

    const gameExpectedXPTick =
      gameStats.ticksUsed > 0 ? (gameStats.expectedXP / gameStats.ticksUsed).toFixed(2) : "0.00"
    const gameActualXPTick =
      gameStats.ticksUsed > 0 ? (gameStats.totalXP / gameStats.ticksUsed).toFixed(2) : "0.00"
    console.log(
      pad(
        `⏱  TIME: ${gameStats.ticksUsed} ticks total  │  XP: ${gameStats.totalXP} actual, ${gameStats.expectedXP.toFixed(1)} expected  │  XP/tick: ${gameActualXPTick} actual, ${gameExpectedXPTick} expected`
      )
    )
    console.log(`├${line}┤`)
    console.log(pad(`📋 ACTIONS: ${gameStats.actionCount} total`))
    console.log(`├${line}┤`)
    console.log(pad(`🎲 LUCK: ${gameLuckStr}`))
    console.log(`├${line}┤`)
    console.log(pad(`📉 VOLATILITY: ${gameVolatilityStr}`))
    console.log(`╚${dline}╝`)
  }
}

// ============================================================================
// Runner Creation
// ============================================================================

export interface CreateSessionOptions {
  seed: string
  createWorld: (seed: string) => WorldState
}

export interface Session {
  state: WorldState
  stats: SessionStats
}

/**
 * Create a new session with initial state and stats tracking
 */
export function createSession(options: CreateSessionOptions): Session {
  const state = options.createWorld(options.seed)
  const stats: SessionStats = {
    logs: [],
    startingSkills: { ...state.player.skills },
    totalSession: state.time.sessionRemainingTicks,
    sessionStartLogIndex: 0,
  }
  return { state, stats }
}

/**
 * Execute an action and record it in stats
 */
export async function executeAndRecord(
  session: Session,
  action: Action,
  execute: (state: WorldState, action: Action) => Promise<ActionLog>
): Promise<ActionLog> {
  const log = await execute(session.state, action)
  session.stats.logs.push(log)
  return log
}

// ============================================================================
// Unified Session Runner
// ============================================================================

import { createWorld } from "./world.js"
import { executeAction } from "./engine.js"
import { saveExists, loadSave, writeSave, deleteSave, deserializeSession } from "./persistence.js"
import { promptResume } from "./savePrompt.js"

export type MetaCommandResult = "continue" | "end" | "quit"

export interface RunnerConfig {
  /** Get the next command to execute. Return null to end the session. */
  getNextCommand: () => Promise<string | null>

  /** Called after each action is executed */
  onActionComplete: (log: ActionLog, state: WorldState) => void

  /** Called when the session ends. showSummary is false if user quit. */
  onSessionEnd: (state: WorldState, stats: SessionStats, showSummary: boolean) => void

  /** Called when a command cannot be parsed. Return 'exit' to stop, 'continue' to keep going. */
  onInvalidCommand: (cmd: string) => "continue" | "exit"

  /** Optional: called once at session start with initial state */
  onSessionStart?: (state: WorldState) => void

  /** Optional meta-commands (e.g., help, state, quit). Return action to take. */
  metaCommands?: Record<string, (state: WorldState) => MetaCommandResult>

  /** Optional hook called before each action is executed */
  beforeAction?: (action: Action, state: WorldState) => void

  /** Optional hook called before entering interactive explore/survey mode */
  onBeforeInteractive?: () => void

  /** Optional hook called after exiting interactive explore/survey mode */
  onAfterInteractive?: () => void
}

/**
 * Run a session with the given configuration.
 * This is the unified core loop used by both REPL and batch runners.
 */
export async function runSession(seed: string, config: RunnerConfig): Promise<void> {
  // Check if a save exists for this seed (only in interactive/TTY mode)
  let session: Session
  if (process.stdin.isTTY && saveExists(seed)) {
    const save = loadSave(seed)
    // promptResume uses promptYesNo which handles readline conflicts internally
    const shouldResume = await promptResume(save)
    if (shouldResume) {
      // Resume from save
      session = deserializeSession(save)
      // Update session boundary - all existing logs are from previous sessions
      session.stats.sessionStartLogIndex = session.stats.logs.length
      console.log("\nResuming saved game...")
    } else {
      // Delete save and start fresh
      deleteSave(seed)
      console.log("\nStarting new game...")
      session = createSession({ seed, createWorld })
    }
  } else {
    // No save exists, create new session
    session = createSession({ seed, createWorld })
  }

  let showSummary = true

  // Call onSessionStart hook if provided
  config.onSessionStart?.(session.state)

  while (session.state.time.sessionRemainingTicks > 0) {
    const cmd = await config.getNextCommand()
    if (cmd === null) break

    const trimmedCmd = cmd.trim().toLowerCase()

    // Check meta-commands first
    if (config.metaCommands && trimmedCmd in config.metaCommands) {
      const result = config.metaCommands[trimmedCmd](session.state)
      if (result === "end") break
      if (result === "quit") {
        showSummary = false
        break
      }
      continue
    }

    // Handle fartravel with no args - show list of reachable areas
    if (trimmedCmd === "fartravel" || trimmedCmd === "far") {
      const reachable = getReachableAreas(session.state)
      if (reachable.length === 0) {
        console.log("\nNo reachable areas from current location.")
      } else {
        console.log("\n┌─────────────────────────────────────────────────────────────┐")
        console.log("│ FAR TRAVEL - Reachable Areas                                │")
        console.log("├─────────────────────────────────────────────────────────────┤")
        for (const { areaId, travelTime, hops } of reachable) {
          const area = session.state.exploration.areas.get(areaId)
          const displayName = getAreaDisplayName(areaId, area)
          const hopStr = hops === 1 ? "1 hop" : `${hops} hops`
          console.log(
            `│ ${displayName.padEnd(35)} ${String(travelTime).padStart(4)}t (${hopStr.padStart(7)}) │`
          )
        }
        console.log("└─────────────────────────────────────────────────────────────┘")
        console.log("\nUsage: fartravel <area name>")
      }
      continue
    }

    // Parse the action
    // Include both visited areas and reachable areas (via known connections)
    const currentArea = session.state.exploration.playerState.currentAreaId
    const reachableAreas = new Set(session.state.exploration.playerState.knownAreaIds)
    for (const connId of session.state.exploration.playerState.knownConnectionIds) {
      const [from, to] = connId.split("->")
      if (from === currentArea) reachableAreas.add(to)
      if (to === currentArea) reachableAreas.add(from)
    }

    const action = parseAction(cmd, {
      knownAreaIds: Array.from(reachableAreas),
      currentLocationId: session.state.exploration.playerState.currentLocationId,
      state: session.state,
    })

    if (!action) {
      const result = config.onInvalidCommand(cmd)
      if (result === "exit") break
      continue
    }

    // Call beforeAction hook if provided
    config.beforeAction?.(action, session.state)

    // Handle interactive exploration (Explore and Survey) - only in TTY mode
    if ((action.type === "Explore" || action.type === "Survey") && process.stdin.isTTY) {
      // Pause the main readline to avoid conflicts with interactive prompts
      config.onBeforeInteractive?.()

      let logs: ActionLog[] = []
      try {
        // Import interactive functions dynamically
        const { interactiveExplore, interactiveSurvey } = await import("./interactive.js")

        if (action.type === "Explore") {
          logs = await interactiveExplore(session.state)
        } else {
          logs = await interactiveSurvey(session.state)
        }
      } finally {
        // Resume the main readline
        config.onAfterInteractive?.()
      }

      // Record all logs from the interactive session (display already handled by interactive function)
      for (const log of logs) {
        session.stats.logs.push(log)
      }

      // Auto-save after interactive exploration
      writeSave(seed, session)
      continue
    }

    // Handle interactive travel (ExplorationTravel and FarTravel) - only in TTY mode
    if (
      (action.type === "ExplorationTravel" || action.type === "FarTravel") &&
      process.stdin.isTTY
    ) {
      // Pause the main readline to avoid conflicts with interactive prompts
      config.onBeforeInteractive?.()

      let logs: ActionLog[] = []
      try {
        // Import interactive functions dynamically
        const { interactiveExplorationTravel, interactiveFarTravel } =
          await import("./interactive.js")

        if (action.type === "ExplorationTravel") {
          logs = await interactiveExplorationTravel(session.state, action)
        } else {
          logs = await interactiveFarTravel(session.state, action)
        }
      } finally {
        // Resume the main readline
        config.onAfterInteractive?.()
      }

      // Record all logs from the interactive session (display already handled by interactive function)
      for (const log of logs) {
        session.stats.logs.push(log)
      }

      // Auto-save after interactive travel
      writeSave(seed, session)
      continue
    }

    // Execute the action (non-interactive mode or non-Explore/Survey actions)
    const log = await executeAction(session.state, action)
    session.stats.logs.push(log)
    config.onActionComplete(log, session.state)

    // Auto-save after each action
    writeSave(seed, session)
  }

  config.onSessionEnd(session.state, session.stats, showSummary)
}
