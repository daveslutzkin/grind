/**
 * Interactive exploration system with animated discovery and cancelation support
 */

import type {
  WorldState,
  ExploreAction,
  SurveyAction,
  ExplorationTravelAction,
  FarTravelAction,
} from "./types.js"
import {
  executeExplore,
  executeSurvey,
  getRollInterval,
  calculateExpectedTicks,
  buildDiscoverables,
  prepareSurveyData,
  shadowRollExplore,
  shadowRollSurvey,
  ensureAreaFullyGenerated,
  GATHERING_NODE_WITHOUT_SKILL_MULTIPLIER,
  UNKNOWN_CONNECTION_MULTIPLIER,
  BASE_TRAVEL_TIME,
  findPath,
  isConnectionKnown,
  executeExplorationTravel,
  executeFarTravel,
} from "./exploration.js"
import { formatActionLog } from "./agent/formatters.js"
import { consumeTime } from "./stateHelpers.js"
import { promptYesNo } from "./prompt.js"

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
// Animation System
// ============================================================================

interface AnimationResult {
  cancelled: boolean
  ticksAnimated: number
}

/**
 * Animate discovery with dots (one per tick) and support cancellation
 * NOTE: This function does NOT consume time - it only provides visual feedback.
 * Time consumption happens in the execute functions or manually on cancellation.
 * @param totalTicks - Total ticks the discovery will take
 * @returns Object with cancellation status and ticks animated
 */
async function animateDiscovery(totalTicks: number): Promise<AnimationResult> {
  return new Promise((resolve, reject) => {
    let ticksAnimated = 0
    let interval: ReturnType<typeof globalThis.setInterval> | null = null

    // Only enable interactive mode if stdin is a TTY
    const isInteractive = process.stdin.isTTY

    // Cleanup function that ALWAYS runs to restore terminal state
    const cleanup = () => {
      if (interval !== null) {
        globalThis.clearInterval(interval)
        interval = null
      }
      if (isInteractive) {
        process.stdin.removeListener("data", keyHandler)
        try {
          process.stdin.setRawMode(false)
          process.stdin.pause()
        } catch {
          // Ignore errors during cleanup (stdin might be closed)
        }
      }
    }

    const keyHandler = () => {
      cleanup()
      process.stdout.write("\n")
      resolve({ cancelled: true, ticksAnimated })
    }

    try {
      if (isInteractive) {
        process.stdin.setRawMode(true)
        process.stdin.resume()
        process.stdin.setEncoding("utf8")
        process.stdin.on("data", keyHandler)
      }

      interval = globalThis.setInterval(() => {
        try {
          if (ticksAnimated >= totalTicks) {
            cleanup()
            process.stdout.write("\n")
            resolve({ cancelled: false, ticksAnimated })
            return
          }

          // Just track animation progress - don't consume time here
          ticksAnimated++

          // Print dot (in non-interactive mode, print fewer dots to avoid spam)
          if (isInteractive || ticksAnimated % 10 === 0) {
            process.stdout.write(".")
          }
        } catch (error) {
          cleanup()
          reject(error)
        }
      }, 100)
    } catch (error) {
      cleanup()
      reject(error)
    }
  })
}

// ============================================================================
// Interactive Loop
// ============================================================================

/**
 * Interactive exploration loop - continuously explores until user stops or area exhausted
 */
export async function interactiveExplore(state: WorldState): Promise<void> {
  while (true) {
    // Check if area is fully explored using shared logic
    const exploration = state.exploration!
    const currentArea = exploration.areas.get(exploration.playerState.currentAreaId)!

    // Ensure area is fully generated (must happen before buildDiscoverables and shadow rolling)
    await ensureAreaFullyGenerated(state.rng, exploration, currentArea)

    const { discoverables } = buildDiscoverables(state, currentArea)

    if (discoverables.length === 0) {
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
    const level = state.player.skills.Exploration.level
    const rollInterval = getRollInterval(level)

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

    // Animate discovery (visual only - does not consume time)
    // Note: We do NOT update state.rng.counter here. The shadow roll was just a preview.
    // The real executeExplore will start from the same RNG state and get the same results.
    process.stdout.write("\nExploring")
    const animResult = await animateDiscovery(ticksConsumed)

    if (animResult.cancelled) {
      // User cancelled - consume only the partial time
      consumeTime(state, animResult.ticksAnimated)
      console.log(`Exploration cancelled after ${animResult.ticksAnimated}t`)
      return
    }

    // Execute the real action (will use same RNG sequence as shadow roll, so same result)
    // This will consume the actual time
    const action: ExploreAction = { type: "Explore" }
    const finalLog = await executeExplore(state, action)

    // Show discovery result (not full state)
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
      return
    }

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
    const currentArea = exploration.areas.get(exploration.playerState.currentAreaId)!

    // Use shared survey data preparation
    const { successChance, rollInterval, allConnections } = prepareSurveyData(state, currentArea)
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

    // Animate discovery (visual only - does not consume time)
    // Note: We do NOT update state.rng.counter here. The shadow roll was just a preview.
    // The real executeSurvey will start from the same RNG state and get the same results.
    process.stdout.write("\nSurveying")
    const animResult = await animateDiscovery(ticksConsumed)

    if (animResult.cancelled) {
      // User cancelled - consume only the partial time
      consumeTime(state, animResult.ticksAnimated)
      console.log(`Survey cancelled after ${animResult.ticksAnimated}t`)
      return
    }

    // Execute the real action (will use same RNG sequence as shadow roll, so same result)
    // This will consume the actual time
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

/**
 * Interactive exploration travel - travel between directly connected areas with animation
 */
export async function interactiveExplorationTravel(
  state: WorldState,
  action: ExplorationTravelAction
): Promise<void> {
  const exploration = state.exploration!
  const { destinationAreaId, scavenge } = action
  const currentAreaId = exploration.playerState.currentAreaId

  // Check preconditions
  if (exploration.playerState.currentAreaId === destinationAreaId) {
    console.log("\n✗ Already in that area")
    return
  }

  if (state.time.sessionRemainingTicks <= 0) {
    console.log("\n✗ Session ended")
    return
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
    return
  }

  // Calculate travel time
  let travelTime = BASE_TRAVEL_TIME * directConnection.travelTimeMultiplier

  // Double time if scavenging
  if (scavenge) {
    travelTime *= 2
  }

  // Check if enough time
  if (state.time.sessionRemainingTicks < travelTime) {
    console.log("\n✗ Not enough time remaining")
    return
  }

  // Animate travel (visual only - does not consume time)
  process.stdout.write("\nTraveling")
  const animResult = await animateDiscovery(travelTime)

  if (animResult.cancelled) {
    // User cancelled - consume only the partial time
    consumeTime(state, animResult.ticksAnimated)
    console.log(`Travel cancelled after ${animResult.ticksAnimated}t`)
    return
  }

  // Execute the real action
  const finalLog = await executeExplorationTravel(state, action)

  // Show travel result
  console.log(formatActionLog(finalLog, state))
}

/**
 * Interactive far travel - multi-hop travel to any known reachable area with animation
 */
export async function interactiveFarTravel(
  state: WorldState,
  action: FarTravelAction
): Promise<void> {
  const exploration = state.exploration!
  const { destinationAreaId, scavenge } = action
  const currentAreaId = exploration.playerState.currentAreaId

  // Check preconditions
  if (exploration.playerState.currentAreaId === destinationAreaId) {
    console.log("\n✗ Already in that area")
    return
  }

  if (state.time.sessionRemainingTicks <= 0) {
    console.log("\n✗ Session ended")
    return
  }

  // Destination must be known for far travel
  if (!exploration.playerState.knownAreaIds.includes(destinationAreaId)) {
    console.log("\n✗ Area not known")
    return
  }

  // Find shortest path to destination
  const pathResult = findPath(state, currentAreaId, destinationAreaId)

  if (!pathResult) {
    console.log("\n✗ No path to destination")
    return
  }

  // Calculate travel time
  let travelTime = pathResult.totalTime

  // Double time if scavenging
  if (scavenge) {
    travelTime *= 2
  }

  // Check if enough time
  if (state.time.sessionRemainingTicks < travelTime) {
    console.log("\n✗ Not enough time remaining")
    return
  }

  // Animate travel (visual only - does not consume time)
  const hops = pathResult.path.length - 1
  process.stdout.write(`\nTraveling (${hops} hop${hops !== 1 ? "s" : ""})`)
  const animResult = await animateDiscovery(travelTime)

  if (animResult.cancelled) {
    // User cancelled - consume only the partial time
    consumeTime(state, animResult.ticksAnimated)
    console.log(`Travel cancelled after ${animResult.ticksAnimated}t`)
    return
  }

  // Execute the real action
  const finalLog = await executeFarTravel(state, action)

  // Show travel result
  console.log(formatActionLog(finalLog, state))
}
