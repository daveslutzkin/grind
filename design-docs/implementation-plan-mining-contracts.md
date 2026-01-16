# Implementation Plan: Mining Contracts System

## Overview

Implement procedural mining contracts with gold rewards, map system for "mining without exploration," and map shops at guilds.

This replaces the current hardcoded contract system with a dynamic, level-appropriate contract generation system that rewards money instead of raw materials.

---

## Phase 1: Core Contract System

### 1.1 Add Money System

**Changes to `src/types.ts`:**
- Add `gold: number` to `player` state (default 0)

**Changes to `src/world.ts`:**
- Initialize `player.gold = 0` in `createWorld()`

**Changes to serialization:**
- Ensure gold is persisted and restored

**Changes to visibility/display:**
- Show gold in player status output

---

### 1.2 Delete Existing Contract

**Changes to `src/world.ts`:**
- Remove the hardcoded `miners-guild-1` contract from the `contracts` array
- The `world.contracts` array will be populated dynamically instead

---

### 1.3 Contract Generation

#### Material Tiers and Values

| Material | Unlock Level | Resale Value (gold/unit) | Reputation |
|----------|--------------|--------------------------|------------|
| Stone    | 1            | 0.1                      | +5         |
| Copper   | 20           | 0.4                      | +10        |
| Tin      | 40           | 1.0                      | +20        |
| Iron     | 60           | 2.5                      | +40        |
| Silver   | 80           | 6.0                      | +80        |
| Gold     | 100          | 15.0                     | +160       |
| Mithril  | 120          | 35.0                     | +320       |
| Obsidium | 140          | 80.0                     | +640       |

#### Bounty System

Contract gold reward = (quantity × resale value) × (1 + bounty%)

**Bounty distribution (weighted toward lower end with rare jackpots):**
- Common (70-80% of rolls): 10-50% bounty
- Uncommon (15-20% of rolls): 50-100% bounty
- Rare (5-10% of rolls): 150-200% bounty

#### Quantity Scaling

Quantity scales with player level within each material tier:
- Start of tier: ~5 units
- Mid-tier: ~12 units
- End of tier: ~20 units

Example for Stone (L1-19):
- L1: 5 Stone
- L10: 12 Stone
- L19: 20 Stone

#### Contract Rewards

- **Gold:** quantity × resale value × (1 + bounty)
- **Reputation:** Fixed per tier (see table above)
- **XP:** None (player already earned XP from mining the materials)

#### New File: `src/contracts.ts`

Create contract generation logic:

```typescript
interface ContractGenerationParams {
  playerMiningLevel: number
  existingContracts: Contract[]
  rng: RngState
}

function generateMiningContract(
  slot: 'at-level' | 'aspirational',
  params: ContractGenerationParams
): Contract

function rollBounty(rng: RngState): number // Returns 0.1 to 2.0

function getQuantityForLevel(level: number, tierStartLevel: number, tierEndLevel: number): number

function getMaterialTierForLevel(level: number): MaterialTier
```

---

### 1.4 Contract Slots

**Mining Guild contract display:**
- Slot 1: At-level contract (uses player's highest unlocked material)
- Slot 2: Aspirational contract (next material tier, if one exists)

**Player can only have one active contract at a time.**

**Changes to `src/types.ts`:**
- Consider adding `contractSlots` or similar to track guild-specific available contracts
- Or store generated contracts in `world.contracts` with metadata about which slot they occupy

---

### 1.5 Contract Regeneration

**Triggers:**
1. **On Mining Guild enrolment:** Generate both slots
2. **On contract completion:** Regenerate the completed contract's slot immediately
3. **Aspirational slot:** Occasionally regenerates on its own ("gets bored")

**Aspirational regeneration:**
- Implement as a random chance checked periodically (e.g., on each action, or on each visit to the guild)
- Low probability per check, but will eventually cycle

**Changes to `src/engine.ts`:**
- `executeGuildEnrolment()`: If Mining guild, call contract generation
- `checkAndCompleteContracts()`: After completion, regenerate the slot
- Add aspirational regeneration check

---

## Phase 2: Maps with Contracts

### 2.1 Map Data Structure

**What a mining map reveals:**
- Connection from town (or known area) to target area
- The target area itself
- The specific node location (discovered on arrival)

**Changes to `src/types.ts`:**

```typescript
interface ContractMap {
  targetAreaId: AreaID
  targetNodeId: NodeID
  connectionId: string  // Connection to reveal
}

// Add to Contract interface:
interface Contract {
  // ... existing fields
  includedMap?: ContractMap  // Optional map bundled with contract
}
```

---

### 2.2 Map Inclusion Logic

**When contracts include maps:**
- **Early game (L1-19):** Always include a map
- **Later (L20+):** Include map only if player doesn't know any nodes containing the required material

**Finding a suitable node for the map:**
- Search undiscovered nodes in world
- Must contain the required material
- Must be reachable (connection path exists, even if not yet discovered)
- Prefer closer nodes (lower distance)

**Changes to `src/contracts.ts`:**

```typescript
function shouldIncludeMap(playerLevel: number, requiredMaterial: string, state: WorldState): boolean

function findNodeForMap(requiredMaterial: string, state: WorldState): ContractMap | null
```

---

### 2.3 Map Redemption

**On contract accept (if map included):**
1. Reveal the connection (add to `knownConnectionIds`)
2. Reveal the area (add to `knownAreaIds`)
3. Store the node ID for later discovery

**On arrival at target area:**
1. Auto-discover the node location (add to `knownLocationIds`)
2. Player can now travel to the node and mine

**Changes to `src/engine.ts`:**
- `executeAcceptContract()`: If contract has map, reveal connection + area
- `executeFarTravel()` or arrival logic: Check for pending node discoveries, reveal node

**Changes to `src/types.ts`:**
- Add `pendingNodeDiscoveries: { areaId: AreaID, nodeLocationId: string }[]` to player state
  - Or track on the active contract itself

---

## Phase 3: Map Shops

### 3.1 Mining Guild Shop

**Location:** Mining Guild (town)

**Requirements:**
- Must be enrolled in Mining guild

**Available maps:**
- Tiered selection: "Stone node map", "Copper node map", etc.
- Only shows tiers the player has unlocked
- Purchasing picks an appropriate undiscovered node

**Pricing:**
- Low tiers (Stone, Copper): ~3 contracts worth of gold
- Higher tiers: Relatively cheaper (world is bigger, need more maps)

| Tier     | Approximate Price |
|----------|-------------------|
| Stone    | 3-4 gold          |
| Copper   | 10-12 gold        |
| Tin      | 20-25 gold        |
| Iron     | 40-50 gold        |
| Silver   | 70-90 gold        |
| Gold     | 120-150 gold      |
| Mithril  | 200-250 gold      |
| Obsidium | 350-400 gold      |

(Exact values TBD based on contract reward tuning)

**New action: `BuyMap`**

```typescript
interface BuyMapAction {
  type: "BuyMap"
  mapType: "node" | "area"
  materialTier?: string  // For node maps
  targetDistance?: number  // For area maps
}
```

---

### 3.2 Explorers Guild Shop

**Location:** Explorers Guild (town)

**Requirements:**
- Must be enrolled in Exploration guild

**Available maps:**
- Area maps by distance tier
- Reveals area + all its connections
- Does NOT reveal nodes (explorers don't specialize in finding resources)

**Pricing:**
- 50-70% of equivalent mining guild map price
- Cheaper because less guaranteed value

---

### 3.3 Shop Implementation

**Changes to `src/types.ts`:**
- Add `BuyMapAction` to Action union

**Changes to `src/actionChecks.ts`:**
- Add `checkBuyMapAction()` validation
- Check enrollment, gold, available nodes/areas

**Changes to `src/engine.ts`:**
- Add `executeBuyMap()` handler
- Deduct gold, reveal map contents

**Changes to `src/availableActions.ts`:**
- Show available maps at guild halls

**Changes to `src/visibility.ts`:**
- Display shop inventory and prices

---

## Files Affected Summary

### New Files
- `src/contracts.ts` - Contract generation logic

### Modified Files
- `src/types.ts` - Player gold, ContractMap, BuyMapAction, contract slot metadata
- `src/world.ts` - Remove hardcoded contract, initialize gold
- `src/engine.ts` - Contract generation on enrol/complete, map redemption, buy map
- `src/actionChecks.ts` - Buy map validation
- `src/availableActions.ts` - Shop display, contract display with bounty info
- `src/visibility.ts` - Gold display, contract details
- `src/exploration.ts` - Map revelation helpers

### Test Files
- `src/contracts.test.ts` - New tests for contract generation
- `src/engine.test.ts` - Tests for contract flow, map redemption
- Updates to existing tests that reference the old hardcoded contract

---

## Implementation Order

### Phase 1 (Core)
1. Add `player.gold` field and serialization
2. Delete hardcoded contract
3. Create `src/contracts.ts` with generation logic
4. Implement contract slots and regeneration triggers
5. Wire up gold rewards on contract completion
6. Add tests

### Phase 2 (Maps)
1. Add map data structures
2. Implement map inclusion logic in contract generation
3. Implement map revelation on contract accept
4. Implement node discovery on area arrival
5. Add tests

### Phase 3 (Shops)
1. Add BuyMap action type
2. Implement Mining Guild shop
3. Implement Explorers Guild shop
4. Add pricing logic
5. Add tests

---

## Open Questions / Future Work

- **Aspirational slot regeneration timing:** Exact probability/frequency TBD
- **Shop "no nodes available" edge case:** Deferred for now
- **Higher tier resale values:** Silver through Obsidium values are estimates (~2.5x scaling), may need tuning
- **Exact map prices:** Will depend on final contract reward tuning
- **Reputation usage:** Contracts award reputation, but what reputation unlocks is future work
