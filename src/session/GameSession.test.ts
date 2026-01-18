/**
 * GameSession Tests
 *
 * Tests for the GameSession abstraction following TDD approach.
 */

import { GameSession } from "./GameSession.js"
import type { CommandTick, CommandResult } from "./types.js"

describe("GameSession", () => {
  describe("creation", () => {
    it("creates a new session with a seed", () => {
      const session = GameSession.create("test-seed-1")

      expect(session).toBeDefined()
      expect(session.getSessionId()).toBe("test-seed-1")
    })

    it("creates a session at tick 0", () => {
      const session = GameSession.create("test-seed-2")

      expect(session.getElapsedTicks()).toBe(0)
    })

    it("creates a session with player in TOWN", () => {
      const session = GameSession.create("test-seed-3")
      const state = session.getState()

      expect(state.location.areaId).toBe("TOWN")
      expect(state.location.isInTown).toBe(true)
    })

    it("creates a session with empty inventory", () => {
      const session = GameSession.create("test-seed-4")
      const state = session.getState()

      expect(state.inventory.items).toHaveLength(0)
      expect(state.inventory.used).toBe(0)
    })

    it("creates a session with no enrolled skills", () => {
      const session = GameSession.create("test-seed-5")
      const state = session.getState()

      const enrolledSkills = state.skills.filter((s) => s.isEnrolled)
      expect(enrolledSkills).toHaveLength(0)
    })

    it("creates deterministic sessions from the same seed", () => {
      const session1 = GameSession.create("same-seed")
      const session2 = GameSession.create("same-seed")

      const state1 = session1.getState()
      const state2 = session2.getState()

      // States should be structurally identical
      expect(state1.location).toEqual(state2.location)
      expect(state1.skills).toEqual(state2.skills)
    })
  })

  describe("getState", () => {
    it("returns a complete GameStateSnapshot", () => {
      const session = GameSession.create("state-test")
      const state = session.getState()

      // Verify all required fields are present
      expect(state.location).toBeDefined()
      expect(state.inventory).toBeDefined()
      expect(state.storage).toBeDefined()
      expect(state.skills).toBeDefined()
      expect(state.contracts).toBeDefined()
      expect(state.exploration).toBeDefined()
      expect(state.time).toBeDefined()
      expect(typeof state.gold).toBe("number")
      expect(typeof state.guildReputation).toBe("number")
    })

    it("returns location with all required fields", () => {
      const session = GameSession.create("location-test")
      const { location } = session.getState()

      expect(typeof location.areaId).toBe("string")
      expect(typeof location.areaName).toBe("string")
      expect(typeof location.areaDistance).toBe("number")
      expect(typeof location.locationName).toBe("string")
      expect(typeof location.isInTown).toBe("boolean")
      expect(["unexplored", "partly explored", "fully explored"]).toContain(
        location.explorationStatus
      )
    })

    it("returns skills array with all skill types", () => {
      const session = GameSession.create("skills-test")
      const { skills } = session.getState()

      const skillIds = skills.map((s) => s.id)
      expect(skillIds).toContain("Mining")
      expect(skillIds).toContain("Woodcutting")
      expect(skillIds).toContain("Combat")
      expect(skillIds).toContain("Exploration")
      expect(skillIds).toContain("Smithing")
      expect(skillIds).toContain("Woodcrafting")
    })

    it("returns time info with current tick", () => {
      const session = GameSession.create("time-test")
      const { time } = session.getState()

      expect(time.currentTick).toBe(0)
      expect(typeof time.gatheringLuckDelta).toBe("number")
    })
  })

  describe("getValidActions", () => {
    it("returns an array of valid actions", () => {
      const session = GameSession.create("actions-test")
      const actions = session.getValidActions()

      expect(Array.isArray(actions)).toBe(true)
    })

    it("returns actions with required fields", () => {
      const session = GameSession.create("actions-fields-test")
      const actions = session.getValidActions()

      // In TOWN at Town Square, there should be some actions
      expect(actions.length).toBeGreaterThan(0)

      for (const action of actions) {
        expect(typeof action.displayName).toBe("string")
        expect(typeof action.command).toBe("string")
        expect(action.action).toBeDefined()
        expect(typeof action.timeCost).toBe("number")
        expect(typeof action.isVariable).toBe("boolean")
        expect(typeof action.successProbability).toBe("number")
      }
    })

    it("includes Go to ... actions in TOWN (expanded from go <location>)", () => {
      const session = GameSession.create("town-actions-test")
      const actions = session.getValidActions()

      // Actions are now expanded, e.g., "Go to Mining Guild" instead of "go <location>"
      const goAction = actions.find((a) => a.displayName.startsWith("Go to "))
      expect(goAction).toBeDefined()
    })
  })

  describe("executeCommand", () => {
    it("executes a valid command and returns result", async () => {
      const session = GameSession.create("exec-test")

      // Travel to Miners Guild (a valid action in TOWN)
      const result = await session.executeCommand("go miners guild")

      expect(result).toBeDefined()
      expect(result.log).toBeDefined()
      expect(result.stateAfter).toBeDefined()
    })

    it("returns success true for successful commands", async () => {
      const session = GameSession.create("success-test")

      const result = await session.executeCommand("go miners guild")

      expect(result.success).toBe(true)
    })

    it("returns success false for failed commands", async () => {
      const session = GameSession.create("fail-test")

      // Try to enrol without being at a guild
      const result = await session.executeCommand("enrol")

      expect(result.success).toBe(false)
    })

    it("updates state after command execution", async () => {
      const session = GameSession.create("update-test")

      const stateBefore = session.getState()
      expect(stateBefore.location.locationId).toBeNull() // At Town Square

      await session.executeCommand("go miners guild")

      const stateAfter = session.getState()
      expect(stateAfter.location.locationId).not.toBeNull()
      expect(stateAfter.location.locationName).toBe("Miners Guild")
    })

    it("advances time for time-consuming commands", async () => {
      const session = GameSession.create("time-advance-test")

      const ticksBefore = session.getElapsedTicks()
      await session.executeCommand("go miners guild")
      await session.executeCommand("enrol")

      const ticksAfter = session.getElapsedTicks()
      expect(ticksAfter).toBeGreaterThan(ticksBefore)
    })

    it("returns stateAfter matching current session state", async () => {
      const session = GameSession.create("state-match-test")

      const result = await session.executeCommand("go miners guild")

      const currentState = session.getState()
      expect(result.stateAfter.location).toEqual(currentState.location)
    })
  })

  describe("executeCommandWithProgress", () => {
    it("yields progress ticks for multi-tick actions", async () => {
      const session = GameSession.create("progress-test")

      // Go to Miners Guild and enrol (enrol takes 20 ticks)
      await session.executeCommand("go miners guild")

      const ticks: unknown[] = []
      for await (const tick of session.executeCommandWithProgress("enrol")) {
        ticks.push(tick)
      }

      // Should have multiple progress ticks before the final result
      expect(ticks.length).toBeGreaterThan(1)
    })

    it("yields final result with log, success, and stateAfter", async () => {
      const session = GameSession.create("done-test")

      await session.executeCommand("go miners guild")

      const ticks: (CommandTick | CommandResult)[] = []
      for await (const tick of session.executeCommandWithProgress("enrol")) {
        ticks.push(tick)
      }

      expect(ticks.length).toBeGreaterThan(0)

      // All ticks except the last should be progress ticks (no 'log' property)
      const progressTicks = ticks.slice(0, -1)
      for (const tick of progressTicks) {
        expect("log" in tick).toBe(false)
        expect((tick as CommandTick).type).toMatch(/progress|feedback/)
      }

      // The last tick should be the CommandResult
      const finalResult = ticks[ticks.length - 1] as CommandResult
      expect(finalResult.log).toBeDefined()
      expect(finalResult.success).toBe(true)
      expect(finalResult.stateAfter).toBeDefined()
      expect(finalResult.stateAfter.location).toBeDefined()
      expect(finalResult.stateAfter.skills).toBeDefined()
    })
  })

  describe("persistence", () => {
    it("serializes session to JSON string", () => {
      const session = GameSession.create("serialize-test")

      const json = session.serialize()

      expect(typeof json).toBe("string")
      expect(() => JSON.parse(json)).not.toThrow()
    })

    it("restores session from saved state", () => {
      const original = GameSession.create("restore-test")

      // Execute some commands to change state
      // (Note: This is synchronous for the test, but we can't await here)
      const json = original.serialize()

      const restored = GameSession.fromSavedState(json)

      expect(restored.getSessionId()).toBe(original.getSessionId())
    })

    it("preserves state across save/restore cycle", async () => {
      const original = GameSession.create("preserve-test")

      // Change state
      await original.executeCommand("go miners guild")

      const json = original.serialize()
      const restored = GameSession.fromSavedState(json)

      const originalState = original.getState()
      const restoredState = restored.getState()

      expect(restoredState.location.locationId).toBe(originalState.location.locationId)
      expect(restoredState.time.currentTick).toBe(originalState.time.currentTick)
    })

    it("preserves elapsed ticks across save/restore", async () => {
      const original = GameSession.create("ticks-preserve-test")

      await original.executeCommand("go miners guild")
      await original.executeCommand("enrol")

      const ticksBefore = original.getElapsedTicks()
      const json = original.serialize()

      const restored = GameSession.fromSavedState(json)

      expect(restored.getElapsedTicks()).toBe(ticksBefore)
    })
  })

  describe("edge cases", () => {
    it("handles invalid command gracefully", async () => {
      const session = GameSession.create("invalid-cmd-test")

      const result = await session.executeCommand("not a real command")

      expect(result.success).toBe(false)
    })

    it("handles empty command gracefully", async () => {
      const session = GameSession.create("empty-cmd-test")

      const result = await session.executeCommand("")

      expect(result.success).toBe(false)
    })

    it("handles command with extra whitespace", async () => {
      const session = GameSession.create("whitespace-test")

      const result = await session.executeCommand("  go   miners guild  ")

      expect(result.success).toBe(true)
    })
  })
})
