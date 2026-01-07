/**
 * Manual batch runner - executes actions and shows agent-view state
 * Usage: npx tsx src/manualBatch.ts <seed> [action1] [action2] ...
 */

import { createWorld } from "./world.js"
import { executeAction } from "./engine.js"
import type { Action, GatherMode, WorldState } from "./types.js"
import { formatWorldState, formatActionLog } from "./agent/formatters.js"

/**
 * Get list of known area IDs from state
 */
function getKnownAreas(state: WorldState): string[] {
  return state.exploration.playerState.knownAreaIds
}

/**
 * Parse gathering-specific actions
 * Format:
 *   move <area>
 *   enrol mining|woodcutting
 *   gather <nodeId> <mode> [focusMaterial]
 *     mode: focus|careful|appraise
 */
function parseAction(cmd: string, state: WorldState): Action | null {
  const parts = cmd.trim().split(/\s+/)
  const type = parts[0].toLowerCase()

  switch (type) {
    case "move": {
      const dest = parts[1]
      const validAreas = getKnownAreas(state)
      // Case-insensitive matching for area names
      const matchedArea = dest
        ? validAreas.find((a) => a.toLowerCase() === dest.toLowerCase())
        : undefined
      if (!matchedArea) {
        console.error(`Invalid area. Known areas: ${validAreas.join(", ")}`)
        return null
      }
      return { type: "ExplorationTravel", destinationAreaId: matchedArea }
    }

    case "enrol":
    case "enroll": {
      const skillName = parts[1]?.toLowerCase()
      const skillMap: Record<
        string,
        "Mining" | "Woodcutting" | "Exploration" | "Combat" | "Smithing"
      > = {
        mining: "Mining",
        woodcutting: "Woodcutting",
        exploration: "Exploration",
        combat: "Combat",
        smithing: "Smithing",
      }
      const skill = skillMap[skillName]
      if (!skill) {
        console.error("Usage: enrol mining|woodcutting|exploration|combat|smithing")
        return null
      }
      return { type: "Enrol", skill }
    }

    case "gather": {
      const nodeId = parts[1]
      const modeName = parts[2]?.toLowerCase()
      const focusMaterial = parts[3]?.toUpperCase()

      if (!nodeId || !modeName) {
        console.error("Usage: gather <nodeId> <focus|careful|appraise> [material]")
        return null
      }

      let mode: GatherMode
      if (modeName === "focus") {
        mode = "FOCUS" as GatherMode
        if (!focusMaterial) {
          console.error("FOCUS mode requires a material: gather <nodeId> focus <material>")
          return null
        }
        return { type: "Gather", nodeId, mode, focusMaterialId: focusMaterial }
      } else if (modeName === "careful") {
        mode = "CAREFUL_ALL" as GatherMode
        return { type: "Gather", nodeId, mode }
      } else if (modeName === "appraise") {
        mode = "APPRAISE" as GatherMode
        return { type: "Gather", nodeId, mode }
      }

      console.error("Mode must be: focus, careful, or appraise")
      return null
    }

    case "explore": {
      // Explore action to discover locations (nodes) in the current area
      return { type: "Explore" }
    }

    case "survey": {
      // Survey action to discover new areas (connections)
      return { type: "Survey" }
    }

    default:
      console.error(`Unknown command: ${type}`)
      return null
  }
}

function main(): void {
  const args = process.argv.slice(2)

  if (args.length < 1) {
    console.log("Usage: npx tsx src/manualBatch.ts <seed> [action1] [action2] ...")
    console.log("")
    console.log("Commands:")
    console.log("  move <area>                          - Travel to a known area")
    console.log("  enrol exploration|mining|woodcutting - Enrol in a guild")
    console.log("  survey                               - Discover new areas")
    console.log(
      "  explore                              - Discover locations (nodes) in current area"
    )
    console.log("  gather <node> focus <mat>            - Focus on one material")
    console.log("  gather <node> careful                - Carefully extract all")
    console.log("  gather <node> appraise               - Inspect node contents")
    console.log("")
    console.log("Start by enrolling in Exploration to discover areas (starts at TOWN)")
    console.log("Then use 'explore' to discover node locations before gathering")
    console.log("Areas are procedurally generated: area-d1-i0, area-d2-i0, etc.")
    process.exit(1)
  }

  const seed = args[0]
  const commands = args.slice(1)

  // Create world and execute all actions
  const state = createWorld(seed)
  let lastLog = null

  for (const cmd of commands) {
    if (state.time.sessionRemainingTicks <= 0) {
      console.error("Session time exhausted!")
      break
    }
    const action = parseAction(cmd, state)
    if (!action) {
      process.exit(1)
    }
    lastLog = executeAction(state, action)
  }

  // Output: last action result (if any), then current state
  if (lastLog) {
    console.log(formatActionLog(lastLog, state))
    console.log("")
  }

  console.log(formatWorldState(state))
}

main()
