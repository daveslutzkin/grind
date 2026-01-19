# TODO: Playthrough Observations

Issues discovered during Claude Code playthrough (~15 actions, Tick 0-111).

---

## Bugs

### 1. Unify XP thresholds - remove obsolete N² system - DONE
**Status:** Fixed
**Description:** Two XP threshold systems exist: "exploration thresholds" (25, 35, 55...) used for Mining/Woodcutting, and N² thresholds (4, 9, 16...) used for other skills. All skills should use exploration thresholds. The N² system is obsolete.
**Fix:** Renamed `getExplorationXPThreshold` to `getXPThresholdForNextLevel`, deleted obsolete N² functions from types.ts, and updated all imports.

### 2. Location commands show raw IDs instead of friendly slugs - DONE
**Status:** Fixed
**Description:** UI buttons showed `go area-d1-i3-loc-0` instead of `go ore-vein`. Area travel already used friendly slugs but location travel within an area used raw IDs.
**Fix:** Changed `expandGoLocationAction()` in GameSession.ts to use `toSlug(locationName)`. Also added `matchLocationInCurrentArea()` helper in resolution.ts to support resolving slugified location names back to location IDs.

### 3. Contract progress shows wrong count - DONE
**Status:** Fixed
**Description:** Contract shows "STONE: 1/5" even when player has 5 stone in inventory. The `buildContractsInfo()` method in `GameSession.ts` uses `.find()` which only returns the first matching inventory slot (quantity: 1) instead of summing all slots.
**Fix:** Changed from `.find()` to `.filter().reduce()` to sum quantities across all matching inventory slots.

### 4. Raw location ID resolution broken - DONE
**Status:** Fixed in this session
**Description:** UI generated `go area-d1-i0-loc-0` commands but `resolveDestination` didn't handle raw location IDs, causing `NO_PATH_TO_DESTINATION` error even for discovered locations.
**Fix:** Added regex match for `-loc-\d+$` pattern in resolution.ts.

### 5. Show turn-in location for completed contracts - DONE
**Status:** Fixed
**Description:** When a contract shows "Ready!", player doesn't know where to turn it in. Should show the guild location.
**File:** `src/web/client/components/Contracts.tsx` line 42
**Fix:** Change from:
```tsx
{contract.isComplete && <span class="contract-status">Ready!</span>}
```
to:
```tsx
{contract.isComplete && (
  <span class="contract-status">
    Ready! Turn in at {contract.acceptLocationName}
  </span>
)}
```

### 6. Only show exploration status if player has Exploration skill - DONE
**Status:** Fixed
**Description:** "Partly explored" badge is confusing for players who don't have Exploration skill - they can't act on it. Only show exploration status to players who can explore.
**Fix:** Added skill check in `getExplorationStatus()` to return null when player lacks Exploration skill. Updated types to allow null, and handled null in CurrentArea.tsx and formatters.ts.

---

## UI/UX Issues

### 7. Sidebar + Map layout improvements - DONE
**Status:** Fixed
**Description:** Map legend is cramped, sidebar is too narrow. Make sidebar 50% wider (320px→480px) and map 50% bigger. Redesign legend for future expansion (ore veins, etc.) and hide it if player lacks Exploration skill.
**Fix:** Widened sidebar to 480px, scaled mini-map 50% larger, redesigned legend to vertical layout, and added skill check to hide legend if player lacks Exploration skill.

### 8. Prominent display for most recent action result - DONE
**Status:** Fixed
**Description:** Important feedback (discoveries, results) appears in small text, easy to miss. Display the most recent completed action prominently above the compact log.
**Fix:** Split latest entry from history in CompactActionLog.tsx, render in `.latest-action` wrapper with larger font and accent border. Added CSS styles for prominent display.
