/**
 * Interactive REPL for manual control of the simulation
 */

import * as readline from "readline"
import { createWorld } from "./world.js"
import { executeAction } from "./engine.js"
import { evaluateAction } from "./evaluate.js"
import type { Action, ActionLog, WorldState, SkillID, SkillState } from "./types.js"
import { getTotalXP } from "./types.js"

// Session tracking
interface SessionStats {
  logs: ActionLog[]
  startingSkills: Record<SkillID, SkillState>
  totalSession: number
}

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
  const W = 120
  const line = "─".repeat(W - 2)
  const pad = (s: string) => s.padEnd(W - 2) + "│"

  const invStr =
    state.player.inventory.length === 0
      ? "(empty)"
      : state.player.inventory.map((i) => `${i.quantity}x ${i.itemId}`).join(", ")
  const storStr =
    state.player.storage.length === 0
      ? "(empty)"
      : state.player.storage.map((i) => `${i.quantity}x ${i.itemId}`).join(", ")
  const skills = `Mining:${state.player.skills.Mining.level} Woodcut:${state.player.skills.Woodcutting.level} Combat:${state.player.skills.Combat.level} Smith:${state.player.skills.Smithing.level}`
  const contracts = state.player.activeContracts.join(", ") || "(none)"

  console.log(`\n┌${line}┐`)
  console.log(
    `│${pad(` 📍 ${state.exploration.playerState.currentAreaId}  │  ⏱ ${state.time.sessionRemainingTicks} ticks left  │  ⭐ Rep: ${state.player.guildReputation}  │  📜 Contracts: ${contracts}`)}`
  )
  console.log(`├${line}┤`)
  console.log(
    `│${pad(` 🎒 Inventory [${state.player.inventory.length}/${state.player.inventoryCapacity}]: ${invStr}`)}`
  )
  console.log(`│${pad(` 📦 Storage: ${storStr}`)}`)
  console.log(`│${pad(` 📊 Skills: ${skills}`)}`)
  console.log(`└${line}┘`)
}

function formatLootSection(log: ActionLog): string {
  // Only show loot section for successful Fight actions
  if (log.actionType !== "Fight" || !log.success) return ""

  // Find loot table rolls (labels start with "loot:")
  const lootRolls = log.rngRolls.filter((r) => r.label.startsWith("loot:"))
  if (lootRolls.length === 0) return ""

  // Format each loot entry - bracket the one that dropped
  const lootParts = lootRolls.map((roll) => {
    const itemName = roll.label.replace("loot:", "").replace("IRON_", "").replace("_", " ")
    const shortName = itemName === "ORE" ? "ORE" : itemName.split(" ")[0]
    const pct = (roll.probability * 100).toFixed(0)
    const label = `${shortName}(${pct}%)`
    return roll.result ? `[${label}]` : label
  })

  return `🎁 ${lootParts.join(" ")}`
}

function printLog(log: ActionLog): void {
  const W = 120
  const line = "─".repeat(W - 2)
  const pad = (s: string) => s.padEnd(W - 2) + "│"

  const status = log.success ? "✓" : "✗"

  // For Fight actions, separate main fight roll from loot rolls
  let rngStr = ""
  if (log.rngRolls.length > 0) {
    const mainRolls = log.rngRolls.filter((r) => !r.label.startsWith("loot:"))
    if (mainRolls.length > 0) {
      rngStr = mainRolls
        .map((r) => `${(r.probability * 100).toFixed(0)}%→${r.result ? "hit" : "miss"}`)
        .join(" ")
    }
  }

  const skillStr = log.skillGained ? `+1 ${log.skillGained.skill}` : ""
  const lootStr = formatLootSection(log)

  const parts = [
    `${status} ${log.actionType}: ${log.stateDeltaSummary}`,
    `⏱ ${log.timeConsumed}t`,
    rngStr ? `🎲 ${rngStr}` : "",
    skillStr ? `📈 ${skillStr}` : "",
    lootStr,
    log.failureType ? `❌ ${log.failureType}` : "",
  ].filter(Boolean)

  console.log(`\n┌${line}┐`)
  console.log(`│${pad(` ${parts.join("  │  ")}`)}`)

  // Show level-ups
  if (log.levelUps) {
    for (const lu of log.levelUps) {
      console.log(`├${line}┤`)
      console.log(`│${pad(` 📈 LEVEL UP: ${lu.skill} ${lu.fromLevel} → ${lu.toLevel}`)}`)
    }
  }

  if (log.contractsCompleted) {
    for (const c of log.contractsCompleted) {
      console.log(`├${line}┤`)
      const consumed = c.itemsConsumed.map((i) => `${i.quantity}x ${i.itemId}`).join(", ")
      const granted = c.rewardsGranted.map((i) => `${i.quantity}x ${i.itemId}`).join(", ")
      const xpStr = c.xpGained ? `  │  📈 +${c.xpGained.amount} ${c.xpGained.skill}` : ""
      console.log(
        `│${pad(` 🏆 CONTRACT COMPLETE: ${c.contractId}  │  Consumed: ${consumed}  │  Granted: ${granted}  │  +${c.reputationGained} rep${xpStr}`)}`
      )
      // Show level-ups from contract XP
      if (c.levelUps) {
        for (const lu of c.levelUps) {
          console.log(`│${pad(`   📈 LEVEL UP: ${lu.skill} ${lu.fromLevel} → ${lu.toLevel}`)}`)
        }
      }
    }
  }
  console.log(`└${line}┘`)
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
  console.log("│ enrol <skill>       - Enrol in a skill guild (3 ticks)      │")
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ state               - Show current world state              │")
  console.log("│ world               - Show world data (nodes, enemies, etc) │")
  console.log("│ help                - Show this help                        │")
  console.log("│ end                 - End session and show summary          │")
  console.log("│ quit                - Exit without summary                  │")
  console.log("└─────────────────────────────────────────────────────────────┘")

  // Show what's available at current location
  console.log(`\nAt ${state.exploration.playerState.currentAreaId}:`)
  const nodes = state.world.nodes.filter(
    (n) => n.areaId === state.exploration.playerState.currentAreaId
  )
  const enemies = state.world.enemies.filter(
    (e) => e.areaId === state.exploration.playerState.currentAreaId
  )
  const recipes = state.world.recipes.filter(
    (r) => r.requiredAreaId === state.exploration.playerState.currentAreaId
  )
  const contracts = state.world.contracts.filter(
    (c) => c.guildAreaId === state.exploration.playerState.currentAreaId
  )

  if (nodes.length > 0) console.log(`  Nodes: ${nodes.map((n) => n.nodeId).join(", ")}`)
  if (enemies.length > 0) console.log(`  Enemies: ${enemies.map((e) => e.id).join(", ")}`)
  if (recipes.length > 0) console.log(`  Recipes: ${recipes.map((r) => r.id).join(", ")}`)
  if (contracts.length > 0) console.log(`  Contracts: ${contracts.map((c) => c.id).join(", ")}`)
  if (state.exploration.playerState.currentAreaId === state.world.storageAreaId)
    console.log(`  Storage available`)
}

function printWorld(state: WorldState): void {
  console.log("\n┌─────────────────────────────────────────────────────────────┐")
  console.log("│ WORLD DATA                                                  │")
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ LOCATIONS: TOWN, MINE, FOREST                               │")
  console.log("│ Travel costs: TOWN↔MINE: 2, TOWN↔FOREST: 3, MINE↔FOREST: 4  │")
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ NODES                                                       │")
  for (const node of state.world.nodes) {
    console.log(`│   ${node.nodeId} @ ${node.areaId}`.padEnd(62) + "│")
    console.log(`│     → ${node.materials.map((m) => m.materialId).join(", ")}`.padEnd(62) + "│")
  }
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ ENEMIES                                                     │")
  for (const enemy of state.world.enemies) {
    console.log(`│   ${enemy.id} @ ${enemy.areaId}`.padEnd(62) + "│")
    const lootStr = enemy.lootTable
      .map((l) => `${l.quantity}x ${l.itemId}(${l.weight}%)`)
      .join(", ")
    console.log(
      `│     → ${enemy.fightTime} ticks, ${(enemy.successProbability * 100).toFixed(0)}% success, loot: ${lootStr}`.padEnd(
        62
      ) + "│"
    )
  }
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ RECIPES                                                     │")
  for (const recipe of state.world.recipes) {
    console.log(`│   ${recipe.id} @ ${recipe.requiredAreaId}`.padEnd(62) + "│")
    console.log(
      `│     → ${recipe.inputs.map((i) => `${i.quantity}x ${i.itemId}`).join(" + ")} = ${recipe.output.quantity}x ${recipe.output.itemId}`.padEnd(
        62
      ) + "│"
    )
  }
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ CONTRACTS                                                   │")
  for (const contract of state.world.contracts) {
    console.log(`│   ${contract.id} @ ${contract.guildAreaId}`.padEnd(62) + "│")
    console.log(
      `│     Requires: ${contract.requirements.map((r) => `${r.quantity}x ${r.itemId}`).join(", ")}`.padEnd(
        62
      ) + "│"
    )
    console.log(
      `│     Rewards: ${contract.rewards.map((r) => `${r.quantity}x ${r.itemId}`).join(", ")} + ${contract.reputationReward} rep`.padEnd(
        62
      ) + "│"
    )
  }
  console.log("└─────────────────────────────────────────────────────────────┘")
}

/**
 * Standard normal CDF approximation using error function
 */
function normalCDF(z: number): number {
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911

  const sign = z < 0 ? -1 : 1
  const x = Math.abs(z) / Math.sqrt(2)

  const t = 1.0 / (1.0 + p * x)
  const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)

  return 0.5 * (1.0 + sign * y)
}

interface RngStream {
  name: string
  trials: number
  probability: number
  successes: number
}

/**
 * Compute luck using Stouffer's method for combining z-scores across RNG streams.
 */
function computeLuckString(streams: RngStream[]): string {
  const validStreams = streams.filter((s) => s.trials > 0 && s.probability > 0 && s.probability < 1)

  if (validStreams.length === 0) return "N/A (no RNG actions)"

  const zScores: number[] = []
  for (const stream of validStreams) {
    const expected = stream.trials * stream.probability
    const variance = stream.trials * stream.probability * (1 - stream.probability)
    if (variance > 0) {
      const z = (stream.successes - expected) / Math.sqrt(variance)
      zScores.push(z)
    }
  }

  if (zScores.length === 0) return "N/A (no variance)"

  const zLuck = zScores.reduce((sum, z) => sum + z, 0) / Math.sqrt(zScores.length)
  const percentile = normalCDF(zLuck) * 100

  let label: string
  if (zLuck >= 1.5) {
    label = "very lucky"
  } else if (zLuck >= 0.5) {
    label = "lucky"
  } else if (zLuck <= -1.5) {
    label = "very unlucky"
  } else if (zLuck <= -0.5) {
    label = "unlucky"
  } else {
    label = "average"
  }

  const position =
    zLuck >= 0 ? `Top ${(100 - percentile).toFixed(0)}%` : `Bottom ${percentile.toFixed(0)}%`
  const sigmaStr = zLuck >= 0 ? `+${zLuck.toFixed(2)}σ` : `${zLuck.toFixed(2)}σ`

  return `${position} (${label}) — ${validStreams.length} streams (${sigmaStr})`
}

/**
 * Compute Volatility string for the plan
 */
function computeVolatility(xpProbabilities: number[]): string {
  if (xpProbabilities.length === 0) return "N/A"

  const totalVariance = xpProbabilities.reduce((sum, p) => sum + p * (1 - p), 0)
  const sigma = Math.sqrt(totalVariance)

  let volLabel: string
  if (sigma < 1.0) {
    volLabel = "Low"
  } else if (sigma <= 2.0) {
    volLabel = "Medium"
  } else {
    volLabel = "High"
  }

  return `${volLabel} (±${sigma.toFixed(1)} XP)`
}

/**
 * Build RNG streams from action logs for luck calculation.
 */
function buildRngStreams(logs: ActionLog[]): RngStream[] {
  const streamMap: Map<string, { trials: number; probability: number; successes: number }> =
    new Map()

  for (const log of logs) {
    const nonLootRolls = log.rngRolls.filter((r) => !r.label.startsWith("loot:"))
    const lootRolls = log.rngRolls.filter((r) => r.label.startsWith("loot:"))

    for (const roll of nonLootRolls) {
      const streamName = roll.label
      let stream = streamMap.get(streamName)
      if (!stream) {
        stream = { trials: 0, probability: roll.probability, successes: 0 }
        streamMap.set(streamName, stream)
      }
      stream.trials++
      if (roll.result) stream.successes++
    }

    for (const roll of lootRolls) {
      const streamName = roll.label
      let stream = streamMap.get(streamName)
      if (!stream) {
        stream = { trials: 0, probability: roll.probability, successes: 0 }
        streamMap.set(streamName, stream)
      }
      stream.trials++
      if (roll.result) stream.successes++
    }
  }

  return Array.from(streamMap.entries()).map(([name, data]) => ({
    name,
    trials: data.trials,
    probability: data.probability,
    successes: data.successes,
  }))
}

function printSummary(state: WorldState, stats: SessionStats): void {
  const W = 120
  const line = "─".repeat(W - 2)
  const dline = "═".repeat(W - 2)
  const pad = (s: string) => "│ " + s.padEnd(W - 4) + " │"

  const ticksUsed = stats.totalSession - state.time.sessionRemainingTicks

  // Action counts
  const actionCounts: Record<string, { success: number; fail: number; time: number }> = {}
  for (const log of stats.logs) {
    if (!actionCounts[log.actionType]) {
      actionCounts[log.actionType] = { success: 0, fail: 0, time: 0 }
    }
    if (log.success) {
      actionCounts[log.actionType].success++
    } else {
      actionCounts[log.actionType].fail++
    }
    actionCounts[log.actionType].time += log.timeConsumed
  }

  // XP gained
  const xpGained: Record<string, number> = {}
  let totalXP = 0
  let expectedXP = 0
  const xpProbabilities: number[] = [] // probabilities for all XP-granting actions
  for (const log of stats.logs) {
    if (log.skillGained) {
      xpGained[log.skillGained.skill] =
        (xpGained[log.skillGained.skill] || 0) + log.skillGained.amount
      totalXP += log.skillGained.amount
    }
    // Calculate expected XP: RNG actions contribute their probability, deterministic XP actions contribute 1
    if (log.rngRolls.length > 0) {
      // RNG action - expected XP is the success probability
      const p = log.rngRolls[0].probability
      expectedXP += p
      xpProbabilities.push(p)
    } else if (log.skillGained) {
      // Deterministic action that granted XP (Craft, Store)
      expectedXP += 1
      xpProbabilities.push(1) // deterministic success
    }
    // Add contract completion XP
    if (log.contractsCompleted) {
      for (const c of log.contractsCompleted) {
        if (c.xpGained) {
          xpGained[c.xpGained.skill] = (xpGained[c.xpGained.skill] || 0) + c.xpGained.amount
          totalXP += c.xpGained.amount
          expectedXP += c.xpGained.amount // Contract XP is deterministic once contract completes
          // Note: We don't add to xpProbabilities since contract XP is bonus on top of the triggering action
        }
      }
    }
  }

  // Volatility calculation
  const volatilityStr = computeVolatility(xpProbabilities)

  // RNG luck analysis using Stouffer's method for combining z-scores
  const rngStreams = buildRngStreams(stats.logs)
  const luckStr = computeLuckString(rngStreams)

  // Contracts completed
  let contractsCompleted = 0
  let repGained = 0
  for (const log of stats.logs) {
    if (log.contractsCompleted) {
      contractsCompleted += log.contractsCompleted.length
      for (const c of log.contractsCompleted) {
        repGained += c.reputationGained
      }
    }
  }

  // Skill progression
  const skillDelta: string[] = []
  const skills: SkillID[] = ["Mining", "Woodcutting", "Combat", "Smithing"]
  for (const skill of skills) {
    const startXP = getTotalXP(stats.startingSkills[skill])
    const endXP = getTotalXP(state.player.skills[skill])
    if (endXP > startXP) {
      const startLevel = stats.startingSkills[skill].level
      const endLevel = state.player.skills[skill].level
      skillDelta.push(`${skill}: ${startLevel}→${endLevel} (+${endXP - startXP} XP)`)
    }
  }

  // Items in inventory + storage
  const allItems: Record<string, number> = {}
  for (const item of state.player.inventory) {
    allItems[item.itemId] = (allItems[item.itemId] || 0) + item.quantity
  }
  for (const item of state.player.storage) {
    allItems[item.itemId] = (allItems[item.itemId] || 0) + item.quantity
  }
  const itemsStr =
    Object.entries(allItems)
      .map(([id, qty]) => `${qty}x ${id}`)
      .join(", ") || "(none)"

  console.log(`\n╔${dline}╗`)
  console.log(`║${"SESSION SUMMARY".padStart(W / 2 + 7).padEnd(W - 2)}║`)
  console.log(`╠${dline}╣`)

  // Time & Efficiency
  const expectedXPTick = ticksUsed > 0 ? (expectedXP / ticksUsed).toFixed(2) : "0.00"
  const actualXPTick = ticksUsed > 0 ? (totalXP / ticksUsed).toFixed(2) : "0.00"
  console.log(
    pad(
      `⏱  TIME: ${ticksUsed}/${stats.totalSession} ticks  │  XP: ${totalXP} actual, ${expectedXP.toFixed(1)} expected  │  XP/tick: ${actualXPTick} actual, ${expectedXPTick} expected`
    )
  )
  console.log(`├${line}┤`)

  // Actions breakdown
  const actionStrs = Object.entries(actionCounts).map(
    ([type, { success, fail, time }]) =>
      `${type}: ${success}✓${fail > 0 ? ` ${fail}✗` : ""} (${time}t)`
  )
  console.log(pad(`📋 ACTIONS: ${stats.logs.length} total  │  ${actionStrs.join("  │  ")}`))
  console.log(`├${line}┤`)

  // Luck
  console.log(pad(`🎲 LUCK: ${luckStr}`))
  console.log(`├${line}┤`)

  // Volatility
  console.log(pad(`📉 VOLATILITY: ${volatilityStr}`))
  console.log(`├${line}┤`)

  // Skills
  console.log(pad(`📈 SKILLS: ${skillDelta.length > 0 ? skillDelta.join("  │  ") : "(no gains)"}`))
  console.log(`├${line}┤`)

  // Contracts & Rep
  console.log(
    pad(
      `🏆 CONTRACTS: ${contractsCompleted} completed  │  Reputation: ${state.player.guildReputation} (+${repGained} this session)`
    )
  )
  console.log(`├${line}┤`)

  // Final inventory
  console.log(pad(`🎒 FINAL ITEMS: ${itemsStr}`))
  console.log(`╚${dline}╝`)
}

function parseAction(input: string): Action | null {
  const parts = input.trim().toLowerCase().split(/\s+/)
  const cmd = parts[0]

  switch (cmd) {
    case "move": {
      const dest = parts[1]?.toUpperCase()
      if (!dest || !["TOWN", "MINE", "FOREST"].includes(dest)) {
        console.log("Usage: move <TOWN|MINE|FOREST>")
        return null
      }
      return { type: "Move", destination: dest as "TOWN" | "MINE" | "FOREST" }
    }

    case "gather": {
      const nodeId = parts[1]
      if (!nodeId) {
        console.log("Usage: gather <node-id>")
        return null
      }
      return { type: "Gather", nodeId }
    }

    case "fight": {
      const enemyId = parts[1]
      if (!enemyId) {
        console.log("Usage: fight <enemy-id>")
        return null
      }
      return { type: "Fight", enemyId }
    }

    case "craft": {
      const recipeId = parts[1]
      if (!recipeId) {
        console.log("Usage: craft <recipe-id>")
        return null
      }
      return { type: "Craft", recipeId }
    }

    case "store": {
      const storeItem = parts[1]?.toUpperCase()
      const storeQty = parseInt(parts[2] || "1", 10)
      if (!storeItem) {
        console.log("Usage: store <item-id> [quantity]")
        return null
      }
      return {
        type: "Store",
        itemId: storeItem as "IRON_ORE" | "WOOD_LOG" | "IRON_BAR",
        quantity: storeQty,
      }
    }

    case "drop": {
      const dropItem = parts[1]?.toUpperCase()
      const dropQty = parseInt(parts[2] || "1", 10)
      if (!dropItem) {
        console.log("Usage: drop <item-id> [quantity]")
        return null
      }
      return {
        type: "Drop",
        itemId: dropItem as "IRON_ORE" | "WOOD_LOG" | "IRON_BAR",
        quantity: dropQty,
      }
    }

    case "accept": {
      const contractId = parts[1]
      if (!contractId) {
        console.log("Usage: accept <contract-id>")
        return null
      }
      return { type: "AcceptContract", contractId }
    }

    case "enrol":
    case "enroll": {
      const skillName = parts[1]
      if (!skillName) {
        console.log("Usage: enrol <skill>  (Mining, Woodcutting, Combat, Smithing)")
        return null
      }
      const skillMap: Record<string, "Mining" | "Woodcutting" | "Combat" | "Smithing"> = {
        mining: "Mining",
        woodcutting: "Woodcutting",
        combat: "Combat",
        smithing: "Smithing",
      }
      const skill = skillMap[skillName.toLowerCase()]
      if (!skill) {
        console.log("Invalid skill. Choose: Mining, Woodcutting, Combat, Smithing")
        return null
      }
      return { type: "Enrol", skill }
    }

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

  const state = createWorld(seed)

  // Initialize session tracking
  const stats: SessionStats = {
    logs: [],
    startingSkills: { ...state.player.skills },
    totalSession: state.time.sessionRemainingTicks,
  }

  printState(state)
  printHelp(state)

  let showSummary = true

  while (state.time.sessionRemainingTicks > 0) {
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

    const action = parseAction(input)
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
    stats.logs.push(log)
    printLog(log)
    printState(state)
  }

  if (showSummary) {
    if (state.time.sessionRemainingTicks <= 0) {
      console.log("\n⏰ Session time exhausted!")
    }
    printSummary(state, stats)
  }

  rl.close()
}

main().catch(console.error)
