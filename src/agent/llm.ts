import Anthropic from "@anthropic-ai/sdk"
import type { AgentConfig } from "./config.js"

/**
 * Message format for LLM conversation
 */
export interface LLMMessage {
  role: "system" | "user" | "assistant"
  content: string
}

/**
 * LLM client wrapper for Anthropic API
 */
export interface LLMClient {
  /**
   * Get the model being used
   */
  getModel(): string

  /**
   * Set the system prompt (clears history and adds system message)
   */
  setSystemPrompt(prompt: string): void

  /**
   * Add a message to the conversation history
   */
  addMessage(message: LLMMessage): void

  /**
   * Get the current conversation history
   */
  getHistory(): LLMMessage[]

  /**
   * Clear the conversation history
   */
  clearHistory(): void

  /**
   * Set maximum history length for context window management
   */
  setHistoryLimit(limit: number): void

  /**
   * Send a message and get a response from the LLM
   */
  chat(userMessage: string): Promise<string>
}

/**
 * Create an LLM client with the given configuration
 */
export function createLLMClient(config: AgentConfig): LLMClient {
  if (!config.anthropicApiKey) {
    throw new Error("API key is required")
  }

  const anthropic = new Anthropic({
    apiKey: config.anthropicApiKey,
  })

  let history: LLMMessage[] = []
  let historyLimit: number | null = null
  let systemPrompt: string = ""
  const model = config.model

  function trimHistory(): void {
    if (historyLimit !== null && history.length > historyLimit) {
      // Keep system message if present
      const systemMessage = history.find((m) => m.role === "system")
      const nonSystemMessages = history.filter((m) => m.role !== "system")

      // Keep only the last N non-system messages
      const trimmedNonSystem = nonSystemMessages.slice(-(historyLimit - (systemMessage ? 1 : 0)))

      history = systemMessage ? [systemMessage, ...trimmedNonSystem] : trimmedNonSystem
    }
  }

  return {
    getModel(): string {
      return model
    },

    setSystemPrompt(prompt: string): void {
      // Store system prompt separately for Anthropic API
      systemPrompt = prompt
      // Also add to history for getHistory() compatibility
      history = [{ role: "system", content: prompt }]
    },

    addMessage(message: LLMMessage): void {
      history.push(message)
      trimHistory()
    },

    getHistory(): LLMMessage[] {
      return [...history]
    },

    clearHistory(): void {
      history = []
      systemPrompt = ""
    },

    setHistoryLimit(limit: number): void {
      historyLimit = limit
      trimHistory()
    },

    async chat(userMessage: string): Promise<string> {
      // Add user message to history
      this.addMessage({ role: "user", content: userMessage })

      // Build messages array for Anthropic (exclude system messages)
      const messages = history
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))

      try {
        const response = await anthropic.messages.create({
          model,
          max_tokens: 1024,
          system: systemPrompt,
          messages,
        })

        // Extract text from response
        const assistantMessage =
          response.content[0]?.type === "text" ? response.content[0].text : ""

        // Add assistant response to history
        this.addMessage({ role: "assistant", content: assistantMessage })

        return assistantMessage
      } catch (error) {
        // Retry logic for transient failures
        if (error instanceof Error) {
          const isRetryable =
            error.message.includes("rate limit") ||
            error.message.includes("timeout") ||
            error.message.includes("ECONNRESET") ||
            error.message.includes("overloaded")

          if (isRetryable) {
            // Wait and retry once
            await new Promise((resolve) => globalThis.setTimeout(resolve, 2000))

            const response = await anthropic.messages.create({
              model,
              max_tokens: 1024,
              system: systemPrompt,
              messages,
            })

            const assistantMessage =
              response.content[0]?.type === "text" ? response.content[0].text : ""
            this.addMessage({ role: "assistant", content: assistantMessage })
            return assistantMessage
          }
        }

        throw error
      }
    },
  }
}
