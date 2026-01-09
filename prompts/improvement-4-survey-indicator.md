# Improvement Prompt: Add Survey Needed Indicator

## Objective

Clarify in the Travel display which destinations require surveying before travel is possible.

## Current Problem

After exploring:
```
✓ Explore: Discovered connection to unknown area (area-d1-i0->area-d2-i7)

Travel: TOWN (1t), area-d2-i7 (2t)
```

User tries: `move area-d2-i7` → `AREA_NOT_KNOWN`

The area appears in Travel list with a cost, implying it's reachable, but it actually requires Survey first.

## Desired Behavior

Option A - Mark survey-needed areas:
```
Travel: TOWN (1t), area-d2-i7 (2t, needs survey)
```

Option B - Separate known vs connected:
```
Travel: TOWN (1t)
Connections: area-d2-i7 (2t, survey to reveal)
```

Option C - Don't show until surveyed:
```
Travel: TOWN (1t)
```
(area-d2-i7 only appears after Survey action)

## Implementation

### Understanding the Current Logic

In `src/agent/formatters.ts`, find the Travel section (around lines 193-230):

```typescript
const knownConnections = state.exploration.playerState.knownConnectionIds
const destinations = new Map<string, number>()

for (const connId of knownConnections) {
  // ... builds destinations map
}
```

The issue: `knownConnectionIds` includes connections to unknown areas.

### Data Model Check

Examine `src/types.ts` for:
- `knownConnectionIds` - What does "known connection" mean?
- `knownAreaIds` - Separately tracked?
- Is there a way to distinguish "connection discovered" from "area surveyed"?

### Solution Approach

```typescript
// In formatters.ts Travel section
for (const connId of knownConnections) {
  const [from, to] = connId.split("->")
  let dest: string | null = null

  if (from === currentArea) {
    dest = to
  } else if (to === currentArea) {
    dest = from
  }

  if (dest) {
    const isKnownArea = knownAreaIds.includes(dest)
    const travelTime = calculateTravelTime(...)

    if (isKnownArea) {
      // Can travel directly
      destinations.set(dest, { time: travelTime, needsSurvey: false })
    } else {
      // Connection known but area not surveyed
      destinations.set(dest, { time: travelTime, needsSurvey: true })
    }
  }
}

// In display formatting
const travelLines = Array.from(destinations.entries()).map(([dest, info]) => {
  const suffix = info.needsSurvey ? ", needs survey" : ""
  return `${dest} (${info.time}t${suffix})`
})
```

## Alternative: Filter Out Unknown Areas

Simpler approach - only show travelable destinations:

```typescript
for (const connId of knownConnections) {
  // ... get destination

  if (dest && knownAreaIds.includes(dest)) {
    destinations.set(dest, travelTime)
  }
  // Skip destinations that aren't surveyed yet
}
```

This is cleaner but provides less information to the user.

## User Experience Consideration

The "needs survey" indicator helps users understand the explore → survey → travel flow:

1. **Explore** discovers connections (paths exist)
2. **Survey** reveals what's at the other end (area becomes known)
3. **Travel** moves to known areas

The indicator teaches this progression.

## Test Cases

```typescript
describe("travel display survey indicator", () => {
  it("should show 'needs survey' for connected but unknown areas", () => {
    // Setup: connection known, destination area not surveyed
    const formatted = formatWorldState(state)
    expect(formatted).toContain("area-d2-i7 (2t, needs survey)")
  })

  it("should not show 'needs survey' for surveyed areas", () => {
    // Setup: connection known AND area surveyed
    const formatted = formatWorldState(state)
    expect(formatted).toContain("area-d2-i7 (2t)")
    expect(formatted).not.toContain("needs survey")
  })

  it("should only show travelable destinations without survey if that design is chosen", () => {
    // Alternative test if filtering approach is used
  })
})
```

## Files to Modify

1. `src/agent/formatters.ts` - Travel section
2. `src/agent/formatters.test.ts` - New tests
3. Possibly `MANUAL_RUN.md` - Document the explore/survey/travel flow

## Acceptance Criteria

1. Users can distinguish between travelable and survey-needed destinations
2. Attempting to travel to survey-needed area gives clear error
3. After Survey, destination becomes normally travelable
4. All tests pass
