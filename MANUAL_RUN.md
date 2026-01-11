# Manual Run Process

Interactive step-by-step simulation runs via Claude Code.

## How It Works

1. Tell Claude to "start a manual run"
2. Claude picks a seed and pipes an empty action list into the REPL
3. You tell Claude the next action
4. Claude pipes the updated action list into the REPL and shows the output
5. Repeat until done

## Output Format

Each step shows:
- The result of the last action (if any)
- The current world state as the agent sees it

## Commands

```
enrol <skill>                Enrol in guild (exploration, mining, etc)
survey                       Discover new areas (connections)
move <area>                  Travel to a known area
explore                      Discover nodes in current area
gather <node> focus <mat>    Focus on one material
gather <node> careful        Carefully extract all
gather <node> appraise       Inspect node contents
fight <enemy>                Fight an enemy
craft <recipe>               Craft at TOWN
store <item> [qty]           Store items at TOWN
drop <item> [qty]            Drop items
accept <contract>            Accept a contract
```

## Under the Hood

Uses `src/repl.ts` with piped input:

```bash
echo -e "action1\naction2\nend" | npx tsx src/repl.ts --llm-cache cache.json <seed>
```

Each run replays all actions from scratch with the same seed and LLM cache, ensuring deterministic results.
