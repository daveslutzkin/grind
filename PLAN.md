# Plan: Rename Currency from "gold" to "coins"

## Goal
Rename the player currency from "gold" to "coins" to avoid confusion with GOLD_ORE mining material.

## Changes Required

### 1. Type Definitions (`src/types.ts`)
- `player.gold` → `player.coins`
- `goldReward` → `coinsReward`
- `goldEarned` → `coinsEarned`
- `INSUFFICIENT_GOLD` → `INSUFFICIENT_COINS`

### 2. Core Files (property/variable renames)
- `src/world.ts` - initialization
- `src/stateHelpers.ts` - contract completion logic
- `src/actionChecks.ts` - map purchase validation
- `src/availableActions.ts` - map availability checks
- `src/engine.ts` - map purchase execution
- `src/contracts.ts` - contract creation

### 3. Display Strings (`src/agent/formatters.ts`)
- `"Gold: X"` → `"Coins: X"`
- `"X gold"` → `"X coins"`

### 4. Tests
- `src/world.test.ts`
- `src/contracts.test.ts`
- `src/agent/formatters.test.ts`
- `src/types.test.ts`
- `src/visibility.test.ts`
- `src/persistence.test.ts`

### 5. Comments (optional, low priority)
- Update comments in `src/contracts.ts` referencing "gold"

## Verification
```bash
npm run check
```
All tests should pass with the renamed properties.

## Notes
- Design docs in `design-docs/` don't need updating (historical record)
- Save files will auto-migrate on next save (old saves with `gold` property will break - acceptable for dev)
