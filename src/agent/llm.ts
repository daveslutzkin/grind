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
 * Configuration for context management
 */
export interface ContextConfig {
  /** Number of recent exchanges to keep in full detail */
  recentExchangeCount: number
  /** Static content to cache (world reference data) */
  staticContext: string
  /** Summarized action history */
  actionSummary: string
  /** Condensed learnings */
  learningSummary: string
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
   * @deprecated Use setContextConfig instead for better control
   */
  setHistoryLimit(limit: number): void

  /**
   * Configure context management with summarization
   */
  setContextConfig(config: Partial<ContextConfig>): void

  /**
   * Update the action summary (called as actions accumulate)
   */
  updateActionSummary(summary: string): void

  /**
   * Update the learning summary
   */
  updateLearningSummary(summary: string): void

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

  // Context management
  let contextConfig: ContextConfig = {
    recentExchangeCount: 5,
    staticContext: "",
    actionSummary: "",
    learningSummary: "",
  }

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

  /**
   * Build the memory block containing static context, action summary, and learnings
   */
  function buildMemoryBlock(): string {
    const parts: string[] = []

    if (contextConfig.staticContext) {
      parts.push(contextConfig.staticContext)
    }

    if (contextConfig.learningSummary) {
      parts.push("")
      parts.push(contextConfig.learningSummary)
    }

    if (contextConfig.actionSummary) {
      parts.push("")
      parts.push("ACTION HISTORY:")
      parts.push(contextConfig.actionSummary)
    }

    return parts.join("\n")
  }

  /**
   * Build messages array for API call with caching and summarization
   */
  function buildMessagesForAPI(): Anthropic.MessageParam[] {
    // Filter out system messages
    const nonSystemMessages = history.filter((m) => m.role !== "system")

    // If we have context config with summaries, use the new structure
    const memoryBlock = buildMemoryBlock()
    const hasMemory = memoryBlock.length > 0

    // Calculate how many messages to keep in full
    // An "exchange" is typically: user (state) + assistant (response) + user (result)
    // We'll keep the last N*2 messages to capture recent exchanges
    const recentMessageCount = contextConfig.recentExchangeCount * 3
    const recentMessages = nonSystemMessages.slice(-recentMessageCount)

    const messages: Anthropic.MessageParam[] = []

    // Add memory block as first user message if we have one
    if (hasMemory) {
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: memoryBlock,
            cache_control: { type: "ephemeral" },
          },
        ],
      })

      // Need a placeholder assistant response after memory block
      // to maintain user/assistant alternation
      messages.push({
        role: "assistant",
        content:
          "Understood. I have the world reference and action history. Ready for current state.",
      })
    }

    // Add recent messages
    for (const msg of recentMessages) {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })
    }

    // Ensure we don't have consecutive user messages (Anthropic requirement)
    // and that we start with user after the memory block
    return consolidateMessages(messages)
  }

  /**
   * Consolidate consecutive messages of the same role
   */
  function consolidateMessages(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
    if (messages.length === 0) return messages

    const consolidated: Anthropic.MessageParam[] = []

    for (const msg of messages) {
      const last = consolidated[consolidated.length - 1]

      if (last && last.role === msg.role) {
        // Merge with previous message
        const lastContent = typeof last.content === "string" ? last.content : ""
        const msgContent = typeof msg.content === "string" ? msg.content : ""
        last.content = lastContent + "\n\n" + msgContent
      } else {
        consolidated.push({ ...msg })
      }
    }

    return consolidated
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
      contextConfig = {
        recentExchangeCount: 5,
        staticContext: "",
        actionSummary: "",
        learningSummary: "",
      }
    },

    setHistoryLimit(limit: number): void {
      historyLimit = limit
      trimHistory()
    },

    setContextConfig(config: Partial<ContextConfig>): void {
      contextConfig = { ...contextConfig, ...config }
    },

    updateActionSummary(summary: string): void {
      contextConfig.actionSummary = summary
    },

    updateLearningSummary(summary: string): void {
      contextConfig.learningSummary = summary
    },

    async chat(userMessage: string): Promise<string> {
      // Add user message to history
      this.addMessage({ role: "user", content: userMessage })

      // Build messages with caching and summarization
      const messages = buildMessagesForAPI()

      // Build system prompt with cache control
      const systemWithCache: Anthropic.TextBlockParam[] = [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ]

      try {
        const response = await anthropic.messages.create({
          model,
          max_tokens: 1024,
          system: systemWithCache,
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
              system: systemWithCache,
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
