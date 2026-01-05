import { createGatheringWorld } from "../gatheringWorld.js"
import { executeAction } from "../engine.js"
import type { WorldState, Action, ActionLog } from "../types.js"
import { formatWorldState, formatActionLog } from "./formatters.js"
import { parseAgentResponse, AgentResponse } from "./parser.js"
import { createSystemPrompt } from "./prompts.js"
import { createLLMClient, LLMClient } from "./llm.js"
import { loadAgentConfig } from "./config.js"
import type { AgentSessionStats, AgentKnowledge } from "./output.js"

/**
 * Configuration for the agent loop
 */
export interface AgentLoopConfig {
  seed: string
  ticks: number
  objective: string
  verbose: boolean
  dryRun?: boolean // If true, don't call LLM - use mock responses
  model?: string // Optional model override
}

/**
 * Result of a single step in the agent loop
 */
export interface StepResult {
  done: boolean
  action: Action | null
  log: ActionLog | null
  reasoning: string
  learning: string
  error?: string
}

/**
 * Interface for the agent loop
 */
export interface AgentLoop {
  /**
   * Get the current world state
   */
  getWorldState(): WorldState

  /**
   * Check if the session is complete
   */
  isComplete(): boolean

  /**
   * Execute a single step (get LLM decision, execute action)
   */
  step(): Promise<StepResult>

  /**
   * Get session statistics
   */
  getStats(): AgentSessionStats

  /**
   * Get accumulated knowledge
   */
  getKnowledge(): AgentKnowledge

  /**
   * Add a learning to the knowledge base
   */
  addLearning(learning: string): void

  /**
   * Get conversation history
   */
  getConversationHistory(): string[]
}

/**
 * Categorize a learning string into knowledge categories
 */
function categorizeLearning(learning: string): keyof AgentKnowledge | null {
  const lower = learning.toLowerCase()

  if (
    lower.includes("location") ||
    lower.includes("travel") ||
    lower.includes("town") ||
    lower.includes("mine") ||
    lower.includes("forest")
  ) {
    return "world"
  }

  if (
    lower.includes("tick") ||
    lower.includes("xp") ||
    lower.includes("skill") ||
    lower.includes("cost") ||
    lower.includes("probability") ||
    lower.includes("level")
  ) {
    return "mechanics"
  }

  if (
    lower.includes("ore") ||
    lower.includes("wood") ||
    lower.includes("item") ||
    lower.includes("gather") ||
    lower.includes("material")
  ) {
    return "items"
  }

  if (
    lower.includes("should") ||
    lower.includes("better") ||
    lower.includes("strategy") ||
    lower.includes("efficient")
  ) {
    return "strategies"
  }

  return null
}

/**
 * Create an agent loop with the given configuration
 */
export function createAgentLoop(config: AgentLoopConfig): AgentLoop {
  // Initialize world
  const state = createGatheringWorld(config.seed)
  state.time.sessionRemainingTicks = config.ticks

  // Track stats
  const stats: AgentSessionStats = {
    totalTicks: config.ticks,
    ticksUsed: 0,
    actionsAttempted: 0,
    actionsSucceeded: 0,
    actionsFailed: 0,
    xpGained: {},
    itemsCollected: {},
    learningsCount: 0,
  }

  // Track knowledge
  const knowledge: AgentKnowledge = {
    world: [],
    mechanics: [],
    items: [],
    strategies: [],
  }

  // Conversation history for debugging
  const conversationHistory: string[] = []

  // LLM client (only if not dry run)
  let llmClient: LLMClient | null = null
  if (!config.dryRun) {
    const agentConfig = loadAgentConfig()
    if (config.model) {
      agentConfig.model = config.model
    }
    llmClient = createLLMClient(agentConfig)
    llmClient.setSystemPrompt(createSystemPrompt(config.objective))
    llmClient.setHistoryLimit(50) // Limit context window
  }

  // Track if we should continue with a repeated action
  let continueCondition: string | null = null
  let lastAction: Action | null = null

  return {
    getWorldState(): WorldState {
      return state
    },

    isComplete(): boolean {
      return state.time.sessionRemainingTicks <= 0
    },

    async step(): Promise<StepResult> {
      if (this.isComplete()) {
        return {
          done: true,
          action: null,
          log: null,
          reasoning: "",
          learning: "",
        }
      }

      // Format current state
      const stateText = formatWorldState(state)
      conversationHistory.push(`STATE:\n${stateText}`)

      let response: AgentResponse

      if (config.dryRun) {
        // Mock response for testing
        response = {
          reasoning: "Testing in dry run mode",
          action: { type: "Enrol", skill: "Mining" },
          learning: "This is a test",
          continueCondition: null,
        }

        // After first action, mark as done to prevent infinite loop
        if (stats.actionsAttempted > 0) {
          return {
            done: true,
            action: null,
            log: null,
            reasoning: "Dry run complete",
            learning: "",
          }
        }
      } else {
        // Check if we should continue previous action
        let prompt: string
        if (continueCondition && lastAction) {
          prompt = `Previous action result:\n${stateText}\n\nYou set CONTINUE_IF: ${continueCondition}\n\nShould you continue with the same action, or do something else?`
        } else {
          prompt = stateText
        }

        // Call LLM
        const llmResponse = await llmClient!.chat(prompt)
        conversationHistory.push(`AGENT:\n${llmResponse}`)

        // Parse response
        response = parseAgentResponse(llmResponse)

        if (response.error || !response.action) {
          return {
            done: false,
            action: null,
            log: null,
            reasoning: response.reasoning,
            learning: response.learning,
            error: response.error ?? "No action parsed",
          }
        }
      }

      // Execute action
      const action = response.action!
      stats.actionsAttempted++

      if (config.verbose) {
        console.log(`\n[Tick ${state.time.currentTick}] Action: ${action.type}`)
        console.log(`Reasoning: ${response.reasoning}`)
      }

      const log = executeAction(state, action)

      // Update stats
      stats.ticksUsed = state.time.currentTick
      if (log.success) {
        stats.actionsSucceeded++
      } else {
        stats.actionsFailed++
      }

      // Track XP gained
      if (log.skillGained) {
        const skill = log.skillGained.skill
        stats.xpGained[skill] = (stats.xpGained[skill] ?? 0) + log.skillGained.amount
      }

      // Track items collected
      if (log.extraction) {
        for (const item of log.extraction.extracted) {
          stats.itemsCollected[item.itemId] =
            (stats.itemsCollected[item.itemId] ?? 0) + item.quantity
        }
      }

      // Format result
      const resultText = formatActionLog(log)
      conversationHistory.push(`RESULT:\n${resultText}`)

      if (!config.dryRun) {
        // Feed result back to LLM as context
        llmClient!.addMessage({
          role: "user",
          content: `Action result:\n${resultText}`,
        })
      }

      // Record learning
      if (response.learning) {
        this.addLearning(response.learning)
      }

      // Update continue state
      continueCondition = response.continueCondition
      lastAction = action

      if (config.verbose) {
        console.log(`Result: ${log.success ? "SUCCESS" : "FAILED"} (${log.timeConsumed} ticks)`)
        if (response.learning) {
          console.log(`Learning: ${response.learning}`)
        }
      }

      return {
        done: this.isComplete(),
        action,
        log,
        reasoning: response.reasoning,
        learning: response.learning,
      }
    },

    getStats(): AgentSessionStats {
      return { ...stats }
    },

    getKnowledge(): AgentKnowledge {
      return {
        world: [...knowledge.world],
        mechanics: [...knowledge.mechanics],
        items: [...knowledge.items],
        strategies: [...knowledge.strategies],
      }
    },

    addLearning(learning: string): void {
      if (!learning.trim()) return

      const category = categorizeLearning(learning)
      if (category) {
        // Avoid duplicates
        if (!knowledge[category].includes(learning)) {
          knowledge[category].push(learning)
          stats.learningsCount++
        }
      } else {
        // Default to mechanics
        if (!knowledge.mechanics.includes(learning)) {
          knowledge.mechanics.push(learning)
          stats.learningsCount++
        }
      }
    },

    getConversationHistory(): string[] {
      return [...conversationHistory]
    },
  }
}
