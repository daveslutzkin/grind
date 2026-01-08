/**
 * Batch runner for executing a plan from command line arguments
 * Shows last action result, final state, and session summary
 */

import { createWorld } from "./world.js"
import { executeAction } from "./engine.js"
import {
  parseAction,
  formatWorldState,
  formatActionLog,
  printSummary,
  createSession,
  executeAndRecord,
} from "./runner.js"

function main(): void {
  const args = process.argv.slice(2)
  if (args.length < 1) {
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
    process.exit(1)
  }

  const seed = args[0]
  const commands = args.slice(1)

  const session = createSession({ seed, createWorld })
  let lastLog = null

  for (const cmd of commands) {
    if (session.state.time.sessionRemainingTicks <= 0) {
      console.error("Session time exhausted!")
      break
    }
    const action = parseAction(cmd, {
      knownAreaIds: session.state.exploration.playerState.knownAreaIds,
    })
    if (!action) {
      console.error(`Invalid command: ${cmd}`)
      process.exit(1)
    }
    lastLog = executeAndRecord(session, action, executeAction)
  }

  // Output: last action result (if any), then current state
  if (lastLog) {
    console.log(formatActionLog(lastLog, session.state))
    console.log("")
  }

  console.log(formatWorldState(session.state))

  // Show session summary
  printSummary(session.state, session.stats)
}

main()
