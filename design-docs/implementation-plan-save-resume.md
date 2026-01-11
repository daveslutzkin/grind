# Implementation Plan: Save/Resume Feature

## Summary

Save games to `./saves/{seed}.json` after every action. When starting a game with a seed that has an existing save, prompt with detailed game info and let the user choose to resume or start fresh (deleting the old save).

## Requirements

| Requirement | Decision |
|-------------|----------|
| Save location | `./saves/` in repo root |
| File naming | `{seed}.json` |
| When to save | Auto-save after every action |
| Resume behavior | Prompt user with detailed summary |
| If user declines resume | Delete save, start fresh |
| Prompt detail level | Detailed (tick, area, timestamp, skills, inventory) |
| Corrupted saves | Fail hard with error message |
| Versioning | Include version, but attempt to load anyway (lenient) |
| Session end (ticks = 0) | Keep save (allows extending and resuming) |
| What to save | Full session (state + stats + logs) |
| Save management commands | None (manual file management) |

---

## File Changes

### 1. New file: `src/persistence.ts`

**Purpose**: Serialization/deserialization utilities

**Contents**:

```typescript
// Save file structure
interface SaveFile {
  version: number           // Start at 1
  savedAt: string           // ISO timestamp
  seed: string
  state: SerializedWorldState
  stats: SessionStats
}

// SerializedWorldState is WorldState with areas as Record<AreaID, Area> instead of Map
```

**Functions to implement**:

- `serializeSession(session: Session, seed: string): SaveFile`
  - Convert `exploration.areas` Map → plain object
  - Add version and timestamp metadata

- `deserializeSession(save: SaveFile): Session`
  - Convert areas object → Map
  - Restore full Session structure

- `getSavePath(seed: string): string`
  - Returns `./saves/{seed}.json`

- `saveExists(seed: string): boolean`
  - Check if save file exists for given seed

- `loadSave(seed: string): SaveFile`
  - Read and parse save file
  - Throws on parse/read error (fail hard)

- `writeSave(seed: string, session: Session): void`
  - Serialize session and write to file
  - Create `./saves/` directory if it doesn't exist

- `deleteSave(seed: string): void`
  - Remove save file for given seed

---

### 2. New file: `src/savePrompt.ts`

**Purpose**: User interaction for resume prompt

**Functions to implement**:

- `formatSaveSummary(save: SaveFile): string`
  - Format detailed summary including:
    - Tick progress: "Tick 1,234 of 10,000"
    - Current area name
    - Last saved timestamp
    - Skill levels (all 6 skills)
    - Inventory count and capacity
    - Active contracts count
    - Guild reputation

- `promptResume(save: SaveFile): Promise<boolean>`
  - Display formatted summary
  - Ask "Resume this game? (y/n)"
  - Return true if user wants to resume, false otherwise

---

### 3. Modify: `src/runner.ts`

**Changes required**:

1. **Import** persistence and prompt utilities

2. **At session start** (in `runSession` or equivalent):
   ```
   if saveExists(seed):
     save = loadSave(seed)
     display formatSaveSummary(save)
     if promptResume(save):
       session = deserializeSession(save)
       continue with existing session
     else:
       deleteSave(seed)
       session = createSession(seed)
   else:
     session = createSession(seed)
   ```

3. **After each action** (after successful execution):
   ```
   writeSave(seed, session)
   ```

4. **Directory creation**: Ensure `./saves/` exists before first write

---

### 4. Modify: `src/types.ts` (minimal)

**Changes**:

- Export a `SAVE_VERSION` constant (start at `1`)
- Optionally add `SerializedWorldState` type alias for documentation

---

## Implementation Order

1. **Create `src/persistence.ts`**
   - Implement SaveFile interface
   - Implement serialization (Map → Object for areas)
   - Implement deserialization (Object → Map for areas)
   - Implement file operations (read/write/delete/exists)
   - Handle directory creation

2. **Create `src/savePrompt.ts`**
   - Implement formatSaveSummary with all required fields
   - Implement promptResume with y/n input handling

3. **Modify `src/runner.ts`**
   - Add save existence check at startup
   - Add resume prompt flow
   - Add delete-on-decline flow
   - Add auto-save after each action

4. **Add tests**
   - Serialization round-trip tests (serialize → deserialize → deep equal)
   - File operation tests (write, read, delete, exists)
   - Resume flow tests (mock user input)

5. **Manual integration test**
   - Play a few actions, quit
   - Restart with same seed, verify prompt appears
   - Resume and verify state is correct
   - Decline resume and verify fresh start

---

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Save file corrupted/malformed JSON | Fail with error, user must manually delete file |
| Save version mismatch | Log warning, attempt to load anyway |
| `./saves/` directory doesn't exist | Create directory on first save |
| Session ends naturally (ticks = 0) | Keep save file, can extend ticks and resume |
| User declines resume | Delete save file, start fresh game |
| Crash/quit mid-action | Resume from last completed action (auto-save is after each action) |
| Seed contains invalid filename chars | Should handle or document valid seed format |

---

## Files Untouched

These files require no modifications:

- `engine.ts` - Stateless action execution, unaware of persistence
- `world.ts` - Initial state creation only
- `rng.ts` - Counter state preserved in WorldState
- `exploration.ts` - All state lives in WorldState
- `actions/*.ts` - Action handlers don't know about persistence

---

## Technical Notes

### Map Serialization

The `exploration.areas` field is a `Map<AreaID, Area>`. JSON.stringify doesn't handle Maps, so:

**Serialize**:
```typescript
const serializedAreas = Object.fromEntries(state.exploration.areas)
```

**Deserialize**:
```typescript
const areas = new Map(Object.entries(savedAreas))
```

### Save File Location

Use path relative to working directory:
```typescript
const SAVES_DIR = './saves'
const getSavePath = (seed: string) => `${SAVES_DIR}/${seed}.json`
```

### Atomic Writes (optional enhancement)

For robustness, consider writing to a temp file then renaming:
```typescript
write to `{seed}.json.tmp`
rename to `{seed}.json`
```
This prevents corrupted saves if the process crashes mid-write.

---

## Example Save File

```json
{
  "version": 1,
  "savedAt": "2026-01-10T14:30:00.000Z",
  "seed": "my-game-seed",
  "state": {
    "time": {
      "currentTick": 1234,
      "sessionRemainingTicks": 8766
    },
    "player": {
      "inventory": [...],
      "skills": {...},
      ...
    },
    "world": {...},
    "exploration": {
      "areas": {
        "area-001": {...},
        "area-002": {...}
      },
      ...
    },
    "rng": {
      "seed": "my-game-seed",
      "counter": 5678
    }
  },
  "stats": {
    "logs": [...],
    "startingSkills": {...}
  }
}
```

---

## Example Resume Prompt

```
Save found for seed 'my-game-seed':
  Last saved: 2026-01-10 14:30
  Progress: Tick 1,234 of 10,000 (12%)
  Current area: Dense Forest

  Skills:
    Mining: 15 | Foraging: 12 | Combat: 8
    Crafting: 5 | Trading: 3 | Exploration: 10

  Inventory: 24/30 slots
  Active contracts: 2
  Guild reputation: 150

Resume this game? (y/n)
```
