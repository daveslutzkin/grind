# Grind Web App Playtest Feedback

Playtested ~50 actions starting from a fresh game. Tick reached: ~330. Enrolled in multiple guilds, completed one mining contract, explored several areas.

---

## Bugs

### Critical

1. **Mine action disappears after mining** - After mining once at Greenhold Slopes Ore vein, the MINE action completely disappeared from Available Actions. Typing `mine` manually returned "Failed: MISSING_FOCUS_MATERIAL" - but no explanation of what material is missing or why mining stopped working. This breaks the core gameplay loop.

### High Priority

2. **Duplicate buttons appear inconsistently** - Throughout the session, duplicate buttons appeared next to each other:
   - Two "leave" buttons at Miners Guild (first visit)
   - Two "see gathering map" buttons after accepting contract
   - Two "mine" buttons after first mine
   - Two "enrol" buttons at Smithing Guild
   - Two "drop <quantity> <item>" buttons
   - Pattern: The duplicate seems to be a faded/disabled version showing next to the active button. This happens inconsistently.

3. **Debug text leaking into UI** - Command slugs appear next to buttons as visible text:
   - "go miners-guild" next to "Go to Miners Guild"
   - "go foresters-guild" next to "Go to Foresters Guild"
   - "go woodcrafters-guild" next to "Go to Woodcrafters Guild"
   - "go combat-guild" next to "Go to Combat Guild"
   - "go ore-vein" next to "Go to Ore vein"
   - "chop SOFTWOOD" next to "Chop softwood"
   - "fartravel greenward-slopes" next to "Fartravel to Greenward Slopes"
   - "accept mining-contract-2" next to "Accept L20 Mining"
   - The debug text appears on different buttons at different times, not consistently.

### Medium Priority

4. **Drop command shows unhelpful error** - Clicking the "drop <quantity> <item>" template button shows "Failed: ITEM_NOT_FOUND" even when items are in inventory. The button shouldn't be clickable without parameters, or should prompt for them.

5. **Inconsistent location naming** - Two similar names exist that are confusing:
   - "Greenhold Slopes" (can travel to directly from Town)
   - "Greenward Slopes" (fartravel destination)
   - These appear to be different places but the names are nearly identical.

---

## UX/UI Issues

### Navigation & Layout

1. **Inventory shows items individually, not stacked** - With 5 STONE in inventory, it shows as "STONE STONE STONE STONE STONE" in a grid instead of "STONE x5" or a single entry with quantity. Wastes space and hard to read at scale.

2. **Game ID in header is ugly** - Shows "web-1769065109537-0673t6" prominently in the header. Consider hiding or shortening this for normal play.

3. **Help text is a wall of text** - The `help` command dumps all commands in one dense paragraph. Would benefit from:
   - Line breaks between categories
   - Bullet points or formatting
   - Maybe a shorter summary with "help <topic>" for details

4. **"drop <quantity> <item>" button is confusing** - Looks like a command template rather than a clickable button. Either:
   - Make it obvious it's a template (greyed out, different style)
   - Turn it into a proper UI with item picker and quantity input
   - Remove it and rely on text commands

### Clarity & Feedback

5. **No skill added for Woodcrafters Guild** - Enrolled in Woodcrafting guild but no new skill appeared in the Skills panel. Enrolled in Miners Guild gave Mining skill, Foresters gave Woodcutting, Explorers gave Exploration. Woodcrafters gave nothing visible.

6. **No crafting available at Woodcrafters Guild** - After enrolling, there were no craft actions available. Unclear what the guild membership provides.

7. **Enrollment tick costs inconsistent and sometimes hidden** - Miners/Foresters: 20 ticks; Explorers/Woodcrafters: 3 ticks. Smithing Guild showed no tick cost initially but had "3 ticks" after a UI update.

8. **Minor gold display inconsistency** - Contract turn-in message said "earned 0.6 gold" but header showed "0.62" - probably variance in rewards, but could be clearer.

9. **Grammar: "1 ticks" should be "1 tick"** - Singular/plural agreement issue in tick cost displays.

---

## Game Design Observations

### Positive

1. **Good onboarding messages** - Enrolling in guilds gives helpful guidance ("There's a promising ore vein at Copper Ridge - go there to begin your mining career...")

2. **Map with exploration states** - The color-coded legend (Explored/Partial/New/Unknown) is helpful for understanding the world.

3. **Contract completion flow works well** - Accept contract -> gather resources -> turn in for gold & rep is satisfying.

4. **"View full history" button** - Useful for reviewing what you've done.

5. **Multiple resource types at same location** - Copper Ridge has both ore veins and tree stands, encouraging multi-skill gameplay.

### Areas for Improvement

1. **Exploration tick costs seem high** - The `explore` action took ~22 ticks (shown as "1 ticks" on button). Either the display is wrong or exploration is very expensive relative to other actions.

2. **Survey vs Explore unclear** - Both actions available at Greenhold Slopes, both cost 11 ticks, both described as "Open terrain". What's the difference?

3. **No explanation when actions become unavailable** - When mining stopped working, there was no in-game explanation. A message like "The ore vein is depleted" or "You need X material to continue mining" would help.

4. **Crafting guilds have no visible purpose** - Woodcrafters Guild enrollment provides no apparent benefit - no skills, no crafting, nothing unlocked.

5. **Travel time display could be clearer** - Shows "28 ticks (Rough terrain)" which is good, but the relationship between distance and terrain type affecting tick cost could be explained somewhere.

---

## Summary

The core loop of enrolling in guilds, accepting contracts, gathering resources, and turning in contracts works well when it works. The main issues are:

1. **Critical bug**: Mining becoming unavailable with no explanation
2. **Polish needed**: Duplicate buttons and debug text leaking through
3. **UX improvements**: Better inventory display, clearer error messages, formatted help

The game has a solid foundation - the rules-first approach is evident in the consistent command structure and tick-based economy.
