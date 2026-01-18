import { WebSocketHandler } from "./websocket.js"
import type { ClientMessage, ServerMessage } from "./protocol.js"

describe("WebSocketHandler", () => {
  let handler: WebSocketHandler
  let sentMessages: ServerMessage[]

  const mockSend = (msg: ServerMessage) => {
    sentMessages.push(msg)
  }

  beforeEach(() => {
    handler = new WebSocketHandler()
    sentMessages = []
  })

  describe("handleMessage", () => {
    describe("new_game", () => {
      it("creates a new game session and sends state + valid_actions", async () => {
        const message: ClientMessage = { type: "new_game" }
        await handler.handleMessage(message, mockSend)

        expect(sentMessages.length).toBe(2)
        expect(sentMessages[0].type).toBe("state")
        expect(sentMessages[1].type).toBe("valid_actions")

        const stateMsg = sentMessages[0] as { type: "state"; state: unknown }
        expect(stateMsg.state).toBeDefined()
      })

      it("creates a game with the provided seed", async () => {
        const message: ClientMessage = { type: "new_game", seed: "test-seed" }
        await handler.handleMessage(message, mockSend)

        expect(sentMessages.length).toBe(2)
        expect(sentMessages[0].type).toBe("state")
        expect(sentMessages[1].type).toBe("valid_actions")
      })

      it("includes the seed in the state message", async () => {
        const message: ClientMessage = { type: "new_game", seed: "my-test-seed" }
        await handler.handleMessage(message, mockSend)

        const stateMsg = sentMessages[0] as { type: "state"; seed: string }
        expect(stateMsg.seed).toBe("my-test-seed")
      })

      it("generates a seed when none is provided", async () => {
        const message: ClientMessage = { type: "new_game" }
        await handler.handleMessage(message, mockSend)

        const stateMsg = sentMessages[0] as { type: "state"; seed: string }
        expect(stateMsg.seed).toBeDefined()
        expect(typeof stateMsg.seed).toBe("string")
        expect(stateMsg.seed.length).toBeGreaterThan(0)
      })
    })

    describe("get_state", () => {
      it("returns error when no session exists", async () => {
        const message: ClientMessage = { type: "get_state" }
        await handler.handleMessage(message, mockSend)

        expect(sentMessages.length).toBe(1)
        expect(sentMessages[0].type).toBe("error")
      })

      it("returns current state when session exists", async () => {
        await handler.handleMessage({ type: "new_game" }, mockSend)
        sentMessages = []

        await handler.handleMessage({ type: "get_state" }, mockSend)

        expect(sentMessages.length).toBe(1)
        expect(sentMessages[0].type).toBe("state")
      })

      it("includes the seed in get_state response", async () => {
        await handler.handleMessage({ type: "new_game", seed: "state-test-seed" }, mockSend)
        sentMessages = []

        await handler.handleMessage({ type: "get_state" }, mockSend)

        const stateMsg = sentMessages[0] as { type: "state"; seed: string }
        expect(stateMsg.seed).toBe("state-test-seed")
      })
    })

    describe("get_valid_actions", () => {
      it("returns error when no session exists", async () => {
        const message: ClientMessage = { type: "get_valid_actions" }
        await handler.handleMessage(message, mockSend)

        expect(sentMessages.length).toBe(1)
        expect(sentMessages[0].type).toBe("error")
      })

      it("returns valid actions when session exists", async () => {
        await handler.handleMessage({ type: "new_game" }, mockSend)
        sentMessages = []

        await handler.handleMessage({ type: "get_valid_actions" }, mockSend)

        expect(sentMessages.length).toBe(1)
        expect(sentMessages[0].type).toBe("valid_actions")
        const actionsMsg = sentMessages[0] as { type: "valid_actions"; actions: unknown[] }
        expect(Array.isArray(actionsMsg.actions)).toBe(true)
      })
    })

    describe("command", () => {
      it("returns error when no session exists", async () => {
        const message: ClientMessage = { type: "command", command: "survey" }
        await handler.handleMessage(message, mockSend)

        expect(sentMessages.length).toBe(1)
        expect(sentMessages[0].type).toBe("error")
      })

      it("executes command and streams progress", async () => {
        await handler.handleMessage({ type: "new_game" }, mockSend)
        sentMessages = []

        await handler.handleMessage({ type: "command", command: "survey" }, mockSend)

        // Should have progress ticks, command_result, and valid_actions
        expect(sentMessages.length).toBeGreaterThan(1)

        // Last message should be valid_actions (sent after command_result)
        const lastMsg = sentMessages[sentMessages.length - 1]
        expect(lastMsg.type).toBe("valid_actions")

        // Second to last should be command_result
        const resultMsg = sentMessages[sentMessages.length - 2]
        expect(resultMsg.type).toBe("command_result")
      })
    })

    describe("save_game", () => {
      it("returns error when no session exists", async () => {
        const message: ClientMessage = { type: "save_game" }
        await handler.handleMessage(message, mockSend)

        expect(sentMessages.length).toBe(1)
        expect(sentMessages[0].type).toBe("error")
      })

      it("returns serialized game state", async () => {
        await handler.handleMessage({ type: "new_game" }, mockSend)
        sentMessages = []

        await handler.handleMessage({ type: "save_game" }, mockSend)

        expect(sentMessages.length).toBe(1)
        expect(sentMessages[0].type).toBe("saved_game")
        const savedMsg = sentMessages[0] as { type: "saved_game"; savedState: string }
        expect(typeof savedMsg.savedState).toBe("string")

        // Verify it's valid JSON
        const parsed = JSON.parse(savedMsg.savedState)
        expect(parsed).toBeDefined()
      })
    })

    describe("load_game", () => {
      it("loads a saved game state and sends state + valid_actions", async () => {
        // First create and save a game
        await handler.handleMessage({ type: "new_game", seed: "test-seed" }, mockSend)
        sentMessages = []
        await handler.handleMessage({ type: "save_game" }, mockSend)

        const savedMsg = sentMessages[0] as { type: "saved_game"; savedState: string }
        const savedState = savedMsg.savedState
        sentMessages = []

        // Now create a fresh handler and load the state
        handler = new WebSocketHandler()
        await handler.handleMessage({ type: "load_game", savedState }, mockSend)

        expect(sentMessages.length).toBe(2)
        expect(sentMessages[0].type).toBe("state")
        expect(sentMessages[1].type).toBe("valid_actions")
      })

      it("includes the seed in load_game response", async () => {
        // First create and save a game with a known seed
        await handler.handleMessage({ type: "new_game", seed: "load-test-seed" }, mockSend)
        sentMessages = []
        await handler.handleMessage({ type: "save_game" }, mockSend)

        const savedMsg = sentMessages[0] as { type: "saved_game"; savedState: string }
        const savedState = savedMsg.savedState
        sentMessages = []

        // Now create a fresh handler and load the state
        handler = new WebSocketHandler()
        await handler.handleMessage({ type: "load_game", savedState }, mockSend)

        const stateMsg = sentMessages[0] as { type: "state"; seed: string }
        expect(stateMsg.seed).toBe("load-test-seed")
      })

      it("returns error for invalid saved state", async () => {
        await handler.handleMessage({ type: "load_game", savedState: "invalid json" }, mockSend)

        expect(sentMessages.length).toBe(1)
        expect(sentMessages[0].type).toBe("error")
      })
    })
  })

  describe("hasSession", () => {
    it("returns false initially", () => {
      expect(handler.hasSession()).toBe(false)
    })

    it("returns true after creating a game", async () => {
      await handler.handleMessage({ type: "new_game" }, mockSend)
      expect(handler.hasSession()).toBe(true)
    })
  })
})
