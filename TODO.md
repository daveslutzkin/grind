# Mining UX Improvements Plan

## Summary

Four changes to improve the mining user experience:
1. Remove "focus" as a keyword since it's the default mode
2. Allow `mine` with no params when there's only one visible resource
3. Always show the Time line in extraction results
4. Show collateral damage info for undiscovered materials

---

## 1. Remove "focus" Keyword from Commands and Display

**Current behavior:**
- Commands: `mine focus stone`, `chop focus oak`
- Available actions: `mine focus <resource> (20t)`
- Skills display: `Mining L1 [FOCUS] (APPRAISE@L3)`

**New behavior:**
- Commands: `mine stone`, `chop oak` (focus mode is implicit)
- Available actions: `mine <resource> (20t)`
- Skills display: `Mining L1 (APPRAISE@L3)` at L1, `Mining L3 [APPRAISE] (CAREFUL@L4)` at L3, `Mining L4 [APPRAISE/CAREFUL]` at L4+

### Files to change:

**src/runner.ts:112-133** - REPL command parsing
- Change the `mine` case to treat the first argument as the material ID directly
- Keep `careful` and `appraise` as mode keywords
- Logic: if arg1 is "careful" or "appraise", use that mode; otherwise treat arg1 as material ID and use FOCUS mode

**src/agent/parser.ts:97-109** - Agent command parsing
- Update regex from `/^mine\s+(FOCUS|CAREFUL_ALL|CAREFUL|APPRAISE)(?:\s+(\S+))?/i`
- New pattern: `mine <material>` for FOCUS mode, `mine careful` for CAREFUL_ALL, `mine appraise` for APPRAISE
- Similar changes for `chop` on lines 113+

**src/availableActions.ts:355** - Available actions display
- Change `${commandName} focus <resource>` to `${commandName} <resource>`

**src/actionChecks.ts:350-356** - `getUnlockedModes()` function
- Remove FOCUS from the returned list (it's always available and implicit)
- Return only [APPRAISE] at L3, [APPRAISE, CAREFUL_ALL] at L4+

**src/agent/formatters.ts:210-217** - Skills display
- Update to show modes without FOCUS
- Change prospective unlock display to show next 3 levels instead of just next unlock
- At L1: show `(APPRAISE@L3)` - within 3 levels
- At L2: show `(APPRAISE@L3)` - within 3 levels
- At L3: show `[APPRAISE] (CAREFUL@L4)` - within 3 levels
- At L4+: show `[APPRAISE/CAREFUL]` - no more unlocks within 3 levels

**Tests to update:**
- src/availableActions.test.ts:190, 210 - update expected action names
- src/action-parity.test.ts:51-52, 183 - update command examples

---

## 2. Allow `mine` with No Params When Single Resource

**Current behavior:**
- `mine` with no args returns null (invalid command)

**New behavior:**
- If at a mining node with exactly one visible material, `mine` by itself uses that material
- If multiple materials visible, still require specifying which one

### Files to change:

**src/runner.ts:116-118** - Handle empty modeName
- Instead of returning null, check if there's exactly one gatherable material
- This requires access to world state, which parseCommand doesn't currently have
- May need to refactor to pass state or return a partial action that gets completed later

**src/agent/parser.ts** - Add handling for bare `mine` command
- Similar logic needed for agent parser

**Alternative approach:** In availableActions.ts, when there's only one material, generate the action with a simpler display name that doesn't require the resource argument.

---

## 3. Always Show Time Line in Extraction Results

**Current behavior:**
- src/agent/formatters.ts:817 - Only shows Time when `luckDelta !== 0`

**New behavior:**
- Always show the Time line, even when luck is 0:
  - `Time: 20 ticks (20 base, 0 luck)`

### Files to change:

**src/agent/formatters.ts:816-821**
- Remove the `luckDelta !== 0` condition
- Always display the Time line when variance data is present

---

## 4. Show Collateral Damage for Undiscovered Materials

**Current behavior:**
- src/agent/formatters.ts:801-807 - Only shows collateral for visible materials
- Invisible materials with collateral damage are silently ignored

**New behavior:**
- If any collateral damage occurred to invisible materials, show:
  - `Collateral: -1 STONE (some collateral loss of undiscovered materials)`
  - Or if NO visible collateral: `Collateral: (some collateral loss of undiscovered materials)`

### Files to change:

**src/agent/formatters.ts:800-814**
- After filtering visible collateral, check if there's any invisible collateral
- If so, append the message about undiscovered materials

---

## Implementation Order

1. **Time line fix** (simplest, isolated change)
2. **Collateral damage message** (isolated to formatter)
3. **Remove "focus" keyword** (multiple files, tests need updating)
4. **Bare `mine` command** (may require refactoring)

---

## Test Strategy (TDD)

For each change:
1. Write failing test first
2. Implement the fix
3. Run `npm run check` to verify
4. Commit when passing
