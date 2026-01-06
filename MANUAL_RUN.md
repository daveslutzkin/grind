# Manual Run Process

Interactive step-by-step simulation runs via Claude Code.

## How It Works

1. Tell Claude to "start a manual run"
2. Claude picks a seed and runs the batch runner with an empty action list
3. You tell Claude the next action
4. Claude runs the batch runner with that action added and shows the output
5. Repeat until done

## Output Format

Each step shows:
- The result of the last action (if any)
- The current world state as the agent sees it

## Commands

```
move <location>              Move to a location
enrol mining|woodcutting     Enrol in a guild
gather <node> focus <mat>    Focus on one material
gather <node> careful        Carefully extract all
gather <node> appraise       Inspect node contents
```

## Locations

TOWN, OUTSKIRTS_MINE, COPSE, OLD_QUARRY, DEEP_FOREST, ABANDONED_SHAFT, ANCIENT_GROVE

## Under the Hood

Uses `src/manualBatch.ts`:

```bash
npx tsx src/manualBatch.ts <seed> [action1] [action2] ...
```

Each run replays all actions from scratch with the same seed, ensuring deterministic results.
