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

import type { WorldState, SkillID, SkillState } from "../types.js"
import { getTotalXP } from "../types.js"
import { createWorld } from "../world.js"
import { executeAction } from "../engine.js"
import { consumeTime } from "../stateHelpers.js"

import type {
  RunConfig,
  RunResult,
  PolicyAction,
  ActionRecord,
  SkillXpGain,
  SkillLevelSnapshot,
  SkillSnapshot,
} from "./types.js"
import { getObservation, getMaxDiscoveredDistance, clearObservationCache } from "./observation.js"
import { toEngineActions, type ConversionFailure } from "./action-converter.js"
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
 * All skills that can gain XP in the policy runner.
 */
const TRACKED_SKILLS: SkillID[] = ["Mining", "Exploration"]

/**
 * Capture a snapshot of all tracked skill states.
 */
function captureSkillStates(state: WorldState): Record<SkillID, SkillState> {
  const snapshot: Partial<Record<SkillID, SkillState>> = {}
  for (const skill of TRACKED_SKILLS) {
    snapshot[skill] = { ...state.player.skills[skill] }
  }
  return snapshot as Record<SkillID, SkillState>
}

/**
 * Calculate XP gained for each skill between snapshots.
 */
function calculateAllXpGained(
  prevStates: Record<SkillID, SkillState>,
  state: WorldState
): SkillXpGain[] {
  const gains: SkillXpGain[] = []
  for (const skill of TRACKED_SKILLS) {
    const prevTotal = getTotalXP(prevStates[skill])
    const currentTotal = getTotalXP(state.player.skills[skill])
    const gained = currentTotal - prevTotal
    if (gained > 0) {
      gains.push({ skill, amount: gained })
    }
  }
  return gains
}

/**
 * Get current levels for all skills that have gained XP.
 */
function getCurrentLevels(state: WorldState, skillsWithXp: Set<SkillID>): SkillLevelSnapshot[] {
  const levels: SkillLevelSnapshot[] = []
  for (const skill of skillsWithXp) {
    levels.push({ skill, level: state.player.skills[skill].level })
  }
  return levels
}

/**
 * Detect level-ups between skill state snapshots.
 */
function detectLevelUps(
  prevStates: Record<SkillID, SkillState>,
  state: WorldState
): SkillLevelSnapshot[] {
  const levelUps: SkillLevelSnapshot[] = []
  for (const skill of TRACKED_SKILLS) {
    const prevLevel = prevStates[skill].level
    const newLevel = state.player.skills[skill].level
    if (newLevel > prevLevel) {
      levelUps.push({ skill, level: newLevel })
    }
  }
  return levelUps
}

/**
 * Get final skill snapshots for all skills that gained XP during the run.
 */
function getFinalSkillSnapshots(state: WorldState, skillsWithXp: Set<SkillID>): SkillSnapshot[] {
  const snapshots: SkillSnapshot[] = []
  for (const skill of skillsWithXp) {
    snapshots.push({
      skill,
      level: state.player.skills[skill].level,
      totalXp: getTotalXP(state.player.skills[skill]),
    })
  }
  return snapshots
}

/**
 * Result from executing a policy action.
 */
interface ActionExecutionResult {
  ticksConsumed: number
  xpGained: SkillXpGain[]
  levelUps: SkillLevelSnapshot[]
  nodesDiscovered: number
  success: boolean
  failure?: ConversionFailure
}

/**
 * Execute a policy action, handling multi-action conversions and waits.
 * Returns the total ticks consumed, XP gained for all skills, level-ups, and success status.
 * May return a failure indicator if the action cannot be executed.
 */
async function executePolicyAction(
  state: WorldState,
  policyAction: PolicyAction
): Promise<ActionExecutionResult> {
  const prevSkillStates = captureSkillStates(state)
  const prevKnownLocations = state.exploration.playerState.knownLocationIds.length

  const converted = toEngineActions(policyAction, state)

  // Check for conversion failure
  if (converted.failure) {
    return {
      ticksConsumed: 0,
      xpGained: [],
      levelUps: [],
      nodesDiscovered: 0,
      success: false,
      failure: converted.failure,
    }
  }

  let totalTicks = 0
  let allSucceeded = true

  if (converted.isWait) {
    // Wait action - consume 1 tick
    consumeTime(state, 1)
    totalTicks = 1
  } else {
    // Execute all converted actions
    for (const action of converted.actions) {
      const log = await executeAction(state, action)
      totalTicks += log.timeConsumed
      if (!log.success) {
        allSucceeded = false
      }
    }
  }

  const xpGained = calculateAllXpGained(prevSkillStates, state)
  const levelUps = detectLevelUps(prevSkillStates, state)
  const nodesDiscovered = state.exploration.playerState.knownLocationIds.length - prevKnownLocations

  return { ticksConsumed: totalTicks, xpGained, levelUps, nodesDiscovered, success: allSucceeded }
}

/**
 * Run a single simulation with the given configuration.
 *
 * @param config The run configuration
 * @returns The run result with metrics
 */
export async function runSimulation(config: RunConfig): Promise<RunResult> {
  const { seed, policy, targetLevel, maxTicks, onAction } = config
  const stallWindowSize = config.stallWindowSize ?? DEFAULT_STALL_WINDOW_SIZE
  const recordActions = config.recordActions ?? false

  // Initialize
  clearObservationCache() // Clear cache from any previous run
  const state = await initializeWorld(seed)
  const stallDetector = createStallDetector(stallWindowSize)
  const metrics = createMetricsCollector()

  // Track last action for stall snapshot
  let lastPolicyAction: PolicyAction = { type: "Wait" }

  // Action log (only populated if recordActions is true)
  const actionLog: ActionRecord[] = []

  // Track which skills have gained XP during the run
  const skillsWithXp = new Set<SkillID>()

  // Track action count for level-up records
  let actionCount = 0

  // Helper to build result with optional action log
  const buildResult = (metricsResult: Omit<RunResult, "seed" | "policyId" | "actionLog">) => ({
    seed,
    policyId: policy.id,
    ...metricsResult,
    ...(recordActions ? { actionLog } : {}),
  })

  // Main loop
  while (true) {
    // Check termination conditions (in priority order)
    const currentLevel = state.player.skills.Mining.level

    if (currentLevel >= targetLevel) {
      const metricsResult = metrics.finalize(
        "target_reached",
        currentLevel,
        getTotalXP(state.player.skills.Mining),
        getFinalSkillSnapshots(state, skillsWithXp),
        state.time.currentTick
      )
      return buildResult(metricsResult)
    }

    if (state.time.currentTick >= maxTicks) {
      const metricsResult = metrics.finalize(
        "max_ticks",
        currentLevel,
        getTotalXP(state.player.skills.Mining),
        getFinalSkillSnapshots(state, skillsWithXp),
        state.time.currentTick
      )
      return buildResult(metricsResult)
    }

    if (stallDetector.isStalled()) {
      const stallSnapshot = createStallSnapshot(state, lastPolicyAction)
      const metricsResult = metrics.finalize(
        "stall",
        currentLevel,
        getTotalXP(state.player.skills.Mining),
        getFinalSkillSnapshots(state, skillsWithXp),
        state.time.currentTick,
        stallSnapshot
      )
      return buildResult(metricsResult)
    }

    // Get observation and make decision
    const observation = getObservation(state)
    const policyAction = policy.decide(observation)
    lastPolicyAction = policyAction

    // Track max distance before action (for level-up records)
    const maxDistance = getMaxDiscoveredDistance(observation)
    metrics.recordMaxDistance(maxDistance)

    // Record tick before execution for action log
    const tickBefore = state.time.currentTick

    // Execute the action
    const { ticksConsumed, xpGained, levelUps, nodesDiscovered, success, failure } =
      await executePolicyAction(state, policyAction)

    // Check for conversion failure (e.g., no mineable materials in node)
    if (failure === "node_depleted") {
      const metricsResult = metrics.finalize(
        "node_depleted",
        currentLevel,
        getTotalXP(state.player.skills.Mining),
        getFinalSkillSnapshots(state, skillsWithXp),
        state.time.currentTick
      )
      return buildResult(metricsResult)
    }

    // Increment action count
    actionCount++

    // Track which skills gained XP
    for (const gain of xpGained) {
      skillsWithXp.add(gain.skill)
    }

    // Record action if logging enabled
    if (recordActions || onAction) {
      const record: ActionRecord = {
        tick: tickBefore,
        policyAction,
        ticksConsumed,
        success,
        xpGained,
        levelsAfter: getCurrentLevels(state, skillsWithXp),
        levelUps,
      }
      if (recordActions) {
        actionLog.push(record)
      }
      if (onAction) {
        onAction(record)
      }
    }

    // Record metrics
    metrics.recordAction(policyAction.type, ticksConsumed)

    // Calculate total XP gained for stall detection (any skill XP counts as progress)
    const totalXpGained = xpGained.reduce((sum, gain) => sum + gain.amount, 0)
    stallDetector.recordTick(totalXpGained, nodesDiscovered)

    // Record level-ups for each skill
    for (const levelUp of levelUps) {
      metrics.recordLevelUp(
        levelUp.skill,
        levelUp.level,
        state.time.currentTick,
        getTotalXP(state.player.skills[levelUp.skill]),
        maxDistance,
        actionCount
      )
    }
  }
}
