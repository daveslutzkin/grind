/**
 * User interaction for save/resume prompts
 */

import * as readline from "readline/promises"
import type { SaveFile } from "./persistence.js"
import { getAreaDisplayName } from "./exploration.js"

/**
 * Format a detailed summary of a save file for user review
 */
export function formatSaveSummary(save: SaveFile): string {
  const state = save.state
  const savedDate = new Date(save.savedAt)
  const formattedDate = `${savedDate.toISOString().split("T")[0]} ${savedDate.toTimeString().split(" ")[0].slice(0, 5)}`

  // Calculate progress percentage
  const totalTicks = state.time.currentTick + state.time.sessionRemainingTicks
  const progressPercent =
    totalTicks > 0 ? Math.round((state.time.currentTick / totalTicks) * 100) : 0

  // Get current area name
  const currentAreaId = state.exploration.playerState.currentAreaId
  const currentArea = state.exploration.areas[currentAreaId]
  const areaName = getAreaDisplayName(currentAreaId, currentArea)

  // Format skills (display all 6 skills in 2 rows of 3)
  const skills = state.player.skills
  const skillLine1 = `Mining: ${skills.Mining.level} | Woodcutting: ${skills.Woodcutting.level} | Combat: ${skills.Combat.level}`
  const skillLine2 = `Smithing: ${skills.Smithing.level} | Woodcrafting: ${skills.Woodcrafting.level} | Exploration: ${skills.Exploration.level}`

  // Calculate inventory used
  const inventoryUsed = state.player.inventory.reduce((sum, item) => sum + item.quantity, 0)
  const inventoryStr = `${inventoryUsed}/${state.player.inventoryCapacity} slots`

  // Active contracts
  const activeContracts = state.player.activeContracts.length

  // Guild reputation
  const reputation = state.player.guildReputation

  const summary = [
    `\nSave found for seed '${save.seed}':`,
    `  Last saved: ${formattedDate}`,
    `  Progress: Tick ${state.time.currentTick.toLocaleString()} of ${totalTicks.toLocaleString()} (${progressPercent}%)`,
    `  Current area: ${areaName}`,
    ``,
    `  Skills:`,
    `    ${skillLine1}`,
    `    ${skillLine2}`,
    ``,
    `  Inventory: ${inventoryStr}`,
    `  Active contracts: ${activeContracts}`,
    `  Guild reputation: ${reputation}`,
    ``,
  ].join("\n")

  return summary
}

/**
 * Prompt the user to resume a saved game
 * Returns true if user wants to resume, false otherwise
 */
export async function promptResume(save: SaveFile): Promise<boolean> {
  const summary = formatSaveSummary(save)
  console.log(summary)

  // Create readline interface for prompt
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const answer = await rl.question("Resume this game? (y/n): ")
    const normalized = answer.trim().toLowerCase()
    return normalized === "y" || normalized === "yes"
  } finally {
    rl.close()
  }
}
