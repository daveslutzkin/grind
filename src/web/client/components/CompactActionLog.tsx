import { useState } from "preact/hooks"
import type { CommandHistoryEntry } from "../hooks/useGameState"
import { ActionHistory } from "./ActionHistory"
import { getResultMessage, extractResultDetails, formatLevelUp } from "./actionHistoryUtils"

interface CompactActionLogProps {
  history: CommandHistoryEntry[]
  currentCommand: CommandHistoryEntry | null
}

function CompactEntry({ entry }: { entry: CommandHistoryEntry }) {
  const [expanded, setExpanded] = useState(false)
  const result = entry.result
  const { details, levelUps } = result
    ? extractResultDetails(result.log)
    : { details: [], levelUps: [] }
  const hasDetails = details.length > 0 || levelUps.length > 0

  return (
    <div
      class={`compact-entry ${result?.success ? "success" : result ? "failure" : "pending"} ${hasDetails ? "expandable" : ""}`}
      onClick={() => hasDetails && setExpanded(!expanded)}
    >
      <div class="compact-entry-header">
        <span class="compact-command">
          <span class="prompt">&gt;</span> {entry.command}
        </span>
        {result && (
          <span class={`compact-result ${result.success ? "success" : "failure"}`}>
            {getResultMessage(result)}
          </span>
        )}
        {!result && <span class="compact-executing">...</span>}
        {hasDetails && <span class="expand-indicator">{expanded ? "▼" : "▶"}</span>}
      </div>
      {expanded && (
        <div class="compact-entry-details">
          {details.map((detail, i) => (
            <span key={i} class="detail">
              {detail}
            </span>
          ))}
          {levelUps.map((lu, i) => (
            <span key={i} class="level-up">
              [LEVEL UP: {formatLevelUp(lu)}]
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function CurrentCompactEntry({ entry }: { entry: CommandHistoryEntry }) {
  return (
    <div class="compact-entry current">
      <div class="compact-entry-header">
        <span class="compact-command">
          <span class="prompt">&gt;</span> {entry.command}
        </span>
        <span class="compact-executing">
          {entry.ticks.length > 0 && entry.ticks[entry.ticks.length - 1].ticksElapsed !== undefined
            ? `(${entry.ticks[entry.ticks.length - 1].ticksElapsed}${entry.ticks[entry.ticks.length - 1].totalTicks ? `/${entry.ticks[entry.ticks.length - 1].totalTicks}` : ""} ticks)...`
            : "..."}
        </span>
      </div>
    </div>
  )
}

export function CompactActionLog({ history, currentCommand }: CompactActionLogProps) {
  const [showFullHistory, setShowFullHistory] = useState(false)

  // Get last 2 entries from history (excluding current)
  const recentHistory = history.slice(-2)

  const hasHistory = history.length > 0 || currentCommand !== null

  if (showFullHistory) {
    return (
      <div class="full-history-modal">
        <div class="full-history-header">
          <h3>Action History</h3>
          <button class="close-history" onClick={() => setShowFullHistory(false)}>
            ✕ Close
          </button>
        </div>
        <div class="full-history-content">
          <ActionHistory history={history} currentCommand={currentCommand} />
        </div>
      </div>
    )
  }

  return (
    <div class="compact-action-log">
      {!hasHistory && <div class="compact-empty">Type a command or click an action to begin.</div>}
      {recentHistory.map((entry) => (
        <CompactEntry key={entry.timestamp} entry={entry} />
      ))}
      {currentCommand && <CurrentCompactEntry entry={currentCommand} />}
      {history.length > 2 && (
        <button class="view-history-btn" onClick={() => setShowFullHistory(true)}>
          View full history ({history.length} actions)
        </button>
      )}
    </div>
  )
}
