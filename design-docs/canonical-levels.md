Canonical Levelling Spec

(Gathering Skills – v1)

1. Purpose

The levelling system exists to make the player feel increasingly special because they endured and mastered the grind.

Levels are not rewards for time spent.
They are recognition of accumulated constraint, trade-offs, and persistence.

⸻

2. High-Level Structure

2.1 Headline Level

Each gathering skill (e.g. Mining, Forestry) has:
	•	A single headline skill level (1–100 initially)
	•	This is:
	•	the primary progression indicator
	•	what contracts, access gates, and content key off
	•	slow, deliberate, and effortful to increase

Time-to-next-level rule (canonical):

Advancing from level N → N+1 should require approximately N minutes of solid, constraint-engaging play.

“Solid play” includes:
	•	running into inventory pressure
	•	rerouting
	•	abandoning items
	•	suboptimal but human decisions

Idle optimisation does not count as design intent.

⸻

3. Material Mastery (Core Mechanism)

3.1 Mastery Tracks

Each gathering material has its own explicit, inspectable mastery level.

Example:
	•	Copper Mastery: 17
	•	Iron Mastery: 6
	•	Platinum: Locked

Material mastery is:
	•	deterministic
	•	visible
	•	asymmetric across materials
	•	the main carrier of progression impact

Skill level is the headline.
Material mastery is where progress actually lives.

⸻

3.2 Locked → Unlocked Materials

Materials follow a strict reveal-based progression.
	•	Before unlock:
	•	Material may be visible in the world
	•	Player cannot meaningfully gather it
	•	No mastery number exists
	•	The first mastery increase is the unlock
	•	“You can now work this material at all”

This creates anticipation and prevents premature complexity.

⸻

4. Material Unlock Cadence
	•	~9 materials per gathering skill (initially)
	•	~100 skill levels total
	•	One new material unlocked approximately every 10 levels

Example pattern:
	•	Material 1: unlocked at level 1
	•	Material 2: unlocked ~level 10
	•	Material 3: unlocked ~level 20
	•	…
	•	Material 9: unlocked ~level 80

Late levels are primarily about finishing mastery, not unlocking novelty.

⸻

5. Mastery Progression Shape

5.1 Determinism
	•	All level-up effects are guaranteed
	•	No RNG affects mastery gains
	•	Players are never “unlucky” when levelling

Variance belongs in actions, not progression.

⸻

5.2 Focus Material Rule

At most non-headline levels:
	•	Exactly one material is designated the focus material
	•	That material gains a mastery increase
	•	Other materials remain unchanged

This:
	•	preserves clarity
	•	nudges player behaviour
	•	creates “eras” of identity (e.g. iron phase)

⸻

5.3 Weighted Rotation

Between material unlocks:
	•	Mastery progression is weighted toward the newest unlocked material
	•	Earlier materials still advance, but more slowly

Example:
	•	Stone unlocked at L1, finishes ~L30
	•	Copper unlocked at L10, finishes ~L40
	•	Iron unlocked at L20, finishes ~L50
	•	etc.

⸻

6. Mastery Curve

Material mastery follows diminishing returns.
	•	Early mastery levels:
	•	large, felt improvements
	•	relief from frustration
	•	Mid mastery:
	•	steady, meaningful refinement
	•	Late mastery:
	•	small optimisations
	•	logistics and variance smoothing
	•	approach perfection asymptotically

No material ever becomes “solved”.

⸻

7. What Mastery Improves (Knob Set)

Each material’s mastery affects multiple internal knobs, including:
	•	Gather speed for that material
	•	Waste when gathering other materials from the same node
	•	Chance to find the material while scavenging
	•	Speed of recognising exact quantities
	•	Maximum stack size in inventory
	•	Eligibility for specialised containers
	•	Sale price / value realisation
	•	Ability to extract higher-quality variants

These knobs:
	•	are not individually levelled
	•	are driven by the single mastery number
	•	are summarised textually in the UI

⸻

8. Grandmaster Threshold

Each material has a final qualitative threshold (“Grandmaster”).
	•	Mastery continues asymptotically beyond it
	•	But reaching Grandmaster unlocks:
	•	the ability to liberate small amounts of high-grade material
	•	by processing large volumes of the base material

This:
	•	gives late mastery meaning
	•	preserves scale
	•	reinforces that expertise enables transformation, not shortcuts

⸻

9. Level-Up Feedback (Hard Requirement)

Every level-up must be explicit and explanatory.

On level-up, the player is told:
	•	which material improved
	•	the mastery change
	•	what that concretely means in play terms

Example:

Mining Level 27
Iron Mastery: 14 → 15
• Iron gathering is slightly faster
• Less iron is wasted when mining mixed veins
• Iron stacks hold +2 more units

Silent progress is forbidden.

⸻

10. Headline Levels (Every ~4 Levels)

Roughly every 4 levels:
	•	A headline change may occur:
	•	new gathering mode
	•	access gate
	•	container eligibility
	•	contract tier
	•	distance unlock
	•	These are additive, not the primary progression driver

Most levels are still meaningful without these.

⸻

11. Cognitive Load Rules

Expected material engagement:
	•	Early game: ~1 material
	•	Mid game: ~2 materials
	•	Late game: 3+ materials

Inventory pressure scales accordingly and is intentional.

⸻

12. Non-Goals (Explicit)
	•	No per-material XP (for v1)
	•	No hidden progression
	•	No RNG on level-ups
	•	No smooth “everything gets slightly better” curves
	•	No early access to high-tier materials

⸻

13. Design Test

A level-up is valid only if:

The player can clearly say
“I am better at this now, and I understand why that matters.”
