# Improvement Prompt: Clarify Travel Costs

## Objective

Fix the travel time display to accurately reflect actual travel costs, eliminating user confusion.

## Current Problem

Display shows:
```
Travel: area-d2-i7 (2t)
```

Actual travel costs:
```
✓ ExplorationTravel area-d2-i7 (20t): Traveled to area-d2-i7
```

The displayed "2t" and actual "20t" don't match.

## Investigation Required

First, determine the root cause by examining:

### 1. Display Calculation (`src/agent/formatters.ts`)

Find travel cost calculation (around lines 193-230). Look for how `destinations` map is populated with travel times.

### 2. Actual Travel Cost (`src/exploration.ts` or `src/engine.ts`)

Find where ExplorationTravel calculates actual tick cost. Look for:
- Base travel time
- Distance multipliers
- Depth-based scaling

### 3. Compare the Two

Document the exact formulas used in each location.

## Possible Fixes

### Option A: Display Shows Actual Cost

If the display is simply wrong (missing a multiplier), fix the display calculation:

```typescript
// In formatters.ts
const actualTravelTime = baseCost * TRAVEL_MULTIPLIER // or whatever the formula is
destinations.set(dest, actualTravelTime)
```

### Option B: Label as Base Cost

If "2t" is intentionally a "base cost" that gets multiplied, clarify the label:

```
Travel: area-d2-i7 (base 2t, ~20t total)
```

Or just show actual:
```
Travel: area-d2-i7 (20t)
```

### Option C: Different Cost Types

If there are different cost components (e.g., base + distance), show them:

```
Travel: area-d2-i7 (20t = 2 base × 10 distance)
```

## Files to Modify

1. `src/agent/formatters.ts` - Travel display section
2. Possibly `src/types.ts` if connection data structure needs updating
3. Test files for formatters

## Test Cases

```typescript
describe("travel cost display", () => {
  it("should display actual travel time, not base cost", () => {
    // Setup: area at distance 2 with base cost 2, multiplier 10
    // Expected display: "20t" not "2t"
  })

  it("should match displayed cost to actual ExplorationTravel cost", () => {
    // Display shows X ticks
    // Execute ExplorationTravel
    // Verify action took X ticks
  })
})
```

## Acceptance Criteria

1. Travel display matches actual travel cost
2. Users can trust the displayed time when planning
3. All existing tests updated and passing
4. Integration test verifying display matches execution
