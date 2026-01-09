# Test Coverage Improvement Plan

**Date**: 2026-01-09
**Current Estimated Coverage**: 45-50%
**Target Coverage**: 80%+

---

## Priority 1: CRITICAL - Core Validation & State Logic

### 1.1 Create `src/__tests__/actionChecks.test.ts`

**File**: `src/actionChecks.ts` (695 lines, 35+ functions)
**Current Coverage**: 0% (no direct tests)
**Estimated Test Cases**: 150-200 tests

#### Test Groups:

##### **Inventory Helpers** (10-15 tests)
- `hasItems(state, items)`
  - ✓ Returns true when player has exact items
  - ✓ Returns false when missing any item
  - ✓ Handles empty items array
  - ✓ Checks both inventory and storage when includeStorage=true
  - ✓ Returns false when items only in storage and includeStorage=false
  - ✓ Handles items split across inventory and storage
  - ✓ Respects quantity requirements (partial stacks fail)

- `getInventorySlotCount(inventory)`
  - ✓ Returns 0 for empty inventory
  - ✓ Counts non-null slots correctly
  - ✓ Returns correct count for full inventory
  - ✓ Handles sparse arrays correctly

- `canFitItems(state, items)`
  - ✓ Returns true when plenty of space
  - ✓ Returns false when inventory full
  - ✓ Handles exact fit scenarios
  - ✓ Accounts for stackable items with existing stacks
  - ✓ Handles unstackable items correctly
  - ✓ Tests with various INVENTORY_SIZE values

##### **Location Validation** (15-20 tests)
- `getLocationInCurrentArea(state, locationType)`
  - ✓ Returns location when it exists in current area
  - ✓ Returns undefined when location doesn't exist
  - ✓ Returns undefined when not in any area
  - ✓ Handles all LocationType enum values
  - ✓ Returns correct location when multiple locations exist

- `getCurrentLocation(state)`
  - ✓ Returns location when player at valid location
  - ✓ Returns undefined when player between locations
  - ✓ Returns undefined when player not in area

- `isAtGuildHallOfType(state, skillType)`
  - ✓ Returns true when at matching guild hall
  - ✓ Returns false when at different guild hall
  - ✓ Returns false when not at any guild hall
  - ✓ Returns false when between locations
  - ✓ Tests for each SkillType

- `getLocationDisplayName(location, world)`
  - ✓ Returns node name for gathering locations
  - ✓ Returns location type name for non-gathering locations
  - ✓ Handles warehouse, hub, guild hall types
  - ✓ Returns correct material names from nodes
  - ✓ Handles locations with no associated node

##### **Action Precondition Checks** (80-100 tests)

- `checkGatherAction(state, action, world)`
  - ✓ Succeeds when at valid gathering location
  - ✓ Fails when not at location
  - ✓ Fails when at wrong location type
  - ✓ Fails when inventory full
  - ✓ Fails when insufficient skill level
  - ✓ Fails when invalid gather mode for level
  - ✓ Fails when session time would exceed limit
  - ✓ Returns correct time cost for each mode
  - ✓ Tests all gather modes (normal, focused, reckless)
  - ✓ Edge case: exactly at inventory capacity
  - ✓ Edge case: exactly at time limit
  - ✓ Edge case: exactly at required skill level

- `checkFightAction(state, action, world)`
  - ✓ Succeeds when at valid combat location
  - ✓ Fails when not at location
  - ✓ Fails when at non-combat location
  - ✓ Fails when inventory full (for loot)
  - ✓ Fails when insufficient skill level
  - ✓ Fails when session time would exceed limit
  - ✓ Returns correct time cost
  - ✓ Edge cases similar to gather

- `checkCraftAction(state, action, world)`
  - ✓ Succeeds when at guild hall with required skill
  - ✓ Fails when not at guild hall
  - ✓ Fails when at wrong guild hall for craft
  - ✓ Fails when missing required items
  - ✓ Fails when items only in storage
  - ✓ Fails when inventory full (can't fit product)
  - ✓ Fails when insufficient skill level
  - ✓ Fails when session time would exceed limit
  - ✓ Returns correct time cost
  - ✓ Tests with various craft recipes
  - ✓ Tests with multi-input recipes
  - ✓ Edge case: exactly enough materials
  - ✓ Edge case: materials split across inventory slots

- `checkStoreAction(state, action)`
  - ✓ Succeeds when at warehouse with items
  - ✓ Fails when not at warehouse
  - ✓ Fails when storing items not in inventory
  - ✓ Fails when storing more than player has
  - ✓ Succeeds with partial inventory items
  - ✓ Returns correct time cost
  - ✓ Edge case: storing entire stack
  - ✓ Edge case: storing from multiple stacks

- `checkRetrieveAction(state, action)`
  - ✓ Succeeds when at warehouse with items in storage
  - ✓ Fails when not at warehouse
  - ✓ Fails when items not in storage
  - ✓ Fails when retrieving more than in storage
  - ✓ Fails when inventory full
  - ✓ Returns correct time cost
  - ✓ Edge cases similar to store

- `checkDropAction(state, action)`
  - ✓ Succeeds when player has items
  - ✓ Fails when items not in inventory
  - ✓ Fails when dropping more than player has
  - ✓ Returns correct time cost
  - ✓ Allows dropping anywhere (no location requirement)

- `checkAcceptContractAction(state, action, world)`
  - ✓ Succeeds when at hub with valid contract
  - ✓ Fails when not at hub
  - ✓ Fails when contract doesn't exist
  - ✓ Fails when already accepted contract
  - ✓ Fails when max contracts already accepted
  - ✓ Fails when can't fit rewards (inventory + storage)
  - ✓ Returns correct time cost
  - ✓ Edge case: exactly at max contracts
  - ✓ Edge case: rewards exactly fit

- `checkTurnInCombatTokenAction(state, action, world)`
  - ✓ Succeeds when at guild hall with tokens
  - ✓ Fails when not at guild hall
  - ✓ Fails when at wrong guild hall
  - ✓ Fails when no tokens to turn in
  - ✓ Fails when can't fit rewards
  - ✓ Returns correct time cost

- `checkGuildEnrolmentAction(state, action, world)`
  - ✓ Succeeds when at guild hall, not enrolled
  - ✓ Fails when not at guild hall
  - ✓ Fails when already enrolled
  - ✓ Fails when insufficient skill level
  - ✓ Returns correct time cost
  - ✓ Tests for each guild/skill type

- `checkTravelToLocationAction(state, action, world)`
  - ✓ Succeeds when traveling to valid location in area
  - ✓ Fails when location doesn't exist
  - ✓ Fails when already at location
  - ✓ Fails when not in any area
  - ✓ Fails when session time would exceed limit
  - ✓ Returns correct time cost based on distance
  - ✓ Edge cases: distance=0, distance=max
  - ✓ Handles all location types

- `checkLeaveAction(state, action, world)`
  - ✓ Succeeds when at hub
  - ✓ Fails when not at hub
  - ✓ Fails when not at any location
  - ✓ Returns correct time cost

- `checkSurveyAction(state, action, world)`
  - ✓ Succeeds when in area
  - ✓ Fails when not in area
  - ✓ Fails when session time would exceed limit
  - ✓ Returns correct time cost

- `checkExploreAction(state, action, world)`
  - ✓ Succeeds when in area
  - ✓ Fails when not in area
  - ✓ Fails when session time would exceed limit
  - ✓ Returns correct time cost

- `checkExplorationTravelAction(state, action, world)`
  - ✓ Succeeds when traveling to connected area
  - ✓ Fails when areas not connected
  - ✓ Fails when destination doesn't exist
  - ✓ Fails when not in origin area
  - ✓ Fails when session time would exceed limit
  - ✓ Returns correct time cost based on distance

- `checkAction(state, action, world)`
  - ✓ Routes to correct check function for each action type
  - ✓ Handles all ActionType enum values
  - ✓ Returns results from delegated check functions

##### **Mode & Unlock Logic** (15-20 tests)
- `getUnlockedModes(skillLevel)`
  - ✓ Returns ['normal'] at level 0
  - ✓ Returns ['normal', 'focused'] at level 5
  - ✓ Returns all modes at level 10
  - ✓ Returns all modes at level > 10
  - ✓ Edge cases: exactly at threshold levels

- `getNextModeUnlock(skillLevel)`
  - ✓ Returns correct next unlock at level 0-4
  - ✓ Returns correct next unlock at level 5-9
  - ✓ Returns null at level >= 10
  - ✓ Edge cases: exactly at unlock levels

- `getLocationSkillRequirement(location, world)`
  - ✓ Returns correct requirement for gathering locations
  - ✓ Returns correct requirement for combat locations
  - ✓ Returns 0 for non-skill locations (hub, warehouse)
  - ✓ Handles locations with no node
  - ✓ Tests with various difficulty levels

##### **Time Calculation** (10-15 tests)
- `getTimeCostForAction(state, action, world)`
  - ✓ Returns correct time for each action type
  - ✓ Handles gather action modes (normal, focused, reckless)
  - ✓ Returns correct fight time
  - ✓ Returns correct craft time
  - ✓ Returns correct travel time based on distance
  - ✓ Returns correct exploration travel time
  - ✓ Returns correct times for all other actions
  - ✓ Edge cases: zero distance travel, max distance

---

### 1.2 Create `src/__tests__/stateHelpers.test.ts`

**File**: `src/stateHelpers.ts` (264 lines, 13 functions)
**Current Coverage**: 0% (no direct tests)
**Estimated Test Cases**: 80-100 tests

#### Test Groups:

##### **Time Management** (5 tests)
- `consumeTime(state, ticks)`
  - ✓ Increments currentTick correctly
  - ✓ Increments sessionTicks correctly
  - ✓ Handles zero ticks
  - ✓ Handles large tick values
  - ✓ Mutates state in place

##### **Inventory Management** (25-30 tests)
- `addToInventory(state, items)`
  - ✓ Adds item to empty slot
  - ✓ Stacks with existing items
  - ✓ Adds multiple items to separate slots
  - ✓ Fills inventory to capacity
  - ✓ Handles adding to full inventory (should error or fail gracefully)
  - ✓ Respects stack limits
  - ✓ Adds unstackable items correctly
  - ✓ Preserves existing inventory items
  - ✓ Mutates state in place
  - ✓ Edge case: adding empty items array
  - ✓ Edge case: adding exactly to fill inventory

- `removeFromInventory(state, items)`
  - ✓ Removes exact item from inventory
  - ✓ Removes partial stack (decrements count)
  - ✓ Removes entire stack (nulls slot)
  - ✓ Removes multiple different items
  - ✓ Removes items from multiple slots
  - ✓ Handles removing more than exists (error case)
  - ✓ Handles removing item not in inventory (error case)
  - ✓ Preserves other inventory items
  - ✓ Mutates state in place
  - ✓ Edge case: removing from single-item stack

##### **Storage Management** (15-20 tests)
- `addToStorage(state, items)`
  - ✓ Adds item to empty storage
  - ✓ Stacks with existing items in storage
  - ✓ Adds multiple items
  - ✓ No capacity limit (grows indefinitely)
  - ✓ Handles adding to empty storage map
  - ✓ Mutates state in place
  - ✓ Edge case: adding many items

- `removeFromStorage(state, items)`
  - ✓ Removes exact item from storage
  - ✓ Removes partial amount (decrements count)
  - ✓ Removes entire amount (removes from map)
  - ✓ Removes multiple different items
  - ✓ Handles removing more than exists (error case)
  - ✓ Handles removing item not in storage (error case)
  - ✓ Preserves other storage items
  - ✓ Mutates state in place

##### **Contract Helpers** (25-30 tests)
- `canFitContractRewards(state, contract, world)`
  - ✓ Returns true when rewards fit in inventory
  - ✓ Returns true when rewards fit across inventory + storage
  - ✓ Returns false when rewards don't fit anywhere
  - ✓ Handles empty rewards
  - ✓ Handles multiple reward items
  - ✓ Accounts for existing inventory items
  - ✓ Accounts for stackable items
  - ✓ Edge case: rewards exactly fit
  - ✓ Edge case: no rewards

- `consumeContractRequirements(state, contract, world)`
  - ✓ Removes required items from inventory
  - ✓ Removes required items from storage
  - ✓ Removes items from both inventory and storage
  - ✓ Handles multiple required items
  - ✓ Decrements partial stacks correctly
  - ✓ Removes entire stacks when needed
  - ✓ Mutates state in place
  - ✓ Edge case: exactly enough items

- `grantContractRewards(state, contract, world)`
  - ✓ Adds reward items to inventory
  - ✓ Adds reward XP to skills
  - ✓ Handles multiple rewards
  - ✓ Handles XP rewards for multiple skills
  - ✓ Handles contracts with no item rewards
  - ✓ Handles contracts with no XP rewards
  - ✓ Mutates state in place
  - ✓ Triggers level-ups when appropriate

- `checkAndCompleteContracts(state, world, log)`
  - ✓ Completes contract when requirements met
  - ✓ Doesn't complete when requirements not met
  - ✓ Completes multiple contracts in one call
  - ✓ Removes completed contracts from active list
  - ✓ Consumes requirements correctly
  - ✓ Grants rewards correctly
  - ✓ Logs contract completion
  - ✓ Mutates state in place
  - ✓ Handles empty active contracts
  - ✓ Handles no completable contracts
  - ✓ Edge case: multiple contracts complete at once

##### **XP & Leveling** (15-20 tests)
- `grantXP(state, skillType, amount)`
  - ✓ Adds XP to existing skill
  - ✓ Creates new skill entry when needed
  - ✓ Triggers level-up when threshold reached
  - ✓ Triggers multiple level-ups with large XP
  - ✓ Handles zero XP grant
  - ✓ Handles negative XP (error case?)
  - ✓ Updates skill level correctly
  - ✓ Mutates state in place
  - ✓ Edge case: exactly at level-up threshold
  - ✓ Edge case: 1 XP below threshold
  - ✓ Edge case: leveling from 0 to 1
  - ✓ Edge case: leveling to very high level (20+)
  - ✓ Respects XP threshold formula from types.ts

---

## Priority 2: HIGH - Expand Existing Test Coverage

### 2.1 Expand `src/__tests__/engine.test.ts`

**File**: `src/engine.ts` (972 lines)
**Current Coverage**: ~60% (basic paths only)
**Additional Test Cases**: 50-70 tests

#### Test Groups:

##### **Yield & Collateral Calculations** (15-20 tests)
- `calculateFocusYieldPercent(luck)`
  - ✓ Returns 50% at luck=0
  - ✓ Returns ~100% at max luck
  - ✓ Returns values in valid range
  - ✓ Increases with luck
  - ✓ Edge case: negative luck
  - ✓ Edge case: very high luck (>100)

- `calculateCollateralPercent(luck)`
  - ✓ Returns 50% at luck=0
  - ✓ Returns ~0% at max luck
  - ✓ Returns values in valid range
  - ✓ Decreases with luck
  - ✓ Edge case: negative luck
  - ✓ Edge case: very high luck

- `getVarianceRange(baseValue, variance)`
  - ✓ Returns [base, base] when variance=0
  - ✓ Returns symmetric range for positive variance
  - ✓ Handles variance=1.0 (100%)
  - ✓ Edge case: baseValue=0
  - ✓ Edge case: variance=0.01 (1%)

##### **Contract Completion Integration** (10-15 tests)
- Contract completion during gather
  - ✓ Completes contract when gathering required item
  - ✓ Completes multiple contracts if requirements met
  - ✓ Doesn't complete if storage item not yet retrieved
  - ✓ Logs contract completion

- Contract completion during fight
  - ✓ Completes contract when receiving loot
  - ✓ Tests with combat tokens as requirements

- Contract completion during craft
  - ✓ Completes contract when crafting required item
  - ✓ Handles consuming items that were contract requirements

##### **Level-Up Cascades** (10-15 tests)
- Level-up during gather
  - ✓ Logs level-up event
  - ✓ Handles multiple skills leveling at once
  - ✓ Updates skill levels correctly
  - ✓ Continues action after level-up

- Level-up triggers from contracts
  - ✓ Levels up from contract reward XP
  - ✓ Logs both contract completion and level-up

##### **Variance & RNG Edge Cases** (10-15 tests)
- Gather with variance
  - ✓ Respects min/max variance bounds
  - ✓ Uses RNG correctly (deterministic)
  - ✓ Logs variance in structured log

- Fight with variance
  - ✓ XP varies within bounds
  - ✓ Loot tables respect probabilities

##### **Session Time Boundaries** (5-10 tests)
- Actions near session limit
  - ✓ Action completes when exactly at limit after
  - ✓ Logs session ticks correctly

---

### 2.2 Expand `src/__tests__/exploration.test.ts`

**File**: `src/exploration.ts` (1366 lines)
**Current Coverage**: ~65%
**Additional Test Cases**: 40-60 tests

#### Test Groups:

##### **Area Generation Edge Cases** (15-20 tests)
- `generateNodesForArea` edge cases
  - ✓ Handles distance=0 from origin
  - ✓ Handles very large distances (50+)
  - ✓ Generates correct material variance
  - ✓ Respects node density formula
  - ✓ Edge case: area with no materials
  - ✓ Edge case: area with max materials

- Area discovery scenarios
  - ✓ Discovers first area from origin
  - ✓ Discovers connected area
  - ✓ Doesn't rediscover existing area
  - ✓ Handles multiple connections to same area

##### **Pathfinding Complex Scenarios** (10-15 tests)
- `findShortestPath` with multiple hops
  - ✓ Finds path through 2 intermediate areas
  - ✓ Finds path through 3+ intermediate areas
  - ✓ Returns undefined when no path exists
  - ✓ Handles cyclic connections
  - ✓ Prefers shorter paths over longer
  - ✓ Edge case: same source and destination

##### **Luck Tracking** (10-15 tests)
- Luck accumulation
  - ✓ Tracks luck separately per area
  - ✓ Accumulates luck on multiple surveys
  - ✓ Accumulates luck on exploration actions
  - ✓ Resets luck on area discovery
  - ✓ Logs luck values correctly

- Luck effects
  - ✓ Higher luck improves knowledge gain
  - ✓ Luck affects connection discovery chance

##### **Async Area Naming** (5-10 tests)
- `ensureAreaFullyGenerated`
  - ✓ Generates name when area unnamed
  - ✓ Skips generation when area already named
  - ✓ Handles LLM API errors gracefully
  - ✓ Uses fallback name on API failure
  - ✓ Handles missing API key
  - ✓ Logs naming attempts

---

### 2.3 Expand `src/__tests__/runner.test.ts`

**File**: `src/runner.ts` (878 lines)
**Current Coverage**: ~30%
**Additional Test Cases**: 40-50 tests

#### Test Groups:

##### **Command Parsing Edge Cases** (30-40 tests)
- `parseAction` area name matching
  - ✓ Matches exact area name
  - ✓ Matches prefix when unique
  - ✓ Fails on ambiguous prefix
  - ✓ Handles areas with spaces in names
  - ✓ Handles areas with special characters
  - ✓ Case-insensitive matching
  - ✓ Tests "goto" vs "move" aliases

- Gathering node aliases
  - ✓ "ore vein" → MINING node
  - ✓ "mining" → MINING node
  - ✓ "tree" → WOODCUTTING node
  - ✓ "plant" → FORAGING node
  - ✓ Tests all node type aliases
  - ✓ Handles partial matches

- Location matching
  - ✓ Matches "guild hall" by skill name
  - ✓ Matches "warehouse"
  - ✓ Matches "hub"
  - ✓ Handles ambiguous location names

- Command aliases
  - ✓ "g" → gather
  - ✓ "f" → fight
  - ✓ "c" → craft
  - ✓ Tests all action aliases

##### **Meta Commands** (5-10 tests)
- Help command
  - ✓ Displays help text
  - ✓ Returns meta action

- Status/summary commands
  - ✓ Displays player status
  - ✓ Shows inventory correctly

---

### 2.4 Expand `src/__tests__/evaluate.test.ts`

**File**: `src/evaluate.ts` (242 lines)
**Current Coverage**: ~50%
**Additional Test Cases**: 20-30 tests

#### Test Groups:

##### **Action Simulation Edge Cases** (15-20 tests)
- `simulateAction` for each action type
  - ✓ Gather: updates inventory projection
  - ✓ Fight: updates inventory with loot
  - ✓ Craft: consumes inputs, adds output
  - ✓ Store: moves items to storage
  - ✓ Retrieve: moves items to inventory
  - ✓ Accept contract: adds to active contracts
  - ✓ Travel: updates time only
  - ✓ Guild enrolment: marks enrolled

- Contract completion in simulation
  - ✓ Simulates contract completion
  - ✓ Projects reward items correctly
  - ✓ Projects XP gains correctly

##### **Plan Evaluation** (5-10 tests)
- `evaluatePlan` with multi-action plans
  - ✓ Simulates sequence correctly
  - ✓ Detects failures mid-plan
  - ✓ Returns all simulated logs
  - ✓ Edge case: empty plan
  - ✓ Edge case: plan with invalid action

---

### 2.5 Expand `src/__tests__/rng.test.ts`

**File**: `src/rng.ts` (118 lines)
**Current Coverage**: ~70%
**Additional Test Cases**: 15-20 tests

#### Test Groups:

##### **Distribution Tests** (10-15 tests)
- `rollNormal` distribution properties
  - ✓ Mean approximates 0 over many samples
  - ✓ Std dev approximates 1 over many samples
  - ✓ Respects min/max bounds
  - ✓ Produces different values for different counters

- `rollLootTable` edge cases
  - ✓ Single item table (100% chance)
  - ✓ Equal weight items (uniform distribution)
  - ✓ Heavily weighted item (mostly returns it)
  - ✓ Empty table (error case)
  - ✓ Zero weight items (never selected)

##### **Determinism Tests** (5 tests)
- RNG reproducibility
  - ✓ Same seed + counter = same value
  - ✓ Different counter = different value
  - ✓ Sequences match across resets

---

### 2.6 Expand `src/__tests__/types.test.ts`

**File**: `src/types.ts` (500+ lines)
**Current Coverage**: ~60%
**Additional Test Cases**: 10-15 tests

#### Test Groups:

##### **XP System Edge Cases** (10-15 tests)
- `getXPThresholdForNextLevel`
  - ✓ Returns correct threshold for levels 0-20
  - ✓ Handles very high levels (50+)
  - ✓ Edge case: level 0 → 1 threshold

- `addXPToSkill` multi-level ups
  - ✓ Levels up multiple times with large XP
  - ✓ Stops at correct final level
  - ✓ Carries over excess XP correctly
  - ✓ Edge case: exactly at multiple thresholds

---

## Priority 3: MEDIUM - New Test Files

### 3.1 Create `src/__tests__/config.test.ts`

**File**: `src/config.ts` (35 lines, 3 functions)
**Current Coverage**: 0%
**Estimated Test Cases**: 8-10 tests

#### Test Groups:

##### **Config Management** (5-7 tests)
- `setEngineConfig` / `getEngineConfig`
  - ✓ Sets and retrieves config
  - ✓ Merges partial config updates
  - ✓ Returns defaults when not set
  - ✓ Handles undefined values

##### **API Key Management** (3-5 tests)
- `getAnthropicApiKey`
  - ✓ Returns key from config when set
  - ✓ Falls back to environment variable
  - ✓ Returns undefined when neither set
  - ✓ Prioritizes config over env var

---

## Priority 4: LOW - Integration & Error Handling

### 4.1 Error Handling Tests (Across All Modules)

**Estimated Test Cases**: 30-50 tests across all files

#### Patterns to Test:
- Invalid inputs (null, undefined, wrong types)
- Boundary conditions (negative values, overflow)
- Resource exhaustion (inventory full, time exceeded)
- Invalid state transitions
- Async operation failures (LLM API errors)

#### Specific Areas:
- `engine.ts`: Invalid action parameters, precondition failures
- `exploration.ts`: API errors, invalid area connections
- `runner.ts`: Malformed commands, unknown actions
- `actionChecks.ts`: Edge cases in all validation functions
- `stateHelpers.ts`: Invalid item operations, overflow scenarios

---

### 4.2 Integration Tests

**Note**: Many integration scenarios already tested via `engine.test.ts`, `exploration.test.ts`, etc.

#### Additional Integration Scenarios (10-15 tests):
- Multi-action sequences with state dependencies
  - ✓ Gather → Craft → Store flow
  - ✓ Explore → Travel → Gather flow
  - ✓ Accept contract → complete requirements → auto-complete

- Cross-system interactions
  - ✓ Level-up during contract completion
  - ✓ Contract completion during exploration
  - ✓ Inventory management across multiple actions

---

## Implementation Strategy

### Phase 1: Critical Foundation (Week 1)
1. Implement `actionChecks.test.ts` (150-200 tests)
2. Implement `stateHelpers.test.ts` (80-100 tests)
3. **Run `npm run check` after each test group**
4. **Commit after each major test group completes**

### Phase 2: Expand Core Coverage (Week 2)
1. Expand `engine.test.ts` (50-70 tests)
2. Expand `exploration.test.ts` (40-60 tests)
3. Expand `runner.test.ts` (40-50 tests)
4. **Run `npm run check` after each file**
5. **Commit after each file**

### Phase 3: Fill Remaining Gaps (Week 3)
1. Expand `evaluate.test.ts`, `rng.test.ts`, `types.test.ts` (45-50 tests total)
2. Create `config.test.ts` (8-10 tests)
3. Add error handling tests across all modules (30-50 tests)
4. **Run `npm run check` after each file**
5. **Commit after each file**

### Phase 4: Integration & Polish (Week 4)
1. Add integration test scenarios (10-15 tests)
2. Review coverage reports
3. Fill any remaining gaps
4. **Final `npm run check`**
5. **Final commit**

---

## Verification & Success Metrics

### Test Coverage Goals:
- **`actionChecks.ts`**: 95%+ coverage (from 0%)
- **`stateHelpers.ts`**: 95%+ coverage (from 0%)
- **`engine.ts`**: 85%+ coverage (from ~60%)
- **`exploration.ts`**: 85%+ coverage (from ~65%)
- **`runner.ts`**: 70%+ coverage (from ~30%)
- **Overall codebase**: 80%+ coverage (from ~45-50%)

### Quality Metrics:
- All tests pass with `npm test`
- No linting errors with `npm run lint`
- All tests follow existing patterns and style
- Tests are deterministic (no flaky tests)
- Tests run quickly (< 10 seconds total suite)

### Documentation:
- Each test file has clear test group organization
- Complex test cases have comments explaining purpose
- Edge cases are explicitly labeled
- Test names are descriptive and follow pattern: "should [expected behavior] when [condition]"

---

## Notes

### Test Writing Guidelines:
1. **Follow existing test patterns** - Review current test files for structure and style
2. **Use descriptive test names** - "should return error when inventory full" not "test inventory"
3. **Test one thing per test** - Focused tests are easier to debug
4. **Use setup/teardown** - DRY principle for common test state
5. **Test edge cases explicitly** - Zero, negative, max values, boundaries
6. **Mock external dependencies** - LLM API calls should be mocked
7. **Deterministic RNG** - Use fixed seeds for reproducible tests

### Test Organization:
```typescript
describe('functionName', () => {
  describe('when [specific condition]', () => {
    it('should [expected behavior]', () => {
      // Arrange
      // Act
      // Assert
    });
  });
});
```

### Common Assertions:
- `expect(result).toBe(expected)` - Primitive equality
- `expect(result).toEqual(expected)` - Deep object equality
- `expect(result).toBeNull()` / `toBeUndefined()` - Null checks
- `expect(() => fn()).toThrow()` - Error cases
- `expect(result).toHaveLength(n)` - Array/string length
- `expect(array).toContain(item)` - Array membership

---

## Estimated Total Test Cases

- **Priority 1 (Critical)**: 230-300 tests
- **Priority 2 (High)**: 165-215 tests
- **Priority 3 (Medium)**: 8-10 tests
- **Priority 4 (Low)**: 40-65 tests

**Grand Total**: ~445-590 new tests

**Current Tests**: ~150 tests (estimated)
**Target Total**: ~600-750 tests

This should bring coverage from **45-50%** to **80%+**.
