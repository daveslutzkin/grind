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

### 4. Survey-Needed Indicator in Travel
**Status:** Not started
**Description:** After exploring, connected areas appear in Travel list with costs but can't be traveled to until Surveyed. Confusing UX - should either not show unsurveyed areas, or mark them "(needs survey)".

### 5. Node Discovery Persistence
**Status:** Not started
**Description:** Nodes discovered before acquiring the gathering skill don't appear when returning with the skill. Ore vein found in area-d1-i0 wasn't visible after getting Mining skill. Discoveries should persist.

### 6. Node Visibility Tiers (Design Doc Gap)
**Status:** Not started
**Description:** Design doc specifies three tiers: (1) no skill = type only, (2) has skill = material names, (3) appraised = quantities. Currently only showing "Ore vein" regardless of state. Need to implement material visibility.

### 7. Show Gatherable Materials with Skill Requirements
**Status:** Not started
**Description:** When viewing a node, show what materials are available and what skill level each requires. Help players understand what they can gather vs. what they need to level for.

---

## Hard / Design Work

### 8. Contracts as Primary Decision Interface (Design Doc Gap)
**Status:** Not started
**Description:** Design docs say contracts are "the primary interface for choosing risk, variance, and commitment" and should be "optimisation problems with terms." Currently contracts appear passively with no visible risk/reward/variance info. Need to make contracts the central pull of gameplay.

### 9. Strategic Exploration (Design Doc Gap)
**Status:** Not started
**Description:** Design doc asks: "Does exploration make WHERE to explore more interesting than the ACT of exploring?" Currently it's pure button-mashing with no strategic choice. Need to surface knowledge bonuses, risk/reward of pushing deeper, and trade-offs between survey/explore.

### 10. Transformative Level-Ups (Design Doc Gap)
**Status:** Not started
**Description:** Design docs say "every meaningful level unlocks a new action, risk profile, or removes a constraint." Currently level-ups feel invisible. Need to make unlocks explicit and impactful. The APPRAISE@L3 teaser is good - need more of this.

### 11. Early Inventory Pressure (Design Doc Gap)
**Status:** Not started
**Description:** Design docs say "running out of space is expected, not exceptional." With 20 slots and slow gathering, inventory never creates decisions. Need earlier constraint to make inventory strategic.

### 12. Guild Depth (Design Doc Gap)
**Status:** Not started
**Description:** Design docs say guilds are "primary progression scaffolding" with faction identity, reputation, and contracts. Currently just enrollment checkpoints. Need to add guild-specific flavor, meaningful reputation, and guild-driven contracts.

---

## Notes

- Items 1-7 are implementation fixes (bugs or missing features)
- Items 8-12 require design decisions before implementation
- RNG transparency is already well-implemented per design docs
- Session summary display is good
