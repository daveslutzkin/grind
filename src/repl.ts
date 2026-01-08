/**
 * Interactive REPL for manual control of the simulation
 */

import * as readline from "readline"
import { createWorld } from "./world.js"
import { executeAction } from "./engine.js"
import { evaluateAction } from "./evaluate.js"
import {
  parseAction,
  formatWorldState,
  formatActionLog,
  printHelp,
  printSummary,
  createSession,
  executeAndRecord,
} from "./runner.js"

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve)
  })
}

async function main(): Promise<void> {
  console.log("╔═════════════════════════════════════════════════════════════╗")
  console.log("║           GRIND - Interactive Simulation REPL               ║")
  console.log("╚═════════════════════════════════════════════════════════════╝")

  const seed = process.argv[2] || `session-${Date.now()}`
  console.log(`\nSeed: ${seed}`)

  const session = createSession({ seed, createWorld })

  console.log(formatWorldState(session.state))
  printHelp(session.state)

  let showSummary = true

  while (session.state.time.sessionRemainingTicks > 0) {
    const input = await prompt("\n> ")
    const trimmed = input.trim().toLowerCase()

    if (trimmed === "quit" || trimmed === "exit" || trimmed === "q") {
      showSummary = false
      break
    }

    if (trimmed === "end" || trimmed === "summary") {
      break
    }

    if (trimmed === "help" || trimmed === "h" || trimmed === "?") {
      printHelp(session.state)
      continue
    }

    if (trimmed === "state" || trimmed === "s") {
      console.log(formatWorldState(session.state))
      continue
    }

    if (trimmed === "world" || trimmed === "w") {
      // Show full world state (same as state now)
      console.log(formatWorldState(session.state))
      continue
    }

    const action = parseAction(input, {
      knownAreaIds: session.state.exploration.playerState.knownAreaIds,
      logErrors: true,
    })
    if (!action) {
      if (trimmed !== "") {
        console.log("Unknown command. Type 'help' for available actions.")
      }
      continue
    }

    // Show expected outcome before executing
    const eval_ = evaluateAction(session.state, action)
    if (eval_.successProbability === 0) {
      console.log("⚠ This action will fail (preconditions not met)")
    } else if (eval_.successProbability < 1) {
      console.log(`⚠ Success chance: ${(eval_.successProbability * 100).toFixed(0)}%`)
    }

    const log = executeAndRecord(session, action, executeAction)
    console.log(formatActionLog(log, session.state))
    console.log(formatWorldState(session.state))
  }

  if (showSummary) {
    if (session.state.time.sessionRemainingTicks <= 0) {
      console.log("\n⏰ Session time exhausted!")
    }
    printSummary(session.state, session.stats)
  }

  rl.close()
}

main().catch(console.error)
