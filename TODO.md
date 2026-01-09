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
**Status:** ✅ Complete
**Description:** Currently get AREA_NOT_KNOWN when trying to travel via a known connection to an unknown area. This is a bug.

**Decision:** Direct travel through a known connection should work even if destination is unknown (you discover the area on arrival). Auto-pathing (multi-hop) still requires all areas on path to be known. Display can show unknown destinations as: `area-d2-i7 (20t, unexplored)`

**Implementation:** Modified `executeExplorationTravel` in `src/exploration.ts` to check for direct known connections first. If a direct connection exists, travel is allowed even to unknown areas. The area is discovered on arrival and added to `knownAreaIds`. Multi-hop paths still require all destinations to be known.

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

## Notes

- Items 1-6 are implementation fixes (bugs or missing features)
- Design work items moved to NEXT.md
- RNG transparency is already well-implemented per design docs
- Session summary display is good
