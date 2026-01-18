# Testing Approaches

This document describes all the ways we test the simulation engine.

## Overview

| Approach | Purpose | When to Use |
|----------|---------|-------------|
| Unit Tests | Verify individual functions and modules | During development, CI |
| Integration Tests | Verify multiple modules working together | During development, CI |
| Acceptance Tests | Verify spec requirements are met | After feature completion |
| Policy Runner | Statistical validation across many seeds | Balance tuning, regression detection |
| REPL | Manual exploration and debugging | Interactive CLI testing, edge case investigation |
| Web UI | Visual manual exploration | Interactive graphical testing, UX validation |
| LLM Agent | AI-driven gameplay exploration | Finding unexpected behaviors |

---

## 1. Unit Tests

**What it tests:** Individual functions and modules in isolation.

**Run with:**
```bash
npm test                 # Run all tests
npm test -- --watch      # Watch mode for development
npm test -- <pattern>    # Run tests matching pattern
```

Tests are colocated with source files using the `.test.ts` suffix.

**Key test files:**
- `src/engine.test.ts` - Action execution
- `src/world.test.ts` - World generation
- `src/combat.test.ts` - Combat resolution
- `src/exploration.test.ts` - Discovery mechanics
- `src/gather.test.ts` - Resource gathering

---

## 2. Integration Tests

**What it tests:** Multiple modules working together through realistic action sequences.

**Run with:**
```bash
npm test -- integration
```

**Location:** `src/integration.test.ts`

These tests run complete session flows exercising the full action lifecycle: accepting contracts, traveling, gathering, combat, crafting, etc.

---

## 3. Acceptance Tests

**What it tests:** Spec requirements from design documents.

**Run with:**
```bash
npm test -- acceptance
```

**Location:** `src/acceptance.test.ts`

Structured to match spec documents (e.g., `design-docs/spec-gathering-mvp.md`) with tests organized by spec section.

---

## 4. Policy Runner

**What it tests:** Statistical properties of game progression across many seeds using deterministic policies.

**Run with:**
```bash
# Single run with specific seed
npx tsx src/policy-runner/cli.ts --seed test-1 --policy safe --target-level 3

# Batch run with 100 random seeds
npx tsx src/policy-runner/cli.ts --batch --seed-count 100 --policy greedy

# Parallel batch (uses all CPU cores)
npx tsx src/policy-runner/cli.ts --batch --parallel --seed-count 100 --policy safe

# Compare all policies
npx tsx src/policy-runner/cli.ts --batch --seed-count 50 --policy all
```

### How it works

1. Creates a fresh world from a seed
2. Enrolls in Mining and Exploration guilds
3. Runs a policy decision loop that observes world state and chooses actions
4. Tracks metrics: XP gained, ticks spent, level-ups, distances reached
5. Terminates when: target level reached, max ticks exceeded, or progress stalls

### Available policies

| Policy | Strategy |
|--------|----------|
| `safe` | Conservative - prefers closer areas, reliable progression |
| `greedy` | Aggressive - pushes to highest unlocked distance |
| `balanced` | Optimizes XP/tick ratio accounting for travel time |

### CLI options

```
-s, --seed <seed>       Single seed for reproducible run
--seeds <s1,s2,...>     Comma-separated list of seeds for batch
-n, --seed-count <n>    Generate N random seeds for batch (default: 100)
-p, --policy <name>     Policy to use: safe, greedy, balanced, all
-l, --target-level <n>  Target mining level to reach (default: 5)
-t, --max-ticks <n>     Maximum ticks before timeout (default: 50000)
--stall-window <n>      Ticks without progress before stall (default: 1000)
-b, --batch             Run batch mode (multiple seeds)
-P, --parallel          Run batch in parallel using worker threads
-w, --max-workers <n>   Maximum worker threads for parallel mode
-v, --verbose           Show detailed progress
--log-actions           Output full action log (single run only)
```

### Output

Single runs show:
- Termination reason (target_reached, max_ticks, stall)
- Final skill levels and XP
- Time breakdown (mining, traveling, exploring)
- Discovery summary
- Level progression timeline

Batch runs show:
- Aggregate statistics (p10/p50/p90) for ticks to target
- Error rates and failed seeds
- Level progression aggregates across all runs

### Adding new policies

Policies are defined in `src/policy-runner/policies/`. Each implements the `Policy` interface:

```typescript
interface Policy {
  id: string
  decide(observation: Observation): PolicyAction
}
```

---

## 5. REPL

**What it tests:** Manual exploration, edge cases, specific scenarios.

**Run with:**
```bash
# Interactive mode
npx tsx src/repl.ts [--llm-cache <file>] [seed]

# Batch mode (piped input)
echo -e "cmd1\ncmd2\nend" | npx tsx src/repl.ts [--llm-cache <file>] [seed]
```

### Interactive mode

Run the REPL with a random seed, type commands manually, and see results in real-time.

### Batch mode

Pipe a sequence of commands for automated replay:

```bash
echo -e "move Explorers Guild\nenrol exploration\nend" | npx tsx src/repl.ts --llm-cache cache.json 42
```

### LLM caching

The `--llm-cache` flag enables deterministic replays by caching LLM responses (for area naming). Run once to populate the cache, then replay with identical results.

### Adaptive testing pattern

1. Start with a queue of a single action
2. Pipe it into the REPL with a known seed and LLM cache
3. See what happens
4. Adapt to that
5. Add one or more actions to the queue
6. Pipe the new queue into the REPL with the same seed and cache
7. Continue until the session is finished

---

## 6. Web UI

**What it tests:** Visual manual exploration, UI/UX validation, real-time state display.

**Status:** In development. See `design-docs/implementation-plan-web-ui.md` for details.

**Run with:**
```bash
npm run web:dev    # Development mode with hot reload
npm run web        # Production build
```

Opens at `http://localhost:3000`.

### How it works

The web UI shares the same `GameSession` abstraction as REPL and Agent, ensuring all three interfaces behave identically.

```
┌─────────────────────────────────────────────────────────────────┐
│                        GameSession                               │
│  - Owns WorldState                                               │
│  - Executes commands, returns structured data                    │
│  - Single source of truth for game logic                         │
└─────────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌───────────┐       ┌───────────┐       ┌───────────┐
   │   REPL    │       │   Agent   │       │    Web    │
   └───────────┘       └───────────┘       └───────────┘
```

### UI layout

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

### Features

- Real-time state display (inventory, skills, contracts, map)
- Clickable valid actions for quick execution
- Text command input for full control
- Streaming progress updates during actions
- Save/load game state

### Architecture

- **Backend:** Fastify with WebSocket support (same process as game engine)
- **Frontend:** Preact + Vite
- **Protocol:** JSON messages over WebSocket for commands and state updates

---

## 7. LLM Agent

**What it tests:** Emergent gameplay, finding unexpected behaviors, stress testing the action space.

**Run with:**
```bash
npm run agent <seed> [options]
```

### CLI options

```
-t, --ticks <n>       Session length in ticks (default: 25)
-o, --objective <s>   Goal for the agent (default: "explore the game and have fun")
-m, --model <s>       LLM model to use (default: gpt-4o-mini)
-v, --verbose         Show detailed output during run
```

### How it works

1. Creates a fresh world from the seed
2. Formats current world state for the LLM
3. LLM chooses an action based on its objective
4. Executes the action and logs the result
5. Repeats until tick limit

### Output

Traces are written to `traces/<rules-version>/<seed>/trace.txt` containing:
- Full reasoning at each step
- Actions chosen and their results
- World state changes

### Requirements

Requires `ANTHROPIC_API_KEY` environment variable.

---

## Quality checks

Before committing, always run:

```bash
npm run check   # format:check, lint, build, test
```

This runs all unit, integration, and acceptance tests along with formatting and type checking.
