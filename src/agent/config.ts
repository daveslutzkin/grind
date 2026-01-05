import { readFileSync, existsSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"

/**
 * Current rules version - bump when game rules change significantly
 * This is used to organize traces by rule version for comparison
 */
export const RULES_VERSION = "rules_0"

/**
 * Agent configuration loaded from config file
 */
export interface AgentConfig {
  openaiApiKey: string
  model: string
}

/**
 * Default configuration when no config file is found
 */
const DEFAULT_CONFIG: AgentConfig = {
  openaiApiKey: "",
  model: "gpt-4o-mini",
}

/**
 * Load agent configuration from a JSON file
 * Falls back to defaults if file doesn't exist or is invalid
 */
export function loadAgentConfig(configPath?: string): AgentConfig {
  const path =
    configPath ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../agent-config.json")

  if (!existsSync(path)) {
    return { ...DEFAULT_CONFIG }
  }

  try {
    const content = readFileSync(path, "utf-8")
    const parsed = JSON.parse(content)
    return {
      openaiApiKey: parsed.openaiApiKey ?? DEFAULT_CONFIG.openaiApiKey,
      model: parsed.model ?? DEFAULT_CONFIG.model,
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}
