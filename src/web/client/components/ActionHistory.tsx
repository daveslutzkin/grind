import type { CommandHistoryEntry } from "../hooks/useGameState"
import type { CommandTick } from "../../../session/types"
import { useEffect, useRef } from "preact/hooks"

interface ActionHistoryProps {
  history: CommandHistoryEntry[]
  currentCommand: CommandHistoryEntry | null
}

function formatTick(tick: CommandTick): string {
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
  if (tick.type === "progress" && tick.ticksElapsed !== undefined) {
    if (tick.totalTicks !== undefined) {
      return `Progress: ${tick.ticksElapsed}/${tick.totalTicks}`
    }
    return `Progress: ${tick.ticksElapsed}`
  }
  return ""
}

function HistoryEntry({ entry }: { entry: CommandHistoryEntry }) {
  const result = entry.result

  return (
    <div class={`history-entry ${result?.success ? "success" : result ? "failure" : "pending"}`}>
      <div class="history-command">
        <span class="prompt">&gt;</span> {entry.command}
      </div>
      {entry.ticks.length > 0 && (
        <div class="history-ticks">
          {entry.ticks.map((tick, i) => {
            const text = formatTick(tick)
            return text ? (
              <div key={i} class="tick">
                {text}
              </div>
            ) : null
          })}
        </div>
      )}
      {result && (
        <div class="history-result">
          {result.success ? (
            <span class="result-success">{result.log.message || "Done"}</span>
          ) : (
            <span class="result-failure">{result.log.message || "Failed"}</span>
          )}
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
      {entry.ticks.length > 0 && (
        <div class="history-ticks">
          {entry.ticks.map((tick, i) => {
            const text = formatTick(tick)
            return text ? (
              <div key={i} class="tick">
                {text}
              </div>
            ) : null
          })}
        </div>
      )}
    </div>
  )
}

export function ActionHistory({ history, currentCommand }: ActionHistoryProps) {
  // eslint-disable-next-line no-undef
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
