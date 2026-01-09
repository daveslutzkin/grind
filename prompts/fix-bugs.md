# Bug Fix Prompt: Adaptive Agent Test Run Issues

## Context

During an adaptive agent test run of the simulation engine, several bugs were discovered. This prompt describes each bug and provides guidance for fixing them.

## Bug 1: Node ID Not Exposed in UI (Critical)

### Problem
The gathering UI shows human-readable node names like "Ore vein" but the `gather` command requires the internal node ID (e.g., `area-d1-i1-node-0`). Users have no way to discover the correct node ID.

### Current Behavior
```
Location: Unknown in area-d1-i1
Gathering: Ore vein
```

User tries: `gather Ore vein focus stone` → fails
User tries: `gather ore-vein focus stone` → NODE_NOT_FOUND

### Expected Behavior
The UI should expose the node ID so users can reference it in commands:
```
Gathering: Ore vein (area-d1-i1-node-0)
```
Or provide a simpler alias system.

### Files to Investigate
- `src/agent/formatters.ts` - Look at lines 180-190 where `Gathering:` output is generated
- `src/visibility.ts` - `getNodeTypeName()` function
- `src/runner.ts` - `parseAction()` for gather command parsing

### Implementation Guidance
Option A: Show node IDs in the Gathering line
```typescript
// In formatters.ts around line 182-186
const nodeNames = nodesHere.map((node) => {
  const view = getPlayerNodeView(node, state)
  return `${getNodeTypeName(view.nodeType)} (${node.nodeId})`
})
lines.push(`Gathering: ${nodeNames.join(", ")}`)
```

Option B: Support node type as alias (match by type in current area)
```typescript
// In runner.ts parseAction or engine gather logic
// If nodeId doesn't match exactly, try matching by node type in current area
```

### Test Cases to Add
1. Test that node IDs appear in formatted output
2. Test that gather command works with displayed node ID
3. Integration test: explore → see node with ID → gather using that ID

---

## Bug 2: Travel Time Display Discrepancy

### Problem
Travel destinations show costs like "1t" or "2t" but actual travel takes 10x longer (10t, 20t).

### Example
```
Travel: area-d2-i7 (2t)
```
But when traveling: `ExplorationTravel area-d2-i7 (20t): Traveled to area-d2-i7`

### Files to Investigate
- `src/agent/formatters.ts` - Look at travel cost calculation (around lines 193-230)
- `src/exploration.ts` - Actual travel time calculation
- `src/engine.ts` - ExplorationTravel action execution

### Root Cause Investigation
Determine if:
1. The display calculation is wrong (missing a multiplier)
2. The display shows "base cost" but travel adds overhead
3. There's a distance-based multiplier not reflected in display

### Test Cases to Add
1. Test that displayed travel time matches actual travel time
2. Test across different area depths/distances

---

## Bug 3: "Top 0%" Luck Display

### Problem
When luck is extremely good, the display shows "Top 0%" which is mathematically awkward.

### Current Behavior
```
🎲 LUCK: Top 0% (very lucky) — 34 streams (+2.89σ)
```

### Expected Behavior
```
🎲 LUCK: Top <1% (extremely lucky) — 34 streams (+2.89σ)
```
Or use a floor like "Top 1%" for anything below 1%.

### Files to Investigate
- `src/runner.ts` - Look for luck percentage calculation and formatting (search for "LUCK" or luck percentage formatting)

### Implementation
```typescript
// When formatting luck percentage
const percentage = calculateLuckPercentile(...)
const displayPercentage = percentage < 1 ? "<1" : Math.round(percentage)
```

---

## Bug 4: Node Discovery Persistence Issue

### Problem
Nodes discovered before acquiring the relevant gathering skill don't appear when returning with the skill.

### Reproduction Steps
1. Enrol in Exploration only
2. Travel to area-d1-i0
3. Explore - discover "ore vein" (no Mining skill yet)
4. Return to town, enrol in Mining
5. Return to area-d1-i0
6. "Gathering: none visible" even though ore vein was discovered
7. Fully explore area - still no nodes visible

### Expected Behavior
Nodes discovered during exploration should be remembered and visible once the player has the appropriate skill.

### Files to Investigate
- `src/exploration.ts` - How node discoveries are tracked
- `src/visibility.ts` - `getPlayerNodeView()` and node visibility logic
- `src/agent/formatters.ts` - How nodes are filtered for display

### Possible Causes
1. Node discoveries not being persisted to state
2. Visibility check filtering out nodes discovered without skill
3. Location discovery vs node discovery mismatch

### Test Cases to Add
1. Discover node without skill → get skill → node should be visible
2. Verify node discovery persists across area transitions

---

## Bug 5: Survey/Explore Flow UX Confusion

### Problem
When explore discovers a "connection to unknown area", it appears in the Travel list with a cost, but attempting to travel fails with AREA_NOT_KNOWN until the area is Surveyed.

### Current Behavior
```
✓ Explore: Discovered connection to unknown area (area-d1-i0->area-d2-i7)
Travel: TOWN (1t), area-d2-i7 (2t)
```
Then: `move area-d2-i7` → AREA_NOT_KNOWN

### Expected Behavior
Either:
1. Don't show unrevealed areas in Travel list, OR
2. Mark them clearly: `area-d2-i7 (2t, survey needed)`, OR
3. Allow travel to connected-but-unknown areas

### Files to Investigate
- `src/agent/formatters.ts` - Travel section formatting
- `src/exploration.ts` - Connection vs area knowledge tracking
- `src/engine.ts` - ExplorationTravel validation

### Implementation Options
Option A: Filter out unknown areas from Travel display
Option B: Add indicator for survey-needed areas
Option C: Change game logic to allow travel to connected areas

---

## General Testing Requirements

After fixing each bug:
1. Run `npm run check` to ensure all tests pass
2. Add new test cases for the fixed behavior
3. Do a brief manual test run to verify the fix works in practice

## Commit Guidelines

Make separate commits for each bug fix with clear messages:
- "Fix node ID visibility in gathering UI"
- "Fix travel time display to match actual cost"
- "Fix luck percentage display for extreme values"
- "Fix node discovery persistence across skill acquisition"
- "Clarify survey requirement in travel display"
