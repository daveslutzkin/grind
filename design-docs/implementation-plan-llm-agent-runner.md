# LLM Agent Runner - Implementation Plan

## Overview

An LLM-powered agent that plays the game simulation, discovering rules through play and documenting its reasoning and learnings. The agent uses OpenAI's API (gpt-4o-mini) and produces detailed traces for assessing game balance and testing rule changes.

---

## Design Decisions

### Core Approach
- **OpenAI API** with gpt-4o-mini (configurable)
- **Programmatic interface** - imports engine directly (batch runner deprecated)
- **Hybrid decisions** - propose action + conditional follow-ups (e.g., "gather, repeat if successful")
- **Fresh knowledge each run** - no persistence across runs
- **Discovery-based learning** - agent discovers mechanics through play

### Configuration (CLI)
- `seed` (string) - RNG seed for reproducibility
- `ticks` (number) - session length (overrides default 25)
- `objective` (string) - goal, default: "explore the game and have fun"

### Output Structure
```
traces/<rules-version>/<seed>/
  trace.txt      # Detailed play log with reasoning
  knowledge.txt  # What agent learned about the game
```

### Agent Starting Context
The agent knows:
- Action type names: Move, Gather, Fight, Craft, Store, Drop, AcceptContract, Enrol
- Current game state (location, ticks, inventory, skills)
- The objective

The agent does NOT know:
- Action parameters (e.g., valid destinations, node IDs)
- Costs (tick costs, success rates)
- Effects (XP gains, mechanics)
- World layout

### Rules Version
A `RULES_VERSION` constant in the codebase, bumped manually when rules change.

### API Key
Read from a config file in the repo (for cloud environment compatibility).

---

## Implementation Tasks

### Phase 1: Infrastructure Setup

#### 1.1 Configuration & Constants
- [ ] Add `RULES_VERSION` constant (e.g., in `src/config.ts` or `src/types.ts`)
- [ ] Create config file for API key (e.g., `config.json` or `.agent-config.json`)
- [ ] Add config file to `.gitignore` with a `.example` template (or commit short-lived key per discussion)

#### 1.2 Project Setup
- [ ] Add `openai` npm package as dependency
- [ ] Add `npm run agent` script to `package.json`
- [ ] Create `src/agent/` directory for agent code

#### 1.3 Archive Old Traces
- [ ] Move existing `traces/*` content to `traces/archived/` or similar
- [ ] Create new folder structure `traces/<rules-version>/`

---

### Phase 2: Core Agent Loop

#### 2.1 Game State Formatter
- [ ] Create function to format `WorldState` as clean text for LLM consumption
- [ ] Include: location, ticks remaining, inventory, skills, active contracts
- [ ] Keep it readable but concise (no box-drawing characters)

#### 2.2 Action Result Formatter
- [ ] Create function to format `ActionLog` as clean text
- [ ] Include: success/failure, time consumed, items gained/lost, XP gained, RNG outcomes
- [ ] Format failures clearly so agent can learn from them

#### 2.3 Action Parser
- [ ] Create function to parse LLM text response into `Action` object(s)
- [ ] Handle hybrid format: single action or action + conditional follow-ups
- [ ] Return structured result with action(s) and any continuation conditions

#### 2.4 Main Agent Loop
- [ ] Initialize world with seed and tick count
- [ ] Loop until ticks exhausted:
  - Format current state for LLM
  - Call LLM for next action(s)
  - Parse response into action(s)
  - Execute action(s) via `executeAction()`
  - Format results
  - Append to trace
  - Update conversation history
- [ ] Handle action failures gracefully (continue playing, learn from failure)

---

### Phase 3: LLM Integration

#### 3.1 OpenAI Client Setup
- [ ] Create OpenAI client wrapper that reads API key from config
- [ ] Add error handling for API failures (retry logic, rate limits)
- [ ] Make model configurable (default gpt-4o-mini)

#### 3.2 System Prompt Design
- [ ] Write system prompt with:
  - Game framing ("you're playing a text-based game")
  - Available action types (names only, no details)
  - Objective (from config)
  - Instructions for reasoning format
  - Instructions for knowledge documentation
- [ ] Keep it minimal - agent should discover, not be told

#### 3.3 Conversation Management
- [ ] Track conversation history for context
- [ ] Include: system prompt, state updates, agent responses, action results
- [ ] Consider context window limits (summarize if needed)

#### 3.4 Response Format
- [ ] Define expected response structure:
  - REASONING: Why the agent is making this decision
  - ACTION: The action to take (with parameters)
  - CONTINUE_IF: Optional condition for repeating (hybrid approach)
  - LEARNING: What the agent learned from previous result (if any)
- [ ] Parse responses robustly (handle variations in format)

---

### Phase 4: Output Generation

#### 4.1 Trace File Writer
- [ ] Create output directory: `traces/<rules-version>/<seed>/`
- [ ] Write `trace.txt` with:
  - Header (seed, ticks, objective, timestamp)
  - For each decision point:
    - Current state summary
    - Agent reasoning (detailed)
    - Action taken
    - Outcome
    - What agent learned
  - Footer (session summary stats)

#### 4.2 Knowledge File Writer
- [ ] Write `knowledge.txt` with agent's accumulated understanding
- [ ] Structure by category:
  - World layout (locations, travel)
  - Actions (what each does, costs, effects)
  - Mechanics (XP, skills, success rates)
  - Items (what exists, how to get them)
  - Strategies (what works, what doesn't)
- [ ] Update throughout the run (or compile at end from learnings)

#### 4.3 Session Summary
- [ ] At end of run, include summary stats:
  - Total ticks used
  - Actions taken (by type, success/fail)
  - XP gained (by skill)
  - Items collected
  - Key learnings count

---

### Phase 5: CLI Interface

#### 5.1 Argument Parsing
- [ ] Parse CLI arguments:
  - `seed` (required) - string for RNG
  - `--ticks` or `-t` (optional) - session length, default from world config
  - `--objective` or `-o` (optional) - goal string
  - `--model` or `-m` (optional) - LLM model override
  - `--verbose` or `-v` (optional) - extra console output during run

#### 5.2 Entry Point
- [ ] Create `src/agent/index.ts` or `src/agent.ts` as main entry
- [ ] Wire up to `npm run agent` in package.json
- [ ] Add build step if needed

#### 5.3 Console Output
- [ ] Show progress during run (current tick, last action, etc.)
- [ ] Show completion message with output file paths
- [ ] Verbose mode: show full LLM responses

---

### Phase 6: Testing & Refinement

#### 6.1 Basic Functionality Tests
- [ ] Test with simple seed, verify trace output
- [ ] Test action parsing with various LLM response formats
- [ ] Test state formatting produces readable output

#### 6.2 Edge Cases
- [ ] Agent proposes invalid action - should see failure, learn
- [ ] Agent runs out of ticks mid-action
- [ ] API failure mid-run - graceful handling

#### 6.3 Prompt Tuning
- [ ] Run several sessions, review reasoning quality
- [ ] Adjust system prompt based on agent behavior
- [ ] Ensure agent actually discovers rather than assumes

#### 6.4 Documentation
- [ ] Update README or create AGENT.md with usage instructions
- [ ] Document config file format
- [ ] Add example traces to reference

---

## File Structure (Proposed)

```
src/
  agent/
    index.ts          # Entry point, CLI parsing
    loop.ts           # Main agent loop
    llm.ts            # OpenAI client wrapper
    prompts.ts        # System prompt and response parsing
    formatters.ts     # State and action result formatting
    output.ts         # Trace and knowledge file writers
  config.ts           # RULES_VERSION and other constants

config.json           # API key (or .agent-config.json)
config.example.json   # Template for config

traces/
  archived/           # Old traces moved here
  rules_0/            # Current rules version
    <seed>/
      trace.txt
      knowledge.txt
```

---

## Open Questions / Future Considerations

1. **Context window management**: If runs get long, may need to summarize older history
2. **Multiple knowledge files**: Could split into categories (world.txt, mechanics.txt, strategies.txt)
3. **Streaming output**: Could write trace incrementally rather than at end
4. **Comparison tooling**: Scripts to diff traces across rule versions
5. **Batch runs**: Run multiple seeds automatically for statistical analysis
