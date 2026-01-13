/**
 * Stall Detection
 *
 * Implements a rolling window stall detector that monitors progress
 * (XP gained + nodes discovered) and triggers if no progress is made
 * within the window size.
 */

import type { StallDetector, StallSnapshot, PolicyAction } from "./types.js"
import type { WorldState } from "../types.js"

/**
 * Default stall window size in ticks.
 * If no XP is gained and no nodes are discovered for this many ticks,
 * the run is considered stalled.
 */
export const DEFAULT_STALL_WINDOW_SIZE = 1000

/**
 * Create a new stall detector with the specified window size.
 *
 * @param windowSize Number of ticks without progress before stall triggers
 * @returns A new StallDetector instance
 */
export function createStallDetector(windowSize: number = DEFAULT_STALL_WINDOW_SIZE): StallDetector {
  let ticksWithoutProgress = 0

  return {
    /**
     * Record a tick with progress information.
     * Resets the counter if any progress was made, otherwise increments.
     */
    recordTick(xpGained: number, nodesDiscovered: number): void {
      if (xpGained > 0 || nodesDiscovered > 0) {
        ticksWithoutProgress = 0
      } else {
        ticksWithoutProgress++
      }
    },

    /**
     * Check if the simulation is stalled.
     * Returns true if no progress has been made for windowSize ticks.
     */
    isStalled(): boolean {
      return ticksWithoutProgress >= windowSize
    },

    /**
     * Reset the stall detector to initial state.
     */
    reset(): void {
      ticksWithoutProgress = 0
    },
  }
}

/**
 * Create a stall snapshot from current state.
 * Used for debugging and analysis when a stall is detected.
 */
export function createStallSnapshot(state: WorldState, lastAction: PolicyAction): StallSnapshot {
  const exploration = state.exploration

  // Count known nodes
  let knownNodeCount = 0
  for (const areaId of exploration.playerState.knownAreaIds) {
    const area = exploration.areas.get(areaId)
    if (area) {
      for (const location of area.locations) {
        if (
          exploration.playerState.knownLocationIds.includes(location.id) &&
          location.gatheringSkillType === "Mining"
        ) {
          knownNodeCount++
        }
      }
    }
  }

  // Find max discovered distance
  let maxDistance = 0
  for (const areaId of exploration.playerState.knownAreaIds) {
    const area = exploration.areas.get(areaId)
    if (area && area.distance > maxDistance) {
      maxDistance = area.distance
    }
  }

  return {
    tick: state.time.currentTick,
    level: state.player.skills.Mining.level,
    distance: maxDistance,
    knownNodeCount,
    lastAction,
  }
}
