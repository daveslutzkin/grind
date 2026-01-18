/**
 * Runner module for the REPL
 * Contains common types, command parsing, display formatting, and statistics
 */

import type { Action, ActionLog, WorldState, SkillID, SkillState, AreaID } from "./types.js"
import {
  getTotalXP,
  getCurrentAreaId,
  getCurrentLocationId,
  GatherMode,
  ExplorationLocationType,
} from "./types.js"
import { getReachableAreas, getAreaDisplayName } from "./exploration.js"
import { formatWorldState, formatActionLog } from "./agent/formatters.js"

// Re-export agent formatters for unified display
export { formatWorldState, formatActionLog }

// ============================================================================
// Types
// ============================================================================

export interface SessionStats {
  logs: ActionLog[]
  startingSkills: Record<SkillID, SkillState>
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

export interface ParseContext {
  /** Known area IDs for area name matching (optional) */
  knownAreaIds?: string[]
  /** Current location ID for context-aware commands (optional) */
  currentLocationId?: string | null
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
      // Check if first argument is a mode keyword (not a nodeId) - allows omitting nodeId when at a node
      const firstArg = parts[1]?.toLowerCase()
      const modeKeywords = ["careful", "appraise"]
      const isFirstArgMode = modeKeywords.includes(firstArg || "")

      let nodeId: string | undefined
      let arg2: string | undefined

      if (isFirstArgMode) {
        // Usage: gather <mode> - infer nodeId from current location
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
          return null
        }

        // Mode keywords map directly
        if (firstArg === "careful") {
          return { type: "Gather", nodeId, mode: GatherMode.CAREFUL_ALL }
        } else if (firstArg === "appraise") {
          return { type: "Gather", nodeId, mode: GatherMode.APPRAISE }
        }
      }

      // Usage: gather <node> <arg2>
      // where arg2 is either a mode keyword (careful/appraise) or a material ID (implicit FOCUS)
      nodeId = parts[1]
      arg2 = parts[2]?.toLowerCase()

      if (!nodeId || !arg2) {
        return null
      }

      if (arg2 === "careful") {
        return { type: "Gather", nodeId, mode: GatherMode.CAREFUL_ALL }
      } else if (arg2 === "appraise") {
        return { type: "Gather", nodeId, mode: GatherMode.APPRAISE }
      } else {
        // Treat arg2 as material ID (implicit FOCUS mode)
        const focusMaterial = arg2.toUpperCase()
        return { type: "Gather", nodeId, mode: GatherMode.FOCUS, focusMaterialId: focusMaterial }
      }
    }

    case "mine": {
      // Alias for gather mining - finds ore vein in current area
      const arg1 = parts[1]?.toLowerCase()

      // Check for mode keywords first
      if (arg1 === "careful") {
        return { type: "Mine", mode: GatherMode.CAREFUL_ALL }
      } else if (arg1 === "appraise") {
        return { type: "Mine", mode: GatherMode.APPRAISE }
      } else if (arg1) {
        // Treat arg1 as material ID (implicit FOCUS mode)
        const focusMaterial = arg1.toUpperCase()
        return { type: "Mine", mode: GatherMode.FOCUS, focusMaterialId: focusMaterial }
      } else {
        // No argument: FOCUS mode, engine will auto-select if only one material
        return { type: "Mine", mode: GatherMode.FOCUS }
      }
    }

    case "chop": {
      // Alias for gather woodcutting - finds tree stand in current area
      const arg1 = parts[1]?.toLowerCase()

      // Check for mode keywords first
      if (arg1 === "careful") {
        return { type: "Chop", mode: GatherMode.CAREFUL_ALL }
      } else if (arg1 === "appraise") {
        return { type: "Chop", mode: GatherMode.APPRAISE }
      } else if (arg1) {
        // Treat arg1 as material ID (implicit FOCUS mode)
        const focusMaterial = arg1.toUpperCase()
        return { type: "Chop", mode: GatherMode.FOCUS, focusMaterialId: focusMaterial }
      } else {
        // No argument: FOCUS mode, engine will auto-select if only one material
        return { type: "Chop", mode: GatherMode.FOCUS }
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
      const destination = parts.slice(1).join(" ")
      if (!destination) {
        // No destination - this will be handled as a meta command to show the list
        return null
      }
      return { type: "FarTravel", destinationAreaId: destination }
    }

    case "fight": {
      // No arguments - enemy resolved by engine from current location
      return { type: "Fight" }
    }

    case "craft": {
      const recipeId = parts[1]
      if (!recipeId) {
        return null
      }
      return { type: "Craft", recipeId }
    }

    case "store": {
      const storeItem = parts[1]?.toUpperCase()
      const storeQty = parseInt(parts[2] || "1", 10)
      if (!storeItem) {
        return null
      }
      return { type: "Store", itemId: storeItem, quantity: storeQty }
    }

    case "drop": {
      const dropItem = parts[1]?.toUpperCase()
      const dropQty = parseInt(parts[2] || "1", 10)
      if (!dropItem) {
        return null
      }
      return { type: "Drop", itemId: dropItem, quantity: dropQty }
    }

    case "accept": {
      const contractId = parts[1]
      if (!contractId) {
        return null
      }
      return { type: "AcceptContract", contractId }
    }

    case "turn-in":
    case "turnin": {
      let contractId = parts[1]
      if (!contractId && context.state) {
        // If no contract ID provided, try to find an active contract at this location
        const currentLocationId =
          context.currentLocationId ?? context.state.exploration.playerState.currentLocationId
        for (const activeContractId of context.state.player.activeContracts) {
          const contract = context.state.world.contracts.find((c) => c.id === activeContractId)
          if (contract && contract.acceptLocationId === currentLocationId) {
            contractId = activeContractId
            break
          }
        }
      }
      if (!contractId) {
        return null
      }
      return { type: "TurnInContract", contractId }
    }

    case "enrol":
    case "enroll": {
      // No arguments - skill resolved by engine from current guild location
      return { type: "Enrol" }
    }

    case "goto":
    case "go":
    case "move":
    case "mv":
    case "travel": {
      // Unified travel command - engine resolves destination
      const destination = parts.slice(1).join(" ")
      if (!destination) {
        return null
      }
      return { type: "Move", destination }
    }

    case "leave": {
      // Leave current location, return to hub
      return { type: "Leave" }
    }

    case "see": {
      // Parse "see gathering map" command
      if (parts.slice(1).join(" ").toLowerCase() === "gathering map") {
        return { type: "SeeGatheringMap" }
      }
      return null
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

// ============================================================================
// 2D Map Visualization
// ============================================================================

interface Point {
  x: number
  y: number
}

interface AreaNode {
  id: AreaID
  displayName: string
  pos: Point
  isCurrent: boolean
}

/**
 * Simple 2D canvas for drawing text-based graphics
 */
class Canvas {
  private grid: string[][]
  width: number
  height: number

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.grid = Array(height)
      .fill(null)
      .map(() => Array(width).fill(" "))
  }

  set(x: number, y: number, char: string): void {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      this.grid[y][x] = char
    }
  }

  get(x: number, y: number): string {
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
      return this.grid[y][x]
    }
    return " "
  }

  /**
   * Draw a line between two points using simple line drawing
   */
  drawLine(x0: number, y0: number, x1: number, y1: number, char: string = "·"): void {
    // Bresenham's line algorithm
    const dx = Math.abs(x1 - x0)
    const dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx - dy

    let x = x0
    let y = y0

    while (true) {
      // Only draw if empty
      if (this.get(x, y) === " ") {
        this.set(x, y, char)
      }

      if (x === x1 && y === y1) break

      const e2 = 2 * err
      if (e2 > -dy) {
        err -= dy
        x += sx
      }
      if (e2 < dx) {
        err += dx
        y += sy
      }
    }
  }

  /**
   * Draw text at position (overwrites existing content)
   */
  drawText(x: number, y: number, text: string): void {
    for (let i = 0; i < text.length; i++) {
      this.set(x + i, y, text[i])
    }
  }

  /**
   * Draw a box around text
   */
  drawBox(x: number, y: number, text: string, highlight: boolean = false): void {
    const w = text.length
    const topLeft = highlight ? "╔" : "┌"
    const topRight = highlight ? "╗" : "┐"
    const bottomLeft = highlight ? "╚" : "└"
    const bottomRight = highlight ? "╝" : "┘"
    const horizontal = highlight ? "═" : "─"
    const vertical = highlight ? "║" : "│"

    // Top border
    this.set(x - 1, y - 1, topLeft)
    for (let i = 0; i < w; i++) {
      this.set(x + i, y - 1, horizontal)
    }
    this.set(x + w, y - 1, topRight)

    // Sides
    this.set(x - 1, y, vertical)
    this.set(x + w, y, vertical)

    // Bottom border
    this.set(x - 1, y + 1, bottomLeft)
    for (let i = 0; i < w; i++) {
      this.set(x + i, y + 1, horizontal)
    }
    this.set(x + w, y + 1, bottomRight)

    // Text
    this.drawText(x, y, text)
  }

  render(): string {
    return this.grid.map((row) => row.join("")).join("\n")
  }
}

/**
 * Calculate position for an area in 2D space using radial layout
 */
function calculateAreaPosition(
  areaId: AreaID,
  distance: number,
  indexInDistance: number,
  totalAtDistance: number,
  centerX: number,
  centerY: number
): Point {
  if (distance === 0) {
    // Town at center
    return { x: centerX, y: centerY }
  }

  // Arrange areas in a circle around center
  // Radius increases with distance
  const radius = distance * 12
  const angle = (2 * Math.PI * indexInDistance) / totalAtDistance

  return {
    x: Math.round(centerX + radius * Math.cos(angle)),
    y: Math.round(centerY + radius * Math.sin(angle) * 0.5), // Compress vertically
  }
}

/**
 * Print a text-based 2D map of known areas and connections
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

  // Calculate positions for all areas
  const width = 100
  const height = 40
  const centerX = width / 2
  const centerY = height / 2
  const canvas = new Canvas(width, height)
  const nodes: AreaNode[] = []

  for (const [distance, areas] of areasByDistance) {
    areas.forEach((areaId, index) => {
      const area = exploration.areas.get(areaId)!
      const displayName = getAreaDisplayName(areaId, area)
      const shortName = displayName.length > 15 ? displayName.substring(0, 12) + "..." : displayName
      const pos = calculateAreaPosition(areaId, distance, index, areas.length, centerX, centerY)

      nodes.push({
        id: areaId,
        displayName: shortName,
        pos,
        isCurrent: areaId === currentAreaId,
      })
    })
  }

  // Draw connections first (so they appear behind nodes)
  for (const conn of exploration.connections) {
    const isKnown =
      knownConnectionIds.has(createConnectionId(conn.fromAreaId, conn.toAreaId)) ||
      knownConnectionIds.has(createConnectionId(conn.toAreaId, conn.fromAreaId))

    if (!isKnown) continue

    const fromNode = nodes.find((n) => n.id === conn.fromAreaId)
    const toNode = nodes.find((n) => n.id === conn.toAreaId)

    if (fromNode && toNode) {
      canvas.drawLine(fromNode.pos.x, fromNode.pos.y, toNode.pos.x, toNode.pos.y, "·")
    }
  }

  // Draw nodes on top of connections
  for (const node of nodes) {
    canvas.drawBox(
      node.pos.x - Math.floor(node.displayName.length / 2),
      node.pos.y,
      node.displayName,
      node.isCurrent
    )
  }

  console.log("\n" + canvas.render())
  console.log("\nLegend: ╔═══╗ Current location  · Connection  ┌───┐ Area")
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
  console.log("│ turn-in <contract> - Turn in completed contract at guild   │")
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
 * Result from buildRngStreams, containing both binomial streams and gathering time z-scores
 */
export interface RngStreamsResult {
  streams: RngStream[]
  gatheringZScores: number[] // Z-scores from gathering time variance
}

/**
 * Build RNG streams from action logs for luck calculation.
 * Groups rolls by type: combat, gather (by skill), and loot (by item).
 * Also extracts gathering time variance as z-scores.
 */
export function buildRngStreams(logs: ActionLog[]): RngStreamsResult {
  const streamMap: Map<string, { trials: number; probability: number; successes: number }> =
    new Map()
  const gatheringZScores: number[] = []

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

    // Extract gathering time variance as z-scores
    // Time variance uses normal distribution with stdDev = 25% of expected time
    if (log.extraction?.variance && log.extraction.variance.expected > 0) {
      const { expected, luckDelta } = log.extraction.variance
      if (luckDelta !== undefined) {
        const stdDev = expected * 0.25
        if (stdDev > 0) {
          // z-score = luckDelta / stdDev
          // Positive luckDelta (faster) = positive z-score = lucky
          const z = luckDelta / stdDev
          gatheringZScores.push(z)
        }
      }
    }
  }

  const streams = Array.from(streamMap.entries()).map(([name, data]) => ({
    name,
    trials: data.trials,
    probability: data.probability,
    successes: data.successes,
  }))

  return { streams, gatheringZScores }
}

/**
 * Compute luck using Stouffer's method for combining z-scores across RNG streams.
 * Includes both binomial streams (combat, loot) and gathering time variance z-scores.
 */
export function computeLuckString(rngResult: RngStreamsResult): string {
  const { streams, gatheringZScores } = rngResult
  const validStreams = streams.filter((s) => s.trials > 0 && s.probability > 0 && s.probability < 1)

  // Compute z-scores from binomial streams
  const zScores: number[] = []
  for (const stream of validStreams) {
    const expected = stream.trials * stream.probability
    const variance = stream.trials * stream.probability * (1 - stream.probability)
    if (variance > 0) {
      const z = (stream.successes - expected) / Math.sqrt(variance)
      zScores.push(z)
    }
  }

  // Add gathering time z-scores (already computed)
  zScores.push(...gatheringZScores)

  if (zScores.length === 0) return "N/A (no RNG actions)"

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

  return `${position} (${label} - ${sigmaStr})`
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
      `⏱  TIME: ${sessionStats.ticksUsed} ticks  │  ACTIONS: ${sessionStats.actionCount}  |  XP: ${sessionStats.totalXP} actual, ${sessionStats.expectedXP.toFixed(1)} expected  │  XP/tick: ${sessionActualXPTick} actual, ${sessionExpectedXPTick} expected`
    )
  )
  console.log(`├${line}┤`)
  console.log(pad(`🎲 LUCK: ${sessionLuckStr}  |  VOLATILITY: ${sessionVolatilityStr}`))
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
        `⏱  TIME: ${gameStats.ticksUsed} ticks  │  ACTIONS: ${gameStats.actionCount}  |  XP: ${gameStats.totalXP} actual, ${gameStats.expectedXP.toFixed(1)} expected  │  XP/tick: ${gameActualXPTick} actual, ${gameExpectedXPTick} expected`
      )
    )
    console.log(`├${line}┤`)
    console.log(pad(`🎲 LUCK: ${gameLuckStr}  |  VOLATILITY: ${gameVolatilityStr}`))
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
import { saveExists, loadSave, writeSave, deserializeSession } from "./persistence.js"
import { promptResume } from "./savePrompt.js"
import { closeInput } from "./prompt.js"

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
 * This is the core loop used by the REPL.
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
      // User declined to resume - exit without deleting the save
      console.log("\nExiting. Your save file has been preserved.")
      console.log("To start a new game, manually delete the save or use a different seed.")
      closeInput()
      return
    }
  } else {
    // No save exists, create new session
    session = createSession({ seed, createWorld })
  }

  let showSummary = true

  // Call onSessionStart hook if provided
  config.onSessionStart?.(session.state)

  while (true) {
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

    // In TTY mode, use animated execution for ALL actions
    if (process.stdin.isTTY) {
      config.onBeforeInteractive?.()

      try {
        // Import interactive functions dynamically
        const {
          interactiveExplore,
          interactiveSurvey,
          interactiveExplorationTravel,
          interactiveFarTravel,
          executeAnimatedAction,
        } = await import("./interactive.js")

        // Special handling for Explore/Survey/Travel actions (they have interactive loops)
        if (action.type === "Explore") {
          const logs = await interactiveExplore(session.state)
          for (const log of logs) {
            session.stats.logs.push(log)
          }
        } else if (action.type === "Survey") {
          const logs = await interactiveSurvey(session.state)
          for (const log of logs) {
            session.stats.logs.push(log)
          }
        } else if (action.type === "ExplorationTravel") {
          const logs = await interactiveExplorationTravel(session.state, action)
          for (const log of logs) {
            session.stats.logs.push(log)
          }
        } else if (action.type === "FarTravel") {
          const logs = await interactiveFarTravel(session.state, action)
          for (const log of logs) {
            session.stats.logs.push(log)
          }
        } else {
          // All other actions: use generic animation
          const log = await executeAnimatedAction(session.state, action)
          session.stats.logs.push(log)
          config.onActionComplete(log, session.state)
        }
      } finally {
        config.onAfterInteractive?.()
      }

      writeSave(seed, session)
      continue
    }

    // Non-TTY mode: execute without animation (for scripts, CI, etc.)
    const log = await executeAction(session.state, action)
    session.stats.logs.push(log)
    config.onActionComplete(log, session.state)

    // Auto-save after each action
    writeSave(seed, session)
  }

  config.onSessionEnd(session.state, session.stats, showSummary)
}
