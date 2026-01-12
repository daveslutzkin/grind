import type { Action } from "../types.js"
import { GatherMode } from "../types.js"

/**
 * Parsed response from the LLM agent
 */
export interface AgentResponse {
  reasoning: string
  action: Action | null
  learning: string
  notes: string | null // Agent's persistent notes/memory
  continueCondition: string | null
  error?: string
}

/**
 * Extract a section from the response text
 */
function extractSection(text: string, sectionName: string): string {
  const patterns = [
    new RegExp(
      `${sectionName}:\\s*(.+?)(?=\\n(?:REASONING|ACTION|LEARNING|NOTES|CONTINUE_IF):|$)`,
      "is"
    ),
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

  // Try to parse Leave action (return to hub)
  if (/^leave$/i.test(text)) {
    return { type: "Leave" }
  }

  // Try to parse Go/Move action - engine resolves destination
  // Patterns: "Go to DEST", "Move to DEST", "Go DEST", "Move DEST"
  const goPatterns = [/^go\s+to\s+(.+)/i, /^go\s+(.+)/i, /^move\s+to\s+(.+)/i, /^move\s+(.+)/i]
  for (const pattern of goPatterns) {
    const match = text.match(pattern)
    if (match) {
      const destination = match[1].trim()
      return { type: "Move", destination }
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

  // Try to parse Enrol action (no arguments - skill resolved by engine)
  if (/^enrol$/i.test(text)) {
    return { type: "Enrol" }
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

  // Try to parse Fight action (no arguments - enemy resolved by engine)
  if (/^fight$/i.test(text)) {
    return { type: "Fight" }
  }

  // Try to parse AcceptContract action
  // Patterns: "accept CONTRACT_ID", "AcceptContract CONTRACT_ID"
  const acceptPatterns = [/^accept\s+(\S+)/i, /^acceptcontract\s+(\S+)/i]
  for (const pattern of acceptPatterns) {
    const match = text.match(pattern)
    if (match) {
      return { type: "AcceptContract", contractId: match[1] }
    }
  }

  // Try to parse TurnInCombatToken action
  if (/^turnincombattoken/i.test(text)) {
    return { type: "TurnInCombatToken" }
  }

  // Try to parse Explore action
  if (/^explore$/i.test(text)) {
    return { type: "Explore" }
  }

  // Try to parse Survey action
  if (/^survey$/i.test(text)) {
    return { type: "Survey" }
  }

  // Try to parse FarTravel action - engine resolves destination
  // Patterns: "FarTravel DEST", "Far DEST"
  const farTravelPatterns = [/^fartravel\s+(.+)/i, /^far\s+(.+)/i]
  for (const pattern of farTravelPatterns) {
    const match = text.match(pattern)
    if (match) {
      const destination = match[1].trim()
      return { type: "FarTravel", destinationAreaId: destination }
    }
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
  const notes = extractSection(response, "NOTES") || null
  const continueCondition = extractSection(response, "CONTINUE_IF") || null

  const action = parseAction(actionText)

  if (!action && actionText) {
    return {
      reasoning,
      action: null,
      learning,
      notes,
      continueCondition,
      error: `Could not parse action: "${actionText}"`,
    }
  }

  if (!action && !actionText) {
    return {
      reasoning,
      action: null,
      learning,
      notes,
      continueCondition,
      error: "No ACTION section found in response",
    }
  }

  return {
    reasoning,
    action,
    learning,
    notes,
    continueCondition,
  }
}
