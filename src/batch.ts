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

  // Show contract completions
  if (log.contractsCompleted) {
    for (const c of log.contractsCompleted) {
      const consumed = c.itemsConsumed.map((i) => `${i.quantity}x ${i.itemId}`).join(", ")
      const granted = c.rewardsGranted.map((i) => `${i.quantity}x ${i.itemId}`).join(", ")
      const xpStr = c.xpGained ? `  │  📈 +${c.xpGained.amount} ${c.xpGained.skill}` : ""
      console.log(`    🏆 CONTRACT COMPLETE: ${c.contractId}  │  Consumed: ${consumed}  │  Granted: ${granted}  │  +${c.reputationGained} rep${xpStr}`)
    }
  }
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
/**
 * Compute Risk/Volatility string for the plan
 * Volatility = σ of total XP (standard deviation)
 * Risk = P(XP ≤ 70% of expected) bucketed as Low/Medium/High
 */
function computeRiskVolatility(xpProbabilities: number[], expectedXP: number): string {
  if (xpProbabilities.length === 0) return "N/A"

  // Volatility: σ = sqrt(sum of p*(1-p) for each action)
  const totalVariance = xpProbabilities.reduce((sum, p) => sum + p * (1 - p), 0)
  const sigma = Math.sqrt(totalVariance)

  // Risk: P(XP ≤ 70% of expected)
  const threshold = Math.floor(0.7 * expectedXP)
  const downsideProb = poissonBinomialProbAtMost(xpProbabilities, threshold)

  // Bucket risk
  let riskLabel: string
  if (downsideProb < 0.2) {
    riskLabel = "Low"
  } else if (downsideProb <= 0.5) {
    riskLabel = "Medium"
  } else {
    riskLabel = "High"
  }

  return `${riskLabel} (±${sigma.toFixed(1)} XP)`
}

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
    position = `Top ${percentile.toFixed(0)}%`

    if (percentile <= 5) {
      label = "extremely lucky"
    } else if (percentile <= 20) {
      label = "very lucky"
    } else if (percentile <= 35) {
      label = "mildly lucky"
    } else if (percentile <= 65) {
      label = "typical"
    } else if (percentile <= 80) {
      label = "mildly lucky"
    } else if (percentile <= 95) {
      label = "typical"
    } else {
      label = "typical"
    }
  } else {
    const probAtMost = poissonBinomialProbAtMost(probabilities, actualSuccesses)
    percentile = probAtMost * 100
    position = `Bottom ${percentile.toFixed(0)}%`

    if (percentile <= 5) {
      label = "extremely unlucky"
    } else if (percentile <= 20) {
      label = "very unlucky"
    } else if (percentile <= 35) {
      label = "mildly unlucky"
    } else if (percentile <= 65) {
      label = "typical"
    } else if (percentile <= 80) {
      label = "mildly unlucky"
    } else if (percentile <= 95) {
      label = "typical"
    } else {
      label = "typical"
    }
  }

  const sigmaStr = zScore >= 0 ? `+${zScore.toFixed(1)}σ` : `${zScore.toFixed(1)}σ`

  return `${position} (${label}) — ${actualSuccesses}/${n} vs ${expected.toFixed(1)} expected (${sigmaStr})`
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
  let expectedXP = 0
  const xpProbabilities: number[] = [] // probabilities for all XP-granting actions
  for (const log of stats.logs) {
    if (log.skillGained) totalXP += log.skillGained.amount
    // Calculate expected XP: RNG actions contribute their probability, deterministic XP actions contribute 1
    if (log.rngRolls.length > 0) {
      // RNG action - expected XP is the success probability
      const p = log.rngRolls[0].probability
      expectedXP += p
      xpProbabilities.push(p)
    } else if (log.skillGained) {
      // Deterministic action that granted XP (Move, Craft, Store)
      expectedXP += 1
      xpProbabilities.push(1) // deterministic success
    }
    // Add contract completion XP
    if (log.contractsCompleted) {
      for (const c of log.contractsCompleted) {
        if (c.xpGained) {
          totalXP += c.xpGained.amount
          expectedXP += c.xpGained.amount // Contract XP is deterministic once contract completes
          // Note: We don't add to xpProbabilities since contract XP is bonus on top of the triggering action
        }
      }
    }
  }

  // Risk/Volatility calculation
  const riskVolatilityStr = computeRiskVolatility(xpProbabilities, expectedXP)

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
  const expectedXPTick = ticksUsed > 0 ? (expectedXP / ticksUsed).toFixed(2) : "0.00"
  const actualXPTick = ticksUsed > 0 ? (totalXP / ticksUsed).toFixed(2) : "0.00"
  console.log(pad(`⏱  TIME: ${ticksUsed}/${stats.totalSession} ticks  │  XP: ${totalXP} actual, ${expectedXP.toFixed(1)} expected  │  XP/tick: ${actualXPTick} actual, ${expectedXPTick} expected`))
  console.log(`├${line}┤`)
  console.log(pad(`📋 ACTIONS: ${stats.logs.length} total  │  ${actionStrs.join("  │  ")}`))
  console.log(`├${line}┤`)
  console.log(pad(`🎲 LUCK: ${luckStr}`))
  console.log(`├${line}┤`)
  console.log(pad(`⚠️  RISK: ${riskVolatilityStr}`))
  console.log(`├${line}┤`)
  console.log(pad(`📈 SKILLS: ${skillDelta.length > 0 ? skillDelta.join("  │  ") : "(no gains)"}`)
  )
  console.log(`├${line}┤`)
  console.log(pad(`🏆 CONTRACTS: ${contractsCompleted} completed  │  Reputation: ${state.player.guildReputation} (+${repGained} this session)`))
  console.log(`├${line}┤`)

  // Final inventory + storage
  const allItems: Record<string, number> = {}
  for (const item of state.player.inventory) {
    allItems[item.itemId] = (allItems[item.itemId] || 0) + item.quantity
  }
  for (const item of state.player.storage) {
    allItems[`${item.itemId} (stored)`] = (allItems[`${item.itemId} (stored)`] || 0) + item.quantity
  }
  const itemsStr = Object.entries(allItems)
    .map(([id, qty]) => `${qty}x ${id}`)
    .join(", ") || "(none)"
  console.log(pad(`🎒 FINAL ITEMS: ${itemsStr}`))
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
