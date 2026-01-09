/**
 * Area naming system using LLM to generate evocative place names
 */

import Anthropic from "@anthropic-ai/sdk"
import type { Area, AreaConnection, AreaID } from "./types.js"
import { ExplorationLocationType } from "./types.js"

/** Model to use for area naming (fast and cheap) */
const NAMING_MODEL = "claude-3-5-haiku-latest"

/** Fallback name when LLM fails */
const FALLBACK_NAME = "Unnamed Wilds"

/**
 * Build a prompt for the LLM to generate an area name.
 * The prompt includes context about the area's distance from town,
 * what locations it contains, and the names of neighboring areas.
 */
export function buildAreaNamingPrompt(area: Area, neighborNames: string[]): string {
  const parts: string[] = []

  // Introduction
  parts.push("Generate a short, evocative place name for a wilderness area in a fantasy world.")
  parts.push("")

  // Distance and safety context
  parts.push(`This area is at distance ${area.distance} from town.`)

  if (area.distance === 1) {
    parts.push(
      "Being close to town, this area feels relatively safe and settled, though still wild."
    )
  } else if (area.distance === 2) {
    parts.push(
      "This area is moderately remote, a frontier zone between civilization and wilderness."
    )
  } else if (area.distance >= 3) {
    parts.push(
      "This is a remote and dangerous frontier area, far from civilization and full of unknown perils."
    )
  }
  parts.push("")

  // Location information
  const miningNodes = area.locations.filter(
    (loc) =>
      loc.type === ExplorationLocationType.GATHERING_NODE && loc.gatheringSkillType === "Mining"
  )
  const woodcuttingNodes = area.locations.filter(
    (loc) =>
      loc.type === ExplorationLocationType.GATHERING_NODE &&
      loc.gatheringSkillType === "Woodcutting"
  )
  const mobCamps = area.locations.filter((loc) => loc.type === ExplorationLocationType.MOB_CAMP)

  if (area.locations.length > 0) {
    parts.push("Notable features in this area:")
    if (miningNodes.length > 0) {
      parts.push(`- ${miningNodes.length} ore/mineral deposit(s) suitable for mining`)
    }
    if (woodcuttingNodes.length > 0) {
      parts.push(
        `- ${woodcuttingNodes.length} forest/tree stand(s) suitable for woodcutting/lumber`
      )
    }
    if (mobCamps.length > 0) {
      parts.push(`- ${mobCamps.length} hostile creature camp(s) with monsters`)
    }
    parts.push("")
  } else {
    parts.push("This area has no notable features - it's a quiet, unremarkable stretch of land.")
    parts.push("")
  }

  // Neighbor context
  if (neighborNames.length > 0) {
    parts.push("Neighboring areas are named:")
    for (const name of neighborNames) {
      parts.push(`- ${name}`)
    }
    parts.push("")
    parts.push(
      "The name should feel thematically consistent with these neighbors, but not repetitive."
    )
    parts.push("")
  }

  // Instructions
  parts.push("Requirements:")
  parts.push("- Generate a short 1-3 word name (occasionally slightly longer if it sounds good)")
  parts.push(
    "- Use evocative place-style names like 'Thornwood', 'The Scarred Basin', 'Misthollow', 'Alder's Rest'"
  )
  parts.push(
    "- The name can be inspired by the features but doesn't have to directly reference them"
  )
  parts.push("- Don't make every mining area 'Something Ore' or 'Iron Something'")
  parts.push("- Be creative and varied")
  parts.push("")
  parts.push("Respond with ONLY the area name, nothing else.")

  return parts.join("\n")
}

/**
 * Get the names of neighboring areas that already have names.
 * Used to provide thematic context for naming a new area.
 */
export function getNeighborNames(
  area: Area,
  areas: Map<AreaID, Area>,
  connections: AreaConnection[]
): string[] {
  const neighborNames: string[] = []

  for (const conn of connections) {
    let neighborId: AreaID | null = null

    if (conn.fromAreaId === area.id) {
      neighborId = conn.toAreaId
    } else if (conn.toAreaId === area.id) {
      neighborId = conn.fromAreaId
    }

    if (neighborId) {
      const neighbor = areas.get(neighborId)
      if (neighbor?.name) {
        neighborNames.push(neighbor.name)
      }
    }
  }

  return neighborNames
}

/**
 * Interface for the Anthropic client's messages.create method
 * Used for dependency injection in tests
 */
export interface AnthropicMessagesClient {
  create(params: {
    model: string
    max_tokens: number
    messages: Array<{ role: string; content: string }>
  }): Promise<{ content: Array<{ type: string; text?: string }> }>
}

/**
 * Generate a name for an area using the LLM.
 * Returns a fallback name if the API call fails or returns empty.
 *
 * @param area - The area to name
 * @param neighborNames - Names of neighboring areas for thematic context
 * @param apiKey - Anthropic API key
 * @param client - Optional Anthropic client for dependency injection (used in tests)
 */
export async function generateAreaName(
  area: Area,
  neighborNames: string[],
  apiKey: string,
  client?: AnthropicMessagesClient
): Promise<string> {
  const prompt = buildAreaNamingPrompt(area, neighborNames)

  try {
    const messagesClient = client ?? new Anthropic({ apiKey }).messages

    const response = await messagesClient.create({
      model: NAMING_MODEL,
      max_tokens: 30,
      messages: [{ role: "user", content: prompt }],
    })

    const text = response.content[0]?.type === "text" ? response.content[0].text : ""
    const name = (text ?? "").trim()

    if (!name) {
      return FALLBACK_NAME
    }

    return name
  } catch {
    return FALLBACK_NAME
  }
}
