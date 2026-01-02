/**
 * Interactive REPL for manual control of the simulation
 */

import * as readline from "readline"
import { createToyWorld } from "./world.js"
import { executeAction } from "./engine.js"
import { evaluateAction } from "./evaluate.js"
import type { Action, ActionLog, WorldState, SkillID, Objective, SkillState } from "./types.js"
import { OBJECTIVES, getTotalXP, getXPThresholdForNextLevel } from "./types.js"

// Session tracking
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
  const skills = `Mining:${state.player.skills.Mining.level} Woodcut:${state.player.skills.Woodcutting.level} Combat:${state.player.skills.Combat.level} Smith:${state.player.skills.Smithing.level} Logistics:${state.player.skills.Logistics.level}`
  const contracts = state.player.activeContracts.join(", ") || "(none)"

  console.log(`\n┌${line}┐`)
  console.log(`│${pad(` 📍 ${state.player.location}  │  ⏱ ${state.time.sessionRemainingTicks} ticks left  │  ⭐ Rep: ${state.player.guildReputation}  │  📜 Contracts: ${contracts}`)}`)
  console.log(`├${line}┤`)
  console.log(`│${pad(` 🎒 Inventory [${state.player.inventory.length}/${state.player.inventoryCapacity}]: ${invStr}`)}`)
  console.log(`│${pad(` 📦 Storage: ${storStr}`)}`)
  console.log(`│${pad(` 📊 Skills: ${skills}`)}`)
  console.log(`└${line}┘`)
}

function printLog(log: ActionLog): void {
  const W = 120
  const line = "─".repeat(W - 2)
  const pad = (s: string) => s.padEnd(W - 2) + "│"

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
      console.log(`│${pad(` 🏆 CONTRACT COMPLETE: ${c.contractId}  │  Consumed: ${consumed}  │  Granted: ${granted}  │  +${c.reputationGained} rep${xpStr}`)}`)
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
  console.log("├─────────────────────────────────────────────────────────────┤")
  console.log("│ state               - Show current world state              │")
  console.log("│ world               - Show world data (nodes, enemies, etc) │")
  console.log("│ help                - Show this help                        │")
  console.log("│ end                 - End session and show summary          │")
  console.log("│ quit                - Exit without summary                  │")
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

/**
 * Compute P(X >= k) for Poisson binomial distribution using DP.
 * probabilities: array of success probabilities for each trial
 * k: number of successes to compute P(X >= k) for
 */
function poissonBinomialProbAtLeast(probabilities: number[], k: number): number {
  const n = probabilities.length
  if (k > n) return 0
  if (k <= 0) return 1

  // dp[j] = probability of exactly j successes
  let dp = new Array(n + 1).fill(0)
  dp[0] = 1

  for (const p of probabilities) {
    const newDp = new Array(n + 1).fill(0)
    for (let j = 0; j <= n; j++) {
      if (dp[j] === 0) continue
      newDp[j] += dp[j] * (1 - p) // failure
      if (j + 1 <= n) {
        newDp[j + 1] += dp[j] * p // success
      }
    }
    dp = newDp
  }

  // Sum P(X >= k)
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

  // Expected value and standard deviation
  const expected = probabilities.reduce((sum, p) => sum + p, 0)
  const variance = probabilities.reduce((sum, p) => sum + p * (1 - p), 0)
  const sigma = Math.sqrt(variance)

  // Z-score
  const zScore = sigma > 0 ? (actualSuccesses - expected) / sigma : 0

  // Compute percentile based on whether we're above or below expected
  let percentile: number
  let label: string
  let position: string

  if (actualSuccesses >= expected) {
    // Lucky side: compute P(X >= actual)
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
    // Unlucky side: compute P(X <= actual)
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

  // Format sigma with sign
  const sigmaStr = zScore >= 0 ? `+${zScore.toFixed(1)}σ` : `${zScore.toFixed(1)}σ`

  // Build final string - always show position and label
  return `${position} (${label}) — ${actualSuccesses}/${n} vs ${expected.toFixed(1)} expected (${sigmaStr})`
}

function printSummary(state: WorldState, stats: SessionStats, objective: Objective): void {
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
  const expectedXPPerSkill: Record<SkillID, number> = {
    Mining: 0,
    Woodcutting: 0,
    Combat: 0,
    Smithing: 0,
    Logistics: 0,
  }
  for (const log of stats.logs) {
    if (log.skillGained) {
      xpGained[log.skillGained.skill] = (xpGained[log.skillGained.skill] || 0) + log.skillGained.amount
      totalXP += log.skillGained.amount
    }
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
          xpGained[c.xpGained.skill] = (xpGained[c.xpGained.skill] || 0) + c.xpGained.amount
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

  // Skill progression
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

  // Items in inventory + storage
  const allItems: Record<string, number> = {}
  for (const item of state.player.inventory) {
    allItems[item.itemId] = (allItems[item.itemId] || 0) + item.quantity
  }
  for (const item of state.player.storage) {
    allItems[item.itemId] = (allItems[item.itemId] || 0) + item.quantity
  }
  const itemsStr = Object.entries(allItems)
    .map(([id, qty]) => `${qty}x ${id}`)
    .join(", ") || "(none)"

  console.log(`\n╔${dline}╗`)
  console.log(`║${"SESSION SUMMARY".padStart(W / 2 + 7).padEnd(W - 2)}║`)
  console.log(`╠${dline}╣`)

  // Time & Efficiency
  const expectedXPTick = ticksUsed > 0 ? (expectedXP / ticksUsed).toFixed(2) : "0.00"
  const actualXPTick = ticksUsed > 0 ? (totalXP / ticksUsed).toFixed(2) : "0.00"
  console.log(pad(`⏱  TIME: ${ticksUsed}/${stats.totalSession} ticks  │  XP: ${totalXP} actual, ${expectedXP.toFixed(1)} expected  │  XP/tick: ${actualXPTick} actual, ${expectedXPTick} expected`))
  console.log(`├${line}┤`)

  // Actions breakdown
  const actionStrs = Object.entries(actionCounts).map(
    ([type, { success, fail, time }]) => `${type}: ${success}✓${fail > 0 ? ` ${fail}✗` : ""} (${time}t)`
  )
  console.log(pad(`📋 ACTIONS: ${stats.logs.length} total  │  ${actionStrs.join("  │  ")}`))
  console.log(`├${line}┤`)

  // Luck
  console.log(pad(`🎲 LUCK: ${luckStr}`))
  console.log(`├${line}┤`)

  // Volatility
  console.log(pad(`📉 VOLATILITY: ${volatilityStr}`))
  console.log(`├${line}┤`)

  // Risk to Objective
  console.log(pad(`🎯 RISK TO OBJECTIVE: ${riskToObjectiveStr}`))
  console.log(`├${line}┤`)

  // Skills
  console.log(pad(`📈 SKILLS: ${skillDelta.length > 0 ? skillDelta.join("  │  ") : "(no gains)"}`))
  // Expected levels line
  const allSkills: SkillID[] = ["Mining", "Woodcutting", "Combat", "Smithing", "Logistics"]
  const expectedLevelStrs: string[] = []
  for (const sk of allSkills) {
    if (expectedLevels[sk] > 0) {
      expectedLevelStrs.push(`${sk} +${expectedLevels[sk]}`)
    }
  }
  console.log(`├${line}┤`)
  console.log(pad(`📊 EXPECTED LEVELS: ${expectedLevelStrs.length > 0 ? expectedLevelStrs.join("  │  ") : "(none)"}`))
  console.log(`├${line}┤`)

  // Contracts & Rep
  console.log(pad(`🏆 CONTRACTS: ${contractsCompleted} completed  │  Reputation: ${state.player.guildReputation} (+${repGained} this session)`))
  console.log(`├${line}┤`)

  // Final inventory
  console.log(pad(`🎒 FINAL ITEMS: ${itemsStr}`))
  console.log(`╚${dline}╝`)
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
    stats.logs.push(log)
    printLog(log)
    printState(state)
  }

  if (showSummary) {
    if (state.time.sessionRemainingTicks <= 0) {
      console.log("\n⏰ Session time exhausted!")
    }
    printSummary(state, stats, OBJECTIVES.MAXIMIZE_XP)
  }

  rl.close()
}

main().catch(console.error)
