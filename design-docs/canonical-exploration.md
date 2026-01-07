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
- **Gathering nodes**: One roll per gathering skill type (mining node, fishing spot, herb patch, etc.)
- **Mob camps**: Typed by creature, difficulty = area distance ± 3 (normally distributed around 0)
- **Places**: Future feature (stub for now)
- **People**: Future feature, always within places (stub for now)

Location generation:
- Each potential location type rolls independently for existence
- No cap on locations per area
- Most rolls fail, so most areas are naturally sparse
- "Many areas have nothing, and that's ok"

#### Connections

Areas form a graph with discoverable edges.

- Each area connects to 0-3 other areas at same distance
- Each area connects to 0-3 other areas at distance - 1
- Each area connects to 0-3 other areas at distance + 1
- Distribution for connection count: 15% = 0, 35% = 1, 35% = 2, 15% = 3
- **Town exception**: Town (distance 0) connects to ALL distance 1 areas

Connection properties:
- Travel time multiplier: 1x to 4x (distribution: 15% = 1x, 35% = 2x, 35% = 3x, 15% = 4x)
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

Both Survey and Explore roll for success periodically until something is found (or player abandons).

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

#### Base Formula

```
success_chance = base_rate + level_bonus - distance_penalty + knowledge_bonus
```

#### Components

**Base rate**: 5%

**Level bonus**: +5% per exploration level above 1
- Level 1: 0% (no bonus)
- Level 2: +5%
- Level 5: +20%
- Level 10: +45%
- Level 20: +95%

Formula: `(level - 1) × 5%`

**Distance penalty**: -5% per distance beyond 1
- Distance 1: 0%
- Distance 5: -20%
- Distance 10: -45%

Formula: `(distance - 1) × 5%`

**Knowledge bonus**: Based on known adjacent areas
- +5% per directly connected known area (only if you know the connection)
- +20% max from same-distance non-connected areas, scaling proportionally to % of such areas known

Formula for non-connected bonus: `20% × (known non-connected areas at this distance / total areas at this distance)`

#### Without Exploration Guild

Players not in the exploration guild:
- Fixed 1% success rate
- No level scaling
- No XP gain from exploration actions
- Can still buy maps from NPC explorers

#### Luck Surfacing

Per RNG canon, all randomness must be explicit and measured. On every discovery:

**Show immediately**:
- Actual ticks taken
- Expected ticks (based on success chance and roll interval)
- Luck delta: `(expected - actual)` ticks saved/lost

**Example outputs**:
- "Found mining node in 8 ticks (expected: 20) — 12 ticks faster than average"
- "Found connection in 45 ticks (expected: 20) — 25 ticks slower than average"

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
