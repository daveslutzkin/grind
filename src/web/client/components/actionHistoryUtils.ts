/**
 * Pure utility functions for ActionHistory component
 * Extracted to enable testing without JSX/preact dependencies
 */

import type { CommandTick, CommandResult } from "../../../session/types"
import type { ActionLog, LevelUp } from "../../../types"

/**
 * Check if a tick has meaningful content (not just progress count)
 */
export function isMeaningfulTick(tick: CommandTick): boolean {
  return !!(tick.message || tick.gathered || tick.discovered || tick.xpGained)
}

/**
 * Collapse ticks into meaningful ticks + progress count summary
 */
export function collapseTicks(ticks: CommandTick[]): {
  meaningful: CommandTick[]
  progressCount: number
  lastProgress: CommandTick | null
} {
  const meaningful: CommandTick[] = []
  let progressCount = 0
  let lastProgress: CommandTick | null = null

  for (const tick of ticks) {
    if (isMeaningfulTick(tick)) {
      meaningful.push(tick)
    } else if (tick.type === "progress") {
      progressCount++
      lastProgress = tick
    }
  }

  return { meaningful, progressCount, lastProgress }
}

/**
 * Extract result details from an ActionLog for display
 */
export function extractResultDetails(log: ActionLog): {
  details: string[]
  levelUps: LevelUp[]
} {
  const details: string[] = []
  const levelUps: LevelUp[] = []

  // Items extracted
  if (log.extraction?.extracted.length) {
    const items = log.extraction.extracted.map((i) => `+${i.quantity} ${i.itemId}`).join(", ")
    details.push(items)
  }

  // XP gained
  if (log.skillGained) {
    details.push(`+${log.skillGained.amount} ${log.skillGained.skill} XP`)
  }

  // Collect level ups
  if (log.levelUps?.length) {
    levelUps.push(...log.levelUps)
  }

  // Contract level ups
  if (log.contractsCompleted) {
    for (const contract of log.contractsCompleted) {
      if (contract.levelUps?.length) {
        levelUps.push(...contract.levelUps)
      }
    }
  }

  return { details, levelUps }
}

/**
 * Get appropriate result message based on success/failure
 */
export function getResultMessage(result: CommandResult): string {
  if (result.success) {
    return result.log.stateDeltaSummary || "Done"
  }
  // For failures, show hint if available, otherwise the summary
  if (result.log.failureDetails?.reason) {
    return result.log.stateDeltaSummary || result.log.failureDetails.reason
  }
  return result.log.stateDeltaSummary || "Failed"
}

/**
 * Format a single meaningful tick (non-progress-only ticks)
 */
export function formatTick(tick: CommandTick): string {
  if (tick.message) {
    return tick.message
  }
  if (tick.gathered) {
    return `Gathered ${tick.gathered.quantity}x ${tick.gathered.itemId}`
  }
  if (tick.discovered) {
    return `Discovered ${tick.discovered.type}: ${tick.discovered.name}`
  }
  if (tick.xpGained) {
    return `+${tick.xpGained.amount} ${tick.xpGained.skill} XP`
  }
  return ""
}

/**
 * Format level up notifications
 */
export function formatLevelUp(levelUp: LevelUp): string {
  return `${levelUp.skill} ${levelUp.fromLevel}→${levelUp.toLevel}`
}
