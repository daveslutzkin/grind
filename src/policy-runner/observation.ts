/**
 * Observation Builder
 *
 * Converts raw WorldState into a sanitized PolicyObservation that only
 * contains information the player has discovered. This is the only way
 * policies can see the world - they never get direct WorldState access.
 */

import type { WorldState, Node, Area, AreaID } from "../types.js"
import { getTotalXP } from "../types.js"
import type { PolicyObservation, KnownArea, KnownNode } from "./types.js"
import { findPath } from "../exploration.js"

/**
 * Build a KnownNode from a game Node, filtered by what the player can see.
 */
function buildKnownNode(node: Node, miningLevel: number, locationId: string): KnownNode {
  // Find the primary (highest tier) material the player can mine
  const mineableMaterials = node.materials
    .filter((m) => m.requiresSkill === "Mining" && miningLevel >= m.requiredLevel)
    .sort((a, b) => b.tier - a.tier)

  const primaryMaterial = mineableMaterials[0] ?? node.materials[0]
  const secondaryMaterials = node.materials
    .filter((m) => m.materialId !== primaryMaterial.materialId)
    .map((m) => m.materialId)

  // Node is mineable if player has required level for at least one material
  const isMineable = node.materials.some(
    (m) => m.requiresSkill === "Mining" && miningLevel >= m.requiredLevel
  )

  // Calculate remaining charges (sum of all remaining units)
  const remainingCharges = node.materials.reduce((sum, m) => sum + m.remainingUnits, 0)

  return {
    nodeId: node.nodeId,
    primaryMaterial: primaryMaterial.materialId,
    primaryMaterialTier: primaryMaterial.tier,
    secondaryMaterials,
    isMineable,
    remainingCharges: remainingCharges > 0 ? remainingCharges : null,
    locationId,
  }
}

/**
 * Calculate travel time from current area to target area.
 * Uses the pathfinding algorithm to find the shortest route.
 */
function calculateTravelTicks(state: WorldState, fromAreaId: AreaID, toAreaId: AreaID): number {
  if (fromAreaId === toAreaId) return 0

  const pathResult = findPath(state, fromAreaId, toAreaId)
  if (!pathResult) {
    // No known path - return a large value
    return Infinity
  }

  return Math.round(pathResult.totalTime)
}

/**
 * Build a KnownArea from the game Area, including only discovered nodes.
 */
function buildKnownArea(
  state: WorldState,
  area: Area,
  miningLevel: number,
  currentAreaId: AreaID
): KnownArea {
  const exploration = state.exploration
  const knownLocationIds = new Set(exploration.playerState.knownLocationIds)

  // Find all discovered mining nodes in this area
  const discoveredNodes: KnownNode[] = []

  for (const location of area.locations) {
    // Skip if location not discovered
    if (!knownLocationIds.has(location.id)) continue

    // Only include gathering nodes (mining)
    if (location.gatheringSkillType !== "Mining") continue

    // Find the corresponding node
    // Node ID format: "{areaId}-node-{index}" where location ID is "{areaId}-loc-{index}"
    const locMatch = location.id.match(/^(.+)-loc-(\d+)$/)
    if (!locMatch) continue

    const [, areaId, locIndex] = locMatch
    const nodeId = `${areaId}-node-${locIndex}`
    const node = state.world.nodes?.find((n) => n.nodeId === nodeId)

    if (node && !node.depleted) {
      discoveredNodes.push(buildKnownNode(node, miningLevel, location.id))
    }
  }

  return {
    areaId: area.id,
    distance: area.distance,
    travelTicksFromCurrent: calculateTravelTicks(state, currentAreaId, area.id),
    discoveredNodes,
  }
}

/**
 * Get the observation for a policy to make a decision.
 * This is the only view of the world that policies receive.
 *
 * @param state The current world state (read-only access)
 * @returns A sanitized PolicyObservation
 */
export function getObservation(state: WorldState): PolicyObservation {
  const miningSkill = state.player.skills.Mining
  const miningLevel = miningSkill.level
  const exploration = state.exploration
  const currentAreaId = exploration.playerState.currentAreaId

  // Build known areas (only areas the player has discovered)
  const knownAreas: KnownArea[] = []
  for (const areaId of exploration.playerState.knownAreaIds) {
    const area = exploration.areas.get(areaId)
    if (area && area.id !== "TOWN") {
      knownAreas.push(buildKnownArea(state, area, miningLevel, currentAreaId))
    }
  }

  // Find current area (null if in town)
  const currentArea =
    currentAreaId === "TOWN" ? null : (knownAreas.find((a) => a.areaId === currentAreaId) ?? null)

  // Check if player can deposit (at warehouse with items)
  const isInTown = currentAreaId === "TOWN"
  const hasItems = state.player.inventory.length > 0
  const atWarehouse = exploration.playerState.currentLocationId === "TOWN_WAREHOUSE"
  const canDeposit = isInTown && atWarehouse && hasItems

  // Build per-item inventory counts
  const inventoryByItem: Record<string, number> = {}
  for (const stack of state.player.inventory) {
    inventoryByItem[stack.itemId] = (inventoryByItem[stack.itemId] ?? 0) + stack.quantity
  }

  // Collect all unique mineable material IDs from discovered nodes
  const knownMineableMaterials = new Set<string>()
  for (const area of knownAreas) {
    for (const node of area.discoveredNodes) {
      if (node.isMineable) {
        knownMineableMaterials.add(node.primaryMaterial)
        // Also add secondary materials if they're mineable
        for (const matId of node.secondaryMaterials) {
          knownMineableMaterials.add(matId)
        }
      }
    }
  }

  // Calculate return time to town
  const returnTimeToTown = isInTown ? 0 : calculateTravelTicks(state, currentAreaId, "TOWN")

  return {
    miningLevel,
    miningXpInLevel: miningSkill.xp,
    miningTotalXp: getTotalXP(miningSkill),
    inventoryCapacity: state.player.inventoryCapacity,
    inventorySlotsUsed: state.player.inventory.length,
    inventoryByItem,
    currentAreaId,
    knownAreas,
    knownMineableMaterials: [...knownMineableMaterials],
    currentArea,
    isInTown,
    canDeposit,
    returnTimeToTown,
  }
}

/**
 * Helper: Find the nearest known area with mineable nodes.
 * Returns null if no such area exists.
 */
export function findNearestMineableArea(obs: PolicyObservation): KnownArea | null {
  const areasWithMineableNodes = obs.knownAreas.filter((area) =>
    area.discoveredNodes.some((node) => node.isMineable && node.remainingCharges)
  )

  if (areasWithMineableNodes.length === 0) return null

  // Sort by travel time
  areasWithMineableNodes.sort((a, b) => a.travelTicksFromCurrent - b.travelTicksFromCurrent)

  return areasWithMineableNodes[0]
}

/**
 * Helper: Find the best mineable node in an area (highest tier mineable).
 */
export function findBestNodeInArea(area: KnownArea): KnownNode | null {
  const mineableNodes = area.discoveredNodes.filter(
    (node) => node.isMineable && node.remainingCharges
  )

  if (mineableNodes.length === 0) return null

  // Sort by tier (descending)
  mineableNodes.sort((a, b) => b.primaryMaterialTier - a.primaryMaterialTier)

  return mineableNodes[0]
}

/**
 * Helper: Get the maximum distance the player has discovered.
 */
export function getMaxDiscoveredDistance(obs: PolicyObservation): number {
  if (obs.knownAreas.length === 0) return 0
  return Math.max(...obs.knownAreas.map((a) => a.distance))
}
