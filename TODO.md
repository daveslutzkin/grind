# TODO: Bugs and Improvements from Adaptive Test Runs

Based on adaptive agent test runs (24-action with seed42, 30-action with seed4/test99) and comparison with design docs.

---

## Easy Fixes

### 1. "Top 0%" Luck Display
**Status:** ✅ Completed
**Description:** When luck is extremely good, display shows "Top 0%" which is mathematically awkward.

**Decision:** Use `ceil(pct)` for all percentiles. 0.4% → "Top 1%", 1.4% → "Top 2%", etc. Naturally prevents "Top 0%" with no special cases.

### 2. Node ID Display in Gathering Output
**Status:** Complete
**Description:** UI shows "Gathering: Ore vein" but gather command requires node ID like `area-d1-i1-node-0`. Users cannot discover the correct ID to use.

**Decision:** Only one node per type per location, so skill *is* the identifier. Add commands:
- `mine <mode> [material]` (alias for `gather mining ...`)
- `chop <mode> [material]` (alias for `gather woodcutting ...`)

No node IDs needed in display. Just show types: `Gathering: Ore vein, Tree stand`

**Implementation:** Added `Mine` and `Chop` action types that resolve to `Gather` at runtime by finding the appropriate node (ORE_VEIN or TREE_STAND) in the player's current area.

### 3. Travel Time Display Discrepancy
**Status:** DONE
**Description:** Travel destinations show costs like "2t" but actual travel takes 10x longer (20t). Either the display calculation is wrong or it's showing "base cost" without the multiplier.

**Decision:** Show actual time. `area-d2-i7 (20t)` not `area-d2-i7 (2t)`.

**Fix:** Updated `formatters.ts` to multiply `travelTimeMultiplier` by `BASE_TRAVEL_TIME` (10) to show actual travel time.

---

## Medium Fixes

### 4. Allow Direct Travel to Unknown Areas
**Status:** ✅ Complete
**Description:** Currently get AREA_NOT_KNOWN when trying to travel via a known connection to an unknown area. This is a bug.

**Decision:** Direct travel through a known connection should work even if destination is unknown (you discover the area on arrival). Auto-pathing (multi-hop) still requires all areas on path to be known. Display can show unknown destinations as: `area-d2-i7 (20t, unexplored)`

**Implementation:** Modified `executeExplorationTravel` in `src/exploration.ts` to check for direct known connections first. If a direct connection exists, travel is allowed even to unknown areas. The area is discovered on arrival and added to `knownAreaIds`. Multi-hop paths still require all destinations to be known.

### 5. Location/Node Sync Bug (CONFIRMED)
**Status:** DONE
**Description:** Locations can exist without corresponding nodes, causing "Discovered ore vein" but "Gathering: none visible".

**Root Cause:** (verified with debug script)
- `world.ts` generates nodes with RNG label `location_roll_{area}_ORE_VEIN`
- If rolls fail, area has 0 nodes and 0 locations
- Later, `ensureAreaFullyGenerated` sees `locations.length === 0`
- Calls `generateAreaLocations` with DIFFERENT RNG label `loc_mining_{area}`
- Different labels = different rolls = locations created without nodes

**Solution Implemented:**
- Single source of truth: `generateNodesForArea` in world.ts now generates all area content (gathering nodes+locations AND mob camps)
- Removed `generateAreaLocations` from exploration.ts
- `ensureAreaGenerated` no longer regenerates locations - just marks area as generated
- Mob camps now generated at world creation time alongside gathering nodes

### 6. Show Materials with Skill Requirements (merged with old item 7)
**Status:** Done
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

## New Items (from 30-action test run)

### 7. Add mine/chop commands
**Status:** Done
**Description:** `mine` and `chop` commands were added to agent parser but not to `parseCommand` in `runner.ts`. Forces users to use verbose `gather area-d1-i0-node-0 focus COPPER_ORE` syntax.

**Implementation:** Added `mine` and `chop` cases to `parseAction` in `runner.ts`. Both support the same modes as gather: `focus <material>`, `careful`, and `appraise`. Also updated `printHelp` to document the new commands.

### 8. Fix misleading LOCATION_NOT_DISCOVERED error
**Status:** Done
**Description:** When the parser can't match a location name, it returns an action that fails with "LOCATION_NOT_DISCOVERED". This implies the location exists but isn't discovered, when really the parser just didn't recognize the input.

**Decision:** Improve error message to "Unknown location: X" rather than implying it exists but isn't discovered.

**Implementation:** Added new failure type `UNKNOWN_LOCATION` to types.ts. Updated `checkTravelToLocationAction` in actionChecks.ts to return `UNKNOWN_LOCATION` when the location doesn't exist in the current area, while keeping `LOCATION_NOT_DISCOVERED` for when the location exists but hasn't been discovered yet.

### 9. Material ✓ should respect location tier
**Status:** ✅ Complete
**Description:** D2 node shows "COPPER_ORE ✓" but gathering fails with INSUFFICIENT_SKILL because d2 requires Mining L5. The checkmark implies gatherable but doesn't account for location access requirements.

**Decision:** Show node as locked without listing materials: `Ore Vein 🔒 (Mining L5)`. Don't tease with specific materials you can't access yet.

**Implementation:** Modified `formatters.ts` to check location tier skill requirements before displaying materials. When player's skill level is below the area's requirement (L5 for D2, L9 for D3+), node displays as locked with the required skill level instead of listing materials with misleading checkmarks.

### 10. Require move to node location before gathering
**Status:** ✅ Complete
**Description:** Currently can gather from hub (Clearing) without moving to the node's specific location. Should require moving to the location first.

**Decision:** Accept both node type and display name: `move ore vein`, `move mining`, `move Ore Vein` all work to move to that location in the current area. No need to expose internal location IDs.

### 11. Improve "Discovered node" message
**Status:** Done
**Description:** When discovering a MOB_CAMP, message says "Discovered node" which is vague.

**Decision:** Say "Discovered enemy camp" for MOB_CAMP (already says "ore vein" and "tree stand" for gathering locations).

### 12. Show required skill for other gathering nodes
**Status:** ✅ Complete
**Description:** Tree stand shows "Gathering: Tree stand" with no materials when player lacks Woodcutting skill. Should indicate what skill is needed.

**Decision:** Show both skill and where to get it: "Tree Stand (requires Woodcutting - Foresters Guild)"

**Implementation:** Updated `formatWorldState` in `src/agent/formatters.ts` to show the required skill and guild when the player doesn't have the skill for a gathering node. Added `getGuildForSkill` helper function to map gathering skills to their guild names.

### 13. Reformat location/world state display
**Status:** ✅ Complete
**Description:** Current display is messy. Reformat to:
```
area-d1-i2
- Ore Vein - Stone ✓, Copper Ore ✓, Tin Ore (L2)

Connections: area-d2-i2 (10t), area-d1-i0 (30t), Town (40t)
```
Changes:
- Title: just area name at hub, "Ore Vein (area-d1-i2)" at a location
- Status: only "unexplored" or "partly explored", never "FULLY EXPLORED!"
- Materials: human readable names ("Copper Ore" not "COPPER_ORE"), sorted by unlock level
- Connections: sorted by travel time (shortest first)

**Decision on status:** "unexplored" until first discovery of anything (even a connection), then "partly explored". Never show "fully explored".

### 14. Fractional distances for varied travel times
**Status:** ✅ Completed
**Description:** Currently all travel times are round multiples of 10 (10t, 20t, 30t, 40t). Distances should be fractional so travel times are more varied (13t, 27t, etc).

**Decision:** Use 0.5x to 4.5x multiplier range with base 10t, giving 5t-45t travel times. Generate fractional multipliers (e.g., 1.3x, 2.7x) for varied non-round numbers.

**Implementation:** Updated `rollTravelMultiplier` in `src/exploration.ts` to generate uniform random values between 0.5 and 4.5, rounded to 1 decimal place. Updated type from `1 | 2 | 3 | 4` to `number` in `src/types.ts`.

---

## Notes

- Items 1-6 are implementation fixes (bugs or missing features) - DONE
- Items 7-14 are from second test run
- Design work items moved to NEXT.md
- RNG transparency is already well-implemented per design docs
- Session summary display is good
