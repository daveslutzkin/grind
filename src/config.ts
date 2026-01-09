/**
 * Global configuration for the simulation engine.
 * Set these values once at startup, and they'll be used throughout.
 */

export interface EngineConfig {
  /** Anthropic API key for LLM-generated area names. If not set, areas remain unnamed. */
  anthropicApiKey?: string
}

/** The global engine configuration */
let config: EngineConfig = {}

/**
 * Set the global engine configuration.
 * Call this once at startup before running any actions.
 */
export function setEngineConfig(newConfig: EngineConfig): void {
  config = { ...newConfig }
}

/**
 * Get the current engine configuration.
 */
export function getEngineConfig(): EngineConfig {
  return config
}

/**
 * Get the Anthropic API key from config, or from ANTHROPIC_API_KEY env var as fallback.
 */
export function getAnthropicApiKey(): string | undefined {
  return config.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY
}
