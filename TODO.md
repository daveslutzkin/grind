# UI Improvements TODO

Based on playtesting session evaluating the web UI.

## Phase 1: Foundational (affects everything else)

### ~~1.1 Fix Area Names Not Showing~~ [DONE]
**Type:** Bug

~~Area names are LLM-generated but not being displayed in the UI. Currently showing generic labels like "Fartravel to a nearby area" and internal IDs like `area-d1-i0` in action logs.~~

**Fixed:** Commands now use friendly slugs (e.g., `go rocky-clearing` instead of `go area-d1-i0`). The `toSlug()` function converts area names to dash-separated lowercase strings for use in commands. Action buttons and logs already used `getAreaDisplayName()` correctly.

---

### 1.2 Restructure Main Content Area
**Type:** UI Redesign

Currently the main content area fills with action history, pushing useful context off screen. Need to restructure so the main area shows "here's where you are and what you can do."

**New main content area should include:**
- Prominent area title (currently hidden at top of screen)
- Area description (if available)
- Contracts available at this location
- Actions available as buttons, with text command shown next to each button

**Action log changes:**
- Move to a small box below the action bar (bottom of main content)
- Show only last 1-2 actions
- Expandable to see action outcomes/details
- Clickable to see full action history

---

## Phase 2: Builds on New Structure

### 2.1 Compact Action Log Component
**Type:** UI Redesign

Implement the new action log as described in 1.2:
- Small box at bottom, below action bar
- Shows last 1-2 actions in compact format
- Expandable for details
- Click to open full history view

---

### 2.2 Gray Out Unavailable Contracts
**Type:** UI Enhancement

The contracts sidebar shows contracts the player can't accept (e.g., Lv 20 contracts when player is Lv 1) with no visual distinction.

**Expected behavior:**
- Contracts player can accept: normal display
- Contracts player cannot accept: grayed out / visually dimmed
- Show requirement: "Requires Mining Lv 20"
- Players should see what's coming (progression) but clearly know what they can act on

---

### 2.3 Mini-Map Redesign
**Type:** UI Redesign

Current map has truncated names ("near...") and unclear relationships.

**New mini-map behavior:**
- Current area: displayed as small dot
- Connected areas (1 hop away): displayed as larger dots
- Focus on "where can I go from here?" navigation

**Full-screen map:**
- Click mini-map to expand to full screen
- See and explore entire world
- Show full details and area names

---

## Phase 3: Isolated Fixes (no dependencies)

### 3.1 Fix Pathfinding Bug - "Go to" Buttons Fail
**Type:** Bug

"Go to Ore vein" and "Go to Tree stand" buttons appear clickable but always fail with `NO_PATH_TO_DESTINATION` error. This happens even though the game says "go there to begin your mining career" after enrolling.

**Expected behavior:**
- After enrolling in Miners/Foresters Guild, player should be able to reach resource locations
- If a "Go to X" button is shown, the action should succeed
- Investigate whether paths aren't being generated when areas are discovered

---

### 3.2 Hide Fartravel for 1-Hop Destinations
**Type:** Bug/UX

Both "Travel to Town" and "Fartravel to Town" buttons appear with the same cost for adjacent locations. Fartravel is only useful for multi-hop journeys.

**Expected behavior:**
- Fartravel buttons should be hidden when destination is only 1 connection away
- Only show Fartravel for destinations 2+ hops away

---

### 3.3 Fix Text Input Focus
**Type:** Bug

The command text input loses focus after submitting a command. Players who prefer typing have to click back into the input each time.

**Expected behavior:**
- After submitting a command, text input should retain focus
- Player can immediately type next command without clicking

---

### 3.4 Add Help Command
**Type:** Feature

Typing "help" returns "Invalid command". There's no way to discover available commands.

**Expected behavior:**
- `help` lists available commands
- Consider `help <command>` for detailed help on specific commands
- The game shouldn't be buttons-only; text commands are a valid play style

---

### 3.5 Spell Out Costs
**Type:** UX Enhancement

Button costs like "20g" are ambiguous - looks like "20 gold" but actually means "20 ticks" (time).

**Expected behavior:**
- Show "20 ticks" or "20 gold" spelled out
- Part of broader information architecture improvement
- Apply consistently to buttons and anywhere costs are shown

---

## Future Considerations

- Broader information architecture review to make the whole UI more intuitive
- Consider showing action buttons with their text command equivalent to help players learn commands
- Area descriptions for richer world-building
