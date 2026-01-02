/**
 * Batch runner for executing a plan from command line arguments
 */

import { createToyWorld } from "./world.js"
import { executeAction } from "./engine.js"
import type { Action, ActionLog, WorldState, SkillID, Objective, SkillState } from "./types.js"
import { OBJECTIVES, getTotalXP, getXPThresholdForNextLevel } from "./types.js"

interface SessionStats {
  logs: ActionLog[]
  startingSkills: Record<SkillID, SkillState>
  totalSession: number
}

/**
 * Compute expected level gains from expected XP per skill, given starting skill state.
 */
function computeExpectedLevelGains(
  startingSkills: Record<SkillID, SkillState>,
  expectedXPPerSkill: Record<SkillID, number>
): Record<SkillID, number> {
  const result: Record<SkillID, number> = {
    Mining: 0,
    Woodcutting: 0,
    Combat: 0,
    Smithing: 0,
    Logistics: 0,
  }

  for (const skill of Object.keys(expectedXPPerSkill) as SkillID[]) {
    const start = startingSkills[skill]
    const expectedXP = expectedXPPerSkill[skill]
    if (expectedXP <= 0) continue

    let level = start.level
    let xp = start.xp + expectedXP

    let threshold = getXPThresholdForNextLevel(level)
    while (xp >= threshold) {
      xp -= threshold
      level++
      result[skill]++
      threshold = getXPThresholdForNextLevel(level)
    }
  }

  return result
}

function printState(state: WorldState): void {
  const W = 120
  const line = "─".repeat(W - 2)
  const pad = (s: string) => s.padEnd(W - 2) + "│"

  const invStr =
    state.player.inventory.length === 0
      ? "(empty)"
      : state.player.inventory.map((i) => `${i.quantity}x ${i.itemId}`).join(", ")
  const skills = `Mining:${state.player.skills.Mining.level} Woodcut:${state.player.skills.Woodcutting.level} Combat:${state.player.skills.Combat.level} Smith:${state.player.skills.Smithing.level} Logistics:${state.player.skills.Logistics.level}`

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

  // Show level-ups
  if (log.levelUps) {
    for (const lu of log.levelUps) {
      console.log(`    📈 LEVEL UP: ${lu.skill} ${lu.fromLevel} → ${lu.toLevel}`)
    }
  }

  // Show contract completions
  if (log.contractsCompleted) {
    for (const c of log.contractsCompleted) {
      const consumed = c.itemsConsumed.map((i) => `${i.quantity}x ${i.itemId}`).join(", ")
      const granted = c.rewardsGranted.map((i) => `${i.quantity}x ${i.itemId}`).join(", ")
      const xpStr = c.xpGained ? `  │  📈 +${c.xpGained.amount} ${c.xpGained.skill}` : ""
      console.log(`    🏆 CONTRACT COMPLETE: ${c.contractId}  │  Consumed: ${consumed}  │  Granted: ${granted}  │  +${c.reputationGained} rep${xpStr}`)
      // Show level-ups from contract XP
      if (c.levelUps) {
        for (const lu of c.levelUps) {
          console.log(`      📈 LEVEL UP: ${lu.skill} ${lu.fromLevel} → ${lu.toLevel}`)
        }
      }
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
 * Compute Volatility string for the plan (objective-agnostic)
 * Volatility = σ of total XP (standard deviation)
 */
function computeVolatility(xpProbabilities: number[]): string {
  if (xpProbabilities.length === 0) return "N/A"

  // Volatility: σ = sqrt(sum of p*(1-p) for each action)
  const totalVariance = xpProbabilities.reduce((sum, p) => sum + p * (1 - p), 0)
  const sigma = Math.sqrt(totalVariance)

  // Bucket volatility
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
 * Compute Risk to Objective (objective-specific)
 * Returns probability that objective is NOT achieved
 */
function computeRiskToObjective(
  objective: Objective,
  state: WorldState,
  stats: SessionStats,
  startingSkills: Record<SkillID, SkillState>
): string {
  let failProb = 0
  let description = ""

  switch (objective.type) {
    case "maximize_xp":
      // Always succeeds by definition
      failProb = 0
      description = "maximize XP"
      break

    case "complete_contract": {
      // Check if contract was completed
      let completed = false
      for (const log of stats.logs) {
        if (log.contractsCompleted) {
          for (const c of log.contractsCompleted) {
            if (c.contractId === objective.contractId) {
              completed = true
            }
          }
        }
      }
      failProb = completed ? 0 : 1
      description = `complete ${objective.contractId}`
      break
    }

    case "reach_skill": {
      const currentLevel = state.player.skills[objective.skill].level
      const achieved = currentLevel >= objective.target
      failProb = achieved ? 0 : 1
      description = `reach ${objective.skill} ${objective.target}`
      break
    }

    case "diversify_skills": {
      // Check if all listed skills advanced at least 1 XP
      let allAdvanced = true
      for (const skill of objective.skills) {
        const startXP = getTotalXP(startingSkills[skill as SkillID])
        const endXP = getTotalXP(state.player.skills[skill as SkillID])
        if (endXP <= startXP) {
          allAdvanced = false
          break
        }
      }
      failProb = allAdvanced ? 0 : 1
      description = `diversify ${objective.skills.length} skills`
      break
    }
  }

  // Bucket risk
  let riskLabel: string
  if (failProb < 0.2) {
    riskLabel = "Low"
  } else if (failProb <= 0.5) {
    riskLabel = "Medium"
  } else {
    riskLabel = "High"
  }

  const pct = (failProb * 100).toFixed(0)
  return `${riskLabel} (${pct}% fail) — ${description}`
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

function printSummary(state: WorldState, stats: SessionStats, objective: Objective): void {
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
  const expectedXPPerSkill: Record<SkillID, number> = {
    Mining: 0,
    Woodcutting: 0,
    Combat: 0,
    Smithing: 0,
    Logistics: 0,
  }
  for (const log of stats.logs) {
    if (log.skillGained) totalXP += log.skillGained.amount
    // Calculate expected XP: RNG actions contribute their probability, deterministic XP actions contribute 1
    if (log.rngRolls.length > 0) {
      // RNG action - expected XP is the success probability
      const p = log.rngRolls[0].probability
      expectedXP += p
      xpProbabilities.push(p)
      // Track per-skill expected XP - use skillGained if available, else look up from world data
      if (log.actionType === "Fight") {
        expectedXPPerSkill.Combat += p
      } else if (log.actionType === "Gather") {
        // Use skillGained if action succeeded, otherwise look up node's skillType
        const skill = log.skillGained?.skill ??
          state.world.resourceNodes.find(n => n.id === log.parameters.nodeId)?.skillType
        if (skill) expectedXPPerSkill[skill] += p
      }
    } else if (log.skillGained) {
      // Deterministic action that granted XP (Craft, Store)
      expectedXP += 1
      xpProbabilities.push(1) // deterministic success
      expectedXPPerSkill[log.skillGained.skill] += 1
    }
    // Add contract completion XP
    if (log.contractsCompleted) {
      for (const c of log.contractsCompleted) {
        if (c.xpGained) {
          totalXP += c.xpGained.amount
          expectedXP += c.xpGained.amount // Contract XP is deterministic once contract completes
          expectedXPPerSkill[c.xpGained.skill] += c.xpGained.amount
          // Note: We don't add to xpProbabilities since contract XP is bonus on top of the triggering action
        }
      }
    }
  }

  // Compute expected level gains
  const expectedLevels = computeExpectedLevelGains(stats.startingSkills, expectedXPPerSkill)

  // Volatility calculation (objective-agnostic)
  const volatilityStr = computeVolatility(xpProbabilities)

  // Risk to Objective calculation (objective-specific)
  const riskToObjectiveStr = computeRiskToObjective(objective, state, stats, stats.startingSkills)

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
    const startXP = getTotalXP(stats.startingSkills[skill])
    const endXP = getTotalXP(state.player.skills[skill])
    if (endXP > startXP) {
      const startLevel = stats.startingSkills[skill].level
      const endLevel = state.player.skills[skill].level
      skillDelta.push(`${skill}: ${startLevel}→${endLevel} (+${endXP - startXP} XP)`)
    }
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
  console.log(pad(`📉 VOLATILITY: ${volatilityStr}`))
  console.log(`├${line}┤`)
  console.log(pad(`🎯 RISK TO OBJECTIVE: ${riskToObjectiveStr}`))
  console.log(`├${line}┤`)
  console.log(pad(`📈 SKILLS: ${skillDelta.length > 0 ? skillDelta.join("  │  ") : "(no gains)"}`)
  )
  // Expected levels line
  const expectedLevelStrs: string[] = []
  for (const skill of skills) {
    if (expectedLevels[skill] > 0) {
      expectedLevelStrs.push(`${skill} +${expectedLevels[skill]}`)
    }
  }
  console.log(`├${line}┤`)
  console.log(pad(`📊 EXPECTED LEVELS: ${expectedLevelStrs.length > 0 ? expectedLevelStrs.join("  │  ") : "(none)"}`)
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

function parseObjective(str: string): Objective {
  const lower = str.toLowerCase()
  switch (lower) {
    case "maximize_xp":
    case "max_xp":
      return OBJECTIVES.MAXIMIZE_XP
    case "complete_contract":
    case "contract":
      return OBJECTIVES.COMPLETE_MINERS_CONTRACT
    case "mining_5":
    case "reach_mining_5":
      return OBJECTIVES.REACH_MINING_5
    case "combat_3":
    case "reach_combat_3":
      return OBJECTIVES.REACH_COMBAT_3
    case "smithing_3":
    case "reach_smithing_3":
      return OBJECTIVES.REACH_SMITHING_3
    case "diversify":
    case "diversify_all":
      return OBJECTIVES.DIVERSIFY_ALL
    case "balanced":
    case "balanced_progress":
      return OBJECTIVES.BALANCED_PROGRESS
    default:
      return OBJECTIVES.MAXIMIZE_XP
  }
}

function main(): void {
  const args = process.argv.slice(2)
  if (args.length < 2) {
    console.log("Usage: node dist/batch.js <seed> [--objective <obj>] <command1> <command2> ...")
    console.log("Example: node dist/batch.js test-seed 'move mine' 'gather iron-node' 'gather iron-node'")
    console.log("Objectives: maximize_xp, contract, mining_5, combat_3, smithing_3, diversify, balanced")
    process.exit(1)
  }

  const seed = args[0]
  let objective: Objective = OBJECTIVES.MAXIMIZE_XP
  let commandStartIndex = 1

  // Check for --objective flag
  if (args[1] === "--objective" || args[1] === "-o") {
    objective = parseObjective(args[2] || "maximize_xp")
    commandStartIndex = 3
  }

  const commands = args.slice(commandStartIndex)

  const objectiveDesc = objective.type === "maximize_xp" ? "Maximize XP" :
    objective.type === "complete_contract" ? `Complete ${(objective as {contractId: string}).contractId}` :
    objective.type === "reach_skill" ? `Reach ${(objective as {skill: string; target: number}).skill} ${(objective as {skill: string; target: number}).target}` :
    `Diversify ${(objective as {skills: string[]}).skills.length} skills`

  console.log(`=== Plan Execution (seed: ${seed}) ===`)
  console.log(`🎯 Objective: ${objectiveDesc}\n`)
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

  printSummary(state, stats, objective)
}

main()
