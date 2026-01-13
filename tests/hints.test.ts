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

    it("should provide hint for ALREADY_IN_AREA", () => {
      const state = createWorld()
      const details: FailureDetails = {
        type: "ALREADY_IN_AREA",
        reason: "already_here",
        context: {
          destination: "Whispering Woods",
          destinationId: "area-d1-i3",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Already in Whispering Woods")
      expect(result.reason).toBe("You are already at this area")
      expect(result.hint).toContain("already here")
    })

    it("should provide hint for LOCATION_NOT_DISCOVERED", () => {
      const state = createWorld()
      const details: FailureDetails = {
        type: "LOCATION_NOT_DISCOVERED",
        reason: "not_discovered",
        context: {
          locationId: "area-d1-loc-5",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Location not discovered")
      expect(result.reason).toBe("This location hasn't been found yet")
      expect(result.hint).toContain("explore")
    })

    it("should provide hint for UNKNOWN_LOCATION", () => {
      const state = createWorld()
      const details: FailureDetails = {
        type: "UNKNOWN_LOCATION",
        reason: "not_found",
        context: {
          locationId: "invalid-location-id",
          currentAreaId: "TOWN",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toContain("Unknown location")
      expect(result.reason).toBe("Location not found in current area")
      expect(result.hint).toContain("look")
    })

    it("should provide hint for ALREADY_AT_LOCATION", () => {
      const state = createWorld()
      const details: FailureDetails = {
        type: "ALREADY_AT_LOCATION",
        reason: "already_here",
        context: {
          locationId: "TOWN-miners-guild",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Already at this location")
      expect(result.reason).toBe("You are already here")
      expect(result.hint).toContain("already")
    })

    it("should provide hint for NOT_AT_HUB", () => {
      const state = createWorld()
      const details: FailureDetails = {
        type: "NOT_AT_HUB",
        reason: "at_location",
        context: {
          currentLocationId: "TOWN-miners-guild",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Cannot travel to location")
      expect(result.reason).toContain("Must be at area hub")
      expect(result.hint).toContain("leave")
    })

    it("should provide hint for ALREADY_AT_HUB", () => {
      const state = createWorld()
      const details: FailureDetails = {
        type: "ALREADY_AT_HUB",
        reason: "at_hub",
        context: {
          currentAreaId: "TOWN",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Already at hub")
      expect(result.reason).toContain("not at a location")
      expect(result.hint).toContain("go <location>")
    })

    it("should provide hint for NOT_AT_NODE_LOCATION", () => {
      const state = createWorld()
      const details: FailureDetails = {
        type: "NOT_AT_NODE_LOCATION",
        reason: "wrong_location",
        context: {
          nodeType: "ORE_VEIN",
          requiredLocationId: "area-d1-loc-3",
          currentLocationId: "area-d1-loc-2",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Not at gathering location")
      expect(result.reason).toContain("Must be at the ORE_VEIN location")
      expect(result.hint).toContain("go <location>")
    })
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

  describe("Integration Tests: Travel/Navigation", () => {
    it("should produce structured failure for ALREADY_AT_LOCATION", async () => {
      const state = createWorld()

      // Try to go to a location we're already at (should be null/hub initially)
      // First, let's travel to a location in TOWN
      const action1: import("../src/types.js").TravelToLocationAction = {
        type: "TravelToLocation",
        locationId: "TOWN_MINERS_GUILD",
      }

      const { executeAction } = await import("../src/engine.js")

      // Execute first action to get to miners guild
      const log1 = await executeAction(state, action1)
      expect(log1.success).toBe(true)

      // Now try to go to the same location again
      const action2: import("../src/types.js").TravelToLocationAction = {
        type: "TravelToLocation",
        locationId: "TOWN_MINERS_GUILD",
      }

      const log2 = await executeAction(state, action2)

      // Should fail immediately
      expect(log2.success).toBe(false)
      expect(log2.failureType).toBe("ALREADY_AT_LOCATION")
      expect(log2.failureDetails).toBeDefined()
      expect(log2.failureDetails?.type).toBe("ALREADY_AT_LOCATION")
      expect(log2.failureDetails?.reason).toBe("already_here")
      expect(log2.failureDetails?.context).toMatchObject({
        locationId: "TOWN_MINERS_GUILD",
      })
    })

    it("should produce structured failure for ALREADY_AT_HUB", async () => {
      const state = createWorld()

      // Try to leave when already at hub
      const action: import("../src/types.js").LeaveAction = {
        type: "Leave",
      }

      const { executeAction } = await import("../src/engine.js")

      const log = await executeAction(state, action)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureType).toBe("ALREADY_AT_HUB")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("ALREADY_AT_HUB")
      expect(log.failureDetails?.reason).toBe("at_hub")
    })

    it("should produce structured failure for NOT_AT_HUB", async () => {
      const state = createWorld()

      // First, travel to a location
      const action1: import("../src/types.js").TravelToLocationAction = {
        type: "TravelToLocation",
        locationId: "TOWN_MINERS_GUILD",
      }

      const { executeAction } = await import("../src/engine.js")

      const log1 = await executeAction(state, action1)
      expect(log1.success).toBe(true)

      // Now try to travel to another location (should fail since we're not at hub)
      const action2: import("../src/types.js").TravelToLocationAction = {
        type: "TravelToLocation",
        locationId: "TOWN_FORESTERS_GUILD",
      }

      const log2 = await executeAction(state, action2)

      // Should fail immediately
      expect(log2.success).toBe(false)
      expect(log2.failureType).toBe("NOT_AT_HUB")
      expect(log2.failureDetails).toBeDefined()
      expect(log2.failureDetails?.type).toBe("NOT_AT_HUB")
      expect(log2.failureDetails?.reason).toBe("at_location")
    })

    it("should produce structured failure for UNKNOWN_LOCATION", async () => {
      const state = createWorld()

      // Try to travel to a non-existent location
      const action: import("../src/types.js").TravelToLocationAction = {
        type: "TravelToLocation",
        locationId: "INVALID-LOCATION",
      }

      const { executeAction } = await import("../src/engine.js")

      const log = await executeAction(state, action)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureType).toBe("UNKNOWN_LOCATION")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("UNKNOWN_LOCATION")
      expect(log.failureDetails?.reason).toBe("not_found")
    })
  })
})
