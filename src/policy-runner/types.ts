/**
 * Type definitions for the Policy Runner
 *
 * The policy runner sits above the game engine, executing deterministic policies
 * that make decisions based on observable state only. It never exposes raw
 * WorldState to policies - only the sanitized PolicyObservation.
 */

import type { AreaID, NodeID, MaterialID, GatherMode, SkillID } from "../types.js"

// ============================================================================
// Policy Observation Types
// ============================================================================

/**
 * A known node discovered through exploration.
 * Only contains information the player has discovered.
 */
export interface KnownNode {
  nodeId: NodeID
  primaryMaterial: MaterialID
  primaryMaterialTier: number
  secondaryMaterials: MaterialID[]
  isMineable: boolean // Player has required level
  remainingCharges: number | null // null if unknown/infinite
  locationId: string
}

/**
 * A known area discovered through exploration.
 * Contains only discovered information.
 */
export interface KnownArea {
  areaId: AreaID
  distance: number
  travelTicksFromCurrent: number // Pre-computed
  discoveredNodes: KnownNode[]
  isFullyExplored: boolean // True if no more discoverables remain in this area
}

/**
 * An area reachable via a known connection but not yet discovered.
 * The player knows a path exists but hasn't visited yet.
 */
export interface FrontierArea {
  areaId: AreaID
  distance: number
  travelTicksFromCurrent: number
  reachableFrom: AreaID // The known area this is connected from
}

/**
 * The policy's view of the world state.
 * This is sanitized to only include information the player knows.
 * Policies never see raw WorldState or RNG state.
 */
export interface PolicyObservation {
  // Player state
  miningLevel: number
  miningXpInLevel: number // XP progress within current level
  miningTotalXp: number // Total cumulative XP
  inventoryCapacity: number
  inventorySlotsUsed: number
  inventoryByItem: Record<string, number> // Per-item counts
  currentAreaId: AreaID

  // Known world (only discovered information)
  knownAreas: KnownArea[]
  knownMineableMaterials: string[] // Materials player can mine (by level gate)

  // Frontier - unknown areas reachable via known connections
  frontierAreas: FrontierArea[]

  // Current location details
  currentArea: KnownArea | null // null if in town

  // Logistics
  isInTown: boolean
  canDeposit: boolean // true if at storage location with items
  returnTimeToTown: number // Ticks to travel back to town

  // For lazy travel time computation (optimization #4 from TODO.md)
  currentAreaDistance: number // Distance of current area (0 for TOWN)
}

// ============================================================================
// Policy Action Types
// ============================================================================

/**
 * Simplified actions that policies can issue.
 * These are converted to engine actions by the action converter.
 */
export type PolicyAction =
  | { type: "Mine"; nodeId: NodeID; mode?: GatherMode }
  | { type: "Explore"; areaId: AreaID }
  | { type: "Travel"; toAreaId: AreaID }
  | { type: "ReturnToTown" }
  | { type: "DepositInventory" }
  | { type: "Wait" }

// ============================================================================
// Policy Interface
// ============================================================================

/**
 * A policy is a deterministic function that decides actions based on observations.
 * Policies must be pure functions - no side effects, no learning, no RNG.
 */
export interface Policy {
  id: string
  name: string
  decide: (observation: PolicyObservation) => PolicyAction
}

// ============================================================================
// Stall Detection Types
// ============================================================================

/**
 * Snapshot of state when a stall is detected.
 * Used for debugging and analysis.
 */
export interface StallSnapshot {
  tick: number
  level: number
  distance: number
  knownNodeCount: number
  lastAction: PolicyAction
}

/**
 * Stall detector interface.
 * Tracks progress (XP + discoveries) over a rolling window.
 */
export interface StallDetector {
  recordTick(xpGained: number, nodesDiscovered: number): void
  isStalled(): boolean
  reset(): void
}

// ============================================================================
// Run Configuration and Results
// ============================================================================

/**
 * Configuration for a single simulation run.
 */
export interface RunConfig {
  seed: string
  policy: Policy
  targetLevel: number
  maxTicks: number
  stallWindowSize?: number // Default 1000
  recordActions?: boolean // If true, include action log in result
  onAction?: (record: ActionRecord) => void // Called after each action for streaming output
}

/**
 * Time breakdown by action type.
 */
export interface TicksSpent {
  mining: number
  traveling: number
  exploring: number
  inventoryManagement: number
  waiting: number
}

/**
 * Record of a level-up event.
 */
export interface LevelUpRecord {
  skill: SkillID
  level: number
  tick: number
  cumulativeXp: number
  distance: number // Max distance reached at time of level-up
  actionCount: number // Total actions taken at time of level-up
}

/**
 * Termination reason for a run.
 */
export type TerminationReason = "target_reached" | "max_ticks" | "stall" | "node_depleted"

/**
 * XP gained for a single skill.
 */
export interface SkillXpGain {
  skill: SkillID
  amount: number
}

/**
 * Skill level snapshot.
 */
export interface SkillLevelSnapshot {
  skill: SkillID
  level: number
}

/**
 * Record of a single action taken during simulation.
 */
export interface ActionRecord {
  tick: number
  policyAction: PolicyAction
  ticksConsumed: number
  success: boolean
  xpGained: SkillXpGain[] // XP gained per skill
  levelsAfter: SkillLevelSnapshot[] // Levels after this action (only skills that have gained XP)
  levelUps: SkillLevelSnapshot[] // Skills that leveled up on this action
}

/**
 * Skill state snapshot.
 */
export interface SkillSnapshot {
  skill: SkillID
  level: number
  totalXp: number
}

/**
 * High-level discovery summary for a run.
 */
export interface RunSummary {
  areasDiscovered: number
  areasFullyExplored: number
  miningLocationsDiscovered: number
  byDistance: Array<{
    distance: number
    areasDiscovered: number
    areasFullyExplored: number
    miningLocationsDiscovered: number
  }>
}

/**
 * Result of a single simulation run.
 */
export interface RunResult {
  seed: string
  policyId: string

  // Termination
  terminationReason: TerminationReason
  finalLevel: number // Mining level (for backwards compat)
  finalXp: number // Mining XP (for backwards compat)
  finalSkills: SkillSnapshot[] // All skills that gained XP
  totalTicks: number

  // Time breakdown
  ticksSpent: TicksSpent

  // Progression timeline
  levelUpTicks: LevelUpRecord[]

  // Action log (optional, enabled via config)
  actionLog?: ActionRecord[]

  // Stall info (if applicable)
  stallSnapshot?: StallSnapshot

  // Distance progression
  maxDistanceReached: number

  // Discovery summary
  summary: RunSummary
}

// ============================================================================
// Batch Configuration and Results
// ============================================================================

/**
 * Configuration for batch (Monte Carlo) runs.
 */
export interface BatchConfig {
  seeds?: string[] // Explicit seeds
  seedCount?: number // Or generate this many (default 100)
  policies: Policy[]
  targetLevel: number
  maxTicks: number
  stallWindowSize?: number
  onProgress?: () => void // Called after each simulation completes
}

/**
 * Counts of runs by termination reason (excluding target_reached).
 */
export type ErrorCounts = Partial<Record<Exclude<TerminationReason, "target_reached">, number>>

/**
 * Aggregated statistics for a policy across multiple runs.
 */
export interface PolicyAggregates {
  policyId: string
  runCount: number
  errorCounts: ErrorCounts // Counts by error type (stall, node_depleted, max_ticks)
  ticksToTarget: {
    p10: number
    p50: number
    p90: number
  }
  avgXpPerTick: number
  avgMaxDistance: number
}

/**
 * Result of batch runs.
 */
export interface BatchResult {
  results: RunResult[]
  aggregates: {
    byPolicy: Record<string, PolicyAggregates>
  }
}

// ============================================================================
// Metrics Collector Interface
// ============================================================================

/**
 * Internal metrics collector used during simulation.
 */
export interface MetricsCollector {
  recordAction(actionType: PolicyAction["type"], ticksConsumed: number): void
  recordLevelUp(
    skill: SkillID,
    level: number,
    tick: number,
    cumulativeXp: number,
    distance: number,
    actionCount: number
  ): void
  recordMaxDistance(distance: number): void
  finalize(
    terminationReason: TerminationReason,
    finalLevel: number,
    finalXp: number,
    finalSkills: SkillSnapshot[],
    totalTicks: number,
    stallSnapshot?: StallSnapshot
  ): Omit<RunResult, "seed" | "policyId" | "actionLog" | "summary">
}
