Implement Skill Levels (Spec-2) on top of the existing XP system.
Do not change any game rules, probabilities, action timings, or objectives yet.
This is a derived progression layer only.

Requirements
	1.	Add levels to skills
	•	Each skill now has:

{
  level: number,   // starts at 1
  xp: number       // existing XP
}


	•	Existing XP logic remains unchanged.

	2.	XP → Level curve
	•	XP required to reach level N is:

XP_threshold(N) = N²


	•	Example:
	•	Level 1 → 2 requires 4 XP
	•	Level 2 → 3 requires 9 XP
	•	Level 3 → 4 requires 16 XP

	3.	XP carries over
	•	When XP crosses a threshold:
	•	Increment level by 1
	•	Subtract the threshold XP
	•	Carry remaining XP forward
	•	Multiple level-ups in one session/action are allowed.
	4.	Emit explicit LEVEL_UP events
	•	Whenever a level increases, log an event like:

📈 LEVEL UP: Mining 2 → 3


	•	These must appear in:
	•	action traces
	•	session summaries

	5.	Session summary changes
	•	Add:
	•	Levels gained this session
	•	Per-skill breakdown, e.g.:

Levels: Mining +1, Smithing +1


	•	Keep XP totals visible, but levels are the headline.

	6.	Expected Levels (analysis)
	•	Add an Expected Levels Gained metric per plan/session.
	•	Compute by:
	•	Converting Expected XP per skill into expected level crossings
	•	Using the same N² thresholds
	•	This can be approximate; exact precision is not required.
	7.	No gameplay effects yet
	•	Levels do NOT:
	•	change success probabilities
	•	change action times
	•	unlock content
	•	They are tracked, logged, and reported only.
	8.	Do not break existing metrics
	•	XP
	•	Expected XP
	•	Luck
	•	Volatility
	•	Risk to Objective
must all continue to work as before.

Acceptance Criteria
	•	Existing traces still run correctly.
	•	Session summaries clearly show:
	•	XP gained
	•	Levels gained
	•	Level-up events at the correct times
	•	It is obvious from logs when a run “felt good” because of a level-up, even if XP was modest.

This is a pure progression-representation change.
Do not rebalance or reinterpret any system.
