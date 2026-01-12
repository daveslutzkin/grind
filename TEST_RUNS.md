This file details how you do test runs of the sim.

## Runner

`src/repl.ts` - Interactive REPL that also supports piped input for batch-style runs.

```bash
# Interactive mode
npx tsx src/repl.ts [--llm-cache <file>] [seed]

# Batch mode (piped input)
echo -e "cmd1\ncmd2\nend" | npx tsx src/repl.ts [--llm-cache <file>] [seed]
```

Options:
- `--llm-cache <file>` - Cache LLM responses for deterministic replays
- `seed` - Random seed (default: session-<timestamp>)

## Run Modes

### Human via REPL
Run the repl with a random seed, type in commands as they go, and get to the end of the session.

### Human via Claude Code
Interactive step-by-step runs. See MANUAL_RUN.md for the process.

### Agent in Preplan Mode
Come up with a plan, form a series of actions from the plan, then pipe them into the REPL:

```bash
echo -e "action1\naction2\naction3\nend" | npx tsx src/repl.ts --llm-cache cache.json 42
```

### Agent in Adaptive Mode
1. Start with a queue of a single action
2. Pipe it into the REPL with a known seed and LLM cache
3. See what happens
4. Adapt to that
5. Add one or more actions to the queue
6. Pipe the new queue into the REPL with the same seed and cache
7. Continue until the session is finished

Example:
```bash
# First run - populates cache
echo -e "move Explorers Guild\nend" | npx tsx src/repl.ts --llm-cache cache.json 42

# Second run - extends action list, replays from cache
echo -e "move Explorers Guild\nenrol exploration\nend" | npx tsx src/repl.ts --llm-cache cache.json 42
```

### Internal Agent Mode
Run the built-in LLM agent implementation:

```bash
npx tsx src/agent/index.ts [--seed <seed>] [--ticks <n>] [--objective <goal>]
```

The agent loops autonomously, choosing actions based on world state until the session ends.
