import type { ActionLog } from "../types.js"
import type { AgentKnowledge } from "./output.js"

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
    return `FAIL: ${log.failureDetails?.type || "unknown"}`
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
