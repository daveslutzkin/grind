import { useState, useCallback } from "preact/hooks"
import { useWebSocket } from "./useWebSocket"
import type { ServerMessage } from "../../server/protocol"
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
  saveGame: () => void
  getState: () => void
}

export function useGameState(): UseGameStateResult {
  const [state, setState] = useState<GameStateSnapshot | null>(null)
  const [validActions, setValidActions] = useState<ValidAction[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [commandHistory, setCommandHistory] = useState<CommandHistoryEntry[]>([])
  const [currentCommand, setCurrentCommand] = useState<CommandHistoryEntry | null>(null)

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "state":
        setState(message.state)
        break

      case "valid_actions":
        setValidActions(message.actions)
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
        break

      case "saved_game":
        // Store in localStorage for now
        localStorage.setItem("grind_saved_game", message.savedState)
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

  const saveGame = useCallback(() => {
    send({ type: "save_game" })
  }, [send])

  const getState = useCallback(() => {
    send({ type: "get_state" })
    send({ type: "get_valid_actions" })
  }, [send])

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
    saveGame,
    getState,
  }
}
