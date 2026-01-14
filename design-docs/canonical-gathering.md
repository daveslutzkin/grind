## Gathering Canon — Mining

### Purpose

Gathering exists to extract resources from the world, one unit at a time.

Mining is deliberate, interruptible, and rewards mastery.

---

### Core Concepts

#### Nodes

Nodes are resource extraction points discovered in wilderness areas. Each node contains exactly 3 materials.

**Material composition:**
- **Primary material**: Determined by distance band (see below)
- **Secondary materials**: One tier above and one tier below the primary
- **Edge cases**: First tier (Stone) has two above; last tier (Obsidium) has two below

**Node tier by distance:**

| Distance | Primary Material | Secondary Materials |
|----------|------------------|---------------------|
| 1-8      | Stone            | Copper, Tin |
| 9-16     | Copper           | Stone, Tin |
| 17-24    | Tin              | Copper, Iron |
| 25-32    | Iron             | Tin, Silver |
| 33-40    | Silver           | Iron, Gold |
| 41-48    | Gold             | Silver, Mithril |
| 49-56    | Mithril          | Gold, Obsidium |
| 57-64    | Obsidium         | Gold, Mithril |

**Out-of-level nodes**: ~5% of nodes are shifted one tier from expected:
- 2.5% one tier lower
- 2.5% one tier higher
- At edges, the full 5% goes the only available direction

**Material quantities:**
- **Primary**: 5-20 units (normal distribution)
- **Secondary**: 10-90% of primary amount (normal distribution centered at 50%, hard capped)

**Node depletion**: When all materials are exhausted, the node remains but is marked depleted and unusable.

---

### Gathering Modes

#### FOCUS Mode

Extract one unit of a specific material you choose.

- **Available**: From level 1
- **Time**: ~20 ticks base (normal distribution 15-25, 2.5% tails)
- **Collateral damage**: Damages other materials in the node (fractional)
- **Output**: 1 unit to inventory, 1 XP

**Collateral damage rates** (varies by Waste mastery for target material):
- No mastery: 40%
- Waste I (M3): 30%
- Waste II (M11): 15%
- Waste III (M19): 5%

Materials track fractional units internally; display rounded.

#### CAREFUL Mode

Extract one unit of a random material (from those you've unlocked Careful for).

- **Available**: Per-material unlock at M16 (Careful mastery)
- **Time**: 2x the slowest material's speed in the node
- **Collateral damage**: None
- **Output**: 1 unit to inventory, 1 XP
- **Material selection**: Random from materials where you have M16 Careful

If you have no materials with Careful unlocked in a node, CAREFUL mode fails.

#### APPRAISE (Passive)

See quantities of materials you've unlocked Appraise for.

- **Available**: Per-material unlock at M6 (Appraise mastery)
- **Effect**: Auto-displays quantities in node view for that material
- **No action required**: Happens automatically when viewing nodes

---

### Speed Progression

Gather time varies by material mastery:

| Mastery | Ticks |
|---------|-------|
| Base    | 20    |
| Speed I (M2) | 15 |
| Speed II (M9) | 10 |
| Speed III (M17) | 5 |

Time has normal distribution variance (±5 ticks at base, scaling proportionally).

CAREFUL mode doubles the slowest material's time.

---

### Bonus Yield

At higher mastery, chance to extract 2 units instead of 1:

| Mastery | Chance |
|---------|--------|
| Bonus Yield I (M10) | 5% |
| Bonus Yield II (M20) | 10% |

When triggered:
- Consumes 1 unit from node
- Gives 2 units to player
- Gives 2 XP

---

### XP and Leveling

**XP gain**: 1 XP per unit mined (2 XP on bonus yield)

**XP thresholds**: Same as Exploration skill

**Material unlocks** (when you can mine a material):
- Stone: Level 1
- Copper: Level 20
- Tin: Level 40
- Iron: Level 60
- Silver: Level 80
- Gold: Level 100
- Mithril: Level 120
- Obsidium: Level 140

---

### Guild Requirement

You must be enrolled in the Mining Guild to mine. There is no "without guild" fallback like exploration.

---

### Inventory and Failure

**Mined materials go directly to inventory.**

**Pre-flight check**: Mining fails before starting if:
- Inventory is full
- Node is depleted
- You haven't unlocked the target material (FOCUS mode)
- You have no Careful-unlocked materials in the node (CAREFUL mode)

---

### REPL Interaction

Each mining action extracts 1 unit, then prompts:

```
Mined 1 Stone (14t — 6t faster, lucky)
Continue mining? (y/n)
```

Prompt appears after every unit. No auto-continue (for now).

---

### Luck Surfacing

Per RNG canon, all randomness must be explicit and measured.

**Show on each extraction:**
- Actual ticks taken
- Expected ticks (based on Speed mastery)
- Luck delta: `(expected - actual)` ticks saved/lost

**Track cumulatively:**
- Total mining luck delta
- Surfaces whether player is running hot or cold

---

### Actions

#### Mine (FOCUS)

```
Mine [materialId]
```

- Requires: At a GATHERING_NODE location with an ore vein
- Requires: Material unlocked (have M1 for that material)
- Effect: Extract 1 unit of specified material
- Time: Based on Speed mastery for that material
- Collateral: Damages other materials based on Waste mastery

#### Mine (CAREFUL)

```
Mine careful
```

- Requires: At least one material in node has M16 Careful unlocked
- Effect: Extract 1 unit of random Careful-unlocked material
- Time: 2x slowest material's speed
- Collateral: None

---

### Mastery Summary

Each material has 25 mastery levels. Key unlocks:

| Mastery | Gain | Effect |
|---------|------|--------|
| M1 | Unlock | Can mine this material |
| M2 | Speed I | 20 → 15 ticks |
| M3 | Waste I | 40% → 30% collateral |
| M6 | Appraise | See quantities of this material |
| M9 | Speed II | 15 → 10 ticks |
| M10 | Bonus Yield I | 5% chance of double |
| M11 | Waste II | 30% → 15% collateral |
| M16 | Careful | Can use CAREFUL mode for this material |
| M17 | Speed III | 10 → 5 ticks |
| M19 | Waste III | 15% → 5% collateral |
| M20 | Bonus Yield II | 10% chance of double |
| M25 | Grandmaster | Extract high-grade from bulk |

See `level-specs/mining-levels-1-200.md` for complete progression.

---

### Open Questions / Future Work

1. **Woodcutting**: Will follow similar pattern once more wood tiers are added
2. **Continuous mining**: May unlock auto-continue at higher levels
3. **Handling mastery**: Movement speed penalty from carrying materials (not yet implemented)
4. **Scavenge**: Finding materials during travel (not yet implemented)

---

### Guiding Check

Does each mining action feel like a deliberate choice?

If mining becomes "hold down enter", the pacing is wrong.
