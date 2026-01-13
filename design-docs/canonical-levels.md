## Progression Canon — Levels, Unlocks, and Feasibility Cliffs

> **Implementation Status**: XP/level system exists using N² formula for thresholds. Currently implemented unlocks:
> - **Gathering**: L1 = FOCUS mode, L3 = APPRAISE mode, L4 = CAREFUL_ALL mode
> - **Gathering location access**: L5 required for MID distance (d=2), L9 required for FAR distance (d=3+)
> - **Exploration**: Custom XP thresholds tuned to discovery counts per distance
>
> Not yet implemented: combat unlocks (attack profiles, enemy access), crafting unlocks (overcrafting, specialisation branches), and most capability unlocks described below.

### Purpose

Progression exists to create new strategic possibilities, not to smoothly increase output.

XP is bookkeeping.
Levels and unlocks are the real currency of mastery.

⸻

### Laws of Progression

1.	Levels must change what is possible, not just how efficient

- A level that only adds a small % bonus is incomplete
- Every meaningful level unlocks:
  - a new action
  - a new risk profile
  - a new contract type
  - or removes a previous constraint

2.	Progression is intentionally lumpy

- Power arrives in steps, not gradients
- Feasibility cliffs are desirable
- It should be common for: “This plan was impossible yesterday, trivial today”

3.	Levels justify risk retroactively

- Early risk is often taken hoping for a breakthrough
- When a level unlocks, past inefficiency becomes rational in hindsight

4.	Unlocks are explicit and inspectable

- The player always knows:
  - what the next level grants
  - what it enables
  - what strategies it invalidates or supersedes

5.	Numerical scaling is secondary

- Roughly:
  - 50% of progression = new capabilities
  - 50% = numerical improvements
- Numerical buffs exist to reinforce unlocks, not replace them

6.	Levels interact with variance

- Higher levels often unlock higher-variance options
- Mastery is choosing when to expose yourself to volatility

⸻

### Explicit Non-Goals

- No smooth power curves
- No invisible stat growth
- No “everything gets slightly better forever”
- No global character level

⸻

### Canonical Examples

- Combat level unlocks:
  - New attack profiles (safe / volatile / greedy)
  - Access to new enemy types
- Gathering level unlocks:
  - Vein sampling
  - Double-yield attempts
- Crafting level unlocks:
  - Overcrafting
  - Specialisation branches

⸻

### Guiding Check

Does this level unlock create a new plan that didn’t exist before?

If not, it doesn’t belong
