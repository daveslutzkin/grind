import type { CommandHistoryEntry } from "../hooks/useGameState"
import type { ActionLog } from "../../../types"
import { useEffect, useRef } from "preact/hooks"
import {
  collapseTicks,
  extractResultDetails,
  getResultMessage,
  formatTick,
  formatLevelUp,
} from "./actionHistoryUtils"

interface ActionHistoryProps {
  history: CommandHistoryEntry[]
  currentCommand: CommandHistoryEntry | null
}

/**
 * Render ticks with progress collapsing - meaningful ticks shown individually,
 * progress-only ticks collapsed into a single count
 */
function renderTicks(ticks: Parameters<typeof collapseTicks>[0], showCurrentProgress: boolean) {
  const { meaningful, progressCount, lastProgress } = collapseTicks(ticks)

  return (
    <>
      {meaningful.map((tick, i) => {
        const text = formatTick(tick)
        return text ? (
          <div key={i} class="tick">
            {text}
          </div>
        ) : null
      })}
      {progressCount > 0 && (
        <div class="tick progress-summary">
          {showCurrentProgress && lastProgress?.ticksElapsed !== undefined
            ? `(${lastProgress.ticksElapsed}${lastProgress.totalTicks ? `/${lastProgress.totalTicks}` : ""} ticks)`
            : `(${progressCount} ticks)`}
        </div>
      )}
    </>
  )
}

/**
 * Render additional result details (items, XP, level ups)
 */
function ResultDetails({ log }: { log: ActionLog }) {
  const { details, levelUps } = extractResultDetails(log)

  if (details.length === 0 && levelUps.length === 0) {
    return null
  }

  return (
    <div class="result-details">
      {details.length > 0 && <span class="details-text">{details.join(" | ")}</span>}
      {levelUps.map((lu, i) => (
        <span key={i} class="level-up">
          [LEVEL UP: {formatLevelUp(lu)}]
        </span>
      ))}
    </div>
  )
}

function HistoryEntry({ entry }: { entry: CommandHistoryEntry }) {
  const result = entry.result

  return (
    <div class={`history-entry ${result?.success ? "success" : result ? "failure" : "pending"}`}>
      <div class="history-command">
        <span class="prompt">&gt;</span> {entry.command}
      </div>
      {entry.ticks.length > 0 && <div class="history-ticks">{renderTicks(entry.ticks, false)}</div>}
      {result && (
        <div class="history-result">
          {result.success ? (
            <span class="result-success">{getResultMessage(result)}</span>
          ) : (
            <span class="result-failure">{getResultMessage(result)}</span>
          )}
          <ResultDetails log={result.log} />
        </div>
      )}
    </div>
  )
}

function CurrentEntry({ entry }: { entry: CommandHistoryEntry }) {
  return (
    <div class="history-entry current">
      <div class="history-command">
        <span class="prompt">&gt;</span> {entry.command}
        <span class="executing">...</span>
      </div>
      {entry.ticks.length > 0 && <div class="history-ticks">{renderTicks(entry.ticks, true)}</div>}
    </div>
  )
}

export function ActionHistory({ history, currentCommand }: ActionHistoryProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom when new entries are added
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [history, currentCommand])

  return (
    <div class="action-history" ref={containerRef}>
      {history.length === 0 && !currentCommand && (
        <div class="history-empty">
          <p>Welcome to Grind!</p>
          <p>Type a command or click an action to begin.</p>
        </div>
      )}
      {history.map((entry) => (
        <HistoryEntry key={entry.timestamp} entry={entry} />
      ))}
      {currentCommand && <CurrentEntry entry={currentCommand} />}
    </div>
  )
}
