// Unit tests for hint generation

import { describe, it, expect } from "@jest/globals"
import { generateFailureHint } from "../src/hints.js"
import type { FailureDetails } from "../src/types.js"
import { createWorld } from "../src/world.js"

describe("generateFailureHint", () => {
  it("should return a generic message for unimplemented failure types", () => {
    const state = createWorld()
    const details: FailureDetails = {
      type: "INSUFFICIENT_SKILL",
      reason: "level_too_low",
      context: { required: 5, current: 3 },
    }

    const result = generateFailureHint(details, state)

    expect(result.message).toBe("Insufficient skill")
    expect(result.reason).toBe("level_too_low")
    expect(result.hint).toBe("More specific hints will be added in later packages")
  })

  it("should handle missing reason and context", () => {
    const state = createWorld()
    const details: FailureDetails = {
      type: "NODE_NOT_FOUND",
    }

    const result = generateFailureHint(details, state)

    expect(result.message).toBe("Resource node not found")
    expect(result.reason).toBeUndefined()
    expect(result.hint).toBe("More specific hints will be added in later packages")
  })

  // Travel/Navigation Errors (Package 2)
  describe("Travel/Navigation Errors (Package 2)", () => {
    it("should provide hint for NO_PATH_TO_DESTINATION with undiscovered area", () => {
      const state = createWorld()
      const details: FailureDetails = {
        type: "NO_PATH_TO_DESTINATION",
        reason: "undiscovered",
        context: {
          destination: "Silvermark Ridge",
          destinationId: "area-d2-i0",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("No path to Silvermark Ridge")
      expect(result.reason).toBe("Area is undiscovered")
      expect(result.hint).toContain("Explore from your current location")
    })

    it("should provide hint for NO_PATH_TO_DESTINATION with no_route", () => {
      const state = createWorld()
      const details: FailureDetails = {
        type: "NO_PATH_TO_DESTINATION",
        reason: "no_route",
        context: {
          destination: "Distant Mountain",
          destinationId: "area-d3-i5",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("No path to Distant Mountain")
      expect(result.reason).toBe("No connecting route exists")
      expect(result.hint).toContain("Areas may connect through intermediate locations")
    })

    it("should provide hint for AREA_NOT_KNOWN", () => {
      const state = createWorld()
      const details: FailureDetails = {
        type: "AREA_NOT_KNOWN",
        reason: "undiscovered",
        context: {
          destination: "Hidden Valley",
          destinationId: "area-d4-i2",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Cannot travel to Hidden Valley")
      expect(result.reason).toBe("Area is undiscovered")
      expect(result.hint).toContain("Explore from your current location")
    })

    it.todo("should provide hint for LOCATION_NOT_DISCOVERED")
  })

  describe("Skill/Resource Errors (Package 3)", () => {
    it.todo("should provide hint for INSUFFICIENT_SKILL with level requirements")
    it.todo("should provide hint for MISSING_ITEMS with specific items")
    it.todo("should provide hint for INVENTORY_FULL")
  })

  describe("Gathering/Crafting Errors (Package 4)", () => {
    it.todo("should provide hint for GATHER_FAILURE with skill check info")
    it.todo("should provide hint for NODE_NOT_FOUND with location info")
    it.todo("should provide hint for NODE_DEPLETED")
  })

  describe("Combat Errors (Package 5)", () => {
    it.todo("should provide hint for COMBAT_FAILURE with enemy info")
    it.todo("should provide hint for ENEMY_NOT_FOUND")
  })

  describe("Guild/Contract Errors (Package 6)", () => {
    it.todo("should provide hint for GUILD_LEVEL_TOO_LOW with requirements")
    it.todo("should provide hint for CONTRACT_NOT_FOUND")
  })

  describe("Exploration Errors (Package 7)", () => {
    it.todo("should provide hint for NO_UNDISCOVERED_AREAS")
    it.todo("should provide hint for AREA_FULLY_EXPLORED")
  })

  describe("Location/Mode Errors (Package 8)", () => {
    it.todo("should provide hint for WRONG_LOCATION with required location")
    it.todo("should provide hint for MODE_NOT_UNLOCKED with unlock requirements")
  })
})
