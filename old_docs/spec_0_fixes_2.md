🔧 Final Fix Prompt: Bring grind.zip into Full Spec 0 Compliance

You are working on a rules-first, headless simulation engine.

You have a current codebase (grind.zip) and an in-repo canonical spec: spec_0.md.

Your task is to fix the remaining correctness issues so the engine fully and faithfully implements Spec 0 + agreed fixes, with no redesign and no scope expansion.

Make the smallest correct changes.

⸻

✅ Canonical Decisions (LOCKED)

These are no longer negotiable:
	•	Spec 0 is canonical
	•	Single agent
	•	Discrete time
	•	Flat +1 XP per successful action
	•	Slot-based inventory
	•	Inventory capacity = 10 slots
	•	Travel is NOT a skill
	•	Contracts are cumulative, multi-action
	•	Drop destroys items and consumes small fixed time
	•	Evaluation APIs must not drift from engine logic

⸻

🔁 REQUIRED FIXES (DO ALL)

1. Fix Contract Completion (CRITICAL)

Contracts must be meaningful and non-exploitable.

Required behaviour
After every successful action:
	•	Check all active contracts
	•	If a contract’s objective is satisfied:
	•	Consume the required items from inventory/storage
	•	Grant contract rewards (items + reputation)
	•	Remove the contract from activeContracts
	•	Emit an explicit contract completion log

Additional rules
	•	AcceptContract must:
	•	fail if the contract is already active
	•	Do not add a CompleteContract action
	•	Do not allow “infinite rep” loops

This must kill the current exploit where contracts can be repeatedly completed without consuming inputs.

⸻

2. Fix evaluatePlan to Simulate State Progression

evaluatePlan is currently invalid for multi-step plans.

Required behaviour
	•	Clone the initial state into a simState
	•	For each action in the plan:
	•	Use shared precondition checks
	•	Accumulate expected time / XP
	•	Mutate simState as if the action succeeded
	•	location changes
	•	inventory changes
	•	storage changes
	•	time consumption
	•	skill increments

Simplifications (v1)
	•	Assume success for RNG actions when evaluating plans
	•	Ignore variance for now
	•	Correctness > sophistication

The goal is that plan evaluation respects action ordering and dependencies.

⸻

3. Align Toy World Defaults

Update src/world.ts to reflect agreed v1 defaults:
	•	inventoryCapacity = 10
	•	Starting skill levels = 1 for all skills
	•	requiredSkillLevel = 1 for:
	•	basic gather nodes
	•	cave rat
	•	crafting recipe
	•	store
	•	Craft recipe:
	•	deterministic success
	•	correct time cost (choose one and keep it consistent)

Internal consistency matters more than realism.

⸻

4. Ensure Skill Split Is End-to-End Correct

Verify that:
	•	Gather awards:
	•	Mining or
	•	Woodcutting (based on node)
	•	Fight → Combat
	•	Craft → Smithing
	•	Store → Logistics
	•	Move, AcceptContract, Drop grant no XP

Exactly one skill, exactly +1 XP, on success only.

⸻

5. Failure Semantics (Sanity Pass)

Ensure:
	•	Gather RNG failures → GATHER_FAILURE
	•	Fight RNG failures → COMBAT_FAILURE
	•	Failures:
	•	either consume full action time
	•	or consume zero time
	•	No partial success anywhere

⸻

6. De-Duplicate Engine vs Evaluation Logic

Remove remaining drift risks:
	•	Shared helpers must be used for:
	•	precondition checks
	•	inventory slot checks
	•	time costs
	•	skill gating
	•	Evaluation must call the same rule logic as execution
	•	Evaluation must never mutate real state

Do not over-abstract; minimal refactors only.

⸻

🚫 Explicit Non-Goals (DO NOT TOUCH)

Do not:
	•	Add UI
	•	Add persistence
	•	Add multiple agents
	•	Add optimisation logic
	•	Add partial success
	•	Add scaling XP
	•	Add combat rounds
	•	Add new actions
	•	Add economy or trading

If something feels missing, leave it missing.

⸻

✅ Acceptance Criteria

You are done when:
	•	A single agent can:
	•	start a session
	•	accept a contract
	•	perform multiple actions
	•	complete a contract cumulatively
	•	gain skills
	•	gain reputation
	•	hit inventory pressure
	•	run out of time
	•	Logs clearly show:
	•	skill XP per action
	•	inventory changes
	•	contract progress + completion
	•	reputation changes
	•	RNG outcomes
	•	Reading logs makes it obvious how a dominant strategy could emerge

At that point, v1 is correct.

⸻

🧠 Design Reminder

This engine is a design microscope, not a game.

Correctness, transparency, and debuggability matter more than elegance.
