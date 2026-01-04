# Agent Loop – v1

This document defines the **minimal agent loop** used for both:
- LLM-driven simulation
- manual designer testing (via the same APIs)

The loop is intentionally simple. Its job is **not to play well**, but to:
- exercise the rules engine
- surface dominant strategies
- generate inspectable reasoning and conclusions

---

## 0. Core Principle

> The agent plans at the **session level**, executes at the **action level**, and learns only **between sessions**.

There is no mid-action replanning in v1.

---

## 1. Inputs to a Session

At session start, the agent receives:

```ts
SessionInput {
  worldState: WorldState
  sessionTicks: number
  agentMemory: AgentMemoryState
  agentPersonality: PersonalityProfile
}
```

### Agent Personality (v1)

A stable set of weights that bias objective selection, e.g.:

```ts
PersonalityProfile {
  valueXP: number
  valueReputation: number
  valueItems: number
  valueEV: number
  valueLowVariance: number
  valueExploration: number
}
```

All agents may initially share the same profile.

---

## 2. Session Goal Selection

The agent selects **one primary session goal**.

Examples:
- Increase Mining skill
- Complete a Mining Contract
- Acquire Iron Bars
- Maximise expected value this session
- Explore unused actions

### Process

1. Enumerate feasible goals given current world state
2. Score goals using personality weights and memory
3. Select the highest-scoring goal

The chosen goal is logged explicitly.

---

## 3. Plan Generation

The agent proposes **one concrete plan** to pursue the chosen goal.

```ts
Plan {
  goal: GoalSpec
  actions: Action[]
}
```

### Constraints

- Plan length is bounded (e.g. max 10 actions)
- Plan must respect current world state
- Plans may still be invalid (checked later)

### Plan Sources (v1)

Plans are generated via:
- simple heuristics
- memory of past successful plans
- light exploration (trying unused actions)

No global optimisation.

---

## 4. Plan Evaluation (Optional but Preferred)

Before execution, the agent may query the engine:

```ts
evaluatePlan(worldState, actions)
```

Returned signals:
- expected time usage
- expected rewards
- variance profile
- detected constraint violations

The agent may:
- accept the plan
- slightly modify it
- discard it and generate a new one

The evaluation result is logged.

---

## 5. Plan Execution

The agent executes actions **sequentially**, until:
- the plan ends
- the session runs out of ticks
- a critical failure occurs

For each action:

1. Submit Action to engine
2. Receive ActionResult
3. Log:
   - action
   - outcome
   - time consumed
   - RNG outcomes
4. Update local view of world state

No replanning occurs mid-plan in v1.

---

## 6. Session Termination

A session ends when:
- no session ticks remain, or
- no further valid actions are possible

The final world state is recorded.

---

## 7. Post-Session Analysis

After the session, the agent performs **reflection**.

### Inputs
- Initial plan
- Actual outcomes
- Expected vs realised rewards
- RNG luck/unluckiness

### Outputs

#### 7.1 Memory Updates

```ts
AgentMemoryState {
  pastPlans: PlanSummary[]
  actionOutcomes: ActionStats[]
  perceivedEfficiencies: Record<ActionType, number>
}
```

#### 7.2 Explicit Conclusions

The agent writes **natural-language conclusions**, e.g.:
- “Mining then crafting felt inefficient due to travel cost.”
- “Combat contracts appear high variance but strong.”
- “Inventory filled too quickly when gathering wood.”

These conclusions:
- persist across sessions
- influence future goal selection and planning
- are fully inspectable by the designer

---

## 8. Outputs of a Session

```ts
SessionResult {
  actionsTaken: ActionLog[]
  goalsAchieved: GoalOutcome[]
  skillGains: SkillDelta[]
  reputationChanges: RepDelta[]
  inventoryDelta: InventoryDelta
  rngSummary: RNGSummary
  conclusions: string[]
}
```

This object is the **primary artefact** for simulation analysis.

---

## 9. What This Loop Is Designed to Reveal

With repeated sessions, this loop will surface:
- convergence on identical plans
- dominant goals crowding out others
- inventory-driven bottlenecks
- RNG exploitation or avoidance
- content that is never selected

If a single “right way to play a session” exists, this loop will find it.

---

