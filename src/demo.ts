/**
 * Demo script showing a complete session with the simulation engine
 */

import { createToyWorld } from "./world.js"
import { executeAction } from "./engine.js"
import { evaluatePlan } from "./evaluate.js"
import type { Action, ActionLog } from "./types.js"

function printLog(log: ActionLog): void {
  const status = log.success ? "✓" : "✗"
  console.log(`  ${status} ${log.actionType}: ${log.stateDeltaSummary}`)
  if (log.skillGained) {
    console.log(`    +1 ${log.skillGained.skill}`)
  }
  if (log.contractsCompleted) {
    for (const c of log.contractsCompleted) {
      console.log(`    CONTRACT COMPLETE: ${c.contractId}`)
      console.log(`      Consumed: ${c.itemsConsumed.map((i) => `${i.quantity}x ${i.itemId}`).join(", ")}`)
      console.log(`      Granted: ${c.rewardsGranted.map((i) => `${i.quantity}x ${i.itemId}`).join(", ")}`)
      console.log(`      Reputation: +${c.reputationGained}`)
    }
  }
  if (log.failureType) {
    console.log(`    Failure: ${log.failureType}`)
  }
  console.log(`    Time: ${log.timeConsumed} ticks`)
}

function printState(state: ReturnType<typeof createToyWorld>): void {
  console.log(`\nState:`)
  console.log(`  Location: ${state.player.location}`)
  console.log(`  Time: ${state.time.currentTick}/${state.time.currentTick + state.time.sessionRemainingTicks} ticks`)
  console.log(`  Inventory: ${state.player.inventory.map((i) => `${i.quantity}x ${i.itemId}`).join(", ") || "(empty)"}`)
  console.log(`  Storage: ${state.player.storage.map((i) => `${i.quantity}x ${i.itemId}`).join(", ") || "(empty)"}`)
  console.log(`  Skills: Mining=${state.player.skills.Mining} Woodcutting=${state.player.skills.Woodcutting} Combat=${state.player.skills.Combat} Smithing=${state.player.skills.Smithing} Logistics=${state.player.skills.Logistics}`)
  console.log(`  Reputation: ${state.player.guildReputation}`)
  console.log(`  Active Contracts: ${state.player.activeContracts.join(", ") || "(none)"}`)
}

// Create world
console.log("=== GRIND Simulation Demo ===\n")
const state = createToyWorld("demo-seed-123")
printState(state)

// Define a plan
const plan: Action[] = [
  { type: "AcceptContract", contractId: "miners-guild-1" },
  { type: "Move", destination: "MINE" },
  { type: "Gather", nodeId: "iron-node" },
  { type: "Gather", nodeId: "iron-node" },
  { type: "Gather", nodeId: "iron-node" },
  { type: "Gather", nodeId: "iron-node" },
  { type: "Move", destination: "TOWN" },
  { type: "Craft", recipeId: "iron-bar-recipe" },
  { type: "Craft", recipeId: "iron-bar-recipe" },
]

// Evaluate plan first
console.log("\n=== Plan Evaluation ===")
const evaluation = evaluatePlan(state, plan)
console.log(`Expected time: ${evaluation.expectedTime} ticks`)
console.log(`Expected XP: ${evaluation.expectedXP.toFixed(1)}`)
console.log(`Violations: ${evaluation.violations.length === 0 ? "none" : evaluation.violations.map((v) => `step ${v.actionIndex}: ${v.reason}`).join(", ")}`)

// Execute plan
console.log("\n=== Executing Plan ===")
for (const action of plan) {
  if (state.time.sessionRemainingTicks <= 0) {
    console.log("\n  SESSION ENDED - no time remaining")
    break
  }
  const log = executeAction(state, action)
  printLog(log)
}

printState(state)

console.log("\n=== Session Complete ===")
