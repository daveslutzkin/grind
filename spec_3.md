Combat Progression Spec (v1)

Goals
	•	Make combat high-variance with convex upside
	•	Ensure combat is worse on average, but occasionally run-defining
	•	Keep everything visible within a 25-tick session
	•	Avoid reinforcing existing dominant non-combat paths

⸻

1. Combat Enrolment

Action: EnrolCombat
	•	Cost: 3 ticks
	•	Effect:
	•	Sets CombatLevel = 1
	•	Grants item: Crude Weapon

Crude Weapon
	•	Name: CrudeWeapon (placeholder)
	•	Required to perform Fight
	•	Fight parameters while equipped:
	•	Tick cost: 3
	•	Success chance: 70%
	•	On success:
	•	+1 Combat XP
	•	Standard combat loot (existing behaviour)
	•	On failure:
	•	Lose ticks only
	•	Do NOT relocate
	•	Clear queued actions / force replan if applicable

⸻

2. Combat Action

Action: Fight
	•	Requires:
	•	CombatLevel >= 1
	•	A weapon equipped
	•	Uses weapon parameters to determine:
	•	Tick cost
	•	Success probability
	•	On success:
	•	Roll for loot (see below)

⸻

3. Combat Loot Table

On every successful Fight, roll the following independently:

A. Improved Weapon Drop (10%)
	•	Item: ImprovedWeapon
	•	If dropped:
	•	Replace Crude Weapon
	•	Fight parameters become:
	•	Tick cost: 2
	•	Success chance: 80%

B. Rare Guild Token (1%)
	•	Item: CombatGuildToken
	•	Has no effect by itself
	•	Can only be turned in at Combat Guild

Note: Both drops can occur on the same kill.

⸻

4. Combat Guild Token Turn-In

Action: TurnInCombatToken
	•	Location: Combat Guild
	•	Requires:
	•	Item: CombatGuildToken
	•	Cost: 0 ticks
	•	Effect:
	•	Unlocks combat contract: combat-guild-1
	•	Consumes the token

⸻

5. Combat Contract

Contract: combat-guild-1
	•	Prerequisite:
	•	Unlocked by turning in CombatGuildToken
	•	Objective:
	•	Defeat 2 cave rats
	•	Completion requirements:
	•	Normal Fight actions count
	•	Reward on completion:
	•	+4 to +6 Combat XP (flat, deterministic)
	•	Contract completes instantly on final kill

⸻

6. Failure Handling (Important)

Combat Failure Rules
	•	On failed Fight:
	•	Time is consumed
	•	Player remains in current location
	•	No relocation
	•	No WRONG_LOCATION cascades

This is required to ensure combat risk is economic, not mechanical.

⸻

7. Design Constraints (Do Not Violate)
	•	Combat must remain suboptimal on average
	•	Combat must be the only source of:
	•	Improved weapons
	•	CombatGuildToken
	•	Combat contracts
	•	Rare outcomes (10% / 1%) should not be XP-scaled or smoothed
	•	Do not add combat XP multipliers elsewhere

⸻

8. Explicit Non-Goals (for now)
	•	No Combat Level 2+ mechanics
	•	No weapon durability
	•	No persistence across sessions
	•	No balance tuning beyond stated numbers
