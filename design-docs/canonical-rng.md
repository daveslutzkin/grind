## RNG & Variance Canon — Planning Under Known Uncertainty

> **Implementation Status**: Seeded deterministic RNG exists with counter-based draws. Every roll is logged (label, probability, result, rngCounter). Luck tracking (deltas, streaks, cumulative) is currently only implemented for exploration. Gathering and combat do not yet surface luck information.

### Purpose

Randomness exists to create divergence, asymmetry, and decision pressure, not surprise or drama.

RNG is not an excuse.
RNG is a tool the player plans around.

⸻

### Laws of RNG

1.	All randomness is explicit

- Every probabilistic system exposes:
  - success chances
  - drop rates
  - expected value
  - variance
- The game never hides odds to create tension

2.	Luck is measured and surfaced

- The game tracks:
  - outcomes vs expectation
  - positive and negative streaks
  - cumulative luck deltas
- Players are told when they are:
  - lucky
  - unlucky
  - within normal variance

3.	RNG creates strategic asymmetry

- Two identical players can diverge meaningfully due to luck
- This divergence should:
  - open new strategies
  - close others
  - justify pivots

4.	Good play engages with variance deliberately

- Mastery is not avoiding RNG
- Mastery is choosing:
  - when to expose yourself
  - how much variance to tolerate
  - when to switch strategies based on outcomes

5.	Bad-luck protection is explicit

- Protection exists only to:
  - prevent extreme tail frustration
  - preserve feasibility of long-term goals
- Any protection:
  - is visible
  - has known thresholds
  - does not fully eliminate variance

> *Bad-luck protection is not yet implemented.*

6.	RNG never invalidates mastery

- Randomness may delay progress
- It may not permanently block it
- Extremely rare outcomes are acceptable only if:
  - sources are known
  - payoffs are transformative

⸻

### Explicit Non-Goals

- Hidden pity timers
- Fake randomness
- “Surprise” mechanics
- RNG that only affects flavour

⸻

### Canonical Examples

- Rare items with 1% drop rates and long tails
- Streak indicators that alter player confidence
- Luck spikes that justify short-term deviation from optimal play

⸻

### Guiding Check

Does this RNG mechanic create new decisions once outcomes are observed?

If not, it’s noise.
