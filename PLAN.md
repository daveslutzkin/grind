# Implementation Plan: Split checkBuyMapAction & executeBuyMap

## Overview

Extract internal helper functions from two large functions, keeping the public API unchanged. This reduces function sizes from 197 and 137 lines down to small dispatchers with focused helpers.

**Files to modify:**
- `src/actionChecks.ts` - Extract `checkNodeMapAction` and `checkAreaMapAction`
- `src/engine.ts` - Extract `executeNodeMapPurchase` and `executeAreaMapPurchase`

**No new tests needed** - existing tests in `contracts.test.ts` cover both map types and will verify the refactor.

---

## Task 1: Extract Node/Area Map Check Helpers

**File:** `src/actionChecks.ts`

### Step 1.1: Add `checkNodeMapAction` helper

Add before `checkBuyMapAction` (around line 1200):

```typescript
/**
 * Check node map purchase preconditions (Mining Guild)
 */
function checkNodeMapAction(state: WorldState, action: BuyMapAction): ActionCheckResult {
  const currentLocationId = getCurrentLocationId(state)

  // Node maps are sold at Mining Guild
  const miningGuildLocation = getGuildLocationForSkill("Mining")
  if (currentLocationId !== miningGuildLocation) {
    return {
      valid: false,
      failureType: "WRONG_LOCATION",
      failureReason: "must_be_at_mining_guild",
      failureContext: {
        requiredLocationId: miningGuildLocation,
        currentLocationId,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Must be enrolled in Mining
  const miningLevel = state.player.skills.Mining?.level ?? 0
  if (miningLevel < 1) {
    return {
      valid: false,
      failureType: "NOT_ENROLLED",
      failureReason: "must_enrol_in_guild",
      failureContext: {
        skill: "Mining",
        requiredGuild: "Mining Guild",
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Material tier must be specified
  if (!action.materialTier) {
    return {
      valid: false,
      failureType: "INVALID_MAP_TYPE",
      failureReason: "missing_material_tier",
      failureContext: {
        mapType: action.mapType,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Material tier must exist
  const tier = MATERIAL_TIERS[action.materialTier]
  if (!tier) {
    return {
      valid: false,
      failureType: "INVALID_MAP_TYPE",
      failureReason: "unknown_material_tier",
      failureContext: {
        materialTier: action.materialTier,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Material tier must be unlocked (player level >= unlock level)
  if (miningLevel < tier.unlockLevel) {
    return {
      valid: false,
      failureType: "TIER_NOT_UNLOCKED",
      failureReason: "level_too_low",
      failureContext: {
        materialTier: action.materialTier,
        requiredLevel: tier.unlockLevel,
        currentLevel: miningLevel,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Get price and check gold
  const price = getNodeMapPrice(action.materialTier)
  if (price === null) {
    return {
      valid: false,
      failureType: "INVALID_MAP_TYPE",
      failureReason: "no_price_for_tier",
      failureContext: {
        materialTier: action.materialTier,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  if (state.player.gold < price) {
    return {
      valid: false,
      failureType: "INSUFFICIENT_GOLD",
      failureReason: "not_enough_gold",
      failureContext: {
        required: price,
        current: state.player.gold,
        materialTier: action.materialTier,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  return { valid: true, timeCost: 0, successProbability: 1 }
}
```

### Step 1.2: Add `checkAreaMapAction` helper

Add after `checkNodeMapAction`:

```typescript
/**
 * Check area map purchase preconditions (Exploration Guild)
 */
function checkAreaMapAction(state: WorldState, action: BuyMapAction): ActionCheckResult {
  const currentLocationId = getCurrentLocationId(state)

  // Area maps are sold at Exploration Guild
  const explorationGuildLocation = getGuildLocationForSkill("Exploration")
  if (currentLocationId !== explorationGuildLocation) {
    return {
      valid: false,
      failureType: "WRONG_LOCATION",
      failureReason: "must_be_at_exploration_guild",
      failureContext: {
        requiredLocationId: explorationGuildLocation,
        currentLocationId,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Must be enrolled in Exploration
  const explorationLevel = state.player.skills.Exploration?.level ?? 0
  if (explorationLevel < 1) {
    return {
      valid: false,
      failureType: "NOT_ENROLLED",
      failureReason: "must_enrol_in_guild",
      failureContext: {
        skill: "Exploration",
        requiredGuild: "Exploration Guild",
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Target distance must be specified
  if (!action.targetDistance || action.targetDistance < 1) {
    return {
      valid: false,
      failureType: "INVALID_MAP_TYPE",
      failureReason: "missing_or_invalid_target_distance",
      failureContext: {
        targetDistance: action.targetDistance,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  // Get price and check gold
  const price = getAreaMapPrice(action.targetDistance)
  if (state.player.gold < price) {
    return {
      valid: false,
      failureType: "INSUFFICIENT_GOLD",
      failureReason: "not_enough_gold",
      failureContext: {
        required: price,
        current: state.player.gold,
        targetDistance: action.targetDistance,
      },
      timeCost: 0,
      successProbability: 0,
    }
  }

  return { valid: true, timeCost: 0, successProbability: 1 }
}
```

### Step 1.3: Simplify `checkBuyMapAction` to dispatch

Replace the existing `checkBuyMapAction` body (lines 1205-1400) with:

```typescript
export function checkBuyMapAction(state: WorldState, action: BuyMapAction): ActionCheckResult {
  if (action.mapType === "node") {
    return checkNodeMapAction(state, action)
  }

  if (action.mapType === "area") {
    return checkAreaMapAction(state, action)
  }

  // Unknown map type
  return {
    valid: false,
    failureType: "INVALID_MAP_TYPE",
    failureReason: "unknown_map_type",
    failureContext: {
      mapType: action.mapType,
    },
    timeCost: 0,
    successProbability: 0,
  }
}
```

**After:** Run `npm run check`, commit with message "refactor: extract checkNodeMapAction and checkAreaMapAction helpers"

---

## Task 2: Extract Node/Area Map Execute Helpers

**File:** `src/engine.ts`

### Step 2.1: Add `executeNodeMapPurchase` helper

Add before `executeBuyMap` (around line 1550):

```typescript
/**
 * Execute node map purchase from Mining Guild
 */
async function executeNodeMapPurchase(
  state: WorldState,
  action: BuyMapAction,
  tickBefore: number
): Promise<ActionLog> {
  const price = getNodeMapPrice(action.materialTier!)!
  state.player.gold -= price

  // Find a node and generate the map
  const map = findNodeForMap(action.materialTier!, state)
  if (!map) {
    // This shouldn't happen if check passed, but be defensive
    return createFailureLog(state, action, "NO_MAPS_AVAILABLE", 0, "no_undiscovered_nodes", {
      materialTier: action.materialTier,
    })
  }

  await revealAreasAndConnections(state, map.areaIds, map.connectionIds)

  // Store pending node discovery for later (when player arrives at area)
  if (!state.player.pendingNodeDiscoveries) {
    state.player.pendingNodeDiscoveries = []
  }
  state.player.pendingNodeDiscoveries.push({
    areaId: map.targetAreaId,
    nodeLocationId: map.targetNodeId,
  })

  // Get the target area name for the summary
  const targetArea = state.exploration.areas.get(map.targetAreaId)
  const targetAreaName = getAreaDisplayName(map.targetAreaId, targetArea)

  return {
    tickBefore,
    actionType: "BuyMap",
    parameters: { mapType: action.mapType, materialTier: action.materialTier },
    success: true,
    timeConsumed: 0,
    levelUps: [],
    rngRolls: [],
    stateDeltaSummary: `Purchased ${action.materialTier} node map for ${price} gold, revealing path to ${targetAreaName}`,
  }
}
```

### Step 2.2: Add `executeAreaMapPurchase` helper

Add after `executeNodeMapPurchase`:

```typescript
/**
 * Execute area map purchase from Exploration Guild
 */
async function executeAreaMapPurchase(
  state: WorldState,
  action: BuyMapAction,
  tickBefore: number
): Promise<ActionLog> {
  const price = getAreaMapPrice(action.targetDistance!)
  state.player.gold -= price

  const targetDistance = action.targetDistance!
  const exploration = state.exploration

  // Find an undiscovered area at target distance
  let targetAreaId: string | null = null
  for (const [areaId, area] of exploration.areas) {
    if (
      area.distance === targetDistance &&
      !exploration.playerState.knownAreaIds.includes(areaId)
    ) {
      targetAreaId = areaId
      break
    }
  }

  // If no undiscovered area exists, use the corridor endpoint
  const corridorEndpoint = `area-d${targetDistance}-i0`
  if (!targetAreaId) {
    targetAreaId = corridorEndpoint
  }

  // Ensure corridor exists from TOWN to target distance
  ensureCorridorToDistance(state, targetDistance)

  // If target area differs from corridor endpoint, connect them
  if (targetAreaId !== corridorEndpoint) {
    const connectionExists = exploration.connections.some(
      (c) =>
        (c.fromAreaId === corridorEndpoint && c.toAreaId === targetAreaId) ||
        (c.fromAreaId === targetAreaId && c.toAreaId === corridorEndpoint)
    )
    if (!connectionExists) {
      exploration.connections.push({
        fromAreaId: corridorEndpoint,
        toAreaId: targetAreaId,
        travelTimeMultiplier: 1.0,
      })
    }
  }

  // Use BFS to find the full path including the connection to target
  const pathResult = findPathUsingAllConnections(state, "TOWN", targetAreaId)

  if (!pathResult) {
    // This shouldn't happen since we just ensured the corridor and connection
    return createFailureLog(state, action, "NO_MAPS_AVAILABLE", 0, "path_not_found", {
      targetDistance,
      targetAreaId,
    })
  }

  await revealAreasAndConnections(state, pathResult.areaIds, pathResult.connectionIds)

  // Get the target area name for the summary
  const targetAreaForSummary = exploration.areas.get(targetAreaId)
  const targetAreaName = getAreaDisplayName(targetAreaId, targetAreaForSummary)

  return {
    tickBefore,
    actionType: "BuyMap",
    parameters: { mapType: action.mapType, targetDistance: action.targetDistance },
    success: true,
    timeConsumed: 0,
    levelUps: [],
    rngRolls: [],
    stateDeltaSummary: `Purchased area map for ${price} gold, revealing path to ${targetAreaName}`,
  }
}
```

### Step 2.3: Simplify `executeBuyMap` to dispatch

Replace the body of `executeBuyMap` (lines 1558-1694) with:

```typescript
async function* executeBuyMap(state: WorldState, action: BuyMapAction): ActionGenerator {
  const tickBefore = state.time.currentTick

  // Use shared precondition check
  const check = checkBuyMapAction(state, action)
  if (!check.valid) {
    yield yieldFailureResult(state, action, check)
    return
  }

  let log: ActionLog
  if (action.mapType === "node") {
    log = await executeNodeMapPurchase(state, action, tickBefore)
  } else {
    log = await executeAreaMapPurchase(state, action, tickBefore)
  }

  yield { done: true, log }
}
```

**After:** Run `npm run check`, commit with message "refactor: extract executeNodeMapPurchase and executeAreaMapPurchase helpers"

---

## Summary

| Before | After |
|--------|-------|
| `checkBuyMapAction`: 197 lines | `checkBuyMapAction`: 15 lines (dispatcher) |
| | `checkNodeMapAction`: 95 lines |
| | `checkAreaMapAction`: 55 lines |
| `executeBuyMap`: 137 lines | `executeBuyMap`: 20 lines (dispatcher) |
| | `executeNodeMapPurchase`: 45 lines |
| | `executeAreaMapPurchase`: 65 lines |

---

## Commit Summary

The work should result in 2 commits:

1. `refactor: extract checkNodeMapAction and checkAreaMapAction helpers`
2. `refactor: extract executeNodeMapPurchase and executeAreaMapPurchase helpers`
