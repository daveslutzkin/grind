import { useState, useCallback, useRef } from "preact/hooks"
import { useWebSocket } from "./useWebSocket"
import type { ServerMessage, ClientMessage } from "../../server/protocol"
import type {
  GameStateSnapshot,
  ValidAction,
  CommandResult,
  CommandTick,
} from "../../../session/types"

export interface CommandHistoryEntry {
  command: string
  result?: CommandResult
  ticks: CommandTick[]
  timestamp: number
}

/**
 * Metadata extracted from a saved game for display in the load list.
 */
export interface SaveMetadata {
  seed: string
  savedAt: string
  currentTick: number
  gold: number
  guildReputation: number
  skills: Record<string, number> // skill id -> level
}

/**
 * A saved game entry stored in localStorage.
 */
export interface SaveEntry {
  savedState: string
  metadata: SaveMetadata
}

const SAVES_STORAGE_KEY = "grind_saves"

/**
 * Extract metadata from a serialized save state.
 */
function extractMetadata(savedState: string): SaveMetadata | null {
  try {
    const save = JSON.parse(savedState)
    const state = save.state
    const skills: Record<string, number> = {}

    if (state?.player?.skills) {
      for (const [skillId, skillData] of Object.entries(state.player.skills)) {
        skills[skillId] = (skillData as { level: number }).level
      }
    }

    return {
      seed: save.seed ?? "unknown",
      savedAt: save.savedAt ?? new Date().toISOString(),
      currentTick: state?.time?.currentTick ?? 0,
      gold: state?.player?.gold ?? 0,
      guildReputation: state?.player?.guildReputation ?? 0,
      skills,
    }
  } catch {
    return null
  }
}

/**
 * Load all saved games from localStorage.
 */
export function loadSavedGames(): SaveEntry[] {
  try {
    const data = localStorage.getItem(SAVES_STORAGE_KEY)
    if (!data) return []
    const saves = JSON.parse(data) as Record<string, SaveEntry>
    return Object.values(saves).sort(
      (a, b) => new Date(b.metadata.savedAt).getTime() - new Date(a.metadata.savedAt).getTime()
    )
  } catch {
    return []
  }
}

/**
 * Save a game to localStorage, keyed by seed.
 */
function saveToStorage(savedState: string): void {
  const metadata = extractMetadata(savedState)
  if (!metadata) return

  try {
    const data = localStorage.getItem(SAVES_STORAGE_KEY)
    const saves: Record<string, SaveEntry> = data ? JSON.parse(data) : {}
    saves[metadata.seed] = { savedState, metadata }
    localStorage.setItem(SAVES_STORAGE_KEY, JSON.stringify(saves))
  } catch (e) {
    console.error("Failed to save game to localStorage:", e)
  }
}

/**
 * Delete a saved game from localStorage by seed.
 */
export function deleteSavedGame(seed: string): void {
  try {
    const data = localStorage.getItem(SAVES_STORAGE_KEY)
    if (!data) return
    const saves: Record<string, SaveEntry> = JSON.parse(data)
    delete saves[seed]
    localStorage.setItem(SAVES_STORAGE_KEY, JSON.stringify(saves))
  } catch (e) {
    console.error("Failed to delete save from localStorage:", e)
  }
}

export interface UseGameStateResult {
  state: GameStateSnapshot | null
  validActions: ValidAction[]
  isConnected: boolean
  error: string | null
  isExecuting: boolean
  currentCommand: CommandHistoryEntry | null
  commandHistory: CommandHistoryEntry[]
  sendCommand: (command: string) => void
  startNewGame: (seed?: string) => void
  loadGame: (savedState: string) => void
}

export function useGameState(): UseGameStateResult {
  const [state, setState] = useState<GameStateSnapshot | null>(null)
  const [validActions, setValidActions] = useState<ValidAction[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [commandHistory, setCommandHistory] = useState<CommandHistoryEntry[]>([])
  const [currentCommand, setCurrentCommand] = useState<CommandHistoryEntry | null>(null)

  // Track pending auto-save to trigger after command completes
  const pendingAutoSave = useRef(false)
  // Store send function ref for auto-save
  const sendRef = useRef<((msg: ClientMessage) => void) | null>(null)

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "state":
        setState(message.state)
        break

      case "valid_actions":
        setValidActions(message.actions)
        // If we have a pending auto-save, trigger it now (after valid_actions arrives)
        if (pendingAutoSave.current && sendRef.current) {
          pendingAutoSave.current = false
          sendRef.current({ type: "save_game" })
        }
        break

      case "command_tick":
        setCurrentCommand((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            ticks: [...prev.ticks, message.tick],
          }
        })
        break

      case "command_result":
        setState(message.result.stateAfter)
        setIsExecuting(false)
        setCurrentCommand((prev) => {
          if (!prev) return prev
          const completed = { ...prev, result: message.result }
          setCommandHistory((history) => [...history, completed])
          return null
        })
        // Schedule auto-save after valid_actions arrives
        pendingAutoSave.current = true
        break

      case "saved_game":
        // Store in localStorage with metadata, keyed by seed
        saveToStorage(message.savedState)
        break

      case "error":
        console.error("Server error:", message.message)
        setIsExecuting(false)
        setCurrentCommand(null)
        break
    }
  }, [])

  const { isConnected, send, error } = useWebSocket({
    onMessage: handleMessage,
  })

  // Keep sendRef updated for auto-save
  sendRef.current = send

  const sendCommand = useCallback(
    (command: string) => {
      if (isExecuting) return

      setIsExecuting(true)
      setCurrentCommand({
        command,
        ticks: [],
        timestamp: Date.now(),
      })
      send({ type: "command", command })
    },
    [send, isExecuting]
  )

  const startNewGame = useCallback(
    (seed?: string) => {
      // Server automatically sends state and valid_actions after new_game
      send({ type: "new_game", seed })
      // Schedule auto-save after game starts
      pendingAutoSave.current = true
    },
    [send]
  )

  const loadGame = useCallback(
    (savedState: string) => {
      // Server automatically sends state and valid_actions after load_game
      send({ type: "load_game", savedState })
    },
    [send]
  )

  return {
    state,
    validActions,
    isConnected,
    error,
    isExecuting,
    currentCommand,
    commandHistory,
    sendCommand,
    startNewGame,
    loadGame,
  }
}
