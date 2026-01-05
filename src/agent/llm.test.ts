import { describe, it, expect, beforeEach } from "@jest/globals"
import { createLLMClient, LLMClient, LLMMessage } from "./llm.js"
import { AgentConfig } from "./config.js"

describe("LLM Client", () => {
  describe("createLLMClient", () => {
    it("should create a client with valid config", () => {
      const config: AgentConfig = {
        openaiApiKey: "test-key",
        model: "gpt-4o-mini",
      }
      const client = createLLMClient(config)

      expect(client).toBeDefined()
      expect(client.getModel()).toBe("gpt-4o-mini")
    })

    it("should throw if API key is missing", () => {
      const config: AgentConfig = {
        openaiApiKey: "",
        model: "gpt-4o-mini",
      }

      expect(() => createLLMClient(config)).toThrow("API key is required")
    })
  })

  describe("LLMClient", () => {
    let client: LLMClient
    const mockConfig: AgentConfig = {
      openaiApiKey: "test-key",
      model: "gpt-4o-mini",
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
})
