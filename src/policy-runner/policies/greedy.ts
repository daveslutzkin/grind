/**
 * Greedy Miner Policy
 *
 * Intent: Push distance as soon as allowed.
 * - Always prefers highest unlocked distance
 * - Aggressive exploration to find new areas
 * - Falls back to safe behavior when stuck
 */

import type { Policy, PolicyObservation, PolicyAction } from "../types.js"
import { findBestNodeInArea } from "../observation.js"
import { safeMiner } from "./safe.js"

// Level-to-distance heuristic
// TODO: Extract to game config or derive from actual material requirements
const LEVEL_TO_DISTANCE: Array<{ maxLevel: number; distance: number }> = [
  { maxLevel: 2, distance: 1 },
  { maxLevel: 5, distance: 2 },
  { maxLevel: Infinity, distance: 3 },
]

/**
 * Get the maximum distance unlocked by the player's mining level.
 * This is a simplified heuristic - actual unlock may depend on game rules.
 */
function getMaxUnlockedDistance(miningLevel: number): number {
  for (const { maxLevel, distance } of LEVEL_TO_DISTANCE) {
    if (miningLevel <= maxLevel) return distance
  }
  return 3
}

/**
 * Find an area to explore at the target distance.
 */
function findUnexploredAtDistance(obs: PolicyObservation, targetDistance: number): string | null {
  // Find areas at the target distance that still have undiscovered content
  const candidates = obs.knownAreas.filter(
    (area) =>
      area.distance === targetDistance && !area.isFullyExplored && area.discoveredNodes.length === 0
  )

  if (candidates.length === 0) return null

  // Sort by travel time (nearest first)
  candidates.sort((a, b) => a.travelTicksFromCurrent - b.travelTicksFromCurrent)
  return candidates[0].areaId
}

/**
 * Greedy Miner Policy Implementation
 */
export const greedyMiner: Policy = {
  id: "greedy",
  name: "Greedy Miner",

  decide(obs: PolicyObservation): PolicyAction {
    // 1. Inventory management (same as safe)
    if (obs.inventorySlotsUsed >= obs.inventoryCapacity) {
      return obs.isInTown ? { type: "DepositInventory" } : { type: "ReturnToTown" }
    }

    // 2. Determine highest unlocked distance
    const maxUnlockedDistance = getMaxUnlockedDistance(obs.miningLevel)

    // 3. Prefer highest distance areas
    const preferredAreas = obs.knownAreas
      .filter((a) => a.distance === maxUnlockedDistance)
      .sort((a, b) => a.travelTicksFromCurrent - b.travelTicksFromCurrent)

    // 4. Mine at preferred distance if possible
    for (const area of preferredAreas) {
      const mineableNode = findBestNodeInArea(area)
      if (mineableNode) {
        if (area.areaId !== obs.currentAreaId) {
          return { type: "Travel", toAreaId: area.areaId }
        }
        return { type: "Mine", nodeId: mineableNode.nodeId }
      }
    }

    // 5. Explore at preferred distance
    const exploreTarget = findUnexploredAtDistance(obs, maxUnlockedDistance)
    if (exploreTarget) {
      return { type: "Explore", areaId: exploreTarget }
    }

    // 6. Fall back to lower distances - use safe policy logic
    return safeMiner.decide(obs)
  },
}
