/**
 * Policy Runner Public API
 *
 * This module provides a harness for running deterministic policies against
 * the game engine across many seeds. Use it for:
 * - Validating game balance across different strategies
 * - Monte Carlo analysis of XP rates and progression
 * - Testing for stalls and edge cases
 */

// Core execution
export { runSimulation } from "./runner.js"
export { runBatch, runValidation } from "./batch.js"
export { runBatchParallel } from "./parallel-batch.js"
export type { ParallelBatchConfig } from "./parallel-batch.js"

// Policies
export { safeMiner, allPolicies, getPolicyById } from "./policies/index.js"

// Observation
export {
  getObservation,
  findNearestMineableArea,
  findBestNodeInArea,
  getMaxDiscoveredDistance,
} from "./observation.js"

// Types
export type {
  // Core types
  Policy,
  PolicyObservation,
  PolicyAction,
  KnownArea,
  KnownNode,

  // Configuration
  RunConfig,
  BatchConfig,

  // Results
  RunResult,
  BatchResult,
  PolicyAggregates,
  TerminationReason,
  TicksSpent,
  LevelUpRecord,
  StallSnapshot,
  StallDetector,
  MetricsCollector,
} from "./types.js"

// Utilities
export {
  createStallDetector,
  createStallSnapshot,
  DEFAULT_STALL_WINDOW_SIZE,
} from "./stall-detection.js"
export { createMetricsCollector, computeAggregates, computeAllAggregates } from "./metrics.js"
export { toEngineAction, toEngineActions } from "./action-converter.js"
