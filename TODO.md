# TODO: Bugs and Improvements from Adaptive Test Run

Based on a 24-action adaptive agent test run and comparison with design docs.

---

## Easy Fixes

### 1. "Top 0%" Luck Display
**Status:** Not started
**Description:** When luck is extremely good, display shows "Top 0%" which is mathematically awkward.

**Decision:** Use `ceil(pct)` for all percentiles. 0.4% → "Top 1%", 1.4% → "Top 2%", etc. Naturally prevents "Top 0%" with no special cases.

### 2. Node ID Display in Gathering Output
**Status:** Not started
**Description:** UI shows "Gathering: Ore vein" but gather command requires node ID like `area-d1-i1-node-0`. Users cannot discover the correct ID to use.

**Decision:** Only one node per type per location, so skill *is* the identifier. Add commands:
- `mine <mode> [material]` (alias for `gather mining ...`)
- `chop <mode> [material]` (alias for `gather woodcutting ...`)

No node IDs needed in display. Just show types: `Gathering: Ore vein, Tree stand`

### 3. Travel Time Display Discrepancy
**Status:** Not started
**Description:** Travel destinations show costs like "2t" but actual travel takes 10x longer (20t). Either the display calculation is wrong or it's showing "base cost" without the multiplier.

**Decision:** Show actual time. `area-d2-i7 (20t)` not `area-d2-i7 (2t)`.

---

## Medium Fixes

### 4. Allow Direct Travel to Unknown Areas
**Status:** Not started
**Description:** Currently get AREA_NOT_KNOWN when trying to travel via a known connection to an unknown area. This is a bug.

**Decision:** Direct travel through a known connection should work even if destination is unknown (you discover the area on arrival). Auto-pathing (multi-hop) still requires all areas on path to be known. Display can show unknown destinations as: `area-d2-i7 (20t, unexplored)`

### 5. Location/Node Sync Bug (CONFIRMED)
**Status:** Not started
**Description:** Locations can exist without corresponding nodes, causing "Discovered ore vein" but "Gathering: none visible".

**Root Cause:** (verified with debug script)
- `world.ts` generates nodes with RNG label `location_roll_{area}_ORE_VEIN`
- If rolls fail, area has 0 nodes and 0 locations
- Later, `ensureAreaFullyGenerated` sees `locations.length === 0`
- Calls `generateAreaLocations` with DIFFERENT RNG label `loc_mining_{area}`
- Different labels = different rolls = locations created without nodes

**Decision:** Single source of truth (option C). Remove `generateAreaLocations` from exploration.ts. Use `generateNodesForArea` from world.ts for all area content generation (gathering nodes+locations together, plus mob camps which don't need nodes). Call it lazily from `ensureAreaGenerated`.

### 6. Show Materials with Skill Requirements (merged with old item 7)
**Status:** Not started
**Description:** Currently only shows "Ore vein". Should show materials when you have the skill, with indication of what you can gather.

**Decision:** When displaying a node (and player has the skill):
```
Gathering: Ore vein
  STONE ✓, COPPER_ORE ✓, TIN_ORE (L3)
```
- ✓ = can gather at current level
- (L3) = need level 3
- After APPRAISE: also show quantities

---

## Hard / Design Work

### 7. Contracts as Primary Decision Interface (Design Doc Gap)
**Status:** Not started
**Description:** Design docs say contracts are "the primary interface for choosing risk, variance, and commitment" and should be "optimisation problems with terms." Currently contracts appear passively with no visible risk/reward/variance info. Need to make contracts the central pull of gameplay.

### 8. Strategic Exploration (Design Doc Gap)
**Status:** Not started
**Description:** Design doc asks: "Does exploration make WHERE to explore more interesting than the ACT of exploring?" Currently it's pure button-mashing with no strategic choice. Need to surface knowledge bonuses, risk/reward of pushing deeper, and trade-offs between survey/explore.

### 9. Transformative Level-Ups (Design Doc Gap)
**Status:** Not started
**Description:** Design docs say "every meaningful level unlocks a new action, risk profile, or removes a constraint." Currently level-ups feel invisible. Need to make unlocks explicit and impactful. The APPRAISE@L3 teaser is good - need more of this.

### 10. Early Inventory Pressure (Design Doc Gap)
**Status:** Not started
**Description:** Design docs say "running out of space is expected, not exceptional." With 20 slots and slow gathering, inventory never creates decisions. Need earlier constraint to make inventory strategic.

### 11. Guild Depth (Design Doc Gap)
**Status:** Not started
**Description:** Design docs say guilds are "primary progression scaffolding" with faction identity, reputation, and contracts. Currently just enrollment checkpoints. Need to add guild-specific flavor, meaningful reputation, and guild-driven contracts.

---

## Notes

- Items 1-6 are implementation fixes (bugs or missing features)
- Items 7-11 require design decisions before implementation
- RNG transparency is already well-implemented per design docs
- Session summary display is good
