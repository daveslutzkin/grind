## Exploration Canon — Discovery and Navigation

### Purpose

Exploration exists to reveal the world incrementally, making knowledge itself a resource.

The map is not given; it is earned.

---

### Core Concepts

#### Areas

Areas are discrete regions of the world at a given distance from town.

- **Distance**: Integer representing how far from town (town = distance 0)
- **Area count per distance**: Fibonacci sequence starting at distance 1
  - Distance 1: 5 areas
  - Distance 2: 8 areas
  - Distance 3: 13 areas
  - Distance 4: 21 areas
  - Distance 5: 34 areas
  - etc.
- **Generation**: Areas are generated when first discovered, not before
- **Persistence**: Once generated, an area's contents never change (player just discovers what's there)

#### Locations

Locations are discoverable points of interest within an area.

Location types:
- **GATHERING_NODE**: Resource extraction points (mining nodes, tree stands, etc.)
- **MOB_CAMP**: Combat encounters, typed by creature, difficulty = area distance ± 3 (normally distributed around 0)
- **GUILD_HALL**: Guild buildings for enrolment, contracts, and crafting
- **WAREHOUSE**: Storage facilities

Location generation:
- Each potential location type rolls independently for existence
- No cap on locations per area
- Most rolls fail, so most areas are naturally sparse
- "Many areas have nothing, and that's ok"

#### Location-Based Actions

Actions require being at specific locations. Players must travel to a location within an area before performing location-specific actions.

**The null location (area hub)**:
- `currentLocationId = null` means "in the area but not at a specific location"
- In town, this is displayed as **Town Square**
- In wilderness, this is the **Clearing** (entry point to the area)
- Arriving in an area places you at null
- Inter-area travel requires being at null first

**Movement within areas**:
- **Town**: Free movement (0 ticks) between locations
- **Wilderness**: 1 tick to travel between locations
- **Leave action**: Returns to null from any location (free in town, 1 tick in wilderness)
- **TravelToLocation action**: Move from null to a specific location (free in town, 1 tick in wilderness)

**Town structure** (all locations known from start):

| Location | Type | Actions Available |
|----------|------|-------------------|
| Town Square (null) | — | Travel to other areas, travel to town locations, view connections |
| Miners Guild | GUILD_HALL | Enrol (Mining), accept/turn-in mining contracts |
| Foresters Guild | GUILD_HALL | Enrol (Woodcutting), accept/turn-in woodcutting contracts |
| Combat Guild | GUILD_HALL | Enrol (Combat), accept/turn-in combat contracts, turn in combat tokens |
| Smithing Guild | GUILD_HALL | Enrol (Smithing), craft smithing recipes, accept/turn-in smithing contracts |
| Woodcrafters Guild | GUILD_HALL | Enrol (Woodcrafting), craft woodcrafting recipes, accept/turn-in woodcrafting contracts |
| Explorers Guild | GUILD_HALL | Enrol (Exploration), accept/turn-in exploration contracts |
| Warehouse | WAREHOUSE | Store items |

**Wilderness structure**:

| Location | Type | Actions Available |
|----------|------|-------------------|
| Clearing (null) | — | Travel to other areas, travel to locations, Survey, Explore, view connections |
| Gathering node | GATHERING_NODE | Gather, Appraise |
| Mob camp | MOB_CAMP | Fight |
| Guild outpost | GUILD_HALL | Same as town guild halls (with level cap) |

**Actions available anywhere**:
- Drop items
- Leave (return to null)
- Travel to location (from null)

#### Guild Halls

Guild halls are locations affiliated with a specific guild (skill). They exist in town and can appear as outposts in wilderness areas.

**Properties**:
```
guildType: SkillID     // Which guild this belongs to (Mining, Smithing, etc.)
level: number          // Maximum contract/recipe level supported here
```

**Guild hall level**:
- Town guild halls have high level caps (e.g., 100)
- Wilderness outposts have lower caps (e.g., level 10-30 depending on distance)
- Contracts and recipes are only available if their level ≤ guild hall level

**One guild per location**: Each location belongs to exactly one guild. An outpost area with multiple guilds would have multiple GUILD_HALL locations.

#### Contracts and Locations

**Accepting contracts**:
- Contracts specify an `acceptLocationId` — the specific guild hall where they can be accepted
- Different guild halls (town vs. outposts) offer different contracts
- Contract availability also gated by guild hall level

**Turning in contracts**:
- Can be turned in at ANY guild hall of the matching `guildType`
- Encourages field turn-ins at outposts when convenient
- Still requires having the required items

**Contract level**: Contracts have a `level` field (derived from requirements during generation). Only available at guild halls with `guildHall.level >= contract.level`.

#### Recipes and Locations

**Crafting requirements**:
- Must be at a GUILD_HALL of the matching `guildType`
- Guild hall must have sufficient level: `guildHall.level >= recipe.requiredSkillLevel`
- Player must have the required skill level

**Recipe visibility**:
- At a guild hall, see recipes within 3 levels of your current skill level
- Higher-level recipes are hidden, but count is shown (e.g., "12 more recipes at higher levels")
- Encourages leveling to discover new recipes

**Recipe guildType**: Replaces `requiredAreaId`. Recipes specify which guild type can craft them (Smithing, Woodcrafting).

#### Node Visibility

What players can see about discovered gathering nodes depends on their skill level and whether they've appraised the node.

**Three tiers of visibility:**

1. **No gathering skill**: Only see the node type
   - Example: `area-d1-i0-node-1: Mining node`
   - You know a node exists and what skill it requires, but nothing about contents

2. **Has skill, not appraised**: See material names only (no quantities)
   - Example: `area-d1-i0-node-1: STONE, COPPER_ORE`
   - Limited to materials within your level range (see below)
   - You can identify what's there but not how much

3. **Appraised**: See full details with quantities
   - Example: `area-d1-i0-node-1: 129/129 STONE, 50/50 COPPER_ORE`
   - Still limited to materials within your level range
   - Requires APPRAISE action (unlocks at gathering skill L3)

**Material visibility by level:**

You can only see materials up to your current skill level + 2:
- Mining L1: Can see materials requiring up to L3
- Mining L3: Can see materials requiring up to L5
- Mining L8: Can see all materials (L10 cap)

Materials above your visibility threshold:
- Are completely hidden from node display
- Collateral damage to them is not shown
- You don't know they exist until you level up

This creates natural discovery moments as you level: "Oh, this node also had DEEP_ORE I couldn't see before!"

#### Connections

Areas form a graph with discoverable edges.

- Each area connects to 0-3 other areas at same distance
- Each area connects to 0-3 other areas at distance - 1
- Each area connects to 0-3 other areas at distance + 1
- Distribution for connection count: 15% = 0, 35% = 1, 35% = 2, 15% = 3
- **Town exception**: Town (distance 0) connects to ALL distance 1 areas

Connection properties:
- Travel time multiplier: 0.5x to 4.5x (normal distribution centered at 2.5x, stdDev 1.0)
- Base travel time: 10 ticks × multiplier
- Connections are discovered via:
  - Surveying (auto-discovers connection to newly found area)
  - Exploring (can discover connections to already-known areas)
  - Exploring (can also discover connections to *new* areas with lower probability, but does not reveal the area itself - just that a connection exists to somewhere unknown)

Dead ends are possible - an area may have 0 connections to distance + 1.

---

### Actions

#### Survey

Discover a new area connected to your current area.

- **Effect**: Finds an undiscovered area at distance -1, 0, or +1 from current area (random)
- **Connection**: Also discovers the connection to that area
- **Constraint**: Can only discover areas that are connected to current area (from any connected area, not just current)
- **Failure modes**:
  - If the roll hits an already-discovered area, the roll is wasted
  - Keep rolling until a new area is found (or player abandons)
- **Strategic note**: Surveying from the frontier is more efficient (less chance of rediscovering known areas)

#### Explore

Discover a location or connection within your current area.

- **Effect**: Finds one undiscovered location OR connection in current area
- **Completion**: Action ends when something is found
- **Skip rule**: Already-known locations/connections are skipped in rolls
- **Fully explored**: Player is informed when an area has nothing left to discover

**Discovery uses overlaid probability thresholds** (see Success Mechanics below for details).

#### Travel

Move between areas.

- **Routing**: Auto-pathing to any known area (shortest time)
- **Time cost**: Sum of (10 ticks × connection multiplier) for each connection traversed
- **Return to town**: Convenience action, auto-paths via shortest route, cannot be interrupted

#### Travel + Scavenge

Move between areas while foraging.

- **Time cost**: 2x normal travel time
- **Effect**: Small chance of finding resources appropriate to your gathering skill at ~current distance level
- **Level range**: Can find resources up to +3 levels above your current gathering skill level, but with correspondingly lower probability
- **Resources**: Rarer than dedicated gathering, but "free" opportunity during travel

---

### Success Mechanics

Both Survey and Explore roll for discovery periodically until something is found (or player abandons).

#### Roll Frequency

Rolls happen every N ticks, where N decreases with level:
- **Base interval**: 2 ticks
- **Reduction**: 0.1 ticks per 10 levels
- **Minimum**: 1 tick (reached at level 100)
- Level 1-9: every 2 ticks
- Level 10-19: every 1.9 ticks
- Level 20-29: every 1.8 ticks
- Level 50-59: every 1.5 ticks
- Level 100+: every 1 tick

Formula: `max(1, 2 - floor(level / 10) × 0.1)`

#### Overlaid Threshold Model

Each undiscovered thing in the area has its own discovery threshold (% chance per tick). On each roll:

1. **Roll once**: Generate a random number 0-100
2. **Check thresholds**: See which discoverable things have thresholds >= the roll
3. **If multiple hit**: Pick randomly (equal probability) among those that were hit
4. **If none hit**: No discovery this tick, keep rolling

This means:
- Low rolls discover rare things (and potentially common things too)
- High rolls only discover common things (or nothing)
- When you roll low enough to hit multiple things, you get one at random

#### Discovery Thresholds

Each discoverable type has a base threshold, modified by the exploration success chance:

**Base success chance** (same formula as before):
```
success_chance = base_rate + level_bonus - distance_penalty + knowledge_bonus
```

Where:
- **Base rate**: 5%
- **Level bonus**: `(level - 1) × 5%`
- **Distance penalty**: `(distance - 1) × 5%`
- **Knowledge bonus**: +5% per connected known area + `20% × (known non-connected / total at distance)`

**Threshold multipliers by type:**

| Discoverable Type | Multiplier | Example (10% base) |
|-------------------|------------|-------------------|
| Connection to known area | 1.0× | 10% |
| Mob camp | 0.5× | 5% |
| Gathering node (with skill) | 0.5× | 5% |
| Gathering node (without skill) | 0.05× | 0.5% |
| Connection to unknown area | 0.25× | 2.5% |

**Skill-based discovery:**

Gathering nodes are 10× harder to find without the relevant gathering skill:
- **With skill**: 0.5× multiplier (same as mob camps)
- **Without skill**: 0.05× multiplier (10× lower)

This means:
- A miner exploring is much more likely to notice ore veins
- You can still stumble upon nodes for skills you don't have, but rarely
- Encourages joining gathering guilds before exploring for those resources
- Creates interesting decisions: explore now (lower chance) or enrol first?

#### Example: Overlaid Thresholds in Action

Area contains: Mining node, Mob camp, Connection to known area, Connection to unknown area.
Player has Mining skill. Base success chance: 10%.

Thresholds:
- Connection to known: 10%
- Mob camp: 5%
- Mining node: 5% (has skill)
- Connection to unknown: 2.5%

Roll outcomes:
- **Roll 11-100**: Miss everything, no discovery
- **Roll 6-10**: Hit connection to known only → discover connection
- **Roll 3-5**: Hit connection + mob + mining → 33% chance each
- **Roll 1-2**: Hit all four → 25% chance each

If player lacked Mining skill, mining threshold would be 0.5%, so:
- **Roll 1-2**: Would only hit connection + mob + unknown connection (not mining)
- **Roll ≤0.5**: Would hit mining too (very rare)

#### Without Exploration Guild

Players not in the exploration guild:
- All thresholds reduced to 1% fixed (no scaling)
- No XP gain from exploration actions
- Can still buy maps from NPC explorers

#### Luck Surfacing

Per RNG canon, all randomness must be explicit and measured. On every discovery:

**Show immediately**:
- Actual ticks taken
- Expected ticks to find *anything* (max threshold determines this)
- Luck delta: `(expected - actual)` ticks saved/lost

**Important**: Expected ticks is based on the probability of discovering *anything*, not the specific thing found. This avoids revealing what undiscovered things remain.

**Example outputs**:
- "Discovered ore vein in 8t — 12t faster (very lucky)"
- "Discovered connection in 45t — 25t slower (unlucky)"

**When exploring discovers multiple things** (auto-continue), show each on its own line:
```
✓ Explore (45t):
  12t: ore vein
  8t: connection (→area-d1-i3)
  25t: mob camp
  — 8t faster overall (lucky)
```

**Track cumulatively**:
- Total exploration luck delta (ticks saved/lost across all discoveries)
- Current streak (consecutive lucky/unlucky discoveries)

This surfaces whether the player is running hot or cold, enabling informed decisions about whether to push further or consolidate.

---

### Guilds and Starting Benefits

#### Exploration Guild

- Enrolling grants level 1 exploration skill
- Enrolling grants one distance 1 area (and connection from town)
- Exploration guild is standalone (no mutual exclusivity with other guild categories)

#### Gathering Guilds (interaction)

- Enrolling in a gathering guild grants a couple of distance 1 nodes of that type
- Also grants the areas containing those nodes (if not already known)
- Example: Mining guild grants 2 mining nodes at distance 1

#### Combat Guilds (interaction)

- Enrolling grants a couple of distance 1 mob camps
- Also grants the areas containing those camps (if not already known)

---

### NPC Explorer Service

Town always has an explorer NPC who sells map information.

**Purchasable information**:
- Area existence (cheap): Learn that an area exists at a given distance
- Full area map (expensive): Reveals all locations within an area
- Connections: TBD (possibly included with area info)

**Pricing**:
- Scales with distance
- Future: Explorer NPCs in distant areas offer better prices for nearby regions

---

### XP and Leveling

**XP gain**:
- Small XP per tick spent exploring/surveying (regardless of success)
- XP scales with distance (higher distance = more XP per tick)

**Level progression**:
- Rule of thumb: Discovering all areas/locations at distance N should get you to level N+1
- No level cap
- XP curve should match other skills (TBD - see canonical-levels.md)

**Design intent**:
- Your level roughly matches the distance you can comfortably explore
- Knowledge bonuses let you push slightly beyond your "level range"

---

### Player State

- **Current area**: Which area the player is in
- **Current location**: Which location within that area (if any)
- **Known areas**: Set of discovered areas
- **Known locations**: Set of discovered locations within areas
- **Known connections**: Set of discovered connections between areas

---

### Worked Examples

#### Example 1: Fresh Explorer at Distance 1

**Setup**: Level 1 explorer, just joined guild, knows 1 area at distance 1, exploring that area. Town is connected (and connection is known).

```
base_rate = 5%
level_bonus = 0% (level 1: (1-1) × 5% = 0%)
distance_penalty = 0% (distance 1: (1-1) × 5% = 0%)
knowledge_bonus:
  - connected: 5% (town, connection known)
  - non-connected: 0% (no other distance-1 areas known yet)

success_chance = 5% + 0% - 0% + 5% = 10%
roll_interval = 2 ticks (level 1-9)
```

Expected ticks to find something: 2 ticks / 0.10 = **20 ticks**

#### Example 2: Level 5 Explorer at Distance 5

**Setup**: Level 5 explorer at distance 5. Knows 3 connected areas (with connections known). Knows 10 other distance-5 areas (non-connected). Distance 5 has 34 total areas.

```
base_rate = 5%
level_bonus = 20% (level 5: (5-1) × 5% = 20%)
distance_penalty = 20% (distance 5: (5-1) × 5% = 20%)
knowledge_bonus:
  - connected: 3 × 5% = 15%
  - non-connected: 20% × (10/34) = 20% × 0.29 = 5.9%

success_chance = 5% + 20% - 20% + 15% + 5.9% = 25.9%
roll_interval = 2 ticks (level 1-9)
```

Expected ticks to find something: 2 ticks / 0.259 = **8 ticks**

#### Example 3: Level 5 Explorer Pushing to Distance 8

**Setup**: Level 5 explorer at distance 8. Knows 2 connected areas (connections known). Knows 5 other distance-8 areas (non-connected). Distance 8 has 144 total areas.

```
base_rate = 5%
level_bonus = 20% (level 5: (5-1) × 5% = 20%)
distance_penalty = 35% (distance 8: (8-1) × 5% = 35%)
knowledge_bonus:
  - connected: 2 × 5% = 10%
  - non-connected: 20% × (5/144) = 20% × 0.035 = 0.7%

success_chance = 5% + 20% - 35% + 10% + 0.7% = 0.7%
roll_interval = 2 ticks (level 1-9)
```

Expected ticks to find something: 2 ticks / 0.007 = **286 ticks** - pushing too far is very slow!

#### Example 4: No Guild, Distance 1

**Setup**: Player without exploration guild, trying to explore distance 1.

```
success_chance = 1% (fixed, no bonuses apply)
roll_interval = 2 ticks (no level scaling)
```

Expected ticks to find something: 2 ticks / 0.01 = **200 ticks** - painfully slow

#### Example 5: Level 10 Explorer at Distance 10 (Well-Prepared)

**Setup**: Level 10 explorer at distance 10. Knows 5 connected areas (connections known). Knows 100 of 377 distance-10 areas (non-connected).

```
base_rate = 5%
level_bonus = 45% (level 10: (10-1) × 5% = 45%)
distance_penalty = 45% (distance 10: (10-1) × 5% = 45%)
knowledge_bonus:
  - connected: 5 × 5% = 25%
  - non-connected: 20% × (100/377) = 20% × 0.27 = 5.3%

success_chance = 5% + 45% - 45% + 25% + 5.3% = 35.3%
roll_interval = 1.9 ticks (level 10-19)
```

Expected ticks to find something: 1.9 ticks / 0.353 = **5 ticks**

At level = distance, the base and penalty cancel out. Connected knowledge becomes the differentiator.

#### Example 6: Master Explorer (Level 20) at Distance 15

**Setup**: Level 20 explorer at distance 15. Knows 8 connected areas (connections known). Knows 200 of 610 distance-15 areas (non-connected).

```
base_rate = 5%
level_bonus = 95% (level 20: (20-1) × 5% = 95%)
distance_penalty = 70% (distance 15: (15-1) × 5% = 70%)
knowledge_bonus:
  - connected: 8 × 5% = 40%
  - non-connected: 20% × (200/610) = 20% × 0.33 = 6.6%

success_chance = 5% + 95% - 70% + 40% + 6.6% = 76.6%
roll_interval = 1.8 ticks (level 20-29)
```

Expected ticks to find something: 1.8 ticks / 0.766 = **2 ticks**

High level + good knowledge = very efficient exploration even at high distances.

#### Example 7: Travel Time Calculation

**Setup**: Player in town, wants to travel to area at distance 3.

Path: Town → Area A (1x multiplier) → Area B (3x multiplier) → Area C (2x multiplier)

```
Segment 1: 10 × 1 = 10 ticks
Segment 2: 10 × 3 = 30 ticks
Segment 3: 10 × 2 = 20 ticks

Total: 60 ticks
```

With scavenge: 120 ticks (2x), but chance for gathering drops along the way.

#### Example 8: Area Generation (Fibonacci Check)

Total areas by distance (Fibonacci starting at 5):
- Distance 1: 5 areas (Fib 5)
- Distance 2: 8 areas (Fib 6)
- Distance 3: 13 areas (Fib 7)
- Distance 4: 21 areas (Fib 8)
- Distance 5: 34 areas (Fib 9)
- Distance 6: 55 areas (Fib 10)
- Distance 7: 89 areas (Fib 11)
- Distance 8: 144 areas (Fib 12)
- Distance 9: 233 areas (Fib 13)
- Distance 10: 377 areas (Fib 14)
- Distance 15: 610 areas (Fib 19)

~1000 areas within distance 10 of town.

#### Example 9: Fresh Explorer Building Knowledge at Distance 1

**Setup**: Level 1 explorer gradually discovering distance 1 areas. 5 total areas at distance 1. Roll interval = 2 ticks.

| Known | Connected Bonus | Non-Connected Bonus | Total Chance | Ticks/Find |
|-------|-----------------|---------------------|--------------|------------|
| 1     | 5% (town)       | 0%                  | 10%          | 20         |
| 2     | 10%             | 0%                  | 15%          | 13         |
| 3     | 15%             | 0%                  | 20%          | 10         |
| 4     | 20%             | 0%                  | 25%          | 8          |
| 5     | 25%             | 0%                  | 30%          | 7          |

Note: Assumes all distance-1 areas are connected to town (which they are). As knowledge grows, exploration speeds up significantly.

---

### Open Questions / TODOs

1. **Guild membership costs**: What is the cost/tradeoff of joining guilds? Currently no downside to joining exploration guild.

2. **Location discovery probabilities**: What are the actual probabilities for each location type (gathering nodes, mob camps, etc.)?

3. **Mob camp creature types**: What creatures exist and how are they distributed by distance?

4. **Connection purchase**: Can you buy connection information from NPC explorers? How is it priced?

5. **Graph consistency**: Current implementation allows physically impossible graph crossings. Future work to enforce planar or semi-planar constraints.

6. **XP curve formula**: Exact formula for XP-to-level conversion (should match other skills).

7. **Travel + Scavenge probabilities**: What's the actual chance of finding resources while scavenging? How does the +3 level range affect probability?

8. **Unknown connection discovery probability**: When exploring discovers a connection to a *new* (unknown) area, what's the probability compared to discovering connections to known areas?

---

### Guiding Check

Does this exploration system make the decision of where to explore more interesting than the act of exploring?

If not, it's the wrong kind of exploration.
