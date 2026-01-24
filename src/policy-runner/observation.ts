/**
 * Observation Builder
 *
 * Converts raw WorldState into a sanitized PolicyObservation that only
 * contains information the player has discovered. This is the only way
 * policies can see the world - they never get direct WorldState access.
 */

import type { WorldState, Node, Area, AreaID } from "../types.js"
import type { PolicyObservation, KnownArea, KnownNode, FrontierArea } from "./types.js"
import { buildDiscoverables, isConnectionKnown, getTotalXP } from "../exploration.js"

// Cache for fully explored areas - once fully explored, always fully explored
// This cache is per-run and should be cleared at the start of each run
const fullyExploredCache = new Map<string, boolean>()

/**
 * Clear the fully explored cache. Call this at the start of each simulation run.
 */
export function clearObservationCache(): void {
  fullyExploredCache.clear()
}

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

  // Node is mineable if player has required level for at least one material with remaining units
  const isMineable = node.materials.some(
    (m) => m.requiresSkill === "Mining" && miningLevel >= m.requiredLevel && m.remainingUnits > 0
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
 * Estimate travel time from current area to target area using O(1) heuristic.
 * Uses distance difference as a proxy - not exact but good enough for policy decisions.
 * Base travel time is ~10 ticks per hop, and we need ~1 hop per distance level.
 */
const BASE_TRAVEL_TICKS = 22 // Average travel time per distance level (accounts for varying multipliers)

function estimateTravelTicks(
  fromAreaId: AreaID,
  fromDistance: number,
  toAreaId: AreaID,
  toDistance: number
): number {
  if (fromAreaId === toAreaId) return 0

  // Heuristic: travel time is proportional to distance difference
  // Going from TOWN (distance 0) to distance 3 takes ~3 hops
  // Going between same-distance areas takes ~2 hops (down and up)
  const distanceDiff = Math.abs(fromDistance - toDistance)

  if (distanceDiff === 0) {
    // Same distance level - need to go through a common parent area
    return BASE_TRAVEL_TICKS * 2
  }

  return BASE_TRAVEL_TICKS * distanceDiff
}

/**
 * Build a KnownArea from the game Area, including only discovered nodes.
 * isFullyExplored is set to false initially - only computed when needed.
 */
function buildKnownArea(
  area: Area,
  miningLevel: number,
  knownLocationIds: Set<string>,
  nodesByNodeId: Map<string, Node>
): KnownArea {
  // Find all discovered mining nodes in this area
  const discoveredNodes: KnownNode[] = []

  for (const location of area.locations) {
    // Skip if location not discovered
    if (!knownLocationIds.has(location.id)) continue

    // Only include gathering nodes (mining)
    if (location.gatheringSkillType !== "Mining") continue

    // Find the corresponding node (O(1) Map lookup)
    // Node ID format: "{areaId}-node-{index}" where location ID is "{areaId}-loc-{index}"
    const locMatch = location.id.match(/^(.+)-loc-(\d+)$/)
    if (!locMatch) continue

    const [, areaId, locIndex] = locMatch
    const nodeId = `${areaId}-node-${locIndex}`
    const node = nodesByNodeId.get(nodeId)

    if (node && !node.depleted) {
      discoveredNodes.push(buildKnownNode(node, miningLevel, location.id))
    }
  }

  return {
    areaId: area.id,
    distance: area.distance,
    travelTicksFromCurrent: -1, // Populated later
    discoveredNodes,
    isFullyExplored: false, // Computed later only for areas we might explore
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
  const knownLocationIds = new Set(exploration.playerState.knownLocationIds)

  // Build O(1) node lookup map
  const nodesByNodeId = new Map<string, Node>()
  if (state.world.nodes) {
    for (const node of state.world.nodes) {
      nodesByNodeId.set(node.nodeId, node)
    }
  }

  // Get current area's distance (TOWN = 0)
  const currentAreaData = exploration.areas.get(currentAreaId)
  const currentDistance = currentAreaData?.distance ?? 0

  // Build known areas (only areas the player has discovered)
  // Skip areas that are fully explored with no mineable nodes - they're not useful
  const knownAreas: KnownArea[] = []
  for (const areaId of exploration.playerState.knownAreaIds) {
    const area = exploration.areas.get(areaId)
    if (area && area.id !== "TOWN") {
      const knownArea = buildKnownArea(area, miningLevel, knownLocationIds, nodesByNodeId)
      const isCurrentArea = area.id === currentAreaId

      // Check if this area has mineable nodes
      const hasMineableNode = knownArea.discoveredNodes.some(
        (n) => n.isMineable && n.remainingCharges
      )

      if (hasMineableNode) {
        // Area has mineable nodes - include it
        knownArea.travelTicksFromCurrent = estimateTravelTicks(
          currentAreaId,
          currentDistance,
          area.id,
          area.distance
        )
        knownAreas.push(knownArea)
        continue
      }

      // No mineable nodes - check if fully explored (use cache)
      let isFullyExplored = fullyExploredCache.get(areaId)
      if (isFullyExplored === undefined) {
        // Not in cache - compute it
        const { discoverables } = buildDiscoverables(state, area)
        isFullyExplored = discoverables.length === 0
        if (isFullyExplored) {
          // Cache positive results (fully explored never changes back)
          fullyExploredCache.set(areaId, true)
        }
      }

      // Include the area if it still has content OR it's the current area
      if (!isFullyExplored || isCurrentArea) {
        knownArea.isFullyExplored = isFullyExplored
        knownArea.travelTicksFromCurrent = estimateTravelTicks(
          currentAreaId,
          currentDistance,
          area.id,
          area.distance
        )
        knownAreas.push(knownArea)
      }
      // else: fully explored with no mineable nodes - skip it entirely
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
  const returnTimeToTown = isInTown
    ? 0
    : estimateTravelTicks(currentAreaId, currentDistance, "TOWN", 0)

  // Build frontier areas - unknown areas reachable via known connections
  const knownAreaIds = new Set(exploration.playerState.knownAreaIds)
  const knownConnectionIds = new Set(exploration.playerState.knownConnectionIds)
  const frontierAreas: FrontierArea[] = []
  const seenFrontierAreaIds = new Set<AreaID>() // O(1) deduplication

  // Find all connections that lead to unknown areas
  for (const conn of exploration.connections) {
    // Check if this connection is known
    if (!isConnectionKnown(knownConnectionIds, conn.fromAreaId, conn.toAreaId)) {
      continue
    }

    // Check if one end is known and the other is unknown
    const fromKnown = knownAreaIds.has(conn.fromAreaId)
    const toKnown = knownAreaIds.has(conn.toAreaId)

    let unknownAreaId: AreaID | null = null
    let knownAreaId: AreaID | null = null

    if (fromKnown && !toKnown) {
      unknownAreaId = conn.toAreaId
      knownAreaId = conn.fromAreaId
    } else if (!fromKnown && toKnown) {
      unknownAreaId = conn.fromAreaId
      knownAreaId = conn.toAreaId
    }

    if (unknownAreaId && knownAreaId) {
      // Check if we already have this frontier area (O(1) Set lookup)
      if (seenFrontierAreaIds.has(unknownAreaId)) {
        continue
      }
      seenFrontierAreaIds.add(unknownAreaId)

      const unknownArea = exploration.areas.get(unknownAreaId)
      if (unknownArea) {
        // Use O(1) heuristic for travel time to frontier
        // Frontier is 1 distance further than the known connecting area
        const totalTravelTime = estimateTravelTicks(
          currentAreaId,
          currentDistance,
          unknownAreaId,
          unknownArea.distance
        )

        frontierAreas.push({
          areaId: unknownAreaId,
          distance: unknownArea.distance,
          travelTicksFromCurrent: totalTravelTime,
          reachableFrom: knownAreaId,
        })
      }
    }
  }

  // Sort frontier areas by travel time
  frontierAreas.sort((a, b) => a.travelTicksFromCurrent - b.travelTicksFromCurrent)

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
    frontierAreas,
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
