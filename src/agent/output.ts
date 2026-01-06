import { mkdirSync, appendFileSync, writeFileSync } from "fs"
import { join } from "path"
import { RULES_VERSION } from "./config.js"

/**
 * A single entry in the trace log
 */
export interface TraceEntry {
  tick: number
  state: string
  reasoning: string
  action: string
  result: string
  learning: string
}

/**
 * Session statistics for the summary
 */
export interface AgentSessionStats {
  totalTicks: number
  ticksUsed: number
  actionsAttempted: number
  actionsSucceeded: number
  actionsFailed: number
  xpGained: Record<string, number>
  itemsCollected: Record<string, number>
  learningsCount: number
}

/**
 * Knowledge accumulated by the agent
 */
export interface AgentKnowledge {
  world: string[]
  mechanics: string[]
  items: string[]
  strategies: string[]
}

/**
 * Configuration for the trace writer
 */
export interface TraceWriterConfig {
  baseDir: string
  seed: string
  ticks: number
  objective: string
}

/**
 * Interface for writing trace and knowledge files
 */
export interface TraceWriter {
  /**
   * Write the trace header
   */
  writeHeader(): void

  /**
   * Write a trace entry
   */
  writeEntry(entry: TraceEntry): void

  /**
   * Write the session summary
   */
  writeSummary(stats: AgentSessionStats): void

  /**
   * Write the knowledge file
   */
  writeKnowledge(knowledge: AgentKnowledge): void

  /**
   * Get the output directory path
   */
  getOutputDir(): string
}

/**
 * Create a trace writer for the given configuration
 */
export function createTraceWriter(config: TraceWriterConfig): TraceWriter {
  const outputDir = join(config.baseDir, RULES_VERSION, config.seed)
  const tracePath = join(outputDir, "trace.txt")
  const knowledgePath = join(outputDir, "knowledge.txt")

  return {
    getOutputDir(): string {
      return outputDir
    },

    writeHeader(): void {
      // Create directory if it doesn't exist
      mkdirSync(outputDir, { recursive: true })

      const header = `
================================================================================
LLM AGENT TRACE
================================================================================

Seed: ${config.seed}
Ticks: ${config.ticks}
Objective: ${config.objective}
Rules version: ${RULES_VERSION}
Timestamp: ${new Date().toISOString()}

================================================================================
TRACE LOG
================================================================================
`
      writeFileSync(tracePath, header.trim() + "\n\n")
    },

    writeEntry(entry: TraceEntry): void {
      const lines: string[] = []

      lines.push(`=== TICK ${entry.tick} ===`)
      lines.push("")

      if (entry.state) {
        lines.push("STATE:")
        for (const line of entry.state.split("\n")) {
          lines.push(`  ${line}`)
        }
        lines.push("")
      }

      if (entry.reasoning) {
        lines.push("REASONING:")
        for (const line of entry.reasoning.split("\n")) {
          lines.push(`  ${line}`)
        }
        lines.push("")
      }

      if (entry.action) {
        lines.push(`ACTION: ${entry.action}`)
        lines.push("")
      }

      if (entry.result) {
        lines.push("RESULT:")
        for (const line of entry.result.split("\n")) {
          lines.push(`  ${line}`)
        }
        lines.push("")
      }

      if (entry.learning) {
        lines.push("LEARNING:")
        for (const line of entry.learning.split("\n")) {
          lines.push(`  ${line}`)
        }
        lines.push("")
      }

      lines.push("")

      appendFileSync(tracePath, lines.join("\n"))
    },

    writeSummary(stats: AgentSessionStats): void {
      const lines: string[] = []

      lines.push("")
      lines.push("================================================================================")
      lines.push("SESSION SUMMARY")
      lines.push("================================================================================")
      lines.push("")

      lines.push(`Time: ${stats.ticksUsed}/${stats.totalTicks} ticks used`)
      lines.push(
        `Actions: ${stats.actionsAttempted} attempted, ${stats.actionsSucceeded} succeeded, ${stats.actionsFailed} failed`
      )

      lines.push("")
      lines.push("XP Gained:")
      for (const [skill, xp] of Object.entries(stats.xpGained)) {
        if (xp > 0) {
          lines.push(`  ${skill}: ${xp}`)
        }
      }

      lines.push("")
      lines.push("Items Collected:")
      for (const [item, count] of Object.entries(stats.itemsCollected)) {
        if (count > 0) {
          lines.push(`  ${item}: ${count}`)
        }
      }

      lines.push("")
      lines.push(`Total learnings recorded: ${stats.learningsCount}`)
      lines.push("")

      appendFileSync(tracePath, lines.join("\n"))
    },

    writeKnowledge(knowledge: AgentKnowledge): void {
      const lines: string[] = []

      lines.push("================================================================================")
      lines.push("AGENT KNOWLEDGE")
      lines.push("================================================================================")
      lines.push("")

      if (knowledge.world.length > 0) {
        lines.push("## WORLD")
        lines.push("")
        for (const item of knowledge.world) {
          lines.push(`- ${item}`)
        }
        lines.push("")
      }

      if (knowledge.mechanics.length > 0) {
        lines.push("## MECHANICS")
        lines.push("")
        for (const item of knowledge.mechanics) {
          lines.push(`- ${item}`)
        }
        lines.push("")
      }

      if (knowledge.items.length > 0) {
        lines.push("## ITEMS")
        lines.push("")
        for (const item of knowledge.items) {
          lines.push(`- ${item}`)
        }
        lines.push("")
      }

      if (knowledge.strategies.length > 0) {
        lines.push("## STRATEGIES")
        lines.push("")
        for (const item of knowledge.strategies) {
          lines.push(`- ${item}`)
        }
        lines.push("")
      }

      writeFileSync(knowledgePath, lines.join("\n"))
    },
  }
}
