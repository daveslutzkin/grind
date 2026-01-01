# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a rules-first simulation engine - a headless, single-agent game engine with discrete time, deterministic RNG, and structured logging. The engine executes actions but never chooses them.

## Core Architectural Constraints

- **Headless engine**: No UI, no networking, no persistence beyond in-memory objects
- **Single-agent execution**: One player only, no other agents
- **Controlled mutable state**: All state lives in WorldState
- **Discrete time**: Actions consume fixed ticks, no concurrent/background actions
- **Deterministic RNG**: All randomness through seeded RNG with counter, every draw logged
- **Full structured logging**: Every action emits ActionLog with before/after state

## Engine Boundaries

The engine MUST:
- Hold mutable WorldState
- Accept Action objects
- Validate action preconditions
- Apply state mutations
- Advance time
- Produce structured logs
- Expose read-only evaluation APIs

The engine MUST NEVER:
- Choose actions
- Optimize plans
- Suggest strategies
- Contain agent logic

## Action Set (exactly 7)

1. **Move** - location change, Travel XP
2. **AcceptContract** - add contract (0 ticks, no XP)
3. **Gather** - RNG success, Gathering XP
4. **Fight** - RNG success, Combat XP, failure relocates player
5. **Craft** - consume inputs, produce output, Crafting XP
6. **Store** - move to storage, Logistics XP
7. **Drop** - destroy item (no XP)

## Key Design Rules

- Every successful action advances exactly one skill by +1 XP (flat)
- Actions either consume 0 ticks or a fixed number of ticks
- Failures are typed, never partial, consume either 0 or full time
- Session ends when sessionRemainingTicks <= 0

## Toy World Data

Fixed locations: TOWN, MINE, FOREST
Items: IRON_ORE, WOOD_LOG, IRON_BAR
Enemy: Cave Rat
Guild: Miner's Guild
Session: 20 ticks

## Evaluation APIs

```
evaluateAction(state, action) -> { expectedTime, expectedXP, successProbability }
evaluatePlan(state, actions[]) -> { expectedTime, expectedXP, violations[] }
```

These are read-only and must not mutate state.

## Tech Stack

- Node.js / TypeScript
- Jest for testing
- ESM modules
- ESLint for linting
- Prettier for formatting

## Build & Test Commands

```bash
npm install          # Install dependencies
npm test             # Run all tests
npm test -- --watch  # Run tests in watch mode
npm run build        # Compile TypeScript
npm run lint         # Run ESLint
npm run format       # Format with Prettier
npm run check        # Run format:check, lint, and test (use before commits)
```

## Development Workflow

- **Test-driven development**: Write tests first, then implement to make them pass
- **Quality checks**: Run `npm run check` (format, lint, test) after every change
- **Commit checkpoints**: Commit (but don't push) each time functionality is complete and all checks pass
