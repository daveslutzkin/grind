# Implementation Plan: Tick Animation for All Actions

## Overview

Refactor the action execution system so that **every action** goes through a unified tick-by-tick animation system. Currently, only Explore/Survey/Travel have animations. After this change, all actions (Gather, Fight, Craft, Drop, Enrol, etc.) will show animated progress with per-tick feedback.

## Design Decisions (Already Established)

1. **Generator pattern** - Actions become async generators that yield once per tick
2. **Yield per tick** - A 5-tick action yields 5 times; a 0-tick action yields 0 times
3. **Structured feedback** - Ticks carry structured data, UI layer formats for display
4. **Cancellable** - All actions can be cancelled mid-execution by breaking from the loop
5. **Preconditions fail fast** - Invalid actions throw/fail immediately before yielding any ticks
6. **Final tick includes ActionLog** - Discriminated union: regular ticks vs done tick with log

## Type Definitions

### File: `src/types.ts`

Add these new types:

```typescript
// ============================================================================
// Action Tick Types (for generator-based execution)
// ============================================================================

/**
 * Structured feedback that can occur during a tick.
 * UI layer formats these for display.
 */
export interface TickFeedback {
  // Combat feedback
  damage?: { target: 'player' | 'enemy'; amount: number; enemyHpRemaining?: number; playerHpRemaining?: number }
  combatMiss?: { attacker: 'player' | 'enemy' }
  combatVictory?: { enemyId: string }
  combatDefeat?: { enemyId: string }

  // Gathering feedback
  gathered?: { itemId: string; quantity: number }
  gatheringComplete?: { nodeId: string; totalItems: Array<{ itemId: string; quantity: number }> }

  // Exploration feedback (migrate from current system)
  discovered?: {
    type: 'location' | 'connection' | 'area'
    name: string
    id: string
  }

  // Crafting feedback
  crafted?: { itemId: string; quantity: number }
  materialsConsumed?: Array<{ itemId: string; quantity: number }>

  // General feedback
  xpGained?: { skill: SkillID; amount: number }
  message?: string  // Fallback for simple messages
}

/**
 * A single tick yielded by an action generator.
 * Discriminated union: either an in-progress tick or the final done tick.
 */
export type ActionTick =
  | { done: false; feedback?: TickFeedback }
  | { done: true; log: ActionLog }

/**
 * The generator type returned by action executors.
 */
export type ActionGenerator = AsyncGenerator<ActionTick, void, undefined>
```

## Action Executor Refactoring

### General Pattern

Each action executor changes from:

```typescript
export async function executeGather(state: WorldState, action: GatherAction): Promise<ActionLog> {
  // ... validation ...
  // ... all execution ...
  return actionLog
}
```

To:

```typescript
export async function* executeGather(state: WorldState, action: GatherAction): ActionGenerator {
  // ... validation (throw or return early with error yield if invalid) ...

  // For each tick of work:
  for (let tick = 0; tick < totalTicks; tick++) {
    consumeTime(state, 1)
    // ... do one tick of work ...
    yield { done: false, feedback: { /* tick feedback */ } }
  }

  // Final tick with complete ActionLog
  yield { done: true, log: actionLog }
}
```

### File: `src/engine.ts`

Refactor each action executor. Here's the mapping of actions to their tick counts and feedback:

#### 1. `executeGather` (1, 5, or 10 ticks depending on mode)

- **APPRAISE mode (1 tick)**: Yield once with node contents info
- **FOCUS mode (5 ticks)**: Yield 5 times, final tick shows what was gathered
- **CAREFUL_ALL mode (10 ticks)**: Yield 10 times, can show progressive gathering

```typescript
export async function* executeGather(state: WorldState, action: GatherAction): ActionGenerator {
  // Precondition checks (fail fast - no yields)
  const check = checkGather(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog('Gather', check.reason, 0) }
    return
  }

  const totalTicks = getGatherTicks(action.mode) // 1, 5, or 10

  // Execute tick by tick
  for (let tick = 0; tick < totalTicks; tick++) {
    consumeTime(state, 1)

    // On final tick, do the actual gathering logic
    if (tick === totalTicks - 1) {
      const result = performGather(state, action) // mutates state, returns what was gathered
      yield {
        done: false,
        feedback: { gathered: result.items[0] } // or gatheringComplete for CAREFUL_ALL
      }
    } else {
      yield { done: false } // intermediate tick, just a dot
    }
  }

  yield { done: true, log: buildGatherLog(...) }
}
```

#### 2. `executeFight` (2 or 3 ticks depending on weapon)

Combat is more complex - each tick is a round of combat with rolls.

```typescript
export async function* executeFight(state: WorldState, action: FightAction): ActionGenerator {
  // Precondition checks
  const check = checkFight(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog('Fight', check.reason, 0) }
    return
  }

  const ticksPerRound = getWeaponSpeed(state) // 2 or 3
  let enemyHp = getEnemyHp(action.enemyId)
  let playerHp = state.player.hp

  while (enemyHp > 0 && playerHp > 0) {
    consumeTime(state, ticksPerRound)

    // Player attacks
    const playerHit = rollCombat(state, 'player')
    if (playerHit) {
      const damage = rollDamage(state, 'player')
      enemyHp -= damage
      yield { done: false, feedback: { damage: { target: 'enemy', amount: damage, enemyHpRemaining: enemyHp } } }
    } else {
      yield { done: false, feedback: { combatMiss: { attacker: 'player' } } }
    }

    if (enemyHp <= 0) break

    // Enemy attacks (if still alive)
    const enemyHit = rollCombat(state, 'enemy')
    if (enemyHit) {
      const damage = rollDamage(state, 'enemy')
      playerHp -= damage
      yield { done: false, feedback: { damage: { target: 'player', amount: damage, playerHpRemaining: playerHp } } }
    }
  }

  // Victory or defeat
  if (enemyHp <= 0) {
    yield { done: false, feedback: { combatVictory: { enemyId: action.enemyId } } }
  } else {
    yield { done: false, feedback: { combatDefeat: { enemyId: action.enemyId } } }
  }

  yield { done: true, log: buildFightLog(...) }
}
```

#### 3. `executeCraft` (variable ticks from recipe.craftTime)

```typescript
export async function* executeCraft(state: WorldState, action: CraftAction): ActionGenerator {
  const check = checkCraft(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog('Craft', check.reason, 0) }
    return
  }

  const recipe = getRecipe(action.recipeId)
  const totalTicks = recipe.craftTime

  // Consume materials on first tick
  consumeMaterials(state, recipe)

  for (let tick = 0; tick < totalTicks; tick++) {
    consumeTime(state, 1)

    if (tick === 0) {
      yield { done: false, feedback: { materialsConsumed: recipe.inputs } }
    } else if (tick === totalTicks - 1) {
      addItemToInventory(state, recipe.output)
      yield { done: false, feedback: { crafted: recipe.output } }
    } else {
      yield { done: false }
    }
  }

  yield { done: true, log: buildCraftLog(...) }
}
```

#### 4. `executeDrop` (1 tick)

```typescript
export async function* executeDrop(state: WorldState, action: DropAction): ActionGenerator {
  const check = checkDrop(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog('Drop', check.reason, 0) }
    return
  }

  consumeTime(state, 1)
  removeFromInventory(state, action.itemId, action.quantity)

  yield { done: false, feedback: { message: `Dropped ${action.quantity}x ${action.itemId}` } }
  yield { done: true, log: buildDropLog(...) }
}
```

#### 5. `executeEnrol` (3 ticks)

```typescript
export async function* executeEnrol(state: WorldState, action: EnrolAction): ActionGenerator {
  const check = checkEnrol(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog('Enrol', check.reason, 0) }
    return
  }

  for (let tick = 0; tick < 3; tick++) {
    consumeTime(state, 1)
    yield { done: false }
  }

  unlockSkill(state, action.skill)
  yield { done: false, feedback: { message: `Enrolled in ${action.skill} guild!` } }
  yield { done: true, log: buildEnrolLog(...) }
}
```

#### 6. `executeStore` (0 ticks)

```typescript
export async function* executeStore(state: WorldState, action: StoreAction): ActionGenerator {
  const check = checkStore(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog('Store', check.reason, 0) }
    return
  }

  // 0 ticks - no intermediate yields, just the done tick
  moveToStorage(state, action.itemId, action.quantity)

  yield { done: true, log: buildStoreLog(...) }
}
```

#### 7. `executeAcceptContract` (0 ticks)

```typescript
export async function* executeAcceptContract(state: WorldState, action: AcceptContractAction): ActionGenerator {
  const check = checkAcceptContract(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog('AcceptContract', check.reason, 0) }
    return
  }

  // 0 ticks - immediate
  acceptContract(state, action.contractId)

  yield { done: true, log: buildAcceptContractLog(...) }
}
```

#### 8. `executeTurnInCombatToken` (0 ticks)

```typescript
export async function* executeTurnInCombatToken(state: WorldState, action: TurnInCombatTokenAction): ActionGenerator {
  const check = checkTurnInCombatToken(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog('TurnInCombatToken', check.reason, 0) }
    return
  }

  // 0 ticks - immediate
  turnInToken(state, action.tokenId)

  yield { done: true, log: buildTurnInLog(...) }
}
```

#### 9. `executeTravelToLocation` (0 or 1 tick depending on area type)

```typescript
export async function* executeTravelToLocation(state: WorldState, action: TravelToLocationAction): ActionGenerator {
  const check = checkTravelToLocation(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog('TravelToLocation', check.reason, 0) }
    return
  }

  const ticks = isInTown(state) ? 0 : 1

  if (ticks > 0) {
    consumeTime(state, 1)
    yield { done: false }
  }

  moveToLocation(state, action.locationId)

  yield { done: true, log: buildTravelToLocationLog(...) }
}
```

#### 10. `executeLeave` (0 or 1 tick depending on area type)

```typescript
export async function* executeLeave(state: WorldState, action: LeaveAction): ActionGenerator {
  const check = checkLeave(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog('Leave', check.reason, 0) }
    return
  }

  const ticks = isInTown(state) ? 0 : 1

  if (ticks > 0) {
    consumeTime(state, 1)
    yield { done: false }
  }

  leaveLocation(state)

  yield { done: true, log: buildLeaveLog(...) }
}
```

### File: `src/exploration.ts`

Refactor the exploration actions. These already have variable tick counts from RNG, so they naturally fit the generator pattern.

#### 11. `executeExplore` (variable ticks)

```typescript
export async function* executeExplore(state: WorldState, action: ExploreAction): ActionGenerator {
  const check = checkExplore(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog('Explore', check.reason, 0) }
    return
  }

  // Build discoverables, get roll interval
  const { discoverables, baseChance } = buildDiscoverables(state, currentArea)
  const rollInterval = getRollInterval(level)

  let ticksConsumed = 0
  let discovered = null

  while (!discovered && state.time.sessionRemainingTicks > 0) {
    consumeTime(state, rollInterval)
    ticksConsumed += rollInterval

    // Roll for discovery
    discovered = rollForDiscovery(state, discoverables)

    // Yield one tick per rollInterval
    for (let i = 0; i < rollInterval; i++) {
      if (discovered && i === rollInterval - 1) {
        yield { done: false, feedback: { discovered: { type: 'location', name: discovered.name, id: discovered.id } } }
      } else {
        yield { done: false }
      }
    }
  }

  yield { done: true, log: buildExploreLog(...) }
}
```

#### 12. `executeSurvey` (variable ticks)

Similar structure to executeExplore.

#### 13. `executeExplorationTravel` (variable ticks based on connection)

```typescript
export async function* executeExplorationTravel(state: WorldState, action: ExplorationTravelAction): ActionGenerator {
  const check = checkExplorationTravel(state, action)
  if (!check.valid) {
    yield { done: true, log: createFailureLog('ExplorationTravel', check.reason, 0) }
    return
  }

  const connection = getConnection(state, action.destinationAreaId)
  let travelTime = BASE_TRAVEL_TIME * connection.travelTimeMultiplier
  if (action.scavenge) travelTime *= 2

  for (let tick = 0; tick < travelTime; tick++) {
    consumeTime(state, 1)
    yield { done: false }
  }

  moveToArea(state, action.destinationAreaId)

  yield { done: true, log: buildTravelLog(...) }
}
```

#### 14. `executeFarTravel` (variable ticks based on path)

Similar structure - yield once per tick of the total travel time.

## Unified Action Executor

### File: `src/engine.ts`

Update the main `executeAction` function to be a generator that delegates:

```typescript
export async function* executeAction(state: WorldState, action: Action): ActionGenerator {
  switch (action.type) {
    case 'Gather':
      yield* executeGather(state, action)
      break
    case 'Fight':
      yield* executeFight(state, action)
      break
    case 'Craft':
      yield* executeCraft(state, action)
      break
    // ... etc for all action types
    default:
      throw new Error(`Unknown action type: ${(action as Action).type}`)
  }
}
```

## Animation Runner

### File: `src/interactive.ts`

Create a unified animation runner that consumes any action generator:

```typescript
export interface AnimationOptions {
  /** Milliseconds per tick for animation (default: 100) */
  tickDelay?: number
  /** Label to show before animation starts (e.g., "Gathering", "Fighting") */
  label?: string
  /** Callback to check if user wants to cancel */
  checkCancel?: () => boolean
}

/**
 * Run an action with animated tick-by-tick display.
 * Returns the final ActionLog, or null if cancelled.
 */
export async function runAnimatedAction(
  generator: ActionGenerator,
  options: AnimationOptions = {}
): Promise<{ log: ActionLog; cancelled: boolean; ticksCompleted: number }> {
  const { tickDelay = 100, label, checkCancel } = options

  if (label) {
    process.stdout.write(`\n${label}`)
  }

  let ticksCompleted = 0
  let lastLog: ActionLog | null = null

  for await (const tick of generator) {
    if (tick.done) {
      lastLog = tick.log
      break
    }

    // Show dot
    process.stdout.write('.')
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
      process.stdout.write('\n')
      return { log: createCancelledLog(ticksCompleted), cancelled: true, ticksCompleted }
    }

    // Animation delay
    await delay(tickDelay)
  }

  process.stdout.write('\n')

  return {
    log: lastLog!,
    cancelled: false,
    ticksCompleted
  }
}

/**
 * Set up cancellation detection (listen for keypress).
 * Returns a checkCancel function and a cleanup function.
 */
export function setupCancellation(): { checkCancel: () => boolean; cleanup: () => void } {
  let cancelled = false

  const handler = () => {
    cancelled = true
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', handler)
  }

  return {
    checkCancel: () => cancelled,
    cleanup: () => {
      if (process.stdin.isTTY) {
        process.stdin.removeListener('data', handler)
        process.stdin.setRawMode(false)
        process.stdin.pause()
      }
    }
  }
}
```

## Tick Feedback Formatter

### File: `src/agent/formatters.ts`

Add a function to format tick feedback for display:

```typescript
export function formatTickFeedback(feedback: TickFeedback): string | null {
  if (feedback.damage) {
    const { target, amount, enemyHpRemaining, playerHpRemaining } = feedback.damage
    if (target === 'enemy') {
      return `(-${amount} enemy${enemyHpRemaining !== undefined ? `, ${enemyHpRemaining} HP left` : ''})`
    } else {
      return `(-${amount} you${playerHpRemaining !== undefined ? `, ${playerHpRemaining} HP left` : ''})`
    }
  }

  if (feedback.combatMiss) {
    return feedback.combatMiss.attacker === 'player' ? '(miss)' : '(dodged)'
  }

  if (feedback.combatVictory) {
    return `Victory!`
  }

  if (feedback.combatDefeat) {
    return `Defeated!`
  }

  if (feedback.gathered) {
    return `(+${feedback.gathered.quantity} ${feedback.gathered.itemId})`
  }

  if (feedback.crafted) {
    return `(+${feedback.crafted.quantity} ${feedback.crafted.itemId})`
  }

  if (feedback.discovered) {
    return `Found ${feedback.discovered.name}!`
  }

  if (feedback.xpGained) {
    return `(+${feedback.xpGained.amount} ${feedback.xpGained.skill} XP)`
  }

  if (feedback.message) {
    return feedback.message
  }

  return null
}
```

## Runner Integration

### File: `src/runner.ts`

Update `runSession` to use the animated action runner for ALL actions:

```typescript
// In runSession(), replace the special-casing for Explore/Survey/Travel
// with a unified approach:

// OLD:
if ((action.type === "Explore" || action.type === "Survey") && process.stdin.isTTY) {
  // special interactive handling...
}
// Execute the action (non-interactive mode or non-Explore/Survey actions)
const log = await executeAction(session.state, action)

// NEW:
const generator = executeAction(session.state, action)

if (process.stdin.isTTY) {
  // Interactive mode - animate all actions
  const label = getActionLabel(action) // "Gathering", "Fighting", etc.
  const { checkCancel, cleanup } = setupCancellation()

  config.onBeforeInteractive?.()

  try {
    const result = await runAnimatedAction(generator, { label, checkCancel })
    session.stats.logs.push(result.log)

    if (result.cancelled) {
      console.log(`Action cancelled after ${result.ticksCompleted}t`)
    } else {
      config.onActionComplete(result.log, session.state)
    }
  } finally {
    cleanup()
    config.onAfterInteractive?.()
  }
} else {
  // Non-interactive mode - run without animation
  const log = await runWithoutAnimation(generator)
  session.stats.logs.push(log)
  config.onActionComplete(log, session.state)
}
```

Add helper functions:

```typescript
function getActionLabel(action: Action): string {
  switch (action.type) {
    case 'Gather': return 'Gathering'
    case 'Mine': return 'Mining'
    case 'Chop': return 'Chopping'
    case 'Fight': return 'Fighting'
    case 'Craft': return 'Crafting'
    case 'Explore': return 'Exploring'
    case 'Survey': return 'Surveying'
    case 'ExplorationTravel':
    case 'FarTravel': return 'Traveling'
    case 'Enrol': return 'Enrolling'
    case 'Drop': return 'Dropping'
    case 'TravelToLocation': return 'Moving'
    case 'Leave': return 'Leaving'
    // 0-tick actions won't show labels since they don't animate
    default: return action.type
  }
}

async function runWithoutAnimation(generator: ActionGenerator): Promise<ActionLog> {
  let lastLog: ActionLog | null = null

  for await (const tick of generator) {
    if (tick.done) {
      lastLog = tick.log
    }
  }

  return lastLog!
}
```

## Remove Old Interactive Functions

### File: `src/interactive.ts`

Remove or deprecate these functions that are replaced by the unified system:
- `interactiveExplore` - replaced by unified runAnimatedAction
- `interactiveSurvey` - replaced by unified runAnimatedAction
- `interactiveExplorationTravel` - replaced by unified runAnimatedAction
- `interactiveFarTravel` - replaced by unified runAnimatedAction
- `animateDiscovery` - replaced by runAnimatedAction
- `shadowRollExplore` - no longer needed (we execute for real tick-by-tick)
- `shadowRollSurvey` - no longer needed

Keep:
- `promptYesNo` - still useful for "Continue exploring?" prompts
- `analyzeRemainingDiscoveries` - still useful for warnings about hard discoveries

## Explore/Survey Loop Handling

The current system has a "Continue exploring?" loop. This needs to work with the new system:

```typescript
// In runner.ts, for Explore/Survey actions:
if (action.type === 'Explore' || action.type === 'Survey') {
  // Run in a loop until user stops or area exhausted
  while (true) {
    const generator = executeAction(session.state, action)
    const result = await runAnimatedAction(generator, { label: action.type === 'Explore' ? 'Exploring' : 'Surveying', checkCancel })

    if (result.cancelled) {
      console.log(`Cancelled after ${result.ticksCompleted}t`)
      break
    }

    session.stats.logs.push(result.log)
    console.log(formatActionLog(result.log, session.state))

    // Check if more to discover
    if (!hasMoreToDiscover(session.state, action.type)) {
      console.log('\n✓ Fully explored!')
      break
    }

    // Prompt to continue
    const shouldContinue = await promptYesNo('\nContinue?')
    if (!shouldContinue) break
  }
}
```

## Testing Updates

### File: `src/engine.test.ts` (and other test files)

Update tests to work with generators. Create a test helper:

```typescript
async function executeToCompletion(generator: ActionGenerator): Promise<ActionLog> {
  let log: ActionLog | null = null
  for await (const tick of generator) {
    if (tick.done) {
      log = tick.log
    }
  }
  return log!
}

// Usage in tests:
it('should gather materials', async () => {
  const generator = executeGather(state, { type: 'Gather', nodeId: 'node1', mode: GatherMode.FOCUS, focusMaterialId: 'IRON_ORE' })
  const log = await executeToCompletion(generator)
  expect(log.success).toBe(true)
})
```

Also add tests for:
- Cancellation mid-action
- Correct number of ticks yielded
- Feedback content at appropriate ticks

## Implementation Order

1. **Phase 1: Types**
   - Add ActionTick, TickFeedback types to types.ts
   - Add ActionGenerator type alias

2. **Phase 2: Simple Actions First**
   - Convert executeDrop (1 tick, simple)
   - Convert executeStore (0 ticks)
   - Convert executeAcceptContract (0 ticks)
   - Convert executeEnrol (3 ticks)
   - Convert executeTravelToLocation (0-1 tick)
   - Convert executeLeave (0-1 tick)
   - Update tests for each

3. **Phase 3: Complex Actions**
   - Convert executeGather (1/5/10 ticks, modes)
   - Convert executeCraft (variable ticks)
   - Convert executeFight (combat loop)
   - Update tests for each

4. **Phase 4: Exploration Actions**
   - Convert executeExplore (RNG-based)
   - Convert executeSurvey (RNG-based)
   - Convert executeExplorationTravel (variable)
   - Convert executeFarTravel (path-based)
   - Remove shadow rolling functions
   - Update tests

5. **Phase 5: Animation Runner**
   - Create runAnimatedAction in interactive.ts
   - Create setupCancellation
   - Create formatTickFeedback in formatters.ts
   - Remove old interactive functions

6. **Phase 6: Runner Integration**
   - Update runSession to use unified animation
   - Add getActionLabel helper
   - Handle explore/survey loops
   - Test full interactive flow

7. **Phase 7: Cleanup**
   - Remove dead code
   - Update any remaining tests
   - Run full test suite
   - Manual testing of interactive mode

## Edge Cases to Handle

1. **0-tick actions**: Should not show any dots, just execute and show result
2. **Session time running out mid-action**: Need to handle gracefully
3. **Cancellation on final tick**: Should still complete (already did the work)
4. **Non-TTY mode**: No animation, no cancellation, just run to completion
5. **Explore/Survey with no discoverables**: Fail fast, no ticks

## Migration Notes

- The existing `executeAction` function signature changes from `Promise<ActionLog>` to `ActionGenerator`
- All callers of `executeAction` need updating
- The agent runner (`src/agent/`) will need updates to consume generators
- Batch mode should work by just iterating without delays

## Success Criteria

- [ ] All actions use generator pattern
- [ ] All actions show animated progress in TTY mode
- [ ] All actions can be cancelled mid-execution
- [ ] 0-tick actions work correctly (no animation)
- [ ] Explore/Survey loop still works with continue prompts
- [ ] Non-TTY/batch mode works without animation
- [ ] All existing tests pass (with updates)
- [ ] No shadow rolling - real execution is the animation
