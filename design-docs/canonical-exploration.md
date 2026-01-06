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

Dead ends are possible - an area may have 0 connections to distance + 1.

---

### Actions

#### Survey

Discover a new area connected to your current area.

- **Effect**: Finds an undiscovered area at distance -1, 0, or +1 from current area (random)
- **Connection**: Also discovers the connection to that area
- **Constraint**: Can only discover areas that are connected to current area
- **Failure modes**:
  - If all areas at the rolled distance are already discovered, the tick is wasted
  - Keep rolling until a new area is found (or player abandons)
- **Strategic note**: Surveying from the frontier is more efficient (less chance of rediscovering)

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
- **Resources**: Rarer than dedicated gathering, but "free" opportunity during travel

---

### Success Mechanics

Both Survey and Explore roll for success each tick until something is found (or player abandons).

#### Base Formula

```
success_chance = base_rate + level_bonus - distance_penalty + knowledge_bonus
```

#### Components

**Base rate**: 5%

**Level bonus**: +5% per exploration level
- Level 1: +5% (total 10% at distance 1)
- Level 10: +50% (total 55% at distance 1)
- Level 20: +100% (total 105% at distance 1, capped at 100%)

**Distance penalty**: -5% per distance beyond 1
- Distance 1: 0%
- Distance 5: -20%
- Distance 10: -45%

**Knowledge bonus**: Based on known adjacent areas
- +5% per directly connected known area
- +2% per same-distance non-connected known area

#### Without Exploration Guild

Players not in the exploration guild:
- Fixed 1% success rate
- No level scaling
- No XP gain from exploration actions
- Can still buy maps from NPC explorers

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

**Setup**: Level 1 explorer, just joined guild, knows 1 area at distance 1, exploring that area.

```
base_rate = 5%
level_bonus = 5% (level 1)
distance_penalty = 0% (distance 1)
knowledge_bonus = 5% (town is connected, town counts)

success_chance = 5% + 5% - 0% + 5% = 15%
```

Expected ticks to find something: ~7 ticks (1/0.15)

#### Example 2: Level 5 Explorer at Distance 5

**Setup**: Level 5 explorer at distance 5, knows 3 connected areas, knows 10 other distance-5 areas.

```
base_rate = 5%
level_bonus = 25% (level 5)
distance_penalty = 20% (distance 5: 4 × 5%)
knowledge_bonus = 3 × 5% + 10 × 2% = 15% + 20% = 35%

success_chance = 5% + 25% - 20% + 35% = 45%
```

Expected ticks to find something: ~2 ticks (1/0.45)

#### Example 3: Level 5 Explorer Pushing to Distance 8

**Setup**: Level 5 explorer at distance 8, knows 2 connected areas, knows 5 other distance-8 areas.

```
base_rate = 5%
level_bonus = 25% (level 5)
distance_penalty = 35% (distance 8: 7 × 5%)
knowledge_bonus = 2 × 5% + 5 × 2% = 10% + 10% = 20%

success_chance = 5% + 25% - 35% + 20% = 15%
```

Expected ticks to find something: ~7 ticks - back to "early game" efficiency

#### Example 4: No Guild, Distance 1

**Setup**: Player without exploration guild, trying to explore distance 1.

```
success_chance = 1% (fixed, no bonuses apply)
```

Expected ticks to find something: ~100 ticks - painfully slow

#### Example 5: Master Explorer (Level 20) at Distance 15

**Setup**: Level 20 explorer at distance 15, knows 5 connected areas, knows 40 other distance-15 areas.

```
base_rate = 5%
level_bonus = 100% (level 20)
distance_penalty = 70% (distance 15: 14 × 5%)
knowledge_bonus = 5 × 5% + 40 × 2% = 25% + 80% = 105%

success_chance = 5% + 100% - 70% + 105% = 140% → capped at 100%
```

Even at extreme distance, a master explorer with thorough knowledge auto-succeeds.

#### Example 6: Travel Time Calculation

**Setup**: Player in town, wants to travel to area at distance 3.

Path: Town → Area A (1x multiplier) → Area B (3x multiplier) → Area C (2x multiplier)

```
Segment 1: 10 × 1 = 10 ticks
Segment 2: 10 × 3 = 30 ticks
Segment 3: 10 × 2 = 20 ticks

Total: 60 ticks
```

With scavenge: 120 ticks (2x), but chance for gathering drops along the way.

#### Example 7: Area Generation (Fibonacci Check)

Total areas by distance:
- Distance 1: 5 areas
- Distance 2: 8 areas (total: 13)
- Distance 3: 13 areas (total: 26)
- Distance 4: 21 areas (total: 47)
- Distance 5: 34 areas (total: 81)
- Distance 6: 55 areas (total: 136)
- Distance 7: 89 areas (total: 225)
- Distance 8: 144 areas (total: 369)
- Distance 9: 233 areas (total: 602)
- Distance 10: 377 areas (total: 979)

~1000 areas within distance 10 of town.

---

### Open Questions / TODOs

1. **Guild membership costs**: What is the cost/tradeoff of joining guilds? Currently no downside to joining exploration guild.

2. **Location discovery probabilities**: What are the actual probabilities for each location type (gathering nodes, mob camps, etc.)?

3. **Mob camp creature types**: What creatures exist and how are they distributed by distance?

4. **Connection purchase**: Can you buy connection information from NPC explorers? How is it priced?

5. **Graph consistency**: Current implementation allows physically impossible graph crossings. Future work to enforce planar or semi-planar constraints.

6. **XP curve formula**: Exact formula for XP-to-level conversion (should match other skills).

7. **Travel + Scavenge probabilities**: What's the actual chance of finding resources while scavenging?

8. **Knowledge bonus cap**: Should there be a maximum knowledge bonus to prevent trivializing very high distances?

---

### Guiding Check

Does this exploration system make the decision of where to explore more interesting than the act of exploring?

If not, it's the wrong kind of exploration.
