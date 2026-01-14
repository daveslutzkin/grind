#!/usr/bin/env node

/**
 * Policy Runner CLI
 *
 * Run deterministic policy simulations from the command line.
 */

import { runSimulation } from "./runner.js"
import { runBatch } from "./batch.js"
import { runBatchParallel } from "./parallel-batch.js"
import { safeMiner } from "./policies/safe.js"
import { greedyMiner } from "./policies/greedy.js"
import { balancedMiner } from "./policies/balanced.js"
import type {
  Policy,
  PolicyAction,
  RunResult,
  ActionRecord,
  SkillXpGain,
  LevelUpRecord,
} from "./types.js"
import type { SkillID } from "../types.js"

const POLICIES: Record<string, Policy> = {
  safe: safeMiner,
  greedy: greedyMiner,
  balanced: balancedMiner,
}

/**
 * Parse command line arguments
 */
function parseArgs(): {
  seed: string | undefined
  seeds: string[] | undefined
  seedCount: number | undefined
  policy: string
  targetLevel: number
  maxTicks: number
  stallWindowSize: number | undefined
  batch: boolean
  parallel: boolean
  maxWorkers: number | undefined
  verbose: boolean
  logActions: boolean
  help: boolean
} {
  const args = process.argv.slice(2)

  let seed: string | undefined
  let seeds: string[] | undefined
  let seedCount: number | undefined
  let policy = "safe"
  let targetLevel = 5
  let maxTicks = 50000
  let stallWindowSize: number | undefined
  let batch = false
  let parallel = false
  let maxWorkers: number | undefined
  let verbose = false
  let logActions = false
  let help = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === "--help" || arg === "-h") {
      help = true
    } else if (arg === "--seed" || arg === "-s") {
      seed = args[++i]
    } else if (arg === "--seeds") {
      seeds = args[++i].split(",")
    } else if (arg === "--seed-count" || arg === "-n") {
      seedCount = parseInt(args[++i], 10)
    } else if (arg === "--policy" || arg === "-p") {
      policy = args[++i]
    } else if (arg === "--target-level" || arg === "-l") {
      targetLevel = parseInt(args[++i], 10)
    } else if (arg === "--max-ticks" || arg === "-t") {
      maxTicks = parseInt(args[++i], 10)
    } else if (arg === "--stall-window") {
      stallWindowSize = parseInt(args[++i], 10)
    } else if (arg === "--batch" || arg === "-b") {
      batch = true
    } else if (arg === "--parallel" || arg === "-P") {
      parallel = true
    } else if (arg === "--max-workers" || arg === "-w") {
      maxWorkers = parseInt(args[++i], 10)
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true
    } else if (arg === "--log-actions") {
      logActions = true
    }
  }

  return {
    seed,
    seeds,
    seedCount,
    policy,
    targetLevel,
    maxTicks,
    stallWindowSize,
    batch,
    parallel,
    maxWorkers,
    verbose,
    logActions,
    help,
  }
}

/**
 * Print usage information
 */
function printHelp(): void {
  console.log(`
Policy Runner CLI - Run deterministic policy simulations

USAGE:
  npx tsx src/policy-runner/cli.ts [options]

OPTIONS:
  -s, --seed <seed>       Single seed for reproducible run
  --seeds <s1,s2,...>     Comma-separated list of seeds for batch
  -n, --seed-count <n>    Generate N random seeds for batch (default: 100)
  -p, --policy <name>     Policy to use: safe, greedy, balanced (default: safe)
  -l, --target-level <n>  Target mining level to reach (default: 5)
  -t, --max-ticks <n>     Maximum ticks before timeout (default: 50000)
  --stall-window <n>      Ticks without progress before stall (default: 1000)
  -b, --batch             Run batch mode (multiple seeds)
  -P, --parallel          Run batch in parallel using worker threads
  -w, --max-workers <n>   Maximum worker threads for parallel mode (default: CPU count)
  -v, --verbose           Show detailed progress
  --log-actions           Output full action log (single run only)
  -h, --help              Show this help message

EXAMPLES:
  # Single run with specific seed
  npx tsx src/policy-runner/cli.ts --seed test-1 --policy safe --target-level 3

  # Batch run with 50 random seeds
  npx tsx src/policy-runner/cli.ts --batch --seed-count 50 --policy greedy

  # Parallel batch run (uses all CPU cores)
  npx tsx src/policy-runner/cli.ts --batch --parallel --seed-count 50 --policy safe

  # Parallel batch with limited workers
  npx tsx src/policy-runner/cli.ts --batch --parallel --max-workers 4 --seed-count 50

  # Batch run comparing all policies
  npx tsx src/policy-runner/cli.ts --batch --seed-count 20 --policy all

  # Batch run with specific seeds
  npx tsx src/policy-runner/cli.ts --batch --seeds seed1,seed2,seed3 --policy balanced

POLICIES:
  safe      - Conservative, prefers closer areas, reliable progression
  greedy    - Aggressive, pushes to highest unlocked distance
  balanced  - Optimizes XP/tick ratio accounting for travel time
  all       - Run all policies (batch mode only)
`)
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

/**
 * Format a policy action for display
 */
export function formatPolicyAction(action: PolicyAction): string {
  switch (action.type) {
    case "Mine":
      return `Mine(${action.nodeId}${action.mode ? `, ${action.mode}` : ""})`
    case "Explore":
      return `Explore(${action.areaId})`
    case "Travel":
      return `Travel(${action.toAreaId})`
    case "ReturnToTown":
      return "ReturnToTown"
    case "DepositInventory":
      return "DepositInventory"
    case "Wait":
      return "Wait"
  }
}

/**
 * Format XP gains for display
 */
function formatXpGains(xpGained: SkillXpGain[]): string {
  if (xpGained.length === 0) return "0"
  return xpGained.map((g) => `${g.skill.slice(0, 3)}:${g.amount}`).join(" ")
}

/**
 * Format levels for display
 */
function formatLevels(record: ActionRecord): string {
  if (record.levelsAfter.length === 0) return ""
  return record.levelsAfter.map((l) => `${l.skill.slice(0, 3)}:${l.level}`).join(" ")
}

/**
 * Format level-ups for highlighting
 */
function formatLevelUps(record: ActionRecord): string {
  if (record.levelUps.length === 0) return ""
  return record.levelUps.map((l) => `*** ${l.skill} LEVEL ${l.level} ***`).join(" ")
}

/**
 * Sort level-up records by skill name then level
 */
function sortLevelUps(levelUps: LevelUpRecord[]): LevelUpRecord[] {
  return [...levelUps].sort((a, b) => {
    const skillCompare = a.skill.localeCompare(b.skill)
    if (skillCompare !== 0) return skillCompare
    return a.level - b.level
  })
}

/**
 * Calculate percentile from a sorted array of numbers
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0
  const index = Math.ceil(p * sortedValues.length) - 1
  return sortedValues[Math.max(0, Math.min(index, sortedValues.length - 1))]
}

/**
 * Aggregate level-up data across multiple runs for a specific skill/level
 */
interface LevelUpAggregate {
  skill: SkillID
  level: number
  tick: { p10: number; p50: number; p90: number }
  actions: { p10: number; p50: number; p90: number }
  distance: { p10: number; p50: number; p90: number }
  count: number // How many runs reached this level
}

/**
 * Compute level progression aggregates from multiple run results
 */
function computeLevelProgressionAggregates(results: RunResult[]): LevelUpAggregate[] {
  // Group level-ups by skill and level
  const grouped = new Map<string, LevelUpRecord[]>()

  for (const result of results) {
    for (const lu of result.levelUpTicks) {
      const key = `${lu.skill}:${lu.level}`
      if (!grouped.has(key)) {
        grouped.set(key, [])
      }
      grouped.get(key)!.push(lu)
    }
  }

  // Compute aggregates for each skill/level
  const aggregates: LevelUpAggregate[] = []

  for (const [key, records] of grouped) {
    const [skill, levelStr] = key.split(":")
    const level = parseInt(levelStr, 10)

    const ticks = records.map((r) => r.tick).sort((a, b) => a - b)
    const actions = records.map((r) => r.actionCount).sort((a, b) => a - b)
    const distances = records.map((r) => r.distance).sort((a, b) => a - b)

    aggregates.push({
      skill: skill as SkillID,
      level,
      tick: {
        p10: percentile(ticks, 0.1),
        p50: percentile(ticks, 0.5),
        p90: percentile(ticks, 0.9),
      },
      actions: {
        p10: percentile(actions, 0.1),
        p50: percentile(actions, 0.5),
        p90: percentile(actions, 0.9),
      },
      distance: {
        p10: percentile(distances, 0.1),
        p50: percentile(distances, 0.5),
        p90: percentile(distances, 0.9),
      },
      count: records.length,
    })
  }

  // Sort by skill then level
  aggregates.sort((a, b) => {
    const skillCompare = a.skill.localeCompare(b.skill)
    if (skillCompare !== 0) return skillCompare
    return a.level - b.level
  })

  return aggregates
}

/**
 * Print single run result
 */
function printResult(result: RunResult, verbose: boolean, logActions: boolean): void {
  console.log()
  console.log("=".repeat(60))
  console.log("RUN RESULT")
  console.log("=".repeat(60))
  console.log()
  console.log(`Seed: ${result.seed}`)
  console.log(`Policy: ${result.policyId}`)
  console.log(`Termination: ${result.terminationReason}`)
  console.log(`Total Ticks: ${result.totalTicks}`)
  console.log(`Max Distance: ${result.maxDistanceReached}`)
  console.log()

  // Show all skill XP
  console.log("Final Skills:")
  if (result.finalSkills.length === 0) {
    console.log(`  Mining: Level ${result.finalLevel}, ${result.finalXp} XP`)
  } else {
    for (const skill of result.finalSkills) {
      console.log(`  ${skill.skill}: Level ${skill.level}, ${skill.totalXp} XP`)
    }
  }
  console.log()

  console.log("Time Breakdown:")
  console.log(
    `  Mining: ${result.ticksSpent.mining} ticks (${((result.ticksSpent.mining / result.totalTicks) * 100).toFixed(1)}%)`
  )
  console.log(
    `  Traveling: ${result.ticksSpent.traveling} ticks (${((result.ticksSpent.traveling / result.totalTicks) * 100).toFixed(1)}%)`
  )
  console.log(
    `  Exploring: ${result.ticksSpent.exploring} ticks (${((result.ticksSpent.exploring / result.totalTicks) * 100).toFixed(1)}%)`
  )
  console.log(`  Inventory: ${result.ticksSpent.inventoryManagement} ticks`)
  console.log(`  Waiting: ${result.ticksSpent.waiting} ticks`)

  // Always show level progression with enhanced info (sorted by skill then level)
  if (result.levelUpTicks.length > 0) {
    const sortedLevelUps = sortLevelUps(result.levelUpTicks)
    console.log()
    console.log("Level Progression:")
    console.log("  Skill       Level  Tick    Actions  Distance  XP")
    console.log("  " + "-".repeat(50))
    for (const lu of sortedLevelUps) {
      const skillName = lu.skill.padEnd(10)
      const level = String(lu.level).padStart(5)
      const tick = String(lu.tick).padStart(6)
      const actions = String(lu.actionCount).padStart(8)
      const distance = String(lu.distance).padStart(8)
      const xp = String(lu.cumulativeXp).padStart(5)
      console.log(`  ${skillName} ${level} ${tick} ${actions} ${distance} ${xp}`)
    }
  }

  if (result.stallSnapshot) {
    console.log()
    console.log("Stall Details:")
    console.log(`  Tick: ${result.stallSnapshot.tick}`)
    console.log(`  Level: ${result.stallSnapshot.level}`)
    console.log(`  Distance: ${result.stallSnapshot.distance}`)
    console.log(`  Known Nodes: ${result.stallSnapshot.knownNodeCount}`)
    console.log(`  Last Action: ${result.stallSnapshot.lastAction.type}`)
  }

  if (logActions && result.actionLog) {
    console.log()
    console.log("=".repeat(60))
    console.log("ACTION LOG")
    console.log("=".repeat(60))
    console.log()
    console.log("Tick\tTicks\tXP\t\tLevels\t\tAction")
    console.log("-".repeat(80))
    for (const record of result.actionLog) {
      const status = record.success ? "" : " [FAILED]"
      const xpStr = formatXpGains(record.xpGained).padEnd(12)
      const levelStr = formatLevels(record).padEnd(12)
      const levelUpStr = formatLevelUps(record)

      let line = `${record.tick}\t${record.ticksConsumed}\t${xpStr}\t${levelStr}\t${formatPolicyAction(record.policyAction)}${status}`
      if (levelUpStr) {
        line += `\n\t\t${levelUpStr}`
      }
      console.log(line)
    }
  }
}

/**
 * Run a single simulation
 */
async function runSingle(args: ReturnType<typeof parseArgs>): Promise<void> {
  const policy = POLICIES[args.policy]
  if (!policy) {
    console.error(`Unknown policy: ${args.policy}`)
    console.error(`Available policies: ${Object.keys(POLICIES).join(", ")}`)
    process.exit(1)
  }

  console.log("=".repeat(60))
  console.log("POLICY RUNNER - Single Run")
  console.log("=".repeat(60))
  console.log()
  console.log(`Seed: ${args.seed}`)
  console.log(`Policy: ${args.policy}`)
  console.log(`Target Level: ${args.targetLevel}`)
  console.log(`Max Ticks: ${args.maxTicks}`)
  console.log()

  const startTime = Date.now()

  // If logging actions, print header and stream each action as it happens
  if (args.logActions) {
    console.log("=".repeat(60))
    console.log("ACTION LOG (streaming)")
    console.log("=".repeat(60))
    console.log()
    console.log("Tick\tTicks\tXP\t\tLevels\t\tAction")
    console.log("-".repeat(80))
  }

  const result = await runSimulation({
    seed: args.seed!,
    policy,
    targetLevel: args.targetLevel,
    maxTicks: args.maxTicks,
    stallWindowSize: args.stallWindowSize,
    recordActions: false, // Don't collect in memory, we stream instead
    onAction: args.logActions
      ? (record) => {
          const status = record.success ? "" : " [FAILED]"
          const xpStr = formatXpGains(record.xpGained).padEnd(12)
          const levelStr = formatLevels(record).padEnd(12)
          const levelUpStr = formatLevelUps(record)

          let line = `${record.tick}\t${record.ticksConsumed}\t${xpStr}\t${levelStr}\t${formatPolicyAction(record.policyAction)}${status}`
          if (levelUpStr) {
            line += `\n\t\t${levelUpStr}`
          }
          console.log(line)
        }
      : undefined,
  })

  const elapsed = Date.now() - startTime

  printResult(result, args.verbose, false) // Don't print action log again
  console.log()
  console.log(`Completed in ${formatDuration(elapsed)}`)
}

/**
 * Run batch simulations
 */
async function runBatchMode(args: ReturnType<typeof parseArgs>): Promise<void> {
  const policies: Policy[] =
    args.policy === "all" ? Object.values(POLICIES) : [POLICIES[args.policy]].filter(Boolean)

  if (policies.length === 0) {
    console.error(`Unknown policy: ${args.policy}`)
    console.error(`Available policies: ${Object.keys(POLICIES).join(", ")}, all`)
    process.exit(1)
  }

  const seedCount = args.seedCount ?? (args.seeds ? undefined : 100)

  console.log("=".repeat(60))
  console.log(`POLICY RUNNER - Batch Mode${args.parallel ? " (Parallel)" : ""}`)
  console.log("=".repeat(60))
  console.log()
  console.log(`Policies: ${policies.map((p) => p.id).join(", ")}`)
  console.log(`Seeds: ${args.seeds ? args.seeds.length : seedCount}`)
  console.log(`Target Level: ${args.targetLevel}`)
  console.log(`Max Ticks: ${args.maxTicks}`)
  if (args.parallel) {
    console.log(`Parallel: yes (max workers: ${args.maxWorkers ?? "auto"})`)
  }
  console.log()

  const startTime = Date.now()

  process.stdout.write("Running simulations")

  const batchRunner = args.parallel ? runBatchParallel : runBatch
  const result = await batchRunner({
    seeds: args.seeds,
    seedCount,
    policies,
    targetLevel: args.targetLevel,
    maxTicks: args.maxTicks,
    stallWindowSize: args.stallWindowSize,
    maxWorkers: args.maxWorkers,
    onProgress: () => process.stdout.write("."),
  })

  const elapsed = Date.now() - startTime

  console.log()
  console.log("=".repeat(60))
  console.log("BATCH RESULTS")
  console.log("=".repeat(60))
  console.log()
  console.log(`Total Runs: ${result.results.length}`)
  console.log(`Completed in ${formatDuration(elapsed)}`)
  console.log()

  for (const policyId of Object.keys(result.aggregates.byPolicy)) {
    const agg = result.aggregates.byPolicy[policyId]
    const policyResults = result.results.filter((r) => r.policyId === policyId)

    console.log(`Policy: ${policyId}`)
    console.log(`  Runs: ${agg.runCount}`)

    console.log(
      `  Ticks to Target (p10/p50/p90): ${agg.ticksToTarget.p10} / ${agg.ticksToTarget.p50} / ${agg.ticksToTarget.p90}`
    )
    console.log(`  Avg XP/Tick: ${agg.avgXpPerTick.toFixed(3)}`)
    console.log(`  Avg Max Distance: ${agg.avgMaxDistance.toFixed(1)}`)

    // Show error counts by type
    const errorEntries = Object.entries(agg.errorCounts)
    if (errorEntries.length > 0) {
      const totalCount = errorEntries.reduce((sum, [_, c]) => sum + c, 0)
      const errorParts = errorEntries.map(([type, count]) => `${type} ${count}`)
      console.log(
        `  Error Rate: ${(totalCount * 100) / result.results.length}% (${errorParts.join(", ")})`
      )
    }

    // Show failed seeds for debugging (group by error type)
    for (const [errorType, _count] of errorEntries) {
      const failedSeeds = policyResults
        .filter((r) => r.terminationReason === errorType)
        .map((r) => r.seed)
      if (failedSeeds.length > 0) {
        console.log(`  ${errorType} seeds: ${failedSeeds.join(", ")}`)
      }
    }

    // Show level progression summary with p10/p50/p90
    const levelAggregates = computeLevelProgressionAggregates(policyResults)
    if (levelAggregates.length > 0) {
      console.log()
      console.log("  Level Progression (p10 / p50 / p90):")
      console.log("  Skill       Level  Count   Tick                Actions             Distance")
      console.log("  " + "-".repeat(80))
      for (const la of levelAggregates) {
        const skillName = la.skill.padEnd(10)
        const level = String(la.level).padStart(5)
        const count = String(la.count).padStart(5)
        const tickStr = `${la.tick.p10} / ${la.tick.p50} / ${la.tick.p90}`.padStart(18)
        const actionsStr = `${la.actions.p10} / ${la.actions.p50} / ${la.actions.p90}`.padStart(18)
        const distStr = `${la.distance.p10} / ${la.distance.p50} / ${la.distance.p90}`.padStart(18)
        console.log(`  ${skillName} ${level} ${count}   ${tickStr}  ${actionsStr}  ${distStr}`)
      }
    }
    console.log()
  }

  // Summary comparison if multiple policies
  if (policies.length > 1) {
    console.log("=".repeat(60))
    console.log("POLICY COMPARISON (by median ticks to target)")
    console.log("=".repeat(60))
    console.log()

    const sorted = Object.entries(result.aggregates.byPolicy)
      .filter(([, agg]) => agg.ticksToTarget.p50 > 0)
      .sort((a, b) => a[1].ticksToTarget.p50 - b[1].ticksToTarget.p50)

    for (let i = 0; i < sorted.length; i++) {
      const [id, agg] = sorted[i]
      const totalErrors = Object.values(agg.errorCounts).reduce((sum, count) => sum + count, 0)
      const errorRate = ((totalErrors / agg.runCount) * 100).toFixed(0)
      console.log(`${i + 1}. ${id}: ${agg.ticksToTarget.p50} ticks (${errorRate}% error rate)`)
    }
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const args = parseArgs()

  if (args.help) {
    printHelp()
    process.exit(0)
  }

  if (args.batch || args.seeds || args.seedCount) {
    await runBatchMode(args)
  } else if (args.seed) {
    await runSingle(args)
  } else {
    console.error("Error: --seed is required for single run, or use --batch for batch mode")
    console.error("Use --help for usage information")
    process.exit(1)
  }
}

// Run only when executed directly (not when imported for testing)
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  main().catch((error) => {
    console.error("Fatal error:", error)
    process.exit(1)
  })
}
