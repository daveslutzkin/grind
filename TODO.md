# Policy Runner Performance Optimizations

The policy runner exhibits non-linear performance scaling:
- Level 5: 21k ticks in 1.1s (~19k ticks/sec)
- Level 6: 38k ticks in 4.8s (~8k ticks/sec)
- Level 7: 64k ticks in 19.3s (~3.3k ticks/sec)

Per-tick cost increases ~6× from Level 5 to Level 7 because operations scale with discovered state size. These optimizations aim to make per-tick cost O(1) or O(changed_items) instead of O(total_state).

---

## 1. ~~Add Node Index Map~~ ✅ DONE

**Goal:** Eliminate O(areas × nodes) linear search when updating a mined node.

**Current Problem:**
In `observation.ts:470-491`, `applyMineResult` searches through all areas and all nodes to find a single node by ID:

```typescript
for (const area of this.observation.knownAreas) {
  for (const node of area.discoveredNodes) {
    if (node.nodeId === nodeId) {
      // Found it - update it
    }
  }
}
```

With 100 areas × 5 nodes each = 500 iterations per Mine action.

**Solution:**
Add a `Map<string, { area: KnownArea, node: KnownNode }>` to `ObservationManager` that indexes nodes by ID.

**Implementation Steps:**

1. Add private field to `ObservationManager`:
   ```typescript
   private nodeIndex: Map<string, { area: KnownArea; node: KnownNode }> | null = null
   ```

2. Build the index in `getObservation()` after `buildObservationFresh()`:
   ```typescript
   this.nodeIndex = new Map()
   for (const area of this.observation.knownAreas) {
     for (const node of area.discoveredNodes) {
       this.nodeIndex.set(node.nodeId, { area, node })
     }
   }
   ```

3. Update `applyMineResult()` to use the index:
   ```typescript
   const entry = this.nodeIndex?.get(nodeId)
   if (entry) {
     const { node } = entry
     // Update node directly - O(1)
   }
   ```

4. Update the index when nodes are added (in `applyExploreResult`) or when the observation is rebuilt.

5. Clear the index in `reset()`:
   ```typescript
   this.nodeIndex = null
   ```

**Test Plan:**
- Existing `observation.test.ts` tests should still pass
- Add a test that mines a node and verifies the observation updates correctly
- Benchmark: Run `--policy safe --target-level 7 --max-ticks 100000` before and after

**Files to Modify:**
- `src/policy-runner/observation.ts`

---

## 2. ~~Incremental `knownMineableMaterials` Updates~~ ✅ DONE

**Goal:** Eliminate O(areas × nodes) rebuild of materials set after every Mine action.

**Current Problem:**
In `observation.ts:505-516`, after every Mine, the entire `knownMineableMaterials` set is rebuilt from scratch:

```typescript
const mineableMaterials = new Set<string>()
for (const area of this.observation.knownAreas) {
  for (const node of area.discoveredNodes) {
    if (node.isMineable && node.remainingCharges) {
      mineableMaterials.add(node.primaryMaterial)
      for (const matId of node.secondaryMaterials) {
        mineableMaterials.add(matId)
      }
    }
  }
}
```

**Solution:**
Maintain a reference count per material. Only remove a material when its count reaches zero.

**Implementation Steps:**

1. Add private field to `ObservationManager`:
   ```typescript
   private materialRefCounts: Map<string, number> | null = null
   ```

2. Build the reference counts when building the initial observation:
   ```typescript
   this.materialRefCounts = new Map()
   for (const area of this.observation.knownAreas) {
     for (const node of area.discoveredNodes) {
       if (node.isMineable && node.remainingCharges) {
         this.incrementMaterialRef(node.primaryMaterial)
         for (const matId of node.secondaryMaterials) {
           this.incrementMaterialRef(matId)
         }
       }
     }
   }
   ```

3. Add helper methods:
   ```typescript
   private incrementMaterialRef(materialId: string): void {
     const count = this.materialRefCounts!.get(materialId) ?? 0
     this.materialRefCounts!.set(materialId, count + 1)
   }

   private decrementMaterialRef(materialId: string): void {
     const count = this.materialRefCounts!.get(materialId) ?? 0
     if (count <= 1) {
       this.materialRefCounts!.delete(materialId)
     } else {
       this.materialRefCounts!.set(materialId, count - 1)
     }
   }
   ```

4. In `applyMineResult()`, when a node becomes non-mineable (depleted):
   ```typescript
   // Before updating the node, check if it was previously mineable
   const wasMineable = node.isMineable && node.remainingCharges

   // Update the node...

   // After updating, check if it's no longer mineable
   const isNowMineable = node.isMineable && node.remainingCharges

   if (wasMineable && !isNowMineable) {
     // Node depleted - decrement ref counts
     this.decrementMaterialRef(node.primaryMaterial)
     for (const matId of node.secondaryMaterials) {
       this.decrementMaterialRef(matId)
     }
   }

   // Rebuild the array from the map keys (O(materials) not O(areas × nodes))
   this.observation.knownMineableMaterials = [...this.materialRefCounts!.keys()]
   ```

5. When new nodes are discovered (in `applyExploreResult`), increment their material refs.

6. Clear in `reset()`:
   ```typescript
   this.materialRefCounts = null
   ```

**Test Plan:**
- Add test: mine a node to depletion, verify material is removed from `knownMineableMaterials` only if no other node provides it
- Add test: mine a node partially, verify material remains in `knownMineableMaterials`
- Existing tests should still pass

**Files to Modify:**
- `src/policy-runner/observation.ts`

---

## 3. ~~Cache `findNearestMineableArea` Result~~ ✅ DONE

**Goal:** Avoid recomputing the same search result multiple times per tick.

**Current Problem:**
The safe policy calls `findNearestMineableArea(obs)` up to 2 times per decision (`safe.ts:87` and `safe.ts:106`). Each call filters and sorts all areas:

```typescript
export function findNearestMineableArea(obs: PolicyObservation): KnownArea | null {
  const areasWithMineableNodes = obs.knownAreas.filter((area) =>
    area.discoveredNodes.some((node) => node.isMineable && node.remainingCharges)
  )
  areasWithMineableNodes.sort((a, b) => a.travelTicksFromCurrent - b.travelTicksFromCurrent)
  return areasWithMineableNodes[0]
}
```

**Solution:**
Cache the result in `ObservationManager` and invalidate when relevant state changes.

**Implementation Steps:**

1. Add cache field to `ObservationManager`:
   ```typescript
   private cachedNearestMineableArea: KnownArea | null | undefined = undefined
   // undefined = not computed, null = computed but no result
   ```

2. Add a method to get the cached result:
   ```typescript
   getNearestMineableArea(): KnownArea | null {
     if (this.cachedNearestMineableArea === undefined) {
       this.cachedNearestMineableArea = findNearestMineableArea(this.observation!)
     }
     return this.cachedNearestMineableArea
   }
   ```

3. Invalidate the cache when:
   - A node's charges change (in `applyMineResult`)
   - Player location changes (in `applyTravelResult`, `applyReturnToTownResult`) - travel times change
   - New areas discovered (in `applyExploreResult`)

   ```typescript
   private invalidateMineableAreaCache(): void {
     this.cachedNearestMineableArea = undefined
   }
   ```

4. Update the safe policy to use the cached version:
   - Option A: Pass the `ObservationManager` to the policy (breaking change)
   - Option B: Add the cached result to `PolicyObservation` as an optional field
   - Option C: Have the policy cache its own result within a single `decide()` call

   **Recommended: Option C** - simplest, no API changes:
   ```typescript
   decide(obs: PolicyObservation): PolicyAction {
     // Cache within this decision
     let nearestMineable: KnownArea | null | undefined = undefined
     const getNearestMineable = () => {
       if (nearestMineable === undefined) {
         nearestMineable = findNearestMineableArea(obs)
       }
       return nearestMineable
     }

     // Use getNearestMineable() instead of findNearestMineableArea(obs)
   }
   ```

**Test Plan:**
- Verify safe policy behavior unchanged
- Benchmark multiple runs to confirm improvement

**Files to Modify:**
- `src/policy-runner/policies/safe.ts`

---

## 4. Skip Travel Time Updates for Irrelevant Areas

**Goal:** Reduce O(all_areas) to O(relevant_areas) when updating travel times.

**Current Problem:**
In `applyTravelResult()` (`observation.ts:591-617`) and `applyReturnToTownResult()` (`observation.ts:645-666`), travel times are updated for ALL known areas:

```typescript
for (const area of this.observation.knownAreas) {
  area.travelTicksFromCurrent = estimateTravelTicks(...)
}
for (const frontier of this.observation.frontierAreas) {
  frontier.travelTicksFromCurrent = estimateTravelTicks(...)
}
this.observation.frontierAreas.sort(...)
```

But the safe policy only cares about:
- Areas with mineable nodes (for mining decisions)
- Areas not fully explored (for exploration decisions)
- The current area
- Frontier areas (for frontier travel)

**Solution:**
Mark areas as "relevant" and only update travel times for those. Alternatively, compute travel times lazily when accessed.

**Implementation Steps (Lazy Approach - Recommended):**

1. Change `travelTicksFromCurrent` to be computed lazily. Add a field to track current location:
   ```typescript
   // In ObservationManager
   private currentLocationForTravelCalc: { areaId: AreaID; distance: number } | null = null
   ```

2. Instead of storing `travelTicksFromCurrent` on each area, compute it on access:
   ```typescript
   // Add a method to ObservationManager
   getTravelTicksToArea(areaId: AreaID): number {
     if (!this.currentLocationForTravelCalc) return 0
     const areaData = this.exploration.areas.get(areaId)
     if (!areaData) return 0
     return estimateTravelTicks(
       this.currentLocationForTravelCalc.areaId,
       this.currentLocationForTravelCalc.distance,
       areaId,
       areaData.distance
     )
   }
   ```

3. Update `applyTravelResult` and `applyReturnToTownResult` to just update the current location:
   ```typescript
   this.currentLocationForTravelCalc = { areaId: newAreaId, distance: newDistance }
   // No need to iterate all areas!
   ```

4. The policy would call `getTravelTicksToArea(area.areaId)` when needed.

**Alternative Implementation (Eager but Filtered):**

1. Add a `isRelevant` flag to `KnownArea`:
   ```typescript
   interface KnownArea {
     // ... existing fields
     isRelevant: boolean  // has mineable nodes OR not fully explored OR is current
   }
   ```

2. Set `isRelevant` when building the observation.

3. Only update travel times for relevant areas:
   ```typescript
   for (const area of this.observation.knownAreas) {
     if (area.isRelevant) {
       area.travelTicksFromCurrent = estimateTravelTicks(...)
     }
   }
   ```

4. Update `isRelevant` when nodes deplete or areas become fully explored.

**Test Plan:**
- Verify travel times are correct after moving
- Verify policy still makes correct decisions
- Benchmark to confirm improvement

**Files to Modify:**
- `src/policy-runner/observation.ts`
- `src/policy-runner/types.ts` (if adding new fields)
- Possibly `src/policy-runner/policies/safe.ts` (if changing how travel times are accessed)

---

## Implementation Order

Recommended order based on impact and risk:

1. ~~**Task 3: Cache `findNearestMineableArea`** - Easiest, self-contained in safe.ts~~ ✅ DONE
2. ~~**Task 1: Node Index Map** - High impact, straightforward~~ ✅ DONE
3. ~~**Task 2: Incremental materials** - High impact, medium complexity~~ ✅ DONE
4. **Task 4: Lazy travel times** - Medium impact, requires more changes

## Benchmarking

After each change, run:
```bash
node dist/policy-runner/cli.js --batch --parallel --seed-count 20 --policy safe --target-level 7 --max-ticks 100000
```

Compare total time and ticks/second at each level.

## Success Criteria

- Level 7 should complete in under 5 seconds (down from 19.3s)
- Per-tick cost should remain roughly constant across levels
- All existing tests pass
- No observation drift (validation still works)
