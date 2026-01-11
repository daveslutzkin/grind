import { createWorld } from "../world.js"
import { executeAction } from "../engine.js"
import type { WorldState, Action, ActionLog } from "../types.js"
import { getCurrentAreaId } from "../types.js"
import { formatWorldState, formatActionLog } from "./formatters.js"
import {
  summarizeAction,
  summarizeActionHistory,
  summarizeLearnings,
  extractStaticWorldData,
  formatDynamicState,
} from "./summarize.js"
import { parseAgentResponse, AgentResponse } from "./parser.js"
import { createSystemPrompt } from "./prompts.js"
import { createLLMClient, LLMClient } from "./llm.js"
import { loadAgentConfig } from "./config.js"
import type { AgentSessionStats, AgentKnowledge } from "./output.js"

/**
 * Check if any meaningful action is possible given the current state.
 * Always returns true since there's no session time limit.
 *
 * Meaningful actions:
 * - Store: 0 ticks, but only if inventory has non-weapon items
 * - APPRAISE: 1 tick (if at a location with nodes and skill level >= 3)
 * - Move: minimum travel time via connections
 * - Enrol: 3 ticks
 * - Gather FOCUS: 5 ticks
 * - Drop: 1 tick (but wasteful, not considered meaningful)
 */
function hasViableAction(state: WorldState): boolean {
  const currentArea = getCurrentAreaId(state)

  // 0-tick actions: Store is only meaningful if we have non-weapon items in inventory
  // Weapons (CRUDE_WEAPON, IMPROVED_WEAPON) shouldn't be stored as they're needed for combat
  const storableItems = state.player.inventory.filter(
    (i) => i.itemId !== "CRUDE_WEAPON" && i.itemId !== "IMPROVED_WEAPON"
  )
  if (storableItems.length > 0 && currentArea === "TOWN") {
    return true // Can store items
  }

  // Always return true - no session time limit
  return true
}

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
  useSummarization?: boolean // Use summarized history (default: true for cost savings)
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
  const state = createWorld(config.seed)

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

  // Track action logs for summarization
  const actionLogs: ActionLog[] = []

  // Whether to use summarization (default true)
  const useSummarization = config.useSummarization !== false

  // LLM client (only if not dry run)
  let llmClient: LLMClient | null = null
  if (!config.dryRun) {
    const agentConfig = loadAgentConfig()
    if (config.model) {
      agentConfig.model = config.model
    }
    llmClient = createLLMClient(agentConfig)
    llmClient.setSystemPrompt(createSystemPrompt(config.objective))

    if (useSummarization) {
      // Set up context management with static world data
      llmClient.setContextConfig({
        recentExchangeCount: 5,
        staticContext: extractStaticWorldData(state),
        actionSummary: "",
        learningSummary: "",
      })
    } else {
      // Legacy mode: just limit history
      llmClient.setHistoryLimit(50)
    }
  }

  // Track if we should continue with a repeated action
  let continueCondition: string | null = null
  let lastAction: Action | null = null

  /**
   * Update the LLM context with current summaries
   */
  function updateContextSummaries(): void {
    if (!llmClient || !useSummarization) return

    // Summarize all but the most recent actions (those are in full context)
    const actionsToSummarize = actionLogs.slice(0, -5)
    if (actionsToSummarize.length > 0) {
      llmClient.updateActionSummary(summarizeActionHistory(actionsToSummarize))
    }

    // Summarize learnings
    const learningSummary = summarizeLearnings(knowledge)
    if (learningSummary) {
      llmClient.updateLearningSummary(learningSummary)
    }
  }

  return {
    getWorldState(): WorldState {
      return state
    },

    isComplete(): boolean {
      return false
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

      // Check if any meaningful action is possible
      if (!hasViableAction(state)) {
        if (config.verbose) {
          console.log(`\n[Tick ${state.time.currentTick}] No viable actions - ending session`)
        }
        return {
          done: true,
          action: null,
          log: null,
          reasoning: "No viable actions possible",
          learning: "",
        }
      }

      // Format current state - use compact format if summarization is enabled
      const stateText = useSummarization ? formatDynamicState(state) : formatWorldState(state)
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
        // Update context summaries before each call
        updateContextSummaries()

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

      const log = await executeAction(state, action)

      // Track action log for summarization
      actionLogs.push(log)

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

      // Format result - use concise summary for history, full for debugging
      const resultText = formatActionLog(log, state)
      const summaryText = summarizeAction(log)
      conversationHistory.push(`RESULT:\n${resultText}`)

      if (!config.dryRun) {
        // Feed result back to LLM as context
        // Use concise format if summarization is enabled
        llmClient!.addMessage({
          role: "user",
          content: useSummarization ? `Result: ${summaryText}` : `Action result:\n${resultText}`,
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
