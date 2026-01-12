import { describe, it, expect } from "@jest/globals"
import { createSystemPrompt, RESPONSE_FORMAT } from "./prompts.js"

describe("Prompts", () => {
  describe("createSystemPrompt", () => {
    it("should include game framing", () => {
      const prompt = createSystemPrompt("explore the game")

      expect(prompt).toContain("text-based game")
    })

    it("should include available action types", () => {
      const prompt = createSystemPrompt("explore the game")

      expect(prompt).toContain("Go")
      expect(prompt).toContain("Leave")
      expect(prompt).toContain("Gather")
      expect(prompt).toContain("Fight")
      expect(prompt).toContain("Store")
      expect(prompt).toContain("Drop")
      expect(prompt).toContain("AcceptContract")
      expect(prompt).toContain("Enrol")
      // Note: Craft is not included in gathering MVP (no recipes defined)
    })

    it("should include the objective", () => {
      const objective = "maximize XP while having fun"
      const prompt = createSystemPrompt(objective)

      expect(prompt).toContain(objective)
    })

    it("should include response format instructions", () => {
      const prompt = createSystemPrompt("explore")

      expect(prompt).toContain("REASONING")
      expect(prompt).toContain("ACTION")
      expect(prompt).toContain("LEARNING")
    })

    it("should instruct agent to discover mechanics", () => {
      const prompt = createSystemPrompt("explore")

      expect(prompt.toLowerCase()).toContain("discover")
    })

    it("should not reveal detailed mechanics", () => {
      const prompt = createSystemPrompt("explore")

      // Should not reveal XP formulas, exact probabilities, etc.
      expect(prompt).not.toContain("(N+1)²")
      expect(prompt).not.toContain("40%")
      expect(prompt).not.toContain("collateral damage")
    })
  })

  describe("RESPONSE_FORMAT", () => {
    it("should define expected response sections", () => {
      expect(RESPONSE_FORMAT).toContain("REASONING:")
      expect(RESPONSE_FORMAT).toContain("ACTION:")
      expect(RESPONSE_FORMAT).toContain("LEARNING:")
    })

    it("should include CONTINUE_IF for hybrid decisions", () => {
      expect(RESPONSE_FORMAT).toContain("CONTINUE_IF:")
    })
  })
})
