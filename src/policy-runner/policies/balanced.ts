/**
 * Balanced Miner Policy
 *
 * Intent: Maximize expected XP/tick.
 * - Computes XP/tick for all known nodes including travel time
 * - Always picks the option with highest expected value
 * - Explores when no good mining options exist
 */

import type { Policy, PolicyObservation, PolicyAction, KnownNode } from "../types.js"

/**
 * Mining action duration in ticks.
 * TODO: This should come from game config, not be hardcoded.
 */
const MINING_TICKS_PER_ACTION = 5

/**
 * Estimate XP per tick for mining a node, accounting for travel time.
 *
 * XP formula (simplified): ticks × tier
 * Mining takes MINING_TICKS_PER_ACTION ticks per action
 *
 * Expected XP/tick = (miningTicks × tier) / (travelTicks + miningTicks)
 */
function computeXpPerTick(node: KnownNode, travelTicks: number): number {
  const miningTicks = MINING_TICKS_PER_ACTION
  const nodeXp = node.primaryMaterialTier * miningTicks
  const totalTicks = travelTicks + miningTicks

  // Avoid division by zero
  if (totalTicks <= 0) return nodeXp

  return nodeXp / totalTicks
}

/**
 * Find the nearest area to explore (any distance).
 */
function findNearestExploreTarget(obs: PolicyObservation): string | null {
  // Find areas with no discovered nodes
  const unexploredAreas = obs.knownAreas.filter((area) => area.discoveredNodes.length === 0)

  if (unexploredAreas.length === 0) return null

  // Sort by travel time (nearest first)
  unexploredAreas.sort((a, b) => a.travelTicksFromCurrent - b.travelTicksFromCurrent)
  return unexploredAreas[0].areaId
}

/**
 * Balanced Miner Policy Implementation
 */
export const balancedMiner: Policy = {
  id: "balanced",
  name: "Balanced Miner",

  decide(obs: PolicyObservation): PolicyAction {
    // 1. Inventory management (same as others)
    if (obs.inventorySlotsUsed >= obs.inventoryCapacity) {
      return obs.isInTown ? { type: "DepositInventory" } : { type: "ReturnToTown" }
    }

    // 2. Compute XP/tick for all known mineable nodes
    const candidates: Array<{
      node: KnownNode
      areaId: string
      xpPerTick: number
    }> = []

    for (const area of obs.knownAreas) {
      for (const node of area.discoveredNodes) {
        if (!node.isMineable || !node.remainingCharges) continue

        const travelTicks = area.areaId === obs.currentAreaId ? 0 : area.travelTicksFromCurrent

        candidates.push({
          node,
          areaId: area.areaId,
          xpPerTick: computeXpPerTick(node, travelTicks),
        })
      }
    }

    // Sort by XP/tick (highest first)
    candidates.sort((a, b) => b.xpPerTick - a.xpPerTick)

    // 3. Choose best EV option
    if (candidates.length > 0) {
      const best = candidates[0]
      if (best.areaId !== obs.currentAreaId) {
        return { type: "Travel", toAreaId: best.areaId }
      }
      return { type: "Mine", nodeId: best.node.nodeId }
    }

    // 4. No known nodes → Explore nearest viable area
    const exploreTarget = findNearestExploreTarget(obs)
    if (exploreTarget) {
      return { type: "Explore", areaId: exploreTarget }
    }

    // 5. Nothing to do - wait
    return { type: "Wait" }
  },
}
