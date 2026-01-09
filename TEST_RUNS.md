This file details how you do test runs of the sim.

## Batch Runners

- `src/batch.ts` - Main batch runner with session summary (see MANUAL_RUN.md)
- `src/gatherBatch.ts` - Specialized runner for gathering with trace saving

## Run Modes

### Human via REPL
Run the repl with a random seed, type in commands as they go, and get to the end of the session.

### Human via Claude Code
Interactive step-by-step runs. See MANUAL_RUN.md for the process.

### Agent in Preplan Mode
Come up with a plan, form a series of actions from the plan, then run the batch runner piping that series of actions into it.

### Agent in Adaptive Mode
1. Start with a queue of a single action
2. Pipe it into the batch runner with a known seed
3. See what happens
4. Adapt to that
5. Add one or more actions to the queue
6. Pipe the new queue into the batch runner with the known seed
7. Continue until the session is finished

### Internal Agent Mode
Run the built-in LLM agent implementation:

```bash
npx tsx src/agent/index.ts [--seed <seed>] [--ticks <n>] [--objective <goal>]
```

The agent loops autonomously, choosing actions based on world state until the session ends.

## Traces

Save traces in the `traces/` directory using `--save <path>` with gatherBatch.
