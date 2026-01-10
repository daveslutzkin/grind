# Code Review: Interactive Exploration Branch

## Issues Found

### 1. Orphaned Code (Dead Variables/Types)

**Location:** `src/interactive.ts:87`
```typescript
let hardestThreshold = 0  // ❌ Declared but never used
```
This was from an earlier iteration where we were tracking thresholds differently. Can be removed.

**Location:** `src/interactive.ts:257-259`
```typescript
interface PromptResult {  // ❌ Declared but never used
  continue: boolean
}
```
Orphaned from earlier design. Can be removed.

### 2. Code Duplication - Success Chance Calculation

The same success chance calculation appears **4 times**:

1. `analyzeRemainingDiscoveries()` (lines 120-123)
2. `analyzeRemainingAreas()` (lines 167-170)
3. `interactiveExplore()` (lines 346-350)
4. `interactiveSurvey()` (lines 437-440)

```typescript
// Repeated 4 times:
const baseRate = 0.05
const levelBonus = (level - 1) * 0.05
const distancePenalty = (distance - 1) * 0.05
const baseChance = Math.max(0.01, baseRate + levelBonus - distancePenalty)
```

**Recommendation:** Extract to helper function (though this logic already exists in `exploration.ts` as part of `getKnowledgeParams` + `calculateSuccessChance`).

### 3. Inconsistent Calculation Methods

**Problem:** `interactive.ts` manually calculates success chance instead of using existing `calculateSuccessChance()` from `exploration.ts`.

The proper calculation in `exploration.ts` includes:
- Knowledge bonus (connected known areas)
- Non-connected known areas contribution

But `interactive.ts` only does:
- baseRate + levelBonus - distancePenalty

This means the shadow roll uses a **different success chance** than the real execution! This could cause animation timing to be wrong.

### 4. Test Script Redundancy

We have 4 test scripts:
- `test-interactive.sh` - minimal test (341 bytes)
- `test-adaptive-exploration.sh` - adaptive test (2.5K)
- `test-discovery-flow.sh` - flow demo (2.1K)
- `demo-interactive.sh` - comprehensive demo (3.8K)

**Recommendation:** Keep `demo-interactive.sh`, delete the others (or document which one to use).

### 5. Missing Edge Cases

**interactiveExplore/Survey:** What happens if the session ends during animation?
- Animation checks `state.time.sessionRemainingTicks <= 0` and stops
- But then we still execute the action on line 404/484
- This could fail with SESSION_ENDED

The action execution should check the cancellation reason.

## Severity Assessment

🔴 **Critical**: Issue #3 (Calculation mismatch) - Could cause incorrect animation timing
🟡 **Medium**: Issue #5 (Edge case) - Rare but possible bug
🟢 **Low**: Issues #1, #2, #4 - Code cleanliness

## Recommendations

### Quick Wins (do now):
1. Remove orphaned `hardestThreshold` variable
2. Remove orphaned `PromptResult` interface
3. Fix calculation mismatch by using `calculateSuccessChance()` from exploration.ts

### Future Improvements (optional):
4. Consolidate test scripts
5. Handle session-end-during-animation edge case

## Files to Clean Up

- `src/interactive.ts` - remove dead code, fix calculation
- `test-*.sh` - consolidate or document
- `ADAPTIVE_TEST_RESULTS.md` - update if we change test scripts
