# Implementation Plan: Add Progress Animations to ALL Actions

## Overview

Currently only 4 action types (Explore, Survey, ExplorationTravel, FarTravel) have progress animations. This plan adds animations to ALL 16 action types, including those with 0, 1, or 3 ticks.

## Current Architecture

### How animations work now

1. **Animation infrastructure** exists in `src/interactive.ts`:
   - `runAnimatedAction()` (lines 62-121) - consumes generator ticks, displays "." per tick
   - `setupCancellation()` (lines 127+) - enables Ctrl+C to cancel
   - `formatTickFeedback()` - formats mid-action feedback (combat damage, gathering)

2. **Why most actions don't animate**: In `src/runner.ts`:
   - Lines 1366-1427: Special handling routes Explore/Survey/Travel to interactive functions
   - Line 1430: All other actions use `executeAction()` → `executeToCompletion()` which silently consumes ticks

3. **Generator pattern**: All actions already yield `{ done: false }` per tick - animation support is built into the engine.

## All Action Types (16 total)

| Action | Current Animation | Tick Count | Priority |
|--------|------------------|------------|----------|
| Explore | ✓ Yes | Variable (1-50+) | Already done |
| Survey | ✓ Yes | Variable (1-50+) | Already done |
| ExplorationTravel | ✓ Yes | Variable (5-45) | Already done |
| FarTravel | ✓ Yes | Variable (multi-hop) | Already done |
| **Mine** | ✗ No | Variable (3-10+) | HIGH |
| **Gather** | ✗ No | Variable (3-10+) | HIGH |
| **Chop** | ✗ No | Variable (3-10+) | HIGH |
| **Fight** | ✗ No | Variable (1-20+) | HIGH |
| **Craft** | ✗ No | Variable (recipe-based) | HIGH |
| Move | ✗ No | Same as ExplorationTravel | MEDIUM |
| TravelToLocation | ✗ No | 1 tick | LOW |
| Leave | ✗ No | 1 tick | LOW |
| Enrol | ✗ No | 3 ticks | LOW |
| Drop | ✗ No | 1 tick | LOW |
| Store | ✗ No | 0 ticks | LOW |
| AcceptContract | ✗ No | 0 ticks | LOW |
| TurnInCombatToken | ✗ No | 0 ticks | LOW |

## Implementation Steps

### Step 1: Create action label mapping

Create a function in `src/interactive.ts` that maps action types to display labels:

```typescript
// src/interactive.ts

import type { Action } from "./types.js"

/**
 * Get the display label for an action during animation
 */
export function getActionLabel(action: Action): string {
  switch (action.type) {
    case "Explore":
      return "Exploring"
    case "Survey":
      return "Surveying"
    case "ExplorationTravel":
      return "Traveling"
    case "FarTravel":
      // Note: For dynamic labels like "Traveling (X hops)",
      // the caller should compute and pass the label
      return "Traveling"
    case "Move":
      return "Moving"
    case "Mine":
      return "Mining"
    case "Gather":
      return "Gathering"
    case "Chop":
      return "Chopping"
    case "Fight":
      return "Fighting"
    case "Craft":
      return "Crafting"
    case "Store":
      return "Storing"
    case "Drop":
      return "Dropping"
    case "Enrol":
      return "Enrolling"
    case "TravelToLocation":
      return "Traveling"
    case "Leave":
      return "Leaving"
    case "AcceptContract":
      return "Accepting contract"
    case "TurnInCombatToken":
      return "Turning in token"
    default:
      return "Working"
  }
}
```

### Step 2: Create a generic animated action executor

Add a new exported function in `src/interactive.ts`:

```typescript
// src/interactive.ts

import { executeAction } from "./engine.js"

/**
 * Execute any action with animation (for TTY mode)
 * This is the generic entry point for all animated actions.
 *
 * @param state - The world state
 * @param action - The action to execute
 * @param options - Optional overrides for label, tickDelay, etc.
 * @returns The action log
 */
export async function executeAnimatedAction(
  state: WorldState,
  action: Action,
  options: { label?: string; tickDelay?: number } = {}
): Promise<ActionLog> {
  const label = options.label ?? getActionLabel(action)
  const tickDelay = options.tickDelay ?? 100

  // Get the generator for this action
  const generator = getActionGenerator(state, action)

  // Set up cancellation (only for multi-tick actions that support it)
  // For now, we won't set up cancellation for most actions - just animate them
  const { log } = await runAnimatedAction(generator, {
    label,
    tickDelay,
    // No checkCancel for now - can add later for specific actions
  })

  return log
}

/**
 * Get the action generator for any action type.
 * This replicates the switch in executeAction but returns the generator instead of completing it.
 */
function getActionGenerator(state: WorldState, action: Action): ActionGenerator {
  switch (action.type) {
    case "Move":
      return executeExplorationTravel(state, {
        type: "ExplorationTravel",
        destinationAreaId: action.destination,
      })
    case "AcceptContract":
      return executeAcceptContract(state, action)
    case "Gather":
      return executeGather(state, action)
    case "Mine":
      return executeMine(state, action)
    case "Chop":
      return executeChop(state, action)
    case "Fight":
      return executeFight(state, action)
    case "Craft":
      return executeCraft(state, action)
    case "Store":
      return executeStore(state, action)
    case "Drop":
      return executeDrop(state, action)
    case "Enrol":
      return executeGuildEnrolment(state, action)
    case "TurnInCombatToken":
      return executeTurnInCombatToken(state, action)
    case "Survey":
      return executeSurvey(state, action)
    case "Explore":
      return executeExplore(state, action)
    case "ExplorationTravel":
      return executeExplorationTravel(state, action)
    case "FarTravel":
      return executeFarTravel(state, action)
    case "TravelToLocation":
      return executeTravelToLocation(state, action)
    case "Leave":
      return executeLeave(state, action)
  }
}
```

**Important**: You'll need to import all the execute* functions. These are currently only imported in `engine.ts`. Consider:
- Option A: Export them from `engine.ts` and import in `interactive.ts`
- Option B: Create a new `src/executors.ts` file that exports all generators
- Option C: Move `getActionGenerator` to `engine.ts` and export it

**Recommendation**: Option A is simplest - just add exports to `engine.ts` for the execute* generators that aren't already exported.

### Step 3: Handle 0-tick actions gracefully

Modify `runAnimatedAction()` in `src/interactive.ts` to handle 0-tick actions:

```typescript
export async function runAnimatedAction(
  generator: ActionGenerator,
  options: AnimationOptions = {}
): Promise<AnimationResult> {
  const { tickDelay = 100, label, checkCancel } = options

  // Don't print label yet - wait to see if there are any ticks
  let labelPrinted = false
  let ticksCompleted = 0
  let lastLog: ActionLog | null = null

  for await (const tick of generator) {
    if (tick.done) {
      lastLog = tick.log
      break
    }

    // Print label on first tick (skip for 0-tick actions)
    if (!labelPrinted && label) {
      process.stdout.write(`\n${label}`)
      labelPrinted = true
    }

    // Show dot
    process.stdout.write(".")
    ticksCompleted++

    // Show feedback if any
    if (tick.feedback) {
      const feedbackStr = formatTickFeedback(tick.feedback)
      if (feedbackStr) {
        process.stdout.write(` ${feedbackStr}`)
      }
    }

    // Check for cancellation
    if (checkCancel?.()) {
      process.stdout.write("\n")
      const cancelledLog: ActionLog = {
        tickBefore: 0,
        actionType: "Drop",
        parameters: {},
        success: false,
        failureType: "WRONG_LOCATION",
        timeConsumed: ticksCompleted,
        rngRolls: [],
        stateDeltaSummary: `Action cancelled after ${ticksCompleted} ticks`,
      }
      return { log: cancelledLog, cancelled: true, ticksCompleted }
    }

    // Animation delay
    await setTimeout(tickDelay)
  }

  // Only print newline if we printed something
  if (labelPrinted) {
    process.stdout.write("\n")
  }

  return {
    log: lastLog!,
    cancelled: false,
    ticksCompleted,
  }
}
```

### Step 4: Modify runner.ts to use animations for all actions

Replace the current action execution logic in `src/runner.ts`. Find the section around lines 1366-1435 and refactor:

**Before** (current code):
```typescript
// Handle interactive exploration (Explore and Survey) - only in TTY mode
if ((action.type === "Explore" || action.type === "Survey") && process.stdin.isTTY) {
  // ... special handling for Explore/Survey
}

// Handle interactive travel - only in TTY mode
if ((action.type === "ExplorationTravel" || action.type === "FarTravel") && process.stdin.isTTY) {
  // ... special handling for Travel
}

// Execute the action (non-interactive mode or non-Explore/Survey actions)
const log = await executeAction(session.state, action)
```

**After** (new code):
```typescript
// In TTY mode, use animated execution for ALL actions
if (process.stdin.isTTY) {
  config.onBeforeInteractive?.()

  try {
    // Import animation function dynamically
    const { executeAnimatedAction } = await import("./interactive.js")

    // Execute with animation
    const log = await executeAnimatedAction(session.state, action)
    session.stats.logs.push(log)
    config.onActionComplete(log, session.state)
  } finally {
    config.onAfterInteractive?.()
  }

  // Auto-save after action
  writeSave(seed, session)
  continue
}

// Non-TTY mode: execute without animation (for scripts, CI, etc.)
const log = await executeAction(session.state, action)
session.stats.logs.push(log)
config.onActionComplete(log, session.state)
writeSave(seed, session)
```

### Step 5: Handle special cases for Explore/Survey interactive loops

The current `interactiveExplore()` and `interactiveSurvey()` functions do more than just animate - they also:
- Loop until area is exhausted
- Prompt user to continue
- Show warnings about hard discoveries

**Decision point**: Keep these special interactive loops for Explore/Survey, but use the generic animation for single executions.

Option A (recommended): Keep the existing interactive* functions for Explore/Survey, use generic animation for everything else.

```typescript
// In runner.ts
if (process.stdin.isTTY) {
  config.onBeforeInteractive?.()

  try {
    if (action.type === "Explore") {
      const { interactiveExplore } = await import("./interactive.js")
      const logs = await interactiveExplore(session.state)
      for (const log of logs) session.stats.logs.push(log)
    } else if (action.type === "Survey") {
      const { interactiveSurvey } = await import("./interactive.js")
      const logs = await interactiveSurvey(session.state)
      for (const log of logs) session.stats.logs.push(log)
    } else if (action.type === "ExplorationTravel") {
      const { interactiveExplorationTravel } = await import("./interactive.js")
      const logs = await interactiveExplorationTravel(session.state, action)
      for (const log of logs) session.stats.logs.push(log)
    } else if (action.type === "FarTravel") {
      const { interactiveFarTravel } = await import("./interactive.js")
      const logs = await interactiveFarTravel(session.state, action)
      for (const log of logs) session.stats.logs.push(log)
    } else {
      // All other actions: use generic animation
      const { executeAnimatedAction } = await import("./interactive.js")
      const log = await executeAnimatedAction(session.state, action)
      session.stats.logs.push(log)
      config.onActionComplete(log, session.state)
    }
  } finally {
    config.onAfterInteractive?.()
  }

  writeSave(seed, session)
  continue
}
```

### Step 6: Export required generators from engine.ts

Add exports for all the execute* generator functions that `interactive.ts` needs:

```typescript
// At the end of src/engine.ts, add exports:

export {
  executeAcceptContract,
  executeGather,
  executeMine,
  executeChop,
  executeFight,
  executeCraft,
  executeStore,
  executeDrop,
  executeGuildEnrolment,
  executeTurnInCombatToken,
  executeTravelToLocation,
  executeLeave,
}

// Note: executeSurvey, executeExplore, executeExplorationTravel, executeFarTravel
// are already exported from exploration.ts
```

### Step 7: Add imports to interactive.ts

```typescript
// src/interactive.ts - add these imports

import {
  executeAcceptContract,
  executeGather,
  executeMine,
  executeChop,
  executeFight,
  executeCraft,
  executeStore,
  executeDrop,
  executeGuildEnrolment,
  executeTurnInCombatToken,
  executeTravelToLocation,
  executeLeave,
} from "./engine.js"

import type { Action } from "./types.js"
```

## Testing

### Manual Testing Checklist

Test each action type to verify animation appears:

1. **0-tick actions** (should complete instantly, no dots):
   - [ ] `store <item>` - Should complete with no animation
   - [ ] `accept <contract>` - Should complete with no animation
   - [ ] `turnin` - Should complete with no animation

2. **1-tick actions** (should show 1 dot):
   - [ ] `drop <item>` - Should show "Dropping."
   - [ ] `leave` - Should show "Leaving."
   - [ ] `travel <location>` - Should show "Traveling."

3. **3-tick actions**:
   - [ ] `enrol` - Should show "Enrolling..."

4. **Variable-tick actions** (should show multiple dots):
   - [ ] `mine` - Should show "Mining....."
   - [ ] `mine focus <material>` - Should show "Mining..."
   - [ ] `chop` - Should show "Chopping....."
   - [ ] `gather` - Should show "Gathering....."
   - [ ] `craft <recipe>` - Should show "Crafting....."
   - [ ] `fight` - Should show "Fighting....." with damage feedback

5. **Already-animated actions** (should still work):
   - [ ] `explore` - Should show "Exploring....." with loop
   - [ ] `survey` - Should show "Surveying....." with loop
   - [ ] `go <area>` - Should show "Traveling....."
   - [ ] `far <area>` - Should show "Traveling (X hops)....."

### Automated Tests

No new unit tests required - the animation is purely a presentation layer concern. The existing engine tests verify action execution logic.

However, consider adding integration tests if you have a test harness for CLI output.

## Edge Cases to Handle

1. **Failed preconditions**: If an action fails preconditions (e.g., wrong location), it should NOT show the animation label - just show the error. The current `runAnimatedAction` handles this by only printing label on first tick.

2. **Non-TTY mode**: Scripts and CI should not see animations. The `process.stdin.isTTY` check ensures this.

3. **Tick feedback**: Combat and gathering have mid-tick feedback (damage dealt, items gathered). The `formatTickFeedback()` function already handles this - ensure it's called for all animated actions.

4. **Cancellation**: Currently only Explore/Survey/Travel support Ctrl+C cancellation. For the initial implementation, don't add cancellation to other actions. Can be added later if desired.

## Files to Modify

1. **`src/interactive.ts`**:
   - Add `getActionLabel()` function
   - Add `executeAnimatedAction()` function
   - Add `getActionGenerator()` helper function
   - Modify `runAnimatedAction()` to handle 0-tick actions gracefully
   - Add imports for all execute* generators

2. **`src/engine.ts`**:
   - Export the execute* generator functions (currently private)

3. **`src/runner.ts`**:
   - Refactor lines 1366-1435 to use generic animation for all actions in TTY mode
   - Keep special handling for Explore/Survey interactive loops

## Estimated Complexity

- **Engine changes**: Low - just adding exports
- **Interactive changes**: Medium - new functions + modify runAnimatedAction
- **Runner changes**: Medium - refactor action execution flow
- **Testing**: Low - mostly manual verification

## Rollback Plan

If issues arise, revert to the current behavior by:
1. Removing the TTY branch in runner.ts
2. Keep using `executeAction()` for all non-Explore/Survey actions

The existing interactive* functions remain unchanged and continue to work.
