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
  // Patterns: "Go to DEST", "Move to DEST", "Go DEST", "Move DEST", "Goto DEST", "Travel DEST"
  const goPatterns = [
    /^go\s+to\s+(.+)/i,
    /^go\s+(.+)/i,
    /^goto\s+(.+)/i,
    /^move\s+to\s+(.+)/i,
    /^move\s+(.+)/i,
    /^travel\s+(.+)/i,
  ]
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
  // Patterns: "mine" (bare), "mine <material>" for FOCUS mode, "mine careful" or "mine appraise" for other modes
  const mineMatch = text.match(/^mine(?:\s+(\S+))?$/i)
  if (mineMatch) {
    const arg = mineMatch[1]?.toUpperCase()
    // Check for mode keywords
    if (arg === "CAREFUL_ALL" || arg === "CAREFUL") {
      return { type: "Mine", mode: GatherMode.CAREFUL_ALL } as Action
    } else if (arg === "APPRAISE") {
      return { type: "Mine", mode: GatherMode.APPRAISE } as Action
    } else if (arg) {
      // Treat as material ID (implicit FOCUS mode)
      return { type: "Mine", mode: GatherMode.FOCUS, focusMaterialId: arg } as Action
    } else {
      // Bare "mine" - FOCUS mode, engine will auto-select if only one material
      return { type: "Mine", mode: GatherMode.FOCUS } as Action
    }
  }

  // Try to parse Chop action (alias for gather woodcutting)
  // Patterns: "chop" (bare), "chop <material>" for FOCUS mode, "chop careful" or "chop appraise" for other modes
  const chopMatch = text.match(/^chop(?:\s+(\S+))?$/i)
  if (chopMatch) {
    const arg = chopMatch[1]?.toUpperCase()
    // Check for mode keywords
    if (arg === "CAREFUL_ALL" || arg === "CAREFUL") {
      return { type: "Chop", mode: GatherMode.CAREFUL_ALL } as Action
    } else if (arg === "APPRAISE") {
      return { type: "Chop", mode: GatherMode.APPRAISE } as Action
    } else if (arg) {
      // Treat as material ID (implicit FOCUS mode)
      return { type: "Chop", mode: GatherMode.FOCUS, focusMaterialId: arg } as Action
    } else {
      // Bare "chop" - FOCUS mode, engine will auto-select if only one material
      return { type: "Chop", mode: GatherMode.FOCUS } as Action
    }
  }

  // Try to parse Enrol action (no arguments - skill resolved by engine)
  // Supports both "enrol" and "enroll" spellings
  if (/^enrol{1,2}$/i.test(text)) {
    return { type: "Enrol" }
  }

  // Try to parse Craft action
  const craftMatch = text.match(/^craft\s+(\S+)/i)
  if (craftMatch) {
    return { type: "Craft", recipeId: craftMatch[1] }
  }

  // Try to parse Store action
  // Supports both "store 5 STONE" and "store STONE 5" formats
  const storeMatch1 = text.match(/^store\s+(\d+)\s+(\S+)/i)
  if (storeMatch1) {
    return {
      type: "Store",
      quantity: parseInt(storeMatch1[1], 10),
      itemId: storeMatch1[2],
    }
  }
  const storeMatch2 = text.match(/^store\s+(\S+)\s+(\d+)/i)
  if (storeMatch2) {
    return {
      type: "Store",
      itemId: storeMatch2[1],
      quantity: parseInt(storeMatch2[2], 10),
    }
  }

  // Try to parse Drop action
  // Supports both "drop 5 STONE" and "drop STONE 5" formats
  const dropMatch1 = text.match(/^drop\s+(\d+)\s+(\S+)/i)
  if (dropMatch1) {
    return {
      type: "Drop",
      quantity: parseInt(dropMatch1[1], 10),
      itemId: dropMatch1[2],
    }
  }
  const dropMatch2 = text.match(/^drop\s+(\S+)\s+(\d+)/i)
  if (dropMatch2) {
    return {
      type: "Drop",
      itemId: dropMatch2[1],
      quantity: parseInt(dropMatch2[2], 10),
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

  // Try to parse TurnInContract action
  // Patterns: "turn-in CONTRACT_ID", "turnin CONTRACT_ID", "TurnInContract CONTRACT_ID"
  const turnInPatterns = [/^turn-in\s+(\S+)/i, /^turnin\s+(\S+)/i, /^turnincontract\s+(\S+)/i]
  for (const pattern of turnInPatterns) {
    const match = text.match(pattern)
    if (match) {
      return { type: "TurnInContract", contractId: match[1] }
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
