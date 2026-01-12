/**
 * Interactive REPL for manual control of the simulation
 */

import "dotenv/config"
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
import { initLLMCache, saveLLMCache } from "./llmCache.js"

function printUsage(): void {
  console.log("Usage: npx tsx src/repl.ts [--llm-cache <file>] [seed]")
  console.log("")
  console.log("Options:")
  console.log("  --llm-cache <file>  Cache LLM responses for deterministic replays")
  console.log("  seed                Random seed (default: session-<timestamp>)")
}

async function main(): Promise<void> {
  console.log("╔═════════════════════════════════════════════════════════════╗")
  console.log("║           GRIND - Interactive Simulation REPL               ║")
  console.log("╚═════════════════════════════════════════════════════════════╝")

  // Parse arguments
  const args = process.argv.slice(2)
  let llmCacheFile: string | null = null
  let seed: string | null = null

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--llm-cache") {
      if (i + 1 >= args.length) {
        printUsage()
        process.exit(1)
      }
      llmCacheFile = args[++i]
    } else if (args[i] === "--help" || args[i] === "-h") {
      printUsage()
      process.exit(0)
    } else if (!seed) {
      seed = args[i]
    }
  }

  seed = seed || `session-${Date.now()}`

  // Initialize LLM cache if specified
  if (llmCacheFile) {
    initLLMCache(llmCacheFile)
  }

  const hasApiKey = !!process.env.ANTHROPIC_API_KEY
  console.log(`\nSeed: ${seed}`)
  if (hasApiKey) {
    console.log("🌍 Area naming enabled (ANTHROPIC_API_KEY detected)")
  }
  if (llmCacheFile) {
    console.log(`📦 LLM cache: ${llmCacheFile}`)
  }

  await initInput()

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
      // Only show world state if the action succeeded
      if (log.success) {
        console.log("")
        console.log(formatWorldState(state))
      }
    },

    onSessionEnd: (state: WorldState, stats: SessionStats, showSummary: boolean) => {
      if (showSummary) {
        printSummary(state, stats)
      }
      closeInput()
      // Save LLM cache if enabled
      if (llmCacheFile) {
        saveLLMCache()
      }
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
