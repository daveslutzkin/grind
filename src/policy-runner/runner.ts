/**
 * Single-Run Executor
 *
 * Executes a single policy run from start to termination.
 * The runner:
 * 1. Creates a fresh world state from the seed
 * 2. Runs the policy decision loop until termination
 * 3. Collects metrics throughout the run
 * 4. Returns structured results
 */

import type { WorldState } from "../types.js"
import { getTotalXP } from "../types.js"
import { createWorld } from "../world.js"
import { executeAction } from "../engine.js"
import { consumeTime } from "../stateHelpers.js"

import type { RunConfig, RunResult, PolicyAction } from "./types.js"
import { getObservation, getMaxDiscoveredDistance } from "./observation.js"
import { toEngineActions } from "./action-converter.js"
import {
  createStallDetector,
  createStallSnapshot,
  DEFAULT_STALL_WINDOW_SIZE,
} from "./stall-detection.js"
import { createMetricsCollector } from "./metrics.js"

/**
 * Initialize the world state with required guilds enrolled.
 * The policy runner assumes Mining and Exploration guilds are already joined.
 */
async function initializeWorld(seed: string): Promise<WorldState> {
  const state = createWorld(seed)

  // Enrol in Mining guild (required for mining)
  state.exploration.playerState.currentLocationId = "TOWN_MINERS_GUILD"
  await executeAction(state, { type: "Enrol" })
  state.exploration.playerState.currentLocationId = null

  // Enrol in Exploration guild (required for exploring)
  state.exploration.playerState.currentLocationId = "TOWN_EXPLORERS_GUILD"
  await executeAction(state, { type: "Enrol" })
  state.exploration.playerState.currentLocationId = null

  return state
}

/**
 * Calculate XP gained between two states.
 */
function calculateXpGained(prevXp: number, prevLevel: number, state: WorldState): number {
  const currentTotalXp = getTotalXP(state.player.skills.Mining)
  const prevTotalXp = prevXp + sumXpToLevel(prevLevel)
  return currentTotalXp - prevTotalXp
}

/**
 * Sum of XP required to reach a level (not including that level's threshold).
 */
function sumXpToLevel(level: number): number {
  let total = 0
  for (let l = 1; l < level; l++) {
    total += (l + 1) * (l + 1) // XP to go from l to l+1
  }
  return total
}

/**
 * Execute a policy action, handling multi-action conversions and waits.
 * Returns the total ticks consumed and XP gained.
 */
async function executePolicyAction(
  state: WorldState,
  policyAction: PolicyAction
): Promise<{ ticksConsumed: number; xpGained: number; nodesDiscovered: number }> {
  const prevXp = state.player.skills.Mining.xp
  const prevLevel = state.player.skills.Mining.level
  const prevKnownLocations = state.exploration.playerState.knownLocationIds.length

  const converted = toEngineActions(policyAction, state)

  let totalTicks = 0

  if (converted.isWait) {
    // Wait action - consume 1 tick
    consumeTime(state, 1)
    totalTicks = 1
  } else {
    // Execute all converted actions
    for (const action of converted.actions) {
      const log = await executeAction(state, action)
      totalTicks += log.timeConsumed
    }
  }

  const xpGained = calculateXpGained(prevXp, prevLevel, state)
  const nodesDiscovered = state.exploration.playerState.knownLocationIds.length - prevKnownLocations

  return { ticksConsumed: totalTicks, xpGained, nodesDiscovered }
}

/**
 * Run a single simulation with the given configuration.
 *
 * @param config The run configuration
 * @returns The run result with metrics
 */
export async function runSimulation(config: RunConfig): Promise<RunResult> {
  const { seed, policy, targetLevel, maxTicks } = config
  const stallWindowSize = config.stallWindowSize ?? DEFAULT_STALL_WINDOW_SIZE

  // Initialize
  const state = await initializeWorld(seed)
  const stallDetector = createStallDetector(stallWindowSize)
  const metrics = createMetricsCollector()

  // Track last action for stall snapshot
  let lastPolicyAction: PolicyAction = { type: "Wait" }

  // Main loop
  while (true) {
    // Check termination conditions (in priority order)
    const currentLevel = state.player.skills.Mining.level

    if (currentLevel >= targetLevel) {
      const metricsResult = metrics.finalize(
        "target_reached",
        currentLevel,
        getTotalXP(state.player.skills.Mining),
        state.time.currentTick
      )
      return {
        seed,
        policyId: policy.id,
        ...metricsResult,
      }
    }

    if (state.time.currentTick >= maxTicks) {
      const metricsResult = metrics.finalize(
        "max_ticks",
        currentLevel,
        getTotalXP(state.player.skills.Mining),
        state.time.currentTick
      )
      return {
        seed,
        policyId: policy.id,
        ...metricsResult,
      }
    }

    if (stallDetector.isStalled()) {
      const stallSnapshot = createStallSnapshot(state, lastPolicyAction)
      const metricsResult = metrics.finalize(
        "stall",
        currentLevel,
        getTotalXP(state.player.skills.Mining),
        state.time.currentTick,
        stallSnapshot
      )
      return {
        seed,
        policyId: policy.id,
        ...metricsResult,
      }
    }

    // Get observation and make decision
    const observation = getObservation(state)
    const policyAction = policy.decide(observation)
    lastPolicyAction = policyAction

    // Track max distance
    metrics.recordMaxDistance(getMaxDiscoveredDistance(observation))

    // Record previous level for level-up detection
    const prevLevel = state.player.skills.Mining.level

    // Execute the action
    const { ticksConsumed, xpGained, nodesDiscovered } = await executePolicyAction(
      state,
      policyAction
    )

    // Record metrics
    metrics.recordAction(policyAction.type, ticksConsumed)
    stallDetector.recordTick(xpGained, nodesDiscovered)

    // Record level-ups
    const newLevel = state.player.skills.Mining.level
    if (newLevel > prevLevel) {
      metrics.recordLevelUp(
        newLevel,
        state.time.currentTick,
        getTotalXP(state.player.skills.Mining)
      )
    }
  }
}
