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
} from "./types.js"
import { rollFloat, roll } from "./rng.js"
import { addXPToSkill, ExplorationLocationType } from "./types.js"

// Base travel time in ticks (before multiplier)
export const BASE_TRAVEL_TIME = 10

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
 * Location generation uses RNG for randomness.
 */
export function generateArea(rng: RngState, distance: number, indexInDistance: number): Area {
  const id: AreaID = `area-d${distance}-i${indexInDistance}`

  // Generate locations for this area
  const locations = generateAreaLocations(rng, id, distance)

  return {
    id,
    distance,
    generated: true,
    locations,
    indexInDistance,
  }
}

/**
 * Generate locations within an area.
 * Each potential location type rolls independently for existence.
 * Most rolls fail, so most areas are naturally sparse.
 */
function generateAreaLocations(
  rng: RngState,
  areaId: AreaID,
  distance: number
): ExplorationLocation[] {
  const locations: ExplorationLocation[] = []
  let locationIndex = 0

  // Roll for Mining node (one roll per gathering skill type)
  if (rollFloat(rng, 0, 1, `loc_mining_${areaId}`) < 0.3) {
    locations.push({
      id: `${areaId}-loc-${locationIndex++}`,
      areaId,
      type: ExplorationLocationType.GATHERING_NODE,
      gatheringSkillType: "Mining",
    })
  }

  // Roll for Woodcutting node
  if (rollFloat(rng, 0, 1, `loc_woodcutting_${areaId}`) < 0.3) {
    locations.push({
      id: `${areaId}-loc-${locationIndex++}`,
      areaId,
      type: ExplorationLocationType.GATHERING_NODE,
      gatheringSkillType: "Woodcutting",
    })
  }

  // Roll for Mob camp
  if (rollFloat(rng, 0, 1, `loc_mob_${areaId}`) < 0.25) {
    // Difficulty = area distance ± 3, normally distributed around 0
    const difficultyOffset = Math.round(rollFloat(rng, -3, 3, `mob_difficulty_${areaId}`))
    locations.push({
      id: `${areaId}-loc-${locationIndex++}`,
      areaId,
      type: ExplorationLocationType.MOB_CAMP,
      creatureType: "creature", // Placeholder - creature types TBD
      difficulty: distance + difficultyOffset,
    })
  }

  return locations
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
  const roll = rollFloat(rng, 0, 1, label)
  if (roll < 0.15) return 0
  if (roll < 0.5) return 1 // 15% + 35% = 50%
  if (roll < 0.85) return 2 // 50% + 35% = 85%
  return 3 // Remaining 15%
}

/**
 * Roll for travel time multiplier (1-4)
 * Distribution: 15% = 1x, 35% = 2x, 35% = 3x, 15% = 4x
 */
function rollTravelMultiplier(rng: RngState, label: string): 1 | 2 | 3 | 4 {
  const roll = rollFloat(rng, 0, 1, label)
  if (roll < 0.15) return 1
  if (roll < 0.5) return 2 // 15% + 35% = 50%
  if (roll < 0.85) return 3 // 50% + 35% = 85%
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
    knownAreaIds: AreaID[]
    knownLocationIds: string[]
    knownConnectionIds: string[]
    totalLuckDelta: number
    currentStreak: number
  }
}

/**
 * Initialize exploration state for a new game.
 * Creates town and generates distance 1 areas (but player doesn't know them yet).
 */
export function initializeExplorationState(rng: RngState): ExplorationStateData {
  const areas = new Map<AreaID, Area>()
  const connections: AreaConnection[] = []

  // Generate town
  const town = generateTown()
  areas.set(town.id, town)

  // Generate all distance 1 areas (5 areas per Fibonacci)
  const distance1Count = getAreaCountForDistance(1)
  for (let i = 0; i < distance1Count; i++) {
    const area = generateArea(rng, 1, i)
    areas.set(area.id, area)
  }

  // Generate town connections to all distance 1 areas
  const townConnections = generateAreaConnections(rng, town, Array.from(areas.values()))
  connections.push(...townConnections)

  return {
    areas,
    connections,
    playerState: {
      currentAreaId: "TOWN",
      knownAreaIds: ["TOWN"],
      knownLocationIds: [],
      knownConnectionIds: [],
      totalLuckDelta: 0,
      currentStreak: 0,
    },
  }
}

// ============================================================================
// Action Execution
// ============================================================================

/**
 * Helper to consume time from state
 */
function consumeTime(state: WorldState, ticks: number): void {
  state.time.currentTick += ticks
  state.time.sessionRemainingTicks -= ticks
}

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
 * Grant XP to Exploration skill and return level ups
 */
function grantExplorationXP(
  state: WorldState,
  amount: number
): { levelUps: ActionLog["levelUps"] } {
  const result = addXPToSkill(state.player.skills.Exploration, amount)
  state.player.skills.Exploration = result.skill
  const levelUps = result.levelUps.map((lu) => ({ ...lu, skill: "Exploration" as const }))
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
    const connId = `${conn.fromAreaId}->${conn.toAreaId}`
    const reverseConnId = `${conn.toAreaId}->${conn.fromAreaId}`
    if (knownConnectionIds.has(connId) || knownConnectionIds.has(reverseConnId)) {
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
        const connId = `${conn.fromAreaId}->${conn.toAreaId}`
        const reverseConnId = `${conn.toAreaId}->${conn.fromAreaId}`
        const isConnectedToCurrent =
          (conn.fromAreaId === currentArea.id && conn.toAreaId === area.id) ||
          (conn.toAreaId === currentArea.id && conn.fromAreaId === area.id)
        return (
          isConnectedToCurrent &&
          (knownConnectionIds.has(connId) || knownConnectionIds.has(reverseConnId))
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

/**
 * Execute Survey action - discover a new area connected to current area
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

  // Find undiscovered areas that can be reached from current area
  const knownAreaIds = new Set(exploration.playerState.knownAreaIds)
  const possibleConnections = exploration.connections.filter((conn) => {
    const isFromCurrent = conn.fromAreaId === exploration.playerState.currentAreaId
    const isToCurrent = conn.toAreaId === exploration.playerState.currentAreaId
    if (!isFromCurrent && !isToCurrent) return false
    const targetId = isFromCurrent ? conn.toAreaId : conn.fromAreaId
    return !knownAreaIds.has(targetId)
  })

  if (possibleConnections.length === 0) {
    return {
      ...createFailureLog(state, "Survey", "NO_UNDISCOVERED_AREAS"),
      timeConsumed: 0,
    }
  }

  // Roll until success or session ends
  let ticksConsumed = 0
  let discoveredAreaId: AreaID | undefined
  let discoveredConnectionId: string | undefined
  let succeeded = false

  // Fractional tick accumulator for roll intervals < 2
  let accumulatedTicks = 0

  while (!succeeded && state.time.sessionRemainingTicks > 0) {
    // Accumulate ticks based on roll interval
    accumulatedTicks += rollInterval
    const ticksThisRoll = Math.floor(accumulatedTicks)
    accumulatedTicks -= ticksThisRoll

    if (ticksThisRoll > 0) {
      if (state.time.sessionRemainingTicks < ticksThisRoll) {
        consumeTime(state, state.time.sessionRemainingTicks)
        ticksConsumed += state.time.sessionRemainingTicks
        break
      }

      consumeTime(state, ticksThisRoll)
      ticksConsumed += ticksThisRoll
    }

    // Roll for success
    const success = roll(state.rng, successChance, `survey_roll_${ticksConsumed}`, rolls)

    if (success) {
      // Pick a random undiscovered connected area
      const connIndex = Math.floor(
        rollFloat(state.rng, 0, possibleConnections.length, `survey_pick_${ticksConsumed}`)
      )
      const selectedConn = possibleConnections[connIndex]
      const targetId =
        selectedConn.fromAreaId === exploration.playerState.currentAreaId
          ? selectedConn.toAreaId
          : selectedConn.fromAreaId

      // Discover the area and connection
      exploration.playerState.knownAreaIds.push(targetId)
      const connId = `${selectedConn.fromAreaId}->${selectedConn.toAreaId}`
      exploration.playerState.knownConnectionIds.push(connId)

      discoveredAreaId = targetId
      discoveredConnectionId = connId
      succeeded = true
    }
  }

  if (!succeeded) {
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

  // Grant XP (per tick spent surveying, scaled by distance)
  const xpGained = ticksConsumed * (currentArea.distance + 1)
  const { levelUps } = grantExplorationXP(state, xpGained)

  // Calculate luck info
  const actualTicks = ticksConsumed
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

  const luckInfo: ExplorationLuckInfo = {
    actualTicks,
    expectedTicks: Math.round(expectedTicks),
    luckDelta,
    totalLuckDelta: exploration.playerState.totalLuckDelta,
    currentStreak: exploration.playerState.currentStreak,
  }

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

/**
 * Execute Explore action - discover a location or connection within current area
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

  // Find undiscovered locations in current area
  const knownLocationIds = new Set(exploration.playerState.knownLocationIds)
  const undiscoveredLocations = currentArea.locations.filter((loc) => !knownLocationIds.has(loc.id))

  // Find undiscovered connections from current area
  const knownConnectionIds = new Set(exploration.playerState.knownConnectionIds)
  const undiscoveredConnections = exploration.connections.filter((conn) => {
    const isFromCurrent = conn.fromAreaId === currentArea.id
    const isToCurrent = conn.toAreaId === currentArea.id
    if (!isFromCurrent && !isToCurrent) return false
    const connId = `${conn.fromAreaId}->${conn.toAreaId}`
    const reverseConnId = `${conn.toAreaId}->${conn.fromAreaId}`
    return !knownConnectionIds.has(connId) && !knownConnectionIds.has(reverseConnId)
  })

  if (undiscoveredLocations.length === 0 && undiscoveredConnections.length === 0) {
    return {
      ...createFailureLog(state, "Explore", "AREA_FULLY_EXPLORED"),
      explorationLog: { areaFullyExplored: true },
    }
  }

  // Calculate success chance
  const knowledgeParams = getKnowledgeParams(state, currentArea)
  const successChance = calculateSuccessChance({
    level,
    distance: currentArea.distance,
    ...knowledgeParams,
  })

  const rollInterval = getRollInterval(level)
  const expectedTicks = calculateExpectedTicks(successChance, rollInterval)

  // Roll until success or session ends
  let ticksConsumed = 0
  let discoveredLocationId: string | undefined
  let discoveredConnectionId: string | undefined
  let succeeded = false
  let accumulatedTicks = 0

  while (!succeeded && state.time.sessionRemainingTicks > 0) {
    accumulatedTicks += rollInterval
    const ticksThisRoll = Math.floor(accumulatedTicks)
    accumulatedTicks -= ticksThisRoll

    if (ticksThisRoll > 0) {
      if (state.time.sessionRemainingTicks < ticksThisRoll) {
        consumeTime(state, state.time.sessionRemainingTicks)
        ticksConsumed += state.time.sessionRemainingTicks
        break
      }

      consumeTime(state, ticksThisRoll)
      ticksConsumed += ticksThisRoll
    }

    // Roll for success
    const success = roll(state.rng, successChance, `explore_roll_${ticksConsumed}`, rolls)

    if (success) {
      // Combine all discoverable things and pick one
      const allDiscoverable = [
        ...undiscoveredLocations.map((loc) => ({ type: "location" as const, id: loc.id })),
        ...undiscoveredConnections.map((conn) => ({
          type: "connection" as const,
          id: `${conn.fromAreaId}->${conn.toAreaId}`,
        })),
      ]

      const pickIndex = Math.floor(
        rollFloat(state.rng, 0, allDiscoverable.length, `explore_pick_${ticksConsumed}`)
      )
      const picked = allDiscoverable[pickIndex]

      if (picked.type === "location") {
        exploration.playerState.knownLocationIds.push(picked.id)
        discoveredLocationId = picked.id
      } else {
        exploration.playerState.knownConnectionIds.push(picked.id)
        discoveredConnectionId = picked.id
      }

      succeeded = true
    }
  }

  if (!succeeded) {
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

  // Grant XP
  const xpGained = ticksConsumed * (currentArea.distance + 1)
  const { levelUps } = grantExplorationXP(state, xpGained)

  // Calculate luck info
  const actualTicks = ticksConsumed
  const luckDelta = Math.round(expectedTicks - actualTicks)
  exploration.playerState.totalLuckDelta += luckDelta

  if (luckDelta > 0) {
    exploration.playerState.currentStreak =
      exploration.playerState.currentStreak > 0 ? exploration.playerState.currentStreak + 1 : 1
  } else if (luckDelta < 0) {
    exploration.playerState.currentStreak =
      exploration.playerState.currentStreak < 0 ? exploration.playerState.currentStreak - 1 : -1
  }

  const luckInfo: ExplorationLuckInfo = {
    actualTicks,
    expectedTicks: Math.round(expectedTicks),
    luckDelta,
    totalLuckDelta: exploration.playerState.totalLuckDelta,
    currentStreak: exploration.playerState.currentStreak,
  }

  // Check if area is now fully explored
  const remainingLocations = currentArea.locations.filter(
    (loc) => !exploration.playerState.knownLocationIds.includes(loc.id)
  )
  const remainingConnections = exploration.connections.filter((conn) => {
    const isFromCurrent = conn.fromAreaId === currentArea.id
    const isToCurrent = conn.toAreaId === currentArea.id
    if (!isFromCurrent && !isToCurrent) return false
    const connId = `${conn.fromAreaId}->${conn.toAreaId}`
    return !exploration.playerState.knownConnectionIds.includes(connId)
  })
  const areaFullyExplored = remainingLocations.length === 0 && remainingConnections.length === 0

  const discovered = discoveredLocationId
    ? `location ${discoveredLocationId}`
    : `connection ${discoveredConnectionId}`

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
      areaFullyExplored,
      luckInfo,
    },
  }
}

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
      const connId = `${conn.fromAreaId}->${conn.toAreaId}`
      const reverseConnId = `${conn.toAreaId}->${conn.fromAreaId}`

      if (!knownConnectionIds.has(connId) && !knownConnectionIds.has(reverseConnId)) {
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

  if (!exploration.playerState.knownAreaIds.includes(destinationAreaId)) {
    return createFailureLog(state, "ExplorationTravel", "AREA_NOT_KNOWN")
  }

  if (state.time.sessionRemainingTicks <= 0) {
    return createFailureLog(state, "ExplorationTravel", "SESSION_ENDED")
  }

  // Find path to destination
  const pathResult = findPath(state, exploration.playerState.currentAreaId, destinationAreaId)

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

  // TODO: Scavenge rolls for gathering drops (future implementation)

  return {
    tickBefore,
    actionType: "ExplorationTravel",
    parameters: { destinationAreaId, scavenge },
    success: true,
    timeConsumed: travelTime,
    rngRolls: [],
    stateDeltaSummary: `Traveled to ${destinationAreaId}`,
  }
}
