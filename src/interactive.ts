/**
 * Interactive exploration system with animated discovery and cancelation support
 */

import * as readline from "readline"
import type { WorldState, ExplorationLocation, ExploreAction, SurveyAction, Area } from "./types.js"
import { ExplorationLocationType } from "./types.js"
import {
  executeExplore,
  executeSurvey,
  getRollInterval,
  calculateExpectedTicks,
  calculateSuccessChance,
  getKnowledgeParams,
  shadowRollExplore,
  shadowRollSurvey,
} from "./exploration.js"
import { formatActionLog } from "./agent/formatters.js"

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate base success chance for exploration/survey (includes knowledge bonuses)
 */
function getBaseSuccessChance(state: WorldState, currentArea: Area): number {
  const level = state.player.skills.Exploration.level
  const knowledgeParams = getKnowledgeParams(state, currentArea)
  return calculateSuccessChance({
    level,
    distance: currentArea.distance,
    ...knowledgeParams,
  })
}

// ============================================================================
// Hard Discoveries Detection
// ============================================================================

interface HardDiscoveryAnalysis {
  hasEasyDiscoveries: boolean
  hasHardDiscoveries: boolean
  hardExpectedTicks: number
  easyCount: number
  hardCount: number
}

/**
 * Analyze remaining discoveries to determine if only "hard" ones remain
 *
 * Easy discoveries:
 * - Connections to known areas (1.0× multiplier)
 * - Mob camps (0.5× multiplier)
 * - Gathering nodes WITH skill (0.5× multiplier)
 * - Connections to unknown areas (0.25× multiplier) - treated as "easy" per design
 *
 * Hard discoveries:
 * - Gathering nodes WITHOUT skill (0.05× multiplier - 10× harder)
 */
function analyzeRemainingDiscoveries(state: WorldState): HardDiscoveryAnalysis {
  const exploration = state.exploration!
  const currentArea = exploration.areas.get(exploration.playerState.currentAreaId)!

  const knownLocationIds = new Set(exploration.playerState.knownLocationIds)
  const knownConnectionIds = new Set(exploration.playerState.knownConnectionIds)
  const knownAreaIds = new Set(exploration.playerState.knownAreaIds)

  const undiscoveredLocations = currentArea.locations.filter((loc) => !knownLocationIds.has(loc.id))

  const undiscoveredKnownConnections = exploration.connections.filter((conn) => {
    const isFromCurrent = conn.fromAreaId === currentArea.id
    const isToCurrent = conn.toAreaId === currentArea.id
    if (!isFromCurrent && !isToCurrent) return false

    const connId = `${conn.fromAreaId}->${conn.toAreaId}`
    const reverseConnId = `${conn.toAreaId}->${conn.fromAreaId}`
    if (knownConnectionIds.has(connId) || knownConnectionIds.has(reverseConnId)) return false

    const targetId = isFromCurrent ? conn.toAreaId : conn.fromAreaId
    return knownAreaIds.has(targetId)
  })

  const undiscoveredUnknownConnections = exploration.connections.filter((conn) => {
    const isFromCurrent = conn.fromAreaId === currentArea.id
    const isToCurrent = conn.toAreaId === currentArea.id
    if (!isFromCurrent && !isToCurrent) return false

    const connId = `${conn.fromAreaId}->${conn.toAreaId}`
    const reverseConnId = `${conn.toAreaId}->${conn.fromAreaId}`
    if (knownConnectionIds.has(connId) || knownConnectionIds.has(reverseConnId)) return false

    const targetId = isFromCurrent ? conn.toAreaId : conn.fromAreaId
    return !knownAreaIds.has(targetId)
  })

  // Categorize locations as easy or hard
  let easyCount = 0
  let hardCount = 0

  for (const loc of undiscoveredLocations) {
    if (loc.type === ExplorationLocationType.GATHERING_NODE && loc.gatheringSkillType) {
      const skillLevel = state.player.skills[loc.gatheringSkillType]?.level ?? 0
      if (skillLevel === 0) {
        // Hard: gathering node without skill
        hardCount++
        // Will need to calculate actual threshold later
      } else {
        // Easy: gathering node with skill
        easyCount++
      }
    } else {
      // Easy: mob camp
      easyCount++
    }
  }

  // All connections (both known and unknown) count as "easy"
  easyCount += undiscoveredKnownConnections.length + undiscoveredUnknownConnections.length

  // Calculate expected ticks for hard discoveries (if any)
  let hardExpectedTicks = Infinity
  if (hardCount > 0) {
    const level = state.player.skills.Exploration.level
    const rollInterval = getRollInterval(level)
    const baseChance = getBaseSuccessChance(state, currentArea)
    // For hard nodes, threshold is baseChance * 0.05
    const hardThreshold = baseChance * 0.05
    hardExpectedTicks = calculateExpectedTicks(hardThreshold, rollInterval)
  }

  return {
    hasEasyDiscoveries: easyCount > 0,
    hasHardDiscoveries: hardCount > 0,
    hardExpectedTicks,
    easyCount,
    hardCount,
  }
}

/**
 * Analyze remaining undiscovered areas for Survey action
 */
function analyzeRemainingAreas(state: WorldState): {
  hasUndiscovered: boolean
  expectedTicks: number
} {
  const exploration = state.exploration!
  const currentArea = exploration.areas.get(exploration.playerState.currentAreaId)!

  const allConnections = exploration.connections.filter((conn) => {
    return (
      conn.fromAreaId === exploration.playerState.currentAreaId ||
      conn.toAreaId === exploration.playerState.currentAreaId
    )
  })

  const knownAreaIds = new Set(exploration.playerState.knownAreaIds)
  const hasUndiscoveredAreas = allConnections.some((conn) => {
    const targetId =
      conn.fromAreaId === exploration.playerState.currentAreaId ? conn.toAreaId : conn.fromAreaId
    return !knownAreaIds.has(targetId)
  })

  // Calculate expected ticks
  const level = state.player.skills.Exploration.level
  const rollInterval = getRollInterval(level)
  const successChance = getBaseSuccessChance(state, currentArea)
  const expectedTicks = calculateExpectedTicks(successChance, rollInterval)

  return { hasUndiscovered: hasUndiscoveredAreas, expectedTicks }
}

// ============================================================================
// Animation System
// ============================================================================

interface AnimationResult {
  cancelled: boolean
  ticksAnimated: number
}

/**
 * Animate discovery with dots (one per tick) and support cancellation
 * @param totalTicks - Total ticks the discovery will take
 * @param state - World state to consume time from
 * @returns Object with cancellation status and ticks animated
 */
async function animateDiscovery(totalTicks: number, state: WorldState): Promise<AnimationResult> {
  return new Promise((resolve) => {
    let ticksAnimated = 0

    // Only enable interactive mode if stdin is a TTY
    const isInteractive = process.stdin.isTTY

    if (isInteractive) {
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.setEncoding("utf8")
    }

    const cleanup = () => {
      globalThis.clearInterval(interval)
      if (isInteractive) {
        process.stdin.removeListener("data", keyHandler)
        process.stdin.setRawMode(false)
        process.stdin.pause()
      }
    }

    const keyHandler = () => {
      cleanup()
      process.stdout.write("\n")
      resolve({ cancelled: true, ticksAnimated })
    }

    if (isInteractive) {
      process.stdin.on("data", keyHandler)
    }

    const interval = globalThis.setInterval(() => {
      if (ticksAnimated >= totalTicks) {
        cleanup()
        process.stdout.write("\n")
        resolve({ cancelled: false, ticksAnimated })
        return
      }

      if (state.time.sessionRemainingTicks <= 0) {
        cleanup()
        process.stdout.write("\n")
        resolve({ cancelled: false, ticksAnimated })
        return
      }

      // Consume 1 tick from state
      state.time.sessionRemainingTicks--
      state.time.currentTick++
      ticksAnimated++

      // Print dot (in non-interactive mode, print fewer dots to avoid spam)
      if (isInteractive || ticksAnimated % 10 === 0) {
        process.stdout.write(".")
      }
    }, 250) // 1 dot every 250ms = 4 dots per second
  })
}

// ============================================================================
// Interactive Loop
// ============================================================================

/**
 * Prompt user with y/n question
 */
async function promptYesNo(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(`${question} (y/n) `, (answer) => {
      rl.close()
      resolve(answer.trim().toLowerCase() === "y")
    })
  })
}

/**
 * Interactive exploration loop - continuously explores until user stops or area exhausted
 */
export async function interactiveExplore(state: WorldState): Promise<void> {
  while (true) {
    // Check if area is fully explored
    const exploration = state.exploration!
    const currentArea = exploration.areas.get(exploration.playerState.currentAreaId)!
    const knownLocationIds = new Set(exploration.playerState.knownLocationIds)
    const knownConnectionIds = new Set(exploration.playerState.knownConnectionIds)
    const knownAreaIds = new Set(exploration.playerState.knownAreaIds)

    const undiscoveredLocations = currentArea.locations.filter(
      (loc) => !knownLocationIds.has(loc.id)
    )
    const undiscoveredKnownConnections = exploration.connections.filter((conn) => {
      const isFromCurrent = conn.fromAreaId === currentArea.id
      const isToCurrent = conn.toAreaId === currentArea.id
      if (!isFromCurrent && !isToCurrent) return false
      const connId = `${conn.fromAreaId}->${conn.toAreaId}`
      const targetId = isFromCurrent ? conn.toAreaId : conn.fromAreaId
      return !knownConnectionIds.has(connId) && knownAreaIds.has(targetId)
    })

    const hasDiscoverables =
      undiscoveredLocations.length > 0 || undiscoveredKnownConnections.length > 0

    if (!hasDiscoverables) {
      console.log("\n✓ Area fully explored - nothing left to discover")
      return
    }

    // Analyze remaining discoveries for warnings
    const analysis = analyzeRemainingDiscoveries(state)

    // If only hard discoveries remain, warn user with double confirmation
    if (!analysis.hasEasyDiscoveries && analysis.hasHardDiscoveries) {
      console.log("\n⚠ You've found all the easy discoveries.")
      console.log(
        `  Only gathering nodes you lack skills for remain (expected: ${Math.round(analysis.hardExpectedTicks)}t per discovery)`
      )

      const continueFirst = await promptYesNo("Do you want to keep looking?")
      if (!continueFirst) {
        return
      }

      const continueSecond = await promptYesNo(
        `Are you sure? This could take a while (expected: ${Math.round(analysis.hardExpectedTicks)}t per discovery)`
      )
      if (!continueSecond) {
        return
      }
    }

    // Shadow roll to determine tick count without mutating state
    // Build discoverables list (reuse variables from above, get additional data)
    const level = state.player.skills.Exploration.level
    const undiscoveredUnknownConnections = exploration.connections.filter((conn) => {
      const isFromCurrent = conn.fromAreaId === currentArea.id
      const isToCurrent = conn.toAreaId === currentArea.id
      if (!isFromCurrent && !isToCurrent) return false
      const connId = `${conn.fromAreaId}->${conn.toAreaId}`
      const targetId = isFromCurrent ? conn.toAreaId : conn.fromAreaId
      return !knownConnectionIds.has(connId) && !knownAreaIds.has(targetId)
    })

    // Calculate base chance and build discoverables
    const rollInterval = getRollInterval(level)
    const baseChance = getBaseSuccessChance(state, currentArea)

    const getLocationThreshold = (loc: ExplorationLocation): number => {
      if (loc.type === ExplorationLocationType.GATHERING_NODE && loc.gatheringSkillType) {
        const skillLevel = state.player.skills[loc.gatheringSkillType]?.level ?? 0
        if (skillLevel === 0) {
          return baseChance * 0.05
        }
        return baseChance * 0.5
      }
      return baseChance * 0.5
    }

    const discoverables = [
      ...undiscoveredLocations.map((loc) => ({
        threshold: getLocationThreshold(loc),
      })),
      ...undiscoveredKnownConnections.map(() => ({
        threshold: baseChance * 1.0,
      })),
      ...undiscoveredUnknownConnections.map(() => ({
        threshold: baseChance * 0.25,
      })),
    ]

    // Clone RNG and shadow roll to find tick count
    const shadowRng = { ...state.rng }
    const ticksConsumed = shadowRollExplore(
      shadowRng,
      discoverables,
      rollInterval,
      state.time.sessionRemainingTicks
    )

    if (ticksConsumed === null) {
      console.log("\n✗ Session would end before finding anything")
      return
    }

    // Update original state RNG counter to match shadow rolls
    state.rng.counter = shadowRng.counter

    // Animate with real-time tick consumption
    process.stdout.write("\nExploring")
    const animResult = await animateDiscovery(ticksConsumed, state)

    if (animResult.cancelled) {
      console.log(`Exploration cancelled after ${animResult.ticksAnimated}t`)
      return
    }

    // Execute once on original state (deterministic due to matching RNG counter)
    const action: ExploreAction = { type: "Explore" }
    const finalLog = await executeExplore(state, action)

    // Show discovery result (not full state)
    console.log(formatActionLog(finalLog, state))

    // Prompt to continue exploring
    const shouldContinue = await promptYesNo("\nContinue exploring?")
    if (!shouldContinue) {
      return
    }
  }
}

/**
 * Interactive survey loop - continuously surveys until user stops or no more areas
 */
export async function interactiveSurvey(state: WorldState): Promise<void> {
  while (true) {
    // Check if there are undiscovered areas
    const analysis = analyzeRemainingAreas(state)

    if (!analysis.hasUndiscovered) {
      console.log("\n✓ No more undiscovered areas to survey")
      return
    }

    // Shadow roll to determine tick count without mutating state
    const exploration = state.exploration!
    const level = state.player.skills.Exploration.level
    const currentArea = exploration.areas.get(exploration.playerState.currentAreaId)!

    // Calculate success chance (same logic as executeSurvey)
    const rollInterval = getRollInterval(level)
    const successChance = getBaseSuccessChance(state, currentArea)

    // Get all connections and known area IDs
    const allConnections = exploration.connections.filter((conn) => {
      return (
        conn.fromAreaId === exploration.playerState.currentAreaId ||
        conn.toAreaId === exploration.playerState.currentAreaId
      )
    })
    const knownAreaIds = new Set(exploration.playerState.knownAreaIds)

    // Clone RNG and shadow roll to find tick count
    const shadowRng = { ...state.rng }
    const ticksConsumed = shadowRollSurvey(
      shadowRng,
      successChance,
      rollInterval,
      state.time.sessionRemainingTicks,
      allConnections.length,
      knownAreaIds,
      allConnections,
      exploration.playerState.currentAreaId
    )

    if (ticksConsumed === null) {
      console.log("\n✗ Session would end before finding anything")
      return
    }

    // Update original state RNG counter to match shadow rolls
    state.rng.counter = shadowRng.counter

    // Animate with real-time tick consumption
    process.stdout.write("\nSurveying")
    const animResult = await animateDiscovery(ticksConsumed, state)

    if (animResult.cancelled) {
      console.log(`Survey cancelled after ${animResult.ticksAnimated}t`)
      return
    }

    // Execute once on original state (deterministic due to matching RNG counter)
    const action: SurveyAction = { type: "Survey" }
    const finalLog = await executeSurvey(state, action)

    // Show discovery result (not full state)
    console.log(formatActionLog(finalLog, state))

    // Prompt to continue surveying
    const shouldContinue = await promptYesNo("\nContinue surveying?")
    if (!shouldContinue) {
      return
    }
  }
}
