/**
 * Batch runner for executing a plan from command line arguments
 */

import { createWorld } from "./world.js"
import { executeAction } from "./engine.js"
import {
  parseAction,
  printState,
  printLog,
  printSummary,
  createSession,
  executeAndRecord,
} from "./runner.js"

function main(): void {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.log("Usage: node dist/batch.js <seed> <command1> <command2> ...")
    console.log(
      "Example: node dist/batch.js test-seed 'move mine' 'gather iron-node' 'gather iron-node'"
    )
    process.exit(1)
  }

  const seed = args[0]
  const commands = args.slice(1)

  console.log(`=== Plan Execution (seed: ${seed}) ===\n`)

  const session = createSession({ seed, createWorld })

  printState(session.state)
  console.log("")

  for (const cmd of commands) {
    if (session.state.time.sessionRemainingTicks <= 0) {
      console.log("  ⏰ Session time exhausted!")
      break
    }
    const action = parseAction(cmd, {
      knownAreaIds: session.state.exploration.playerState.knownAreaIds,
    })
    if (!action) {
      console.log(`  ⚠ Invalid command: ${cmd}`)
      continue
    }
    const log = executeAndRecord(session, action, executeAction)
    printLog(log, { boxed: false })
  }

  printSummary(session.state, session.stats)
}

main()
