# Implementation Plan: Enhanced Gathering Guild Enrollment

## Overview

Enhance the enrollment experience for gathering guilds (Mining, Woodcutting, and future gathering guilds) to provide better onboarding and a new "see gathering map" action.

**Applies to:** Mining Guild, Woodcutting Guild (and future gathering guilds)

---

## Part 1: Enrollment Duration Change

### File: `src/actionChecks.ts` (around line 930-983)

In `checkGuildEnrolmentAction`, change the time cost from 3 ticks to 20 ticks for gathering guilds.

**Current code (approximately line 970):**
```typescript
timeCost: 3,
```

**Change to:** 20 ticks for Mining and Woodcutting skills. Consider adding a helper or constant to identify "gathering skills" that can be extended for future guilds.

---

## Part 2: Enrollment Progress Display

### File: `src/engine.ts` (around lines 1148-1224)

Modify `executeGuildEnrolment` to change the feedback messages for gathering guilds.

### 2.1 Progress Message During Training

**Current behavior:** Yields `{ done: false }` for 3 ticks, which produces "Enrolling.... Enrolled"

**New behavior for gathering guilds:**
- Yield 20 ticks with progress feedback showing "Training" with accumulating dots
- The progress display should show incremental dots over the 20 ticks

### 2.2 Completion Messages

**Current:** Single message `Enrolled in ${skill} guild!`

**New for gathering guilds:**

1. First line: `Enrolled in ${guildName} Guild, congratulations! (20t)`
2. Blank line
3. Skill-specific orientation text (see Section 2.3)

### 2.3 Orientation Text

Create skill-specific welcome messages. These should be in sentence case and feel encouraging.

**Mining:**
> You now know how to mine! There's a promising ore vein at [AREA_NAME] - go there to begin your mining career. Discover more locations by accepting contracts, or join the Explorers Guild to survey the wilderness yourself.

**Woodcutting:**
> You now know how to chop wood! There's a fine stand of trees at [AREA_NAME] - go there to start harvesting lumber. Discover more locations by accepting contracts, or join the Explorers Guild to survey the wilderness yourself.

The `[AREA_NAME]` is populated from the node discovery (Part 3).

---

## Part 3: Node Discovery at Enrollment

### File: `src/engine.ts` (in `executeGuildEnrolment`)

After setting the skill level to 1, for gathering guilds:

### 3.1 Find the Closest Unknown Node

1. Determine the node type based on skill:
   - Mining → ore veins (look for mining-related node types)
   - Woodcutting → tree stands (look for woodcutting-related node types)

2. Search for the closest unknown node of that type:
   - "Closest" = fewest travel ticks from Town
   - "Unknown" = not already in player's known locations
   - Must be in an area that exists (may need to ensure area generation)

3. If no unknown nodes exist at any distance, may need to generate one or find the closest one regardless of known status (edge case - should be very rare)

### 3.2 Discover the Area and Connection

When a suitable node is found:

1. **Discover the area** - Add to `state.world.areas` known areas if not already known
2. **Discover the connection** - Ensure the path from Town to this area is marked as known in `state.world.connections`
3. **Discover the node/location** - Add to player's known locations

### 3.3 Reference Files for Discovery Logic

- `src/exploration.ts` lines 822-847: `processPendingNodeDiscoveries` - example of node discovery
- `src/exploration.ts` lines 1647, 1751: where pending discoveries are processed
- `src/world.ts` lines 479-531: `generateNodesForArea` - how nodes are created
- `src/world.ts` lines 542-661: minimum node guarantees per distance

### 3.4 Return Value

The discovery function should return the area name so it can be inserted into the orientation text.

---

## Part 4: New Action - `see gathering map`

### 4.1 Parser

### File: `src/runner.ts`

Add parsing for the `see gathering map` command.

**Location:** Near other action parsers (around line 228)

```typescript
// Parse "see gathering map"
if (input === "see gathering map") {
  return { type: "SeeGatheringMap" };
}
```

### 4.2 Action Type

### File: `src/types.ts` (or wherever action types are defined)

Add a new action type:

```typescript
type SeeGatheringMapAction = {
  type: "SeeGatheringMap";
};
```

Add to the Action union type.

### 4.3 Precondition Check

### File: `src/actionChecks.ts`

Add `checkSeeGatheringMapAction`:

**Preconditions:**
- Player must be at a gathering guild location (Miners Guild or Woodcutters Guild)
- Player must be enrolled in that guild (skill level >= 1)

**Returns:**
- `timeCost: 0` (viewing information only)
- The relevant skill type (Mining or Woodcutting) based on current location

### 4.4 Available Actions

### File: `src/actionChecks.ts` (in `getAvailableActions` or similar)

Add `see gathering map` to available actions when:
- At Miners Guild AND Mining level >= 1
- At Woodcutters Guild AND Woodcutting level >= 1

### 4.5 Execution

### File: `src/engine.ts`

Add case for `SeeGatheringMap` action type that calls a new function.

Create `executeSeeGatheringMap`:

1. Determine skill type from current location
2. Get all known nodes of that type from player's known locations
3. For each node, gather:
   - Area name
   - Distance from Town
   - Travel ticks from current location (use `findPath` from exploration.ts)
   - Current contents (based on player's knowledge/unlocks)
4. Sort by travel ticks ascending, then alphabetically by area name
5. Format and yield the display

### 4.6 Display Format

**Header by skill:**
- Mining: `Known Ore Veins:`
- Woodcutting: `Known Tree Stands:`

**Each node line:**
```
  [Area Name] (distance [N], [X]t) - [contents]
```

**Contents display:**
- Show material types the player knows about
- Show quantities in parentheses if player has APPRAISE unlocked
- Show "depleted, regenerating" if node is depleted

**Footer:**
```

Use 'fartravel <area>' to travel to any of these locations.
```

**Empty state:**
```
Known Ore Veins: none

Find ore veins by accepting contracts or joining the Explorers Guild.
```

(Substitute "Tree Stands" and "tree stands" for Woodcutting)

### 4.7 Helper Functions

May need to create or use existing helpers for:

- `getGatheringSkillForLocation(locationId)` - returns Mining/Woodcutting based on guild
- `getKnownNodesForSkill(state, skill)` - returns all known nodes for a gathering skill
- `getNodeContentsDisplay(state, node)` - formats contents based on player unlocks
- `calculateTravelTicks(state, fromArea, toArea)` - uses existing pathfinding

---

## Part 5: Testing Requirements

### File: `src/enrolment.test.ts` (or appropriate test file)

### 5.1 Enrollment Duration Tests

- Test that Mining enrollment takes 20 ticks
- Test that Woodcutting enrollment takes 20 ticks
- Test that non-gathering guilds (Combat, Exploration) still take 3 ticks

### 5.2 Node Discovery Tests

- Test that enrolling in Mining discovers an ore vein
- Test that enrolling in Woodcutting discovers a tree stand
- Test that the discovered area is now known
- Test that the connection to the discovered area is now known
- Test that the player can fartravel to the discovered area after enrollment

### 5.3 Enrollment Message Tests

- Test that the completion message includes the area name
- Test that Mining gets mining-specific text
- Test that Woodcutting gets woodcutting-specific text

### 5.4 See Gathering Map Tests

- Test that `see gathering map` is not available before enrollment
- Test that `see gathering map` is available after enrollment at the correct guild
- Test that `see gathering map` costs 0 ticks
- Test that nodes are sorted by travel ticks, then alphabetically
- Test empty state message when no nodes known
- Test that contents display respects player's unlocks (APPRAISE for quantities)
- Test the fartravel hint is included

---

## Implementation Order

Recommended order to implement:

1. **Part 1: Duration change** - Simple constant change, easy to verify
2. **Part 3: Node discovery** - Core new functionality, needed for messages
3. **Part 2: Progress display** - Depends on node discovery for area name
4. **Part 4: See gathering map** - Independent feature, can be done in parallel with 2/3
5. **Part 5: Tests** - Write tests first (TDD) or alongside each part

---

## Notes for Implementation Agent

- Follow TDD: write failing tests first, then implement
- Run `npm run check` after each change
- Commit after each part is complete and passing
- The codebase uses generators (`yield`) for action execution - follow existing patterns
- Look at `executeGuildEnrolment` in `src/engine.ts:1148-1224` as the starting point
- Look at `grantExplorationGuildBenefits` for an example of guild-specific enrollment effects
- The exploration system in `src/exploration.ts` has the pathfinding and discovery logic to reuse
