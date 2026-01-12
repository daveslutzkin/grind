import { describe, it, expect, beforeEach } from "@jest/globals"
import { createLLMClient, LLMClient, LLMMessage } from "./llm.js"
import { AgentConfig } from "./config.js"

describe("LLM Client", () => {
  describe("createLLMClient", () => {
    it("should create a client with valid config", () => {
      const config: AgentConfig = {
        anthropicApiKey: "test-key",
        model: "claude-sonnet-4-20250514",
      }
      const client = createLLMClient(config)

      expect(client).toBeDefined()
      expect(client.getModel()).toBe("claude-sonnet-4-20250514")
    })

    it("should throw if API key is missing", () => {
      const config: AgentConfig = {
        anthropicApiKey: "",
        model: "claude-sonnet-4-20250514",
      }

      expect(() => createLLMClient(config)).toThrow("API key is required")
    })
  })

  describe("LLMClient", () => {
    let client: LLMClient
    const mockConfig: AgentConfig = {
      anthropicApiKey: "test-key",
      model: "claude-sonnet-4-20250514",
    }

    beforeEach(() => {
      client = createLLMClient(mockConfig)
    })

    it("should track conversation history", () => {
      client.addMessage({ role: "user", content: "Hello" })
      client.addMessage({ role: "assistant", content: "Hi there!" })

      const history = client.getHistory()
      expect(history).toHaveLength(2)
      expect(history[0]).toEqual({ role: "user", content: "Hello" })
    })

    it("should clear conversation history", () => {
      client.addMessage({ role: "user", content: "Hello" })
      client.clearHistory()

      expect(client.getHistory()).toHaveLength(0)
    })

    it("should set system prompt", () => {
      client.setSystemPrompt("You are a game agent.")

      const history = client.getHistory()
      expect(history).toHaveLength(1)
      expect(history[0].role).toBe("system")
    })

    it("should respect history limit for context window management", () => {
      client.setHistoryLimit(3)

      client.addMessage({ role: "user", content: "Message 1" })
      client.addMessage({ role: "assistant", content: "Response 1" })
      client.addMessage({ role: "user", content: "Message 2" })
      client.addMessage({ role: "assistant", content: "Response 2" })

      const history = client.getHistory()
      // Should only keep last 3 messages
      expect(history.length).toBeLessThanOrEqual(3)
    })
  })

  describe("Message formatting", () => {
    it("should format messages correctly", () => {
      const message: LLMMessage = {
        role: "user",
        content: "Test message",
      }

      expect(message.role).toBe("user")
      expect(message.content).toBe("Test message")
    })

    it("should support system, user, and assistant roles", () => {
      const roles = ["system", "user", "assistant"] as const

      for (const role of roles) {
        const message: LLMMessage = { role, content: "Test" }
        expect(message.role).toBe(role)
      }
    })
  })

  describe("Notes functionality", () => {
    let client: LLMClient
    const mockConfig: AgentConfig = {
      anthropicApiKey: "test-key",
      model: "claude-sonnet-4-20250514",
    }

    beforeEach(() => {
      client = createLLMClient(mockConfig)
    })

    it("should update notes via updateNotes", () => {
      client.updateNotes("First note: mining costs 3 ticks")

      const snapshot = client.getContextSnapshot()
      expect(snapshot.notes).toBe("First note: mining costs 3 ticks")
    })

    it("should replace notes entirely on update", () => {
      client.updateNotes("Original notes")
      client.updateNotes("Completely new notes")

      const snapshot = client.getContextSnapshot()
      expect(snapshot.notes).toBe("Completely new notes")
      expect(snapshot.notes).not.toContain("Original")
    })

    it("should include notes in context snapshot", () => {
      client.setSystemPrompt("You are a game agent.")
      client.updateNotes("Contract: 2 copper bars -> 5 ore")
      client.updateActionSummary("T0: Enrol Mining -> OK")
      client.updateLearningSummary("KNOWN: Enrol costs 3 ticks")

      const snapshot = client.getContextSnapshot()

      expect(snapshot.systemPrompt).toBe("You are a game agent.")
      expect(snapshot.notes).toBe("Contract: 2 copper bars -> 5 ore")
      expect(snapshot.actionSummary).toBe("T0: Enrol Mining -> OK")
      expect(snapshot.learningSummary).toBe("KNOWN: Enrol costs 3 ticks")
    })

    it("should clear notes when history is cleared", () => {
      client.updateNotes("Some notes")
      client.clearHistory()

      const snapshot = client.getContextSnapshot()
      expect(snapshot.notes).toBe("")
    })

    it("should handle empty notes", () => {
      client.updateNotes("")

      const snapshot = client.getContextSnapshot()
      expect(snapshot.notes).toBe("")
    })

    it("should handle multiline notes", () => {
      const multilineNotes = `Discoveries:
- Miners Guild contract: 2 copper bars -> 5 ore
- Smithing recipes available
- Travel to mine: 2 ticks`

      client.updateNotes(multilineNotes)

      const snapshot = client.getContextSnapshot()
      expect(snapshot.notes).toBe(multilineNotes)
      expect(snapshot.notes).toContain("Miners Guild")
      expect(snapshot.notes).toContain("Smithing recipes")
    })

    it("should set notes via setContextConfig", () => {
      client.setContextConfig({
        notes: "Config-set notes",
        recentExchangeCount: 3,
      })

      const snapshot = client.getContextSnapshot()
      expect(snapshot.notes).toBe("Config-set notes")
    })
  })
})
