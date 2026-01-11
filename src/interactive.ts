/**
 * Interactive exploration system with animated discovery and cancelation support
 */

import type {
  WorldState,
  ExploreAction,
  SurveyAction,
  ExplorationTravelAction,
  FarTravelAction,
  ActionGenerator,
  ActionLog,
} from "./types.js"
import { setTimeout } from "timers/promises"
import {
  executeExplore,
  executeSurvey,
  getRollInterval,
  calculateExpectedTicks,
  buildDiscoverables,
  prepareSurveyData,
  ensureAreaFullyGenerated,
  GATHERING_NODE_WITHOUT_SKILL_MULTIPLIER,
  UNKNOWN_CONNECTION_MULTIPLIER,
  BASE_TRAVEL_TIME,
  findPath,
  isConnectionKnown,
  executeExplorationTravel,
  executeFarTravel,
} from "./exploration.js"
import { formatActionLog, formatTickFeedback } from "./agent/formatters.js"
import { promptYesNo } from "./prompt.js"

// ============================================================================
// Animation Runner Infrastructure
// ============================================================================

/**
 * Options for running an animated action
 */
export interface AnimationOptions {
  /** Milliseconds per tick for animation (default: 100) */
  tickDelay?: number
  /** Label to show before animation starts (e.g., "Gathering", "Fighting") */
  label?: string
  /** Callback to check if user wants to cancel */
  checkCancel?: () => boolean
}

/**
 * Result from running an animated action
 */
export interface AnimationResult {
  log: ActionLog
  cancelled: boolean
  ticksCompleted: number
}

/**
 * Run an action with animated tick-by-tick display.
 * Returns the final ActionLog, or null if cancelled.
 */
export async function runAnimatedAction(
  generator: ActionGenerator,
  options: AnimationOptions = {}
): Promise<AnimationResult> {
  const { tickDelay = 100, label, checkCancel } = options

  if (label) {
    process.stdout.write(`\n${label}`)
  }

  let ticksCompleted = 0
  let lastLog: ActionLog | null = null

  for await (const tick of generator) {
    if (tick.done) {
      lastLog = tick.log
      break
    }

    // Show dot
    process.stdout.write(".")
    ticksCompleted++

    // Show feedback if any
    if (tick.feedback) {
      const feedbackStr = formatTickFeedback(tick.feedback)
      if (feedbackStr) {
        process.stdout.write(` ${feedbackStr}`)
      }
    }

    // Check for cancellation
    if (checkCancel?.()) {
      process.stdout.write("\n")
      // Create a cancelled log with minimal info
      const cancelledLog: ActionLog = {
        tickBefore: 0,
        actionType: "Drop", // Placeholder - doesn't matter for cancellation
        parameters: {},
        success: false,
        failureType: "SESSION_ENDED",
        timeConsumed: ticksCompleted,
        rngRolls: [],
        stateDeltaSummary: `Action cancelled after ${ticksCompleted} ticks`,
      }
      return { log: cancelledLog, cancelled: true, ticksCompleted }
    }

    // Animation delay
    await setTimeout(tickDelay)
  }

  process.stdout.write("\n")

  return {
    log: lastLog!,
    cancelled: false,
    ticksCompleted,
  }
}

/**
 * Set up cancellation detection (listen for keypress).
 * Returns a checkCancel function and a cleanup function.
 */
export function setupCancellation(): { checkCancel: () => boolean; cleanup: () => void } {
  let cancelled = false

  const handler = () => {
    cancelled = true
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on("data", handler)
  }

  return {
    checkCancel: () => cancelled,
    cleanup: () => {
      if (process.stdin.isTTY) {
        process.stdin.removeListener("data", handler)
        process.stdin.setRawMode(false)
        process.stdin.pause()
      }
    },
  }
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

  // Use shared discoverable building logic
  const { discoverables, baseChance } = buildDiscoverables(state, currentArea)

  // Categorize based on thresholds
  const hardThreshold = baseChance * GATHERING_NODE_WITHOUT_SKILL_MULTIPLIER
  const easyThreshold = baseChance * UNKNOWN_CONNECTION_MULTIPLIER

  let easyCount = 0
  let hardCount = 0

  for (const discoverable of discoverables) {
    // Check if this is a hard discovery (threshold very close to hardThreshold)
    if (Math.abs(discoverable.threshold - hardThreshold) < 0.0001) {
      hardCount++
    } else if (discoverable.threshold >= easyThreshold) {
      easyCount++
    } else {
      // Anything else (0.25× to 0.5×) is treated as easy
      easyCount++
    }
  }

  // Calculate expected ticks for hard discoveries (if any)
  let hardExpectedTicks = Infinity
  if (hardCount > 0) {
    const level = state.player.skills.Exploration.level
    const rollInterval = getRollInterval(level)
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

  // Use shared survey data preparation
  const { hasUndiscoveredAreas, expectedTicks } = prepareSurveyData(state, currentArea)

  return { hasUndiscovered: hasUndiscoveredAreas, expectedTicks }
}

// ============================================================================
// Interactive Loop
// ============================================================================

/**
 * Interactive exploration loop - continuously explores until user stops or area exhausted
 * Returns all action logs generated during the interactive session
 */
export async function interactiveExplore(state: WorldState): Promise<ActionLog[]> {
  const logs: ActionLog[] = []

  while (true) {
    // Check if area is fully explored using shared logic
    const exploration = state.exploration!
    const currentArea = exploration.areas.get(exploration.playerState.currentAreaId)!

    // Ensure area is fully generated (must happen before buildDiscoverables and shadow rolling)
    await ensureAreaFullyGenerated(state.rng, exploration, currentArea)

    const { discoverables } = buildDiscoverables(state, currentArea)

    if (discoverables.length === 0) {
      console.log("\n✓ Area fully explored - nothing left to discover")
      return logs
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
        return logs
      }

      const continueSecond = await promptYesNo(
        `Are you sure? This could take a while (expected: ${Math.round(analysis.hardExpectedTicks)}t per discovery)`
      )
      if (!continueSecond) {
        return logs
      }
    }

    // Set up cancellation
    const { checkCancel, cleanup } = setupCancellation()

    try {
      // Execute with animation (generator yields ticks as RNG rolls happen)
      const action: ExploreAction = { type: "Explore" }
      const generator = executeExplore(state, action)
      const {
        log: finalLog,
        cancelled,
        ticksCompleted,
      } = await runAnimatedAction(generator, {
        label: "Exploring",
        tickDelay: 100,
        checkCancel,
      })

      if (cancelled) {
        console.log(`Exploration cancelled after ${ticksCompleted}t`)
        return logs
      }

      // Collect the log
      logs.push(finalLog)

      // Show discovery result
      console.log(formatActionLog(finalLog, state))

      // Check if there are any discoverables left by rebuilding the list
      const { discoverables: remainingDiscoverables } = buildDiscoverables(state, currentArea)

      if (remainingDiscoverables.length === 0) {
        // Check if bonus XP was awarded
        const bonusXP = finalLog.explorationLog?.discoveryBonusXP
        if (bonusXP) {
          console.log("\n✓ Area fully explored - bonus XP!")
          console.log(`  +${bonusXP} Exploration XP`)
        } else {
          console.log("\n✓ Area fully explored - nothing left to discover")
        }
        return logs
      }
    } finally {
      cleanup()
    }

    // Prompt to continue exploring
    const shouldContinue = await promptYesNo("\nContinue exploring?")
    if (!shouldContinue) {
      return logs
    }
  }
}

/**
 * Interactive survey loop - continuously surveys until user stops or no more areas
 * Returns all action logs generated during the interactive session
 */
export async function interactiveSurvey(state: WorldState): Promise<ActionLog[]> {
  const logs: ActionLog[] = []

  while (true) {
    // Check if there are undiscovered areas
    const analysis = analyzeRemainingAreas(state)

    if (!analysis.hasUndiscovered) {
      console.log("\n✓ No more undiscovered areas to survey")
      return logs
    }

    // Set up cancellation
    const { checkCancel, cleanup } = setupCancellation()

    try {
      // Execute with animation (generator yields ticks as RNG rolls happen)
      const action: SurveyAction = { type: "Survey" }
      const generator = executeSurvey(state, action)
      const {
        log: finalLog,
        cancelled,
        ticksCompleted,
      } = await runAnimatedAction(generator, {
        label: "Surveying",
        tickDelay: 100,
        checkCancel,
      })

      if (cancelled) {
        console.log(`Survey cancelled after ${ticksCompleted}t`)
        return logs
      }

      // Collect the log
      logs.push(finalLog)

      // Show discovery result
      console.log(formatActionLog(finalLog, state))
    } finally {
      cleanup()
    }

    // Check if there are more areas to discover before prompting
    const remainingAnalysis = analyzeRemainingAreas(state)
    if (!remainingAnalysis.hasUndiscovered) {
      console.log("\n✓ No more undiscovered areas to survey")
      return
    }

    // Prompt to continue surveying
    const shouldContinue = await promptYesNo("\nContinue surveying?")
    if (!shouldContinue) {
      return logs
    }
  }
}

/**
 * Interactive exploration travel - travel between directly connected areas with animation
 * Returns the action log if travel completed, empty array if cancelled or failed preconditions
 */
export async function interactiveExplorationTravel(
  state: WorldState,
  action: ExplorationTravelAction
): Promise<ActionLog[]> {
  const exploration = state.exploration!
  const { destinationAreaId, scavenge } = action
  const currentAreaId = exploration.playerState.currentAreaId

  // Check preconditions
  if (exploration.playerState.currentAreaId === destinationAreaId) {
    console.log("\n✗ Already in that area")
    return []
  }

  if (state.time.sessionRemainingTicks <= 0) {
    console.log("\n✗ Session ended")
    return []
  }

  const knownConnectionIds = new Set(exploration.playerState.knownConnectionIds)

  // Check for direct known connection from current area to destination
  const directConnection = exploration.connections.find(
    (conn) =>
      isConnectionKnown(knownConnectionIds, conn.fromAreaId, conn.toAreaId) &&
      ((conn.fromAreaId === currentAreaId && conn.toAreaId === destinationAreaId) ||
        (conn.toAreaId === currentAreaId && conn.fromAreaId === destinationAreaId))
  )

  if (!directConnection) {
    console.log("\n✗ No direct connection to that area")
    return []
  }

  // Calculate travel time (for time check only - generator handles actual time consumption)
  let travelTime = Math.round(BASE_TRAVEL_TIME * directConnection.travelTimeMultiplier)
  if (scavenge) {
    travelTime *= 2
  }

  // Check if enough time
  if (state.time.sessionRemainingTicks < travelTime) {
    console.log("\n✗ Not enough time remaining")
    return []
  }

  // Set up cancellation
  const { checkCancel, cleanup } = setupCancellation()

  try {
    // Execute with animation (generator yields ticks, runAnimatedAction displays them)
    const generator = executeExplorationTravel(state, action)
    const {
      log: finalLog,
      cancelled,
      ticksCompleted,
    } = await runAnimatedAction(generator, {
      label: "Traveling",
      tickDelay: 100,
      checkCancel,
    })

    if (cancelled) {
      console.log(`Travel cancelled after ${ticksCompleted}t`)
      return []
    }

    console.log(formatActionLog(finalLog, state))
    return [finalLog]
  } finally {
    cleanup()
  }
}

/**
 * Interactive far travel - multi-hop travel to any known reachable area with animation
 * Returns the action log if travel completed, empty array if cancelled or failed preconditions
 */
export async function interactiveFarTravel(
  state: WorldState,
  action: FarTravelAction
): Promise<ActionLog[]> {
  const exploration = state.exploration!
  const { destinationAreaId, scavenge } = action
  const currentAreaId = exploration.playerState.currentAreaId

  // Check preconditions
  if (exploration.playerState.currentAreaId === destinationAreaId) {
    console.log("\n✗ Already in that area")
    return []
  }

  if (state.time.sessionRemainingTicks <= 0) {
    console.log("\n✗ Session ended")
    return []
  }

  // Destination must be known for far travel
  if (!exploration.playerState.knownAreaIds.includes(destinationAreaId)) {
    console.log("\n✗ Area not known")
    return []
  }

  // Find shortest path to destination
  const pathResult = findPath(state, currentAreaId, destinationAreaId)

  if (!pathResult) {
    console.log("\n✗ No path to destination")
    return []
  }

  // Calculate travel time (for time check only - generator handles actual time consumption)
  let travelTime = Math.round(pathResult.totalTime)
  if (scavenge) {
    travelTime *= 2
  }

  // Check if enough time
  if (state.time.sessionRemainingTicks < travelTime) {
    console.log("\n✗ Not enough time remaining")
    return []
  }

  const hops = pathResult.path.length - 1

  // Set up cancellation
  const { checkCancel, cleanup } = setupCancellation()

  try {
    // Execute with animation (generator yields ticks, runAnimatedAction displays them)
    const generator = executeFarTravel(state, action)
    const {
      log: finalLog,
      cancelled,
      ticksCompleted,
    } = await runAnimatedAction(generator, {
      label: `Traveling (${hops} hop${hops !== 1 ? "s" : ""})`,
      tickDelay: 100,
      checkCancel,
    })

    if (cancelled) {
      console.log(`Travel cancelled after ${ticksCompleted}t`)
      return []
    }

    console.log(formatActionLog(finalLog, state))
    return [finalLog]
  } finally {
    cleanup()
  }
}
