/**
 * Batch runner for executing a plan from command line arguments
 */

import { createToyWorld } from "./world.js"
import { executeAction } from "./engine.js"
import type { Action, ActionLog, WorldState, SkillID } from "./types.js"

interface SessionStats {
  logs: ActionLog[]
  startingSkills: Record<SkillID, number>
  totalSession: number
}

function printState(state: WorldState): void {
  const W = 120
  const line = "─".repeat(W - 2)
  const pad = (s: string) => s.padEnd(W - 2) + "│"

  const invStr =
    state.player.inventory.length === 0
      ? "(empty)"
      : state.player.inventory.map((i) => `${i.quantity}x ${i.itemId}`).join(", ")
  const skills = `Mining:${state.player.skills.Mining} Woodcut:${state.player.skills.Woodcutting} Combat:${state.player.skills.Combat} Smith:${state.player.skills.Smithing} Logistics:${state.player.skills.Logistics}`

  console.log(`┌${line}┐`)
  console.log(`│${pad(` 📍 ${state.player.location}  │  ⏱ ${state.time.sessionRemainingTicks} ticks left  │  🎒 ${invStr}`)}`)
  console.log(`│${pad(` 📊 ${skills}`)}`)
  console.log(`└${line}┘`)
}

function printLog(log: ActionLog): void {
  const status = log.success ? "✓" : "✗"
  const rngStr =
    log.rngRolls.length > 0
      ? log.rngRolls.map((r) => `${(r.probability * 100).toFixed(0)}%→${r.result ? "hit" : "miss"}`).join(" ")
      : ""
  const skillStr = log.skillGained ? `+1 ${log.skillGained.skill}` : ""
  const parts = [
    `${status} ${log.actionType}: ${log.stateDeltaSummary}`,
    `⏱ ${log.timeConsumed}t`,
    rngStr ? `🎲 ${rngStr}` : "",
    skillStr ? `📈 ${skillStr}` : "",
    log.failureType ? `❌ ${log.failureType}` : "",
  ].filter(Boolean)
  console.log(`  ${parts.join("  │  ")}`)
}

/**
 * Compute P(X >= k) for Poisson binomial distribution using DP.
 */
function poissonBinomialProbAtLeast(probabilities: number[], k: number): number {
  const n = probabilities.length
  if (k > n) return 0
  if (k <= 0) return 1

  let dp = new Array(n + 1).fill(0)
  dp[0] = 1

  for (const p of probabilities) {
    const newDp = new Array(n + 1).fill(0)
    for (let j = 0; j <= n; j++) {
      if (dp[j] === 0) continue
      newDp[j] += dp[j] * (1 - p)
      if (j + 1 <= n) {
        newDp[j + 1] += dp[j] * p
      }
    }
    dp = newDp
  }

  let prob = 0
  for (let j = k; j <= n; j++) {
    prob += dp[j]
  }
  return prob
}

/**
 * Compute P(X <= k) for Poisson binomial distribution
 */
function poissonBinomialProbAtMost(probabilities: number[], k: number): number {
  const n = probabilities.length
  if (k < 0) return 0
  if (k >= n) return 1

  let dp = new Array(n + 1).fill(0)
  dp[0] = 1

  for (const p of probabilities) {
    const newDp = new Array(n + 1).fill(0)
    for (let j = 0; j <= n; j++) {
      if (dp[j] === 0) continue
      newDp[j] += dp[j] * (1 - p)
      if (j + 1 <= n) {
        newDp[j + 1] += dp[j] * p
      }
    }
    dp = newDp
  }

  let prob = 0
  for (let j = 0; j <= k; j++) {
    prob += dp[j]
  }
  return prob
}

/**
 * Compute luck string with percentile, label, and sigma
 */
function computeLuckString(probabilities: number[], actualSuccesses: number): string {
  const n = probabilities.length
  if (n === 0) return "N/A (no RNG actions)"

  const expected = probabilities.reduce((sum, p) => sum + p, 0)
  const variance = probabilities.reduce((sum, p) => sum + p * (1 - p), 0)
  const sigma = Math.sqrt(variance)
  const zScore = sigma > 0 ? (actualSuccesses - expected) / sigma : 0

  let percentile: number
  let label: string
  let position: string

  if (actualSuccesses >= expected) {
    const probAtLeast = poissonBinomialProbAtLeast(probabilities, actualSuccesses)
    percentile = probAtLeast * 100

    if (percentile <= 5) {
      label = "extremely lucky"
    } else if (percentile <= 20) {
      label = "very lucky"
    } else {
      label = "typical"
    }
    position = `Top ${percentile.toFixed(0)}%`
  } else {
    const probAtMost = poissonBinomialProbAtMost(probabilities, actualSuccesses)
    percentile = probAtMost * 100

    if (percentile <= 5) {
      label = "extremely unlucky"
    } else if (percentile <= 20) {
      label = "unlucky"
    } else {
      label = "typical"
    }
    position = `Bottom ${percentile.toFixed(0)}%`
  }

  const sigmaStr = zScore >= 0 ? `+${zScore.toFixed(1)}σ` : `${zScore.toFixed(1)}σ`

  if (label === "typical") {
    return `Typical — ${actualSuccesses}/${n} successes vs ${expected.toFixed(1)} expected (${sigmaStr})`
  }
  return `${position} (${label}) — ${actualSuccesses}/${n} successes vs ${expected.toFixed(1)} expected (${sigmaStr})`
}

function printSummary(state: WorldState, stats: SessionStats): void {
  const W = 120
  const line = "─".repeat(W - 2)
  const dline = "═".repeat(W - 2)
  const pad = (s: string) => "│ " + s.padEnd(W - 4) + " │"

  const ticksUsed = stats.totalSession - state.time.sessionRemainingTicks

  const actionCounts: Record<string, { success: number; fail: number; time: number }> = {}
  for (const log of stats.logs) {
    if (!actionCounts[log.actionType]) {
      actionCounts[log.actionType] = { success: 0, fail: 0, time: 0 }
    }
    if (log.success) actionCounts[log.actionType].success++
    else actionCounts[log.actionType].fail++
    actionCounts[log.actionType].time += log.timeConsumed
  }

  let totalXP = 0
  for (const log of stats.logs) {
    if (log.skillGained) totalXP += log.skillGained.amount
  }

  // RNG luck analysis using Poisson binomial distribution
  const probabilities: number[] = []
  let actualSuccesses = 0
  for (const log of stats.logs) {
    for (const roll of log.rngRolls) {
      probabilities.push(roll.probability)
      if (roll.result) actualSuccesses++
    }
  }
  const luckStr = computeLuckString(probabilities, actualSuccesses)

  const skillDelta: string[] = []
  const skills: SkillID[] = ["Mining", "Woodcutting", "Combat", "Smithing", "Logistics"]
  for (const skill of skills) {
    const start = stats.startingSkills[skill]
    const end = state.player.skills[skill]
    if (end > start) skillDelta.push(`${skill}: ${start}→${end} (+${end - start})`)
  }

  const actionStrs = Object.entries(actionCounts).map(
    ([type, { success, fail, time }]) => `${type}: ${success}✓${fail > 0 ? ` ${fail}✗` : ""} (${time}t)`
  )

  console.log(`\n╔${dline}╗`)
  console.log(`║${"SESSION SUMMARY".padStart(W / 2 + 7).padEnd(W - 2)}║`)
  console.log(`╠${dline}╣`)
  console.log(pad(`⏱  TIME: ${ticksUsed}/${stats.totalSession} ticks used  │  XP/tick: ${ticksUsed > 0 ? (totalXP / ticksUsed).toFixed(2) : "0.00"}  │  Total XP: ${totalXP}`))
  console.log(`├${line}┤`)
  console.log(pad(`📋 ACTIONS: ${stats.logs.length} total  │  ${actionStrs.join("  │  ")}`))
  console.log(`├${line}┤`)
  console.log(pad(`🎲 LUCK: ${luckStr}`))
  console.log(`├${line}┤`)
  console.log(pad(`📈 SKILLS: ${skillDelta.length > 0 ? skillDelta.join("  │  ") : "(no gains)"}`))
  console.log(`╚${dline}╝`)
}

function parseAction(cmd: string): Action | null {
  const parts = cmd.trim().toLowerCase().split(/\s+/)
  const type = parts[0]
  switch (type) {
    case "move":
      return { type: "Move", destination: parts[1]?.toUpperCase() as "TOWN" | "MINE" | "FOREST" }
    case "gather":
      return { type: "Gather", nodeId: parts[1] }
    case "fight":
      return { type: "Fight", enemyId: parts[1] }
    case "craft":
      return { type: "Craft", recipeId: parts[1] }
    case "store":
      return { type: "Store", itemId: parts[1]?.toUpperCase() as "IRON_ORE" | "WOOD_LOG" | "IRON_BAR", quantity: parseInt(parts[2] || "1") }
    case "drop":
      return { type: "Drop", itemId: parts[1]?.toUpperCase() as "IRON_ORE" | "WOOD_LOG" | "IRON_BAR", quantity: parseInt(parts[2] || "1") }
    case "accept":
      return { type: "AcceptContract", contractId: parts[1] }
    default:
      return null
  }
}

function main(): void {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.log("Usage: node dist/batch.js <seed> <command1> <command2> ...")
    console.log("Example: node dist/batch.js test-seed 'move mine' 'gather iron-node' 'gather iron-node'")
    process.exit(1)
  }

  const seed = args[0]
  const commands = args.slice(1)

  console.log(`=== Plan Execution (seed: ${seed}) ===\n`)
  const state = createToyWorld(seed)
  const stats: SessionStats = {
    logs: [],
    startingSkills: { ...state.player.skills },
    totalSession: state.time.sessionRemainingTicks,
  }

  printState(state)
  console.log("")

  for (const cmd of commands) {
    if (state.time.sessionRemainingTicks <= 0) {
      console.log("  ⏰ Session time exhausted!")
      break
    }
    const action = parseAction(cmd)
    if (!action) {
      console.log(`  ⚠ Invalid command: ${cmd}`)
      continue
    }
    const log = executeAction(state, action)
    stats.logs.push(log)
    printLog(log)
  }

  printSummary(state, stats)
}

main()
