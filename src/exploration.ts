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
  ActionLog,
  RngRoll,
  ExplorationLuckInfo,
  LevelUp,
} from "./types.js"
import { rollFloat, roll } from "./rng.js"
import { ExplorationLocationType } from "./types.js"
import { consumeTime } from "./stateHelpers.js"
import { generateNodesForArea } from "./world.js"

// ============================================================================
// Constants
// ============================================================================

/** Base travel time in ticks (before multiplier) */
export const BASE_TRAVEL_TIME = 10

/**
 * Probability multiplier for discovering connections to unknown areas
 * during Explore action (relative to known area connections)
 */
export const UNKNOWN_CONNECTION_DISCOVERY_MULTIPLIER = 0.25

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

  // Clamp between 0 and 1
  return Math.max(0, Math.min(1, totalChance))
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
 * Ensure an area is fully generated INCLUDING its connections.
 * This should be called when first visiting or discovering an area.
 * It will:
 * 1. Generate the area's content (locations)
 * 2. Create placeholders for the next distance if they don't exist
 * 3. Generate connections from this area to same/adjacent distances
 */
export function ensureAreaFullyGenerated(
  rng: RngState,
  exploration: NonNullable<WorldState["exploration"]>,
  area: Area
): void {
  // Skip if already fully generated (has connections)
  const hasConnections = exploration.connections.some(
    (c) => c.fromAreaId === area.id || c.toAreaId === area.id
  )
  if (area.generated && hasConnections) return

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
 * Roll for travel time multiplier (1-4)
 * Distribution: 15% = 1x, 35% = 2x, 35% = 3x, 15% = 4x
 */
function rollTravelMultiplier(rng: RngState, label: string): 1 | 2 | 3 | 4 {
  const rollValue = rollFloat(rng, 0, 1, label)
  if (rollValue < 0.15) return 1
  if (rollValue < 0.5) return 2 // 15% + 35% = 50%
  if (rollValue < 0.85) return 3 // 50% + 35% = 85%
  return 4 // Remaining 15%
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
export function grantExplorationGuildBenefits(state: WorldState): {
  discoveredAreaId: AreaID
  discoveredConnectionId: string
} {
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

  // Ensure the area is fully generated (content + connections)
  ensureAreaFullyGenerated(state.rng, exploration, areaToDiscover)

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
  actionType: "Survey" | "Explore" | "ExplorationTravel",
  failureType: string
): ActionLog {
  return {
    tickBefore: state.time.currentTick,
    actionType,
    parameters: {},
    success: false,
    failureType: failureType as ActionLog["failureType"],
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

function getExplorationXPThreshold(currentLevel: number): number {
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
function getKnowledgeParams(
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
 * Execute Survey action - discover a new area connected to current area
 *
 * Per spec (lines 76-77): "If the roll hits an already-discovered area, the roll is wasted.
 * Keep rolling until a new area is found (or player abandons)"
 */
export function executeSurvey(state: WorldState, _action: SurveyAction): ActionLog {
  const tickBefore = state.time.currentTick
  const rolls: RngRoll[] = []

  // Check preconditions
  if (state.player.skills.Exploration.level === 0) {
    return createFailureLog(state, "Survey", "NOT_IN_EXPLORATION_GUILD")
  }

  if (state.time.sessionRemainingTicks <= 0) {
    return createFailureLog(state, "Survey", "SESSION_ENDED")
  }

  const exploration = state.exploration!
  const currentArea = exploration.areas.get(exploration.playerState.currentAreaId)!
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

  if (allConnections.length === 0) {
    return {
      ...createFailureLog(state, "Survey", "NO_CONNECTIONS"),
      timeConsumed: 0,
    }
  }

  // Check if there are ANY undiscovered areas connected
  const knownAreaIds = new Set(exploration.playerState.knownAreaIds)
  const hasUndiscoveredAreas = allConnections.some((conn) => {
    const targetId =
      conn.fromAreaId === exploration.playerState.currentAreaId ? conn.toAreaId : conn.fromAreaId
    return !knownAreaIds.has(targetId)
  })

  if (!hasUndiscoveredAreas) {
    return {
      ...createFailureLog(state, "Survey", "NO_UNDISCOVERED_AREAS"),
      timeConsumed: 0,
    }
  }

  // Roll until we find an UNDISCOVERED area or session ends
  // Per spec: hitting a known area wastes the roll
  let ticksConsumed = 0
  let discoveredAreaId: AreaID | undefined
  let discoveredConnectionId: string | undefined
  let succeeded = false
  let accumulatedTicks = 0

  while (!succeeded && state.time.sessionRemainingTicks > 0) {
    // Accumulate ticks based on roll interval
    accumulatedTicks += rollInterval
    const ticksThisRoll = Math.floor(accumulatedTicks)
    accumulatedTicks -= ticksThisRoll

    if (ticksThisRoll > 0) {
      if (state.time.sessionRemainingTicks < ticksThisRoll) {
        ticksConsumed += state.time.sessionRemainingTicks
        consumeTime(state, state.time.sessionRemainingTicks)
        break
      }

      consumeTime(state, ticksThisRoll)
      ticksConsumed += ticksThisRoll
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

      // Discover the area - ensure it's fully generated (content + connections)
      const targetArea = exploration.areas.get(targetId)!
      ensureAreaFullyGenerated(state.rng, exploration, targetArea)

      // Mark area and connection as known
      exploration.playerState.knownAreaIds.push(targetId)
      const connId = createConnectionId(selectedConn.fromAreaId, selectedConn.toAreaId)
      exploration.playerState.knownConnectionIds.push(connId)

      discoveredAreaId = targetId
      discoveredConnectionId = connId
      succeeded = true
    }
  }

  if (!succeeded) {
    // No discovery = no XP
    return {
      tickBefore,
      actionType: "Survey",
      parameters: {},
      success: false,
      failureType: "SESSION_ENDED",
      timeConsumed: ticksConsumed,
      rngRolls: rolls,
      stateDeltaSummary: "Survey interrupted - session ended",
    }
  }

  // Grant 2 XP on success: 1 for area discovery + 1 for connection discovery
  const xpGained = 2
  const { levelUps } = grantExplorationXP(state, xpGained)

  // Calculate luck info
  const luckInfo = updateLuckTracking(exploration, expectedTicks, ticksConsumed)

  return {
    tickBefore,
    actionType: "Survey",
    parameters: {},
    success: true,
    timeConsumed: ticksConsumed,
    skillGained: { skill: "Exploration", amount: xpGained },
    levelUps,
    rngRolls: rolls,
    stateDeltaSummary: `Discovered area ${discoveredAreaId}`,
    explorationLog: {
      discoveredAreaId,
      discoveredConnectionId,
      luckInfo,
    },
  }
}

// ============================================================================
// Explore Action
// ============================================================================

/**
 * Execute Explore action - discover a location or connection within current area
 *
 * Per spec (line 60): "Exploring (can also discover connections to *new* areas with
 * lower probability, but does not reveal the area itself - just that a connection
 * exists to somewhere unknown)"
 */
export function executeExplore(state: WorldState, _action: ExploreAction): ActionLog {
  const tickBefore = state.time.currentTick
  const rolls: RngRoll[] = []

  // Check preconditions
  if (state.player.skills.Exploration.level === 0) {
    return createFailureLog(state, "Explore", "NOT_IN_EXPLORATION_GUILD")
  }

  if (state.time.sessionRemainingTicks <= 0) {
    return createFailureLog(state, "Explore", "SESSION_ENDED")
  }

  const exploration = state.exploration!
  const currentArea = exploration.areas.get(exploration.playerState.currentAreaId)!
  const level = state.player.skills.Exploration.level

  // Ensure area is fully generated (content + connections)
  ensureAreaFullyGenerated(state.rng, exploration, currentArea)

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

  const hasDiscoverables =
    undiscoveredLocations.length > 0 ||
    undiscoveredKnownConnections.length > 0 ||
    undiscoveredUnknownConnections.length > 0

  if (!hasDiscoverables) {
    return {
      ...createFailureLog(state, "Explore", "AREA_FULLY_EXPLORED"),
      explorationLog: { areaFullyExplored: true },
    }
  }

  // Calculate base success chance (used to derive individual thresholds)
  const knowledgeParams = getKnowledgeParams(state, currentArea)
  const baseChance = calculateSuccessChance({
    level,
    distance: currentArea.distance,
    ...knowledgeParams,
  })

  const rollInterval = getRollInterval(level)

  // Build list of discoverables with their individual thresholds
  // Threshold multipliers per spec:
  // - Connection to known area: 1.0×
  // - Mob camp: 0.5×
  // - Gathering node with skill: 0.5×
  // - Gathering node without skill: 0.05× (10× lower)
  // - Connection to unknown area: 0.25×
  type Discoverable = {
    type: "location" | "knownConnection" | "unknownConnection"
    id: string
    threshold: number // % chance per roll (0-1)
    locationType?: string
  }

  const getLocationThreshold = (loc: ExplorationLocation): number => {
    if (loc.type === "GATHERING_NODE" && loc.gatheringSkillType) {
      const skillLevel = state.player.skills[loc.gatheringSkillType]?.level ?? 0
      if (skillLevel === 0) {
        // 10x lower chance without skill
        return baseChance * 0.05
      }
      return baseChance * 0.5
    }
    // Mob camp
    return baseChance * 0.5
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
      threshold: baseChance * 1.0,
    })),
    ...undiscoveredUnknownConnections.map((conn) => ({
      type: "unknownConnection" as const,
      id: createConnectionId(conn.fromAreaId, conn.toAreaId),
      threshold: baseChance * UNKNOWN_CONNECTION_DISCOVERY_MULTIPLIER,
    })),
  ]

  // Max threshold determines expected ticks to find anything
  const maxThreshold = Math.max(...discoverables.map((d) => d.threshold))
  const expectedTicks = calculateExpectedTicks(maxThreshold, rollInterval)

  // Roll until success or session ends
  // Overlaid threshold model: roll 0-100, check which thresholds are hit
  let ticksConsumed = 0
  let discoveredLocationId: string | undefined
  let discoveredConnectionId: string | undefined
  let connectionToUnknownArea = false
  let succeeded = false
  let accumulatedTicks = 0

  while (!succeeded && state.time.sessionRemainingTicks > 0) {
    accumulatedTicks += rollInterval
    const ticksThisRoll = Math.floor(accumulatedTicks)
    accumulatedTicks -= ticksThisRoll

    if (ticksThisRoll > 0) {
      if (state.time.sessionRemainingTicks < ticksThisRoll) {
        ticksConsumed += state.time.sessionRemainingTicks
        consumeTime(state, state.time.sessionRemainingTicks)
        break
      }

      consumeTime(state, ticksThisRoll)
      ticksConsumed += ticksThisRoll
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

      if (picked.type === "location") {
        exploration.playerState.knownLocationIds.push(picked.id)
        discoveredLocationId = picked.id
      } else {
        exploration.playerState.knownConnectionIds.push(picked.id)
        discoveredConnectionId = picked.id
        connectionToUnknownArea = picked.type === "unknownConnection"
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
    return {
      tickBefore,
      actionType: "Explore",
      parameters: {},
      success: false,
      failureType: "SESSION_ENDED",
      timeConsumed: ticksConsumed,
      rngRolls: rolls,
      stateDeltaSummary: "Explore interrupted - session ended",
    }
  }

  // Grant 1 XP on success: 1 discovery (location or connection)
  const xpGained = 1
  const { levelUps } = grantExplorationXP(state, xpGained)

  // Calculate luck info
  const luckInfo = updateLuckTracking(exploration, expectedTicks, ticksConsumed)

  // Check if area is now fully explored
  const remainingLocations = currentArea.locations.filter(
    (loc) => !exploration.playerState.knownLocationIds.includes(loc.id)
  )
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
  } else if (connectionToUnknownArea) {
    discovered = `connection to unknown area (${discoveredConnectionId})`
  } else {
    discovered = `connection ${discoveredConnectionId}`
  }

  return {
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
  }
}

// ============================================================================
// Travel Action
// ============================================================================

/**
 * Find shortest path between two areas using known connections
 */
function findPath(
  state: WorldState,
  fromAreaId: AreaID,
  toAreaId: AreaID
): { path: AreaID[]; connections: AreaConnection[] } | null {
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
      return { path: current.path, connections: current.connections }
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
 * Execute ExplorationTravel action - move between areas
 */
export function executeExplorationTravel(
  state: WorldState,
  action: ExplorationTravelAction
): ActionLog {
  const tickBefore = state.time.currentTick
  const exploration = state.exploration!
  const { destinationAreaId, scavenge } = action

  // Check preconditions
  if (exploration.playerState.currentAreaId === destinationAreaId) {
    return createFailureLog(state, "ExplorationTravel", "ALREADY_IN_AREA")
  }

  if (state.time.sessionRemainingTicks <= 0) {
    return createFailureLog(state, "ExplorationTravel", "SESSION_ENDED")
  }

  const currentAreaId = exploration.playerState.currentAreaId
  const knownConnectionIds = new Set(exploration.playerState.knownConnectionIds)
  const destinationIsKnown = exploration.playerState.knownAreaIds.includes(destinationAreaId)

  // Check for direct known connection from current area to destination
  const directConnection = exploration.connections.find(
    (conn) =>
      isConnectionKnown(knownConnectionIds, conn.fromAreaId, conn.toAreaId) &&
      ((conn.fromAreaId === currentAreaId && conn.toAreaId === destinationAreaId) ||
        (conn.toAreaId === currentAreaId && conn.fromAreaId === destinationAreaId))
  )

  // Determine path to destination
  let pathResult: { path: AreaID[]; connections: AreaConnection[] } | null

  if (directConnection) {
    // Direct travel via known connection - allowed even if destination is unknown
    pathResult = {
      path: [currentAreaId, destinationAreaId],
      connections: [directConnection],
    }
  } else {
    // Multi-hop path required - destination must be known
    if (!destinationIsKnown) {
      return createFailureLog(state, "ExplorationTravel", "AREA_NOT_KNOWN")
    }
    pathResult = findPath(state, currentAreaId, destinationAreaId)
  }

  if (!pathResult) {
    return createFailureLog(state, "ExplorationTravel", "NO_PATH_TO_DESTINATION")
  }

  // Calculate travel time
  let travelTime = 0
  for (const conn of pathResult.connections) {
    travelTime += BASE_TRAVEL_TIME * conn.travelTimeMultiplier
  }

  // Double time if scavenging
  if (scavenge) {
    travelTime *= 2
  }

  // Check if enough time
  if (state.time.sessionRemainingTicks < travelTime) {
    return {
      ...createFailureLog(state, "ExplorationTravel", "SESSION_ENDED"),
      timeConsumed: 0,
    }
  }

  // Consume time and move
  consumeTime(state, travelTime)
  exploration.playerState.currentAreaId = destinationAreaId
  exploration.playerState.currentLocationId = null // Arrive at hub (clearing)

  // Discover the area if it was unknown (direct travel to unknown area)
  const discoveredOnArrival = !destinationIsKnown
  if (discoveredOnArrival) {
    exploration.playerState.knownAreaIds.push(destinationAreaId)
  }

  // Ensure destination area is fully generated (content + connections)
  const destArea = exploration.areas.get(destinationAreaId)!
  ensureAreaFullyGenerated(state.rng, exploration, destArea)

  // TODO: Scavenge rolls for gathering drops (future implementation)

  const summary = discoveredOnArrival
    ? `Traveled to ${destinationAreaId} (discovered)`
    : `Traveled to ${destinationAreaId}`

  return {
    tickBefore,
    actionType: "ExplorationTravel",
    parameters: { destinationAreaId, scavenge },
    success: true,
    timeConsumed: travelTime,
    rngRolls: [],
    stateDeltaSummary: summary,
  }
}
