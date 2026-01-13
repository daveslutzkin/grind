/**
 * Exploration system implementation
 * Based on canonical-exploration.md design document
 */

import type {
  Area,
  AreaConnection,
  AreaID,
  RngState,
  ExplorationLocation,
  WorldState,
  SurveyAction,
  ExploreAction,
  ExplorationTravelAction,
  FarTravelAction,
  ActionLog,
  RngRoll,
  ExplorationLuckInfo,
  LevelUp,
  ActionGenerator,
} from "./types.js"
import { ExplorationLocationType } from "./types.js"
import { rollFloat, roll } from "./rng.js"
import { consumeTime } from "./stateHelpers.js"
import { generateNodesForArea, getLocationDisplayName } from "./world.js"
import { generateAreaName, getNeighborNames } from "./areaNaming.js"

// ============================================================================
// Constants
// ============================================================================

/** Base travel time in ticks (before multiplier) */
export const BASE_TRAVEL_TIME = 10

/**
 * Get a friendly display name for an area.
 * Uses the LLM-generated name if available, otherwise falls back to a generic
 * description based on distance from town.
 *
 * This is the base implementation. For use with WorldState, see the wrapper
 * in agent/formatters.ts which looks up the area from state automatically.
 */
export function getAreaDisplayName(areaId: AreaID, area?: Area): string {
  if (areaId === "TOWN") return "Town"

  // Use LLM-generated name if available
  if (area?.name) return area.name

  // Fallback: generate generic name based on distance
  const match = areaId.match(/^area-d(\d+)-i\d+$/)
  if (match) {
    const distance = parseInt(match[1], 10)
    if (distance === 1) return "a nearby area"
    if (distance === 2) return "a distant area"
    return "a remote area"
  }
  return "an area"
}

/**
 * Discovery threshold multipliers for Explore action
 * These multiply the base success chance to determine individual discovery thresholds
 */
export const KNOWN_CONNECTION_MULTIPLIER = 1.0 // Connections to known areas (easiest)
export const MOB_CAMP_MULTIPLIER = 0.5 // Mob camps
export const GATHERING_NODE_WITH_SKILL_MULTIPLIER = 0.5 // Gathering nodes when player has skill
export const GATHERING_NODE_WITHOUT_SKILL_MULTIPLIER = 0.05 // Gathering nodes without skill (10× harder)
export const UNKNOWN_CONNECTION_MULTIPLIER = 0.25 // Connections to unknown areas

/** @deprecated Use UNKNOWN_CONNECTION_MULTIPLIER instead */
export const UNKNOWN_CONNECTION_DISCOVERY_MULTIPLIER = UNKNOWN_CONNECTION_MULTIPLIER

// ============================================================================
// Connection ID Helpers
// ============================================================================

/**
 * Create a canonical connection ID from two area IDs.
 * Always orders fromAreaId -> toAreaId in alphabetical order for consistency.
 */
export function createConnectionId(areaId1: AreaID, areaId2: AreaID): string {
  return `${areaId1}->${areaId2}`
}

/**
 * Check if a connection is known (checks both directions)
 */
export function isConnectionKnown(
  knownConnectionIds: Set<string>,
  areaId1: AreaID,
  areaId2: AreaID
): boolean {
  const connId = createConnectionId(areaId1, areaId2)
  const reverseConnId = createConnectionId(areaId2, areaId1)
  return knownConnectionIds.has(connId) || knownConnectionIds.has(reverseConnId)
}

/**
 * Get connection between two areas if it exists
 */
export function findConnection(
  connections: AreaConnection[],
  areaId1: AreaID,
  areaId2: AreaID
): AreaConnection | undefined {
  return connections.find(
    (c) =>
      (c.fromAreaId === areaId1 && c.toAreaId === areaId2) ||
      (c.fromAreaId === areaId2 && c.toAreaId === areaId1)
  )
}

// ============================================================================
// Core Utility Functions
// ============================================================================

/**
 * Get the number of areas at a given distance from town.
 * Uses Fibonacci sequence: distance 1 = 5, distance 2 = 8, etc.
 * Town (distance 0) has exactly 1 area.
 */
export function getAreaCountForDistance(distance: number): number {
  if (distance === 0) return 1 // Town is special

  // Fibonacci sequence starting at Fib(5) = 5 for distance 1
  // Distance 1: Fib(5) = 5
  // Distance 2: Fib(6) = 8
  // Distance N: Fib(N + 4)
  return fibonacci(distance + 4)
}

/**
 * Calculate Fibonacci number
 */
function fibonacci(n: number): number {
  if (n <= 1) return n
  let a = 0
  let b = 1
  for (let i = 2; i <= n; i++) {
    const temp = a + b
    a = b
    b = temp
  }
  return b
}

/**
 * Get the roll interval for exploration checks based on skill level.
 * Formula: max(1, 2 - floor(level / 10) × 0.1)
 *
 * Level 1-9: 2 ticks
 * Level 10-19: 1.9 ticks
 * Level 20-29: 1.8 ticks
 * Level 100+: 1 tick (minimum)
 */
export function getRollInterval(level: number): number {
  const reduction = Math.floor(level / 10) * 0.1
  return Math.max(1, 2 - reduction)
}

/**
 * Parameters for calculating success chance
 */
export interface SuccessChanceParams {
  level: number // Player's exploration skill level (0 = not in guild)
  distance: number // Distance of the area being explored
  connectedKnownAreas: number // Number of known areas with known connections
  nonConnectedKnownAreas: number // Number of known areas at this distance without connections
  totalAreasAtDistance: number // Total number of areas at this distance
}

/**
 * Calculate the success chance for exploration rolls.
 *
 * For non-guild players (level 0): fixed 1% rate
 *
 * For guild members:
 * success_chance = base_rate + level_bonus - distance_penalty + knowledge_bonus
 *
 * Where:
 * - base_rate = 5%
 * - level_bonus = (level - 1) × 5%
 * - distance_penalty = (distance - 1) × 5%
 * - knowledge_bonus = 5% per connected known area + 20% × (known non-connected / total)
 *
 * Minimum floor: 1% (exploration is always possible, just harder at high distances)
 */
export function calculateSuccessChance(params: SuccessChanceParams): number {
  const { level, distance, connectedKnownAreas, nonConnectedKnownAreas, totalAreasAtDistance } =
    params

  // Non-guild players have fixed 1% rate
  if (level === 0) {
    return 0.01
  }

  // Base rate
  const baseRate = 0.05

  // Level bonus: (level - 1) × 5%
  const levelBonus = (level - 1) * 0.05

  // Distance penalty: (distance - 1) × 5%
  const distancePenalty = (distance - 1) * 0.05

  // Knowledge bonus from connected areas: 5% per connected known area
  const connectedBonus = connectedKnownAreas * 0.05

  // Knowledge bonus from non-connected areas: 20% × (known / total)
  const nonConnectedRatio =
    totalAreasAtDistance > 0 ? nonConnectedKnownAreas / totalAreasAtDistance : 0
  const nonConnectedBonus = 0.2 * nonConnectedRatio

  // Calculate total success chance
  const totalChance = baseRate + levelBonus - distancePenalty + connectedBonus + nonConnectedBonus

  // Clamp between 1% floor and 100% (exploration is always possible)
  return Math.max(0.01, Math.min(1, totalChance))
}

/**
 * Calculate expected ticks until success based on success chance and roll interval.
 * Expected ticks = roll_interval / success_chance
 */
export function calculateExpectedTicks(successChance: number, rollInterval: number): number {
  if (successChance <= 0) return Infinity
  return rollInterval / successChance
}

// ============================================================================
// Luck Tracking Helper
// ============================================================================

/**
 * Update luck tracking and return luck info for the log
 */
function updateLuckTracking(
  exploration: NonNullable<WorldState["exploration"]>,
  expectedTicks: number,
  actualTicks: number
): ExplorationLuckInfo {
  const luckDelta = Math.round(expectedTicks - actualTicks)
  exploration.playerState.totalLuckDelta += luckDelta

  // Update streak
  if (luckDelta > 0) {
    exploration.playerState.currentStreak =
      exploration.playerState.currentStreak > 0 ? exploration.playerState.currentStreak + 1 : 1
  } else if (luckDelta < 0) {
    exploration.playerState.currentStreak =
      exploration.playerState.currentStreak < 0 ? exploration.playerState.currentStreak - 1 : -1
  }
  // If luckDelta === 0, streak stays the same

  return {
    actualTicks,
    expectedTicks: Math.round(expectedTicks),
    luckDelta,
    totalLuckDelta: exploration.playerState.totalLuckDelta,
    currentStreak: exploration.playerState.currentStreak,
  }
}

// ============================================================================
// Area Generation
// ============================================================================

/**
 * Generate the town area (distance 0)
 */
export function generateTown(): Area {
  return {
    id: "TOWN",
    name: "Town",
    distance: 0,
    generated: true,
    locations: [], // Town locations are handled elsewhere
    indexInDistance: 0,
  }
}

/**
 * Generate an area at a given distance and index.
 * Area IDs are deterministic based on distance and index.
 * Location generation uses generateNodesForArea (single source of truth).
 */
export function generateArea(rng: RngState, distance: number, indexInDistance: number): Area {
  const id: AreaID = `area-d${distance}-i${indexInDistance}`

  // Generate locations using the single source of truth (also generates nodes, but we ignore those here)
  const { locations } = generateNodesForArea(id, distance, rng)

  return {
    id,
    distance,
    generated: true,
    locations,
    indexInDistance,
  }
}

/**
 * Create an area placeholder (not yet generated).
 * Used for lazy generation - we know the area exists but haven't generated its contents.
 */
export function createAreaPlaceholder(distance: number, indexInDistance: number): Area {
  const id: AreaID = `area-d${distance}-i${indexInDistance}`
  return {
    id,
    distance,
    generated: false,
    locations: [],
    indexInDistance,
  }
}

/**
 * Ensure an area is fully generated.
 * If it's a placeholder, generate its contents.
 *
 * Note: Area locations (gathering nodes, mob camps) are generated by
 * generateNodesForArea() in world.ts at world creation time. This function
 * just marks the area as generated - it does NOT re-generate locations,
 * as that would cause desync between nodes and locations.
 */
export function ensureAreaGenerated(_rng: RngState, area: Area): Area {
  if (area.generated) return area

  // Locations were already populated by generateNodesForArea() in world.ts createWorld.
  // Empty locations means the area is sparse (rolls failed) - that's intentional.
  // DO NOT call generateAreaLocations here - it uses different RNG labels which
  // would create locations without corresponding nodes (the root cause of bug #5).
  area.generated = true
  return area
}

/**
 * Ensure an area is fully generated INCLUDING its connections and name.
 * This should be called when first visiting or discovering an area.
 * It will:
 * 1. Generate the area's content (locations)
 * 2. Create placeholders for the next distance if they don't exist
 * 3. Generate connections from this area to same/adjacent distances
 * 4. Generate a human-readable name using LLM (if ANTHROPIC_API_KEY is configured)
 */
export async function ensureAreaFullyGenerated(
  rng: RngState,
  exploration: NonNullable<WorldState["exploration"]>,
  area: Area
): Promise<void> {
  // Skip if already fully generated (has connections and name)
  const hasConnections = exploration.connections.some(
    (c) => c.fromAreaId === area.id || c.toAreaId === area.id
  )
  if (area.generated && hasConnections && area.name) return

  // Generate area content
  ensureAreaGenerated(rng, area)

  // Don't generate connections for TOWN (already done at init)
  if (area.id === "TOWN") return

  // Create placeholders for next distance if they don't exist
  const nextDistance = area.distance + 1
  const existingNextDistAreas = Array.from(exploration.areas.values()).filter(
    (a) => a.distance === nextDistance
  )
  if (existingNextDistAreas.length === 0) {
    const nextDistCount = getAreaCountForDistance(nextDistance)
    for (let i = 0; i < nextDistCount; i++) {
      const placeholder = createAreaPlaceholder(nextDistance, i)
      exploration.areas.set(placeholder.id, placeholder)
    }
  }

  // Generate connections from this area (if not already done)
  const existingFromThis = exploration.connections.filter((c) => c.fromAreaId === area.id)
  if (existingFromThis.length === 0) {
    const allAreas = Array.from(exploration.areas.values())
    const newConnections = generateAreaConnections(rng, area, allAreas)

    // Filter out duplicates (connection may already exist in reverse direction)
    for (const conn of newConnections) {
      const exists = exploration.connections.some(
        (c) =>
          (c.fromAreaId === conn.fromAreaId && c.toAreaId === conn.toAreaId) ||
          (c.fromAreaId === conn.toAreaId && c.toAreaId === conn.fromAreaId)
      )
      if (!exists) {
        exploration.connections.push(conn)
      }
    }
  }

  // Generate area name using LLM (uses global config for API key)
  // If no API key is configured, area stays unnamed and uses fallback display
  if (!area.name) {
    const neighborNames = getNeighborNames(area, exploration.areas, exploration.connections)
    const generatedName = await generateAreaName(area, neighborNames)
    if (generatedName) {
      area.name = generatedName
    }
  }
}

/**
 * Generate connections for an area to other areas.
 * From canonical doc:
 * - Each area connects to 0-3 other areas at same distance
 * - Each area connects to 0-3 other areas at distance - 1
 * - Each area connects to 0-3 other areas at distance + 1
 * - Distribution: 15% = 0, 35% = 1, 35% = 2, 15% = 3
 * - Town exception: Town connects to ALL distance 1 areas
 */
export function generateAreaConnections(
  rng: RngState,
  area: Area,
  allAreas: Area[]
): AreaConnection[] {
  const connections: AreaConnection[] = []

  // Town special case: connect to ALL distance 1 areas
  if (area.id === "TOWN") {
    const distance1Areas = allAreas.filter((a) => a.distance === 1)
    for (const d1Area of distance1Areas) {
      connections.push({
        fromAreaId: "TOWN",
        toAreaId: d1Area.id,
        travelTimeMultiplier: rollTravelMultiplier(rng, `travel_TOWN_${d1Area.id}`),
      })
    }
    return connections
  }

  // Regular areas: connect to areas at distance -1, 0, +1
  const targetDistances = [area.distance - 1, area.distance, area.distance + 1].filter(
    (d) => d >= 0
  )

  for (const targetDist of targetDistances) {
    const areasAtDistance = allAreas.filter(
      (a) => a.distance === targetDist && a.id !== area.id && a.id !== "TOWN"
    )

    if (areasAtDistance.length === 0) continue

    // Roll for number of connections (0-3)
    const numConnections = rollConnectionCount(rng, `conn_count_${area.id}_d${targetDist}`)

    // Randomly select areas to connect to
    const shuffled = shuffleArray(areasAtDistance, rng, `shuffle_${area.id}_d${targetDist}`)
    const toConnect = shuffled.slice(0, Math.min(numConnections, shuffled.length))

    for (const targetArea of toConnect) {
      // Avoid duplicate connections
      const existingConn = connections.find(
        (c) =>
          (c.fromAreaId === area.id && c.toAreaId === targetArea.id) ||
          (c.fromAreaId === targetArea.id && c.toAreaId === area.id)
      )

      if (!existingConn) {
        connections.push({
          fromAreaId: area.id,
          toAreaId: targetArea.id,
          travelTimeMultiplier: rollTravelMultiplier(rng, `travel_${area.id}_${targetArea.id}`),
        })
      }
    }
  }

  return connections
}

/**
 * Roll for number of connections (0-3)
 * Distribution: 15% = 0, 35% = 1, 35% = 2, 15% = 3
 */
function rollConnectionCount(rng: RngState, label: string): number {
  const rollValue = rollFloat(rng, 0, 1, label)
  if (rollValue < 0.15) return 0
  if (rollValue < 0.5) return 1 // 15% + 35% = 50%
  if (rollValue < 0.85) return 2 // 50% + 35% = 85%
  return 3 // Remaining 15%
}

/**
 * Roll for travel time multiplier (0.5-4.5)
 * Uses uniform distribution for varied non-round travel times
 */
function rollTravelMultiplier(rng: RngState, label: string): number {
  // Roll 0.5 to 4.5, round to 1 decimal place for cleaner numbers
  const rawValue = rollFloat(rng, 0.5, 4.5, label)
  return Math.round(rawValue * 10) / 10
}

/**
 * Shuffle an array using Fisher-Yates with RNG
 */
function shuffleArray<T>(array: T[], rng: RngState, label: string): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rollFloat(rng, 0, i + 1, `${label}_${i}`))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

// ============================================================================
// Exploration State Initialization
// ============================================================================

/**
 * Exploration state structure (mirrors WorldState.exploration)
 */
export interface ExplorationStateData {
  areas: Map<AreaID, Area>
  connections: AreaConnection[]
  playerState: {
    currentAreaId: AreaID
    currentLocationId: string | null
    knownAreaIds: AreaID[]
    knownLocationIds: string[]
    knownConnectionIds: string[]
    visitedLocationIds: string[]
    totalLuckDelta: number
    currentStreak: number
  }
}

/**
 * Initialize exploration state for a new game.
 * Creates town only - distance 1 areas are placeholders generated lazily.
 */
export function initializeExplorationState(rng: RngState): ExplorationStateData {
  const areas = new Map<AreaID, Area>()
  const connections: AreaConnection[] = []

  // Generate town
  const town = generateTown()
  areas.set(town.id, town)

  // Create placeholders for all distance 1 areas (lazy generation)
  const distance1Count = getAreaCountForDistance(1)
  for (let i = 0; i < distance1Count; i++) {
    const placeholder = createAreaPlaceholder(1, i)
    areas.set(placeholder.id, placeholder)
  }

  // Generate town connections to all distance 1 areas
  // We need the placeholders to exist for this
  const townConnections = generateAreaConnections(rng, town, Array.from(areas.values()))
  connections.push(...townConnections)

  return {
    areas,
    connections,
    playerState: {
      currentAreaId: "TOWN",
      currentLocationId: null,
      knownAreaIds: ["TOWN"],
      knownLocationIds: [],
      knownConnectionIds: [],
      visitedLocationIds: [],
      totalLuckDelta: 0,
      currentStreak: 0,
    },
  }
}

/**
 * Grant initial exploration benefits when joining the Exploration guild.
 * - Discovers one distance 1 area
 * - Discovers the connection from town to that area
 */
export async function grantExplorationGuildBenefits(state: WorldState): Promise<{
  discoveredAreaId: AreaID
  discoveredConnectionId: string
}> {
  const exploration = state.exploration!

  // Find a distance 1 area that isn't already known
  const unknownD1Areas = Array.from(exploration.areas.values()).filter(
    (a) => a.distance === 1 && !exploration.playerState.knownAreaIds.includes(a.id)
  )

  if (unknownD1Areas.length === 0) {
    // All distance 1 areas already known - shouldn't happen normally
    return { discoveredAreaId: "", discoveredConnectionId: "" }
  }

  // Pick the first one (deterministic)
  const areaToDiscover = unknownD1Areas[0]

  // Ensure the area is fully generated (content + connections + name)
  await ensureAreaFullyGenerated(state.rng, exploration, areaToDiscover)

  // Mark area and connection as known
  exploration.playerState.knownAreaIds.push(areaToDiscover.id)

  // Find the connection from town
  const conn = findConnection(exploration.connections, "TOWN", areaToDiscover.id)
  const connId = conn ? createConnectionId(conn.fromAreaId, conn.toAreaId) : ""
  if (connId) {
    exploration.playerState.knownConnectionIds.push(connId)
  }

  return {
    discoveredAreaId: areaToDiscover.id,
    discoveredConnectionId: connId,
  }
}

// ============================================================================
// Action Execution Helpers
// ============================================================================

/**
 * Helper to create a failure log
 */
function createFailureLog(
  state: WorldState,
  actionType: "Survey" | "Explore" | "ExplorationTravel" | "FarTravel",
  failureType: string,
  reason?: string,
  context?: Record<string, unknown>
): ActionLog {
  const typedFailureType = failureType as ActionLog["failureType"]
  return {
    tickBefore: state.time.currentTick,
    actionType,
    parameters: {},
    success: false,
    failureType: typedFailureType,
    failureDetails: {
      type: typedFailureType!,
      reason,
      context,
    },
    timeConsumed: 0,
    rngRolls: [],
    stateDeltaSummary: `Failed: ${failureType}`,
  }
}

/**
 * Get XP threshold to reach the next Exploration level.
 * Thresholds are set slightly above expected discoveries per distance,
 * where each discovery (area, location, or connection) grants 1 XP.
 *
 * Distance N should get you to approximately level N+1.
 */
const EXPLORATION_XP_THRESHOLDS = [
  25, // L1→L2: D1 has ~20 discoveries
  35, // L2→L3: D2 has ~31 discoveries
  55, // L3→L4: D3 has ~50 discoveries
  90, // L4→L5: D4 has ~81 discoveries
  140, // L5→L6: D5 has ~131 discoveries
  225, // L6→L7: D6 has ~212 discoveries
  360, // L7→L8: D7 has ~342 discoveries
  575, // L8→L9: D8 has ~554 discoveries
  925, // L9→L10: D9 has ~897 discoveries
  1500, // L10→L11: D10 has ~1451 discoveries
]

export function getExplorationXPThreshold(currentLevel: number): number {
  if (currentLevel <= 0) return EXPLORATION_XP_THRESHOLDS[0]
  if (currentLevel <= EXPLORATION_XP_THRESHOLDS.length) {
    return EXPLORATION_XP_THRESHOLDS[currentLevel - 1]
  }
  // Beyond defined thresholds, scale by ~1.6x (golden ratio)
  const lastThreshold = EXPLORATION_XP_THRESHOLDS[EXPLORATION_XP_THRESHOLDS.length - 1]
  const levelsOver = currentLevel - EXPLORATION_XP_THRESHOLDS.length
  return Math.round(lastThreshold * Math.pow(1.6, levelsOver))
}

/**
 * Grant XP to Exploration skill and return level ups.
 * Uses Exploration-specific thresholds based on discovery counts.
 */
function grantExplorationXP(
  state: WorldState,
  amount: number
): { levelUps: ActionLog["levelUps"] } {
  const levelUps: LevelUp[] = []
  const skill = state.player.skills.Exploration
  let { level, xp } = skill
  xp += amount

  // Check for level-ups using Exploration-specific thresholds
  let threshold = getExplorationXPThreshold(level)
  while (xp >= threshold) {
    const fromLevel = level
    xp -= threshold
    level++
    levelUps.push({ skill: "Exploration", fromLevel, toLevel: level })
    threshold = getExplorationXPThreshold(level)
  }

  state.player.skills.Exploration = { level, xp }
  return { levelUps: levelUps.length > 0 ? levelUps : undefined }
}

/**
 * Get knowledge bonus parameters for success chance calculation
 */
export function getKnowledgeParams(
  state: WorldState,
  currentArea: Area
): {
  connectedKnownAreas: number
  nonConnectedKnownAreas: number
  totalAreasAtDistance: number
} {
  const exploration = state.exploration!
  const knownAreaIds = new Set(exploration.playerState.knownAreaIds)
  const knownConnectionIds = new Set(exploration.playerState.knownConnectionIds)

  // Count connected known areas (where connection is also known)
  let connectedKnownAreas = 0
  for (const conn of exploration.connections) {
    if (isConnectionKnown(knownConnectionIds, conn.fromAreaId, conn.toAreaId)) {
      if (conn.fromAreaId === currentArea.id && knownAreaIds.has(conn.toAreaId)) {
        connectedKnownAreas++
      } else if (conn.toAreaId === currentArea.id && knownAreaIds.has(conn.fromAreaId)) {
        connectedKnownAreas++
      }
    }
  }

  // Count non-connected known areas at this distance
  let nonConnectedKnownAreas = 0
  for (const areaId of knownAreaIds) {
    const area = exploration.areas.get(areaId)
    if (area && area.distance === currentArea.distance && area.id !== currentArea.id) {
      // Check if there's no known connection to this area
      const hasKnownConnection = exploration.connections.some((conn) => {
        const isConnectedToCurrent =
          (conn.fromAreaId === currentArea.id && conn.toAreaId === area.id) ||
          (conn.toAreaId === currentArea.id && conn.fromAreaId === area.id)
        return (
          isConnectedToCurrent &&
          isConnectionKnown(knownConnectionIds, conn.fromAreaId, conn.toAreaId)
        )
      })
      if (!hasKnownConnection) {
        nonConnectedKnownAreas++
      }
    }
  }

  return {
    connectedKnownAreas,
    nonConnectedKnownAreas,
    totalAreasAtDistance: getAreaCountForDistance(currentArea.distance),
  }
}

// ============================================================================
// Survey Action
// ============================================================================

/**
 * Survey information for calculating chances and finding connections
 */
export type SurveyInfo = {
  successChance: number
  rollInterval: number
  expectedTicks: number
  allConnections: Array<{ fromAreaId: string; toAreaId: string }>
  hasUndiscoveredAreas: boolean
}

/**
 * Prepare survey data - calculate success chance and get connections
 * Used by both executeSurvey and interactive survey
 */
export function prepareSurveyData(state: WorldState, currentArea: Area): SurveyInfo {
  const exploration = state.exploration!
  const level = state.player.skills.Exploration.level

  // Calculate success chance
  const knowledgeParams = getKnowledgeParams(state, currentArea)
  const successChance = calculateSuccessChance({
    level,
    distance: currentArea.distance,
    ...knowledgeParams,
  })

  const rollInterval = getRollInterval(level)
  const expectedTicks = calculateExpectedTicks(successChance, rollInterval)

  // Get ALL connections from current area (including to known areas per spec)
  const allConnections = exploration.connections.filter((conn) => {
    return (
      conn.fromAreaId === exploration.playerState.currentAreaId ||
      conn.toAreaId === exploration.playerState.currentAreaId
    )
  })

  // Check if there are ANY undiscovered areas connected
  const knownAreaIds = new Set(exploration.playerState.knownAreaIds)
  const hasUndiscoveredAreas = allConnections.some((conn) => {
    const targetId =
      conn.fromAreaId === exploration.playerState.currentAreaId ? conn.toAreaId : conn.fromAreaId
    return !knownAreaIds.has(targetId)
  })

  return {
    successChance,
    rollInterval,
    expectedTicks,
    allConnections,
    hasUndiscoveredAreas,
  }
}

/**
 * Execute Survey action - discover a new area connected to current area
 *
 * Per spec (lines 76-77): "If the roll hits an already-discovered area, the roll is wasted.
 * Keep rolling until a new area is found (or player abandons)"
 */
export async function* executeSurvey(state: WorldState, _action: SurveyAction): ActionGenerator {
  const tickBefore = state.time.currentTick
  const rolls: RngRoll[] = []

  // Check preconditions
  if (state.player.skills.Exploration.level === 0) {
    yield {
      done: true,
      log: createFailureLog(state, "Survey", "NOT_IN_EXPLORATION_GUILD", "not_enrolled", {
        skill: "Exploration",
        currentLevel: 0,
      }),
    }
    return
  }

  const exploration = state.exploration!
  const currentArea = exploration.areas.get(exploration.playerState.currentAreaId)!

  // Use shared survey data preparation
  const { successChance, rollInterval, expectedTicks, allConnections, hasUndiscoveredAreas } =
    prepareSurveyData(state, currentArea)

  if (allConnections.length === 0) {
    const areaName = getAreaDisplayName(currentArea.id, currentArea)
    yield {
      done: true,
      log: {
        ...createFailureLog(state, "Survey", "NO_CONNECTIONS", "no_connections_from_area", {
          currentAreaId: currentArea.id,
          currentAreaName: areaName,
          distance: currentArea.distance,
        }),
        timeConsumed: 0,
      },
    }
    return
  }

  if (!hasUndiscoveredAreas) {
    const areaName = getAreaDisplayName(currentArea.id, currentArea)
    yield {
      done: true,
      log: {
        ...createFailureLog(
          state,
          "Survey",
          "NO_UNDISCOVERED_AREAS",
          "all_connections_discovered",
          {
            currentAreaId: currentArea.id,
            currentAreaName: areaName,
            totalConnections: allConnections.length,
          }
        ),
        timeConsumed: 0,
      },
    }
    return
  }

  const knownAreaIds = new Set(exploration.playerState.knownAreaIds)

  // Roll until we find an UNDISCOVERED area or session ends
  // Per spec: hitting a known area wastes the roll
  let ticksConsumed = 0
  let discoveredAreaId: AreaID | undefined
  let discoveredConnectionId: string | undefined
  let succeeded = false
  let accumulatedTicks = 0

  while (!succeeded) {
    // Accumulate ticks based on roll interval
    accumulatedTicks += rollInterval
    const ticksThisRoll = Math.floor(accumulatedTicks)
    accumulatedTicks -= ticksThisRoll

    if (ticksThisRoll > 0) {
      // Yield ticks as they're consumed
      for (let i = 0; i < ticksThisRoll; i++) {
        consumeTime(state, 1)
        ticksConsumed++
        yield { done: false }
      }
    }

    // Roll for success
    const success = roll(state.rng, successChance, `survey_roll_${ticksConsumed}`, rolls)

    if (success) {
      // Pick a RANDOM connected area (including known ones - per spec)
      const connIndex = Math.floor(
        rollFloat(state.rng, 0, allConnections.length, `survey_pick_${ticksConsumed}`)
      )
      const selectedConn = allConnections[connIndex]
      const targetId =
        selectedConn.fromAreaId === exploration.playerState.currentAreaId
          ? selectedConn.toAreaId
          : selectedConn.fromAreaId

      // Check if this area is already known
      if (knownAreaIds.has(targetId)) {
        // Wasted roll - per spec, keep trying
        continue
      }

      // Discover the area - ensure it's fully generated (content + connections + name)
      const targetArea = exploration.areas.get(targetId)!
      await ensureAreaFullyGenerated(state.rng, exploration, targetArea)

      // Mark area and connection as known
      exploration.playerState.knownAreaIds.push(targetId)
      const connId = createConnectionId(selectedConn.fromAreaId, selectedConn.toAreaId)
      exploration.playerState.knownConnectionIds.push(connId)

      discoveredAreaId = targetId
      discoveredConnectionId = connId
      succeeded = true

      // Show discovery feedback
      const areaName = getAreaDisplayName(targetId, targetArea)
      yield {
        done: false,
        feedback: { discovered: { type: "area", name: areaName, id: targetId } },
      }
    }
  }

  if (!succeeded) {
    // No discovery = no XP
    yield {
      done: true,
      log: {
        tickBefore,
        actionType: "Survey",
        parameters: {},
        success: false,
        failureType: "NO_UNDISCOVERED_AREAS",
        timeConsumed: ticksConsumed,
        rngRolls: rolls,
        stateDeltaSummary: "Survey interrupted",
      },
    }
    return
  }

  // Grant 2 XP on success: 1 for area discovery + 1 for connection discovery
  const xpGained = 2
  const { levelUps } = grantExplorationXP(state, xpGained)

  // Calculate luck info
  const luckInfo = updateLuckTracking(exploration, expectedTicks, ticksConsumed)

  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "Survey",
      parameters: {},
      success: true,
      timeConsumed: ticksConsumed,
      skillGained: { skill: "Exploration", amount: xpGained },
      levelUps,
      rngRolls: rolls,
      stateDeltaSummary: `Discovered ${getAreaDisplayName(discoveredAreaId!, exploration.areas.get(discoveredAreaId!))}`,
      explorationLog: {
        discoveredAreaId,
        discoveredConnectionId,
        luckInfo,
      },
    },
  }
}

// ============================================================================
// Explore Action
// ============================================================================

/**
 * Discoverable item for exploration
 */
export type Discoverable = {
  type: "location" | "knownConnection" | "unknownConnection"
  id: string
  threshold: number // % chance per roll (0-1)
  locationType?: string
}

/**
 * Build list of discoverable items with their thresholds
 * Used by both executeExplore and interactive exploration
 */
export function buildDiscoverables(
  state: WorldState,
  currentArea: Area
): { discoverables: Discoverable[]; baseChance: number } {
  const exploration = state.exploration!
  const level = state.player.skills.Exploration.level

  // Find undiscovered locations in current area
  const knownLocationIds = new Set(exploration.playerState.knownLocationIds)
  const undiscoveredLocations = currentArea.locations.filter((loc) => !knownLocationIds.has(loc.id))

  // Find undiscovered connections from current area
  const knownConnectionIds = new Set(exploration.playerState.knownConnectionIds)
  const knownAreaIds = new Set(exploration.playerState.knownAreaIds)

  // Connections to KNOWN areas (higher priority)
  const undiscoveredKnownConnections = exploration.connections.filter((conn) => {
    const isFromCurrent = conn.fromAreaId === currentArea.id
    const isToCurrent = conn.toAreaId === currentArea.id
    if (!isFromCurrent && !isToCurrent) return false

    const connId = createConnectionId(conn.fromAreaId, conn.toAreaId)
    const reverseConnId = createConnectionId(conn.toAreaId, conn.fromAreaId)
    if (knownConnectionIds.has(connId) || knownConnectionIds.has(reverseConnId)) return false

    // Target area must be known
    const targetId = isFromCurrent ? conn.toAreaId : conn.fromAreaId
    return knownAreaIds.has(targetId)
  })

  // Connections to UNKNOWN areas (lower probability per spec)
  const undiscoveredUnknownConnections = exploration.connections.filter((conn) => {
    const isFromCurrent = conn.fromAreaId === currentArea.id
    const isToCurrent = conn.toAreaId === currentArea.id
    if (!isFromCurrent && !isToCurrent) return false

    const connId = createConnectionId(conn.fromAreaId, conn.toAreaId)
    const reverseConnId = createConnectionId(conn.toAreaId, conn.fromAreaId)
    if (knownConnectionIds.has(connId) || knownConnectionIds.has(reverseConnId)) return false

    // Target area must be UNknown
    const targetId = isFromCurrent ? conn.toAreaId : conn.fromAreaId
    return !knownAreaIds.has(targetId)
  })

  // Calculate base success chance (used to derive individual thresholds)
  const knowledgeParams = getKnowledgeParams(state, currentArea)
  const baseChance = calculateSuccessChance({
    level,
    distance: currentArea.distance,
    ...knowledgeParams,
  })

  // Build list of discoverables with their individual thresholds
  const getLocationThreshold = (loc: ExplorationLocation): number => {
    if (loc.type === "GATHERING_NODE" && loc.gatheringSkillType) {
      const skillLevel = state.player.skills[loc.gatheringSkillType]?.level ?? 0
      if (skillLevel === 0) {
        return baseChance * GATHERING_NODE_WITHOUT_SKILL_MULTIPLIER
      }
      return baseChance * GATHERING_NODE_WITH_SKILL_MULTIPLIER
    }
    // Mob camp
    return baseChance * MOB_CAMP_MULTIPLIER
  }

  const discoverables: Discoverable[] = [
    ...undiscoveredLocations.map((loc) => ({
      type: "location" as const,
      id: loc.id,
      threshold: getLocationThreshold(loc),
      locationType: loc.type,
    })),
    ...undiscoveredKnownConnections.map((conn) => ({
      type: "knownConnection" as const,
      id: createConnectionId(conn.fromAreaId, conn.toAreaId),
      threshold: baseChance * KNOWN_CONNECTION_MULTIPLIER,
    })),
    ...undiscoveredUnknownConnections.map((conn) => ({
      type: "unknownConnection" as const,
      id: createConnectionId(conn.fromAreaId, conn.toAreaId),
      threshold: baseChance * UNKNOWN_CONNECTION_MULTIPLIER,
    })),
  ]

  return { discoverables, baseChance }
}

/**
 * Execute Explore action - discover a location or connection within current area
 *
 * Per spec (line 60): "Exploring (can also discover connections to *new* areas with
 * lower probability, but does not reveal the area itself - just that a connection
 * exists to somewhere unknown)"
 */
export async function* executeExplore(state: WorldState, _action: ExploreAction): ActionGenerator {
  const tickBefore = state.time.currentTick
  const rolls: RngRoll[] = []

  // Check preconditions
  if (state.player.skills.Exploration.level === 0) {
    yield {
      done: true,
      log: createFailureLog(state, "Explore", "NOT_IN_EXPLORATION_GUILD", "not_enrolled", {
        skill: "Exploration",
        currentLevel: 0,
      }),
    }
    return
  }

  const exploration = state.exploration!
  const currentArea = exploration.areas.get(exploration.playerState.currentAreaId)!
  const level = state.player.skills.Exploration.level

  // Ensure area is fully generated (content + connections + name)
  await ensureAreaFullyGenerated(state.rng, exploration, currentArea)

  // Build discoverables list using shared logic
  const { discoverables } = buildDiscoverables(state, currentArea)

  if (discoverables.length === 0) {
    const areaName = getAreaDisplayName(currentArea.id, currentArea)
    yield {
      done: true,
      log: {
        ...createFailureLog(state, "Explore", "AREA_FULLY_EXPLORED", "all_discoverable_found", {
          currentAreaId: currentArea.id,
          currentAreaName: areaName,
          distance: currentArea.distance,
        }),
        explorationLog: { areaFullyExplored: true },
      },
    }
    return
  }

  const rollInterval = getRollInterval(level)

  // Max threshold determines expected ticks to find anything
  const maxThreshold = Math.max(...discoverables.map((d) => d.threshold))

  // Roll until success or session ends
  // Overlaid threshold model: roll 0-100, check which thresholds are hit
  let ticksConsumed = 0
  let discoveredLocationId: string | undefined
  let discoveredConnectionId: string | undefined
  let connectionToUnknownArea = false
  let discoveredUnknownAreaId: string | undefined
  let succeeded = false
  let accumulatedTicks = 0
  let pickedThreshold = 0 // Will store the threshold of the specific item found

  while (!succeeded) {
    accumulatedTicks += rollInterval
    const ticksThisRoll = Math.floor(accumulatedTicks)
    accumulatedTicks -= ticksThisRoll

    if (ticksThisRoll > 0) {
      // Yield ticks as they're consumed
      for (let i = 0; i < ticksThisRoll; i++) {
        consumeTime(state, 1)
        ticksConsumed++
        yield { done: false }
      }
    }

    // Roll 0-1 (equivalent to 0-100%)
    const rollValue = rollFloat(state.rng, 0, 1, `explore_roll_${ticksConsumed}`)

    // Check which thresholds are hit (roll must be <= threshold)
    const hits = discoverables.filter((d) => rollValue <= d.threshold)

    if (hits.length > 0) {
      // Pick randomly among hits (equal probability)
      const pickIndex = Math.floor(
        rollFloat(state.rng, 0, hits.length, `explore_pick_${ticksConsumed}`)
      )
      const picked = hits[pickIndex]

      // Store the threshold of the specific item we found for luck calculation
      pickedThreshold = picked.threshold

      if (picked.type === "location") {
        exploration.playerState.knownLocationIds.push(picked.id)
        discoveredLocationId = picked.id

        // Show discovery feedback
        const locationName = getLocationDisplayName(picked.id, currentArea.id, state)
        yield {
          done: false,
          feedback: { discovered: { type: "location", name: locationName, id: picked.id } },
        }
      } else {
        exploration.playerState.knownConnectionIds.push(picked.id)
        discoveredConnectionId = picked.id
        connectionToUnknownArea = picked.type === "unknownConnection"

        // Parse connection ID to find the target area (format: "areaId1->areaId2")
        const [areaId1, areaId2] = picked.id.split("->")
        const targetAreaId = areaId1 === currentArea.id ? areaId2 : areaId1

        // If we discovered a connection to an unknown area, generate its name
        if (connectionToUnknownArea) {
          discoveredUnknownAreaId = targetAreaId
          const targetArea = exploration.areas.get(targetAreaId)
          if (targetArea) {
            await ensureAreaFullyGenerated(state.rng, exploration, targetArea)
          }

          // Show discovery feedback with "new area" annotation
          const targetName = targetArea
            ? getAreaDisplayName(targetAreaId, targetArea)
            : "unknown area"
          yield {
            done: false,
            feedback: {
              discovered: {
                type: "connection",
                name: `connection to ${targetName} (new area)`,
                id: picked.id,
              },
            },
          }
        } else {
          // Known connection - show the destination name
          const targetArea = exploration.areas.get(targetAreaId)
          const targetName = targetArea
            ? getAreaDisplayName(targetAreaId, targetArea)
            : "unknown area"
          yield {
            done: false,
            feedback: {
              discovered: {
                type: "connection",
                name: `connection to ${targetName}`,
                id: picked.id,
              },
            },
          }
        }
      }

      // Record the roll for display (show max threshold as the "chance")
      rolls.push({
        label: `explore_roll_${ticksConsumed}`,
        probability: maxThreshold,
        result: true,
        rngCounter: state.rng.counter,
      })

      succeeded = true
    } else {
      // Record miss
      rolls.push({
        label: `explore_roll_${ticksConsumed}`,
        probability: maxThreshold,
        result: false,
        rngCounter: state.rng.counter,
      })
    }
  }

  if (!succeeded) {
    // No discovery = no XP
    yield {
      done: true,
      log: {
        tickBefore,
        actionType: "Explore",
        parameters: {},
        success: false,
        failureType: "AREA_FULLY_EXPLORED",
        timeConsumed: ticksConsumed,
        rngRolls: rolls,
        stateDeltaSummary: "Explore interrupted",
      },
    }
    return
  }

  // Grant 1 XP on success: 1 discovery (location or connection)
  const xpGained = 1
  const { levelUps } = grantExplorationXP(state, xpGained)

  // Calculate luck info based on the SPECIFIC item we found
  // Note: This is an approximation. In the overlaid threshold model, the true
  // probability of finding a specific item depends on how many other thresholds
  // overlap with it. However, using the item's individual threshold provides
  // more meaningful feedback to the user about how lucky they were to find
  // that particular item, rather than just "anything".
  const specificExpectedTicks = calculateExpectedTicks(pickedThreshold, rollInterval)
  const luckInfo = updateLuckTracking(exploration, specificExpectedTicks, ticksConsumed)

  // Check if area is now fully explored
  const remainingLocations = currentArea.locations.filter(
    (loc) => !exploration.playerState.knownLocationIds.includes(loc.id)
  )
  const knownAreaIds = new Set(exploration.playerState.knownAreaIds)
  const remainingKnownConnections = exploration.connections.filter((conn) => {
    const isFromCurrent = conn.fromAreaId === currentArea.id
    const isToCurrent = conn.toAreaId === currentArea.id
    if (!isFromCurrent && !isToCurrent) return false
    const connId = createConnectionId(conn.fromAreaId, conn.toAreaId)
    const targetId = isFromCurrent ? conn.toAreaId : conn.fromAreaId
    return (
      !exploration.playerState.knownConnectionIds.includes(connId) && knownAreaIds.has(targetId)
    )
  })
  // Note: We don't count unknown connections as "remaining" for "fully explored" status
  const areaFullyExplored =
    remainingLocations.length === 0 && remainingKnownConnections.length === 0

  let discovered: string
  if (discoveredLocationId) {
    const location = currentArea.locations.find((loc) => loc.id === discoveredLocationId)
    if (location?.gatheringSkillType) {
      discovered = location.gatheringSkillType === "Mining" ? "ore vein" : "tree stand"
    } else if (location?.type === ExplorationLocationType.MOB_CAMP) {
      discovered = "enemy camp"
    } else {
      discovered = "node"
    }
  } else if (connectionToUnknownArea && discoveredUnknownAreaId) {
    const targetArea = exploration.areas.get(discoveredUnknownAreaId)
    const areaName = getAreaDisplayName(discoveredUnknownAreaId, targetArea)
    discovered = `connection to ${areaName}`
  } else if (discoveredConnectionId) {
    // Known connection - show the destination name
    const [areaId1, areaId2] = discoveredConnectionId.split("->")
    const targetAreaId = areaId1 === currentArea.id ? areaId2 : areaId1
    const targetArea = exploration.areas.get(targetAreaId)
    const targetName = targetArea ? getAreaDisplayName(targetAreaId, targetArea) : "unknown area"
    discovered = `connection to ${targetName}`
  } else {
    discovered = "unknown discovery"
  }

  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "Explore",
      parameters: {},
      success: true,
      timeConsumed: ticksConsumed,
      skillGained: { skill: "Exploration", amount: xpGained },
      levelUps,
      rngRolls: rolls,
      stateDeltaSummary: `Discovered ${discovered}`,
      explorationLog: {
        discoveredLocationId,
        discoveredConnectionId,
        connectionToUnknownArea,
        areaFullyExplored,
        luckInfo,
      },
    },
  }
}

// ============================================================================
// Travel Action
// ============================================================================

/**
 * Find shortest path between two areas using known connections.
 * Uses BFS for shortest path by hop count, then calculates total travel time.
 */
export function findPath(
  state: WorldState,
  fromAreaId: AreaID,
  toAreaId: AreaID
): { path: AreaID[]; connections: AreaConnection[]; totalTime: number } | null {
  const exploration = state.exploration!
  const knownConnectionIds = new Set(exploration.playerState.knownConnectionIds)

  // BFS for shortest path
  const queue: { areaId: AreaID; path: AreaID[]; connections: AreaConnection[] }[] = [
    { areaId: fromAreaId, path: [fromAreaId], connections: [] },
  ]
  const visited = new Set<AreaID>([fromAreaId])

  while (queue.length > 0) {
    const current = queue.shift()!

    if (current.areaId === toAreaId) {
      // Calculate total travel time
      let totalTime = 0
      for (const conn of current.connections) {
        totalTime += BASE_TRAVEL_TIME * conn.travelTimeMultiplier
      }
      return { path: current.path, connections: current.connections, totalTime }
    }

    // Find all known connections from current area
    for (const conn of exploration.connections) {
      if (!isConnectionKnown(knownConnectionIds, conn.fromAreaId, conn.toAreaId)) {
        continue
      }

      let nextAreaId: AreaID | null = null
      if (conn.fromAreaId === current.areaId && !visited.has(conn.toAreaId)) {
        nextAreaId = conn.toAreaId
      } else if (conn.toAreaId === current.areaId && !visited.has(conn.fromAreaId)) {
        nextAreaId = conn.fromAreaId
      }

      if (nextAreaId) {
        visited.add(nextAreaId)
        queue.push({
          areaId: nextAreaId,
          path: [...current.path, nextAreaId],
          connections: [...current.connections, conn],
        })
      }
    }
  }

  return null
}

/**
 * Get all known areas reachable from current location with their travel times.
 * Used for "far travel" mode to show available destinations.
 */
export function getReachableAreas(
  state: WorldState
): Array<{ areaId: AreaID; travelTime: number; hops: number }> {
  const exploration = state.exploration!
  const currentAreaId = exploration.playerState.currentAreaId
  const results: Array<{ areaId: AreaID; travelTime: number; hops: number }> = []

  for (const areaId of exploration.playerState.knownAreaIds) {
    if (areaId === currentAreaId) continue

    const pathResult = findPath(state, currentAreaId, areaId)
    if (pathResult) {
      results.push({
        areaId,
        travelTime: pathResult.totalTime,
        hops: pathResult.path.length - 1,
      })
    }
  }

  // Sort by travel time
  results.sort((a, b) => a.travelTime - b.travelTime)
  return results
}

/**
 * Execute ExplorationTravel action - move between areas
 * Only allows travel to directly connected areas with known connections.
 * For multi-hop travel, use executeFarTravel instead.
 */
export async function* executeExplorationTravel(
  state: WorldState,
  action: ExplorationTravelAction
): ActionGenerator {
  const tickBefore = state.time.currentTick
  const exploration = state.exploration!
  const { destinationAreaId, scavenge } = action

  // Check preconditions
  if (exploration.playerState.currentAreaId === destinationAreaId) {
    const destinationArea = exploration.areas.get(destinationAreaId)
    const destinationName = getAreaDisplayName(destinationAreaId, destinationArea)
    yield {
      done: true,
      log: createFailureLog(state, "ExplorationTravel", "ALREADY_IN_AREA", "already_here", {
        destination: destinationName,
        destinationId: destinationAreaId,
      }),
    }
    return
  }

  const currentAreaId = exploration.playerState.currentAreaId
  const knownConnectionIds = new Set(exploration.playerState.knownConnectionIds)
  const destinationIsKnown = exploration.playerState.knownAreaIds.includes(destinationAreaId)

  // Check for direct known connection from current area to destination
  // Travel is only allowed to directly connected areas (no multi-hop pathfinding)
  const directConnection = exploration.connections.find(
    (conn) =>
      isConnectionKnown(knownConnectionIds, conn.fromAreaId, conn.toAreaId) &&
      ((conn.fromAreaId === currentAreaId && conn.toAreaId === destinationAreaId) ||
        (conn.toAreaId === currentAreaId && conn.fromAreaId === destinationAreaId))
  )

  if (!directConnection) {
    // No direct connection - cannot travel (must have a known connection from current area)
    // Determine sub-reason: undiscovered vs no_route
    const reason = destinationIsKnown ? "no_route" : "undiscovered"
    const destinationArea = exploration.areas.get(destinationAreaId)
    const destinationName = getAreaDisplayName(destinationAreaId, destinationArea)

    yield {
      done: true,
      log: createFailureLog(state, "ExplorationTravel", "NO_PATH_TO_DESTINATION", reason, {
        destination: destinationName,
        destinationId: destinationAreaId,
      }),
    }
    return
  }

  // Calculate travel time
  let travelTime = Math.round(BASE_TRAVEL_TIME * directConnection.travelTimeMultiplier)

  // Double time if scavenging
  if (scavenge) {
    travelTime *= 2
  }

  // Yield ticks during travel
  for (let tick = 0; tick < travelTime; tick++) {
    consumeTime(state, 1)
    yield { done: false }
  }

  // Move to destination
  exploration.playerState.currentAreaId = destinationAreaId
  exploration.playerState.currentLocationId = null // Arrive at hub (clearing)

  // Discover the area if it was unknown (direct travel to unknown area)
  const discoveredOnArrival = !destinationIsKnown
  if (discoveredOnArrival) {
    exploration.playerState.knownAreaIds.push(destinationAreaId)
  }

  // Ensure destination area is fully generated (content + connections + name)
  const destArea = exploration.areas.get(destinationAreaId)!
  await ensureAreaFullyGenerated(state.rng, exploration, destArea)

  // TODO: Scavenge rolls for gathering drops (future implementation)

  const areaDisplayName = getAreaDisplayName(destinationAreaId, destArea)
  const summary = discoveredOnArrival
    ? `Traveled to ${areaDisplayName} (discovered)`
    : `Traveled to ${areaDisplayName}`

  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "ExplorationTravel",
      parameters: { destinationAreaId, scavenge },
      success: true,
      timeConsumed: travelTime,
      rngRolls: [],
      stateDeltaSummary: summary,
    },
  }
}

/**
 * Execute FarTravel action - multi-hop travel to any known reachable area.
 * Uses shortest path routing through known connections.
 */
export async function* executeFarTravel(
  state: WorldState,
  action: FarTravelAction
): ActionGenerator {
  const tickBefore = state.time.currentTick
  const exploration = state.exploration!
  const { destinationAreaId, scavenge } = action

  // Check preconditions
  if (exploration.playerState.currentAreaId === destinationAreaId) {
    const destinationArea = exploration.areas.get(destinationAreaId)
    const destinationName = getAreaDisplayName(destinationAreaId, destinationArea)
    yield {
      done: true,
      log: createFailureLog(state, "FarTravel", "ALREADY_IN_AREA", "already_here", {
        destination: destinationName,
        destinationId: destinationAreaId,
      }),
    }
    return
  }

  const currentAreaId = exploration.playerState.currentAreaId

  // Destination must be known for far travel
  if (!exploration.playerState.knownAreaIds.includes(destinationAreaId)) {
    const destinationArea = exploration.areas.get(destinationAreaId)
    const destinationName = getAreaDisplayName(destinationAreaId, destinationArea)
    yield {
      done: true,
      log: createFailureLog(state, "FarTravel", "AREA_NOT_KNOWN", "undiscovered", {
        destination: destinationName,
        destinationId: destinationAreaId,
      }),
    }
    return
  }

  // Find shortest path to destination
  const pathResult = findPath(state, currentAreaId, destinationAreaId)

  if (!pathResult) {
    const destinationArea = exploration.areas.get(destinationAreaId)
    const destinationName = getAreaDisplayName(destinationAreaId, destinationArea)
    yield {
      done: true,
      log: createFailureLog(state, "FarTravel", "NO_PATH_TO_DESTINATION", "no_route", {
        destination: destinationName,
        destinationId: destinationAreaId,
      }),
    }
    return
  }

  // Calculate travel time
  let travelTime = Math.round(pathResult.totalTime)

  // Double time if scavenging
  if (scavenge) {
    travelTime *= 2
  }

  // Yield ticks during travel
  for (let tick = 0; tick < travelTime; tick++) {
    consumeTime(state, 1)
    yield { done: false }
  }

  // Move to destination
  exploration.playerState.currentAreaId = destinationAreaId
  exploration.playerState.currentLocationId = null // Arrive at hub (clearing)

  // Ensure destination area is fully generated (content + connections + name)
  const destArea = exploration.areas.get(destinationAreaId)!
  await ensureAreaFullyGenerated(state.rng, exploration, destArea)

  // TODO: Scavenge rolls for gathering drops (future implementation)

  const areaDisplayName = getAreaDisplayName(destinationAreaId, destArea)
  const hops = pathResult.path.length - 1
  const summary = `Far traveled to ${areaDisplayName} (${hops} hop${hops !== 1 ? "s" : ""})`

  yield {
    done: true,
    log: {
      tickBefore,
      actionType: "FarTravel",
      parameters: { destinationAreaId, scavenge },
      success: true,
      timeConsumed: travelTime,
      rngRolls: [],
      stateDeltaSummary: summary,
    },
  }
}
