# Implementation Plan: Gathering MVP

## Decisions (Finalized)

| Question | Decision |
|----------|----------|
| Clean break or backward compat? | **Clean break** — replace toy world with gathering world |
| Skill levels | **Start at 0**, level 1 is first trained level (keep current) |
| Inventory model | **Slots with stack limits** |
| Location/Item types | **String IDs** with runtime validation |
| Combat/Contracts | **Keep** — used now, will be used in future |
| Woodcrafting | **Add as 5th skill** (Combat stays dormant for MVP) |
| Node persistence | **In-memory only** (per CLAUDE.md) |
| Appraisal | **Full explicitness** — reveals all info, skill affects extraction |

---

## Phase 1: Type System Foundation

**Goal:** Extend types to support string IDs, new structures, and the 5th skill.

### 1.1 Convert to String IDs

```typescript
// Before: type LocationID = "TOWN" | "MINE" | "FOREST"
// After:
type LocationID = string
type ItemID = string
type NodeID = string
type MaterialID = string  // Same as ItemID but semantic distinction
```

### 1.2 Add New Enums

```typescript
enum DistanceBand { TOWN = "TOWN", NEAR = "NEAR", MID = "MID", FAR = "FAR" }
enum GatherMode { FOCUS = "FOCUS", CAREFUL_ALL = "CAREFUL_ALL", APPRAISE = "APPRAISE" }
enum NodeType { ORE_VEIN = "ORE_VEIN", TREE_STAND = "TREE_STAND" }
```

### 1.3 Add Woodcrafting Skill

```typescript
type SkillID = "Mining" | "Woodcutting" | "Combat" | "Smithing" | "Woodcrafting"
type GatheringSkillID = "Mining" | "Woodcutting"
type CraftingSkillID = "Smithing" | "Woodcrafting"
```

### 1.4 New Location Interface

```typescript
interface Location {
  id: LocationID
  name: string
  band: DistanceBand
  travelTicksFromTown: number
  nodePools: string[]  // Node pool IDs for generation
  requiredGuildReputation: number | null  // Hook for future
}
```

### 1.5 New Node & MaterialReserve Interfaces

```typescript
interface MaterialReserve {
  materialId: MaterialID
  remainingUnits: number
  maxUnitsInitial: number
  requiresSkill: GatheringSkillID
  requiredLevel: number  // Level needed to focus-extract
  tier: number  // Affects XP multiplier and variance
  fragility?: number  // Influences collateral damage (optional)
}

interface Node {
  nodeId: NodeID
  nodeType: NodeType
  locationId: LocationID
  materials: MaterialReserve[]
  depleted: boolean
}
```

### 1.6 Update WorldState

```typescript
interface WorldState {
  // ... existing fields ...
  world: {
    locations: Location[]  // Was LocationID[]
    travelCosts: Record<string, number>
    nodes: Node[]  // NEW: replaces resourceNodes for gathering MVP
    resourceNodes: ResourceNode[]  // KEEP for combat/legacy
    enemies: Enemy[]
    recipes: Recipe[]
    contracts: Contract[]
    storageLocation: LocationID
  }
}
```

### Files Modified
- `src/types.ts`

### Tests
- Type compilation tests
- Existing tests should still pass (backward compat for old structures)

---

## Phase 2: World Factory

**Goal:** Create gathering world with 7 locations and node generation.

### 2.1 Location Definitions

```typescript
const LOCATIONS: Location[] = [
  { id: "TOWN", name: "Town", band: DistanceBand.TOWN, travelTicksFromTown: 0, nodePools: [], requiredGuildReputation: null },
  { id: "OUTSKIRTS_MINE", name: "Outskirts Mine", band: DistanceBand.NEAR, travelTicksFromTown: 3, nodePools: ["near_ore"], requiredGuildReputation: null },
  { id: "COPSE", name: "Copse", band: DistanceBand.NEAR, travelTicksFromTown: 3, nodePools: ["near_trees"], requiredGuildReputation: null },
  { id: "OLD_QUARRY", name: "Old Quarry", band: DistanceBand.MID, travelTicksFromTown: 8, nodePools: ["mid_ore"], requiredGuildReputation: null },
  { id: "DEEP_FOREST", name: "Deep Forest", band: DistanceBand.MID, travelTicksFromTown: 8, nodePools: ["mid_trees"], requiredGuildReputation: null },
  { id: "ABANDONED_SHAFT", name: "Abandoned Shaft", band: DistanceBand.FAR, travelTicksFromTown: 15, nodePools: ["far_ore"], requiredGuildReputation: null },
  { id: "ANCIENT_GROVE", name: "Ancient Grove", band: DistanceBand.FAR, travelTicksFromTown: 15, nodePools: ["far_trees"], requiredGuildReputation: null },
]
```

### 2.2 Material Definitions

```typescript
// Mining materials
const MATERIALS = {
  // NEAR tier (tier 1)
  STONE: { tier: 1, skill: "Mining", requiredLevel: 1 },
  COPPER_ORE: { tier: 1, skill: "Mining", requiredLevel: 1 },

  // NEAR tier 2 (requires L2)
  TIN_ORE: { tier: 2, skill: "Mining", requiredLevel: 2 },

  // MID tier (requires L5+ to access location, L5/L8 to focus)
  IRON_ORE: { tier: 3, skill: "Mining", requiredLevel: 5 },
  SILVER_ORE: { tier: 4, skill: "Mining", requiredLevel: 8 },

  // FAR tier (requires L9+ to access)
  DEEP_ORE: { tier: 5, skill: "Mining", requiredLevel: 9 },

  // Woodcutting equivalents...
  GREEN_WOOD: { tier: 1, skill: "Woodcutting", requiredLevel: 1 },
  // etc.
}
```

### 2.3 Node Generation

```typescript
function generateNodes(playerId: string, rng: RngState): Node[] {
  // Deterministic generation based on player seed
  // For each location with nodePools:
  //   Generate N nodes per pool
  //   Each node has 2-4 materials appropriate to band
  //   Materials have randomized initial amounts
}
```

### 2.4 Travel Cost Generation

Generate travel costs between all location pairs based on `travelTicksFromTown`.

### Files
- `src/world.ts` (modify `createToyWorld` → `createGatheringWorld`)
- `src/materials.ts` (new)
- `src/nodeGeneration.ts` (new)

### Tests
- World creation produces valid locations
- Node generation is deterministic per seed
- Travel costs are symmetric and reasonable

---

## Phase 3: Gather Action Overhaul

**Goal:** Replace binary gather with multi-mode extraction system.

### 3.1 New GatherAction Structure

```typescript
interface GatherAction {
  type: "Gather"
  nodeId: NodeID
  mode: GatherMode
  focusMaterialId?: MaterialID  // Required for FOCUS mode
}
```

### 3.2 Extraction Logic

```typescript
interface ExtractionResult {
  ticksSpent: number
  extracted: ItemStack[]
  focusWaste: number
  collateralDamage: Record<MaterialID, number>
  xpGained: { skill: SkillID, amount: number }
  source: string  // "node_extraction"
  variance: {
    expectedYield: number
    actualYield: number
    range: [number, number]
  }
}
```

### 3.3 Mode Implementations

**APPRAISE mode:**
- Cost: 1 tick
- Returns: Full node info (materials, amounts, focusable status)
- XP: 0 (or minimal)

**FOCUS mode:**
- Select one material to extract
- Apply yield formula with variance
- Apply collateral damage to other materials
- XP = ticks × tier

**CAREFUL_ALL mode:**
- Extract small amounts of all materials
- No collateral damage
- Higher tick cost
- Lower throughput

### 3.4 Yield Formula Implementation

```typescript
function calculateFocusYield(
  level: number,
  requiredLevel: number,
  baseAttempt: number,
  band: DistanceBand,
  rng: RngState
): { expected: number, actual: number, range: [number, number] } {
  // focusYieldFrac: 0.40 at requiredLevel → 1.00 at level 10
  const levelWindow = 10 - requiredLevel
  const progress = Math.min(1, (level - requiredLevel) / levelWindow)
  const focusYieldFrac = 0.40 + (0.60 * progress)

  const expected = baseAttempt * focusYieldFrac
  const variance = getVarianceForBand(band)  // FAR > MID > NEAR
  const actual = rollFromDistribution(expected, variance, rng)

  return { expected, actual, range: [expected - variance, expected + variance] }
}
```

### 3.5 Collateral Damage Formula

```typescript
function calculateCollateralDamage(
  level: number,
  impactedUnits: number
): number {
  // 0.80 at low level → 0.20 minimum floor
  const damageFrac = Math.max(0.20, 0.80 - (level - 1) * 0.067)
  return Math.round(impactedUnits * damageFrac)
}
```

### Files
- `src/engine.ts` (modify gather handling)
- `src/gather.ts` (new — extraction logic)
- `src/actionChecks.ts` (update gather validation)

### Tests
- APPRAISE returns correct info
- FOCUS extracts with variance
- FOCUS causes collateral damage
- CAREFUL_ALL has no collateral
- Collateral floor is enforced
- XP = ticks × tier

---

## Phase 4: Skill Unlocks

**Goal:** Implement unlock system that gates actions/materials/locations.

### 4.1 Unlock Check Functions

```typescript
function canAccessLocation(skill: SkillState, location: Location): boolean
function canFocusMaterial(skill: SkillState, material: MaterialReserve): boolean
function canUseGatherMode(skill: SkillState, mode: GatherMode, nodeType: NodeType): boolean
```

### 4.2 Mining Unlocks (L0-L10)

| Level | Unlock |
|-------|--------|
| 0 | Untrained |
| 1 | NEAR ore nodes, focus tier-1 ores |
| 2 | Focus tier-2 ores in NEAR |
| 3 | APPRAISE mode for ore nodes |
| 4 | CAREFUL_ALL mode for ore nodes |
| 5 | Access MID locations, focus tier-3 ores |
| 6 | Reduced collateral baseline (step) |
| 7 | HIGH_VARIANCE mode (higher attempt, higher collateral) |
| 8 | Focus tier-4 ores (MID rare) |
| 9 | Access FAR locations, focus tier-5 ores |
| 10 | Perfect focus yield (0% waste) |

### 4.3 Similar tables for Woodcutting, Smithing, Woodcrafting

### Files
- `src/unlocks.ts` (new)
- `src/actionChecks.ts` (integrate unlock checks)

### Tests
- Each unlock properly gates its feature
- Level-up immediately enables new capabilities

---

## Phase 5: Inventory Extensions

**Goal:** Add stack limits and container support.

### 5.1 Item Definitions with Stack Limits

```typescript
interface ItemDefinition {
  id: ItemID
  name: string
  stackLimit: number  // e.g., 64 for ores, 1 for tools
  category: "raw_ore" | "raw_wood" | "processed" | "container" | "tool"
}
```

### 5.2 Container Logic

```typescript
interface Container {
  itemId: ItemID  // e.g., "ORE_CRATE"
  capacity: number  // Virtual slots
  allowedCategories: string[]  // e.g., ["raw_ore"]
  compressionRatio: number  // e.g., 2x effective capacity
}
```

### 5.3 Inventory Validation

Update `canAddToInventory` to respect stack limits.

### Files
- `src/types.ts` (add ItemDefinition)
- `src/items.ts` (new — item definitions)
- `src/inventory.ts` (new — container logic)

### Tests
- Stack limits enforced
- Containers only accept allowed categories
- Compression works correctly

---

## Phase 6: Logging & Polish

**Goal:** Update ActionLog for new gather system.

### 6.1 Extended ActionLog

```typescript
interface ActionLog {
  // ... existing fields ...

  // New for gathering:
  extraction?: {
    mode: GatherMode
    focusMaterial?: MaterialID
    extracted: ItemStack[]
    focusWaste: number
    collateralDamage: Record<MaterialID, number>
    variance: {
      expected: number
      actual: number
      range: [number, number]
    }
  }

  xpSource?: string  // "node_extraction", "contract_bonus", etc.
}
```

### 6.2 Waste Summary Generation

```typescript
function formatWasteSummary(log: ActionLog): string {
  // Human-readable summary:
  // "Extracted 5 COPPER_ORE (expected 4.2, range 2-7)"
  // "Wasted 2 focus units, destroyed 3 TIN_ORE (collateral)"
}
```

### Files
- `src/types.ts` (extend ActionLog)
- `src/engine.ts` (populate new log fields)
- `src/logging.ts` (new — summary formatters)

---

## Phase 7: Acceptance Tests

Implement tests for each spec acceptance criterion:

### Geography
1. ✓ Travel time constant, not modified by skills
2. ✓ FAR materials impossible in NEAR locations

### Node Persistence
3. ✓ Extraction reduces reserves, persists in WorldState
4. ✓ Nodes never regenerate

### Multi-Material and Destruction
5. ✓ Nodes have 2+ materials
6. ✓ Focus extraction causes collateral (unless CAREFUL_ALL)
7. ✓ Focus waste → 0% at L10
8. ✓ Collateral floor (20%) enforced

### Variance
9. ✓ Yield varies around EV
10. ✓ FAR variance > NEAR variance
11. ✓ Variance is logged/visible

### Inventory Tradeoff
12. ✓ CAREFUL_ALL slower but no collateral
13. ✓ Containers enable longer loops

### Progression
14. ✓ Level-ups unlock new capabilities
15. ✓ L10 = perfect focus, collateral floor remains

### XP Model
16. ✓ XP = ticks × tier
17. ✓ Bad RNG doesn't reduce XP

---

## Implementation Order

```
Phase 1: Type System         [~200 lines]  ← START HERE
    ↓
Phase 2: World Factory       [~300 lines]
    ↓
Phase 3: Gather Overhaul     [~400 lines]  ← Core mechanic
    ↓
Phase 4: Skill Unlocks       [~200 lines]
    ↓
Phase 5: Inventory           [~150 lines]  ← Can defer some
    ↓
Phase 6: Logging             [~100 lines]
    ↓
Phase 7: Acceptance Tests    [~300 lines]
```

**Total estimate:** ~1,650 lines new/modified code

---

## Files to Create/Modify

| File | Action | Phase |
|------|--------|-------|
| `src/types.ts` | Modify | 1, 5, 6 |
| `src/world.ts` | Modify | 2 |
| `src/materials.ts` | Create | 2 |
| `src/nodeGeneration.ts` | Create | 2 |
| `src/gather.ts` | Create | 3 |
| `src/unlocks.ts` | Create | 4 |
| `src/items.ts` | Create | 5 |
| `src/inventory.ts` | Create | 5 |
| `src/logging.ts` | Create | 6 |
| `src/engine.ts` | Modify | 3, 6 |
| `src/actionChecks.ts` | Modify | 3, 4 |
| `src/gather.test.ts` | Create | 3, 7 |
| `src/unlocks.test.ts` | Create | 4 |
| `src/acceptance.test.ts` | Create | 7 |

---

## Ready to Implement

Plan is finalized. Confirm to proceed with Phase 1.
