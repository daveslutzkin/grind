/**
 * Safe Miner Policy
 *
 * Intent: Progress reliably with minimal risk.
 * - Fully explores an area before moving on
 * - Mines a discovered node until depleted (with town trips as needed)
 * - Prefers closer areas over further ones
 */

import type { Policy, PolicyObservation, PolicyAction } from "../types.js"
import { findNearestMineableArea, findBestNodeInArea } from "../observation.js"

/**
 * Find an area to explore based on distance preference.
 * Safe policy prefers exploring closer areas before venturing to the frontier.
 *
 * @param preference "below_frontier" = areas below max known distance (safer)
 *                   "at_frontier" = areas at max known distance (pushing forward)
 */
function findNearestUnexploredArea(
  obs: PolicyObservation,
  preference: "below_frontier" | "at_frontier"
): string | null {
  // Get current max known distance
  const maxKnownDistance =
    obs.knownAreas.length > 0 ? Math.max(...obs.knownAreas.map((a) => a.distance)) : 0

  // Find areas that still have undiscovered content
  // An area is worth exploring if:
  // 1. It's not fully explored (has remaining discoverables)
  // 2. It has no mineable nodes (exhausted nodes don't count - we should explore for more)
  const candidates = obs.knownAreas.filter((area) => {
    // Skip fully explored areas - nothing left to discover
    if (area.isFullyExplored) return false

    // Only explore if we don't have mineable nodes here
    // (if all discovered nodes are exhausted, we should explore for more)
    const hasMineableNode = area.discoveredNodes.some(
      (node) => node.isMineable && node.remainingCharges
    )
    if (hasMineableNode) return false

    if (preference === "below_frontier") {
      // Areas closer than the frontier (safer exploration)
      return area.distance < maxKnownDistance
    } else {
      // Areas at the frontier (pushing to higher distances)
      return area.distance === maxKnownDistance
    }
  })

  if (candidates.length === 0) return null

  // Sort by travel time (nearest first)
  candidates.sort((a, b) => a.travelTicksFromCurrent - b.travelTicksFromCurrent)
  return candidates[0].areaId
}

/**
 * Safe Miner Policy Implementation
 */
export const safeMiner: Policy = {
  id: "safe",
  name: "Safe Miner",

  decide(obs: PolicyObservation): PolicyAction {
    // 1. If inventory full → Return + Deposit
    if (obs.inventorySlotsUsed >= obs.inventoryCapacity) {
      return obs.isInTown ? { type: "DepositInventory" } : { type: "ReturnToTown" }
    }

    // 2. If at area and mineable node exists → Mine best XP/tick node
    if (obs.currentArea) {
      const mineableNode = findBestNodeInArea(obs.currentArea)
      if (mineableNode) {
        return { type: "Mine", nodeId: mineableNode.nodeId }
      }
    }

    // 3. If at area and not fully explored → keep exploring here
    if (obs.currentArea && !obs.currentArea.isFullyExplored) {
      return { type: "Explore", areaId: obs.currentArea.areaId }
    }

    // 4. If in town and known mineable node exists → Travel to nearest
    if (obs.isInTown) {
      const nearestMineable = findNearestMineableArea(obs)
      if (nearestMineable) {
        return { type: "Travel", toAreaId: nearestMineable.areaId }
      }
    }

    // 5. Explore nearest area below the frontier (safer)
    const saferTarget = findNearestUnexploredArea(obs, "below_frontier")
    if (saferTarget) {
      return { type: "Explore", areaId: saferTarget }
    }

    // 6. Only explore at frontier if nothing else available
    const frontierTarget = findNearestUnexploredArea(obs, "at_frontier")
    if (frontierTarget) {
      return { type: "Explore", areaId: frontierTarget }
    }

    // 7. If anywhere else is mineable, go there
    const anyMineable = findNearestMineableArea(obs)
    if (anyMineable) {
      return { type: "Travel", toAreaId: anyMineable.areaId }
    }

    // 8. Travel to nearest frontier area (unknown area with known connection)
    if (obs.frontierAreas.length > 0) {
      // Sort by distance first (prefer closer distances), then by travel time
      const sortedFrontier = [...obs.frontierAreas].sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance
        return a.travelTicksFromCurrent - b.travelTicksFromCurrent
      })
      return { type: "Travel", toAreaId: sortedFrontier[0].areaId }
    }

    // 9. Nothing to do - wait
    return { type: "Wait" }
  },
}
