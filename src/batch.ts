/**
 * Batch runner for executing a plan from command line arguments
 * Shows last action result, final state, and session summary
 */

import type { ActionLog, WorldState } from "./types.js"
import {
  runSession,
  formatWorldState,
  formatActionLog,
  printSummary,
  type SessionStats,
} from "./runner.js"

function printUsage(): void {
  console.log("Usage: npx tsx src/batch.ts <seed> [command1] [command2] ...")
  console.log("")
  console.log("Commands:")
  console.log("  enrol <skill>              - Enrol in guild (exploration, mining, etc)")
  console.log("  survey                     - Discover new areas (connections)")
  console.log("  move <area>                - Travel to a known area")
  console.log("  explore                    - Discover nodes in current area")
  console.log("  gather <node> focus <mat>  - Focus on one material")
  console.log("  gather <node> careful      - Carefully extract all")
  console.log("  gather <node> appraise     - Inspect node contents")
  console.log("  fight <enemy>              - Fight an enemy")
  console.log("  craft <recipe>             - Craft at TOWN")
  console.log("  store <item> [qty]         - Store items at TOWN")
  console.log("  drop <item> [qty]          - Drop items")
  console.log("  accept <contract>          - Accept a contract")
  console.log("")
  console.log("Start by enrolling in Exploration to discover areas")
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  if (args.length < 1) {
    printUsage()
    process.exit(1)
  }

  const seed = args[0]
  const commands = args.slice(1)
  let cmdIndex = 0
  let lastLog: ActionLog | null = null

  await runSession(seed, {
    getNextCommand: async () => commands[cmdIndex++] ?? null,

    onActionComplete: (log) => {
      lastLog = log
    },

    onSessionEnd: (state: WorldState, stats: SessionStats) => {
      // Output: last action result (if any), then current state
      if (lastLog) {
        console.log(formatActionLog(lastLog, state))
        console.log("")
      }
      console.log(formatWorldState(state))
      printSummary(state, stats)
    },

    onInvalidCommand: (cmd: string) => {
      console.error(`Invalid command: ${cmd}`)
      process.exit(1)
    },
  })
}

main()
