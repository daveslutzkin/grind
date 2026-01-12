#!/usr/bin/env node

import "dotenv/config"
import { createAgentLoop } from "./loop.js"
import { createTraceWriter } from "./output.js"
import { formatWorldState, formatActionLog } from "./formatters.js"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

/**
 * Parse command line arguments
 */
function parseArgs(): {
  seed: string
  ticks: number
  objective: string
  model: string | undefined
  verbose: boolean
  help: boolean
} {
  const args = process.argv.slice(2)

  let seed = ""
  let ticks = 25
  let objective = "explore the game and have fun"
  let model: string | undefined = undefined
  let verbose = false
  let help = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]

    if (arg === "--help" || arg === "-h") {
      help = true
    } else if (arg === "--ticks" || arg === "-t") {
      ticks = parseInt(args[++i], 10)
    } else if (arg === "--objective" || arg === "-o") {
      objective = args[++i]
    } else if (arg === "--model" || arg === "-m") {
      model = args[++i]
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true
    } else if (!arg.startsWith("-") && !seed) {
      seed = arg
    }
  }

  return { seed, ticks, objective, model, verbose, help }
}

/**
 * Print usage information
 */
function printHelp(): void {
  console.log(`
LLM Agent Runner - Play the game simulation with an AI agent

USAGE:
  npm run agent <seed> [options]

ARGUMENTS:
  seed                  Required. RNG seed for reproducibility.

OPTIONS:
  -t, --ticks <n>       Session length in ticks (default: 25)
  -o, --objective <s>   Goal for the agent (default: "explore the game and have fun")
  -m, --model <s>       LLM model to use (default: gpt-4o-mini)
  -v, --verbose         Show detailed output during run
  -h, --help            Show this help message

EXAMPLES:
  npm run agent test-seed-1
  npm run agent test-seed-1 --ticks 50 --verbose
  npm run agent explore-run --objective "maximize mining XP"

OUTPUT:
  Traces are written to traces/<rules-version>/<seed>/
    trace.txt       Detailed play log with reasoning
`)
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

  if (!args.seed) {
    console.error("Error: seed is required")
    console.error("Use --help for usage information")
    process.exit(1)
  }

  console.log("=".repeat(60))
  console.log("LLM AGENT RUNNER")
  console.log("=".repeat(60))
  console.log()
  console.log(`Seed: ${args.seed}`)
  console.log(`Ticks: ${args.ticks}`)
  console.log(`Objective: ${args.objective}`)
  console.log(`Model: ${args.model ?? "gpt-4o-mini (default)"}`)
  console.log(`Verbose: ${args.verbose}`)
  console.log()

  // Create agent loop
  const loop = createAgentLoop({
    seed: args.seed,
    ticks: args.ticks,
    objective: args.objective,
    verbose: args.verbose,
    model: args.model,
  })

  // Create trace writer
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const tracesDir = resolve(__dirname, "../../traces")
  const writer = createTraceWriter({
    baseDir: tracesDir,
    seed: args.seed,
    ticks: args.ticks,
    objective: args.objective,
  })

  // Write header
  writer.writeHeader()

  console.log("Starting agent session...")
  console.log()

  // Main loop
  while (!loop.isComplete()) {
    const state = loop.getWorldState()

    if (!args.verbose) {
      process.stdout.write(
        `\r[Tick ${state.time.currentTick}/${args.ticks}] Actions: ${loop.getStats().actionsAttempted}`
      )
    }

    try {
      const result = await loop.step()

      if (result.error) {
        console.error(`\nError: ${result.error}`)
        // Continue - agent will try again
      }

      // Write trace entry
      writer.writeEntry({
        tick: state.time.currentTick,
        state: formatWorldState(state),
        reasoning: result.reasoning,
        action: result.action
          ? `${result.action.type} ${JSON.stringify(result.action)}`
          : "(no action)",
        result: result.log ? formatActionLog(result.log, state) : "(no result)",
        learning: result.learning,
      })

      // Write verbose trace entry with full LLM context
      if (result.contextSnapshot) {
        writer.writeVerboseEntry(
          state.time.currentTick,
          {
            systemPrompt: result.contextSnapshot.systemPrompt,
            notes: result.contextSnapshot.notes,
            actionSummary: result.contextSnapshot.actionSummary,
            learningSummary: result.contextSnapshot.learningSummary,
            recentMessages: result.contextSnapshot.recentMessages,
            currentPrompt: result.currentPrompt ?? "",
          },
          result.llmResponse ?? ""
        )
      }

      if (result.done) {
        break
      }
    } catch (error) {
      console.error(`\nFatal error: ${error}`)
      break
    }
  }

  console.log("\n")
  console.log("Session complete!")
  console.log()

  // Get final stats
  const stats = loop.getStats()

  // Write summary
  writer.writeSummary(stats)

  // Print summary
  console.log("=".repeat(60))
  console.log("SESSION SUMMARY")
  console.log("=".repeat(60))
  console.log()
  console.log(`Time: ${stats.ticksUsed}/${stats.totalTicks} ticks used`)
  console.log(
    `Actions: ${stats.actionsAttempted} attempted, ${stats.actionsSucceeded} succeeded, ${stats.actionsFailed} failed`
  )

  console.log()
  console.log("XP Gained:")
  for (const [skill, xp] of Object.entries(stats.xpGained)) {
    if (xp > 0) {
      console.log(`  ${skill}: ${xp}`)
    }
  }

  console.log()
  console.log("Items Collected:")
  for (const [item, count] of Object.entries(stats.itemsCollected)) {
    if (count > 0) {
      console.log(`  ${item}: ${count}`)
    }
  }

  console.log()
  console.log(`Learnings recorded: ${stats.learningsCount}`)
  console.log()
  console.log(`Output written to: ${writer.getOutputDir()}`)
}

// Run
main().catch((error) => {
  console.error("Fatal error:", error)
  process.exit(1)
})
