🔧 Prompt: Add Objectives + Risk-to-Objective Analysis (No Rule Changes)

You are working on the existing Spec-0 GRIND harness.
Do not change any game rules.
This task is analysis and reporting only.

⸻

1. Rename Existing “Risk” → Volatility

Current state

The summary shows a line like:

⚠️ RISK: Low (±1.2 XP)

This is actually outcome volatility, not risk.

Required change
	•	Rename this metric everywhere to:

📉 VOLATILITY: Low (±1.2 XP)

	•	Keep the existing calculation unchanged:
	•	σ of total XP
	•	qualitative bucket (Low / Medium / High)
	•	This metric is objective-agnostic.

⸻

2. Introduce Explicit Objectives

Add a first-class concept of an objective for each run/plan.

Representation

Each run must declare exactly one objective, e.g.:

Objective =
  | { type: "maximize_xp" }
  | { type: "complete_contract"; contractId: string }
  | { type: "reach_skill"; skill: SkillId; target: number }
  | { type: "diversify_skills"; skills: SkillId[] }

This is analysis metadata only:
	•	It does not affect execution
	•	It does not gate actions
	•	It is used solely for reporting

⸻

3. Define an Initial Set of 10 Canonical Objectives

Hardcode the following objectives for now (no UI needed yet):
	1.	Maximize XP
{ type: "maximize_xp" }
	2.	Complete Miner’s Contract
{ type: "complete_contract", contractId: "miners-guild-1" }
	3.	Reach Mining 5
{ type: "reach_skill", skill: "Mining", target: 5 }
	4.	Reach Combat 3
{ type: "reach_skill", skill: "Combat", target: 3 }
	5.	Reach Smithing 3
{ type: "reach_skill", skill: "Smithing", target: 3 }
	6.	Diversify (touch all skills)
{ type: "diversify_skills", skills: ["Mining","Woodcutting","Combat","Smithing","Logistics"] }
	7.	Safe Progress
(alias of maximize_xp, but used to compare risk profiles)
	8.	Combat-heavy Progress
(same execution as combat plans, objective is reach Combat 3)
	9.	Contract via Combat
{ type: "complete_contract", contractId: "miners-guild-1" }
(used to distinguish strategy vs objective)
	10.	Balanced Progress
{ type: "diversify_skills", skills: ["Mining","Smithing","Combat"] }

These are analysis lenses, not promises about human intent.

⸻

4. Add Risk to Objective Metric (NEW)

This is distinct from Volatility.

Definition

Risk to Objective = probability that the objective is not achieved by session end.

This metric is objective-dependent.

⸻

How to compute (v1, simple + correct)

For each objective:

A. Determine success condition
Examples:
	•	maximize_xp: success is trivial → risk = 0%
	•	complete_contract: success if contract completed
	•	reach_skill: success if skill ≥ target
	•	diversify_skills: success if all listed skills advanced ≥1

B. Estimate probability of failure
Use the same Poisson-binomial / analytic machinery already used for:
	•	expected XP
	•	luck percentiles

You may:
	•	assume independence of rolls
	•	assume deterministic steps (crafting, travel) always succeed
	•	ignore second-order replanning effects for now

The goal is comparative signal, not perfect modelling.

⸻

C. Bucket Risk to Objective

Use these bins:
	•	Low: failure probability < 20%
	•	Medium: 20%–50%
	•	High: > 50%

⸻

5. Display Changes (Summary Output)

Replace the single “Risk” line with two lines:

📉 VOLATILITY: Low (±1.2 XP)
🎯 RISK TO OBJECTIVE: Medium (≈42% fail)

Rules:
	•	Always show both
	•	Volatility = objective-agnostic
	•	Risk to Objective = objective-specific
	•	Show the approximate failure percentage in parentheses

⸻

6. No Rule Changes (Important)

Do not change:
	•	action costs
	•	probabilities
	•	XP awards
	•	contracts
	•	combat behaviour
	•	session length

This task is pure instrumentation and reporting.

⸻

7. Acceptance Criteria

This task is complete when:
	•	Every run/plan declares an objective
	•	The summary shows:
	•	Expected XP
	•	Luck
	•	Volatility
	•	Risk to Objective
	•	Combat plans correctly show:
	•	Moderate volatility
	•	High risk to contract objective
	•	Mining plans correctly show:
	•	Moderate volatility
	•	Low risk to XP objective
	•	Diversify plans show:
	•	Medium–High risk to objective
	•	Even when volatility is modest

At that point, the harness can distinguish:

“This is risky because outcomes swing”
vs
“This is risky because I probably won’t achieve what I want.”

⸻

Design Reminder

Objectives are measurement tools, not psychology.
This work exists to understand system incentives, not to model human minds.
