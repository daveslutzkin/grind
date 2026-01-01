/**
 * Interactive REPL for manual control of the simulation
 */

import * as readline from "readline"
import { createToyWorld } from "./world.js"
import { executeAction } from "./engine.js"
import { evaluateAction } from "./evaluate.js"
import type { Action, ActionLog, WorldState } from "./types.js"

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve)
  })
}

function printState(state: WorldState): void {
  console.log("\n┌─────────────────────────────────────────────────────────────┐")
  console.log("│ WORLD STATE                                                 │")
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log(`│ Location: ${state.player.location.padEnd(49)}│`)
  console.log(`│ Time: ${state.time.currentTick} / ${state.time.currentTick + state.time.sessionRemainingTicks} ticks (${state.time.sessionRemainingTicks} remaining)`.padEnd(62) + "│")
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ INVENTORY" + " ".repeat(51) + "│")
  if (state.player.inventory.length === 0) {
    console.log("│   (empty)".padEnd(62) + "│")
  } else {
    for (const item of state.player.inventory) {
      console.log(`│   ${item.quantity}x ${item.itemId}`.padEnd(62) + "│")
    }
  }
  console.log(`│   [${state.player.inventory.length}/${state.player.inventoryCapacity} slots]`.padEnd(62) + "│")
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ STORAGE" + " ".repeat(53) + "│")
  if (state.player.storage.length === 0) {
    console.log("│   (empty)".padEnd(62) + "│")
  } else {
    for (const item of state.player.storage) {
      console.log(`│   ${item.quantity}x ${item.itemId}`.padEnd(62) + "│")
    }
  }
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ SKILLS" + " ".repeat(54) + "│")
  console.log(`│   Mining: ${state.player.skills.Mining}  Woodcutting: ${state.player.skills.Woodcutting}  Combat: ${state.player.skills.Combat}`.padEnd(62) + "│")
  console.log(`│   Smithing: ${state.player.skills.Smithing}  Logistics: ${state.player.skills.Logistics}`.padEnd(62) + "│")
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log(`│ Reputation: ${state.player.guildReputation}`.padEnd(62) + "│")
  console.log(`│ Active Contracts: ${state.player.activeContracts.join(", ") || "(none)"}`.padEnd(62) + "│")
  console.log("└─────────────────────────────────────────────────────────────┘")
}

function printLog(log: ActionLog): void {
  console.log("\n┌─────────────────────────────────────────────────────────────┐")
  console.log(`│ ACTION: ${log.actionType}`.padEnd(62) + "│")
  console.log("├─────────────────────────────────────────────────────────────┤")
  const status = log.success ? "✓ SUCCESS" : "✗ FAILED"
  console.log(`│ ${status}`.padEnd(62) + "│")
  console.log(`│ ${log.stateDeltaSummary}`.padEnd(62) + "│")
  if (log.failureType) {
    console.log(`│ Reason: ${log.failureType}`.padEnd(62) + "│")
  }
  console.log(`│ Time consumed: ${log.timeConsumed} ticks`.padEnd(62) + "│")
  if (log.skillGained) {
    console.log(`│ Skill: +${log.skillGained.amount} ${log.skillGained.skill}`.padEnd(62) + "│")
  }
  if (log.rngRolls.length > 0) {
    for (const roll of log.rngRolls) {
      const result = roll.result ? "SUCCESS" : "FAIL"
      console.log(`│ RNG: ${(roll.probability * 100).toFixed(0)}% chance → ${result}`.padEnd(62) + "│")
    }
  }
  if (log.contractsCompleted) {
    for (const c of log.contractsCompleted) {
      console.log("├─────────────────────────────────────────────────────────────┤")
      console.log(`│ CONTRACT COMPLETE: ${c.contractId}`.padEnd(62) + "│")
      console.log(`│   Consumed: ${c.itemsConsumed.map((i) => `${i.quantity}x ${i.itemId}`).join(", ")}`.padEnd(62) + "│")
      console.log(`│   Granted: ${c.rewardsGranted.map((i) => `${i.quantity}x ${i.itemId}`).join(", ")}`.padEnd(62) + "│")
      console.log(`│   Reputation: +${c.reputationGained}`.padEnd(62) + "│")
    }
  }
  console.log("└─────────────────────────────────────────────────────────────┘")
}

function printHelp(state: WorldState): void {
  console.log("\n┌─────────────────────────────────────────────────────────────┐")
  console.log("│ AVAILABLE ACTIONS                                           │")
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ move <location>     - Move to TOWN, MINE, or FOREST         │")
  console.log("│ gather <node>       - Gather from iron-node or wood-node    │")
  console.log("│ fight <enemy>       - Fight cave-rat                        │")
  console.log("│ craft <recipe>      - Craft iron-bar-recipe                 │")
  console.log("│ store <item> <qty>  - Store items (e.g., store IRON_ORE 2)  │")
  console.log("│ drop <item> <qty>   - Drop items (e.g., drop IRON_ORE 1)    │")
  console.log("│ accept <contract>   - Accept miners-guild-1                 │")
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ state               - Show current world state              │")
  console.log("│ world               - Show world data (nodes, enemies, etc) │")
  console.log("│ help                - Show this help                        │")
  console.log("│ quit                - Exit                                  │")
  console.log("└─────────────────────────────────────────────────────────────┘")

  // Show what's available at current location
  console.log(`\nAt ${state.player.location}:`)
  const nodes = state.world.resourceNodes.filter((n) => n.location === state.player.location)
  const enemies = state.world.enemies.filter((e) => e.location === state.player.location)
  const recipes = state.world.recipes.filter((r) => r.requiredLocation === state.player.location)
  const contracts = state.world.contracts.filter((c) => c.guildLocation === state.player.location)

  if (nodes.length > 0) console.log(`  Nodes: ${nodes.map((n) => n.id).join(", ")}`)
  if (enemies.length > 0) console.log(`  Enemies: ${enemies.map((e) => e.id).join(", ")}`)
  if (recipes.length > 0) console.log(`  Recipes: ${recipes.map((r) => r.id).join(", ")}`)
  if (contracts.length > 0) console.log(`  Contracts: ${contracts.map((c) => c.id).join(", ")}`)
  if (state.player.location === state.world.storageLocation) console.log(`  Storage available`)
}

function printWorld(state: WorldState): void {
  console.log("\n┌─────────────────────────────────────────────────────────────┐")
  console.log("│ WORLD DATA                                                  │")
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ LOCATIONS: TOWN, MINE, FOREST                               │")
  console.log("│ Travel costs: TOWN↔MINE: 2, TOWN↔FOREST: 3, MINE↔FOREST: 4  │")
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ RESOURCE NODES                                              │")
  for (const node of state.world.resourceNodes) {
    console.log(`│   ${node.id} @ ${node.location}`.padEnd(62) + "│")
    console.log(`│     → ${node.itemId}, ${node.gatherTime} ticks, ${(node.successProbability * 100).toFixed(0)}% success`.padEnd(62) + "│")
  }
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ ENEMIES                                                     │")
  for (const enemy of state.world.enemies) {
    console.log(`│   ${enemy.id} @ ${enemy.location}`.padEnd(62) + "│")
    console.log(`│     → ${enemy.fightTime} ticks, ${(enemy.successProbability * 100).toFixed(0)}% success, loot: ${enemy.loot.map((l) => `${l.quantity}x ${l.itemId}`).join(", ")}`.padEnd(62) + "│")
  }
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ RECIPES                                                     │")
  for (const recipe of state.world.recipes) {
    console.log(`│   ${recipe.id} @ ${recipe.requiredLocation}`.padEnd(62) + "│")
    console.log(`│     → ${recipe.inputs.map((i) => `${i.quantity}x ${i.itemId}`).join(" + ")} = ${recipe.output.quantity}x ${recipe.output.itemId}`.padEnd(62) + "│")
  }
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ CONTRACTS                                                   │")
  for (const contract of state.world.contracts) {
    console.log(`│   ${contract.id} @ ${contract.guildLocation}`.padEnd(62) + "│")
    console.log(`│     Requires: ${contract.requirements.map((r) => `${r.quantity}x ${r.itemId}`).join(", ")}`.padEnd(62) + "│")
    console.log(`│     Rewards: ${contract.rewards.map((r) => `${r.quantity}x ${r.itemId}`).join(", ")} + ${contract.reputationReward} rep`.padEnd(62) + "│")
  }
  console.log("└─────────────────────────────────────────────────────────────┘")
}

function parseAction(input: string, state: WorldState): Action | null {
  const parts = input.trim().toLowerCase().split(/\s+/)
  const cmd = parts[0]

  switch (cmd) {
    case "move":
      const dest = parts[1]?.toUpperCase()
      if (!dest || !["TOWN", "MINE", "FOREST"].includes(dest)) {
        console.log("Usage: move <TOWN|MINE|FOREST>")
        return null
      }
      return { type: "Move", destination: dest as "TOWN" | "MINE" | "FOREST" }

    case "gather":
      const nodeId = parts[1]
      if (!nodeId) {
        console.log("Usage: gather <node-id>")
        return null
      }
      return { type: "Gather", nodeId }

    case "fight":
      const enemyId = parts[1]
      if (!enemyId) {
        console.log("Usage: fight <enemy-id>")
        return null
      }
      return { type: "Fight", enemyId }

    case "craft":
      const recipeId = parts[1]
      if (!recipeId) {
        console.log("Usage: craft <recipe-id>")
        return null
      }
      return { type: "Craft", recipeId }

    case "store":
      const storeItem = parts[1]?.toUpperCase()
      const storeQty = parseInt(parts[2] || "1", 10)
      if (!storeItem) {
        console.log("Usage: store <item-id> [quantity]")
        return null
      }
      return { type: "Store", itemId: storeItem as "IRON_ORE" | "WOOD_LOG" | "IRON_BAR", quantity: storeQty }

    case "drop":
      const dropItem = parts[1]?.toUpperCase()
      const dropQty = parseInt(parts[2] || "1", 10)
      if (!dropItem) {
        console.log("Usage: drop <item-id> [quantity]")
        return null
      }
      return { type: "Drop", itemId: dropItem as "IRON_ORE" | "WOOD_LOG" | "IRON_BAR", quantity: dropQty }

    case "accept":
      const contractId = parts[1]
      if (!contractId) {
        console.log("Usage: accept <contract-id>")
        return null
      }
      return { type: "AcceptContract", contractId }

    default:
      return null
  }
}

async function main(): Promise<void> {
  console.log("╔═════════════════════════════════════════════════════════════╗")
  console.log("║           GRIND - Interactive Simulation REPL               ║")
  console.log("╚═════════════════════════════════════════════════════════════╝")

  const seed = process.argv[2] || `session-${Date.now()}`
  console.log(`\nSeed: ${seed}`)

  const state = createToyWorld(seed)

  printState(state)
  printHelp(state)

  while (state.time.sessionRemainingTicks > 0) {
    const input = await prompt("\n> ")
    const trimmed = input.trim().toLowerCase()

    if (trimmed === "quit" || trimmed === "exit" || trimmed === "q") {
      break
    }

    if (trimmed === "help" || trimmed === "h" || trimmed === "?") {
      printHelp(state)
      continue
    }

    if (trimmed === "state" || trimmed === "s") {
      printState(state)
      continue
    }

    if (trimmed === "world" || trimmed === "w") {
      printWorld(state)
      continue
    }

    const action = parseAction(input, state)
    if (!action) {
      if (trimmed !== "") {
        console.log("Unknown command. Type 'help' for available actions.")
      }
      continue
    }

    // Show expected outcome before executing
    const eval_ = evaluateAction(state, action)
    if (eval_.successProbability === 0) {
      console.log("⚠ This action will fail (preconditions not met)")
    } else if (eval_.successProbability < 1) {
      console.log(`⚠ Success chance: ${(eval_.successProbability * 100).toFixed(0)}%`)
    }

    const log = executeAction(state, action)
    printLog(log)
    printState(state)
  }

  console.log("\n╔═════════════════════════════════════════════════════════════╗")
  console.log("║                    SESSION ENDED                            ║")
  console.log("╚═════════════════════════════════════════════════════════════╝")
  printState(state)

  rl.close()
}

main().catch(console.error)
