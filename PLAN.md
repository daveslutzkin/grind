# Implementation Plan: Canonical Gathering System

## Overview

Implement the mastery-driven gathering system as specified in `design-docs/canonical-gathering.md`. This changes the current multi-unit extraction model to a single-unit-per-action model with mastery-based speed, waste reduction, and bonus yield.

## Scope

**In Scope (Core Mechanics):**
- Per-material mastery tracking (M1-M25)
- Speed effects: M2 (20→15), M9 (15→10), M17 (10→5 ticks)
- Waste effects: M3 (40→30%), M11 (30→15%), M19 (15→5%)
- Appraise visibility: M6 per material
- Careful unlock: M16 per material
- Bonus Yield: M10 (5%), M20 (10%)
- Guild enrollment requirement
- 1 unit per action extraction model
- Luck surfacing (expected vs actual ticks)

**Out of Scope (Future Work):**
- Stack/Handling (M4, M5, M13, M14, M21)
- Container (M8, M18)
- Scavenge (M7, M15)
- Value multipliers (M12, M22)
- Ignore minor penalties (M23)
- Refined fragments (M24)
- Grandmaster high-grade extraction (M25)

---

## Phase 1: Mastery Data Model

### 1.1 Add mastery level progression data

**File:** `src/masteryData.ts` (new file)

Create a lookup table that maps Mining skill level → material mastery gains. This encodes the `mining-levels-1-200.md` table.

```typescript
// Types for mastery progression
type MasteryGain =
  | 'Unlock'      // M1: Can mine this material
  | 'Speed_I'     // M2: 20→15 ticks
  | 'Waste_I'     // M3: 40→30% collateral
  | 'Appraise'    // M6: See quantities
  | 'Speed_II'    // M9: 15→10 ticks
  | 'Bonus_I'     // M10: 5% double yield
  | 'Waste_II'    // M11: 30→15% collateral
  | 'Careful'     // M16: Zero collateral mode
  | 'Speed_III'   // M17: 10→5 ticks
  | 'Waste_III'   // M19: 15→5% collateral
  | 'Bonus_II'    // M20: 10% double yield

interface MasteryEntry {
  material: MaterialID
  masteryLevel: number  // M1-M25
  gain: MasteryGain
}

// MINING_MASTERY_TABLE[skillLevel] = { material, masteryLevel, gain }
```

**Test first:** `src/masteryData.test.ts`
- Test that L1 grants Stone M1 (Unlock)
- Test that L20 grants Copper M1 (Unlock)
- Test that L37 grants Stone M20 (Bonus Yield II)
- Test edge cases at level boundaries

### 1.2 Add mastery state to player

**File:** `src/types.ts`

Add per-material mastery tracking:

```typescript
// New type for material mastery state
export interface MaterialMasteryState {
  level: number  // M1-M25 (0 = not unlocked)
}

// Update SkillState or add separate tracking
export interface SkillState {
  level: number
  xp: number
  mastery?: Record<MaterialID, MaterialMasteryState>  // For gathering skills
}
```

**Test first:** Verify mastery state can be read/written in player state.

### 1.3 Derive mastery from skill level

**File:** `src/masteryData.ts`

Add function to compute current mastery for a material given skill level:

```typescript
function getMaterialMastery(skillLevel: number, materialId: MaterialID): number {
  // Returns 0-25 based on skill level and mastery progression table
}

function hasMasteryUnlock(skillLevel: number, materialId: MaterialID, gain: MasteryGain): boolean {
  // Returns true if player has unlocked this specific ability
}
```

**Test first:**
- At Mining L1, Stone has M1 (Unlock)
- At Mining L19, Stone has M19 (Waste III)
- At Mining L36, Stone has M17 (Speed III), Copper has M17 (Speed III)
- At Mining L15, Copper has M0 (not unlocked yet)

---

## Phase 2: Validation Changes

### 2.1 Add guild enrollment check

**File:** `src/actionChecks.ts`

In `checkMultiMaterialGatherAction`, add check that Mining skill is at level >= 1:

```typescript
// Must be enrolled in guild (skill level >= 1)
if (skillLevel < 1) {
  return {
    valid: false,
    failureType: "NOT_ENROLLED",
    failureReason: "must_enrol_in_guild",
    failureContext: { skill, requiredGuild: "Miners Guild" },
    ...
  }
}
```

**Test first:** `src/gather.test.ts`
- Mining at L0 → fails with NOT_ENROLLED
- Mining at L1 → proceeds to other checks

### 2.2 Update FOCUS mode material unlock check

**File:** `src/actionChecks.ts`

Change from checking `skillLevel >= material.requiredLevel` to checking `hasMasteryUnlock(skillLevel, materialId, 'Unlock')`:

```typescript
// FOCUS mode requires M1 for target material
if (!hasMasteryUnlock(skillLevel, focusMaterialId, 'Unlock')) {
  return {
    valid: false,
    failureType: "MATERIAL_NOT_UNLOCKED",
    failureReason: "need_mastery_unlock",
    failureContext: {
      materialId: focusMaterialId,
      currentMastery: getMaterialMastery(skillLevel, focusMaterialId),
      requiredMastery: 1
    },
    ...
  }
}
```

**Test first:**
- Mining L19, Stone → allowed (has Stone M19)
- Mining L19, Copper → not allowed (Copper unlocks at L20)
- Mining L20, Copper → allowed (has Copper M1)

### 2.3 Update CAREFUL mode validation

**File:** `src/actionChecks.ts`

CAREFUL mode requires at least one material in node has M16 (Careful) unlock:

```typescript
if (mode === GatherMode.CAREFUL_ALL) {  // Rename to CAREFUL later
  const carefulMaterials = node.materials.filter(m =>
    m.remainingUnits > 0 &&
    hasMasteryUnlock(skillLevel, m.materialId, 'Careful')
  )

  if (carefulMaterials.length === 0) {
    return {
      valid: false,
      failureType: "NO_CAREFUL_MATERIALS",
      failureReason: "no_materials_with_careful_mastery",
      failureContext: {
        nodeId: node.nodeId,
        materials: node.materials.map(m => m.materialId),
        carefulUnlockLevel: "M16"
      },
      ...
    }
  }
}
```

**Test first:**
- Mining L15, node with Stone → fails (Stone M16 = L16)
- Mining L16, node with Stone → succeeds (Stone has Careful)
- Mining L16, node with Stone+Copper → succeeds (Stone has Careful)
- Mining L16, node with Copper only → fails (Copper M16 = L35)

### 2.4 Calculate time cost based on mastery

**File:** `src/actionChecks.ts`

Replace fixed `getGatheringTimeCost(mode)` with mastery-based calculation:

```typescript
function getGatheringTimeCost(
  mode: GatherMode,
  skillLevel: number,
  node: Node,
  focusMaterialId?: MaterialID
): number {
  if (mode === GatherMode.APPRAISE) return 1

  if (mode === GatherMode.FOCUS) {
    return getSpeedForMaterial(skillLevel, focusMaterialId!)
  }

  if (mode === GatherMode.CAREFUL_ALL) {
    // 2x slowest material's speed among careful-unlocked materials
    const carefulMaterials = node.materials.filter(m =>
      hasMasteryUnlock(skillLevel, m.materialId, 'Careful')
    )
    const slowest = Math.max(...carefulMaterials.map(m =>
      getSpeedForMaterial(skillLevel, m.materialId)
    ))
    return slowest * 2
  }
}

function getSpeedForMaterial(skillLevel: number, materialId: MaterialID): number {
  if (hasMasteryUnlock(skillLevel, materialId, 'Speed_III')) return 5
  if (hasMasteryUnlock(skillLevel, materialId, 'Speed_II')) return 10
  if (hasMasteryUnlock(skillLevel, materialId, 'Speed_I')) return 15
  return 20  // Base speed
}
```

**Test first:**
- Stone at L1 → 20 ticks
- Stone at L2 → 15 ticks (Speed I)
- Stone at L9 → 10 ticks (Speed II)
- Stone at L17 → 5 ticks (Speed III)
- CAREFUL with Stone+Copper at L16 → 2 * 20 = 40 ticks (Copper is slower)

---

## Phase 3: Extraction Logic Changes

### 3.1 Change to 1 unit extraction

**File:** `src/engine.ts`

Rewrite `executeFocusExtraction` to extract exactly 1 unit (or 2 on bonus yield):

```typescript
function executeFocusExtraction(...): ActionLog {
  const focusMaterial = node.materials.find(m => m.materialId === focusMaterialId)!

  // Check bonus yield
  const bonusChance = getBonusYieldChance(skillLevel, focusMaterialId)
  const bonusRoll = rollFloat(state.rng, 0, 1, 'bonus_yield')
  const unitsExtracted = bonusRoll < bonusChance ? 2 : 1

  // Extract from node (max available)
  const actualExtracted = Math.min(unitsExtracted, focusMaterial.remainingUnits)
  focusMaterial.remainingUnits -= actualExtracted

  // Apply collateral damage to other materials
  const collateralRate = getCollateralRate(skillLevel, focusMaterialId)
  for (const material of node.materials) {
    if (material.materialId !== focusMaterialId && material.remainingUnits > 0) {
      const damage = actualExtracted * collateralRate  // Fractional
      material.remainingUnits = Math.max(0, material.remainingUnits - damage)
      collateralDamage[material.materialId] = damage
    }
  }

  // Add to inventory
  addToInventory(state, focusMaterialId, actualExtracted)

  // Grant XP: 1 per unit (2 on bonus)
  const xpAmount = actualExtracted
  grantXP(state, skill, xpAmount)

  // Luck surfacing
  const expectedTicks = getSpeedForMaterial(skillLevel, focusMaterialId)
  // Note: actual ticks come from timeCost parameter

  return {
    ...
    extraction: {
      mode: GatherMode.FOCUS,
      extracted: [{ itemId: focusMaterialId, quantity: actualExtracted }],
      focusWaste: 0,  // No longer applies to focus material itself
      collateralDamage,
      variance: {
        expected: expectedTicks,
        actual: timeCost,
        luckDelta: expectedTicks - timeCost  // Positive = lucky
      }
    }
  }
}
```

**Test first:**
- Extract from node with 5 Stone → get 1 Stone, node has 4
- With M10 bonus (5% chance) using fixed seed → occasionally get 2
- With M20 bonus (10% chance) → higher frequency of 2

### 3.2 Implement mastery-based collateral damage

**File:** `src/engine.ts`

```typescript
function getCollateralRate(skillLevel: number, materialId: MaterialID): number {
  if (hasMasteryUnlock(skillLevel, materialId, 'Waste_III')) return 0.05
  if (hasMasteryUnlock(skillLevel, materialId, 'Waste_II')) return 0.15
  if (hasMasteryUnlock(skillLevel, materialId, 'Waste_I')) return 0.30
  return 0.40  // Base rate
}
```

**Test first:**
- Mining Stone at L1 → 40% collateral to other materials
- Mining Stone at L3 (Waste I) → 30% collateral
- Mining Stone at L11 (Waste II) → 15% collateral
- Mining Stone at L19 (Waste III) → 5% collateral

### 3.3 Implement bonus yield

**File:** `src/engine.ts`

```typescript
function getBonusYieldChance(skillLevel: number, materialId: MaterialID): number {
  if (hasMasteryUnlock(skillLevel, materialId, 'Bonus_II')) return 0.10
  if (hasMasteryUnlock(skillLevel, materialId, 'Bonus_I')) return 0.05
  return 0
}
```

**Test first:**
- Mining L9 Stone → 0% bonus
- Mining L10 Stone (Bonus I) → 5% bonus
- Mining L37 Stone (Bonus II) → 10% bonus

### 3.4 Rewrite CAREFUL mode extraction

**File:** `src/engine.ts`

Change from extracting all materials to extracting 1 random material:

```typescript
function executeCarefulAllExtraction(...): ActionLog {
  // Get materials with Careful unlock
  const carefulMaterials = node.materials.filter(m =>
    m.remainingUnits > 0 &&
    hasMasteryUnlock(skillLevel, m.materialId, 'Careful')
  )

  // Random selection
  const index = Math.floor(rollFloat(state.rng, 0, carefulMaterials.length, 'careful_select'))
  const selectedMaterial = carefulMaterials[index]

  // Check bonus yield for selected material
  const bonusChance = getBonusYieldChance(skillLevel, selectedMaterial.materialId)
  const bonusRoll = rollFloat(state.rng, 0, 1, 'bonus_yield')
  const unitsExtracted = bonusRoll < bonusChance ? 2 : 1

  const actualExtracted = Math.min(unitsExtracted, selectedMaterial.remainingUnits)
  selectedMaterial.remainingUnits -= actualExtracted

  // No collateral damage in CAREFUL mode

  // Add to inventory
  addToInventory(state, selectedMaterial.materialId, actualExtracted)

  // Grant XP
  grantXP(state, skill, actualExtracted)

  return {
    ...
    extraction: {
      mode: GatherMode.CAREFUL_ALL,
      extracted: [{ itemId: selectedMaterial.materialId, quantity: actualExtracted }],
      focusWaste: 0,
      collateralDamage: {}  // None
    }
  }
}
```

**Test first:**
- CAREFUL at L16 with Stone+Copper → extracts 1 Stone (only Careful-unlocked)
- CAREFUL at L35 with Stone+Copper → extracts 1 of either randomly

### 3.5 Update APPRAISE mode

**File:** `src/engine.ts`

Only show quantities for materials with M6 (Appraise) unlock:

```typescript
if (mode === GatherMode.APPRAISE) {
  const appraisal = {
    nodeId: node.nodeId,
    nodeType: node.nodeType,
    materials: node.materials.map(m => ({
      materialId: m.materialId,
      // Only show quantity if player has Appraise mastery
      remaining: hasMasteryUnlock(skillLevel, m.materialId, 'Appraise')
        ? m.remainingUnits
        : undefined,
      max: hasMasteryUnlock(skillLevel, m.materialId, 'Appraise')
        ? m.maxUnitsInitial
        : undefined,
      requiredLevel: m.requiredLevel,
      tier: m.tier,
      canSeeQuantity: hasMasteryUnlock(skillLevel, m.materialId, 'Appraise')
    }))
  }
  ...
}
```

**Test first:**
- APPRAISE at L5 → Stone shows "???" (no Appraise yet)
- APPRAISE at L6 → Stone shows quantity (has Appraise)
- APPRAISE at L6 → Copper shows "???" (Copper Appraise at L25)

---

## Phase 4: Time Variance and Luck Surfacing (DEFERRED)

> **Status: DEFERRED** - This phase has been deferred to a future iteration. The core
> mastery system works well with deterministic timing, and adding variance adds significant
> complexity for testing. The feature can be added later if player feedback indicates
> it would improve the experience.

### 4.1 Add time variance to extraction

**File:** `src/actionChecks.ts` and `src/engine.ts`

The spec says: "Time has normal distribution variance (±5 ticks at base, scaling proportionally)"

```typescript
function getGatheringTimeCostWithVariance(
  state: WorldState,
  mode: GatherMode,
  skillLevel: number,
  node: Node,
  focusMaterialId?: MaterialID
): { baseTicks: number; actualTicks: number; luckDelta: number } {
  const baseTicks = getBaseTimeCost(mode, skillLevel, node, focusMaterialId)

  // Variance scales with base time: ±25% (5 ticks at 20 base)
  const variance = baseTicks * 0.25

  // Normal distribution roll (using existing RNG system)
  const roll = rollNormal(state.rng, baseTicks, variance, 'time_variance')
  const actualTicks = Math.max(1, Math.round(roll))

  return {
    baseTicks,
    actualTicks,
    luckDelta: baseTicks - actualTicks  // Positive = lucky (faster)
  }
}
```

**Test first:**
- Base 20 ticks → actual varies ~15-25 (2.5% tails)
- Base 5 ticks → actual varies ~4-6

### 4.2 Track cumulative luck

**File:** `src/types.ts`

Add to exploration player state (or create mining state):

```typescript
export interface PlayerState {
  ...
  miningLuckDelta: number  // Cumulative ticks saved/lost
}
```

**File:** `src/engine.ts`

Update after each extraction:

```typescript
state.exploration.playerState.miningLuckDelta += luckDelta
```

**Test first:**
- After extraction with +3 luck → total increases by 3
- After extraction with -2 luck → total decreases by 2

---

## Phase 5: Inventory Check

### 5.1 Add pre-flight inventory check

**File:** `src/actionChecks.ts`

The spec says mining fails before starting if inventory is full:

```typescript
// Check inventory capacity before mining (not for APPRAISE)
if (mode !== GatherMode.APPRAISE) {
  if (state.player.inventory.length >= state.player.inventoryCapacity) {
    return {
      valid: false,
      failureType: "INVENTORY_FULL",
      failureReason: "no_space_for_materials",
      failureContext: {
        capacity: state.player.inventoryCapacity,
        current: state.player.inventory.length
      },
      ...
    }
  }
}
```

**Test first:**
- Full inventory → FOCUS fails with INVENTORY_FULL
- Full inventory → APPRAISE still works

---

## Phase 6: Cleanup and Polish

### 6.1 Update failure types

**File:** `src/types.ts`

Add new failure types:

```typescript
export type FailureType =
  | ...existing...
  | "NOT_ENROLLED"
  | "MATERIAL_NOT_UNLOCKED"
  | "NO_CAREFUL_MATERIALS"
  | "INVENTORY_FULL"
```

### 6.2 Update hints

**File:** `src/hints.ts`

Add user-friendly hints for new failure types.

### 6.3 Update formatters

**File:** `src/agent/formatters.ts`

Update action log formatting to show:
- Luck delta per extraction
- Cumulative luck
- Mastery progress

---

## Testing Strategy

Following TDD (from CLAUDE.md):

1. **Write failing test first** for each behavior
2. **Implement minimum code** to pass
3. **Run `npm run check`** after each change
4. **Commit checkpoint** when functionality complete

### Test Files to Create/Update

- `src/masteryData.test.ts` (new) - Mastery lookup tests
- `src/gather.test.ts` - Update for new extraction model
- `src/actionChecks.test.ts` - Validation logic tests
- `src/acceptance.test.ts` - End-to-end scenarios

### Key Test Scenarios

1. **Material unlock progression**: Stone at L1, Copper at L20, etc.
2. **Speed progression**: 20→15→10→5 ticks
3. **Waste progression**: 40→30→15→5%
4. **Bonus yield**: 0→5→10% chance
5. **CAREFUL mode**: Random from M16 materials only
6. **APPRAISE mode**: Only shows M6 materials
7. **Inventory full**: Fails before starting
8. **Guild enrollment**: Required for all mining

---

## File Change Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/masteryData.ts` | New | Mastery progression table and lookup functions |
| `src/masteryData.test.ts` | New | Tests for mastery lookup |
| `src/types.ts` | Modify | Add MaterialMasteryState, new failure types |
| `src/actionChecks.ts` | Modify | Mastery-based validation, inventory check |
| `src/engine.ts` | Modify | 1-unit extraction, mastery effects, luck |
| `src/hints.ts` | Modify | New failure type hints |
| `src/agent/formatters.ts` | Modify | Luck surfacing in output |
| `src/gather.test.ts` | Modify | Update for new extraction model |

---

## Implementation Order

1. Phase 1: Mastery Data Model (foundation) ✅
2. Phase 2: Validation Changes (gates) ✅
3. Phase 3: Extraction Logic (core mechanics) ✅
4. Phase 4: Time Variance and Luck (polish) - **DEFERRED**
5. Phase 5: Inventory Check (edge case) ✅
6. Phase 6: Cleanup and Polish (UX) ✅

Each phase should be a separate commit after tests pass.

---

## Implementation Complete

All phases except Phase 4 (Time Variance) have been implemented. Phase 4 was deferred because:
- The core mastery system works well with deterministic timing
- Adding variance significantly complicates testing
- Can be added in a future iteration based on player feedback
