## Agent System — LLM-Driven Gameplay

### Purpose

The agent system allows an LLM to play the game autonomously, demonstrating that the game's mechanics are learnable and strategic decisions are meaningful.

The agent serves two purposes:
1. **Testing**: Verify game mechanics work correctly across many scenarios
2. **Demonstration**: Show that optimal play requires understanding, not luck

---

### Architecture

The agent loop follows a simple cycle:

1. **Observe**: Format current world state as text
2. **Decide**: LLM chooses an action with reasoning
3. **Execute**: Engine processes the action
4. **Learn**: Agent records insights for future decisions

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ World State │ ──► │   LLM       │ ──► │   Engine    │
│ (formatted) │     │ (decision)  │     │  (execute)  │
└─────────────┘     └─────────────┘     └─────────────┘
       ▲                                       │
       └───────────────────────────────────────┘
```

---

### Components

**loop.ts** — Main agent loop
- Creates world, manages session
- Tracks stats (ticks, actions, XP, items)
- Handles context summarization

**prompts.ts** — System prompts
- Game rules explanation
- Available actions
- Objective framing

**parser.ts** — Response parsing
- Extracts action from LLM output
- Handles reasoning and learnings
- Supports continue conditions

**formatters.ts** — State presentation
- Formats WorldState as readable text
- Formats ActionLog results
- Uses same visibility rules as player

**summarize.ts** — Context management
- Compresses action history
- Summarizes learnings by category
- Keeps context within token limits

**llm.ts** — LLM client
- API calls to OpenAI-compatible endpoints
- Context window management
- Message history limiting

**output.ts** — Trace writing
- Records full play sessions
- Includes reasoning and learnings
- Enables post-hoc analysis

---

### Running the Agent

```bash
npm run agent <seed> [options]
```

Options:
- `-t, --ticks <n>` — Session length (default: 25)
- `-o, --objective <s>` — Goal for the agent
- `-m, --model <s>` — LLM model to use
- `-v, --verbose` — Show detailed output

Output written to `traces/<rules-version>/<seed>/`

---

### Agent Response Format

The agent responds with structured output:

```
REASONING: <why this action>
ACTION: <action type and parameters>
LEARNING: <insight gained>
NOTES: <persistent scratchpad>
CONTINUE_IF: <condition for repeating action>
```

---

### Context Management

To stay within token limits while preserving useful context:

1. **Recent exchanges**: Last 5 state/action pairs kept verbatim
2. **Action summary**: Older actions compressed to key outcomes
3. **Learning summary**: Categorized insights (world, mechanics, items, strategies)
4. **Agent notes**: Persistent scratchpad maintained by agent

---

### Knowledge Categories

Learnings are auto-categorized:
- **world**: Locations, travel, geography
- **mechanics**: Ticks, XP, skills, probabilities
- **items**: Resources, materials, gathering
- **strategies**: Efficiency insights, decision heuristics

---

### Design Principles

1. **Same information as player**: Agent sees formatted state, not raw objects
2. **Explicit reasoning**: Every action has recorded justification
3. **Learnable game**: Agent improves with experience
4. **Reproducible**: Same seed + model = same decisions (in theory)
