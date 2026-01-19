# UI Improvements TODO

Based on playtesting session evaluating the web UI.

## Phase 1: Foundational (affects everything else)

### ~~1.1 Fix Area Names Not Showing~~ [DONE]
**Type:** Bug

~~Area names are LLM-generated but not being displayed in the UI. Currently showing generic labels like "Fartravel to a nearby area" and internal IDs like `area-d1-i0` in action logs.~~

**Fixed:** Commands now use friendly slugs (e.g., `go rocky-clearing` instead of `go area-d1-i0`). The `toSlug()` function converts area names to dash-separated lowercase strings for use in commands. Action buttons and logs already used `getAreaDisplayName()` correctly.

---

### ~~1.2 Restructure Main Content Area~~ [DONE]
**Type:** UI Redesign

~~Currently the main content area fills with action history, pushing useful context off screen. Need to restructure so the main area shows "here's where you are and what you can do."~~

**Fixed:** Main content area now shows:
- Prominent area title with location name
- Exploration status indicator
- Contracts available at current location with rewards
- Actions grouped by type, with text command shown next to each button

**Action log changes:**
- Moved to compact box below command input (bottom of main content)
- Shows last 2 actions in collapsed format
- Expandable entries show details (items, XP, level ups)
- "View full history" button opens full history modal

---

## Phase 2: Builds on New Structure

### ~~2.1 Compact Action Log Component~~ [DONE]
**Type:** UI Redesign

~~Implement the new action log as described in 1.2:~~
- ~~Small box at bottom, below action bar~~
- ~~Shows last 1-2 actions in compact format~~
- ~~Expandable for details~~
- ~~Click to open full history view~~

**Fixed:** Implemented as part of 1.2 in `CompactActionLog.tsx`.

---

### ~~2.2 Gray Out Unavailable Contracts~~ [DONE]
**Type:** UI Enhancement

~~The contracts sidebar shows contracts the player can't accept (e.g., Lv 20 contracts when player is Lv 1) with no visual distinction.~~

**Fixed:**
- Contracts player can accept: normal display
- Contracts player cannot accept: grayed out (50% opacity)
- Shows "Requires Mining Lv X" for unavailable contracts
- Added `canAcceptContract()` helper that checks skill level >= contract level

---

### ~~2.3 Mini-Map Redesign~~ [DONE]
**Type:** UI Redesign

~~Current map has truncated names ("near...") and unclear relationships.~~

**Fixed:** Mini-map redesigned with:
- Current area: small dot (8px radius) at center
- Connected areas (1 hop away): larger dots (18px radius) with full names and travel times
- Focus on "where can I go from here?" navigation with prominent destination labels

**Full-screen map:**
- Click mini-map to expand to full-screen modal
- Shows entire known world with areas positioned by distance from town
- Full area names displayed with exploration status colors
- Current location highlighted with "You are here" indicator

---

## Phase 3: Isolated Fixes (no dependencies)

### ~~3.1 Fix Pathfinding Bug - "Go to" Buttons Fail~~ [DONE]
**Type:** Bug

~~"Go to Ore vein" and "Go to Tree stand" buttons appear clickable but always fail with `NO_PATH_TO_DESTINATION` error. This happens even though the game says "go there to begin your mining career" after enrolling.~~

**Fixed:** When a gathering node alias (like "ore vein") isn't found in the current area but exists in another known area, the system now uses fartravel to reach that area instead of failing.

---

### ~~3.2 Hide Fartravel for 1-Hop Destinations~~ [DONE]
**Type:** Bug/UX

~~Both "Travel to Town" and "Fartravel to Town" buttons appear with the same cost for adjacent locations. Fartravel is only useful for multi-hop journeys.~~

**Fixed:** Fartravel buttons now only appear for destinations 2+ hops away. Adjacent areas show only "Travel to X".

---

### ~~3.3 Fix Text Input Focus~~ [DONE]
**Type:** Bug

~~The command text input loses focus after submitting a command. Players who prefer typing have to click back into the input each time.~~

**Fixed:** Command input now retains focus after submitting, using a ref to refocus the input element.

---

### ~~3.4 Add Help Command~~ [DONE]
**Type:** Feature

~~Typing "help" returns "Invalid command". There's no way to discover available commands.~~

**Fixed:** Typing "help" now displays a comprehensive list of available commands with descriptions.

---

### ~~3.5 Spell Out Costs~~ [DONE]
**Type:** UX Enhancement

~~Button costs like "20g" are ambiguous - looks like "20 gold" but actually means "20 ticks" (time).~~

**Fixed:** Button costs now show "20 ticks" instead of "20t" to eliminate confusion with gold.

---

## Future Considerations

- Broader information architecture review to make the whole UI more intuitive
- Consider showing action buttons with their text command equivalent to help players learn commands
- Area descriptions for richer world-building
