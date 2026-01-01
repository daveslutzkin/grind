v1 Implementation Spec — Rules-First Simulation Engine

This spec is intentionally minimal.
Anything not listed here is out of scope.

⸻

1. Core Architectural Constraint
	•	Headless engine
	•	Single-agent execution
	•	Controlled mutable state
	•	Discrete time
	•	Deterministic RNG (seeded)
	•	Full structured logging

No UI.
No networking.
No persistence beyond in-memory objects.

⸻

2. Engine Responsibilities (ONLY these)

The engine must:
	1.	Hold a mutable WorldState
	2.	Accept Action objects
	3.	Validate action preconditions
	4.	Apply state mutations
	5.	Advance time
	6.	Produce structured logs
	7.	Expose evaluation APIs (not decision-making)

The engine must never:
	•	choose actions
	•	optimise plans
	•	suggest strategies
	•	contain agent logic

⸻

3. Required Data Structures (Minimum)

3.1 WorldState

WorldState {
  time: {
    currentTick: number
    sessionRemainingTicks: number
  }

  player: {
    location: LocationID
    inventory: ItemStack[]
    storage: ItemStack[]
    skills: Record<SkillID, number>
    guildReputation: number
    activeContracts: ContractID[]
  }

  world: {
    locations: LocationID[]
    travelCosts: Record<(LocationID, LocationID), number>
    resourceNodes: ResourceNode[]
    enemies: Enemy[]
    recipes: Recipe[]
    contracts: Contract[]
  }

  rng: {
    seed: string
    counter: number
  }
}

Single player only.
No other agents exist in v1.

⸻

4. RNG (MANDATORY)
	•	All randomness must go through one RNG function
	•	RNG must:
	•	be seeded
	•	increment a counter on every draw
	•	log every draw with a label

Example:

roll(probability: number, label: string) -> boolean

Log:
	•	label
	•	probability
	•	result
	•	rngCounter value

⸻

5. Time Model
	•	Every action:
	•	either consumes 0 ticks
	•	or consumes a fixed number of ticks
	•	No concurrent actions
	•	No background ticking
	•	Session ends when sessionRemainingTicks <= 0

⸻

6. Skill Model (LOCKED)
	•	Every successful action:
	•	advances exactly one primary skill
	•	by +1 XP (flat)
	•	Skills are integers
	•	Skill levels gate actions
	•	No XP tables yet
	•	No level-up side effects yet

⸻

7. Action Set (EXACTLY these 7)

The coding agent must implement only these.

7.1 Move
	•	Preconditions: reachable, sufficient Travel skill
	•	Effects: location change, time cost, +1 Travel XP

7.2 AcceptContract
	•	Preconditions: at guild location
	•	Effects: add contract
	•	Time cost: 0
	•	No skill XP

7.3 Gather
	•	Preconditions: at node, sufficient Gathering skill, inventory space
	•	RNG success
	•	Effects: item added, time cost, +1 Gathering XP

7.4 Fight
	•	Preconditions: at enemy, sufficient Combat skill
	•	RNG success
	•	Effects: loot, time cost, +1 Combat XP
	•	Failure relocates player (per toy world rules)

7.5 Craft
	•	Preconditions: recipe known, inputs present, at location, sufficient Crafting skill
	•	Effects: consume inputs, produce output, time cost, +1 Crafting XP

7.6 Store
	•	Preconditions: at storage, sufficient Logistics skill
	•	Effects: move item to storage, time cost, +1 Logistics XP

7.7 Drop
	•	Preconditions: item exists
	•	Effects: destroy item, time cost
	•	No skill XP

⸻

8. Failure Semantics (LOCKED)
	•	Actions have typed failures
	•	Failure types:
	•	either consume no time
	•	or consume full action time
	•	Failures never partially succeed
	•	Failures are logged and returned to caller

⸻

9. Evaluation APIs (Read-only)

These must exist, even if naïve.

evaluateAction(state, action) -> {
  expectedTime
  expectedXP
  successProbability
}

evaluatePlan(state, actions[]) -> {
  expectedTime
  expectedXP
  violations[]
}

They must not mutate state.

⸻

10. Logging (NON-NEGOTIABLE)

Every action execution must emit:

ActionLog {
  tickBefore
  actionType
  parameters
  success
  failureType?
  timeConsumed
  skillGained?
  rngRolls[]
  stateDeltaSummary
}

This is what the agent loop reads to learn.

⸻

11. Toy World Data (AS SPECIFIED)

Use exactly:
	•	TOWN / MINE / FOREST
	•	travel costs as defined
	•	IRON_ORE / WOOD_LOG / IRON_BAR
	•	Cave Rat enemy
	•	Miner’s Guild
	•	20-tick session

No expansion.

⸻

12. Explicit Non-Goals (to prevent overengineering)

🚫 No UI
🚫 No persistence
🚫 No multiple agents
🚫 No economy
🚫 No combat rounds
🚫 No partial success
🚫 No scaling XP
🚫 No balancing
🚫 No optimisation logic

If something feels “missing,” that’s intentional.

⸻

13. Success Criteria for v1

This is done when:
	•	One agent can:
	•	start a session
	•	accept a contract
	•	take actions
	•	run out of time
	•	Logs clearly show:
	•	what happened
	•	why
	•	what skill advanced
	•	where RNG mattered
	•	You can read the output and say:
“I can already see how a dominant strategy might form.”

If you can say that, v1 succeeded.
