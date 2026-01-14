/**
 * Action Converter
 *
 * Converts simplified PolicyAction types into full engine Action types.
 * This bridges the gap between the policy's simplified view and the
 * engine's detailed action system.
 */

import type {
  WorldState,
  Action,
  StoreAction,
  FarTravelAction,
  ExplorationTravelAction,
  MineAction,
  ExploreAction,
  TravelToLocationAction,
  Node,
  MaterialID,
} from "../types.js"
import { GatherMode } from "../types.js"
import type { PolicyAction } from "./types.js"

/**
 * Find a node by ID in the world state.
 */
function findNode(state: WorldState, nodeId: string): Node | undefined {
  return state.world.nodes?.find((n) => n.nodeId === nodeId)
}

/**
 * Select the best material to focus on when mining a node.
 * Picks the highest-tier material the player can mine.
 */
function selectBestFocusMaterial(node: Node, miningLevel: number): MaterialID | undefined {
  const mineableMaterials = node.materials
    .filter(
      (m) => m.requiresSkill === "Mining" && miningLevel >= m.requiredLevel && m.remainingUnits > 0
    )
    .sort((a, b) => b.tier - a.tier)

  return mineableMaterials[0]?.materialId
}

/**
 * Get the location ID for a node based on its nodeId.
 * Node ID format: "{areaId}-node-{index}" -> Location ID: "{areaId}-loc-{index}"
 */
function getNodeLocationId(nodeId: string): string | null {
  const match = nodeId.match(/^(.+)-node-(\d+)$/)
  if (!match) return null
  const [, areaId, index] = match
  return `${areaId}-loc-${index}`
}

/**
 * Convert a Mine policy action to engine actions.
 * May return multiple actions if navigation is needed:
 * 1. FarTravel to area (if not in correct area)
 * 2. TravelToLocation (if not at correct location within area)
 * 3. Mine action
 */
function convertMineAction(
  action: Extract<PolicyAction, { type: "Mine" }>,
  state: WorldState
): Action[] {
  const node = findNode(state, action.nodeId)
  if (!node) {
    throw new Error(`Node not found: ${action.nodeId}`)
  }

  const actions: Action[] = []
  const currentAreaId = state.exploration.playerState.currentAreaId
  const currentLocationId = state.exploration.playerState.currentLocationId
  const targetLocationId = getNodeLocationId(action.nodeId)

  // Step 1: Navigate to the correct area if needed
  if (currentAreaId !== node.areaId) {
    actions.push({
      type: "FarTravel",
      destinationAreaId: node.areaId,
    } as FarTravelAction)
  }

  // Step 2: Navigate to the correct location within the area if needed
  if (targetLocationId && currentLocationId !== targetLocationId) {
    actions.push({
      type: "TravelToLocation",
      locationId: targetLocationId,
    } as TravelToLocationAction)
  }

  // Step 3: Create the mine action
  const mode = action.mode ?? GatherMode.FOCUS
  const miningLevel = state.player.skills.Mining.level

  // For FOCUS mode, select the best material to focus on
  const focusMaterialId =
    mode === GatherMode.FOCUS ? selectBestFocusMaterial(node, miningLevel) : undefined

  if (mode === GatherMode.FOCUS && !focusMaterialId) {
    throw new Error(`No mineable material found in node: ${action.nodeId}`)
  }

  actions.push({
    type: "Mine",
    mode,
    focusMaterialId,
  } as MineAction)

  return actions
}

/**
 * Convert an Explore policy action to an engine Explore action.
 * If not at the target area, returns a FarTravel action instead.
 */
function convertExploreAction(
  action: Extract<PolicyAction, { type: "Explore" }>,
  state: WorldState
): ExploreAction | FarTravelAction {
  const currentAreaId = state.exploration.playerState.currentAreaId

  // If not at target area, travel there first
  if (currentAreaId !== action.areaId) {
    return {
      type: "FarTravel",
      destinationAreaId: action.areaId,
    }
  }

  return {
    type: "Explore",
  }
}

/**
 * Convert a Travel policy action to an engine travel action.
 * Uses FarTravel for known areas, ExplorationTravel for unknown (frontier) areas.
 */
function convertTravelAction(
  action: Extract<PolicyAction, { type: "Travel" }>,
  state: WorldState
): FarTravelAction | ExplorationTravelAction {
  const isKnownArea = state.exploration.playerState.knownAreaIds.includes(action.toAreaId)

  if (isKnownArea) {
    return {
      type: "FarTravel",
      destinationAreaId: action.toAreaId,
    }
  } else {
    // Unknown area - use ExplorationTravel for single-hop to frontier
    return {
      type: "ExplorationTravel",
      destinationAreaId: action.toAreaId,
    }
  }
}

/**
 * Convert a ReturnToTown policy action to an engine FarTravel action.
 */
function convertReturnToTownAction(_state: WorldState): FarTravelAction {
  return {
    type: "FarTravel",
    destinationAreaId: "TOWN",
  }
}

/**
 * Convert a DepositInventory policy action to engine Store actions.
 * Returns an array of Store actions, one for each item type in inventory.
 */
function convertDepositInventoryAction(state: WorldState): StoreAction[] {
  const actions: StoreAction[] = []

  // Group inventory items by type
  const itemCounts = new Map<string, number>()
  for (const item of state.player.inventory) {
    itemCounts.set(item.itemId, (itemCounts.get(item.itemId) ?? 0) + item.quantity)
  }

  // Create a Store action for each item type
  for (const [itemId, quantity] of itemCounts) {
    actions.push({
      type: "Store",
      itemId,
      quantity,
    })
  }

  return actions
}

/**
 * Result of converting a policy action.
 * May result in multiple engine actions (e.g., DepositInventory -> multiple Store).
 */
export interface ConvertedActions {
  actions: Action[]
  isWait: boolean
}

/**
 * Convert a PolicyAction to engine Action(s).
 *
 * @param action The policy action to convert
 * @param state The current world state (for context)
 * @returns Converted engine actions
 * @throws Error if conversion fails (e.g., invalid node ID)
 */
export function toEngineActions(action: PolicyAction, state: WorldState): ConvertedActions {
  switch (action.type) {
    case "Mine":
      return {
        actions: convertMineAction(action, state),
        isWait: false,
      }

    case "Explore":
      return {
        actions: [convertExploreAction(action, state)],
        isWait: false,
      }

    case "Travel":
      return {
        actions: [convertTravelAction(action, state)],
        isWait: false,
      }

    case "ReturnToTown":
      return {
        actions: [convertReturnToTownAction(state)],
        isWait: false,
      }

    case "DepositInventory": {
      const storeActions = convertDepositInventoryAction(state)
      if (storeActions.length === 0) {
        // No items to deposit - treat as wait
        return { actions: [], isWait: true }
      }
      return {
        actions: storeActions,
        isWait: false,
      }
    }

    case "Wait":
      return {
        actions: [],
        isWait: true,
      }

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = action
      throw new Error(`Unknown policy action type: ${(_exhaustive as PolicyAction).type}`)
    }
  }
}

/**
 * Convenience function to get a single action.
 * Throws if multiple actions are returned.
 */
export function toEngineAction(action: PolicyAction, state: WorldState): Action | null {
  const result = toEngineActions(action, state)
  if (result.isWait) return null
  if (result.actions.length === 0) return null
  if (result.actions.length > 1) {
    throw new Error(`Expected single action but got ${result.actions.length} for ${action.type}`)
  }
  return result.actions[0]
}
