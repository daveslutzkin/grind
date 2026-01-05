# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a rules-first simulation engine - a headless, single-agent game engine with discrete time, deterministic RNG, and structured logging. The engine executes actions but never chooses them.

All design decisions about the game should be relative to the canonical documents in `design-docs/`.

If the user asks for features that conflict with canonical docs, call it out and make them decide to continue.

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
npm run check        # Run format:check, lint, build, and test (use before commits)
```

## Development Workflow

- **Test-driven development**: Write tests first, then implement to make them pass
- **Quality checks**: Run `npm run check` (format, lint, test) after every change
- **Commit checkpoints**: Commit (but don't push) each time functionality is complete and all checks pass
