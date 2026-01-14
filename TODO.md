# Policy Runner Performance Optimizations

## Current Performance

- **Baseline:** 15.6s for 10 seeds × 50k max ticks
- **Current speed:** ~16,000 ticks/second
- **Target speed:** ~500,000 ticks/second (for 1s runtime)
- **Required improvement:** ~31× faster

## Profiling Results (from previous analysis)

Top functions by self-time (microseconds):
```
236,715 μs  isConnectionKnown (src/exploration.ts)
 69,961 μs  getKnowledgeParams (src/exploration.ts)
 54,664 μs  buildDiscoverables (src/exploration.ts)
 41,582 μs  getObservation (src/policy-runner/observation.ts)
 37,499 μs  (anonymous) (src/exploration.ts)
 31,251 μs  executeFarTravel (src/exploration.ts)
 26,252 μs  findPath (src/exploration.ts)
 18,917 μs  executeExplore (src/exploration.ts)
 13,832 μs  ensureAreaFullyGenerated (src/exploration.ts)
 11,040 μs  createConnectionId (src/exploration.ts)
```

---

## Optimization Opportunities

### TIER 1: High Impact, Low-Medium Effort

#### 1. Normalize Connection IDs at Storage Time
**Impact:** HIGH (saves ~237ms, ~18% of runtime)
**Effort:** LOW (1-2 hours)

**Problem:** `isConnectionKnown()` is called thousands of times, each time:
- Creates 2 strings via template literal: `${areaId1}->${areaId2}` and reverse
- Does 2 Set lookups

**Solution:** Store connections in canonical form (alphabetically sorted: `min(a,b)->max(a,b)`). Then lookups need only 1 string creation and 1 Set lookup.

```typescript
function normalizeConnectionId(areaId1: AreaID, areaId2: AreaID): string {
  return areaId1 < areaId2
    ? `${areaId1}->${areaId2}`
    : `${areaId2}->${areaId1}`
}
```

---

#### 2. Maintain Persistent Sets Instead of Creating from Arrays
**Impact:** HIGH (saves ~125ms combined for getKnowledgeParams + buildDiscoverables)
**Effort:** MEDIUM (2-4 hours)

**Problem:** Multiple functions recreate Sets from arrays on every call:
```typescript
const knownLocationIds = new Set(exploration.playerState.knownLocationIds)
const knownConnectionIds = new Set(exploration.playerState.knownConnectionIds)
const knownAreaIds = new Set(exploration.playerState.knownAreaIds)
```

**Solution:** Store these as Sets in the state directly, or maintain a cache that's invalidated when arrays change. Add Sets alongside the arrays:
```typescript
playerState: {
  knownAreaIds: AreaID[]
  knownAreaIdSet: Set<AreaID>  // Maintained in sync
  // ... etc
}
```

Or use a proxy/wrapper that maintains both.

---

#### 3. Create Sync Version of Engine for Policy Runner
**Impact:** HIGH (potentially 2-5× improvement)
**Effort:** MEDIUM-HIGH (4-8 hours)

**Problem:** The engine uses async generators that yield on every tick:
```typescript
async function* executeGather(...): ActionGenerator {
  for (let tick = 0; tick < actualTicks; tick++) {
    consumeTime(state, 1)
    yield { done: false }  // Overhead on EVERY tick
  }
}
```

Policy runner doesn't need interactivity - it just wants the final result.

**Solution:** Create synchronous versions of action executors for the policy runner:
```typescript
function executeGatherSync(state, action): ActionLog {
  // Skip yields, just consume time and return result
  consumeTime(state, actualTicks)
  return { ... }
}
```

---

#### 4. Index Connections by Area
**Impact:** MEDIUM-HIGH (saves iteration over all connections)
**Effort:** LOW-MEDIUM (2-3 hours)

**Problem:** Multiple functions iterate ALL connections to find those for a specific area:
```typescript
for (const conn of exploration.connections) {
  if (conn.fromAreaId === area.id || conn.toAreaId === area.id) { ... }
}
```

**Solution:** Maintain a `Map<AreaID, AreaConnection[]>` index:
```typescript
connectionsByArea: Map<AreaID, AreaConnection[]>
```

Update the index when connections are added. Use `getConnectionsForArea(areaId)` instead of filtering.

---

### TIER 2: Medium Impact, Low-Medium Effort

#### 5. Fast `hasUndiscoveredContent` for Observation Building
**Impact:** MEDIUM (avoids full discoverables computation in many cases)
**Effort:** LOW (1-2 hours)

**Problem:** `observation.ts` calls `buildDiscoverables(state, area)` just to check if there's anything to discover. This computes ALL discoverables with their thresholds.

**Solution:** Create a fast early-exit function:
```typescript
function hasUndiscoveredContent(area, connections, knownSets): boolean {
  // Check locations - return true on first undiscovered
  for (const loc of area.locations) {
    if (!knownSets.locations.has(loc.id)) return true
  }
  // Check connections - return true on first undiscovered
  for (const conn of connectionsForArea) {
    if (!knownSets.connections.has(normalizedConnId)) return true
  }
  return false
}
```

---

#### 6. Cache Observation Between Ticks
**Impact:** MEDIUM (most observation data doesn't change each tick)
**Effort:** MEDIUM (3-4 hours)

**Problem:** Full observation is rebuilt every tick, but much doesn't change:
- Frontier areas only change on discoveries
- Known areas only change on discoveries
- Travel times only change when player moves

**Solution:** Cache observation components with invalidation:
```typescript
interface ObservationCache {
  knownAreasHash: number  // knownAreaIds.length + knownLocationIds.length
  cachedKnownAreas: KnownArea[]
  frontierHash: number  // knownConnectionIds.length
  cachedFrontierAreas: FrontierArea[]
}
```

Only recompute when hash changes.

---

#### 7. Node Lookup by ID via Map
**Impact:** LOW-MEDIUM (reduces O(n) to O(1) for node lookups)
**Effort:** LOW (1 hour)

**Problem:** `state.world.nodes?.find((n) => n.nodeId === nodeId)` is O(n).

**Solution:** Maintain `Map<NodeID, Node>` alongside the array.

---

#### 8. Optimize RNG String Concatenation
**Impact:** LOW-MEDIUM (RNG is called on every roll)
**Effort:** LOW (1 hour)

**Problem:** Every RNG call does:
```typescript
const combined = `${seed}:${counter}`
```

**Solution:** Pre-compute seed hash at RNG creation:
```typescript
const seedHash = hash(seed)
// Then use numeric combination instead of string
const combined = seedHash ^ (counter * PRIME)
```

---

### TIER 3: Potential High Impact, Higher Effort

#### 9. Specialized Policy Runner Engine
**Impact:** POTENTIALLY VERY HIGH (could be 10-50× faster)
**Effort:** HIGH (1-2 days)

**Problem:** The engine is designed for interactive play with:
- Rich action logs with RNG history
- Feedback yields on every tick
- Support for all action types
- Contract checking after every action

Policy runner only needs Mining, Explore, Travel.

**Solution:** Create a minimal simulation engine specifically for policy running:
- No action logs (just final state changes)
- No yield per tick (batch consume time)
- Only support the actions policies use
- Skip contract checking (policies don't use contracts)
- Inline hot paths

---

#### 10. Precompute Static World Data
**Impact:** MEDIUM (reduces repeated computation)
**Effort:** MEDIUM (3-4 hours)

**Problem:** Some computations are repeated that depend only on world structure:
- `getAreaCountForDistance(distance)` - same for same distance
- Connection structure is static once generated

**Solution:** Precompute at world creation:
```typescript
world.areaCountByDistance: number[]
world.connectionsByArea: Map<AreaID, AreaConnection[]>
```

---

#### 11. Avoid Object Creation in Hot Paths
**Impact:** MEDIUM (reduces GC pressure)
**Effort:** MEDIUM-HIGH (4-6 hours)

**Problem:** Many functions create objects that are immediately discarded:
- `{ discoverables, baseChance }` return values
- `{ path, connections, totalTime }` from findPath
- Skill snapshots per tick
- XP gain arrays

**Solution:** Reuse objects or use primitives where possible. Use object pools for frequently created/destroyed objects.

---

#### 12. Batch Multiple Ticks per Action Loop Iteration
**Impact:** MEDIUM (reduces loop overhead)
**Effort:** LOW-MEDIUM (2-3 hours)

**Problem:** Currently, each policy action goes through:
1. getObservation()
2. policy.decide()
3. toEngineActions()
4. executeAction() with per-tick yields
5. Metrics recording

**Solution:** For actions that consume multiple ticks (mining ~5 ticks, exploration ~20+ ticks), skip observation/decision until action completes.

---

### TIER 4: Lower Impact or Speculative

#### 13. Use Typed Arrays for Hot Data
**Impact:** LOW-MEDIUM (better memory layout)
**Effort:** HIGH (significant refactor)

Instead of arrays of objects, use typed arrays for hot data like connection indices.

---

#### 14. Worker Thread Parallelization
**Impact:** HIGH for batch runs (can run multiple seeds in parallel)
**Effort:** MEDIUM (3-4 hours)

Run different seeds in parallel using worker threads. Doesn't speed up single runs, but batch of 10 could run on 10 cores.

---

#### 15. JIT-Friendly Code Patterns
**Impact:** UNKNOWN (depends on V8 optimization)
**Effort:** MEDIUM

- Avoid megamorphic call sites
- Keep object shapes stable
- Avoid creating closures in hot paths

---

## Summary Table

| # | Optimization | Impact | Effort | Priority |
|---|-------------|--------|--------|----------|
| 1 | Normalize connection IDs | HIGH (~18%) | LOW | ⭐⭐⭐⭐⭐ |
| 2 | Persistent Sets | HIGH (~10%) | MEDIUM | ⭐⭐⭐⭐⭐ |
| 3 | Sync engine for policy runner | HIGH (2-5×) | MEDIUM-HIGH | ⭐⭐⭐⭐ |
| 4 | Index connections by area | MEDIUM-HIGH | LOW-MEDIUM | ⭐⭐⭐⭐ |
| 5 | Fast hasUndiscoveredContent | MEDIUM | LOW | ⭐⭐⭐⭐ |
| 6 | Cache observation | MEDIUM | MEDIUM | ⭐⭐⭐ |
| 7 | Node lookup Map | LOW-MEDIUM | LOW | ⭐⭐⭐ |
| 8 | Optimize RNG | LOW-MEDIUM | LOW | ⭐⭐⭐ |
| 9 | Specialized policy engine | VERY HIGH | HIGH | ⭐⭐⭐ |
| 10 | Precompute static data | MEDIUM | MEDIUM | ⭐⭐ |
| 11 | Avoid object creation | MEDIUM | MEDIUM-HIGH | ⭐⭐ |
| 12 | Batch ticks | MEDIUM | LOW-MEDIUM | ⭐⭐ |
| 13 | Typed arrays | LOW-MEDIUM | HIGH | ⭐ |
| 14 | Worker parallelization | HIGH (batch) | MEDIUM | ⭐⭐ |
| 15 | JIT-friendly patterns | UNKNOWN | MEDIUM | ⭐ |

## Recommended Implementation Order

**Phase 1 - Quick Wins (~50% improvement expected):**
1. Normalize connection IDs (#1)
2. Fast hasUndiscoveredContent (#5)
3. Node lookup Map (#7)

**Phase 2 - Data Structure Improvements (~2-3× total):**
4. Persistent Sets (#2)
5. Index connections by area (#4)
6. Optimize RNG (#8)

**Phase 3 - Architecture Changes (~10× total):**
7. Sync engine for policy runner (#3)
8. Cache observation (#6)
9. Batch ticks (#12)

**Phase 4 - If Still Needed:**
10. Specialized policy engine (#9)
11. Worker parallelization (#14)
