🔧 Final Surgical Fix Prompt (Spec 0 Harness Completion)

You are working on the current grind.zip codebase.

Most Spec 0 fixes are already incorporated.
Your task is to fix the last remaining correctness gaps so the engine becomes a trustworthy simulation harness.

Make the smallest possible changes.
Do not redesign anything.

⸻

✅ Remaining Required Fixes (ONLY THESE)

1. Fix Contract Completion Semantics (CRITICAL)

Contracts must not be exploitable and must actually function as progression.

Required behaviour
When a contract completes:
	•	Consume the contract requirements
	•	Remove required items from inventory and/or storage
	•	Grant contract rewards
	•	Add reward items to inventory (respect slot capacity)
	•	Award reputation
	•	Remove the contract from activeContracts
	•	Emit a clear contract completion log entry

Notes
	•	Contract objectives are multi-action and cumulative
	•	Completion should be checked after every successful action
	•	Do not add a CompleteContract action
	•	Do not allow “free rep” loops

If requirements are not consumed, the implementation is incorrect.

⸻

2. Fix evaluatePlan to Simulate State Progression

evaluatePlan must respect action ordering.

Required behaviour
During plan evaluation:
	•	Clone the initial world state into simState
	•	For each action in order:
	•	Validate preconditions
	•	Accumulate expected time / XP
	•	Mutate simState as if the action succeeded

Specifically:
	•	Move → update location
	•	Gather → add item stack
	•	Fight → add loot (assume success for v1)
	•	Craft → consume inputs, add outputs
	•	Store → move inventory → storage
	•	Drop → destroy item
	•	Increment skill (+1) on success

Simplifications (locked)
	•	Assume RNG success
	•	Ignore variance
	•	Correctness > sophistication

If step N does not affect step N+1 during evaluation, the implementation is wrong.

⸻

3. Turn Skill Gating “On” (Baseline)

Skill gating currently exists in code but is effectively disabled.

Required changes
	•	Set starting skill levels = 1 for all skills
	•	Set requiredSkillLevel = 1 for:
	•	basic gather nodes
	•	cave rat enemy
	•	crafting recipe
	•	store action

This ensures:
	•	gating is real
	•	the model matches Spec 0 intent
	•	future balance work has something to push against

⸻

🚫 Explicit Non-Goals

Do not:
	•	change inventory capacity (leave it at 10)
	•	add new actions
	•	add partial success
	•	add optimisation logic
	•	add UI or persistence
	•	refactor beyond what’s necessary

If something “feels missing”, ignore it.

⸻

✅ Acceptance Criteria

This patch is complete when:
	•	A contract:
	•	cannot be completed twice using the same items
	•	visibly consumes inputs
	•	grants rewards + reputation
	•	evaluatePlan correctly rejects or accepts multi-step plans based on earlier steps
	•	Logs clearly show:
	•	contract completion
	•	item consumption
	•	reputation gain
	•	skill advancement
	•	You can read a single session log and confidently reason about:
	•	efficiency
	•	waste
	•	potential dominant strategies

At that point, Spec 0 is genuinely done.
