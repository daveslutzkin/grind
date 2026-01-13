## Persistence — Save/Resume System

### Purpose

Persistence allows sessions to be saved and resumed later, enabling long-running playthroughs and session continuity.

---

### Save File Structure

Saves are stored as JSON files in the `saves/` directory, named by seed:

```
saves/
  my-seed.json
  another-seed.json
```

Each save file contains:

```typescript
interface SaveFile {
  version: number        // Schema version for compatibility
  savedAt: string        // ISO timestamp of save
  seed: string           // RNG seed used
  state: WorldState      // Full world state (serialized)
  stats: SessionStats    // Cumulative session statistics
}
```

---

### Serialization

**Maps to Objects**: The `exploration.areas` Map is converted to a plain object for JSON serialization:
- Save: `Map<AreaID, Area>` → `Record<AreaID, Area>`
- Load: `Record<AreaID, Area>` → `Map<AreaID, Area>`

**Atomic Writes**: Saves use a write-to-temp-then-rename pattern to prevent corruption from interrupted writes.

---

### Version Compatibility

Each save has a `version` number (`SAVE_VERSION` from types.ts).

**On load**:
- Matching version: Load normally
- Mismatched version: Warn but attempt to load (lenient)

This allows forward compatibility for minor schema changes while alerting users to potential issues.

---

### API

```typescript
// Check if save exists
saveExists(seed: string): boolean

// Load a save (throws on error)
loadSave(seed: string): SaveFile

// Write a save (creates directory if needed)
writeSave(seed: string, session: Session): void

// Delete a save
deleteSave(seed: string): void

// Get path for a seed's save file
getSavePath(seed: string): string
```

---

### Session Statistics

Stats tracked across saves:

```typescript
interface SessionStats {
  actionsExecuted: number
  actionsFailed: number
  sessionStartLogIndex: number  // For log continuity
}
```

---

### Design Principles

1. **Seed-based naming**: One save per seed, predictable location
2. **Fail hard on errors**: No silent corruption; throw on read/parse failures
3. **Warn on version mismatch**: Don't block loading, but inform user
4. **Atomic writes**: Prevent partial saves from corrupting game state
5. **Human-readable**: JSON with pretty-printing for debugging
