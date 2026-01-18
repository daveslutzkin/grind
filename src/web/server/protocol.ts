/**
 * WebSocket Protocol Types
 *
 * Defines the message types for communication between the web client and server.
 */

import type {
  GameStateSnapshot,
  CommandTick,
  CommandResult,
  ValidAction,
} from "../../session/types.js"

// ============================================================================
// Client -> Server Messages
//
// Note: Some messages trigger automatic responses:
// - new_game: Server responds with state + valid_actions
// - load_game: Server responds with state + valid_actions (or error)
// - command: Server responds with command_tick(s), command_result, then valid_actions
// ============================================================================

/**
 * Start a new game with optional seed.
 * Server responds with: state, valid_actions
 */
export interface NewGameMessage {
  type: "new_game"
  seed?: string
}

/**
 * Load a previously saved game.
 * Server responds with: state, valid_actions (or error if invalid)
 */
export interface LoadGameMessage {
  type: "load_game"
  savedState: string
}

/**
 * Execute a game command.
 * Server responds with: command_tick (0+), command_result, valid_actions
 */
export interface CommandMessage {
  type: "command"
  command: string
}

export interface GetStateMessage {
  type: "get_state"
}

export interface GetValidActionsMessage {
  type: "get_valid_actions"
}

export interface SaveGameMessage {
  type: "save_game"
}

export type ClientMessage =
  | NewGameMessage
  | LoadGameMessage
  | CommandMessage
  | GetStateMessage
  | GetValidActionsMessage
  | SaveGameMessage

// ============================================================================
// Server -> Client Messages
// ============================================================================

export interface StateMessage {
  type: "state"
  state: GameStateSnapshot
  seed: string
}

export interface ValidActionsMessage {
  type: "valid_actions"
  actions: ValidAction[]
}

export interface CommandTickMessage {
  type: "command_tick"
  tick: CommandTick
}

export interface CommandResultMessage {
  type: "command_result"
  result: CommandResult
}

export interface SavedGameMessage {
  type: "saved_game"
  savedState: string
}

export interface ErrorMessage {
  type: "error"
  message: string
}

export type ServerMessage =
  | StateMessage
  | ValidActionsMessage
  | CommandTickMessage
  | CommandResultMessage
  | SavedGameMessage
  | ErrorMessage

// ============================================================================
// Type Guards
// ============================================================================

export function isClientMessage(message: unknown): message is ClientMessage {
  if (typeof message !== "object" || message === null) {
    return false
  }

  const msg = message as { type?: unknown }
  if (typeof msg.type !== "string") {
    return false
  }

  const validTypes = [
    "new_game",
    "load_game",
    "command",
    "get_state",
    "get_valid_actions",
    "save_game",
  ]
  return validTypes.includes(msg.type)
}

export function validateClientMessage(message: unknown): ClientMessage | null {
  if (!isClientMessage(message)) {
    return null
  }

  const msg = message as ClientMessage

  switch (msg.type) {
    case "new_game":
      // seed is optional, can be string or undefined
      if (msg.seed !== undefined && typeof msg.seed !== "string") {
        return null
      }
      return msg

    case "load_game":
      if (typeof msg.savedState !== "string") {
        return null
      }
      return msg

    case "command":
      if (typeof msg.command !== "string") {
        return null
      }
      return msg

    case "get_state":
    case "get_valid_actions":
    case "save_game":
      return msg

    default:
      return null
  }
}
