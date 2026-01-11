/**
 * Interactive REPL for manual control of the simulation
 */

import "dotenv/config"
import { evaluateAction } from "./evaluate.js"
import type { WorldState } from "./types.js"
import {
  runSession,
  formatWorldState,
  formatActionLog,
  printHelp,
  printSummary,
  printMap,
  type SessionStats,
  type MetaCommandResult,
} from "./runner.js"
import { initInput, closeInput, promptLine } from "./prompt.js"

async function main(): Promise<void> {
  console.log("╔═════════════════════════════════════════════════════════════╗")
  console.log("║           GRIND - Interactive Simulation REPL               ║")
  console.log("╚═════════════════════════════════════════════════════════════╝")

  const seed = process.argv[2] || `session-${Date.now()}`
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY
  console.log(`\nSeed: ${seed}`)
  if (hasApiKey) {
    console.log("🌍 Area naming enabled (ANTHROPIC_API_KEY detected)")
  }

  initInput()

  await runSession(seed, {
    getNextCommand: async () => {
      const input = await promptLine("\n> ")
      return input.trim() || null
    },

    onSessionStart: (state) => {
      printHelp(state, { showHints: false })
      console.log("")
      console.log(formatWorldState(state))
    },

    onActionComplete: (log, state) => {
      console.log("")
      console.log(formatActionLog(log, state))
      console.log("")
      console.log(formatWorldState(state))
    },

    onSessionEnd: (state: WorldState, stats: SessionStats, showSummary: boolean) => {
      if (showSummary) {
        printSummary(state, stats)
      }
      closeInput()
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
      map: (state: WorldState): MetaCommandResult => {
        printMap(state)
        return "continue"
      },
      m: (state: WorldState): MetaCommandResult => {
        printMap(state)
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
      if (eval_.successProbability > 0 && eval_.successProbability < 1) {
        console.log(`⚠ Success chance: ${(eval_.successProbability * 100).toFixed(0)}%`)
      }
    },

    onBeforeInteractive: () => {
      // Close the readline to fully detach from stdin for interactive mode
      closeInput()
    },

    onAfterInteractive: () => {
      // Recreate the readline after interactive mode
      initInput()
    },
  })
}

async function start(): Promise<void> {
  await main()
}

start().catch(console.error)
