You are working on a rules-first, headless simulation engine.

There is an existing implementation of spec_0.md.
Your task is to modify the current codebase so that it exactly and faithfully implements spec_0.md, plus the explicit changes listed below.

This is not a redesign.
Do not add features.
Do not improve architecture unless required to meet the spec.
Make the smallest correct changes.

⸻

✅ Canonical Spec
	•	spec_0.md is the source of truth
	•	Where the current code differs from the spec, the spec wins
	•	The goal is a spec-faithful v1, not a “better” engine

⸻

🔁 Required Changes (MANDATORY)

1. Remove Travel as a Skill (IMPORTANT)

Travel is not a skill.

Required changes:
	•	Remove Travel from:
	•	skill lists
	•	skill gating
	•	skill XP
	•	Move:
	•	still consumes time
	•	still logs
	•	is gated only by map connectivity
	•	does not grant XP

Travel is purely logistical.

⸻

2. Fix Inventory Capacity (Slot-Based)

Inventory capacity is slot-based, not quantity-based.

Required changes:
	•	Inventory capacity = number of distinct ItemStacks
	•	Stack quantity does not affect capacity
	•	Replace any logic like:

sum(stack.quantity)

with:

inventory.length



Apply this consistently in:
	•	action execution
	•	evaluation (evaluateAction, evaluatePlan)

Use the slot capacity defined in spec_0.md (confirmed).

⸻

3. Split Skills Properly

Replace generic skills with distinct skills:
	•	Mining
	•	Woodcutting
	•	Combat
	•	Smithing
	•	Logistics

Rules (locked):
	•	Every successful action grants exactly +1 XP to one skill
	•	No multi-skill XP
	•	No scaling

Mappings:
	•	Gather → Mining or Woodcutting (depending on node)
	•	Fight → Combat
	•	Craft → Smithing
	•	Store → Logistics
	•	Move → no skill XP
	•	AcceptContract → no skill XP
	•	Drop → no skill XP

⸻

4. Make Contracts Actually Work (Cumulative Completion)

Contracts must complete and award reputation.

Locked behaviour:
	•	Contract objectives are multi-action, cumulative
	•	e.g. “gather 3 ore” may take several actions
	•	After every successful action:
	•	Check all active contracts
	•	If a contract’s objective is now satisfied:
	•	Mark it complete
	•	Award its reputation reward
	•	Remove it from active contracts
	•	Log completion explicitly

Do NOT:
	•	Add a CompleteContract action
	•	Add partial success semantics

Reputation must visibly change in logs.

⸻

5. Fix Failure Semantics (No Generic RNG_FAILURE)

Do not use a generic RNG_FAILURE.

Required failure types:
	•	GATHER_FAILURE
	•	COMBAT_FAILURE

RNG rolls must still be logged with probabilities and results.
This change is for semantic clarity and later analytics.

⸻

6. Align Crafting Exactly With Spec

Required changes:
	•	Craft success probability must match spec_0.md exactly
	•	If spec says 100%, implement 100%
	•	Crafting must be skill-gated
	•	Crafting must:
	•	consume inputs
	•	produce outputs
	•	consume correct time
	•	grant +1 Smithing XP
	•	No implicit defaults

⸻

7. De-Duplicate Evaluation Logic

evaluateAction and evaluatePlan must not drift from engine logic.

Required change (minimal):
	•	Extract shared helpers for:
	•	precondition checks
	•	inventory capacity checks
	•	time costs
	•	success probabilities
	•	Evaluation must call the same logic paths as execution
	•	Evaluation must not mutate state

Do not over-abstract. Remove duplication only.

⸻

8. Fix Toy World Mismatches

Ensure the implemented toy world exactly matches spec_0.md:
	•	Locations: TOWN, MINE, FOREST
	•	Travel costs
	•	Inventory slot capacity
	•	Starting skill levels
	•	Recipes
	•	Contracts
	•	Session length: 20 ticks

If code and spec disagree: change the code.

⸻

9. Drop Action Semantics (Locked)
	•	Drop:
	•	permanently destroys the item
	•	consumes a small fixed time cost
	•	grants no XP
	•	Purpose: emergency relief + visible inefficiency

⸻

🚫 Explicit Non-Goals

Do not:
	•	Add UI
	•	Add persistence
	•	Add multiple agents
	•	Add economy or trading
	•	Add combat rounds
	•	Add partial success
	•	Add scaling XP
	•	Add optimisation logic
	•	Add balancing

If something feels “missing,” that is intentional.

⸻

✅ Acceptance Criteria

This task is complete when:
	•	A single agent can:
	•	start a session
	•	accept a contract
	•	perform multiple actions
	•	complete a contract cumulatively
	•	gain skills
	•	gain reputation
	•	run out of time
	•	Logs clearly show:
	•	skill XP per action
	•	contract progress and completion
	•	reputation changes
	•	inventory pressure
	•	RNG outcomes
	•	Reading the logs makes it obvious how a dominant strategy could emerge
