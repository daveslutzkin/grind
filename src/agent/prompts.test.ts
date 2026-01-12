import { describe, it, expect } from "@jest/globals"
import { createSystemPrompt, RESPONSE_FORMAT } from "./prompts.js"

describe("Prompts", () => {
  describe("createSystemPrompt", () => {
    it("should include game framing", () => {
      const prompt = createSystemPrompt("explore the game")

      expect(prompt).toContain("text-based game")
    })

    it("should include available action formats", () => {
      const prompt = createSystemPrompt("explore the game")

      // Check for new simplified action formats
      expect(prompt).toContain("go <area name")
      expect(prompt).toContain("leave")
      expect(prompt).toContain("fight")
      expect(prompt).toContain("store <quantity>")
      expect(prompt).toContain("drop <quantity>")
      expect(prompt).toContain("accept <contract_id>")
      expect(prompt).toContain("enrol")
      expect(prompt).toContain("chop <focus")
      expect(prompt).toContain("mine <focus")
      expect(prompt).toContain("explore")
      expect(prompt).toContain("survey")
      expect(prompt).toContain("fartravel")
      expect(prompt).toContain("craft <recipe_id>")
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

    it("should include available actions guidance", () => {
      const prompt = createSystemPrompt("explore")

      expect(prompt).toContain("AVAILABLE ACTIONS")
      expect(prompt).toContain("Available actions:")
      expect(prompt).toContain("time cost in ticks")
      expect(prompt).toContain("varies")
      expect(prompt).toContain("Only attempt actions from this list")
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
