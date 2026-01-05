import OpenAI from "openai"
import type { AgentConfig } from "./config.js"

/**
 * Message format for LLM conversation
 */
export interface LLMMessage {
  role: "system" | "user" | "assistant"
  content: string
}

/**
 * LLM client wrapper for OpenAI API
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
  if (!config.openaiApiKey) {
    throw new Error("API key is required")
  }

  const openai = new OpenAI({
    apiKey: config.openaiApiKey,
  })

  let history: LLMMessage[] = []
  let historyLimit: number | null = null
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
      // Clear history and add system message
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
    },

    setHistoryLimit(limit: number): void {
      historyLimit = limit
      trimHistory()
    },

    async chat(userMessage: string): Promise<string> {
      // Add user message to history
      this.addMessage({ role: "user", content: userMessage })

      try {
        const response = await openai.chat.completions.create({
          model,
          messages: history.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          temperature: 0.7,
          max_tokens: 1000,
        })

        const assistantMessage = response.choices[0]?.message?.content ?? ""

        // Add assistant response to history
        this.addMessage({ role: "assistant", content: assistantMessage })

        return assistantMessage
      } catch (error) {
        // Retry logic for transient failures
        if (error instanceof Error) {
          const isRetryable =
            error.message.includes("rate limit") ||
            error.message.includes("timeout") ||
            error.message.includes("ECONNRESET")

          if (isRetryable) {
            // Wait and retry once
            await new Promise((resolve) => globalThis.setTimeout(resolve, 2000))

            const response = await openai.chat.completions.create({
              model,
              messages: history.map((m) => ({
                role: m.role,
                content: m.content,
              })),
              temperature: 0.7,
              max_tokens: 1000,
            })

            const assistantMessage = response.choices[0]?.message?.content ?? ""
            this.addMessage({ role: "assistant", content: assistantMessage })
            return assistantMessage
          }
        }

        throw error
      }
    },
  }
}
