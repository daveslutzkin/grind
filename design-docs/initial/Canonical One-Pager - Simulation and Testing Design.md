# Simulation & Testing Design – Canonical Spec

This document captures **all decisions and constraints** agreed during the testing/simulation interview. It is the canonical reference for how the rules-first game should be tested, simulated, and evolved **before any graphical frontend exists**.

---

## 1. Purpose of the Simulation Framework

The simulation framework exists to answer one core question continuously during development:

> **When systems or content are added, does the set of “right plays” collapse or remain diverse?**

### Primary goals
- **Balance validation**
  - Detect dominant strategies
  - Identify when new content makes existing paths obsolete
- **Degenerate exploit discovery**
  - Infinite or near-infinite loops
  - Trivial farming strategies
  - Unintended synergies that crowd out other play

### Explicit non-goals (for now)
- Narrative quality testing
- UI/UX validation
- Emotional engagement modelling
- Human-like roleplay fidelity

The simulator is a **design microscope**, not a player replacement.

---

## 2. Interaction Model

The game is built as a **headless rules engine** with no graphical frontend.

Two interaction layers sit on top:

1. **Manual designer interface**
   - Rough web UI
   - Used for qualitative feel, sanity checking, and debugging
   - Uses the *same APIs* as simulated agents

2. **LLM-driven simulation layer**
   - Runs repeated session simulations
   - Used to detect balance collapse and exploit emergence

There are **no special rules** for the simulator. If the web UI needs it, it must be exposed via the same engine interfaces.

---

## 3. Simulation Granularity

### Agent level
- Agents operate as **low-level actors**
- They explicitly:
  - Move through the world
  - Choose actions
  - Manage inventory
  - Select contracts
  - Prepare and resolve combat

No high-level abstraction replaces real decision-making. This is required to surface micro-level degeneracy.

### Time model (v1)
- **Discrete time**
- Each action has an explicit time cost
- A session is a sequence of actions until the time budget is exhausted
- No real-time ticking or concurrency in v1

---

## 4. Simulation Horizon

- **Primary unit of analysis: sessions** (≈20–60 minutes of play)

Balance questions are framed as:
- “What is the best way to spend a session?”
- “Do multiple viable session plans exist?”

Longer horizons (days/weeks) may later be modelled by chaining sessions, but are not the initial focus.

---

## 5. Agent Intelligence Model

### Initial intelligence posture
- **Naive but curious**
- Agents:
  - Explore unfamiliar options
  - Do not assume a solved meta
  - Learn gradually from experience

This is intended to surface *emergent* problems rather than immediately converging on obvious optima.

### Learning model
- **Pure memory-based learning**
- Agents remember:
  - Actions taken
  - Outcomes observed
  - RNG luck/unluckiness

In addition, agents store **explicit written conclusions**, such as:
- “This route seems inefficient.”
- “Inventory constraint X caused repeated waste.”
- “Contract type Y has high variance but strong EV.”

No opaque reinforcement learning is used. All learning is inspectable and auditable.

---

## 6. Knowledge Model

Agents know **exactly what a well-informed human player is expected to know**.

This includes:
- Explicit rules
- Drop rates
- Probabilities
- Expected values
- Variance
- System descriptions

Agents do **not** have designer-only omniscience.

This ensures the simulation tests **system balance**, not tutorialisation or discoverability.

---

## 7. Agent Objectives & Personality

### Objectives
Agents may optimise for any legitimate player goal, including:
- Skill XP
- Guild reputation
- Rare-item acquisition
- Expected value per session
- Variance minimisation
- Exploration / content exposure

### Personality
- Each agent has a **stable personality**
- Personality biases how objectives are weighted
- Personality remains consistent across sessions

For early testing, agents share the same decision model; diversity comes from:
- RNG outcomes
- Individual experience and conclusions

---

## 8. Agent Diversity Model (v1)

- All agents start with **identical decision logic**
- No baked-in personality archetypes initially

This ensures:
- Any convergence is a **system problem**, not an agent-design artifact
- Diversity that emerges is genuinely systemic

Personality variation can be layered later if the base system supports it.

---

## 9. Simulation Scale Strategy

Simulation scale increases gradually:

1. **1 agent**
   - Deep inspection
   - Debug rules, actions, learning, and observability

2. **Up to 5 agents**
   - Early convergence detection
   - Validate that RNG alone creates divergence

3. **Up to 20 agents**
   - Detect collapse of choice
   - Stress-test new systems and content

Statistical mass is *not* the goal early; interpretability is.

---

## 10. Observability Requirements

**Full observability is mandatory.**

For a single agent, the system must expose:

- Step-by-step action logs
- Session-level plans and outcomes
- Explicit written reasoning
- Full agent memory and conclusions
- World state snapshots (location, inventory, skills, reputation, RNG state)
- Hooks for visualisation (routes, inventory packing, time allocation)

The engine must support:
- Structured logs
- Deterministic-ish replay
- Debugger-like inspection of sessions

---

## 11. Determinism

- **Mostly deterministic**
- Core rules and RNG are seedable
- World-state transitions should be replayable in principle
- Some nondeterminism (e.g. LLM phrasing) is acceptable

Determinism is a debugging aid, not a philosophical requirement.

---

## 12. Evaluation & Metrics

### Primary evaluation signal
- **Lack of strategic diversity**

Failure is indicated when:
- Agents converge on the same strategies
- The same routes/actions dominate
- Large portions of content go unexplored
- Different agents reach the same conclusions

### Supporting metrics (secondary)
- Action diversity
- Route diversity
- Contract choice diversity
- Build and inventory pattern diversity
- Outcome variance vs expectation

Metrics exist to *support* qualitative insight, not replace it.

---

## 13. Degenerate Strategy Detection (v1 Output)

When degeneracy is detected, the primary output is:

- **Narrative explanation from the agent**
  - What strategy emerged
  - Why it was repeatedly chosen
  - What alternatives were considered and rejected

Human-readable diagnosis comes before automated flags or rankings.

---

## 14. Rules Engine / Agent Boundary

The system uses a **hybrid boundary model**:

The game exposes:
- A low-level action API
- Fully explicit rules
- Helper abstractions, such as:
  - available contracts
  - reachable locations
  - valid crafting options
  - inventory packing possibilities
- Evaluative queries, such as:
  - EV of a proposed plan
  - variance profile
  - time/resource cost breakdown

The game **never**:
- Chooses actions
- Recommends optimal strategies
- Solves the optimisation problem

All decision-making lives in the agent (or the human tester).

---

## 15. Guiding Principle for All Testing Work

> **If a single “right way to play a session” emerges, the system has failed.**

The simulator exists to surface that failure as early, clearly, and explainably as possible.

---

