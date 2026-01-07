import type { ActionLog, WorldState } from "../types.js"
import type { AgentKnowledge } from "./output.js"
import { getUnlockedModes, getNextModeUnlock } from "../actionChecks.js"
import { getCurrentAreaId } from "../types.js"

/**
 * Summarize an action and its result into a single concise line.
 * Format: T{tick}: {Action} → {Outcome}
 */
export function summarizeAction(log: ActionLog): string {
  const tick = `T${log.tickBefore}`
  const action = formatActionBrief(log)
  const outcome = formatOutcomeBrief(log)

  return `${tick}: ${action} → ${outcome}`
}

/**
 * Format action type and key parameters briefly
 */
function formatActionBrief(log: ActionLog): string {
  const params = log.parameters

  switch (log.actionType) {
    case "Gather":
      return `Gather ${params.nodeId} ${params.mode}${params.materialId ? " " + params.materialId : ""}`

    case "Move":
    case "ExplorationTravel":
      return `Move ${params.destination || params.destinationAreaId}`

    case "Enrol":
      return `Enrol ${params.skill}`

    case "Craft":
      return `Craft ${params.recipeId}`

    case "Store":
      return `Store ${params.quantity}x ${params.itemId}`

    case "Drop":
      return `Drop ${params.quantity}x ${params.itemId}`

    case "Fight":
      return `Fight ${params.enemyId}`

    case "AcceptContract":
      return `Accept ${params.contractId}`

    case "TurnInCombatToken":
      return "TurnInCombatToken"

    case "Survey":
      return "Survey"

    case "Explore":
      return "Explore"

    default:
      return log.actionType
  }
}

/**
 * Format outcome briefly
 */
function formatOutcomeBrief(log: ActionLog): string {
  if (!log.success) {
    return `FAIL: ${log.failureType || "unknown"}`
  }

  const parts: string[] = []

  // Items gained
  if (log.extraction && log.extraction.extracted.length > 0) {
    for (const item of log.extraction.extracted) {
      parts.push(`+${item.quantity} ${item.itemId}`)
    }
  }

  // XP gained
  if (log.skillGained) {
    parts.push(`+${log.skillGained.amount} ${log.skillGained.skill} XP`)
  }

  // Level ups
  if (log.levelUps && log.levelUps.length > 0) {
    for (const lu of log.levelUps) {
      parts.push(`${lu.skill}→L${lu.toLevel}`)
    }
  }

  // Contracts completed
  if (log.contractsCompleted && log.contractsCompleted.length > 0) {
    for (const cc of log.contractsCompleted) {
      parts.push(`completed:${cc.contractId}`)
    }
  }

  // Time cost for moves and other actions
  if (log.actionType === "Move" || log.actionType === "ExplorationTravel" || parts.length === 0) {
    if (log.timeConsumed > 0) {
      parts.push(`${log.timeConsumed}t`)
    } else {
      parts.push("OK")
    }
  }

  return parts.join(", ")
}

/**
 * Summarize multiple actions into a compact history block
 */
export function summarizeActionHistory(logs: ActionLog[]): string {
  if (logs.length === 0) return ""

  return logs.map(summarizeAction).join("\n")
}

/**
 * Condense learnings into key facts, removing redundancy
 */
export function summarizeLearnings(knowledge: AgentKnowledge): string {
  const facts: string[] = []

  // Extract key mechanics facts
  const mechanicsFacts = extractKeyFacts(knowledge.mechanics, [
    { pattern: /enrol.*?(\d+)\s*tick/i, template: "Enrol costs $1 ticks" },
    { pattern: /gather.*?(\d+)\s*tick/i, template: "Gather costs $1 ticks" },
    { pattern: /storage.*?0\s*tick/i, template: "Storage is free (0 ticks)" },
    { pattern: /drop.*?(\d+)\s*tick/i, template: "Drop costs $1 tick" },
    { pattern: /L1.*?5\s*XP|5\s*XP.*?L1/i, template: "L1 materials give 5 XP" },
    { pattern: /L2.*?10\s*XP|10\s*XP.*?L2/i, template: "L2 materials give 10 XP" },
    { pattern: /level\s*1.*?start|start.*?level\s*1/i, template: "Skills start at L1" },
    { pattern: /combat.*?weapon/i, template: "Combat enrol gives weapon" },
  ])
  facts.push(...mechanicsFacts)

  // Extract world facts
  const worldFacts = extractKeyFacts(knowledge.world, [
    {
      pattern: /(\d+)\s*tick.*?travel|travel.*?(\d+)\s*tick/i,
      template: "Travel costs vary by distance",
    },
    { pattern: /7.*?(location|area)|(?:location|area).*?7/i, template: "7 world areas" },
    { pattern: /storage.*?town/i, template: "Storage at TOWN" },
  ])
  facts.push(...worldFacts)

  // Extract item facts
  const itemFacts = extractKeyFacts(knowledge.items, [
    { pattern: /copper|tin|iron/i, template: "Ores: copper, tin, iron (by level)" },
    { pattern: /wood|softwood|hardwood/i, template: "Woods: green, soft, hard (by level)" },
  ])
  facts.push(...itemFacts)

  // Deduplicate
  const uniqueFacts = [...new Set(facts)]

  if (uniqueFacts.length === 0) {
    return ""
  }

  return "KNOWN: " + uniqueFacts.join(". ") + "."
}

interface FactPattern {
  pattern: RegExp
  template: string
}

/**
 * Extract key facts from a list of learnings using patterns
 */
function extractKeyFacts(learnings: string[], patterns: FactPattern[]): string[] {
  const facts: string[] = []

  for (const pattern of patterns) {
    for (const learning of learnings) {
      const match = learning.match(pattern.pattern)
      if (match) {
        // Replace $1, $2 etc with captured groups
        let fact = pattern.template
        for (let i = 1; i < match.length; i++) {
          if (match[i]) {
            fact = fact.replace(`$${i}`, match[i])
          }
        }
        facts.push(fact)
        break // Only add each fact once
      }
    }
  }

  return facts
}

/**
 * Extract static world data that doesn't change between ticks.
 * This can be cached in the prompt.
 */
export function extractStaticWorldData(state: WorldState): string {
  const lines: string[] = []

  lines.push("WORLD REFERENCE (static):")

  // All known areas
  lines.push(`Areas: ${state.exploration.playerState.knownAreaIds.join(", ")}`)

  // Travel connections (known connections)
  const travelPairs: string[] = []
  for (const connId of state.exploration.playerState.knownConnectionIds) {
    const [from, to] = connId.split("->")
    const connection = state.exploration.connections.find(
      (c) => c.fromAreaId === from && c.toAreaId === to
    )
    if (connection) {
      travelPairs.push(`${connId}=${connection.travelTimeMultiplier}t`)
    }
  }
  lines.push(`Travel: ${travelPairs.join(", ")}`)

  // Recipes (if any)
  if (state.world.recipes.length > 0) {
    const recipeList = state.world.recipes.map((r) => {
      const inputs = r.inputs.map((i) => `${i.quantity}x${i.itemId}`).join("+")
      return `${r.id}@${r.requiredAreaId}:${inputs}→${r.output.quantity}x${r.output.itemId}`
    })
    lines.push(`Recipes: ${recipeList.join("; ")}`)
  }

  // Contract templates (available contracts)
  if (state.world.contracts.length > 0) {
    const contractList = state.world.contracts.map((c) => {
      const reqs = c.requirements.map((r) => `${r.quantity}x${r.itemId}`).join("+")
      const rewards = c.rewards.map((r) => `${r.quantity}x${r.itemId}`).join("+")
      return `${c.id}@${c.guildAreaId}:${reqs}→${rewards}`
    })
    lines.push(`Contracts: ${contractList.join("; ")}`)
  }

  return lines.join("\n")
}

/**
 * Format current dynamic state (things that change each tick)
 */
export function formatDynamicState(state: WorldState): string {
  const lines: string[] = []
  const currentArea = getCurrentAreaId(state)

  lines.push("CURRENT STATE:")
  lines.push(`Location: ${currentArea}`)
  lines.push(
    `Ticks: ${state.time.sessionRemainingTicks} remaining (used ${state.time.currentTick})`
  )

  // Inventory (compact)
  if (state.player.inventory.length > 0) {
    const items = state.player.inventory.map((i) => `${i.quantity}x${i.itemId}`).join(", ")
    lines.push(
      `Inventory [${state.player.inventory.length}/${state.player.inventoryCapacity}]: ${items}`
    )
  } else {
    lines.push(`Inventory [0/${state.player.inventoryCapacity}]: empty`)
  }

  // Storage (compact)
  if (state.player.storage.length > 0) {
    const items = state.player.storage.map((i) => `${i.quantity}x${i.itemId}`).join(", ")
    lines.push(`Storage: ${items}`)
  }

  // Skills (compact, only show enrolled)
  const skillParts: string[] = []
  const gatherModes: string[] = []
  for (const [skillId, skillState] of Object.entries(state.player.skills)) {
    if (skillState.level > 0) {
      skillParts.push(`${skillId}:L${skillState.level}(${skillState.xp}xp)`)
      // Track gather modes for gathering skills
      if (skillId === "Mining" || skillId === "Woodcutting") {
        const modes = getUnlockedModes(skillState.level)
        const nextUnlock = getNextModeUnlock(skillState.level)
        const nextStr = nextUnlock ? ` [next: ${nextUnlock.mode}@L${nextUnlock.level}]` : ""
        gatherModes.push(`${skillId}: ${modes.join("/")}${nextStr}`)
      }
    }
  }
  if (skillParts.length > 0) {
    lines.push(`Skills: ${skillParts.join(", ")}`)
    if (gatherModes.length > 0) {
      lines.push(`Gather modes: ${gatherModes.join("; ")}`)
    }
  } else {
    lines.push("Skills: none enrolled")
  }

  // Active contracts
  if (state.player.activeContracts.length > 0) {
    lines.push(`Active contracts: ${state.player.activeContracts.join(", ")}`)
  }

  // Resource nodes at current location (only show what's here and not depleted)
  const nodesHere = state.world.nodes?.filter((n) => n.areaId === currentArea && !n.depleted)
  if (nodesHere && nodesHere.length > 0) {
    lines.push("Nodes here:")
    for (const node of nodesHere) {
      // Determine required skill from node type
      const requiredSkill = node.nodeType === "ORE_VEIN" ? "Mining" : "Woodcutting"
      const hasSkill = (state.player.skills[requiredSkill]?.level ?? 0) > 0

      if (!hasSkill) {
        // Player hasn't enrolled in the gathering skill - just show node type
        const nodeTypeName = node.nodeType === "ORE_VEIN" ? "Mining node" : "Woodcutting node"
        lines.push(`  ${node.nodeId}: ${nodeTypeName}`)
      } else {
        const mats = node.materials
          .map((m) => {
            const req = m.requiredLevel > 0 ? `[${m.requiresSkill}L${m.requiredLevel}]` : ""
            return `${m.materialId}:${m.remainingUnits}/${m.maxUnitsInitial}${req}`
          })
          .join(", ")
        lines.push(`  ${node.nodeId}(${node.nodeType}): ${mats}`)
      }
    }
  }

  // Enemies at current location
  const enemiesHere = state.world.enemies.filter((e) => e.areaId === currentArea)
  if (enemiesHere.length > 0) {
    const enemyList = enemiesHere.map((e) => `${e.id}[Combat L${e.requiredSkillLevel}]`).join(", ")
    lines.push(`Enemies here: ${enemyList}`)
  }

  return lines.join("\n")
}
