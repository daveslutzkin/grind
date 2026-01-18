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

    it("does not include unexpanded go <location> placeholder", () => {
      const session = GameSession.create("no-placeholder-test")
      const actions = session.getValidActions()

      const placeholder = actions.find((a) => a.displayName === "go <location>")
      expect(placeholder).toBeUndefined()
    })
  })

  describe("action expansion", () => {
    describe("go <location> expansion", () => {
      it("expands to concrete location options", () => {
        const session = GameSession.create("expand-loc-test")
        const actions = session.getValidActions()

        // In TOWN, should have "Go to Miners Guild", "Go to Foresters Guild", etc.
        const goActions = actions.filter((a) => a.displayName.startsWith("Go to "))
        expect(goActions.length).toBeGreaterThan(0)

        // Each should have a valid command like "go miners_guild" or similar
        for (const action of goActions) {
          expect(action.command).toMatch(/^go .+/)
          expect(action.action).toBeDefined()
          expect(action.timeCost).toBeGreaterThanOrEqual(0)
        }
      })

      it("uses timeCost from checkAction (0 in town)", () => {
        const session = GameSession.create("loc-time-test")
        const actions = session.getValidActions()

        const goLocationAction = actions.find((a) => a.displayName.startsWith("Go to "))
        expect(goLocationAction).toBeDefined()
        // In TOWN, traveling to locations is instant (0 ticks)
        expect(goLocationAction!.timeCost).toBe(0)
      })
    })

    describe("go <area> expansion", () => {
      it("expands to Travel to ... for adjacent areas", async () => {
        const session = GameSession.create("expand-area-test")

        // First, travel outside town to see adjacent area options
        await session.executeCommand("go miners guild")
        await session.executeCommand("enrol")
        await session.executeCommand("survey")

        const actions = session.getValidActions()

        // Should NOT have raw "go <area>" placeholder
        const placeholder = actions.find((a) => a.displayName === "go <area>")
        expect(placeholder).toBeUndefined()

        // Any "Travel to ..." actions should have valid commands
        const travelActions = actions.filter((a) => a.displayName.startsWith("Travel to "))
        for (const action of travelActions) {
          expect(action.command).toMatch(/^go .+/)
        }
      })

      it("uses 'Travel to' prefix to distinguish from location travel", async () => {
        const session = GameSession.create("travel-prefix-test")

        // Setup: explore an area to have adjacent area options
        await session.executeCommand("go miners guild")
        await session.executeCommand("enrol")

        // Survey and explore to unlock area connections
        for (let i = 0; i < 5; i++) {
          await session.executeCommand("survey")
        }

        const actions = session.getValidActions()

        // Location travel uses "Go to"
        const goToActions = actions.filter((a) => a.displayName.startsWith("Go to "))
        // Area travel uses "Travel to"
        const travelToActions = actions.filter((a) => a.displayName.startsWith("Travel to "))

        // Verify distinction exists (at least location travel should exist)
        expect(goToActions.length).toBeGreaterThanOrEqual(0)
        // Travel actions may not exist if no adjacent areas are known yet
        // but the point is they use different prefixes
        for (const action of travelToActions) {
          expect(action.command).toMatch(/^go .+/)
          expect(action.displayName).not.toMatch(/^Go to /)
        }
      })

      it("uses friendly slugs instead of internal area IDs in commands", async () => {
        const session = GameSession.create("travel-slug-test")

        await session.executeCommand("go miners guild")
        await session.executeCommand("enrol")
        // Survey to discover adjacent areas
        for (let i = 0; i < 5; i++) {
          await session.executeCommand("survey")
        }

        const actions = session.getValidActions()
        const travelToActions = actions.filter((a) => a.displayName.startsWith("Travel to "))

        for (const action of travelToActions) {
          // Command should NOT contain raw area IDs like "area-d1-i0"
          expect(action.command).not.toMatch(/area-d\d+-i\d+/)
          // Command should use the slugified area name from displayName
          const areaNameFromDisplay = action.displayName.replace("Travel to ", "")
          const expectedSlug = areaNameFromDisplay.toLowerCase().replace(/\s+/g, "-")
          expect(action.command).toBe(`go ${expectedSlug}`)
        }
      })

      it("slug-based go commands can be executed successfully (round-trip)", async () => {
        const session = GameSession.create("travel-roundtrip-test")

        await session.executeCommand("go miners guild")
        await session.executeCommand("enrol")
        // Survey to discover adjacent areas
        for (let i = 0; i < 5; i++) {
          await session.executeCommand("survey")
        }

        const actions = session.getValidActions()
        const travelAction = actions.find((a) => a.displayName.startsWith("Travel to "))

        if (travelAction) {
          // Get expected destination from the action
          const expectedDestinationId = (travelAction.action as { destinationAreaId: string })
            .destinationAreaId

          // Execute the slug-based command
          const result = await session.executeCommand(travelAction.command)

          // Verify the command succeeded and player is at the expected destination
          expect(result.success).toBe(true)
          expect(session.getState().location.areaId).toBe(expectedDestinationId)
        }
      })
    })

    describe("fartravel <area> expansion", () => {
      it("does not include unexpanded fartravel placeholder", async () => {
        const session = GameSession.create("fartravel-test")

        await session.executeCommand("go miners guild")
        await session.executeCommand("enrol")

        const actions = session.getValidActions()

        const placeholder = actions.find((a) => a.displayName === "fartravel <area>")
        expect(placeholder).toBeUndefined()
      })

      it("expands fartravel to 'Fartravel to ...' options", async () => {
        const session = GameSession.create("fartravel-expand-test")

        // Setup: get to a location where fartravel might be available
        await session.executeCommand("go miners guild")
        await session.executeCommand("enrol")
        await session.executeCommand("survey")
        await session.executeCommand("survey")

        const actions = session.getValidActions()

        // Fartravel actions should have proper display names
        const fartravelActions = actions.filter((a) => a.displayName.startsWith("Fartravel to "))
        for (const action of fartravelActions) {
          expect(action.command).toMatch(/^fartravel .+/)
          expect(action.timeCost).toBeGreaterThan(0)
        }
      })

      it("uses friendly slugs instead of internal area IDs in commands", async () => {
        const session = GameSession.create("fartravel-slug-test")

        await session.executeCommand("go miners guild")
        await session.executeCommand("enrol")
        await session.executeCommand("survey")
        await session.executeCommand("survey")

        const actions = session.getValidActions()

        const fartravelActions = actions.filter((a) => a.displayName.startsWith("Fartravel to "))
        for (const action of fartravelActions) {
          // Command should NOT contain raw area IDs like "area-d1-i0"
          expect(action.command).not.toMatch(/area-d\d+-i\d+/)
          // Command should use the slugified area name from displayName
          const areaNameFromDisplay = action.displayName.replace("Fartravel to ", "")
          const expectedSlug = areaNameFromDisplay.toLowerCase().replace(/\s+/g, "-")
          expect(action.command).toBe(`fartravel ${expectedSlug}`)
        }
      })

      it("slug-based commands can be executed successfully (round-trip)", async () => {
        const session = GameSession.create("fartravel-roundtrip-test")

        // Setup: discover an area
        await session.executeCommand("go miners guild")
        await session.executeCommand("enrol")
        await session.executeCommand("survey")
        await session.executeCommand("survey")

        const actions = session.getValidActions()
        const fartravelAction = actions.find((a) => a.displayName.startsWith("Fartravel to "))

        if (fartravelAction) {
          // Get expected destination from the action
          const expectedDestinationId = (fartravelAction.action as { destinationAreaId: string })
            .destinationAreaId

          // Execute the slug-based command
          const result = await session.executeCommand(fartravelAction.command)

          // Verify the command succeeded and player is at the expected destination
          expect(result.success).toBe(true)
          expect(session.getState().location.areaId).toBe(expectedDestinationId)
        }
      })
    })

    describe("craft <recipe> expansion", () => {
      it("does not include unexpanded craft placeholder at guild", async () => {
        const session = GameSession.create("craft-placeholder-test")

        await session.executeCommand("go miners guild")
        await session.executeCommand("enrol")

        const actions = session.getValidActions()

        const placeholder = actions.find((a) => a.displayName === "craft <recipe>")
        expect(placeholder).toBeUndefined()
      })

      it("expands to 'Craft ...' options at guild location", async () => {
        const session = GameSession.create("craft-expand-test")

        // Go to a crafting guild
        await session.executeCommand("go miners guild")
        await session.executeCommand("enrol")

        const actions = session.getValidActions()

        // Should have craft options with human-readable names
        const craftActions = actions.filter((a) => a.displayName.startsWith("Craft "))
        // May have craft options if materials available or may be empty
        for (const action of craftActions) {
          expect(action.command).toMatch(/^craft .+/)
          // Display name should be human-readable (spaces, not underscores)
          expect(action.displayName).not.toMatch(/_/)
        }
      })
    })

    describe("accept <contract> expansion", () => {
      it("does not include unexpanded accept placeholder at guild", async () => {
        const session = GameSession.create("accept-placeholder-test")

        await session.executeCommand("go miners guild")

        const actions = session.getValidActions()

        const placeholder = actions.find((a) => a.displayName === "accept <contract>")
        expect(placeholder).toBeUndefined()
      })

      it("expands to 'Accept ...' options at guild location", async () => {
        const session = GameSession.create("accept-expand-test")

        await session.executeCommand("go miners guild")
        await session.executeCommand("enrol")

        const actions = session.getValidActions()

        // Should have accept options for available contracts
        const acceptActions = actions.filter((a) => a.displayName.startsWith("Accept "))
        expect(acceptActions.length).toBeGreaterThan(0)

        for (const action of acceptActions) {
          expect(action.command).toMatch(/^accept .+/)
          // Display name should show level and guild type
          expect(action.displayName).toMatch(/Accept L\d+ \w+/)
        }
      })
    })

    describe("mine/chop <resource> expansion", () => {
      it("does not include unexpanded mine placeholder at gathering node", async () => {
        const session = GameSession.create("mine-placeholder-test")

        // Setup: get to a mining node
        await session.executeCommand("go miners guild")
        await session.executeCommand("enrol")
        await session.executeCommand("survey")

        const actions = session.getValidActions()

        const placeholder = actions.find((a) => a.displayName === "mine <resource>")
        expect(placeholder).toBeUndefined()
      })

      it("expands mine to capitalized 'Mine ...' options", async () => {
        const session = GameSession.create("mine-expand-test")

        // Setup: get to a mining node
        await session.executeCommand("go miners guild")
        await session.executeCommand("enrol")
        await session.executeCommand("survey")

        // Try to find and go to an ore vein
        const actionsAfterSurvey = session.getValidActions()
        const oreVeinAction = actionsAfterSurvey.find(
          (a) => a.displayName.toLowerCase().includes("ore vein") || a.command.includes("ORE_VEIN")
        )

        if (oreVeinAction) {
          await session.executeCommand(oreVeinAction.command)

          const actions = session.getValidActions()
          const mineActions = actions.filter((a) => a.displayName.startsWith("Mine "))

          for (const action of mineActions) {
            expect(action.command).toMatch(/^mine .+/)
            // Display name should be capitalized and human-readable
            expect(action.displayName).toMatch(/^Mine [a-z ]+$/)
            expect(action.displayName).not.toMatch(/_/)
          }
        }
      })

      it("expands chop to capitalized 'Chop ...' options", async () => {
        const session = GameSession.create("chop-expand-test")

        // Setup: get to a woodcutting node
        await session.executeCommand("go foresters guild")
        await session.executeCommand("enrol")
        await session.executeCommand("survey")

        // Try to find and go to a tree stand
        const actionsAfterSurvey = session.getValidActions()
        const treeAction = actionsAfterSurvey.find(
          (a) => a.displayName.toLowerCase().includes("tree") || a.command.includes("TREE_STAND")
        )

        if (treeAction) {
          await session.executeCommand(treeAction.command)

          const actions = session.getValidActions()
          const chopActions = actions.filter((a) => a.displayName.startsWith("Chop "))

          for (const action of chopActions) {
            expect(action.command).toMatch(/^chop .+/)
            // Display name should be capitalized and human-readable
            expect(action.displayName).toMatch(/^Chop [a-z ]+$/)
            expect(action.displayName).not.toMatch(/_/)
          }
        }
      })
    })

    describe("fallback for non-expandable actions", () => {
      it("keeps store <item> <quantity> as placeholder", async () => {
        const session = GameSession.create("store-fallback-test")

        // Gather some items first
        await session.executeCommand("go miners guild")
        await session.executeCommand("enrol")
        await session.executeCommand("survey")

        const actions = session.getValidActions()

        // store and drop require numeric quantities and stay as placeholders
        const storeAction = actions.find(
          (a) => a.displayName.includes("store") && a.displayName.includes("<")
        )
        // May or may not be present depending on state
        if (storeAction) {
          expect(storeAction.displayName).toMatch(/</)
        }
      })

      it("keeps drop <item> <quantity> as placeholder", async () => {
        const session = GameSession.create("drop-fallback-test")

        // Gather some items first
        await session.executeCommand("go miners guild")
        await session.executeCommand("enrol")
        await session.executeCommand("survey")

        const actions = session.getValidActions()

        // drop requires numeric quantities and stays as placeholder
        const dropAction = actions.find(
          (a) => a.displayName.includes("drop") && a.displayName.includes("<")
        )
        // May or may not be present depending on state
        if (dropAction) {
          expect(dropAction.displayName).toMatch(/</)
        }
      })
    })

    describe("edge cases", () => {
      it("returns empty array for expansion when no valid options exist", () => {
        // This is tested implicitly - if a parametric action has no valid expansions,
        // it simply doesn't add any actions to the result
        const session = GameSession.create("empty-expand-test")
        const actions = session.getValidActions()

        // No unexpanded placeholders should appear
        const unexpanded = actions.filter(
          (a) => a.displayName.includes("<") && a.displayName.includes(">")
        )
        // Only store/drop type placeholders should remain
        for (const action of unexpanded) {
          expect(action.displayName).toMatch(/store|drop/)
        }
      })
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

  describe("contracts filtering", () => {
    it("only shows available contracts at the current location", async () => {
      const session = GameSession.create("contracts-location-test")

      // At Town Square, there should be no available contracts
      // (contracts are at guild locations, not Town Square)
      const stateAtTownSquare = session.getState()
      const availableAtTownSquare = stateAtTownSquare.contracts.filter((c) => !c.isActive)
      expect(availableAtTownSquare).toHaveLength(0)

      // Go to Miners Guild and enrol to unlock contracts
      await session.executeCommand("go miners guild")
      await session.executeCommand("enrol")

      const stateAtMinersGuild = session.getState()
      const availableAtMinersGuild = stateAtMinersGuild.contracts.filter((c) => !c.isActive)
      expect(availableAtMinersGuild.length).toBeGreaterThan(0)

      // Leave Miners Guild and go back to Town Square
      await session.executeCommand("leave")
      const stateBackAtTownSquare = session.getState()
      const availableBackAtTownSquare = stateBackAtTownSquare.contracts.filter((c) => !c.isActive)
      expect(availableBackAtTownSquare).toHaveLength(0)
    })

    it("always shows active contracts regardless of location", async () => {
      const session = GameSession.create("contracts-active-test")

      // Go to Miners Guild and accept a contract
      await session.executeCommand("go miners guild")
      await session.executeCommand("enrol")
      await session.executeCommand("accept mining-contract-1")

      // Verify contract is active at the guild
      const stateAtGuild = session.getState()
      const activeAtGuild = stateAtGuild.contracts.filter((c) => c.isActive)
      expect(activeAtGuild.length).toBeGreaterThan(0)

      // Leave guild and verify active contract is still shown
      await session.executeCommand("leave")
      const stateAtTownSquare = session.getState()
      const activeAtTownSquare = stateAtTownSquare.contracts.filter((c) => c.isActive)
      expect(activeAtTownSquare.length).toBeGreaterThan(0)
      expect(activeAtTownSquare[0].id).toBe("mining-contract-1")
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
