# Web Interface for Grind Game Engine

## Summary

Add a web interface to the game that provides the same functionality as the REPL/Agent, architected to prevent divergence between the three UIs.

**Key Decisions:**
- Same-process architecture (web server + game in one Node.js process)
- Fastify for HTTP/WebSocket backend
- Preact + Vite for frontend
- WebSockets for real-time updates and command streaming
- GameSession abstraction as shared foundation for all UIs

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        GameSession                               │
│  - Owns WorldState                                               │
│  - Executes commands, returns structured data                    │
│  - Handles save/load serialization                               │
│  - Single source of truth for game logic                         │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌───────────┐       ┌───────────┐       ┌───────────┐
   │   REPL    │       │   Agent   │       │    Web    │
   │  Adapter  │       │  Adapter  │       │  Adapter  │
   └───────────┘       └───────────┘       └───────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   formatters.ts        LLM context         Preact UI
   (text output)        (text output)       (JSON → components)
```

---

## UI Layout

```
┌─────────────────────────────────┬──────────────────┐
│                                 │    Inventory     │
│     Action History / Results    │    Storage       │
│     (scrolling log)             │    Skills        │
│                                 │    Contracts     │
│                                 ├──────────────────┤
│                                 │                  │
│                                 │    Map (SVG)     │
├─────────────────────────────────┤                  │
│  Valid Actions (clickable)      │                  │
│  Command Input (text)           │                  │
└─────────────────────────────────┴──────────────────┘
```

- **Right sidebar:** Permanent, always-updated state (inventory, storage, skills, contracts, map)
- **Main area:** Scrolling action history and results
- **Bottom:** Valid actions (clickable) + command text input
- **Map:** SVG rendering of areas/connections

---

## Project Structure

```
src/
├── session/                    # NEW: GameSession abstraction
│   ├── GameSession.ts          # Core session class
│   ├── types.ts                # Session-related types
│   └── index.ts                # Exports
├── web/                        # NEW: Web interface
│   ├── server/
│   │   ├── index.ts            # Fastify server entry, routes
│   │   ├── websocket.ts        # WebSocket handlers
│   │   └── protocol.ts         # Message type definitions
│   └── client/
│       ├── index.html          # Entry HTML
│       ├── main.tsx            # Preact entry
│       ├── App.tsx             # Root component
│       ├── components/
│       │   ├── ActionHistory.tsx
│       │   ├── CommandInput.tsx
│       │   ├── ValidActions.tsx
│       │   ├── Sidebar.tsx
│       │   ├── Inventory.tsx
│       │   ├── Storage.tsx
│       │   ├── Skills.tsx
│       │   ├── Contracts.tsx
│       │   └── Map.tsx         # SVG map rendering
│       ├── hooks/
│       │   ├── useWebSocket.ts
│       │   └── useGameState.ts
│       └── styles/
│           └── main.css
├── repl.ts                     # Refactor to use GameSession
├── agent/                      # Refactor to use GameSession
│   └── loop.ts
└── ... (existing files)
```

---

## Implementation Phases

### Phase 1: GameSession Abstraction

**Goal:** Create a unified interface that all UIs will use.

**Files to create:**
- `src/session/GameSession.ts`
- `src/session/types.ts`
- `src/session/index.ts`

**GameSession class interface:**
```typescript
class GameSession {
  // Creation
  static create(seed: string): GameSession
  static fromSavedState(json: string): GameSession

  // State access (returns structured data, not formatted text)
  getState(): GameStateSnapshot
  getValidActions(): ValidAction[]

  // Command execution
  executeCommand(command: string): AsyncGenerator<CommandTick, CommandResult>

  // Persistence
  serialize(): string

  // Lifecycle
  getSessionId(): string
  getElapsedTicks(): number
}

interface GameStateSnapshot {
  location: LocationInfo
  inventory: InventoryInfo
  storage: StorageInfo
  skills: SkillInfo[]
  contracts: ContractInfo[]
  exploration: ExplorationInfo
  time: TimeInfo
}

interface CommandTick {
  type: 'progress' | 'feedback'
  message?: string
  progress?: number
}

interface CommandResult {
  success: boolean
  log: ActionLog
  stateAfter: GameStateSnapshot
}
```

**Files to modify:**
- `src/repl.ts` - Refactor to use GameSession
- `src/agent/loop.ts` - Refactor to use GameSession

**Tests:**
- `src/session/GameSession.test.ts` - Unit tests for session behavior
- Ensure existing REPL/Agent tests still pass after refactor

---

### Phase 2: Web Server Setup

**Goal:** Fastify server with WebSocket support, serving static files.

**Dependencies to add:**
```json
{
  "fastify": "^5.x",
  "@fastify/websocket": "^11.x",
  "@fastify/static": "^8.x"
}
```

**Files to create:**
- `src/web/server/index.ts` - Server entry, routes
- `src/web/server/websocket.ts` - WebSocket connection handling
- `src/web/server/protocol.ts` - Message types

**WebSocket Protocol:**
```typescript
// Client → Server
type ClientMessage =
  | { type: 'new_game'; seed?: string }
  | { type: 'load_game'; savedState: string }
  | { type: 'command'; command: string }
  | { type: 'get_state' }
  | { type: 'get_valid_actions' }

// Server → Client
type ServerMessage =
  | { type: 'state'; state: GameStateSnapshot }
  | { type: 'valid_actions'; actions: ValidAction[] }
  | { type: 'command_tick'; tick: CommandTick }
  | { type: 'command_result'; result: CommandResult }
  | { type: 'error'; message: string }
```

**npm scripts to add:**
```json
{
  "web": "npm run build:web && node dist/web/server/index.js",
  "web:dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
  "dev:server": "tsx watch src/web/server/index.ts",
  "dev:client": "vite src/web/client"
}
```

---

### Phase 3: Preact Client Setup

**Goal:** Vite + Preact scaffolding with WebSocket connection.

**Dependencies to add:**
```json
{
  "preact": "^10.x",
  "vite": "^6.x",
  "@preact/preset-vite": "^2.x"
}
```

**Files to create:**
- `src/web/client/index.html`
- `src/web/client/main.tsx`
- `src/web/client/App.tsx`
- `src/web/client/hooks/useWebSocket.ts`
- `src/web/client/hooks/useGameState.ts`
- `vite.config.ts`

**useWebSocket hook:**
- Establishes WebSocket connection
- Handles reconnection
- Provides send function and message stream
- Manages connection state

**useGameState hook:**
- Subscribes to WebSocket messages
- Maintains current GameStateSnapshot
- Provides command execution function
- Tracks command history

---

### Phase 4: Implement UI Components

**Goal:** Build the UI layout with all regions.

**Components:**

1. **App.tsx** - Root layout, grid structure
2. **ActionHistory.tsx** - Scrolling log of past actions and results
3. **CommandInput.tsx** - Text input for typing commands
4. **ValidActions.tsx** - Clickable buttons for current valid actions
5. **Sidebar.tsx** - Container for right-side panels
6. **Inventory.tsx** - Current inventory display
7. **Storage.tsx** - Storage contents display
8. **Skills.tsx** - Skill levels and XP progress
9. **Contracts.tsx** - Active contracts and progress
10. **Map.tsx** - SVG rendering of explored areas

**Styling:**
- CSS Grid for main layout
- Fixed-width font for text content (monospace)
- CSS variables for theming potential
- Responsive (but desktop-first)

---

### Phase 5: Wire Up Complete Flow

**Goal:** End-to-end functionality matching REPL capabilities.

**Features to implement:**
1. New game creation (with optional seed)
2. Command execution with streaming progress
3. Real-time state updates after each action
4. Valid action display with clickable execution
5. Save/load game state
6. Action history scrolling

**Command flow:**
1. User types command or clicks valid action
2. Client sends `{ type: 'command', command: '...' }` via WebSocket
3. Server calls `gameSession.executeCommand()`
4. Server streams `command_tick` messages for progress
5. Server sends `command_result` with final result
6. Server sends updated `state` snapshot
7. Client updates all UI regions

---

## Critical Files Reference

**Game Engine (read to understand, may need minor modifications):**
- `src/engine.ts` - Action execution (async generators)
- `src/actionChecks.ts` - Precondition validation
- `src/types.ts` - Core type definitions
- `src/world.ts` - World factory

**Current REPL (refactor to use GameSession):**
- `src/repl.ts` - Main REPL loop
- `src/runner.ts` - Session runner, parseAction()
- `src/interactive.ts` - Animated action runner

**Current Agent (refactor to use GameSession):**
- `src/agent/loop.ts` - Agent state machine
- `src/agent/index.ts` - Agent entry point

**Formatters (CLI-specific, Web won't use directly):**
- `src/agent/formatters.ts` - Text formatting

---

## Verification Plan

After implementation, verify:

1. **GameSession works standalone:**
   ```bash
   npm test -- --grep "GameSession"
   ```

2. **Existing REPL still works:**
   ```bash
   npm run repl
   # Play through: new game, gather, travel, accept contract
   ```

3. **Existing Agent still works:**
   ```bash
   npm run agent
   # Watch it play autonomously
   ```

4. **Web server starts:**
   ```bash
   npm run web:dev
   # Open http://localhost:3000
   ```

5. **Web UI functionality:**
   - Start new game
   - See initial state in sidebar
   - Type a command (e.g., "survey")
   - See progress dots animate
   - See result in action history
   - See state update in sidebar
   - Click a valid action button
   - Save game, refresh, load game

6. **Full check passes:**
   ```bash
   npm run check
   ```

---

## Dependencies Summary

**New production dependencies:**
- `fastify` - Web framework
- `@fastify/websocket` - WebSocket support
- `@fastify/static` - Static file serving
- `preact` - UI framework

**New dev dependencies:**
- `vite` - Build tool
- `@preact/preset-vite` - Vite plugin for Preact
- `concurrently` - Run multiple npm scripts

---

## Open Questions / Future Considerations

Not in scope for initial implementation, but noted:
- Mobile responsive layout
- Multiple save slots
- Sound effects
- Keyboard shortcuts
- Theming / dark mode
- Accessibility (screen readers)
