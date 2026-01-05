import { describe, it, expect } from "@jest/globals"
import { RULES_VERSION, loadAgentConfig, AgentConfig } from "./config.js"

describe("Agent Configuration", () => {
  describe("RULES_VERSION", () => {
    it("should be a string constant", () => {
      expect(typeof RULES_VERSION).toBe("string")
    })

    it("should have format rules_N", () => {
      expect(RULES_VERSION).toMatch(/^rules_\d+$/)
    })
  })

  describe("loadAgentConfig", () => {
    it("should return default config when no config file exists", () => {
      const config = loadAgentConfig("/nonexistent/path/config.json")
      expect(config).toEqual({
        openaiApiKey: "",
        model: "gpt-4o-mini",
      })
    })

    it("should return a valid AgentConfig structure", () => {
      const config = loadAgentConfig()
      expect(config).toHaveProperty("openaiApiKey")
      expect(config).toHaveProperty("model")
    })
  })

  describe("AgentConfig type", () => {
    it("should have required fields", () => {
      const config: AgentConfig = {
        openaiApiKey: "test-key",
        model: "gpt-4o-mini",
      }
      expect(config.openaiApiKey).toBe("test-key")
      expect(config.model).toBe("gpt-4o-mini")
    })
  })
})
