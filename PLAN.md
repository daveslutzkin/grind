# Plan: Incremental Observation Updates

## Goal
Convert `getObservation()` from O(state_size) rebuild per tick to O(delta) incremental updates, reducing overall complexity from O(n²) to O(n) where n = max_ticks.

## Current State

**Problem**: `getObservation()` (observation.ts:140-318) rebuilds the entire observation every tick:
- Converts arrays to Sets: `new Set(knownLocationIds)`, `new Set(knownAreaIds)`, `new Set(knownConnectionIds)`
- Iterates all known areas to build `knownAreas[]`
- Iterates all known areas again to find `frontierAreas[]`
- These arrays grow over time → O(n²) total work

**Called from**: runner.ts:355 in main loop, every tick

## Design

### New Architecture

1. **ObservationManager class** - maintains observation state incrementally
   - `observation: PolicyObservation` - the current observation
   - `knownLocationIds: Set<LocationID>` - cached as Set (not array)
   - `knownAreaIds: Set<AreaID>` - cached as Set
   - `knownConnectionIds: Set<string>` - cached as Set
   - `buildFresh(state): PolicyObservation` - full rebuild (current logic)
   - `applyActionResult(state, action, result): void` - incremental update
   - `validate(state, tick): void` - every 5000 ticks, rebuild and compare

2. **Incremental updates by action type**:

   | Action | Fields that change |
   |--------|-------------------|
   | Mine | inventorySlotsUsed, inventoryByItem, miningXpInLevel, miningTotalXp, miningLevel (on levelup), knownMineableMaterials (on levelup) |
   | Explore | knownAreas (new locations in area), frontierAreas (may shrink), knownMineableMaterials (new materials) |
   | Travel | currentAreaId, currentArea, isInTown, canDeposit, returnTimeToTown, possibly knownAreas/frontierAreas if frontier travel |
   | ReturnToTown | currentAreaId, currentArea, isInTown, canDeposit, returnTimeToTown |
   | DepositInventory | inventorySlotsUsed, inventoryByItem, canDeposit |
   | Wait | (nothing) |

3. **Discovery hooks**: The tricky part is knowing when knownLocationIds/knownAreaIds/knownConnectionIds change. Options:
   - Check the arrays after each action for length changes (simple but not O(1))
   - Have `executePolicyAction` return discovery info (cleaner)
   - Current `executePolicyAction` already returns `nodesDiscovered` - extend this

### Validation Strategy

Every 5000 ticks:
```typescript
if (tick % 5000 === 0) {
  const rebuilt = this.buildFresh(state)
  const diffs = this.diffObservations(this.observation, rebuilt)
  if (diffs.length > 0) {
    throw new Error(`Observation drift at tick ${tick}: ${JSON.stringify(diffs)}`)
  }
}
```

## Files to Modify

1. **src/policy-runner/observation.ts** - Main changes
   - Extract current `getObservation` logic into `buildObservationFresh()`
   - Create `ObservationManager` class
   - Add `applyActionResult()` method with per-action-type update logic
   - Add `validate()` method for drift detection
   - Add `diffObservations()` helper for debugging

2. **src/policy-runner/runner.ts** - Integration
   - Create `ObservationManager` at start of run (line ~285)
   - Replace `getObservation(state)` call (line 355) with `manager.getObservation()`
   - After `executePolicyAction`, call `manager.applyActionResult()`
   - Pass tick count for validation trigger

3. **src/policy-runner/types.ts** - Extend result type
   - Add discovery info to `PolicyActionResult` if not already present
   - Fields: `locationsDiscovered`, `areasDiscovered`, `connectionsDiscovered`

## Implementation Steps

### Phase 1: Prepare (no behavior change)
1. Write tests capturing current `getObservation()` output for various states
2. Extract `buildObservationFresh()` from current `getObservation()`
3. Create `ObservationManager` class that wraps `buildObservationFresh()` (no incremental yet)
4. Run `npm run check` - all tests pass

### Phase 2: Add validation infrastructure
1. Add `diffObservations()` helper
2. Add `validate()` method that rebuilds and compares
3. Wire up 5000-tick validation in runner.ts
4. Run policy runner - should work identically, just with periodic validation

### Phase 3: Incremental updates (one action at a time)
1. Implement `applyMineResult()` - update inventory/xp fields
2. Implement `applyDepositResult()` - update inventory fields
3. Implement `applyTravelResult()` - update location fields
4. Implement `applyReturnToTownResult()` - update location fields
5. Implement `applyExploreResult()` - update discovery fields (hardest)
6. After each: run policy runner, validation catches any bugs

### Phase 4: Optimize Set storage
1. Change `knownLocationIds` from array→Set rebuild to persistent Set
2. Change `knownAreaIds` from array→Set rebuild to persistent Set
3. Change `knownConnectionIds` from array→Set rebuild to persistent Set
4. Update incrementally when discoveries happen

## Verification

1. **Unit tests**: Existing + new tests for incremental update correctness
2. **Integration**: Run `npm run check` after each phase
3. **Performance**:
   ```bash
   # Before
   time node dist/policy-runner/cli.js --batch --seed test --max-ticks 50000

   # After (should be ~linear speedup)
   time node dist/policy-runner/cli.js --batch --seed test --max-ticks 50000
   ```
4. **Drift detection**: Run with various seeds, 5000-tick validation should never fire

## Risks

- **Complexity**: Incremental logic must handle all edge cases
- **Mitigation**: 5000-tick validation catches drift; can fall back to rebuild if needed
- **Testing**: Extensive tests + real policy runner runs with validation
