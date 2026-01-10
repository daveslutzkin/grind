/**
 * Interactive exploration system with animated discovery and cancelation support
 */

import * as readline from "readline"
import type {
  WorldState,
  ExplorationLocation,
  ActionLog,
  ExploreAction,
  SurveyAction,
} from "./types.js"
import { ExplorationLocationType } from "./types.js"
import {
  executeExplore,
  executeSurvey,
  getRollInterval,
  calculateExpectedTicks,
} from "./exploration.js"
import { formatActionLog } from "./agent/formatters.js"

// ============================================================================
// State Snapshotting
// ============================================================================

interface StateSnapshot {
  currentTick: number
  sessionRemainingTicks: number
  playerState: any
  skills: any
  inventory: any[]
}

/**
 * Create a snapshot of mutable state for execute-capture-rewind pattern
 * Saves only the fields that need to be restored (not the entire state)
 */
function createSnapshot(state: WorldState): StateSnapshot {
  return {
    currentTick: state.time.currentTick,
    sessionRemainingTicks: state.time.sessionRemainingTicks,
    playerState: JSON.parse(JSON.stringify(state.exploration!.playerState)),
    skills: JSON.parse(JSON.stringify(state.player.skills)),
    inventory: JSON.parse(JSON.stringify(state.player.inventory)),
  }
}

/**
 * Restore state from snapshot (except RNG counter which we preserve)
 */
function restoreSnapshot(state: WorldState, snapshot: StateSnapshot): void {
  state.time.currentTick = snapshot.currentTick
  state.time.sessionRemainingTicks = snapshot.sessionRemainingTicks
  state.exploration!.playerState = snapshot.playerState
  state.player.skills = snapshot.skills
  state.player.inventory = snapshot.inventory
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
  let hardestThreshold = 0

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
    // Calculate base success chance and roll interval
    const level = state.player.skills.Exploration.level
    const rollInterval = getRollInterval(level)

    // For hard nodes, threshold is baseChance * 0.05
    // We need to calculate baseChance, but that requires knowledge params
    // For now, use a rough estimate - we'll refine when we actually execute
    const distance = currentArea.distance
    const baseRate = 0.05
    const levelBonus = (level - 1) * 0.05
    const distancePenalty = (distance - 1) * 0.05
    const baseChance = Math.max(0.01, baseRate + levelBonus - distancePenalty)
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
  const distance = currentArea.distance
  const rollInterval = getRollInterval(level)

  const baseRate = 0.05
  const levelBonus = (level - 1) * 0.05
  const distancePenalty = (distance - 1) * 0.05
  const successChance = Math.max(0.01, baseRate + levelBonus - distancePenalty)
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
    let cancelled = false

    // Only enable interactive mode if stdin is a TTY
    const isInteractive = process.stdin.isTTY

    if (isInteractive) {
      process.stdin.setRawMode(true)
      process.stdin.resume()
      process.stdin.setEncoding("utf8")
    }

    const cleanup = () => {
      clearInterval(interval)
      if (isInteractive) {
        process.stdin.removeListener("data", keyHandler)
        process.stdin.setRawMode(false)
        process.stdin.pause()
      }
    }

    const keyHandler = () => {
      cancelled = true
      cleanup()
      process.stdout.write("\n")
      resolve({ cancelled: true, ticksAnimated })
    }

    if (isInteractive) {
      process.stdin.on("data", keyHandler)
    }

    const interval = setInterval(() => {
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

interface PromptResult {
  continue: boolean
}

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

    // Snapshot state before execution
    const snapshot = createSnapshot(state)

    // Execute exploration fully (advances RNG, mutates state)
    const action: ExploreAction = { type: "Explore" }
    const log = await executeExplore(state, action)

    // If failed, show failure and exit
    if (!log.success) {
      console.log("\n" + formatActionLog(log, state))
      return
    }

    // Capture what changed
    const ticksConsumed = log.timeConsumed

    // Rewind state (except RNG counter which we preserve)
    restoreSnapshot(state, snapshot)

    // Animate with real-time tick consumption
    process.stdout.write("\nExploring")
    const animResult = await animateDiscovery(ticksConsumed, state)

    if (animResult.cancelled) {
      console.log(`Exploration cancelled after ${animResult.ticksAnimated}t`)
      return
    }

    // Re-execute to apply discoveries (RNG counter matches, so same result)
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

    // Snapshot state before execution
    const snapshot = createSnapshot(state)

    // Execute survey fully (advances RNG, mutates state)
    const action: SurveyAction = { type: "Survey" }
    const log = await executeSurvey(state, action)

    // If failed, show failure and exit
    if (!log.success) {
      console.log("\n" + formatActionLog(log, state))
      return
    }

    // Capture what changed
    const ticksConsumed = log.timeConsumed

    // Rewind state (except RNG counter which we preserve)
    restoreSnapshot(state, snapshot)

    // Animate with real-time tick consumption
    process.stdout.write("\nSurveying")
    const animResult = await animateDiscovery(ticksConsumed, state)

    if (animResult.cancelled) {
      console.log(`Survey cancelled after ${animResult.ticksAnimated}t`)
      return
    }

    // Re-execute to apply discoveries (RNG counter matches, so same result)
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
