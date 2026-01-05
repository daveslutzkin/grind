# Spec: Multi-Location Gathering + Destructive Multi-Material Nodes + 4 Skills to Level 10

## Scope (MVP)

Implement:
- Skills (level 1–10):
  - Mining
  - Smithing
  - Woodcutting
  - Woodcrafting
- Expanded map with multiple locations at different distances from TOWN
- Persistent player-instanced resource nodes that:
  - exist in specific locations
  - contain multiple materials
  - deplete gradually per material
  - do not recover
  - are affected by destructive extraction (collateral damage)
- Inventory pressure and "take everything vs focus" tradeoffs
- Skill progression that:
  - unlocks new actions and capabilities (not just % bonuses)
  - reduces waste and collateral damage
  - hard-gates some materials by distance
- No combat, no contracts
- Exploration skill is not implemented, but design must not block adding it later

## Out of Scope

- Markets/economy
- Crafting trees beyond what's needed to support inventory/logistics
- Multiplayer/shared nodes (nodes are instanced per player)
- Regeneration, respawns as "recovery" (nodes do not recover)

---

## Design Invariants (Non-Negotiable)

1. **Time is the primary cost of failure**
   No permanent penalties, no loss of skills/levels/items. Bad outcomes waste time.

2. **Travel time is fixed by geography**
   No skill reduces travel time directly. Skills reduce inefficiency, not distance.

3. **Ceiling increases with distance (and variance increases too)**
   Far locations can contain materials or node types that are impossible near town.

4. **Nodes are multi-material and path-dependent**
   Extracting one material can permanently damage other materials in the same node.

5. **Focus material can reach 0% loss at mastery**
   Eventually you can extract a chosen "focus" material with no waste.

6. **Collateral damage has a hard floor (e.g. min 20% loss)**
   Non-focus materials always suffer some irreducible damage from extraction.

7. **Waste is explicit but aggregated**
   Show waste summaries per node interaction / visit / run summary, not per-roll spam.

8. **Nodes do not recover**
   Once depleted/damaged, they stay that way. (Future exploration adds new nodes instead.)

---

## Core Concepts

### Ticks

The game is tick-based. All actions consume ticks.

Define:
- tick = the smallest time unit.
- Every action returns: `{ticksSpent, outcomes, inventoryChanges, skillXP}`

---

## World & Locations

### Locations

Replace the old 3-location world with multiple locations.

Each location has:
- `id`: string
- `name`: string
- `band`: enum (NEAR, MID, FAR)
- `travelTicksFromTown`: integer (fixed)
- `nodePools`: list of node pool IDs available in this location (mining/woodcutting)
- `requiredGuildReputation`: null for MVP (hook for future guild-gating)
- `notes`: optional

### Suggested MVP Locations (example set)

- TOWN (hub, crafting stations, no gathering nodes)
- NEAR:
  - OUTSKIRTS_MINE (near mining)
  - COPSE (near woodcutting)
- MID:
  - OLD_QUARRY (mid mining)
  - DEEP_FOREST (mid woodcutting)
- FAR:
  - ABANDONED_SHAFT (far mining)
  - ANCIENT_GROVE (far woodcutting)

You can name them differently; what matters is distance tiers.

---

## Inventory

### Inventory Model

- Inventory has finite capacity by slots or weight. Choose one now and keep it consistent.
- Items can stack (define stack rules).
- "Bulk" materials (logs, ore) should pressure inventory early.

### Items to Support MVP

At minimum you need:
- Raw materials:
  - STONE, COPPER_ORE, IRON_ORE, DEEP_ORE (placeholder), etc.
  - GREEN_WOOD, HARD_WOOD, ANCIENT_WOOD, etc.
- Processed materials:
  - Bars: COPPER_BAR, IRON_BAR, etc.
  - Planks: PLANKS_*
- Containers (crafted via woodcrafting) to implement "specialised storage beats raw capacity":
  - ORE_CRATE (compress ores only; blocks wood)
  - LOG_BUNDLE (compress logs only; blocks ore)
  - GENERAL_CRATE (small, flexible, weak compression)
  (Compression can be implemented as "virtual slots" for allowed item types.)

MVP can implement 1–2 container types if needed; the system should support more.

---

## Skills: Levels & XP

### Skill XP and Level

- Each skill has:
  - `xp`: number
  - `level`: 1..10
- Define a deterministic XP-to-level function.
- Levels are lumpy: level-up should unlock something meaningful.

### Requirements

- XP carries over.
- Level cap = 10 for MVP.
- On level-up, unlocks become active immediately.

---

## Nodes (Core System)

### Node Definition (Player-Instanced)

A node is an object in a location that contains multiple materials.

### Node Fields

- `nodeId`: string
- `nodeType`: enum (e.g. ORE_VEIN, TREE_STAND)
- `locationId`: string
- `materials`: map<materialId, MaterialReserve>
- `state`: NodeState (optional: "stability", "exposed layers", etc.)
- `discoveredAtTick`: int (optional)
- `depleted`: boolean when all reserves are 0

### MaterialReserve

For each material inside a node:
- `materialId`: string
- `remainingUnits`: int (or float)
- `maxUnitsInitial`: int (for summaries)
- `requiresSkill`: which gathering skill unlock gates extraction (mining/woodcutting)
- `requiredLevel`: level required to focus-extract it
- `tier`: material tier (affects XP multiplier and variance)
- optional:
  - `fragility`: influences collateral damage
  - `rarityTier`: for UI + balancing

### Instancing Rule

Nodes are per-player and persist across sessions. No sharing.

### No Recovery Rule

Node material reserves never regenerate.

---

## Destructive Extraction (The Key Mechanic)

### Terminology

- **Focus material**: the material the player chooses to extract on an action.
- **Collateral materials**: other materials present in the node.

### Each Extraction Action

1. Attempts to extract some amount of focus material.
2. Applies collateral damage (loss) to other materials.
3. Depletes the focus material by extracted amount + focus waste (if any).

### Focus Loss

- Early levels: you may only successfully extract e.g. 40% of what you "attempt" (rest wasted)
- At mastery: focus loss can reach 0% (100% yield)

### Collateral Loss

- Extracting A damages B/C in the node.
- Collateral loss improves with level but has a hard floor, e.g. minimum 20% of collateral impacted.

### "Take Everything" Option

To avoid collateral loss, the player can choose a slower "extract all / careful harvest" action that:
- extracts multiple materials
- requires more ticks and more inventory
- has minimal or no collateral loss (you said: "If you're taking everything then you don't lose anything")

Implement as a separate action mode.

**Important:** "Take everything" should be expensive in ticks and inventory, so it's not always optimal.

---

## Gathering Actions (Mining & Woodcutting)

### Common Action Interface

All gathering actions should be represented as:
- ActionType: GATHER_FOCUS, GATHER_CAREFUL_ALL, APPRAISE_NODE (optional), etc.
- Inputs:
  - nodeId
  - focusMaterialId (for focus modes)
  - mode (optional)
- Output:
  - ticks spent
  - extracted items added to inventory (or dropped if full—define behavior)
  - waste summary (aggregated)
  - XP gained (based on ticks × tier multiplier, not units extracted)
  - `source`: string identifying reward origin (e.g., "node_extraction") — hook for future contract attribution

### Node Appraisal (Early-Biased Signals)

You want mixed feedback with bias toward early signal.

Implement Appraise Node:
- Costs small ticks (e.g. 1)
- Reveals:
  - what materials are in node (maybe partial early)
  - rough "ceiling band" or variance profile
- At higher levels, appraisal becomes more precise (more info, lower uncertainty)

This supports "early signals exist; abort is a safety valve early but rarely optimal later."

MVP can be simplified:
- Appraisal reveals exact list of materials and remaining amounts (since "systems are explicit")
- Skill improvements affect something else (like extraction efficiency), not hidden info

Pick one. If you pick full explicitness, keep it consistent with the canon.

---

## Extraction Formulas (Implementation Guidance)

Extraction uses continuous yield variance (not binary success/fail). Below is one workable approach.

### Inputs

- `L` = relevant gathering skill level (1–10)
- `R_focus` = remaining units of focus material in node
- `R_i` = remaining units for each collateral material i
- `baseAttemptUnits` = how much you try to extract per action (depends on material tier + node type + mode)

### Focus Yield Fraction (with Variance)

Define `focusYieldFrac(L)` from ~0.40 at unlock to 1.00 at mastery. This is the **expected** yield fraction.

Example:
- At requiredLevel to focus-extract material: focusYieldFrac = 0.40
- Scales linearly or via curve to 1.00 at level 10 (or level window)

**Variance Model:**
- Each extraction rolls yield from a distribution centered on EV
- Variance increases with distance band (FAR > MID > NEAR)
- Show player: EV, range, actual result vs expected

```
expectedYield = baseAttemptUnits * focusYieldFrac(L)
actualYield = roll_from_distribution(expectedYield, variance(band, L))
extracted = min(R_focus, round(actualYield))
focusWaste = min(R_focus - extracted, baseAttemptUnits - extracted)
```

Then:
`R_focus -= (extracted + focusWaste)` (waste still depletes the node)

**Note:** Variance should allow outcomes above EV (lucky) and below (unlucky), creating strategic asymmetry per canonical RNG philosophy.

### Collateral Damage Fraction

Define `collateralDamageFrac(L)` improving with level, but with a minimum floor.

Example:
- At low level: 0.80 (destroy 80% of impacted collateral units)
- Improves down to 0.20 minimum (20% floor)

But you also need to define how much collateral is impacted per action.

Simple method:
- For each collateral material i:
  - `collateralImpactedUnits = round(baseAttemptUnits * impactWeight_i)`
  - `collateralDestroyed = min(R_i, round(collateralImpactedUnits * collateralDamageFrac(L)))`
  - `R_i -= collateralDestroyed`

Where `impactWeight_i` might depend on:
- material fragility / adjacency
- whether the collateral material is "above/below" focus layer

MVP: fixed weights per node type is fine.

### Careful "Take Everything" Mode

For GATHER_CAREFUL_ALL:
- Spend more ticks
- Extract small amounts of multiple materials
- Set collateralDestroyed = 0 (or near 0)
- Focus yield fraction is high even at low levels (since you're being careful), but throughput is low.

---

## Skill Unlocks (Levels 1–10)

These unlocks should primarily change capabilities / risk profiles / logistics, not only %.

Below is a suggested set consistent with the new node system and geography. It's a starting point—Claude should implement these as unlock flags and wire them into action availability and formulas.

### Mining (1–10)

- L1: Can mine NEAR ore nodes; focus extract only lowest-tier ore
- L2: Unlock focus extraction for next-tier ore in NEAR nodes (still destructive)
- L3: Unlock APPRAISE_NODE for mining nodes
- L4: Unlock GATHER_CAREFUL_ALL for ore nodes (slow, inventory heavy, preserves collateral)
- L5: Access MID mining locations and MID-only ores (hard-gated by distance)
- L6: Reduced collateral damage baseline (step change)
- L7: Unlock "High-variance strike" mode: higher baseAttemptUnits but higher collateral impact (explicit)
- L8: Unlock focus extraction for MID rare ore layers (higher ceiling)
- L9: Access FAR mining locations and FAR-only ores (hard-gated)
- L10: Perfect focus extraction for all mining materials (focusLoss→0), collateral floor still applies

### Woodcutting (1–10)

- L1: Can harvest NEAR trees; lowest-tier wood
- L2: Unlock next-tier wood in NEAR
- L3: Unlock APPRAISE_NODE for tree stands
- L4: Unlock GATHER_CAREFUL_ALL for trees (slow but preserves collateral species)
- L5: Access MID wood locations + MID-only wood types
- L6: Unlock "Field Prep" action (requires Woodcrafting L6 portable kit; logs→bundled logs for transport compression; not real crafting)
- L7: Unlock "Aggressive felling" mode (higher throughput, higher collateral damage)
- L8: Unlock focus extraction for MID rare wood layers/species
- L9: Access FAR wood locations + FAR-only woods
- L10: Perfect focus extraction for all wood materials (focusLoss→0), collateral floor remains

### Smithing (1–10) — stabilises and enables compression/value

Smithing should turn bulky ores into more compact, more useful forms, and introduce commitment.

- L1: Smelt basic bars from lowest ores (lossy)
- L2: Reduced smelting loss for basic bars (step)
- L3: Unlock smelting of next-tier bars (enables mining tier)
- L4: Unlock "batch smelt" (commit inventory + ticks for efficiency; no cancel)
- L5: Unlock MID-tier alloys/bars (required to make better tools/containers)
- L6: Unlock "refine impurities" (convert junk byproduct into something useful OR discard for quality)
- L7: Unlock components (nails, brackets) needed for woodcrafting containers
- L8: Unlock "overcraft attempt" (explicit variance: chance to upgrade output tier, else waste time/material)
- L9: Unlock FAR-tier smelting (required for FAR-tier tools)
- L10: Masterwork attempts (explicit long-tail; transformative outcomes later)

### Woodcrafting (1–10) — logistics and specialised storage

This is where distance becomes strategically manageable without reducing travel time.

- L1: Basic crate (small general container)
- L2: Basic handles/shafts (future tool hooks; can be no-op now)
- L3: Unlock ORE_CRATE (compress ores only; blocks wood)
- L4: Unlock LOG_BUNDLE (compress logs only; blocks ore)
- L5: Unlock structural components (requires smithing components at L7)
- L6: Unlock "portable field kit" crafting (enables Woodcutting L6 Field Prep action; consumable or has durability)
- L7: Unlock modular container upgrades (swap crate inserts rather than crafting new)
- L8: Increased compression ratios (step)
- L9: Unlock hybrid containers (ore + wood limited, less efficient)
- L10: "Infrastructure build" placeholder (not full base-building, just persistent storage at a non-town location if desired later)

---

## Material Gating Rules

### Hard-Gated by Distance

Define a list:
- Materials only appear in MID or FAR locations.
- NEAR locations cannot spawn those materials at all.

This must be enforced in node generation.

### Skill-Gated Within Node

Even if a node contains a high-tier material:
- If player skill < requiredLevel:
  - they cannot choose it as focus
  - it can still be collateral-damaged by other extraction (this is a key mastery pressure)

---

## Node Generation (MVP)

### World Generation Approach

For each player:
- Seed a deterministic RNG with player ID.
- For each location:
  - generate N nodes of each pool type
  - each node:
    - has a mix of materials appropriate to location band
    - includes small chance of "higher tier trace amounts" in near areas if you want
    - BUT remember: some resources are impossible near town (hard gate)
- Nodes persist; their reserves change with extraction.

### Important

Because exploration isn't implemented yet, you still need "enough nodes" to play. Later exploration will add discoverability, but MVP needs a stable world.

---

## UI / Feedback Requirements (Minimal)

### Node View

When interacting with a node, player can inspect:
- materials present (and whether focusable)
- remaining amounts (explicit)
- location distance/time
- action modes available

### Waste Summary (Aggregated)

After each node interaction session (or per action batch):
Show:
- focus extracted
- focus wasted
- collateral destroyed by material
- ticks spent

Keep it explicit and inspectable.

---

## Future: Exploration (Design Hook Only)

Don't implement, but ensure architecture supports:
- Adding new nodes later via exploration:
  - nodes can be appended to a location's node list
  - or "hidden nodes" can be revealed/unlocked
- Skill thresholds:
  - high exploration + high gathering = discover higher ceiling nodes

### Implementation Hook

- Location should support `addNode(node)` at runtime
- Node generator should support "generate additional nodes" post-start

---

## Acceptance Tests (What Claude Code Should Validate)

### Geography

1. Travel time to each location is constant and never modified by skills/items.
2. FAR locations can contain materials that NEAR locations cannot contain at all.

### Node Persistence

3. Extracting from a node reduces reserves and persists across sessions.
4. Nodes never regenerate.

### Multi-Material and Destruction

5. Nodes contain at least 2 materials in most cases.
6. Focus extraction reduces collateral materials in the node (unless using careful-all mode).
7. Focus material expected waste decreases with level and can reach 0% at mastery.
8. Collateral destruction decreases with level but never below the configured floor.

### Variance

9. Extraction yield varies around expected value (continuous variance, not binary success/fail).
10. FAR locations have higher variance than NEAR locations.
11. Variance is explicit: player sees EV, range, and actual vs expected.

### Inventory Tradeoff

12. "Careful take everything" prevents collateral loss but is slower and inventory-heavier.
13. Containers meaningfully change viable loops without changing travel time.

### Progression

14. Level-ups unlock new actions/materials/locations in step changes (not only +%).
15. Level 10 for mining/woodcutting allows perfect expected focus yield but still collateral floor applies.

### XP Model

16. XP is based on ticks spent × material tier, not units extracted.
17. Bad RNG affects yield but not XP (no double-punishment).

---

## Deliverables Claude Code Should Produce

Ask Claude Code to implement:

1. **Data model changes:**
   - Location, Node, MaterialReserve, Inventory, Skill

2. **Node generation per player and per location band**

3. **Action system:**
   - travel
   - gather focus
   - gather careful all
   - appraisal (optional if full explicitness)

4. **Extraction math with:**
   - focus yield curve
   - collateral damage curve with floor

5. **Skill XP and level-up unlock flags**

6. **Minimal UI/console output for:**
   - node inspection
   - waste summaries
   - level unlock messaging

---

## Resolved Design Decisions

### Field Processing (Woodcutting L6)

**Decision:** Allowed as "Field Prep" — a constrained logistics transform, not real crafting.

- Requires a town-crafted kit (e.g., portable field kit from Woodcrafting L6)
- Limited to specific transforms (e.g., logs → rough bundles for transport)
- Does not replace station crafting; it's inventory compression for travel efficiency
- Kit is consumable or has durability

### RNG in Extraction

**Decision:** Continuous yield variance, not binary success/fail.

- Each extraction has explicit expected value (EV) and variance
- Distance increases both ceiling and variance (FAR = higher highs, wider spread)
- Formulas produce a yield distribution, not deterministic output
- Variance is surfaced to the player (show EV, show range, show actual vs expected)

### Contracts + Guilds

**Decision:** Not in MVP, but add hooks for clean integration later.

- Rewards should have a `source` field (e.g., "node extraction", future: "contract bonus")
- XP events should be attributable (for future contract tracking)
- Location access can later be gated by guild reputation (add field, leave null for MVP)

### XP Model

**Decision:** Ticks-based with tier multiplier, not units extracted.

- XP = f(ticksSpent, materialTier)
- Bad RNG affects yield, not XP — don't double-punish bad luck
- Higher-tier materials grant more XP per tick spent extracting them
- This keeps progression predictable while yield remains variable
