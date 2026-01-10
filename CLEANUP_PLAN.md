# Cleanup Plan for Interactive Exploration

## Critical Bug to Fix

**Issue:** Shadow rolling uses simplified success chance calculation, not matching real execution.

Current code in `interactive.ts`:
```typescript
const baseRate = 0.05
const levelBonus = (level - 1) * 0.05
const distancePenalty = (distance - 1) * 0.05
const baseChance = Math.max(0.01, baseRate + levelBonus - distancePenalty)
```

Should use (from `exploration.ts`):
```typescript
const knowledgeParams = getKnowledgeParams(state, currentArea)
const baseChance = calculateSuccessChance({
  level,
  distance: currentArea.distance,
  ...knowledgeParams,
})
```

Missing factors:
- `connectedKnownAreas * 0.05` (knowledge bonus)
- Non-connected known areas contribution

**Impact:** Animation will predict WRONG tick count when player has discovered connected areas.

**Test case that would fail:**
1. Discover area A
2. Discover connection from Town to A
3. Survey from Town - shadow roll predicts 100t, real execution takes 50t
4. Animation shows 100 dots, but action completes at dot 50
5. User sees "hanging" animation

## Files to Modify

### 1. `src/exploration.ts`
- [x] Export `getKnowledgeParams` (already done)
- [ ] Export `calculateSuccessChance` (already exported)

### 2. `src/interactive.ts`
- [ ] Add imports: `getKnowledgeParams`, `calculateSuccessChance`
- [ ] Remove: `let hardestThreshold = 0` (line 87)
- [ ] Remove: `interface PromptResult` (lines 257-259)
- [ ] Fix `analyzeRemainingDiscoveries()` - use proper calculation
- [ ] Fix `analyzeRemainingAreas()` - use proper calculation
- [ ] Fix `interactiveExplore()` - use proper calculation
- [ ] Fix `interactiveSurvey()` - use proper calculation

### 3. Test scripts (optional cleanup)
- Keep: `demo-interactive.sh` (most comprehensive)
- Consider removing: `test-interactive.sh`, `test-adaptive-exploration.sh`, `test-discovery-flow.sh`
- Or: Add README explaining which script to use

## Implementation Steps

1. Import proper functions
2. Replace all 4 calc instances
3. Remove dead code
4. Test
5. Commit

## Testing Strategy

Create a test that:
1. Enrols in exploration
2. Discovers several areas and connections
3. Returns to town (high knowledge bonus)
4. Surveys (should be fast due to knowledge)
5. Verifies animation matches execution time

Without fix: Animation too long
With fix: Animation correct
