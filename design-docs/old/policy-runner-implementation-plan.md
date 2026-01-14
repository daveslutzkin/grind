# Policy Runner Implementation Plan

## Overview

Implement a policy runner for validating mining balance across many seeds using fixed, deterministic policies. The runner sits above the game engine and executes policies that make decisions based on observable state only.

**Key Design Decisions (confirmed with user):**
- Location: `src/policy-runner/`
- Dedicated `PolicyObservation` type (no raw WorldState access)
- Simplified `PolicyAction` type with converter to engine actions
- Mining mode exposed but defaults to FOCUS
- Returns structured TypeScript objects (no file I/O in runner)
- Rolling window stall detection (XP + discoveries)
- Supports both explicit seeds and generated seed counts
- Build against current engine, adapt when 1-200 levels ship
- Unit tests + integration tests + determinism verification

---

## File Structure

```
src/policy-runner/
├── types.ts              # PolicyObservation, PolicyAction, Policy, RunResult, etc.
├── observation.ts        # getObservation(WorldState) → PolicyObservation
├── action-converter.ts   # toPolicyAction(PolicyAction, WorldState) → Action
├── runner.ts             # Single-run executor with tick loop
├── stall-detection.ts    # Rolling window stall detector
├── metrics.ts            # Metrics types and aggregation helpers
├── batch.ts              # Monte Carlo batch executor
├── policies/
│   ├── index.ts          # Policy registry, exports all policies
│   ├── safe.ts           # Safe Miner policy
│   ├── greedy.ts         # Greedy Miner policy
│   └── balanced.ts       # Balanced Miner policy
└── __tests__/
    ├── observation.test.ts
    ├── action-converter.test.ts
    ├── runner.test.ts
    ├── stall-detection.test.ts
    ├── policies.test.ts
    └── determinism.test.ts
```

---

## Step 1: Core Types (`types.ts`)

Define all type interfaces for the policy runner.

### 1.1 PolicyObservation

```typescript
interface PolicyObservation {
  // Player state
  miningLevel: number
  miningXp: number
  inventoryCapacity: number
  inventorySlotsUsed: number
  currentAreaId: AreaID

  // Known world (only discovered information)
  knownAreas: KnownArea[]

  // Current location details
  currentArea: KnownArea | null  // null if in town

  // Logistics
  isInTown: boolean
  canDeposit: boolean  // true if at storage location with items
}

interface KnownArea {
  areaId: AreaID
  distance: number
  travelTicksFromCurrent: number  // pre-computed
  discoveredNodes: KnownNode[]
}

interface KnownNode {
  nodeId: NodeID
  primaryMaterial: MaterialID
  primaryMaterialTier: number
  secondaryMaterials: MaterialID[]
  isMineable: boolean  // player has required level
  remainingCharges: number | null  // null if unknown/infinite
  locationId: string
}
```

### 1.2 PolicyAction

```typescript
type PolicyAction =
  | { type: 'Mine'; nodeId: NodeID; mode?: GatherMode }
  | { type: 'Explore'; areaId: AreaID }
  | { type: 'Travel'; toAreaId: AreaID }
  | { type: 'ReturnToTown' }
  | { type: 'DepositInventory' }
  | { type: 'Wait' }
```

### 1.3 Policy Interface

```typescript
interface Policy {
  id: string
  name: string
  decide: (observation: PolicyObservation) => PolicyAction
}
```

### 1.4 Run Results

```typescript
interface RunResult {
  seed: string
  policyId: string

  // Termination
  terminationReason: 'target_reached' | 'max_ticks' | 'stall'
  finalLevel: number
  finalXp: number
  totalTicks: number

  // Time breakdown
  ticksSpent: {
    mining: number
    traveling: number
    exploring: number
    inventoryManagement: number
    waiting: number
  }

  // Progression timeline
  levelUpTicks: Array<{
    level: number
    tick: number
    cumulativeXp: number
  }>

  // Stall info (if applicable)
  stallSnapshot?: StallSnapshot

  // Distance progression
  maxDistanceReached: number
}

interface StallSnapshot {
  tick: number
  level: number
  distance: number
  knownNodeCount: number
  lastAction: PolicyAction
}

interface BatchResult {
  results: RunResult[]
  aggregates: {
    byPolicy: Record<string, PolicyAggregates>
  }
}

interface PolicyAggregates {
  policyId: string
  runCount: number
  stallRate: number  // 0-1
  ticksToTarget: {
    p10: number
    p50: number
    p90: number
  }
  avgXpPerTick: number
  avgMaxDistance: number
}
```

---

## Step 2: Observation Builder (`observation.ts`)

Implement `getObservation(state: WorldState): PolicyObservation`

### Implementation Notes:

1. **Filter to known areas only**: Use `state.exploration.playerState.knownAreaIds`
2. **Filter to discovered nodes only**: Cross-reference node locations with `knownLocationIds`
3. **Compute travel times**: Use existing `getRollInterval()` or compute from area distances
4. **Check mineability**: Compare node material level requirements against `state.player.skills.Mining.level`
5. **Hide RNG state**: Never expose `state.rng`

### Key Logic:

```typescript
function getObservation(state: WorldState): PolicyObservation {
  const miningSkill = state.player.skills.Mining
  const playerState = state.exploration.playerState

  // Build known areas with only discovered nodes
  const knownAreas = playerState.knownAreaIds
    .map(areaId => buildKnownArea(state, areaId, miningSkill.level))
    .filter(area => area !== null)

  return {
    miningLevel: miningSkill.level,
    miningXp: miningSkill.xpInLevel,
    inventoryCapacity: state.player.inventoryCapacity,
    inventorySlotsUsed: state.player.inventory.length,
    currentAreaId: playerState.currentAreaId,
    knownAreas,
    currentArea: findCurrentArea(knownAreas, playerState.currentAreaId),
    isInTown: playerState.currentAreaId === 'TOWN',
    canDeposit: /* at storage with items */
  }
}
```

### Test Cases:
- Undiscovered nodes are not included in observation
- Travel times are correctly computed
- `isMineable` reflects current mining level
- Inventory counts are accurate

---

## Step 3: Action Converter (`action-converter.ts`)

Implement `toEngineAction(action: PolicyAction, state: WorldState): Action`

### Conversion Rules:

| PolicyAction | Engine Action | Notes |
|--------------|---------------|-------|
| `Mine(nodeId, mode?)` | `Mine` or `Gather` | Default mode=FOCUS, find highest-tier mineable material as focus |
| `Explore(areaId)` | `Explore` | If not at area, prepend Travel |
| `Travel(toAreaId)` | `FarTravel` or `ExplorationTravel` | Use FarTravel for multi-hop |
| `ReturnToTown` | `FarTravel` to TOWN | Direct travel to town |
| `DepositInventory` | `Store` | Store all inventory items |
| `Wait` | No-op tick consumption | May need custom handling |

### Mine Action Details:

```typescript
function convertMineAction(
  action: { type: 'Mine'; nodeId: NodeID; mode?: GatherMode },
  state: WorldState
): Action {
  const node = findNode(state, action.nodeId)
  const mode = action.mode ?? 'FOCUS'

  // For FOCUS mode, pick highest-tier mineable material
  const focusMaterial = mode === 'FOCUS'
    ? selectBestFocusMaterial(node, state.player.skills.Mining.level)
    : undefined

  return {
    type: 'Mine',
    mode,
    focusMaterialId: focusMaterial
  }
}
```

### Test Cases:
- Mine with default mode uses FOCUS
- Mine selects highest-tier mineable material for focus
- Travel uses appropriate action type based on distance
- DepositInventory stores all items
- Invalid actions (unreachable area, unknown node) throw descriptive errors

---

## Step 4: Stall Detection (`stall-detection.ts`)

Implement rolling window stall detector.

### Interface:

```typescript
interface StallDetector {
  recordTick(xpGained: number, nodesDiscovered: number): void
  isStalled(): boolean
  getSnapshot(state: WorldState, lastAction: PolicyAction): StallSnapshot
}

function createStallDetector(windowSize: number): StallDetector
```

### Implementation:

```typescript
function createStallDetector(windowSize: number = 1000): StallDetector {
  let ticksWithoutProgress = 0

  return {
    recordTick(xpGained: number, nodesDiscovered: number) {
      if (xpGained > 0 || nodesDiscovered > 0) {
        ticksWithoutProgress = 0
      } else {
        ticksWithoutProgress++
      }
    },

    isStalled() {
      return ticksWithoutProgress >= windowSize
    },

    getSnapshot(state, lastAction) {
      return {
        tick: state.time.currentTick,
        level: state.player.skills.Mining.level,
        distance: /* max known distance */,
        knownNodeCount: /* count */,
        lastAction
      }
    }
  }
}
```

### Test Cases:
- Not stalled initially
- XP gain resets counter
- Node discovery resets counter
- Stall triggers after windowSize ticks of no progress
- Snapshot captures correct state

---

## Step 5: Single-Run Executor (`runner.ts`)

Implement the main simulation loop.

### Interface:

```typescript
interface RunConfig {
  seed: string
  policy: Policy
  targetLevel: number
  maxTicks: number
  stallWindowSize?: number  // default 1000
}

async function runSimulation(config: RunConfig): Promise<RunResult>
```

### Implementation Outline:

```typescript
async function runSimulation(config: RunConfig): Promise<RunResult> {
  const { seed, policy, targetLevel, maxTicks } = config

  // Initialize
  const state = createWorld(seed)
  const stallDetector = createStallDetector(config.stallWindowSize)
  const metrics = createMetricsCollector()

  // Main loop
  while (true) {
    // Check termination conditions
    if (state.player.skills.Mining.level >= targetLevel) {
      return metrics.finalize('target_reached', state)
    }
    if (state.time.currentTick >= maxTicks) {
      return metrics.finalize('max_ticks', state)
    }
    if (stallDetector.isStalled()) {
      return metrics.finalize('stall', state, stallDetector.getSnapshot(...))
    }

    // Policy decision
    const observation = getObservation(state)
    const policyAction = policy.decide(observation)

    // Convert and execute
    const engineAction = toEngineAction(policyAction, state)
    const prevXp = state.player.skills.Mining.xpInLevel
    const prevLevel = state.player.skills.Mining.level

    const log = await executeAction(state, engineAction)

    // Record metrics
    const xpGained = calculateXpGained(prevXp, prevLevel, state)
    const nodesDiscovered = log.discoveredLocations?.length ?? 0

    metrics.recordAction(policyAction.type, log.timeConsumed, xpGained)
    stallDetector.recordTick(xpGained, nodesDiscovered)

    // Record level-ups
    if (state.player.skills.Mining.level > prevLevel) {
      metrics.recordLevelUp(state.player.skills.Mining.level, state.time.currentTick)
    }
  }
}
```

### Test Cases:
- Terminates when target level reached
- Terminates when max ticks exceeded
- Terminates on stall detection
- Metrics correctly track time breakdown
- Level-ups are recorded with correct tick

---

## Step 6: Policies (`policies/`)

### 6.1 Safe Miner (`safe.ts`)

**Intent:** Progress reliably with minimal risk.

```typescript
const safeMiner: Policy = {
  id: 'safe',
  name: 'Safe Miner',

  decide(obs: PolicyObservation): PolicyAction {
    // 1. If inventory full → Return + Deposit
    if (obs.inventorySlotsUsed >= obs.inventoryCapacity) {
      return obs.isInTown
        ? { type: 'DepositInventory' }
        : { type: 'ReturnToTown' }
    }

    // 2. If in town and known mineable node exists → Travel to nearest
    if (obs.isInTown) {
      const nearestMineable = findNearestMineableNode(obs)
      if (nearestMineable) {
        return { type: 'Travel', toAreaId: nearestMineable.areaId }
      }
    }

    // 3. If at area and mineable node exists → Mine best XP/tick node
    if (obs.currentArea) {
      const mineableNode = findBestNodeInArea(obs.currentArea)
      if (mineableNode) {
        return { type: 'Mine', nodeId: mineableNode.nodeId }
      }
    }

    // 4. Else → Explore nearest area at current distance band
    const exploreTarget = findNearestUnexploredArea(obs, 'same_or_lower')
    if (exploreTarget) {
      return { type: 'Explore', areaId: exploreTarget }
    }

    // 5. Only go higher distance if nothing else available
    const higherTarget = findNearestUnexploredArea(obs, 'higher')
    if (higherTarget) {
      return { type: 'Explore', areaId: higherTarget }
    }

    return { type: 'Wait' }
  }
}
```

### 6.2 Greedy Miner (`greedy.ts`)

**Intent:** Push distance as soon as allowed.

```typescript
const greedyMiner: Policy = {
  id: 'greedy',
  name: 'Greedy Miner',

  decide(obs: PolicyObservation): PolicyAction {
    // 1. Inventory management
    if (obs.inventorySlotsUsed >= obs.inventoryCapacity) {
      return obs.isInTown
        ? { type: 'DepositInventory' }
        : { type: 'ReturnToTown' }
    }

    // 2. Determine highest unlocked distance
    const maxUnlockedDistance = getMaxUnlockedDistance(obs.miningLevel)

    // 3. Prefer highest distance areas
    const preferredAreas = obs.knownAreas
      .filter(a => a.distance === maxUnlockedDistance)
      .sort((a, b) => a.travelTicksFromCurrent - b.travelTicksFromCurrent)

    // 4. Mine at preferred distance if possible
    for (const area of preferredAreas) {
      const mineableNode = findBestNodeInArea(area)
      if (mineableNode) {
        if (area.areaId !== obs.currentAreaId) {
          return { type: 'Travel', toAreaId: area.areaId }
        }
        return { type: 'Mine', nodeId: mineableNode.nodeId }
      }
    }

    // 5. Explore at preferred distance
    const exploreTarget = findUnexploredAtDistance(obs, maxUnlockedDistance)
    if (exploreTarget) {
      return { type: 'Explore', areaId: exploreTarget }
    }

    // 6. Fall back to lower distances
    return safeMiner.decide(obs)  // Reuse safe logic as fallback
  }
}
```

### 6.3 Balanced Miner (`balanced.ts`)

**Intent:** Maximize expected XP/tick.

```typescript
const balancedMiner: Policy = {
  id: 'balanced',
  name: 'Balanced Miner',

  decide(obs: PolicyObservation): PolicyAction {
    // 1. Inventory management (same as others)
    if (obs.inventorySlotsUsed >= obs.inventoryCapacity) {
      return obs.isInTown
        ? { type: 'DepositInventory' }
        : { type: 'ReturnToTown' }
    }

    // 2. Compute XP/tick for all known mineable nodes
    const candidates = obs.knownAreas
      .flatMap(area => area.discoveredNodes
        .filter(n => n.isMineable)
        .map(node => ({
          node,
          areaId: area.areaId,
          xpPerTick: computeXpPerTick(node, area.travelTicksFromCurrent)
        }))
      )
      .sort((a, b) => b.xpPerTick - a.xpPerTick)

    // 3. Choose best EV option
    if (candidates.length > 0) {
      const best = candidates[0]
      if (best.areaId !== obs.currentAreaId) {
        return { type: 'Travel', toAreaId: best.areaId }
      }
      return { type: 'Mine', nodeId: best.node.nodeId }
    }

    // 4. No known nodes → Explore nearest viable area
    const exploreTarget = findNearestExploreTarget(obs)
    if (exploreTarget) {
      return { type: 'Explore', areaId: exploreTarget }
    }

    return { type: 'Wait' }
  }
}

function computeXpPerTick(node: KnownNode, travelTicks: number): number {
  const miningTicks = 5  // Fixed gather time
  const nodeXp = node.primaryMaterialTier * miningTicks
  return nodeXp / (travelTicks + miningTicks)
}
```

### Policy Test Cases:
- Each policy returns valid action for any observation
- Safe policy prefers lower distances
- Greedy policy prefers higher distances
- Balanced policy picks highest XP/tick node
- All policies handle empty observations (no known nodes)
- All policies handle full inventory correctly

---

## Step 7: Batch Executor (`batch.ts`)

Implement Monte Carlo harness.

### Interface:

```typescript
interface BatchConfig {
  seeds?: string[]        // Explicit seeds
  seedCount?: number      // Or generate this many (default 100)
  policies: Policy[]
  targetLevel: number
  maxTicks: number
  stallWindowSize?: number
}

async function runBatch(config: BatchConfig): Promise<BatchResult>
```

### Implementation:

```typescript
async function runBatch(config: BatchConfig): Promise<BatchResult> {
  const seeds = config.seeds ?? generateSeeds(config.seedCount ?? 100)
  const results: RunResult[] = []

  for (const seed of seeds) {
    for (const policy of config.policies) {
      const result = await runSimulation({
        seed,
        policy,
        targetLevel: config.targetLevel,
        maxTicks: config.maxTicks,
        stallWindowSize: config.stallWindowSize
      })
      results.push(result)
    }
  }

  return {
    results,
    aggregates: computeAggregates(results, config.policies)
  }
}

function generateSeeds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `seed-${i}`)
}

function computeAggregates(results: RunResult[], policies: Policy[]): {...} {
  // Group by policy, compute p10/p50/p90, stall rates, etc.
}
```

### Test Cases:
- Generates correct number of seeds when seedCount provided
- Uses explicit seeds when provided
- Runs all policy/seed combinations
- Aggregates compute correct percentiles
- Stall rate calculation is accurate

---

## Step 8: Determinism Test (`__tests__/determinism.test.ts`)

Critical test to verify reproducibility.

```typescript
describe('determinism', () => {
  it('produces identical results for same seed and policy', async () => {
    const config = {
      seed: 'test-seed-123',
      policy: safeMiner,
      targetLevel: 5,
      maxTicks: 10000
    }

    const result1 = await runSimulation(config)
    const result2 = await runSimulation(config)

    expect(result1).toEqual(result2)
  })

  it('produces different results for different seeds', async () => {
    const config1 = { ...baseConfig, seed: 'seed-a' }
    const config2 = { ...baseConfig, seed: 'seed-b' }

    const result1 = await runSimulation(config1)
    const result2 = await runSimulation(config2)

    // At minimum, total ticks should differ
    expect(result1.totalTicks).not.toEqual(result2.totalTicks)
  })
})
```

---

## Step 9: Export from Index (`index.ts`)

Create public API for the policy runner.

```typescript
// src/policy-runner/index.ts
export { runSimulation } from './runner'
export { runBatch } from './batch'
export { safeMiner, greedyMiner, balancedMiner } from './policies'
export { getObservation } from './observation'
export type {
  Policy,
  PolicyObservation,
  PolicyAction,
  RunResult,
  BatchResult,
  RunConfig,
  BatchConfig
} from './types'
```

---

## Implementation Order

1. **types.ts** - All interfaces first (no dependencies)
2. **observation.ts** + tests - Core observation building
3. **action-converter.ts** + tests - Action translation
4. **stall-detection.ts** + tests - Simple, isolated module
5. **policies/*.ts** + tests - All three policies
6. **runner.ts** + tests - Single-run executor
7. **batch.ts** + tests - Batch harness
8. **determinism.test.ts** - Final verification
9. **index.ts** - Public exports

Run `npm run check` after each step.

---

## Open Questions for Future

These are explicitly deferred:
- File export (JSON/CSV) - add as thin wrapper when needed
- Parallel batch execution - currently sequential, optimize later if slow
- Additional policies - start with 3, add more based on findings
- Integration with 1-200 leveling - update when that ships

---

## Success Criteria

The policy runner is complete when:
1. All three policies run to completion on 100 seeds without crashes
2. Determinism test passes (same seed = same result)
3. Stall detection correctly identifies stuck runs
4. Metrics output includes all required fields from design doc
5. `npm run check` passes
