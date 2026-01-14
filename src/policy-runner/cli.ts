#!/usr/bin/env node

/**
 * Policy Runner CLI
 *
 * Run deterministic policy simulations from the command line.
 */

import { runSimulation } from "./runner.js"
import { runBatch } from "./batch.js"
import { safeMiner } from "./policies/safe.js"
import { greedyMiner } from "./policies/greedy.js"
import { balancedMiner } from "./policies/balanced.js"
import type { Policy, PolicyAction, RunResult } from "./types.js"

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
  -v, --verbose           Show detailed progress
  --log-actions           Output full action log (single run only)
  -h, --help              Show this help message

EXAMPLES:
  # Single run with specific seed
  npx tsx src/policy-runner/cli.ts --seed test-1 --policy safe --target-level 3

  # Batch run with 50 random seeds
  npx tsx src/policy-runner/cli.ts --batch --seed-count 50 --policy greedy

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
  console.log(`Final Level: ${result.finalLevel}`)
  console.log(`Final XP: ${result.finalXp}`)
  console.log(`Total Ticks: ${result.totalTicks}`)
  console.log(`Max Distance: ${result.maxDistanceReached}`)
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

  if (verbose && result.levelUpTicks.length > 0) {
    console.log()
    console.log("Level Progression:")
    for (const lu of result.levelUpTicks) {
      console.log(`  Level ${lu.level} at tick ${lu.tick} (${lu.cumulativeXp} total XP)`)
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
    console.log("Tick\tTicks\tXP\tAction")
    console.log("-".repeat(60))
    for (const record of result.actionLog) {
      const status = record.success ? "" : " [FAILED]"
      console.log(
        `${record.tick}\t${record.ticksConsumed}\t${record.xpGained}\t${formatPolicyAction(record.policyAction)}${status}`
      )
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

  const result = await runSimulation({
    seed: args.seed!,
    policy,
    targetLevel: args.targetLevel,
    maxTicks: args.maxTicks,
    stallWindowSize: args.stallWindowSize,
    recordActions: args.logActions,
  })

  const elapsed = Date.now() - startTime

  printResult(result, args.verbose, args.logActions)
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
  console.log("POLICY RUNNER - Batch Mode")
  console.log("=".repeat(60))
  console.log()
  console.log(`Policies: ${policies.map((p) => p.id).join(", ")}`)
  console.log(`Seeds: ${args.seeds ? args.seeds.length : seedCount}`)
  console.log(`Target Level: ${args.targetLevel}`)
  console.log(`Max Ticks: ${args.maxTicks}`)
  console.log()

  const startTime = Date.now()

  console.log("Running simulations...")

  const result = await runBatch({
    seeds: args.seeds,
    seedCount,
    policies,
    targetLevel: args.targetLevel,
    maxTicks: args.maxTicks,
    stallWindowSize: args.stallWindowSize,
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
    console.log(`Policy: ${policyId}`)
    console.log(`  Runs: ${agg.runCount}`)
    console.log(`  Stall Rate: ${(agg.stallRate * 100).toFixed(1)}%`)
    console.log(
      `  Ticks to Target (p10/p50/p90): ${agg.ticksToTarget.p10} / ${agg.ticksToTarget.p50} / ${agg.ticksToTarget.p90}`
    )
    console.log(`  Avg XP/Tick: ${agg.avgXpPerTick.toFixed(3)}`)
    console.log(`  Avg Max Distance: ${agg.avgMaxDistance.toFixed(1)}`)
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
      console.log(
        `${i + 1}. ${id}: ${agg.ticksToTarget.p50} ticks (${(agg.stallRate * 100).toFixed(0)}% stall rate)`
      )
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
