/**
 * WebSocket Handler
 *
 * Handles WebSocket connections and message processing for the web interface.
 * Each WebSocketHandler instance manages a single game session.
 */

import { GameSession } from "../../session/GameSession.js"
import type { CommandResult } from "../../session/types.js"
import type { ClientMessage, ServerMessage } from "./protocol.js"
import { validateClientMessage } from "./protocol.js"

export type SendFunction = (msg: ServerMessage) => void

export interface Logger {
  info(msg: string): void
}

export class WebSocketHandler {
  private session: GameSession | null = null
  private logger: Logger | null = null

  constructor(logger?: Logger) {
    this.logger = logger ?? null
  }

  /**
   * Check if a session currently exists.
   */
  hasSession(): boolean {
    return this.session !== null
  }

  /**
   * Handle an incoming message and send responses.
   */
  async handleMessage(message: ClientMessage, send: SendFunction): Promise<void> {
    switch (message.type) {
      case "new_game":
        this.handleNewGame(message.seed, send)
        break

      case "load_game":
        this.handleLoadGame(message.savedState, send)
        break

      case "command":
        await this.handleCommand(message.command, send)
        break

      case "get_state":
        this.handleGetState(send)
        break

      case "get_valid_actions":
        this.handleGetValidActions(send)
        break

      case "save_game":
        this.handleSaveGame(send)
        break
    }
  }

  /**
   * Handle a raw message string from WebSocket.
   * Validates and parses the message before processing.
   */
  async handleRawMessage(data: string, send: SendFunction): Promise<void> {
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      send({ type: "error", message: "Invalid JSON" })
      return
    }

    const message = validateClientMessage(parsed)
    if (!message) {
      send({ type: "error", message: "Invalid message format" })
      return
    }

    await this.handleMessage(message, send)
  }

  // ============================================================================
  // Message Handlers
  // ============================================================================

  private handleNewGame(seed: string | undefined, send: SendFunction): void {
    const actualSeed = seed ?? this.generateSeed()
    this.session = GameSession.create(actualSeed)

    // Send both state and valid_actions so client doesn't need to request them
    send({
      type: "state",
      state: this.session.getState(),
      seed: actualSeed,
    })
    send({
      type: "valid_actions",
      actions: this.session.getValidActions(),
    })
  }

  private handleLoadGame(savedState: string, send: SendFunction): void {
    try {
      this.session = GameSession.fromSavedState(savedState)
      // Send both state and valid_actions so client doesn't need to request them
      send({
        type: "state",
        state: this.session.getState(),
        seed: this.session.getSessionId(),
      })
      send({
        type: "valid_actions",
        actions: this.session.getValidActions(),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load game"
      send({ type: "error", message })
    }
  }

  private async handleCommand(command: string, send: SendFunction): Promise<void> {
    if (!this.session) {
      send({ type: "error", message: "No active game session" })
      return
    }

    this.logger?.info(`[ACTION] command="${command}"`)

    // Handle "help" as a special meta-command
    if (command.trim().toLowerCase() === "help") {
      const helpResult: CommandResult = {
        success: true,
        log: {
          tickBefore: this.session.getElapsedTicks(),
          actionType: "Unknown" as const, // Help is a meta-command, not a game action
          parameters: { command: "help" },
          success: true,
          timeConsumed: 0,
          rngRolls: [],
          stateDeltaSummary: this.getHelpText(),
        },
        stateAfter: this.session.getState(),
      }
      send({ type: "command_result", result: helpResult })
      send({ type: "valid_actions", actions: this.session.getValidActions() })
      return
    }

    // Use the streaming API to send progress updates
    for await (const tick of this.session.executeCommandWithProgress(command)) {
      if (this.isCommandResult(tick)) {
        const { log } = tick
        const status = log.success ? "SUCCESS" : "FAILED"
        const params = JSON.stringify(log.parameters)
        const failure = log.failureDetails ? ` reason="${log.failureDetails.reason}"` : ""
        this.logger?.info(
          `[RESULT] ${status} action=${log.actionType} params=${params} time=${log.timeConsumed}${failure} summary="${log.stateDeltaSummary}"`
        )

        send({
          type: "command_result",
          result: tick,
        })
        // Send updated valid_actions after command completes
        send({
          type: "valid_actions",
          actions: this.session.getValidActions(),
        })
      } else {
        send({
          type: "command_tick",
          tick,
        })
      }
    }
  }

  private handleGetState(send: SendFunction): void {
    if (!this.session) {
      send({ type: "error", message: "No active game session" })
      return
    }

    send({
      type: "state",
      state: this.session.getState(),
      seed: this.session.getSessionId(),
    })
  }

  private handleGetValidActions(send: SendFunction): void {
    if (!this.session) {
      send({ type: "error", message: "No active game session" })
      return
    }

    send({
      type: "valid_actions",
      actions: this.session.getValidActions(),
    })
  }

  private handleSaveGame(send: SendFunction): void {
    if (!this.session) {
      send({ type: "error", message: "No active game session" })
      return
    }

    send({
      type: "saved_game",
      savedState: this.session.serialize(),
    })
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private generateSeed(): string {
    return `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  private isCommandResult(tick: unknown): tick is CommandResult {
    return typeof tick === "object" && tick !== null && "success" in tick && "log" in tick
  }

  private getHelpText(): string {
    return `Available commands:

MOVEMENT
  go <dest>              Travel to an area or location
  fartravel <dest>       Multi-hop travel to distant areas
  leave                  Leave current location, return to hub

EXPLORATION
  survey                 Discover new areas (connections)
  explore                Discover locations in current area

GATHERING
  mine [material]        Mine at ore vein (focus mode)
  mine careful           Mine all materials carefully
  mine appraise          Inspect ore vein contents
  chop [material]        Chop at tree stand (focus mode)
  chop careful           Chop all wood carefully
  chop appraise          Inspect tree stand contents

SKILLS & GUILDS
  enrol                  Enroll in guild at current location
  craft <recipe>         Craft an item at guild hall

CONTRACTS
  accept <contract>      Accept a contract at guild
  turn-in                Turn in completed contract

INVENTORY
  store <item> <qty>     Store items at warehouse
  drop <item> <qty>      Drop items

Type a command or click a button to perform an action.
Destinations can be area names, location types (e.g., "ore vein"), or slugs.`
  }
}
