/**
 * Batch runner for gathering MVP - executes a plan from command line arguments
 */

import { createWorld } from "./world.js"
import { executeAction } from "./engine.js"
import type { Action, ActionLog, WorldState, SkillID, SkillState, GatherMode } from "./types.js"
import { getTotalXP } from "./types.js"
import { writeFileSync } from "fs"

interface SessionStats {
  logs: ActionLog[]
  startingSkills: Record<SkillID, SkillState>
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
  const skills = `Mining:${state.player.skills.Mining.level} Woodcut:${state.player.skills.Woodcutting.level}`

  console.log(`┌${line}┐`)
  console.log(
    `│${pad(` 📍 ${state.exploration.playerState.currentAreaId}  │  ⏱ ${state.time.sessionRemainingTicks} ticks left  │  🎒 ${invStr}`)}`
  )
  console.log(`│${pad(` 📊 ${skills}`)}`)
  console.log(`└${line}┘`)
}

function printLog(log: ActionLog): void {
  const status = log.success ? "✓" : "✗"

  const skillStr = log.skillGained ? `+${log.skillGained.amount} ${log.skillGained.skill}` : ""

  const parts = [
    `${status} ${log.actionType}: ${log.stateDeltaSummary}`,
    `⏱ ${log.timeConsumed}t`,
    skillStr ? `📈 ${skillStr}` : "",
    log.failureType ? `❌ ${log.failureType}` : "",
  ].filter(Boolean)
  console.log(`  ${parts.join("  │  ")}`)

  // Show extraction details
  if (log.extraction) {
    const ext = log.extraction
    if (ext.extracted.length > 0) {
      const items = ext.extracted.map((e) => `${e.quantity}x ${e.itemId}`).join(", ")
      console.log(`    ⛏️  Extracted: ${items}`)
    }
    if (Object.keys(ext.collateralDamage).length > 0) {
      const dmg = Object.entries(ext.collateralDamage)
        .map(([k, v]) => `${v}x ${k}`)
        .join(", ")
      console.log(`    💥 Collateral: ${dmg}`)
    }
  }

  // Show level-ups
  if (log.levelUps) {
    for (const lu of log.levelUps) {
      console.log(`    📈 LEVEL UP: ${lu.skill} ${lu.fromLevel} → ${lu.toLevel}`)
    }
  }
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

  const skillDelta: string[] = []
  const skills: SkillID[] = ["Mining", "Woodcutting"]
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
    ([type, { success, fail, time }]) =>
      `${type}: ${success}✓${fail > 0 ? ` ${fail}✗` : ""} (${time}t)`
  )

  console.log(`\n╔${dline}╗`)
  console.log(`║${"SESSION SUMMARY".padStart(W / 2 + 7).padEnd(W - 2)}║`)
  console.log(`╠${dline}╣`)
  console.log(pad(`⏱  TIME: ${ticksUsed}/${stats.totalSession} ticks  │  XP: ${totalXP}`))
  console.log(`├${line}┤`)
  console.log(pad(`📋 ACTIONS: ${stats.logs.length} total  │  ${actionStrs.join("  │  ")}`))
  console.log(`├${line}┤`)
  console.log(pad(`📈 SKILLS: ${skillDelta.length > 0 ? skillDelta.join("  │  ") : "(no gains)"}`))
  console.log(`├${line}┤`)

  // Final inventory
  const allItems: Record<string, number> = {}
  for (const item of state.player.inventory) {
    allItems[item.itemId] = (allItems[item.itemId] || 0) + item.quantity
  }
  const itemsStr =
    Object.entries(allItems)
      .map(([id, qty]) => `${qty}x ${id}`)
      .join(", ") || "(none)"
  console.log(pad(`🎒 FINAL ITEMS: ${itemsStr}`))
  console.log(`╚${dline}╝`)
}

/**
 * Parse gathering-specific actions
 * Format:
 *   move <location>
 *   enrol mining|woodcutting
 *   gather <nodeId> <mode> [focusMaterial]
 *     mode: focus|careful|appraise
 */
function parseAction(cmd: string): Action | null {
  const parts = cmd.trim().split(/\s+/)
  const type = parts[0].toLowerCase()

  switch (type) {
    case "move": {
      const dest = parts[1]?.toUpperCase()
      // Basic validation - areas are discovered via exploration now
      if (!dest) {
        console.log(`  ⚠ Usage: move <areaId>`)
        return null
      }
      return { type: "Move", destination: dest }
    }

    case "enrol":
    case "enroll": {
      const skillName = parts[1]?.toLowerCase()
      if (skillName === "mining") {
        return { type: "Enrol", skill: "Mining" }
      } else if (skillName === "woodcutting") {
        return { type: "Enrol", skill: "Woodcutting" }
      }
      console.log("  ⚠ Usage: enrol mining|woodcutting")
      return null
    }

    case "gather": {
      const nodeId = parts[1]
      const modeName = parts[2]?.toLowerCase()
      const focusMaterial = parts[3]?.toUpperCase()

      if (!nodeId || !modeName) {
        console.log("  ⚠ Usage: gather <nodeId> <focus|careful|appraise> [material]")
        return null
      }

      let mode: GatherMode
      if (modeName === "focus") {
        mode = "FOCUS" as GatherMode
        if (!focusMaterial) {
          console.log("  ⚠ FOCUS mode requires a material: gather <nodeId> focus <material>")
          return null
        }
        return { type: "Gather", nodeId, mode, focusMaterialId: focusMaterial }
      } else if (modeName === "careful") {
        mode = "CAREFUL_ALL" as GatherMode
        return { type: "Gather", nodeId, mode }
      } else if (modeName === "appraise") {
        mode = "APPRAISE" as GatherMode
        return { type: "Gather", nodeId, mode }
      }

      console.log("  ⚠ Mode must be: focus, careful, or appraise")
      return null
    }

    default:
      console.log(`  ⚠ Unknown command: ${type}`)
      return null
  }
}

function main(): void {
  const args = process.argv.slice(2)

  // Check for --save flag
  const saveIndex = args.indexOf("--save")
  let savePath: string | null = null
  if (saveIndex !== -1) {
    savePath = args[saveIndex + 1]
    args.splice(saveIndex, 2)
  }

  if (args.length < 2) {
    console.log(
      "Usage: npx tsx src/gatherBatch.ts <seed> <command1> <command2> ... [--save <path>]"
    )
    console.log("")
    console.log("Commands:")
    console.log("  move <location>              - Move to a location")
    console.log("  enrol mining|woodcutting     - Enrol in a guild")
    console.log("  gather <node> focus <mat>    - Focus on one material")
    console.log("  gather <node> careful        - Carefully extract all")
    console.log("  gather <node> appraise       - Inspect node contents")
    console.log("")
    console.log(
      "Locations: TOWN, OUTSKIRTS_MINE, COPSE, OLD_QUARRY, DEEP_FOREST, ABANDONED_SHAFT, ANCIENT_GROVE"
    )
    console.log("")
    console.log("Example:")
    console.log("  npx tsx src/gatherBatch.ts test-1 'enrol mining' 'move OUTSKIRTS_MINE' \\")
    console.log("    'gather OUTSKIRTS_MINE-near_ore-0 focus COPPER_ORE'")
    process.exit(1)
  }

  const seed = args[0]
  const commands = args.slice(1)

  console.log(`\n=== Gathering Session (seed: ${seed}) ===\n`)
  const state = createWorld(seed)
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
      continue
    }
    const log = executeAction(state, action)
    stats.logs.push(log)
    printLog(log)
  }

  printSummary(state, stats)

  // Save trace if requested
  if (savePath) {
    const trace = {
      seed,
      commands,
      logs: stats.logs,
      finalState: {
        tick: state.time.currentTick,
        ticksRemaining: state.time.sessionRemainingTicks,
        miningLevel: state.player.skills.Mining.level,
        miningXP: state.player.skills.Mining.xp,
        woodcuttingLevel: state.player.skills.Woodcutting.level,
        woodcuttingXP: state.player.skills.Woodcutting.xp,
        inventory: state.player.inventory,
      },
    }
    writeFileSync(savePath, JSON.stringify(trace, null, 2))
    console.log(`\n💾 Trace saved to: ${savePath}`)
  }
}

main()
