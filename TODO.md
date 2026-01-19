# TODO: Playthrough Observations

Issues discovered during Claude Code playthrough (~15 actions, Tick 0-111).

---

## Bugs

### 1. Unify XP thresholds - remove obsolete N² system
**Status:** To fix
**Description:** Two XP threshold systems exist: "exploration thresholds" (25, 35, 55...) used for Mining/Woodcutting, and N² thresholds (4, 9, 16...) used for other skills. All skills should use exploration thresholds. The N² system is obsolete.
**Changes:**
1. `src/exploration.ts` - Rename `getExplorationXPThreshold` → `getXPThresholdForNextLevel`
2. `src/types.ts` - Delete `getXPThresholdForNextLevel`, `addXPToSkill`, `getTotalXPForLevel`
3. `src/stateHelpers.ts` - Remove `addXPToSkill` import, update to use renamed function, simplify `grantXP` to remove branching
4. `src/agent/formatters.ts` - Update imports, remove conditional threshold logic (lines 858-859)
5. `src/session/GameSession.ts` - Change import from types.js to exploration.js

### 2. Location commands show raw IDs instead of friendly slugs
**Status:** To fix
**Description:** UI buttons show `go area-d1-i3-loc-0` instead of `go ore-vein`. Area travel already uses friendly slugs (line 455) but location travel within an area still uses raw IDs (line 414).
**File:** `src/session/GameSession.ts` in `expandGoLocationAction()` method (~line 414)
**Fix:** Change from:
```typescript
command: `go ${location.id}`,
```
to:
```typescript
command: `go ${toSlug(locationName)}`,
```
Ensure `toSlug` is imported from `resolution.ts`.

### 3. Contract progress shows wrong count
**Status:** To fix
**Description:** Contract shows "STONE: 1/5" even when player has 5 stone in inventory. The `buildContractsInfo()` method in `GameSession.ts` uses `.find()` which only returns the first matching inventory slot (quantity: 1) instead of summing all slots.
**File:** `src/session/GameSession.ts` in `buildContractsInfo()` method (~line 760)
**Fix:** Change from `.find()` to `.filter().reduce()` to sum quantities across all matching inventory slots:
```typescript
// Current (broken):
const invItem = this.state.player.inventory.find((i) => i.itemId === req.itemId)
const currentQuantity = invItem?.quantity ?? 0

// Fixed:
const currentQuantity = this.state.player.inventory
  .filter((i) => i.itemId === req.itemId)
  .reduce((sum, item) => sum + item.quantity, 0)
```

### 4. Raw location ID resolution broken - DONE
**Status:** Fixed in this session
**Description:** UI generated `go area-d1-i0-loc-0` commands but `resolveDestination` didn't handle raw location IDs, causing `NO_PATH_TO_DESTINATION` error even for discovered locations.
**Fix:** Added regex match for `-loc-\d+$` pattern in resolution.ts.

### 5. Show turn-in location for completed contracts
**Status:** To fix
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

### 6. Only show exploration status if player has Exploration skill
**Status:** To fix
**Description:** "Partly explored" badge is confusing for players who don't have Exploration skill - they can't act on it. Only show exploration status to players who can explore.
**Changes:**
1. `src/session/GameSession.ts` - `getExplorationStatus()` (~line 661)
   - Add skill check: `const hasExplorationSkill = (this.state.player.skills.Exploration?.level ?? 0) >= 1`
   - Return `null` if no skill
   - Update return type to include `| null`
2. `src/session/types.ts` - Update `LocationInfo.explorationStatus` type (~line 33)
   - Change to: `"unexplored" | "partly explored" | "fully explored" | null`
3. `src/web/client/components/CurrentArea.tsx` - Handle null (line 32)
   - Add null check: `{location.explorationStatus && location.explorationStatus !== "fully explored" && ...}`
4. `src/agent/formatters.ts` - Skip exploration status section (~line 348)
   - Add skill check before computing exploration status
   - Only show status if player has Exploration skill

---

## UI/UX Issues

### 7. Sidebar + Map layout improvements
**Status:** To fix
**Description:** Map legend is cramped, sidebar is too narrow. Make sidebar 50% wider (320px→480px) and map 50% bigger. Redesign legend for future expansion (ore veins, etc.) and hide it if player lacks Exploration skill.
**Changes:**
1. `src/web/client/styles/main.css` (~line 243)
   - Change: `grid-template-columns: 1fr 480px;` (was 320px)
2. `src/web/client/components/mapUtils.ts` (lines 14-22)
   - Scale MINI_MAP dimensions 50%:
   ```typescript
   export const MINI_MAP = {
     width: 450,      // was 300
     height: 300,     // was 200
     centerX: 225,    // was 150
     centerY: 130,    // was 85
     currentAreaRadius: 12,     // was 8
     connectedAreaRadius: 27,   // was 18
     connectionDistance: 82,    // was 55
   } as const
   ```
3. `src/web/client/components/Map.tsx` - Legend redesign
   - Move legend to vertical layout (room for future items like ore veins)
   - Add skill check: only show legend if player has Exploration skill
   - Need to receive `hasExplorationSkill` prop
4. `src/web/client/components/Sidebar.tsx`
   - Pass `hasExplorationSkill` down to Map component

### 8. Prominent display for most recent action result
**Status:** To fix
**Description:** Important feedback (discoveries, results) appears in small text, easy to miss. Display the most recent completed action prominently above the compact log.
**Changes:**
1. `src/web/client/components/CompactActionLog.tsx`
   - Split most recent completed entry from rest of history
   - Render latest in a "prominent" wrapper div above the log
   - Render remaining history in compact format below
   ```tsx
   const [latestEntry, ...olderHistory] = [...history].reverse()
   return (
     <div class="compact-action-log">
       {latestEntry && <div class="latest-action">...</div>}
       <div class="action-history">{/* older entries */}</div>
       {currentCommand && <CurrentCompactEntry ... />}
     </div>
   )
   ```
2. `src/web/client/styles/main.css`
   - Add `.latest-action` styles (larger font, highlight color, padding)
   - Subtle border or background to distinguish from history
