# Implementation Plan: Gathering MVP

## Current State Summary

The codebase has a complete engine with:
- Hardcoded `LocationID = "TOWN" | "MINE" | "FOREST"`
- Hardcoded `ItemID` with 6 items
- Simple `ResourceNode` (single material, binary success/fail)
- 4 skills: Mining, Woodcutting, Combat, Smithing (levels start at 0)
- Slot-based inventory (capacity = 10)
- Binary Gather action with success probability

## Questions to Resolve

### Q1: Clean Break or Backward Compatibility?

The spec is a significant departure from the current toy world. Options:

**Option A: Clean break**
- Replace `createToyWorld()` with `createGatheringWorld()`
- Update types to support new system
- Existing tests will need rewriting

**Option B: Parallel systems**
- Keep old toy world for reference/combat testing
- Add new world factory for gathering MVP
- More code to maintain, but less disruption

**Recommendation:** Clean break (Option A). The toy world is explicitly "toy" and the spec supersedes it.

**YOUR ANSWER:** _____________

---

### Q2: Skill Levels — Start at 0 or 1?

Current code: `skills.Mining = { level: 0, xp: 0 }`
Spec says: "level: 1..10"

**Option A:** Keep level 0 as "untrained", level 1+ as trained
**Option B:** Start at level 1, cap at level 10

This affects XP thresholds and unlock logic.

**Recommendation:** Start at 1 (matches spec). Adjust XP formula if needed.

**YOUR ANSWER:** _____________

---

### Q3: Inventory Model — Slots or Weight?

Spec says: "Choose one now and keep it consistent."

**Option A: Slots** (current)
- Each ItemStack occupies 1 slot regardless of quantity
- Stack limits per item type
- Containers add virtual slots

**Option B: Weight**
- Each item has a weight
- Total weight vs capacity
- Containers reduce effective weight of contents

**Recommendation:** Slots with stack limits. Simpler, already implemented, containers naturally extend it.

**YOUR ANSWER:** _____________

---

### Q4: Location/Item Types — Hardcoded or Configurable?

Current: `type LocationID = "TOWN" | "MINE" | "FOREST"` (compile-time)

Spec has 7+ locations, many items. Options:

**Option A: Expand union types**
- Add all new locations/items as literals
- Type-safe but verbose
- Every new item requires type change

**Option B: String IDs with runtime validation**
- `type LocationID = string`
- Locations/items defined in world config
- Less type-safe but more flexible

**Recommendation:** Option B for LocationID and ItemID (they're data, not code). Keep enums for things like `DistanceBand`, `SkillID`, `GatherMode`.

**YOUR ANSWER:** _____________

---

### Q5: Combat and Contracts — Remove, Stub, or Ignore?

Spec says "No combat, no contracts" for MVP, but add hooks.

**Option A: Remove** Combat/Fight/Contract code entirely
**Option B: Keep** but don't use in gathering world
**Option C: Stub** — keep types, remove implementation

**Recommendation:** Keep (Option B). The code works, tests pass, we just don't use it in the new world. Add `source` hooks as spec requires.

**YOUR ANSWER:** _____________

---

### Q6: Woodcrafting — New Skill or Rename Smithing?

Current skills: Mining, Woodcutting, Combat, Smithing

Spec adds Woodcrafting as separate from Smithing.

**Options:**
- Add Woodcrafting as 5th skill (keep Combat for later)
- Or replace Combat with Woodcrafting for MVP

**Recommendation:** Add Woodcrafting as 5th skill. Combat can stay dormant.

**YOUR ANSWER:** _____________

---

### Q7: Node Instance Persistence

Spec says nodes persist across sessions. Current engine has no persistence.

**Options:**
- **In-memory only:** Nodes persist within a WorldState instance but not across process restarts
- **Serialization hooks:** Add `serializeWorld()` / `deserializeWorld()` for external persistence

CLAUDE.md says "no persistence beyond in-memory objects" — so in-memory only is correct.

**Recommendation:** In-memory persistence only. "Sessions" in spec means within a running game, not file saves.

**YOUR ANSWER:** _____________

---

### Q8: Appraisal — Full Explicitness or Partial Info?

Spec offers two options:
1. Appraisal reveals exact materials/amounts (full explicitness)
2. Appraisal reveals partial info, improves with skill

Canon says "all meaningful mechanics are visible and quantified."

**Recommendation:** Full explicitness. Appraisal costs 1 tick but reveals everything. Skill affects extraction, not information.

**YOUR ANSWER:** _____________

---

## Implementation Phases (Draft)

Pending your answers, here's the rough sequence:

### Phase 1: Type System Overhaul
- [ ] Change LocationID/ItemID to string types
- [ ] Add new enums: `DistanceBand`, `GatherMode`, `NodeType`
- [ ] Add new interfaces: `Location`, `Node`, `MaterialReserve`
- [ ] Add `tier` field to materials
- [ ] Add Woodcrafting skill
- [ ] Update SkillState to start at level 1

### Phase 2: World Structure
- [ ] Create `Location` interface with band, travel time, node pools
- [ ] Create new world factory with 7 locations
- [ ] Define material tiers and distance gating rules
- [ ] Implement node generation with multi-material reserves

### Phase 3: New Gather System
- [ ] Redesign GatherAction to include mode (FOCUS, CAREFUL_ALL, APPRAISE)
- [ ] Implement focus extraction with yield variance
- [ ] Implement collateral damage with floor
- [ ] Implement careful mode (no collateral, slow)
- [ ] Add XP = ticks × tier formula

### Phase 4: Inventory & Containers
- [ ] Add stack limits per item type
- [ ] Add container items (ORE_CRATE, LOG_BUNDLE)
- [ ] Implement compression logic for containers
- [ ] Add Field Prep action (Woodcutting L6)

### Phase 5: Skill Unlocks
- [ ] Implement unlock flag system
- [ ] Wire Mining L1-L10 unlocks
- [ ] Wire Woodcutting L1-L10 unlocks
- [ ] Wire Smithing L1-L10 unlocks
- [ ] Wire Woodcrafting L1-L10 unlocks

### Phase 6: Integration & Polish
- [ ] Update action logging for new gather system
- [ ] Add waste summaries to ActionLog
- [ ] Add variance display (EV, range, actual)
- [ ] Update evaluation APIs
- [ ] Write acceptance tests per spec

---

## Estimated Scope

| Phase | New/Modified Files | Est. Lines |
|-------|-------------------|------------|
| Phase 1 | types.ts | ~200 |
| Phase 2 | world.ts, locations.ts (new) | ~300 |
| Phase 3 | engine.ts, gather.ts (new) | ~400 |
| Phase 4 | inventory.ts (new), types.ts | ~200 |
| Phase 5 | unlocks.ts (new), actionChecks.ts | ~300 |
| Phase 6 | tests, logging | ~400 |

**Total estimate:** ~1,800 lines of new/modified code + tests

---

## Awaiting Your Input

Please answer Q1-Q8 above so I can finalize the plan.
