# Codebase Analysis Findings

This document captures findings from a comprehensive code review conducted on 2026-01-20.

## Table of Contents

1. [Large Monolithic Files](#1-large-monolithic-files)
2. [Duplicate Code Patterns](#2-duplicate-code-patterns)
3. [Functions Over 100 Lines](#3-functions-over-100-lines)
4. [TODO Comments to Address](#4-todo-comments-to-address)
5. [Magic Numbers to Extract](#5-magic-numbers-to-extract)
6. [Test Coverage Gaps](#6-test-coverage-gaps)
7. [Deprecated Code to Clean Up](#7-deprecated-code-to-clean-up)
8. [Inconsistent Patterns](#8-inconsistent-patterns)
9. [Abstraction Opportunities](#9-abstraction-opportunities)
10. [Overall Assessment](#10-overall-assessment)

---

## 1. Large Monolithic Files

These files have grown large and could benefit from being split into domain-specific modules.

| File | Lines | Issue |
|------|-------|-------|
| `src/engine.ts` | 1,840 | Action execution monolith - handles all gather, craft, travel, contract actions |
| `src/exploration.ts` | 1,739 | Exploration + travel + discovery all combined |
| `src/actionChecks.ts` | 1,439 | All validation logic for every action type |
| `src/runner.ts` | 1,160 | Large REPL runner |
| `src/session/GameSession.ts` | 1,113 | Unified session with many responsibilities |

### Recommendation

Consider splitting into domain-specific modules:

- `src/actions/gathering.ts`, `src/actions/crafting.ts`, `src/actions/contracts.ts`
- `src/checks/gatheringChecks.ts`, `src/checks/craftingChecks.ts`, etc.

---

## 2. Duplicate Code Patterns

> ✅ **PLANNED** - See `PLAN.md` for implementation details

### 2.1 Failure Handling Pattern (10+ occurrences)

**Locations:** `engine.ts:240-252, 338-350, 1403-1415, 1454-1466, 1513-1523, 1648-1659`

```typescript
if (!check.valid) {
  yield {
    done: true,
    log: createFailureLog(state, action, check.failureType!, 0, check.failureReason, check.failureContext),
  }
  return
}
```

**Recommendation:** Extract `yieldFailure(state, action, check)` helper function.

### 2.2 Inventory + Storage Quantity Calculation (2 occurrences)

**Locations:** `actionChecks.ts:272-278, 809-814`

```typescript
const inventoryQuantity = state.player.inventory
  .filter((i) => i.itemId === req.itemId)
  .reduce((sum, i) => sum + i.quantity, 0)
const storageQuantity = state.player.storage
  .filter((i) => i.itemId === req.itemId)
  .reduce((sum, i) => sum + i.quantity, 0)
const totalQuantity = inventoryQuantity + storageQuantity
```

**Recommendation:** Create `getTotalItemQuantity(state, itemId)` function.

### 2.3 Area/Connection Discovery Loops (3 occurrences)

**Locations:** `engine.ts:264-281, 1681-1697, 1786-1803`

Nearly identical loops for discovering areas and connections when revealing maps.

**Recommendation:** Extract `revealAreasAndConnections(state, areaIds, connectionIds)` helper.

### 2.4 Focus/Careful Extraction Logic (90 nearly identical lines)

**Locations:** `engine.ts:740-835` vs `engine.ts:846-931`

These two functions share ~90 lines of nearly identical code with only minor variations for mode-specific behavior.

**Recommendation:** Consolidate into single `executeExtraction(mode, ...)` with mode-specific branches.

---

## 3. Functions Over 100 Lines

These functions are candidates for decomposition into smaller, focused helpers.

| Function | File | Lines | Size |
|----------|------|-------|------|
| `checkGatherAction` / `checkMultiMaterialGatherAction` | actionChecks.ts | 423-667 | 244 lines |
| `checkBuyMapAction` | actionChecks.ts | 1197-1394 | 197 lines |
| `executeBuyMap` | engine.ts | 1642-1823 | 181 lines |
| `executeGuildEnrolment` | engine.ts | 1278-1391 | 113 lines |
| `generateFailureHint` | hints.ts | 59+ | Large switch statement |

### Specific Recommendations

- **`checkGatherAction`**: Extract helpers like `validateNodeExists()`, `validatePlayerEnrollment()`, `validateModeUnlocked()`, `validateMaterials()`
- **`checkBuyMapAction`**: Split into `checkNodeMapAction()` and `checkAreaMapAction()`
- **`executeBuyMap`**: Extract `executeNodeMapPurchase()` and `executeAreaMapPurchase()`
- **`generateFailureHint`**: Use a Map of failureType → hint generator functions

---

## 4. TODO Comments to Address

| Location | TODO Description |
|----------|------------------|
| `src/types.ts:163` | `fightTime` and `successProbability` are currently unused in Enemy interface - combat uses weapon stats instead |
| `src/exploration.ts:1617` | Scavenge rolls for gathering drops (future implementation) |
| `src/exploration.ts:1721` | Scavenge rolls for gathering drops (duplicate TODO) |
| `src/policy-runner/policies/balanced.ts:14` | `MINING_TICKS_PER_ACTION` should come from game config, not be hardcoded |
| `src/policy-runner/policies/greedy.ts:15` | `LEVEL_TO_DISTANCE` heuristic should be extracted to game config |

---

## 5. Magic Numbers to Extract

| Location | Current Code | Suggested Constant Name |
|----------|--------------|------------------------|
| `src/policy-runner/observation.ts:62` | `BASE_TRAVEL_TICKS = 22` | May duplicate `BASE_TRAVEL_TIME = 10` in exploration.ts - investigate discrepancy |
| `src/agent/formatters.ts:968` | `const rollInterval = 2` | `TICKS_PER_ROLL_ATTEMPT` |
| `src/agent/formatters.ts:977-985` | Luck thresholds (50%, 0%) | `LUCK_THRESHOLD_VERY`, `LUCK_THRESHOLD_AVERAGE` |
| `src/runner.ts:879` | `const W = 120` | `DISPLAY_WIDTH` |
| `src/policy-runner/policies/balanced.ts:16` | `MINING_TICKS_PER_ACTION = 5` | Should come from game config |

---

## 6. Test Coverage Gaps

The following 19 source files do not have corresponding test files:

### High Priority (Core Logic)

- `src/stateHelpers.ts` - Core state manipulation utilities
- `src/interactive.ts` - REPL interaction logic
- `src/llmCache.ts` - Caching functionality
- `src/config.ts` - Configuration loading

### Medium Priority (Web/UI)

- `src/web/server/index.ts` - Server setup
- `src/web/client/components/actionHistoryUtils.ts` - UI utilities
- `src/web/client/hooks/useGameState.ts` - State hook
- `src/web/client/hooks/useWebSocket.ts` - WebSocket hook

### Lower Priority (Entry Points/Index Files)

- `src/prompt.ts`
- `src/savePrompt.ts`
- `src/repl.ts`
- `src/index.ts`
- `src/agent/index.ts`
- `src/session/index.ts`
- `src/session/types.ts`
- `src/policy-runner/index.ts`
- `src/policy-runner/policies/index.ts`
- `src/policy-runner/profile.ts`
- `src/policy-runner/simulation-worker.ts`

---

## 7. Deprecated Code to Clean Up

| Location | Issue | Action |
|----------|-------|--------|
| `src/exploration.ts:75-76` | `UNKNOWN_CONNECTION_DISCOVERY_MULTIPLIER` - deprecated alias for `UNKNOWN_CONNECTION_MULTIPLIER` | Remove when safe |
| `src/types.ts:163-166` | `fightTime` and `successProbability` properties in Enemy interface are unused | Remove or document why kept |
| `src/agent/llm.ts:68` | Deprecated function noted in JSDoc | Review and remove if unused |

---

## 8. Inconsistent Patterns

### 8.1 Import Paths in hints.test.ts ✅ PLANNED

**Location:** `src/hints.test.ts:4-7`

```typescript
// Current (inconsistent):
import { generateFailureHint } from "../src/hints.js"
import { createWorld } from "../src/world.js"

// Should be (like other test files):
import { generateFailureHint } from "./hints.js"
import { createWorld } from "./world.js"
```

### 8.2 Location Checking Approaches

Different functions in `actionChecks.ts` check locations differently:

- Direct comparison: `getCurrentLocationId(state) !== contract.acceptLocationId`
- Area-first check: Check against area, then location
- String matching: Various approaches

**Recommendation:** Create standardized location comparison helper.

### 8.3 Validation Result Creation

`ActionCheckResult` creation is verbose and repetitive throughout `actionChecks.ts`:

```typescript
return {
  valid: false,
  failureType: "SOMETHING",
  failureReason: "reason",
  failureContext: { /* data */ },
  timeCost: 0,
  successProbability: 0,
}
```

**Recommendation:** Create factory function `createFailureResult(failureType, reason, context)`.

---

## 9. Abstraction Opportunities

### 9.1 Missing: "Discoverable" Concept

**Files:** `src/exploration.ts`, `src/interactive.ts`

Areas, connections, nodes, and mob camps all follow similar discovery patterns but are treated independently.

**Recommendation:** Create `Discoverable` interface and consolidate discovery logic.

### 9.2 Missing: "Reward" System

**Files:** `src/engine.ts` (scattered throughout)

Gold rewards, XP rewards, and reputation rewards are handled separately in different functions.

**Recommendation:** Create `RewardGranter` utility with methods: `grantGold()`, `grantXP()`, `grantReputation()`.

### 9.3 Missing: "Material Tracking"

**Files:** `src/actionChecks.ts`, `src/engine.ts`

Material checking is repeated in gather, craft, and trade actions.

**Recommendation:** Create `MaterialInventory` class to abstract quantity queries and depletion logic.

### 9.4 Potential Over-Abstraction: Resolution System

**File:** `src/resolution.ts`

Has multiple overlapping layers (`normalizeName`, `toSlug`, various alias maps) that make it complex.

**Recommendation:** Simplify by consolidating matching logic.

---

## 10. Overall Assessment

### Strengths

- **Clean code**: No commented-out code blocks found
- **No dead code**: All exported functions/types are actively used
- **Type safety**: TypeScript strict mode catching issues
- **Good conventions**: Intentionally unused parameters properly marked with underscore prefix (`_param`)
- **Well-documented**: Good use of section headers and JSDoc comments
- **TDD practices**: Test files colocated with source, good coverage of core logic

### Areas for Improvement

1. **Modularization** - Break up large files (`engine.ts`, `actionChecks.ts`, `exploration.ts`) by domain
2. **DRY** - Extract repeated patterns to helper functions
3. **Test coverage** - Add tests for 19 untested files, especially `stateHelpers.ts` and web hooks
4. **Config extraction** - Move magic numbers to named constants or configuration
5. **Clean up deprecated code** - Remove deprecated exports and unused interface properties when safe

### Priority Order

1. ~~**High**: Extract duplicate code patterns (failure handling, inventory calculations)~~ ✅ PLANNED
2. ~~**High**: Fix inconsistent import paths in `hints.test.ts`~~ ✅ PLANNED
3. **Medium**: Break up large functions (>100 lines)
4. **Medium**: Add test coverage for core untested files
5. **Low**: Consider file reorganization for large modules
6. **Low**: Clean up deprecated code and unused properties
