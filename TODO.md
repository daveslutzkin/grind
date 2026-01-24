# Incremental Observation Updates

The policy runner currently rebuilds the entire observation from scratch on every Explore action and every frontier travel. This makes the previous "optimizations" (node index, material ref counting, lazy travel times) ineffective since the observation is rebuilt ~1700 times reaching level 7.

**Goal:** Make `applyExploreResult` and `applyTravelResult` (frontier case) truly incremental, eliminating calls to `buildObservationFresh` except for initial build and validation.

---

## Task 1: Incremental `applyExploreResult` ✅ DONE

**Location:** `observation.ts:722-777`

**Status:** Implemented in commits 3111826 and 3063a41. The `applyExploreResult` method now updates the observation incrementally without calling `buildObservationFresh`.

**Bug Fix (3063a41):** The policy's "Explore" action can be converted to "FarTravel" when the player isn't at the target area. This changes `currentAreaId` but `applyExploreResult` wasn't handling it. Fixed by delegating to `applyTravelResult` when area changes are detected.

~~**Current behavior:** When any discovery is made (new location, area, or connection), the entire observation is rebuilt via `buildObservationFresh`.~~

**New behavior:** Update only the affected parts of the observation.

### What changes on Explore

1. **New nodes discovered** in the current area
2. **Current area's `isFullyExplored`** status may change
3. **New connections discovered** → may reveal new frontier areas
4. **`knownMineableMaterials`** may gain entries from new mineable nodes

### Implementation Steps

1. **Detect what was discovered** (already done via size comparisons at lines 729-743)

2. **Update cached Sets incrementally** (already done at lines 748-763)

3. **Add new nodes to current area** (NEW):
   ```typescript
   // Find newly discovered nodes in current area
   const currentAreaId = this.observation.currentAreaId
   const currentKnownArea = this.observation.knownAreas.find(a => a.areaId === currentAreaId)

   if (currentKnownArea && locationIdsChanged) {
     const areaData = state.exploration.areas.get(currentAreaId)
     if (areaData) {
       // Get the set of node IDs already in the observation
       const existingNodeIds = new Set(currentKnownArea.discoveredNodes.map(n => n.nodeId))

       // For each location in the area, check for new nodes
       for (const locId of areaData.locationIds) {
         if (!this.cachedKnownLocationIds?.has(locId)) continue // Not discovered yet
         const loc = state.exploration.locations.get(locId)
         if (!loc?.nodeId) continue
         if (existingNodeIds.has(loc.nodeId)) continue // Already known

         // Build and add the new node
         const node = state.world.nodes?.find(n => n.nodeId === loc.nodeId)
         if (node) {
           const knownNode = buildKnownNode(node, this.observation.miningLevel)
           currentKnownArea.discoveredNodes.push(knownNode)

           // Update node index
           this.nodeIndex?.set(node.nodeId, { area: currentKnownArea, node: knownNode })

           // Update material ref counts
           if (knownNode.isMineable && knownNode.remainingCharges) {
             this.incrementMaterialRef(knownNode.primaryMaterial)
             for (const matId of knownNode.secondaryMaterials) {
               this.incrementMaterialRef(matId)
             }
           }
         }
       }
     }
   }
   ```

4. **Update `isFullyExplored` for current area** (NEW):
   ```typescript
   if (currentKnownArea) {
     // Check if fully explored (use the helper that checks discoverables)
     const areaData = state.exploration.areas.get(currentAreaId)
     if (areaData) {
       const { discoverables } = buildDiscoverables(state, areaData, {
         knownLocationIds: this.cachedKnownLocationIds!,
         knownAreaIds: this.cachedKnownAreaIds!,
         knownConnectionIds: this.cachedKnownConnectionIds!,
       })
       currentKnownArea.isFullyExplored = discoverables.length === 0
       if (currentKnownArea.isFullyExplored) {
         fullyExploredCache.set(currentAreaId, true)
       }
     }
   }
   ```

5. **Add new frontier areas from new connections** (NEW):
   ```typescript
   if (connectionIdsChanged) {
     // Check newly discovered connections for frontier areas
     for (const connId of state.exploration.playerState.knownConnectionIds) {
       if (this.cachedKnownConnectionIds?.has(connId)) continue // Already known

       const conn = state.exploration.connections.get(connId)
       if (!conn) continue

       // Check both ends of the connection
       for (const targetId of [conn.fromAreaId, conn.toAreaId]) {
         if (this.cachedKnownAreaIds?.has(targetId)) continue // Already known
         if (this.observation.frontierAreas.some(f => f.areaId === targetId)) continue // Already frontier

         const targetArea = state.exploration.areas.get(targetId)
         if (targetArea) {
           this.observation.frontierAreas.push({
             areaId: targetId,
             distance: targetArea.distance,
             travelTicksFromCurrent: -1, // Lazy computation
             reachableFrom: conn.fromAreaId === targetId ? conn.toAreaId : conn.fromAreaId,
           })
         }
       }
     }

     // Re-sort frontiers (or keep sorted via insertion)
     this.observation.frontierAreas.sort((a, b) =>
       getTravelTicks(a, this.observation!) - getTravelTicks(b, this.observation!)
     )
   }
   ```

6. **Update `knownMineableMaterials` array from ref counts** (NEW):
   ```typescript
   if (this.materialRefCounts) {
     this.observation.knownMineableMaterials = [...this.materialRefCounts.keys()]
   }
   ```

7. **Remove the `buildObservationFresh` call and subsequent index rebuilds**

### Test Plan

- Existing ObservationManager tests should still pass
- Add test: explore discovers a node, verify it appears in observation without full rebuild
- Add test: explore discovers a connection to unknown area, verify new frontier appears
- Add test: explore completes an area, verify `isFullyExplored` becomes true
- Run validation mode to ensure no drift: `--validate-every 1`

---

## Task 2: Incremental `applyTravelResult` for Frontier Travel

**Location:** `observation.ts:619-666`

**Current behavior:** When traveling to a frontier (new area), the entire observation is rebuilt via `buildObservationFresh`.

**New behavior:** Build only the new area and update frontier lists.

### What changes on Frontier Travel

1. **New area becomes known** → remove from `frontierAreas`, add to `knownAreas`
2. **New nodes** in the new area need to be indexed and materials tracked
3. **New frontier areas** may be revealed from the new area's connections
4. **Current location changes** → travel times become stale (already handled)

### Implementation Steps

1. **Detect frontier travel** (already done at line 619-626):
   ```typescript
   const newAreaId = state.exploration.playerState.currentAreaId
   const isFrontierTravel = result.areasDiscovered && result.areasDiscovered > 0
   ```

2. **Remove from `frontierAreas`** (NEW):
   ```typescript
   if (isFrontierTravel) {
     this.observation.frontierAreas = this.observation.frontierAreas.filter(
       f => f.areaId !== newAreaId
     )
   }
   ```

3. **Build only the new area** (NEW):
   ```typescript
   if (isFrontierTravel) {
     const areaData = state.exploration.areas.get(newAreaId)
     if (areaData) {
       // Build KnownArea for just this one area
       const newKnownArea = buildKnownArea(
         areaData,
         this.observation.miningLevel,
         this.cachedKnownLocationIds!,
         nodesByNodeId // Need to pass or rebuild this map
       )

       // Check if fully explored
       const { discoverables } = buildDiscoverables(state, areaData, {
         knownLocationIds: this.cachedKnownLocationIds!,
         knownAreaIds: this.cachedKnownAreaIds!,
         knownConnectionIds: this.cachedKnownConnectionIds!,
       })
       newKnownArea.isFullyExplored = discoverables.length === 0
       if (newKnownArea.isFullyExplored) {
         fullyExploredCache.set(newAreaId, true)
       }

       // Set travel time (will be 0 since it's now current)
       newKnownArea.travelTicksFromCurrent = 0

       // Add to knownAreas
       this.observation.knownAreas.push(newKnownArea)

       // Update node index for new area's nodes
       for (const node of newKnownArea.discoveredNodes) {
         this.nodeIndex?.set(node.nodeId, { area: newKnownArea, node })

         // Update material ref counts
         if (node.isMineable && node.remainingCharges) {
           this.incrementMaterialRef(node.primaryMaterial)
           for (const matId of node.secondaryMaterials) {
             this.incrementMaterialRef(matId)
           }
         }
       }

       // Update currentArea
       this.observation.currentArea = newKnownArea
     }
   }
   ```

4. **Add new frontier areas from new area's connections** (NEW):
   ```typescript
   if (isFrontierTravel) {
     const areaConnections = getConnectionsForArea(state.exploration, newAreaId)

     for (const conn of areaConnections) {
       // Check if connection is known
       if (!isConnectionKnown(this.cachedKnownConnectionIds!, conn.fromAreaId, conn.toAreaId)) {
         continue
       }

       // Determine target area
       const targetId = conn.fromAreaId === newAreaId ? conn.toAreaId : conn.fromAreaId

       // Skip if already known or already frontier
       if (this.cachedKnownAreaIds?.has(targetId)) continue
       if (this.observation.frontierAreas.some(f => f.areaId === targetId)) continue

       const targetArea = state.exploration.areas.get(targetId)
       if (targetArea) {
         this.observation.frontierAreas.push({
           areaId: targetId,
           distance: targetArea.distance,
           travelTicksFromCurrent: -1, // Lazy
           reachableFrom: newAreaId,
         })
       }
     }

     // Re-sort frontiers
     this.observation.frontierAreas.sort((a, b) =>
       getTravelTicks(a, this.observation!) - getTravelTicks(b, this.observation!)
     )
   }
   ```

5. **Update `knownMineableMaterials`** (NEW):
   ```typescript
   if (this.materialRefCounts) {
     this.observation.knownMineableMaterials = [...this.materialRefCounts.keys()]
   }
   ```

6. **Remove the `buildObservationFresh` call and subsequent index rebuilds**

### Dependencies

- Need access to `nodesByNodeId` map for building KnownArea. Options:
  - Cache it in ObservationManager (adds memory overhead)
  - Build it on demand for just the new area's nodes (cheaper)
  - Pass it through from WorldState (cleanest)

- Need `buildKnownArea` and `buildDiscoverables` to be accessible (they're already module-level functions)

### Test Plan

- Existing ObservationManager tests should still pass
- Add test: travel to frontier, verify new area appears in knownAreas
- Add test: travel to frontier, verify it's removed from frontierAreas
- Add test: travel to frontier with connections to other unknowns, verify new frontiers appear
- Run validation mode: `--validate-every 1`

---

## Implementation Order

1. **Task 1 first** - Explore is more frequent and has simpler state changes
2. **Task 2 second** - Frontier travel is less frequent but more complex (new area building)

## Validation Strategy

After each task, run:
```bash
npm run build && node dist/policy-runner/cli.js --batch --parallel --seed-count 20 --policy safe --target-level 7 --max-ticks 100000
```

Compare:
- Total runtime (should decrease significantly)
- Ticks/second at each level (should remain more constant)

Also run with validation to ensure no drift:
```bash
node dist/policy-runner/cli.js --seed test --policy safe --target-level 5 --validate-every 1
```

## Success Criteria

- `buildObservationFresh` only called once per simulation (initial build)
- Level 7 runtime drops from ~20s to <10s
- All existing tests pass
- No observation drift detected in validation mode
