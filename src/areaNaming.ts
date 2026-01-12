/**
 * Area naming system using LLM to generate evocative place names
 */

import Anthropic from "@anthropic-ai/sdk"
import type { Area, AreaConnection, AreaID } from "./types.js"
import { ExplorationLocationType } from "./types.js"
import { getAnthropicApiKey } from "./config.js"
import { isCacheEnabled, getCachedResponse, storeCachedResponse } from "./llmCache.js"

/** Model to use for area naming (fast and cheap) */
const NAMING_MODEL = "claude-3-5-haiku-latest"

/** Fallback name when LLM call fails (not when API key is missing) */
const FALLBACK_NAME = "Unnamed Wilds"

/**
 * Build a prompt for the LLM to generate an area name.
 * The prompt includes context about the area's distance from town,
 * what locations it contains, and the names of neighboring areas.
 *
 * @param area - The area to name
 * @param neighborNames - Names of neighboring areas for thematic context
 * @param excludeNames - Names to explicitly exclude (used when retrying after duplicates)
 */
export function buildAreaNamingPrompt(
  area: Area,
  neighborNames: string[],
  excludeNames: string[] = []
): string {
  // Build distance description
  const distanceDesc =
    area.distance === 1
      ? "Being close to town, this area feels relatively safe and settled, though still wild."
      : area.distance === 2
        ? "This area is moderately remote, a frontier zone between civilization and wilderness."
        : area.distance >= 3
          ? "This is a remote and dangerous frontier area, far from civilization and full of unknown perils."
          : ""

  // Count location types
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

  // Build features section
  let featuresSection: string
  if (area.locations.length > 0) {
    const features: string[] = []
    if (miningNodes.length > 0) {
      features.push(`- ${miningNodes.length} ore/mineral deposit(s) suitable for mining`)
    }
    if (woodcuttingNodes.length > 0) {
      features.push(
        `- ${woodcuttingNodes.length} forest/tree stand(s) suitable for woodcutting/lumber`
      )
    }
    if (mobCamps.length > 0) {
      features.push(`- ${mobCamps.length} hostile creature camp(s) with monsters`)
    }
    featuresSection = `Notable features in this area:\n${features.join("\n")}`
  } else {
    featuresSection =
      "This area has no notable features - it's a quiet, unremarkable stretch of land."
  }

  // Build neighbor section
  const neighborSection =
    neighborNames.length > 0
      ? `Neighboring areas are named:\n${neighborNames.map((n) => `- ${n}`).join("\n")}

The name should feel thematically consistent with these neighbors, but not repetitive.`
      : ""

  // Build exclusion section if names should be avoided
  const exclusionSection =
    excludeNames.length > 0
      ? `\n\nIMPORTANT: The following names are already taken - definitely don't use these:
${excludeNames.map((n) => `- ${n}`).join("\n")}`
      : ""

  return `Generate a short, evocative place name for a wilderness area in a fantasy world.

This area is at distance ${area.distance} from town.
${distanceDesc}

${featuresSection}

${neighborSection}${exclusionSection}

Requirements:
- Generate a short 1-3 word name (occasionally slightly longer if it sounds good)
- Use evocative place-style names like 'Thornwood', 'The Scarred Basin', 'Misthollow', 'Alder's Rest'
- The name can be inspired by the features but doesn't have to directly reference them
- Don't make every mining area 'Something Ore' or 'Iron Something'
- Be creative and varied
- DON'T make every name 2 words, even though lots can be

Respond with ONLY the area name, nothing else.`.trim()
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
 * Returns undefined if no API key is configured (areas stay unnamed).
 * Returns a fallback name if the API call fails or returns empty.
 *
 * @param area - The area to name
 * @param neighborNames - Names of neighboring areas for thematic context
 * @param existingNames - All existing area names to ensure uniqueness
 * @param apiKey - Anthropic API key (optional, falls back to global config)
 * @param client - Optional Anthropic client for dependency injection (used in tests)
 */
export async function generateAreaName(
  area: Area,
  neighborNames: string[],
  existingNames: string[] = [],
  apiKey?: string,
  client?: AnthropicMessagesClient
): Promise<string | undefined> {
  // Check cache first for deterministic replays
  if (isCacheEnabled()) {
    const prompt = buildAreaNamingPrompt(area, neighborNames, [])
    const cached = getCachedResponse(prompt)
    if (cached !== undefined) {
      return cached || FALLBACK_NAME
    }
  }

  const effectiveApiKey = apiKey ?? getAnthropicApiKey()

  // If no API key available, skip LLM call entirely - areas stay unnamed
  if (!effectiveApiKey && !client) {
    return undefined
  }

  const messagesClient = client ?? new Anthropic({ apiKey: effectiveApiKey! }).messages

  // Try to generate a unique name, retrying if we get a duplicate
  const maxRetries = 3
  const usedNames: string[] = []

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const prompt = buildAreaNamingPrompt(area, neighborNames, usedNames)

    try {
      const response = await messagesClient.create({
        model: NAMING_MODEL,
        max_tokens: 30,
        messages: [{ role: "user", content: prompt }],
      })

      const text = response.content[0]?.type === "text" ? response.content[0].text : ""
      const name = (text ?? "").trim()

      if (!name) {
        // Cache the empty response as fallback
        if (isCacheEnabled()) {
          storeCachedResponse(prompt, "")
        }
        return FALLBACK_NAME
      }

      // Check if name is unique
      if (existingNames.includes(name)) {
        // Name is a duplicate - add to exclusion list and retry
        usedNames.push(name)
        continue
      }

      // Success - unique name generated
      // Cache the response for replay
      if (isCacheEnabled()) {
        storeCachedResponse(prompt, name)
      }
      return name
    } catch {
      // On error, return fallback
      return FALLBACK_NAME
    }
  }

  // If we exhausted retries, return fallback
  return FALLBACK_NAME
}
