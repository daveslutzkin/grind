/**
 * Shared runner module for REPL and batch execution
 * Contains common types, command parsing, display formatting, and statistics
 */

import type { Action, ActionLog, WorldState, SkillID, SkillState } from "./types.js"
import { getTotalXP, getCurrentAreaId, GatherMode } from "./types.js"

// Re-export agent formatters for unified display
export { formatWorldState, formatActionLog } from "./agent/formatters.js"

// ============================================================================
// Types
// ============================================================================

export interface SessionStats {
  logs: ActionLog[]
  startingSkills: Record<SkillID, SkillState>
  totalSession: number
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
  /** Whether to log parse errors to console */
  logErrors?: boolean
}

/**
 * Parse a command string into an Action.
 * Supports: move, gather (with modes), fight, craft, store, drop, accept, enrol/enroll, explore, survey
 */
export function parseAction(input: string, context: ParseContext = {}): Action | null {
  const parts = input.trim().toLowerCase().split(/\s+/)
  const cmd = parts[0]

  switch (cmd) {
    case "move": {
      const dest = parts[1]
      if (!dest) {
        if (context.logErrors) {
          const areas = context.knownAreaIds?.join(", ") || "?"
          console.log(`Usage: move <area>  (known areas: ${areas})`)
        }
        return null
      }
      // If we have known areas, try to match (case-insensitive)
      if (context.knownAreaIds) {
        const matchedArea = context.knownAreaIds.find(
          (a) =>
            a.toLowerCase() === dest.toLowerCase() || a.toLowerCase().startsWith(dest.toLowerCase())
        )
        if (!matchedArea) {
          if (context.logErrors) {
            console.log(`Usage: move <area>  (known areas: ${context.knownAreaIds.join(", ")})`)
          }
          return null
        }
        return { type: "ExplorationTravel", destinationAreaId: matchedArea }
      }
      // No area list - pass through as-is (preserve case)
      return { type: "ExplorationTravel", destinationAreaId: dest }
    }

    case "gather": {
      const nodeId = parts[1]
      if (!nodeId) {
        if (context.logErrors) {
          console.log("Usage: gather <node-id> [mode] [material]")
          console.log("  Modes: focus <material>, careful, appraise")
        }
        return null
      }

      // Check for gather mode
      const modeName = parts[2]?.toLowerCase()
      if (modeName) {
        if (modeName === "focus") {
          const focusMaterial = parts[3]?.toUpperCase()
          if (!focusMaterial) {
            if (context.logErrors) {
              console.log("FOCUS mode requires a material: gather <node> focus <material>")
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

      // Basic gather (no mode - legacy behavior)
      return { type: "Gather", nodeId }
    }

    case "explore": {
      // Discover locations (nodes) in the current area
      return { type: "Explore" }
    }

    case "survey": {
      // Discover new areas (connections)
      return { type: "Survey" }
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
 * Print help with available actions and current location info
 */
export function printHelp(state: WorldState): void {
  console.log("\n┌─────────────────────────────────────────────────────────────┐")
  console.log("│ AVAILABLE ACTIONS                                           │")
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ enrol <skill>       - Enrol in guild (Exploration first!)   │")
  console.log("│ survey              - Discover new areas (connections)      │")
  console.log("│ move <area>         - Travel to a known area                │")
  console.log("│ explore             - Discover nodes in current area        │")
  console.log("│ gather <node>       - Gather from a node (basic mode)       │")
  console.log("│   gather <n> focus <mat>   - Focus on one material          │")
  console.log("│   gather <n> careful       - Carefully extract all          │")
  console.log("│   gather <n> appraise      - Inspect node contents          │")
  console.log("│ fight <enemy>       - Fight an enemy at current area        │")
  console.log("│ craft <recipe>      - Craft with a recipe at TOWN           │")
  console.log("│ store <item> <qty>  - Store items at TOWN                   │")
  console.log("│ drop <item> <qty>   - Drop items                            │")
  console.log("│ accept <contract>   - Accept a contract                     │")
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ state               - Show current world state              │")
  console.log("│ world               - Show world data (nodes, enemies, etc) │")
  console.log("│ help                - Show this help                        │")
  console.log("│ end                 - End session and show summary          │")
  console.log("│ quit                - Exit without summary                  │")
  console.log("└─────────────────────────────────────────────────────────────┘")

  // Show what's available at current location
  const currentAreaId = getCurrentAreaId(state)
  console.log(`\nAt ${currentAreaId}:`)
  const nodes = state.world.nodes.filter((n) => n.areaId === currentAreaId)
  const enemies = state.world.enemies.filter((e) => e.areaId === currentAreaId)
  const recipes = state.world.recipes.filter((r) => r.requiredAreaId === currentAreaId)
  const contracts = state.world.contracts.filter((c) => c.guildAreaId === currentAreaId)

  if (nodes.length > 0) console.log(`  Nodes: ${nodes.map((n) => n.nodeId).join(", ")}`)
  if (enemies.length > 0) console.log(`  Enemies: ${enemies.map((e) => e.id).join(", ")}`)
  if (recipes.length > 0) console.log(`  Recipes: ${recipes.map((r) => r.id).join(", ")}`)
  if (contracts.length > 0) console.log(`  Contracts: ${contracts.map((c) => c.id).join(", ")}`)
  if (currentAreaId === state.world.storageAreaId) console.log(`  Storage available`)
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
    zLuck >= 0 ? `Top ${(100 - percentile).toFixed(0)}%` : `Bottom ${percentile.toFixed(0)}%`
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
 * Compute session statistics from logs
 */
export interface ComputedStats {
  ticksUsed: number
  totalXP: number
  expectedXP: number
  xpProbabilities: number[]
  actionCounts: Record<string, { success: number; fail: number; time: number }>
  contractsCompleted: number
  repGained: number
  skillDelta: string[]
}

export function computeSessionStats(state: WorldState, stats: SessionStats): ComputedStats {
  const ticksUsed = stats.totalSession - state.time.sessionRemainingTicks

  const actionCounts: Record<string, { success: number; fail: number; time: number }> = {}
  for (const log of stats.logs) {
    if (!actionCounts[log.actionType]) {
      actionCounts[log.actionType] = { success: 0, fail: 0, time: 0 }
    }
    if (log.success) actionCounts[log.actionType].success++
    else actionCounts[log.actionType].fail++
    actionCounts[log.actionType].time += log.timeConsumed
  }

  let totalXP = 0
  let expectedXP = 0
  const xpProbabilities: number[] = []

  for (const log of stats.logs) {
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
  for (const log of stats.logs) {
    if (log.contractsCompleted) {
      contractsCompleted += log.contractsCompleted.length
      for (const c of log.contractsCompleted) {
        repGained += c.reputationGained
      }
    }
  }

  const skillDelta: string[] = []
  const skills: SkillID[] = ["Mining", "Woodcutting", "Combat", "Smithing"]
  for (const skill of skills) {
    const startXP = getTotalXP(stats.startingSkills[skill])
    const endXP = getTotalXP(state.player.skills[skill])
    if (endXP > startXP) {
      const startLevel = stats.startingSkills[skill].level
      const endLevel = state.player.skills[skill].level
      skillDelta.push(`${skill}: ${startLevel}→${endLevel} (+${endXP - startXP} XP)`)
    }
  }

  return {
    ticksUsed,
    totalXP,
    expectedXP,
    xpProbabilities,
    actionCounts,
    contractsCompleted,
    repGained,
    skillDelta,
  }
}

/**
 * Print session summary
 */
export function printSummary(state: WorldState, stats: SessionStats): void {
  const W = 120
  const line = "─".repeat(W - 2)
  const dline = "═".repeat(W - 2)
  const pad = makePadInner(W)

  const computed = computeSessionStats(state, stats)

  const volatilityStr = computeVolatility(computed.xpProbabilities)
  const rngStreams = buildRngStreams(stats.logs)
  const luckStr = computeLuckString(rngStreams)

  const actionStrs = Object.entries(computed.actionCounts).map(
    ([type, { success, fail, time }]) =>
      `${type}: ${success}✓${fail > 0 ? ` ${fail}✗` : ""} (${time}t)`
  )

  console.log(`\n╔${dline}╗`)
  console.log(`║${"SESSION SUMMARY".padStart(W / 2 + 7).padEnd(W - 2)}║`)
  console.log(`╠${dline}╣`)

  const expectedXPTick =
    computed.ticksUsed > 0 ? (computed.expectedXP / computed.ticksUsed).toFixed(2) : "0.00"
  const actualXPTick =
    computed.ticksUsed > 0 ? (computed.totalXP / computed.ticksUsed).toFixed(2) : "0.00"
  console.log(
    pad(
      `⏱  TIME: ${computed.ticksUsed}/${stats.totalSession} ticks  │  XP: ${computed.totalXP} actual, ${computed.expectedXP.toFixed(1)} expected  │  XP/tick: ${actualXPTick} actual, ${expectedXPTick} expected`
    )
  )
  console.log(`├${line}┤`)
  console.log(pad(`📋 ACTIONS: ${stats.logs.length} total  │  ${actionStrs.join("  │  ")}`))
  console.log(`├${line}┤`)
  console.log(pad(`🎲 LUCK: ${luckStr}`))
  console.log(`├${line}┤`)
  console.log(pad(`📉 VOLATILITY: ${volatilityStr}`))
  console.log(`├${line}┤`)
  console.log(
    pad(
      `📈 SKILLS: ${computed.skillDelta.length > 0 ? computed.skillDelta.join("  │  ") : "(no gains)"}`
    )
  )
  console.log(`├${line}┤`)
  console.log(
    pad(
      `🏆 CONTRACTS: ${computed.contractsCompleted} completed  │  Reputation: ${state.player.guildReputation} (+${computed.repGained} this session)`
    )
  )
  console.log(`├${line}┤`)

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
  console.log(pad(`🎒 FINAL ITEMS: ${itemsStr}`))
  console.log(`╚${dline}╝`)
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
  }
  return { state, stats }
}

/**
 * Execute an action and record it in stats
 */
export function executeAndRecord(
  session: Session,
  action: Action,
  execute: (state: WorldState, action: Action) => ActionLog
): ActionLog {
  const log = execute(session.state, action)
  session.stats.logs.push(log)
  return log
}
