# Grind Game - TODO

Priority items from playtest findings (January 2025).

---

## 1. Fix Gold Floating Point Display - DONE

**Priority:** High | **Effort:** Low

**Problem:** Gold displays as `1.4926490000000001` instead of `1.49`.

**Files to modify:**
- `src/web/client/App.tsx` (line 137)
- `src/web/client/components/CurrentArea.tsx` (line 48)

**Current code in App.tsx (line 137):**
```tsx
<span class="stat-label">Gold:</span> {state.gold}
```

**Change to:**
```tsx
<span class="stat-label">Gold:</span> {state.gold.toFixed(2)}
```

**Current code in CurrentArea.tsx (line 48):**
```tsx
{contract.rewards.gold && <span>{contract.rewards.gold} gold</span>}
```

**Change to:**
```tsx
{contract.rewards.gold && <span>{contract.rewards.gold.toFixed(2)} gold</span>}
```

**Acceptance criteria:**
- Gold in header displays with exactly 2 decimal places (e.g., "1.49", "10.00")
- Contract reward previews display gold with exactly 2 decimal places
- Search codebase for any other gold displays and fix those too

---

## 2. Display Inventory as Visual Slots - DONE

**Priority:** High | **Effort:** Medium

**Problem:** Inventory shows items as a variable-length list which looks odd. At low skill levels items don't stack, so showing "STONE x1" five times looks buggy.

**File to modify:**
- `src/web/client/components/Inventory.tsx`
- `src/web/client/styles/main.css` (add new styles)

**Current code in Inventory.tsx:**
```tsx
export function Inventory({ inventory }: InventoryProps) {
  return (
    <div class="inventory panel">
      <h3>
        Inventory ({inventory.used}/{inventory.capacity})
      </h3>
      <ul>
        {inventory.items.map((item) => (
          <li key={item.itemId}>
            <span class="item-name">{item.itemId}</span>
            <span class="item-qty">x{item.quantity}</span>
          </li>
        ))}
        {inventory.items.length === 0 && <li class="empty">Empty</li>}
      </ul>
    </div>
  )
}
```

**Replace with a visual grid approach:**
```tsx
export function Inventory({ inventory }: InventoryProps) {
  // Create array of capacity length, filled with items or null
  const slots: (ItemStack | null)[] = []
  for (let i = 0; i < inventory.capacity; i++) {
    slots.push(inventory.items[i] ?? null)
  }

  return (
    <div class="inventory panel">
      <h3>Inventory</h3>
      <div class="inventory-grid">
        {slots.map((slot, index) => (
          <div key={index} class={`inventory-slot ${slot ? "filled" : "empty"}`}>
            {slot && (
              <>
                <span class="item-name">{slot.itemId}</span>
                {slot.quantity > 1 && <span class="item-qty">x{slot.quantity}</span>}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Add CSS in main.css:**
```css
.inventory-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr); /* 5 columns, 2 rows = 10 slots */
  gap: 4px;
}

.inventory-slot {
  aspect-ratio: 1;
  border: 1px solid #444;
  border-radius: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2px;
  min-height: 40px;
  font-size: 0.75rem;
}

.inventory-slot.empty {
  background: #1a1a1a;
  border-style: dashed;
}

.inventory-slot.filled {
  background: #2a2a3a;
}

.inventory-slot .item-name {
  text-align: center;
  word-break: break-word;
}

.inventory-slot .item-qty {
  font-size: 0.65rem;
  color: #888;
}
```

**Acceptance criteria:**
- Inventory shows a grid of exactly 10 slots (5x2 or 2x5, your choice)
- Empty slots are visually distinct (dashed border, darker background)
- Filled slots show item name
- Quantity only shows when > 1 (no "x1" for single items)
- Remove the "(used/capacity)" from the header since the visual grid makes it obvious
- Grid should not expand or contract based on item count

---

## 3. Action Log Text Wrapping - DONE

**Priority:** Medium | **Effort:** Low

**Problem:** Long messages in action log are truncated mid-sentence, losing important information like directions to new locations.

**Files to modify:**
- `src/web/client/styles/main.css`

**The issue is likely CSS truncation.** Search for CSS rules that apply to `.compact-entry`, `.compact-result`, or `.compact-action-log` that cause truncation (like `text-overflow: ellipsis`, `white-space: nowrap`, or `overflow: hidden` without proper sizing).

**Fix approach:**
1. Find truncation CSS rules (likely `white-space: nowrap` or `text-overflow: ellipsis`)
2. Change to allow wrapping: `white-space: normal` or `white-space: pre-wrap`
3. Ensure the container has `overflow-wrap: break-word` to handle long words
4. The container div should have a fixed/max height with `overflow-y: auto` if scrolling is needed

**Example fix:**
```css
.compact-result {
  /* Remove any truncation */
  white-space: normal;
  overflow-wrap: break-word;
  /* Don't use text-overflow: ellipsis */
}

.compact-action-log {
  /* Keep fixed height, allow internal scrolling if needed */
  max-height: 150px; /* or whatever current height is */
  overflow-y: auto;
}
```

**Acceptance criteria:**
- Long messages wrap to multiple lines instead of being cut off
- Messages like "Enrolled in Miners Guild, congratulations! ... go there to begin your mining career. Directions..." should show completely
- The action log container should not grow infinitely - use max-height with overflow scroll if needed
- Text should wrap naturally at word boundaries

---

## 4. Add Action Tooltips - DONE

**Priority:** High | **Effort:** Medium

**Problem:** Actions like "survey" and "explore" have no explanation. Players don't know what they do or why tick costs vary.

**Files to modify:**
- `src/session/types.ts` - add `description` field to `ValidAction`
- Backend files that generate `ValidAction` objects - add descriptions
- `src/web/client/components/CurrentArea.tsx` - display tooltip

**Step 1: Add description to ValidAction type**

In `src/session/types.ts`, find the `ValidAction` interface and add a description field:
```typescript
export interface ValidAction {
  command: string
  displayName: string
  timeCost: number
  isVariable?: boolean
  description?: string  // NEW: explains what this action does
}
```

**Step 2: Add descriptions in backend**

Search for where `ValidAction` objects are created (likely in `src/` game logic files). Add descriptions like:
- `explore`: "Search for paths to adjacent undiscovered areas"
- `survey`: "Search this area for resource nodes and points of interest"
- `mine`: "Extract stone from this ore vein"
- `chop`: "Harvest wood from this tree stand"
- `enrol`/`enroll`: "Join this guild to learn its skills"
- `accept`: "Take on this contract for rewards"
- `turn-in`: "Complete this contract and claim your reward"
- Travel actions: "Travel to {destination} ({ticks} ticks)"

**Step 3: Update CurrentArea.tsx to show tooltips**

Current code (lines 70-81):
```tsx
<div key={action.command} class="action-item">
  <button
    onClick={() => onAction(action.command)}
    disabled={disabled}
    title={`${action.displayName} (${action.timeCost} ticks)${action.isVariable ? " - variable" : ""}`}
  >
    {action.displayName}
    {action.timeCost > 0 && (
      <span class="time-cost">{action.timeCost} ticks</span>
    )}
  </button>
  <code class="action-command">{action.command}</code>
</div>
```

**Change the `title` attribute to include description:**
```tsx
title={action.description || `${action.displayName} (${action.timeCost} ticks)${action.isVariable ? " - variable" : ""}`}
```

**Acceptance criteria:**
- Hovering over any action button shows a tooltip explaining what the action does
- Tooltips are concise (1-2 sentences max)
- All common actions have descriptions: explore, survey, mine, chop, travel, enrol, accept, turn-in, leave, go
- If an action has no description, fall back to showing the basic info (name + ticks)

---

## 5. Map Labels - Smaller Text, No Truncation

**Priority:** Low | **Effort:** Low

**Problem:** Map node labels are truncated ("Silvermi..." instead of "Silvermist Ridge").

**Files to modify:**
- `src/web/client/components/mapUtils.ts` - remove truncation
- `src/web/client/components/Map.tsx` - reduce font size

**Step 1: Remove truncation in mapUtils.ts**

The `truncateText` function (lines 92-94) is used for map labels. Either:
- Remove calls to `truncateText` for area names, OR
- Increase the max length significantly (e.g., 30+ chars)

**Step 2: Reduce font size in Map.tsx**

In MiniMap (around line 78), the connected area text uses `fontSize={9}`:
```tsx
<text
  x={pos.x}
  y={pos.y + 3}
  textAnchor="middle"
  fill="white"
  fontSize={9}  // Currently 9
  fontWeight="bold"
>
  {truncateText(conn.toAreaName, 9)}  // Remove truncateText call
</text>
```

**Change to:**
```tsx
<text
  x={pos.x}
  y={pos.y + 3}
  textAnchor="middle"
  fill="white"
  fontSize={7}  // Smaller font
  fontWeight="bold"
>
  {conn.toAreaName}  // Full name, no truncation
</text>
```

Similarly in FullScreenMap (around line 207), area names use `fontSize={10}`:
```tsx
<text
  x={pos.x}
  y={pos.y + 4}
  textAnchor="middle"
  fill="white"
  fontSize={10}  // Currently 10
  fontWeight={isCurrent ? "bold" : "normal"}
>
  {area.areaName}
</text>
```

**Change to:**
```tsx
fontSize={8}  // or 9
```

**Acceptance criteria:**
- Map labels show full location names ("Silvermist Ridge" not "Silvermi...")
- Text is smaller but still readable
- Labels don't overlap with each other excessively
- Both mini-map and full-screen map show full names

---

## 6. Map Area Content Indicators (Guild-Gated)

**Priority:** Medium | **Effort:** Medium

**Problem:** Map doesn't show what activities are available in each area. Players must travel to check.

**Important:** Icons should only appear for guilds the player has joined.

**Files to modify:**
- `src/session/types.ts` - add activity info to map area types
- Backend game logic - populate activity info for map areas
- `src/web/client/components/Map.tsx` - render icons
- `src/web/client/components/mapUtils.ts` - add icon rendering helpers

**Step 1: Extend types**

In `src/session/types.ts`, find `WorldMapAreaInfo` or `ConnectionInfo` and add:
```typescript
export interface AreaActivities {
  hasMining?: boolean      // Show pickaxe icon
  hasForestry?: boolean    // Show tree icon
  hasCombat?: boolean      // Show skull icon
  hasUnexploredPaths?: boolean  // Show "?" icon
}

// Add to WorldMapAreaInfo
export interface WorldMapAreaInfo {
  areaId: AreaID
  areaName: string
  distance: number
  explorationStatus: ExplorationStatus
  activities?: AreaActivities  // NEW
}
```

**Step 2: Backend populates activities**

The backend needs to:
1. Check which guilds the player has joined (has Mining skill? Forestry skill? etc.)
2. Only include activity flags for guilds the player is in
3. For each area, check if it has nodes of that type

Example logic:
```typescript
const activities: AreaActivities = {}
if (player.hasSkill('mining') && area.hasOreVeins) {
  activities.hasMining = true
}
if (player.hasSkill('forestry') && area.hasTreeStands) {
  activities.hasForestry = true
}
// etc.
```

**Step 3: Render icons in Map.tsx**

After the area name text, add small icons. In the mini-map and full-map, below the area name:
```tsx
{/* Activity icons */}
{area.activities && (
  <g transform={`translate(${pos.x - 15}, ${pos.y + radius + 5})`}>
    {area.activities.hasMining && <text fontSize={10}>⛏</text>}
    {area.activities.hasForestry && <text fontSize={10} x={12}>🌲</text>}
    {area.activities.hasCombat && <text fontSize={10} x={24}>⚔</text>}
    {area.activities.hasUnexploredPaths && <text fontSize={10} x={36}>?</text>}
  </g>
)}
```

**Step 4: Update legend**

The legend (currently showing exploration status colors) should also show activity icons, but ONLY for guilds the player has joined. The `hasExplorationSkill` prop pattern already exists - extend this:

```tsx
interface MapProps {
  location: LocationInfo
  exploration: ExplorationInfo
  hasExplorationSkill: boolean
  hasMiningSkill: boolean    // NEW
  hasForestrySkill: boolean  // NEW
  hasCombatSkill: boolean    // NEW
}
```

In the legend, conditionally show:
```tsx
{hasMiningSkill && (
  <>
    <text>⛏</text>
    <text>Mining</text>
  </>
)}
{hasForestrySkill && (
  <>
    <text>🌲</text>
    <text>Forestry</text>
  </>
)}
// etc.
```

**Acceptance criteria:**
- Map nodes show small icons indicating available activities
- Icons only appear for guilds the player has joined (no mining icon if not in Miners Guild)
- Legend explains what icons mean
- Legend only shows icons for activities the player can see
- Icons don't make the map too cluttered (keep them small)

---

## 7. Explain Tick Cost Variation

**Priority:** Medium | **Effort:** Low

**Problem:** Same action costs different amounts in different areas (explore: 11 ticks vs 48 ticks) with no explanation.

**Files to modify:**
- `src/session/types.ts` - add cost explanation to ValidAction
- Backend game logic - provide cost explanations
- `src/web/client/components/CurrentArea.tsx` - display explanation

**Step 1: Add costExplanation to ValidAction**

In `src/session/types.ts`:
```typescript
export interface ValidAction {
  command: string
  displayName: string
  timeCost: number
  isVariable?: boolean
  description?: string
  costExplanation?: string  // NEW: why does this cost what it costs?
}
```

**Step 2: Backend provides explanations**

When generating ValidActions, add explanations for variable-cost actions:
- Explore in easy area: `costExplanation: "Open terrain"`
- Explore in hard area: `costExplanation: "Rough terrain"`
- Travel short distance: `costExplanation: "Nearby"`
- Travel long distance: `costExplanation: "Distant"`

**Step 3: Display in UI**

In CurrentArea.tsx, update the button to show explanation:
```tsx
<button
  onClick={() => onAction(action.command)}
  disabled={disabled}
  title={action.description || action.displayName}
>
  {action.displayName}
  {action.timeCost > 0 && (
    <span class="time-cost">
      {action.timeCost} ticks
      {action.costExplanation && (
        <span class="cost-explanation"> ({action.costExplanation})</span>
      )}
    </span>
  )}
</button>
```

**Acceptance criteria:**
- Actions with variable tick costs show an explanation
- The explanation appears near the tick cost (e.g., "48 ticks (rough terrain)")
- Players can understand why the same action costs more in some areas
- Explanations are brief (1-3 words)

---

## 8. Hide Redundant Command Text

**Priority:** Low | **Effort:** Low

**Problem:** Each action shows both a button AND command text (e.g., `[Go to Miners Guild] go miners-guild`). This clutters the UI.

**File to modify:**
- `src/web/client/components/CurrentArea.tsx`
- `src/web/client/styles/main.css`

**Current code in CurrentArea.tsx (lines 70-82):**
```tsx
<div key={action.command} class="action-item">
  <button
    onClick={() => onAction(action.command)}
    disabled={disabled}
    title={`${action.displayName} (${action.timeCost} ticks)${action.isVariable ? " - variable" : ""}`}
  >
    {action.displayName}
    {action.timeCost > 0 && (
      <span class="time-cost">{action.timeCost} ticks</span>
    )}
  </button>
  <code class="action-command">{action.command}</code>  {/* REMOVE THIS LINE */}
</div>
```

**Option A: Simply remove the command text line:**
```tsx
<div key={action.command} class="action-item">
  <button
    onClick={() => onAction(action.command)}
    disabled={disabled}
    title={`${action.displayName} (${action.timeCost} ticks)${action.isVariable ? " - variable" : ""}`}
  >
    {action.displayName}
    {action.timeCost > 0 && (
      <span class="time-cost">{action.timeCost} ticks</span>
    )}
  </button>
  {/* Command text removed - shown on hover via title attribute if needed */}
</div>
```

**Option B: Hide by default, show on hover (CSS approach):**

Keep the JSX the same but add CSS:
```css
.action-command {
  display: none;
}

.action-item:hover .action-command {
  display: inline;
}
```

**Acceptance criteria:**
- Command text is not visible by default
- UI is cleaner with just the button and tick cost visible
- (Optional) Power users can still see commands via hover or a toggle
- No functionality is lost - commands still work via CommandInput

---

## 9. Move Storage to Main Content Area (Warehouse Only)

**Priority:** Medium | **Effort:** Low

**Problem:** Storage is always visible in the right-hand sidebar, but it's only relevant when the player is at the warehouse location. This wastes sidebar space and confuses players about when they can access storage.

**Current behavior:**
- Storage panel appears in the sidebar (`Sidebar.tsx`) regardless of location
- Shows "Empty" when nothing is stored, which is confusing when not at warehouse

**Desired behavior:**
- Storage should NOT appear in the sidebar
- Storage should appear in the main content area (`CurrentArea.tsx`) ONLY when at the warehouse
- Positioned below contracts and above available actions (consistent with other location-specific content)

**Files to modify:**
- `src/web/client/components/Sidebar.tsx` - remove Storage import and usage
- `src/web/client/components/CurrentArea.tsx` - conditionally render Storage when at warehouse
- `src/web/client/App.tsx` - pass storage prop to CurrentArea

**Step 1: Remove Storage from Sidebar**

In `src/web/client/components/Sidebar.tsx`, remove the Storage import and component:

```diff
-import { Storage } from "./Storage"
```

And remove from the sidebar-top div:
```diff
 <div class="sidebar-top">
   <Inventory inventory={state.inventory} />
-  <Storage storage={state.storage} />
   <Skills skills={state.skills} />
   <Contracts contracts={state.contracts} skills={state.skills} />
 </div>
```

**Step 2: Update CurrentArea props**

In `src/web/client/components/CurrentArea.tsx`, add storage and location ID to props:

```typescript
import type { LocationInfo, ContractInfo, ValidAction, StorageInfo } from "../../../session/types"
import { Storage } from "./Storage"

interface CurrentAreaProps {
  location: LocationInfo
  contracts: ContractInfo[]
  actions: ValidAction[]
  storage: StorageInfo  // NEW
  onAction: (command: string) => void
  disabled?: boolean
}
```

**Step 3: Conditionally render Storage in CurrentArea**

After the contracts section and before the actions section, add:

```tsx
{/* Storage - only shown at warehouse */}
{location.locationId === "TOWN_WAREHOUSE" && (
  <div class="area-storage">
    <Storage storage={storage} />
  </div>
)}
```

The full structure becomes:
1. Area header
2. Contracts Available Here (if any)
3. **Storage (if at warehouse)** ← NEW
4. Available Actions

**Step 4: Pass storage to CurrentArea in App.tsx**

In `src/web/client/App.tsx`, update the CurrentArea usage:

```diff
 <CurrentArea
   location={state.location}
   contracts={state.contracts}
   actions={validActions}
+  storage={state.storage}
   onAction={sendCommand}
   disabled={isExecuting}
 />
```

**Step 5: Optional CSS styling**

The Storage component already has the "panel" class. You may want to add `.area-storage` styling in `main.css` to ensure it fits well in the main content area:

```css
.area-storage {
  margin-bottom: 1rem;
}

.area-storage .storage {
  /* Override any sidebar-specific styles if needed */
}
```

**Technical notes:**
- Warehouse location ID is `"TOWN_WAREHOUSE"` (see `src/policy-runner/observation.ts:206`)
- The `LocationInfo.locationId` field is `string | null` (null = at hub/clearing)
- The Storage component (`src/web/client/components/Storage.tsx`) doesn't need changes

**Acceptance criteria:**
- Storage panel does NOT appear in the sidebar (right column) anywhere
- Storage panel appears in the main content area ONLY when at warehouse (locationId === "TOWN_WAREHOUSE")
- Storage shows stored items with quantities when at warehouse
- Storage shows "Empty" when at warehouse with no stored items
- When NOT at warehouse, no storage UI is visible
- No functionality changes - store/retrieve actions still work the same way
