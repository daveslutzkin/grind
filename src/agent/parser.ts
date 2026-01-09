import type { Action, SkillID } from "../types.js"
import { GatherMode } from "../types.js"

/**
 * Valid skill names for normalization
 */
const VALID_SKILLS: SkillID[] = [
  "Mining",
  "Woodcutting",
  "Combat",
  "Smithing",
  "Woodcrafting",
  "Exploration",
]

/**
 * Normalize a skill name to match the exact SkillID casing
 * Returns null if no match found
 */
function normalizeSkillName(input: string): SkillID | null {
  const lower = input.toLowerCase()
  for (const skill of VALID_SKILLS) {
    if (skill.toLowerCase() === lower) {
      return skill
    }
  }
  return null
}

/**
 * Parsed response from the LLM agent
 */
export interface AgentResponse {
  reasoning: string
  action: Action | null
  learning: string
  continueCondition: string | null
  error?: string
}

/**
 * Extract a section from the response text
 */
function extractSection(text: string, sectionName: string): string {
  const patterns = [
    new RegExp(`${sectionName}:\\s*(.+?)(?=\\n(?:REASONING|ACTION|LEARNING|CONTINUE_IF):|$)`, "is"),
    new RegExp(`${sectionName}:\\s*(.+)`, "i"),
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      return match[1].trim()
    }
  }
  return ""
}

/**
 * Parse the ACTION section into an Action object
 */
function parseAction(actionText: string): Action | null {
  if (!actionText) return null

  // Normalize the text
  const text = actionText.trim()

  // Try to parse Move action
  // Patterns: "Move to LOCATION", "Move LOCATION", "Move(destination=LOCATION)"
  const movePatterns = [
    /^move\s+to\s+(\w+)/i,
    /^move\s+(\w+)/i,
    /^move\s*\(\s*destination\s*=\s*(\w+)\s*\)/i,
  ]
  for (const pattern of movePatterns) {
    const match = text.match(pattern)
    if (match) {
      return { type: "Move", destination: match[1] }
    }
  }

  // Try to parse Gather action
  // Patterns: "Gather node NODE_ID MODE [MATERIAL]", "Gather NODE_ID MODE [MATERIAL]"
  const gatherPatterns = [
    /^gather\s+node\s+(\S+)\s+(FOCUS|CAREFUL_ALL|APPRAISE)(?:\s+(\S+))?/i,
    /^gather\s+(\S+)\s+(FOCUS|CAREFUL_ALL|APPRAISE)(?:\s+(\S+))?/i,
  ]
  for (const pattern of gatherPatterns) {
    const match = text.match(pattern)
    if (match) {
      const mode = match[2].toUpperCase() as GatherMode
      const action: Action = {
        type: "Gather",
        nodeId: match[1],
        mode,
      }
      if (mode === "FOCUS" && match[3]) {
        ;(action as { focusMaterialId?: string }).focusMaterialId = match[3]
      }
      return action
    }
  }

  // Legacy gather without mode
  const legacyGatherMatch = text.match(/^gather\s+(\S+)/i)
  if (legacyGatherMatch) {
    return { type: "Gather", nodeId: legacyGatherMatch[1] }
  }

  // Try to parse Mine action (alias for gather mining)
  // Patterns: "mine MODE [MATERIAL]"
  const mineMatch = text.match(/^mine\s+(FOCUS|CAREFUL_ALL|APPRAISE)(?:\s+(\S+))?/i)
  if (mineMatch) {
    const mode = mineMatch[1].toUpperCase() as GatherMode
    const action: Action = { type: "Mine", mode }
    if (mode === "FOCUS" && mineMatch[2]) {
      ;(action as { focusMaterialId?: string }).focusMaterialId = mineMatch[2]
    }
    return action
  }

  // Try to parse Chop action (alias for gather woodcutting)
  // Patterns: "chop MODE [MATERIAL]"
  const chopMatch = text.match(/^chop\s+(FOCUS|CAREFUL_ALL|APPRAISE)(?:\s+(\S+))?/i)
  if (chopMatch) {
    const mode = chopMatch[1].toUpperCase() as GatherMode
    const action: Action = { type: "Chop", mode }
    if (mode === "FOCUS" && chopMatch[2]) {
      ;(action as { focusMaterialId?: string }).focusMaterialId = chopMatch[2]
    }
    return action
  }

  // Try to parse Enrol action
  const enrolMatch = text.match(/^enrol\s+(\w+)/i)
  if (enrolMatch) {
    const skill = normalizeSkillName(enrolMatch[1])
    if (skill) {
      return { type: "Enrol", skill }
    }
    // Invalid skill name - will be handled as parse error
    return null
  }

  // Try to parse Craft action
  const craftMatch = text.match(/^craft\s+(\S+)/i)
  if (craftMatch) {
    return { type: "Craft", recipeId: craftMatch[1] }
  }

  // Try to parse Store action
  const storeMatch = text.match(/^store\s+(\d+)\s+(\S+)/i)
  if (storeMatch) {
    return {
      type: "Store",
      quantity: parseInt(storeMatch[1], 10),
      itemId: storeMatch[2],
    }
  }

  // Try to parse Drop action
  const dropMatch = text.match(/^drop\s+(\d+)\s+(\S+)/i)
  if (dropMatch) {
    return {
      type: "Drop",
      quantity: parseInt(dropMatch[1], 10),
      itemId: dropMatch[2],
    }
  }

  // Try to parse Fight action
  const fightMatch = text.match(/^fight\s+(\S+)/i)
  if (fightMatch) {
    return { type: "Fight", enemyId: fightMatch[1] }
  }

  // Try to parse AcceptContract action
  const acceptMatch = text.match(/^acceptcontract\s+(\S+)/i)
  if (acceptMatch) {
    return { type: "AcceptContract", contractId: acceptMatch[1] }
  }

  // Try to parse TurnInCombatToken action
  if (/^turnincombattoken/i.test(text)) {
    return { type: "TurnInCombatToken" }
  }

  return null
}

/**
 * Parse an LLM response into a structured AgentResponse
 */
export function parseAgentResponse(response: string): AgentResponse {
  const reasoning = extractSection(response, "REASONING")
  const actionText = extractSection(response, "ACTION")
  const learning = extractSection(response, "LEARNING")
  const continueCondition = extractSection(response, "CONTINUE_IF") || null

  const action = parseAction(actionText)

  if (!action && actionText) {
    return {
      reasoning,
      action: null,
      learning,
      continueCondition,
      error: `Could not parse action: "${actionText}"`,
    }
  }

  if (!action && !actionText) {
    return {
      reasoning,
      action: null,
      learning,
      continueCondition,
      error: "No ACTION section found in response",
    }
  }

  return {
    reasoning,
    action,
    learning,
    continueCondition,
  }
}
