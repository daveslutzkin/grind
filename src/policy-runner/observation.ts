/**
 * Observation Builder
 *
 * Converts raw WorldState into a sanitized PolicyObservation that only
 * contains information the player has discovered. This is the only way
 * policies can see the world - they never get direct WorldState access.
 */

import type { WorldState, Node, Area, AreaID } from "../types.js"
import type {
  PolicyObservation,
  KnownArea,
  KnownNode,
  FrontierArea,
  PolicyAction,
} from "./types.js"
import {
  buildDiscoverables,
  isConnectionKnown,
  getTotalXP,
  getConnectionsForArea,
} from "../exploration.js"

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
 * Cached Sets for building observations.
 * Used to avoid O(n) array→Set conversion on each rebuild.
 */
interface CachedSets {
  knownLocationIds: Set<string>
  knownAreaIds: Set<AreaID>
  knownConnectionIds: Set<string>
}

/**
 * Build a fresh observation from scratch. This is the original O(state_size)
 * implementation that iterates all known areas/locations/connections.
 *
 * @param state The current world state (read-only access)
 * @param cachedSets Optional pre-built Sets to avoid O(n) array conversion
 * @returns A sanitized PolicyObservation
 */
function buildObservationFresh(state: WorldState, cachedSets?: CachedSets): PolicyObservation {
  const miningSkill = state.player.skills.Mining
  const miningLevel = miningSkill.level
  const exploration = state.exploration
  const currentAreaId = exploration.playerState.currentAreaId

  // Use cached Sets if provided, otherwise build from arrays
  const knownLocationIds =
    cachedSets?.knownLocationIds ?? new Set(exploration.playerState.knownLocationIds)
  const knownAreaIds = cachedSets?.knownAreaIds ?? new Set(exploration.playerState.knownAreaIds)
  const knownConnectionIds =
    cachedSets?.knownConnectionIds ?? new Set(exploration.playerState.knownConnectionIds)

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
  for (const areaId of knownAreaIds) {
    const area = exploration.areas.get(areaId)
    if (area && area.id !== "TOWN") {
      const knownArea = buildKnownArea(area, miningLevel, knownLocationIds, nodesByNodeId)
      const isCurrentArea = area.id === currentAreaId

      // Always check if fully explored (use cache) - even for areas with mineable nodes
      let isFullyExplored = fullyExploredCache.get(areaId)
      if (isFullyExplored === undefined) {
        // Not in cache - compute it (pass cached Sets to avoid recreating them)
        const { discoverables } = buildDiscoverables(state, area, {
          knownLocationIds,
          knownAreaIds,
          knownConnectionIds,
        })
        isFullyExplored = discoverables.length === 0
        if (isFullyExplored) {
          // Cache positive results (fully explored never changes back)
          fullyExploredCache.set(areaId, true)
        }
      }
      knownArea.isFullyExplored = isFullyExplored

      // Check if this area has mineable nodes
      const hasMineableNode = knownArea.discoveredNodes.some(
        (n) => n.isMineable && n.remainingCharges
      )

      // Include the area if:
      // - it has mineable nodes (useful for mining)
      // - OR it's not fully explored (useful for exploration)
      // - OR it's the current area
      if (hasMineableNode || !isFullyExplored || isCurrentArea) {
        knownArea.travelTicksFromCurrent = estimateTravelTicks(
          currentAreaId,
          currentDistance,
          area.id,
          area.distance
        )
        knownAreas.push(knownArea)
      }
      // else: no mineable nodes AND fully explored - skip it entirely
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
  // Optimized: iterate through known areas and their connections (O(known_areas))
  // instead of all connections (O(all_connections))
  // Note: knownAreaIds and knownConnectionIds are already defined above (from cached or fresh)
  const frontierAreas: FrontierArea[] = []
  const seenFrontierAreaIds = new Set<AreaID>() // O(1) deduplication

  // For each known area, check its connections for unknown areas
  for (const knownAreaId of knownAreaIds) {
    const areaConnections = getConnectionsForArea(exploration, knownAreaId)

    for (const conn of areaConnections) {
      // Check if this connection is known
      if (!isConnectionKnown(knownConnectionIds, conn.fromAreaId, conn.toAreaId)) {
        continue
      }

      // Determine target area
      const targetId = conn.fromAreaId === knownAreaId ? conn.toAreaId : conn.fromAreaId

      // Skip if target is also known (not a frontier)
      if (knownAreaIds.has(targetId)) {
        continue
      }

      // Skip if already seen this frontier area
      if (seenFrontierAreaIds.has(targetId)) {
        continue
      }
      seenFrontierAreaIds.add(targetId)

      const unknownArea = exploration.areas.get(targetId)
      if (unknownArea) {
        // Use O(1) heuristic for travel time to frontier
        const totalTravelTime = estimateTravelTicks(
          currentAreaId,
          currentDistance,
          targetId,
          unknownArea.distance
        )

        frontierAreas.push({
          areaId: targetId,
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
 * Result of action execution, used for incremental observation updates.
 */
export interface ActionResult {
  /** Number of ticks consumed by the action */
  ticksConsumed: number
  /** Whether the action succeeded */
  success: boolean
  /** Number of new locations discovered (for Explore actions) */
  nodesDiscovered: number
  /** Number of areas that became known (for travel to frontier) */
  areasDiscovered?: number
  /** IDs of newly discovered areas */
  newAreaIds?: AreaID[]
}

/**
 * ObservationManager - maintains observation state and supports incremental updates.
 *
 * Phase 1: Wraps buildObservationFresh() with no incremental logic yet.
 * Phase 2: Adds validation infrastructure for drift detection.
 * Phase 3: Implements incremental updates for each action type.
 */
export class ObservationManager {
  private observation: PolicyObservation | null = null
  private readonly validationInterval: number
  private validationEnabled: boolean = true

  // Cached state for incremental updates
  private cachedKnownLocationIds: Set<string> | null = null
  private cachedKnownAreaIds: Set<AreaID> | null = null
  private cachedKnownConnectionIds: Set<string> | null = null

  // O(1) node lookup cache - maps nodeId to KnownNode in observation
  private nodeById: Map<string, KnownNode> | null = null
  // O(1) world node lookup cache - maps nodeId to world Node
  private worldNodeById: Map<string, Node> | null = null

  /**
   * Create an ObservationManager.
   * @param validationInterval How often to validate (in ticks). Default 5000.
   */
  constructor(validationInterval: number = 5000) {
    this.validationInterval = validationInterval
  }

  /**
   * Get the current observation.
   * Returns cached observation if available, otherwise builds fresh.
   */
  getObservation(state: WorldState): PolicyObservation {
    if (this.observation) {
      return this.observation
    }

    // First call or after reset - build fresh
    // Initialize cached Sets if not already done
    if (!this.cachedKnownLocationIds) {
      this.cachedKnownLocationIds = new Set(state.exploration.playerState.knownLocationIds)
      this.cachedKnownAreaIds = new Set(state.exploration.playerState.knownAreaIds)
      this.cachedKnownConnectionIds = new Set(state.exploration.playerState.knownConnectionIds)
    }

    // Build using cached Sets (avoids O(n) array→Set conversion)
    this.observation = buildObservationFresh(state, {
      knownLocationIds: this.cachedKnownLocationIds,
      knownAreaIds: this.cachedKnownAreaIds!,
      knownConnectionIds: this.cachedKnownConnectionIds!,
    })

    // Build O(1) node lookup cache
    this.rebuildNodeCache()

    return this.observation
  }

  /**
   * Rebuild the nodeById cache from the current observation.
   * Called after observation is built or rebuilt.
   */
  private rebuildNodeCache(): void {
    if (!this.observation) return

    this.nodeById = new Map()
    for (const area of this.observation.knownAreas) {
      for (const node of area.discoveredNodes) {
        this.nodeById.set(node.nodeId, node)
      }
    }
  }

  /**
   * Filter out areas from knownAreas that are no longer useful.
   * An area is removed if it's:
   * - Fully explored AND
   * - Has no mineable nodes AND
   * - Is not the current area
   *
   * This replicates the filtering done in buildObservationFresh.
   * Uses the fullyExploredCache to match the behavior of buildObservationFresh.
   */
  private filterUselessAreas(_state?: WorldState): void {
    if (!this.observation) return

    const currentAreaId = this.observation.currentAreaId
    this.observation.knownAreas = this.observation.knownAreas.filter((area) => {
      const hasMineableNode = area.discoveredNodes.some((n) => n.isMineable && n.remainingCharges)
      const isCurrentArea = area.areaId === currentAreaId

      // Use cached isFullyExplored value - same as buildObservationFresh
      // Once fully explored, always fully explored (locations/connections can't be undiscovered)
      const cachedFullyExplored = fullyExploredCache.get(area.areaId)
      if (cachedFullyExplored === true) {
        area.isFullyExplored = true
      }

      // Keep if: has mineable nodes OR not fully explored OR is current area
      return hasMineableNode || !area.isFullyExplored || isCurrentArea
    })
  }

  /**
   * Rebuild the world node cache for O(1) lookups.
   * Called when needed and cached for subsequent lookups.
   */
  private getWorldNodeById(state: WorldState, nodeId: string): Node | undefined {
    // Lazily build cache if needed or if world nodes have changed
    if (!this.worldNodeById || this.worldNodeById.size !== (state.world.nodes?.length ?? 0)) {
      this.worldNodeById = new Map()
      if (state.world.nodes) {
        for (const node of state.world.nodes) {
          this.worldNodeById.set(node.nodeId, node)
        }
      }
    }
    return this.worldNodeById.get(nodeId)
  }

  /**
   * Apply an action result to incrementally update the cached observation.
   * Call this after executePolicyAction completes.
   *
   * @param state The current world state (after action execution)
   * @param action The policy action that was executed
   * @param result The result of executing the action
   */
  applyActionResult(state: WorldState, action: PolicyAction, result: ActionResult): void {
    if (!this.observation) {
      // No cached observation - nothing to update
      return
    }

    // Dispatch to action-specific update methods
    switch (action.type) {
      case "Mine":
        this.applyMineResult(state, action.nodeId)
        break
      case "DepositInventory":
        this.applyDepositResult(state)
        break
      case "Travel":
        this.applyTravelResult(state, result)
        break
      case "ReturnToTown":
        this.applyReturnToTownResult(state)
        break
      case "Explore":
        this.applyExploreResult(state, result)
        break
      case "Wait":
        // Nothing to update
        break
    }
  }

  /**
   * Apply Mine action result: update inventory and XP fields, node charges.
   */
  private applyMineResult(state: WorldState, nodeId: string): void {
    if (!this.observation) return

    const exploration = state.exploration

    // Check if the player's area changed (Mine action included FarTravel)
    // This happens when the policy says "Mine at node X" but player isn't at the right area yet
    const currentStateAreaId = exploration.playerState.currentAreaId
    if (this.observation.currentAreaId !== currentStateAreaId) {
      // Player moved - update location fields
      const newAreaData = exploration.areas.get(currentStateAreaId)
      const newDistance = newAreaData?.distance ?? 0
      this.observation.currentAreaId = currentStateAreaId
      this.observation.isInTown = currentStateAreaId === "TOWN"
      this.observation.returnTimeToTown = this.observation.isInTown
        ? 0
        : estimateTravelTicks(currentStateAreaId, newDistance, "TOWN", 0)

      // Update travel times for all known areas
      for (const area of this.observation.knownAreas) {
        const areaData = exploration.areas.get(area.areaId)
        if (areaData) {
          area.travelTicksFromCurrent = estimateTravelTicks(
            currentStateAreaId,
            newDistance,
            area.areaId,
            areaData.distance
          )
        }
      }

      // Update frontier travel times
      for (const frontier of this.observation.frontierAreas) {
        frontier.travelTicksFromCurrent = estimateTravelTicks(
          currentStateAreaId,
          newDistance,
          frontier.areaId,
          frontier.distance
        )
      }

      // Re-sort frontier areas by new travel time
      this.observation.frontierAreas.sort(
        (a, b) => a.travelTicksFromCurrent - b.travelTicksFromCurrent
      )

      // Filter out areas that are no longer useful
      this.filterUselessAreas(state)

      // Update currentArea
      this.observation.currentArea =
        currentStateAreaId === "TOWN"
          ? null
          : (this.observation.knownAreas.find((a) => a.areaId === currentStateAreaId) ?? null)
    }

    const miningSkill = state.player.skills.Mining

    // Update XP fields
    this.observation.miningLevel = miningSkill.level
    this.observation.miningXpInLevel = miningSkill.xp
    this.observation.miningTotalXp = getTotalXP(miningSkill)

    // Update inventory
    this.observation.inventorySlotsUsed = state.player.inventory.length
    this.observation.inventoryByItem = {}
    for (const stack of state.player.inventory) {
      this.observation.inventoryByItem[stack.itemId] =
        (this.observation.inventoryByItem[stack.itemId] ?? 0) + stack.quantity
    }

    // Update canDeposit
    const hasItems = state.player.inventory.length > 0
    const atWarehouse = exploration.playerState.currentLocationId === "TOWN_WAREHOUSE"
    this.observation.canDeposit = this.observation.isInTown && atWarehouse && hasItems

    // Update the mined node's remaining charges using O(1) cache lookup
    const node = this.nodeById?.get(nodeId)
    let nodeWasMineable = false
    let nodeBecameUnmineable = false

    if (node) {
      nodeWasMineable = node.isMineable && !!node.remainingCharges

      // O(1) lookup for world node
      const actualNode = this.getWorldNodeById(state, nodeId)
      if (actualNode) {
        const remainingCharges = actualNode.materials.reduce((sum, m) => sum + m.remainingUnits, 0)
        node.remainingCharges = remainingCharges > 0 ? remainingCharges : null
        node.isMineable = actualNode.materials.some(
          (m) =>
            m.requiresSkill === "Mining" &&
            this.observation!.miningLevel >= m.requiredLevel &&
            m.remainingUnits > 0
        )

        nodeBecameUnmineable = nodeWasMineable && (!node.isMineable || !node.remainingCharges)
      }
    }

    // Update currentArea reference (the area object itself was already updated in place)
    // Note: currentArea is a reference to an item in knownAreas, so no update needed

    // Only rebuild knownMineableMaterials if a node became depleted/unmineable
    // This avoids O(areas × nodes) work on every Mine action
    if (nodeBecameUnmineable) {
      const mineableMaterials = new Set<string>()
      for (const area of this.observation.knownAreas) {
        for (const n of area.discoveredNodes) {
          if (n.isMineable && n.remainingCharges) {
            mineableMaterials.add(n.primaryMaterial)
            for (const matId of n.secondaryMaterials) {
              mineableMaterials.add(matId)
            }
          }
        }
      }
      this.observation.knownMineableMaterials = [...mineableMaterials]

      // Filter out areas that lost their last mineable node
      this.filterUselessAreas(state)

      // Update currentArea in case it was filtered out or changed
      this.observation.currentArea =
        this.observation.currentAreaId === "TOWN"
          ? null
          : (this.observation.knownAreas.find(
              (a) => a.areaId === this.observation!.currentAreaId
            ) ?? null)
    }
  }

  /**
   * Apply DepositInventory action result: update inventory fields.
   */
  private applyDepositResult(state: WorldState): void {
    if (!this.observation) return

    // Update inventory
    this.observation.inventorySlotsUsed = state.player.inventory.length
    this.observation.inventoryByItem = {}
    for (const stack of state.player.inventory) {
      this.observation.inventoryByItem[stack.itemId] =
        (this.observation.inventoryByItem[stack.itemId] ?? 0) + stack.quantity
    }

    // Update canDeposit
    const exploration = state.exploration
    const hasItems = state.player.inventory.length > 0
    const atWarehouse = exploration.playerState.currentLocationId === "TOWN_WAREHOUSE"
    this.observation.canDeposit = this.observation.isInTown && atWarehouse && hasItems
  }

  /**
   * Apply Travel action result: update location fields and travel times.
   */
  private applyTravelResult(state: WorldState, result: ActionResult): void {
    if (!this.observation) return

    const exploration = state.exploration
    const newAreaId = exploration.playerState.currentAreaId
    const newAreaData = exploration.areas.get(newAreaId)
    const newDistance = newAreaData?.distance ?? 0

    // Update location fields
    this.observation.currentAreaId = newAreaId
    this.observation.isInTown = newAreaId === "TOWN"
    this.observation.returnTimeToTown = this.observation.isInTown
      ? 0
      : estimateTravelTicks(newAreaId, newDistance, "TOWN", 0)

    // Update canDeposit
    const hasItems = state.player.inventory.length > 0
    const atWarehouse = exploration.playerState.currentLocationId === "TOWN_WAREHOUSE"
    this.observation.canDeposit = this.observation.isInTown && atWarehouse && hasItems

    // Check if we traveled to a frontier (new area discovered)
    if (result.areasDiscovered && result.areasDiscovered > 0) {
      // Update cached Sets for new discoveries
      if (this.cachedKnownLocationIds) {
        for (const locId of exploration.playerState.knownLocationIds) {
          this.cachedKnownLocationIds.add(locId)
        }
      }
      if (this.cachedKnownAreaIds) {
        for (const areaId of exploration.playerState.knownAreaIds) {
          this.cachedKnownAreaIds.add(areaId)
        }
      }
      if (this.cachedKnownConnectionIds) {
        for (const connId of exploration.playerState.knownConnectionIds) {
          this.cachedKnownConnectionIds.add(connId)
        }
      }

      // Use full rebuild for frontier discovery to avoid edge case bugs
      this.observation = buildObservationFresh(state, {
        knownLocationIds: this.cachedKnownLocationIds!,
        knownAreaIds: this.cachedKnownAreaIds!,
        knownConnectionIds: this.cachedKnownConnectionIds!,
      })
      this.rebuildNodeCache()
      return
    }

    // Update travel times for all known areas
    for (const area of this.observation.knownAreas) {
      const areaData = exploration.areas.get(area.areaId)
      if (areaData) {
        area.travelTicksFromCurrent = estimateTravelTicks(
          newAreaId,
          newDistance,
          area.areaId,
          areaData.distance
        )
      }
    }

    // Update frontier travel times
    for (const frontier of this.observation.frontierAreas) {
      frontier.travelTicksFromCurrent = estimateTravelTicks(
        newAreaId,
        newDistance,
        frontier.areaId,
        frontier.distance
      )
    }

    // Re-sort frontier areas by new travel time
    this.observation.frontierAreas.sort(
      (a, b) => a.travelTicksFromCurrent - b.travelTicksFromCurrent
    )

    // Filter out areas that are no longer useful (leaving an area may make it filterable)
    this.filterUselessAreas(state)

    // Update currentArea
    this.observation.currentArea =
      newAreaId === "TOWN"
        ? null
        : (this.observation.knownAreas.find((a) => a.areaId === newAreaId) ?? null)
  }

  /**
   * Apply ReturnToTown action result: update location fields.
   */
  private applyReturnToTownResult(state: WorldState): void {
    if (!this.observation) return

    const exploration = state.exploration

    // Update location fields
    this.observation.currentAreaId = "TOWN"
    this.observation.isInTown = true
    this.observation.returnTimeToTown = 0
    this.observation.currentArea = null

    // Update canDeposit
    const hasItems = state.player.inventory.length > 0
    const atWarehouse = exploration.playerState.currentLocationId === "TOWN_WAREHOUSE"
    this.observation.canDeposit = this.observation.isInTown && atWarehouse && hasItems

    // Update travel times for all known areas (from TOWN)
    for (const area of this.observation.knownAreas) {
      const areaData = exploration.areas.get(area.areaId)
      if (areaData) {
        area.travelTicksFromCurrent = estimateTravelTicks("TOWN", 0, area.areaId, areaData.distance)
      }
    }

    // Update frontier travel times (from TOWN)
    for (const frontier of this.observation.frontierAreas) {
      frontier.travelTicksFromCurrent = estimateTravelTicks(
        "TOWN",
        0,
        frontier.areaId,
        frontier.distance
      )
    }

    // Re-sort frontier areas by new travel time
    this.observation.frontierAreas.sort(
      (a, b) => a.travelTicksFromCurrent - b.travelTicksFromCurrent
    )

    // Filter out areas that are no longer useful (leaving an area may make it filterable)
    this.filterUselessAreas(state)
  }

  /**
   * Apply Explore action result: handle new discoveries.
   * This is the most complex case - new locations/areas/connections may be discovered.
   *
   * Phase 4 optimization: Update cached Sets incrementally instead of rebuilding.
   */
  private applyExploreResult(state: WorldState, result: ActionResult): void {
    if (!this.observation) return

    const exploration = state.exploration

    // Check if the player's area changed (Explore action was converted to FarTravel)
    // This happens when the policy says "Explore in area X" but player isn't at X yet
    const currentStateAreaId = exploration.playerState.currentAreaId
    if (this.observation.currentAreaId !== currentStateAreaId) {
      // Player moved - delegate to travel handling
      this.applyTravelResult(state, result)
      return
    }

    // Check for new discoveries by comparing array lengths (O(1))
    const locationIdsChanged =
      !this.cachedKnownLocationIds ||
      exploration.playerState.knownLocationIds.length !== this.cachedKnownLocationIds.size

    const areaIdsChanged =
      !this.cachedKnownAreaIds ||
      exploration.playerState.knownAreaIds.length !== this.cachedKnownAreaIds.size

    const connectionIdsChanged =
      !this.cachedKnownConnectionIds ||
      exploration.playerState.knownConnectionIds.length !== this.cachedKnownConnectionIds.size

    if (!locationIdsChanged && !areaIdsChanged && !connectionIdsChanged) {
      // No new discoveries - nothing to update
      return
    }

    // Find what's new before updating cached Sets
    const newLocationIds: string[] = []
    if (locationIdsChanged && this.cachedKnownLocationIds) {
      for (const locId of exploration.playerState.knownLocationIds) {
        if (!this.cachedKnownLocationIds.has(locId)) {
          newLocationIds.push(locId)
        }
      }
    }

    const newConnectionIds: string[] = []
    if (connectionIdsChanged && this.cachedKnownConnectionIds) {
      for (const connId of exploration.playerState.knownConnectionIds) {
        if (!this.cachedKnownConnectionIds.has(connId)) {
          newConnectionIds.push(connId)
        }
      }
    }

    // Update cached Sets incrementally
    if (locationIdsChanged && this.cachedKnownLocationIds) {
      for (const locId of exploration.playerState.knownLocationIds) {
        this.cachedKnownLocationIds.add(locId)
      }
    }

    if (areaIdsChanged && this.cachedKnownAreaIds) {
      for (const areaId of exploration.playerState.knownAreaIds) {
        this.cachedKnownAreaIds.add(areaId)
      }
    }

    if (connectionIdsChanged && this.cachedKnownConnectionIds) {
      for (const connId of exploration.playerState.knownConnectionIds) {
        this.cachedKnownConnectionIds.add(connId)
      }
    }

    // Use full rebuild for any discoveries to avoid edge case bugs
    // This is still faster than rebuilding on every action
    this.observation = buildObservationFresh(state, {
      knownLocationIds: this.cachedKnownLocationIds!,
      knownAreaIds: this.cachedKnownAreaIds!,
      knownConnectionIds: this.cachedKnownConnectionIds!,
    })
    this.rebuildNodeCache()
  }

  /**
   * Validate the cached observation against a fresh rebuild.
   * Throws an error if drift is detected.
   *
   * @param state The current world state
   * @param tick The current tick number (for error reporting)
   * @throws Error if observation drift is detected
   */
  validate(state: WorldState, tick: number): void {
    if (!this.validationEnabled || !this.observation) {
      return
    }

    // Only validate at the configured interval
    if (tick % this.validationInterval !== 0) {
      return
    }

    const rebuilt = buildObservationFresh(state)
    const diffs = diffObservations(rebuilt, this.observation)

    if (diffs.length > 0) {
      throw new Error(
        `Observation drift detected at tick ${tick}: ${JSON.stringify(diffs, null, 2)}`
      )
    }
  }

  /**
   * Enable or disable validation. Useful for performance testing.
   */
  setValidationEnabled(enabled: boolean): void {
    this.validationEnabled = enabled
  }

  /**
   * Check if validation should run this tick.
   */
  shouldValidate(tick: number): boolean {
    return this.validationEnabled && tick % this.validationInterval === 0
  }

  /**
   * Reset the manager state. Called at the start of each simulation run.
   */
  reset(): void {
    this.observation = null
    this.cachedKnownLocationIds = null
    this.cachedKnownAreaIds = null
    this.cachedKnownConnectionIds = null
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
  return buildObservationFresh(state)
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

/**
 * A single difference between two observations.
 */
export interface ObservationDiff {
  field: string
  expected: unknown
  actual: unknown
}

/**
 * Compare two PolicyObservation objects and return a list of differences.
 * Used for validation to detect observation drift.
 */
export function diffObservations(
  expected: PolicyObservation,
  actual: PolicyObservation
): ObservationDiff[] {
  const diffs: ObservationDiff[] = []

  // Simple scalar fields
  const scalarFields: (keyof PolicyObservation)[] = [
    "miningLevel",
    "miningXpInLevel",
    "miningTotalXp",
    "inventoryCapacity",
    "inventorySlotsUsed",
    "currentAreaId",
    "isInTown",
    "canDeposit",
    "returnTimeToTown",
  ]

  for (const field of scalarFields) {
    if (expected[field] !== actual[field]) {
      diffs.push({
        field,
        expected: expected[field],
        actual: actual[field],
      })
    }
  }

  // inventoryByItem - compare as objects
  if (JSON.stringify(expected.inventoryByItem) !== JSON.stringify(actual.inventoryByItem)) {
    diffs.push({
      field: "inventoryByItem",
      expected: expected.inventoryByItem,
      actual: actual.inventoryByItem,
    })
  }

  // knownAreas - compare length and contents
  if (expected.knownAreas.length !== actual.knownAreas.length) {
    diffs.push({
      field: "knownAreas.length",
      expected: expected.knownAreas.length,
      actual: actual.knownAreas.length,
    })
  } else {
    // Sort both by areaId for stable comparison
    const sortedExpected = [...expected.knownAreas].sort((a, b) => a.areaId.localeCompare(b.areaId))
    const sortedActual = [...actual.knownAreas].sort((a, b) => a.areaId.localeCompare(b.areaId))
    for (let i = 0; i < sortedExpected.length; i++) {
      if (JSON.stringify(sortedExpected[i]) !== JSON.stringify(sortedActual[i])) {
        diffs.push({
          field: `knownAreas[${sortedExpected[i].areaId}]`,
          expected: sortedExpected[i],
          actual: sortedActual[i],
        })
      }
    }
  }

  // knownMineableMaterials - compare as sorted arrays
  const sortedExpectedMaterials = [...expected.knownMineableMaterials].sort()
  const sortedActualMaterials = [...actual.knownMineableMaterials].sort()
  if (JSON.stringify(sortedExpectedMaterials) !== JSON.stringify(sortedActualMaterials)) {
    diffs.push({
      field: "knownMineableMaterials",
      expected: sortedExpectedMaterials,
      actual: sortedActualMaterials,
    })
  }

  // frontierAreas - compare length and contents
  if (expected.frontierAreas.length !== actual.frontierAreas.length) {
    diffs.push({
      field: "frontierAreas.length",
      expected: expected.frontierAreas.length,
      actual: actual.frontierAreas.length,
    })
  } else {
    const sortedExpectedFrontier = [...expected.frontierAreas].sort((a, b) =>
      a.areaId.localeCompare(b.areaId)
    )
    const sortedActualFrontier = [...actual.frontierAreas].sort((a, b) =>
      a.areaId.localeCompare(b.areaId)
    )
    for (let i = 0; i < sortedExpectedFrontier.length; i++) {
      if (JSON.stringify(sortedExpectedFrontier[i]) !== JSON.stringify(sortedActualFrontier[i])) {
        diffs.push({
          field: `frontierAreas[${sortedExpectedFrontier[i].areaId}]`,
          expected: sortedExpectedFrontier[i],
          actual: sortedActualFrontier[i],
        })
      }
    }
  }

  // currentArea - compare as objects (can be null)
  if (JSON.stringify(expected.currentArea) !== JSON.stringify(actual.currentArea)) {
    diffs.push({
      field: "currentArea",
      expected: expected.currentArea,
      actual: actual.currentArea,
    })
  }

  return diffs
}
