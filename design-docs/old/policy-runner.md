Policy Runner

Purpose: Validate mining balance across many seeds using fixed, interpretable, semi-scripted policies.

⸻

1) Scope and non-goals (important to lock)

In scope
	•	Mining progression only
	•	World generation as-is (nodes, distances, discovery, yield RNG)
	•	Inventory, travel, discovery, mining actions
	•	XP → level progression
	•	Deterministic decision logic + stochastic environment

Explicitly out of scope
	•	Combat
	•	Contracts (unless already mandatory to progress)
	•	Multi-skill optimization
	•	Any learning, planning, or adaptation
	•	Human-like heuristics (“try something else”)

This runner is a math probe, not a player.

⸻

2) Core abstraction: the Policy

Policy definition

A policy is a pure decision function:

Policy(observation_state) → Action

It:
	•	Has no memory beyond what the game state already exposes
	•	Is deterministic given the same observation
	•	Never calls RNG
	•	Does not inspect hidden state

Why this matters
	•	Reproducibility across seeds
	•	Failures are attributable to systems, not logic
	•	Policies are swappable without touching the sim core

⸻

3) Required system interfaces (what the runner needs from the game)

The runner should sit above the game engine and only require a narrow API.

3.1 Read-only observation interface

The policy must be able to observe:

Player state
	•	mining_level
	•	mining_xp
	•	known_mineable_mats (by level gate)
	•	inventory (slots used, per-item counts)
	•	current_location (town / area id / distance band)

World knowledge (only what’s been discovered)
	•	known_areas:
	•	distance
	•	discovered_nodes
	•	for each discovered node:
	•	primary material
	•	secondary materials
	•	remaining charges (if applicable)
	•	estimated yield range (if surfaced to player)
	•	mineable yes/no

Movement / logistics
	•	travel_time(to_area)
	•	return_time_to_town
	•	discovery_costs (if exploration consumes time)

Important:
The policy must not see undiscovered nodes or future RNG.

⸻

3.2 Action interface

The policy must be able to issue exactly these actions:
	1.	Mine(node_id)
	2.	Explore(area_id)
	3.	Travel(to_area_id)
	4.	ReturnToTown
	5.	DepositInventory
	6.	Wait (optional, mostly for safety)

Each action:
	•	Advances time
	•	May trigger RNG internally
	•	Updates world + player state

⸻

4) The simulation loop (runner structure)

High-level loop

initialize_world(seed)
initialize_player()

while not termination_condition:
    obs = get_observation()
    action = policy(obs)
    apply(action)
    record_metrics()

Termination conditions
	•	Target mining level reached (e.g. L20 / L40 / L60)
	•	Max tick budget exceeded (safety stop)
	•	Hard stall detected (see below)

⸻

5) Policies to implement (v1)

Start with exactly three. More adds noise.

⸻

Policy A: Safe Miner

Intent: “Progress reliably with minimal risk.”

Decision order:
	1.	If inventory full → Return + Deposit
	2.	If in town and known mineable node exists → Travel to nearest
	3.	If at area and mineable node exists → Mine best XP/tick node
	4.	Else → Explore nearest area at current distance
	5.	Never travel to a higher distance unless no mineable nodes exist anywhere

What this tests:
	•	Is near-town mining sufficient?
	•	Can bad seeds soft-lock progression?

⸻

Policy B: Greedy Miner

Intent: “Push distance as soon as allowed.”

Decision order:
	1.	If inventory full → Return + Deposit
	2.	If higher distance is unlocked → Prefer that distance
	3.	If at preferred distance and mineable node exists → Mine
	4.	Else → Explore at preferred distance
	5.	Falls back to lower distances only if blocked

What this tests:
	•	Risk vs reward actually exists
	•	Farther distances don’t trivially dominate

⸻

Policy C: Balanced Miner

Intent: “Maximize expected XP/tick.”

Decision order:
	1.	Compute XP/tick estimate for all known mineable nodes (including travel amortized)
	2.	Choose best EV option
	3.	If no known nodes → Explore nearest viable area
	4.	Inventory handling same as others

What this tests:
	•	Whether routing decisions matter
	•	Whether EV math collapses to a single loop

⸻

6) Hard stall detection (critical)

You must detect pathological cases automatically.

Define a stall as:
	•	No mining XP gained in N ticks (configurable)
	•	AND no new nodes discovered
	•	AND policy keeps repeating the same action loop

On stall:
	•	Record run as failed
	•	Capture snapshot (seed, level, distance, known nodes)
	•	Terminate run

This is one of the most valuable outputs.

⸻

7) Metrics the runner must emit (non-negotiable)

Each run should output a structured record.

Per-run summary
	•	seed
	•	policy_id
	•	ticks_to_target_level
	•	xp_gained_total
	•	stalls (true/false)
	•	max_distance_reached
	•	time_spent:
	•	mining
	•	traveling
	•	exploring
	•	inventory management

Progression timeline

For each level-up:
	•	level
	•	tick_reached
	•	cumulative_xp
	•	luck_delta_so_far (if tracked)

Optional but valuable
	•	Node utilization histogram (how often each mat was mined)
	•	Exploration-to-reward ratio
	•	% time idle or forced to backtrack

⸻

8) Monte Carlo harness (around the runner)

The policy runner is wrapped by a batch executor:

for seed in seeds:
    for policy in policies:
        run_sim(seed, policy)

Outputs:
	•	CSV / Parquet per policy
	•	Aggregated stats:
	•	p10 / p50 / p90 ticks to unlock
	•	stall rate
	•	XP/tick distribution

This layer does no game logic.

⸻

9) Determinism requirements (very important)

To make results meaningful:
	•	Seed must fully determine:
	•	world gen
	•	yield RNG
	•	discovery RNG
	•	Policy logic must be pure
	•	No hidden timers or wall-clock calls
	•	Identical seed + policy → identical trace

If this isn’t true, balance testing becomes untrustworthy.

⸻

10) Minimal deliverables for the implementation agent

Hand these to the implementation agent:
	1.	Policy interface
	•	Input: observation snapshot
	•	Output: action enum + params
	2.	Runner
	•	Single-run executor
	•	Tick loop
	•	Metric recorder
	3.	Policies
	•	Safe
	•	Greedy
	•	Balanced
	4.	Batch harness
	•	Seed list
	•	Policy list
	•	Aggregation outputs
	5.	Failure capture
	•	Stall detection
	•	Snapshot logging

⸻

11) Why this structure is “correct” for your project

This runner:
	•	Matches your explicit systems philosophy
	•	Makes luck measurable, not anecdotal
	•	Surfaces structural failures early
	•	Produces artifacts you can reason about
	•	Becomes reusable across all gathering skills

Once this exists, every balance change becomes testable instead of vibes-based.
