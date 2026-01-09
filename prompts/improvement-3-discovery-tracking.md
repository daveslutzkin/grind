# Improvement Prompt: Better Discovery Tracking

## Objective

Ensure that nodes discovered during exploration are properly remembered and displayed once the player acquires the appropriate gathering skill.

## Current Problem

1. Player explores area-d1-i0 with only Exploration skill
2. Explore action reports: "Discovered ore vein"
3. Player returns to town, enrols in Mining
4. Player returns to area-d1-i0
5. Display shows: "Gathering: none visible"
6. Further exploration shows area is "FULLY EXPLORED!" but still no nodes

The ore vein discovered earlier should be visible now that Mining skill is acquired.

## Root Cause Investigation

### Hypothesis 1: Discovery Not Persisted

Check if node discoveries are actually saved to state:
- `src/exploration.ts` - Explore action handler
- `src/types.ts` - WorldState structure for discoveries

### Hypothesis 2: Visibility Filter Too Aggressive

Check if the display filters out discovered nodes when skill is missing:
- `src/agent/formatters.ts` - Gathering section filtering
- `src/visibility.ts` - Node visibility checks

### Hypothesis 3: Location vs Node Discovery Mismatch

The system might track "locations" (abstract) separately from "nodes" (concrete):
- Location discovery: knows there's something at a spot
- Node visibility: requires skill to see what it is

## Key Files to Examine

### `src/exploration.ts`
- How does Explore action record discoveries?
- What state is updated when a node is found?
- Is there a difference between "discovered" and "visible"?

### `src/agent/formatters.ts` (lines 170-190)
```typescript
// Current filtering logic
const nodesHere = state.world.nodes?.filter((n) => {
  if (n.areaId !== currentArea) return false
  const match = n.nodeId.match(/-node-(\d+)$/)
  if (!match) return false
  const locationId = `${n.areaId}-loc-${match[1]}`
  return knownLocationIds.includes(locationId)
})
```

Is `knownLocationIds` properly populated when nodes are discovered?

### `src/visibility.ts`
- `getPlayerNodeView()` - Does it return "none" visibility for skills not yet acquired?
- Should discovered-but-not-skilled nodes still appear in list?

## Expected Behavior

### Option A: Show All Discovered Nodes

Once a node is discovered, it appears in Gathering list regardless of skill:
```
Gathering: Ore vein (area-d1-i0-node-0) [requires Mining]
```

### Option B: Remember Discovery, Show When Skilled

Node discovery is tracked. When skill is acquired, node becomes visible:
```
// Before Mining skill:
Gathering: (1 undiscovered location)

// After Mining skill:
Gathering: Ore vein (area-d1-i0-node-0)
```

### Option C: Auto-Reveal on Skill Acquisition

When enrolling in a skill, automatically reveal previously-discovered nodes of that type.

## Implementation Guidance

### If Discovery State Issue

Ensure discoveries persist in `state.exploration.playerState.knownLocationIds`:

```typescript
// In explore action handler
if (discoveredNode) {
  const locationId = `${areaId}-loc-${nodeIndex}`
  state.exploration.playerState.knownLocationIds.push(locationId)
}
```

### If Visibility Filter Issue

Update formatters to not filter by skill for discovered nodes:

```typescript
// Show node if location is known, regardless of current skill
const nodesHere = state.world.nodes?.filter((n) => {
  if (n.areaId !== currentArea) return false
  const locationId = deriveLocationId(n.nodeId)
  return knownLocationIds.includes(locationId)
})

// Then in display, indicate if gatherable
nodesHere.map((node) => {
  const canGather = hasRequiredSkill(state, node)
  const suffix = canGather ? "" : " [need skill]"
  return `${getNodeTypeName(node.nodeType)}${suffix}`
})
```

## Test Cases

```typescript
describe("node discovery persistence", () => {
  it("should remember discovered nodes across area transitions", () => {
    // Discover node, leave area, return - node should still be known
  })

  it("should show discovered nodes after acquiring skill", () => {
    // Discover ore without Mining
    // Enrol in Mining
    // Return to area - ore should be visible
  })

  it("should track discoveries independently from skill", () => {
    // Verify knownLocationIds updated on discovery
    // Verify visibility not dependent on skill at discovery time
  })
})
```

## Acceptance Criteria

1. Nodes discovered without skill are remembered
2. Returning with the skill shows the node
3. Clear indication if node requires skill not yet acquired
4. All existing tests pass
5. New tests for discovery persistence
