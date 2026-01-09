/**
 * Interactive REPL for manual control of the simulation
 */

import * as readline from "readline"
import { evaluateAction } from "./evaluate.js"
import type { WorldState } from "./types.js"
import {
  runSession,
  formatWorldState,
  formatActionLog,
  printHelp,
  printSummary,
  type SessionStats,
  type MetaCommandResult,
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

  await runSession(seed, {
    getNextCommand: async () => {
      const input = await prompt("\n> ")
      return input.trim() || null
    },

    onSessionStart: (state) => {
      printHelp(state, { showHints: false })
      console.log("")
      console.log(formatWorldState(state))
    },

    onActionComplete: (log, state) => {
      console.log(formatActionLog(log, state))
      console.log(formatWorldState(state))
    },

    onSessionEnd: (state: WorldState, stats: SessionStats, showSummary: boolean) => {
      if (showSummary) {
        if (state.time.sessionRemainingTicks <= 0) {
          console.log("\n⏰ Session time exhausted!")
        }
        printSummary(state, stats)
      }
      rl.close()
    },

    onInvalidCommand: (cmd: string) => {
      if (cmd) {
        console.log("Unknown command. Type 'help' for available actions.")
      }
      return "continue"
    },

    metaCommands: {
      help: (state: WorldState): MetaCommandResult => {
        printHelp(state)
        return "continue"
      },
      h: (state: WorldState): MetaCommandResult => {
        printHelp(state)
        return "continue"
      },
      "?": (state: WorldState): MetaCommandResult => {
        printHelp(state)
        return "continue"
      },
      state: (state: WorldState): MetaCommandResult => {
        console.log(formatWorldState(state))
        return "continue"
      },
      s: (state: WorldState): MetaCommandResult => {
        console.log(formatWorldState(state))
        return "continue"
      },
      world: (state: WorldState): MetaCommandResult => {
        console.log(formatWorldState(state))
        return "continue"
      },
      w: (state: WorldState): MetaCommandResult => {
        console.log(formatWorldState(state))
        return "continue"
      },
      end: (): MetaCommandResult => "end",
      summary: (): MetaCommandResult => "end",
      quit: (): MetaCommandResult => "quit",
      exit: (): MetaCommandResult => "quit",
      q: (): MetaCommandResult => "quit",
    },

    beforeAction: (action, state) => {
      const eval_ = evaluateAction(state, action)
      if (eval_.successProbability === 0) {
        console.log("⚠ This action will fail (preconditions not met)")
      } else if (eval_.successProbability < 1) {
        console.log(`⚠ Success chance: ${(eval_.successProbability * 100).toFixed(0)}%`)
      }
    },
  })
}

async function start(): Promise<void> {
  await main()
}

start().catch(console.error)
