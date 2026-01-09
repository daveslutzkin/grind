/**
 * Tests for the shared runner module
 */

import type { ActionLog, WorldState } from "./types.js"
import type { SessionStats } from "./runner.js"
import { runSession } from "./runner.js"

describe("runSession", () => {
  describe("basic execution", () => {
    it("executes commands from getNextCommand until null", async () => {
      const commands = ["enrol exploration", "survey"]
      let cmdIndex = 0
      const actionLogs: ActionLog[] = []

      await runSession("test-seed", {
        getNextCommand: async () => commands[cmdIndex++] ?? null,
        onActionComplete: (log) => actionLogs.push(log),
        onSessionEnd: () => {},
        onInvalidCommand: () => "continue",
      })

      expect(actionLogs).toHaveLength(2)
      expect(actionLogs[0].actionType).toBe("Enrol")
      expect(actionLogs[1].actionType).toBe("Survey")
    })

    it("checks time before each command", async () => {
      // Verify that the session checks remaining ticks and stops appropriately
      const commands = ["enrol exploration", "survey", "survey"]
      let cmdIndex = 0
      let lastTicksRemaining = 200

      await runSession("time-check-test", {
        getNextCommand: async () => commands[cmdIndex++] ?? null,
        onActionComplete: (log, state) => {
          // Time should decrease (or stay same if action fails)
          expect(state.time.sessionRemainingTicks).toBeLessThanOrEqual(lastTicksRemaining)
          lastTicksRemaining = state.time.sessionRemainingTicks
        },
        onSessionEnd: (state) => {
          // Session ended normally
          expect(state.time.sessionRemainingTicks).toBeGreaterThanOrEqual(0)
        },
        onInvalidCommand: () => "continue",
      })

      // Time should have been consumed
      expect(lastTicksRemaining).toBeLessThan(200)
    })

    it("passes final state and stats to onSessionEnd", async () => {
      const commands = ["enrol exploration"]
      let cmdIndex = 0
      let finalState: WorldState | null = null
      let finalStats: SessionStats | null = null

      await runSession("end-test", {
        getNextCommand: async () => commands[cmdIndex++] ?? null,
        onActionComplete: () => {},
        onSessionEnd: (state, stats) => {
          finalState = state
          finalStats = stats
        },
        onInvalidCommand: () => "continue",
      })

      expect(finalState).not.toBeNull()
      expect(finalStats).not.toBeNull()
      expect(finalStats!.logs).toHaveLength(1)
      expect(finalState!.time.sessionRemainingTicks).toBeLessThan(200)
    })
  })

  describe("error handling", () => {
    it("calls onInvalidCommand for unparseable commands", async () => {
      const commands = ["invalid-command", "enrol exploration"]
      let cmdIndex = 0
      const invalidCommands: string[] = []
      const actionLogs: ActionLog[] = []

      await runSession("error-test", {
        getNextCommand: async () => commands[cmdIndex++] ?? null,
        onActionComplete: (log) => actionLogs.push(log),
        onSessionEnd: () => {},
        onInvalidCommand: (cmd) => {
          invalidCommands.push(cmd)
          return "continue"
        },
      })

      expect(invalidCommands).toEqual(["invalid-command"])
      expect(actionLogs).toHaveLength(1) // Only the valid command executed
    })

    it("stops execution when onInvalidCommand returns exit", async () => {
      const commands = ["enrol exploration", "bad-command", "survey"]
      let cmdIndex = 0
      const actionLogs: ActionLog[] = []

      await runSession("exit-test", {
        getNextCommand: async () => commands[cmdIndex++] ?? null,
        onActionComplete: (log) => actionLogs.push(log),
        onSessionEnd: () => {},
        onInvalidCommand: () => "exit",
      })

      expect(actionLogs).toHaveLength(1) // Only first command before error
    })
  })

  describe("meta commands", () => {
    it("handles meta commands without executing actions", async () => {
      const commands = ["enrol exploration", "help", "survey"]
      let cmdIndex = 0
      const actionLogs: ActionLog[] = []
      const metaCalls: string[] = []

      await runSession("meta-test", {
        getNextCommand: async () => commands[cmdIndex++] ?? null,
        onActionComplete: (log) => actionLogs.push(log),
        onSessionEnd: () => {},
        onInvalidCommand: () => "continue",
        metaCommands: {
          help: () => {
            metaCalls.push("help")
            return "continue"
          },
        },
      })

      expect(metaCalls).toEqual(["help"])
      expect(actionLogs).toHaveLength(2) // enrol and survey, not help
    })

    it("ends session when meta command returns end", async () => {
      const commands = ["enrol exploration", "end", "survey"]
      let cmdIndex = 0
      const actionLogs: ActionLog[] = []
      let showSummary = false

      await runSession("meta-end-test", {
        getNextCommand: async () => commands[cmdIndex++] ?? null,
        onActionComplete: (log) => actionLogs.push(log),
        onSessionEnd: (_, __, summary) => {
          showSummary = summary
        },
        onInvalidCommand: () => "continue",
        metaCommands: {
          end: () => "end",
        },
      })

      expect(actionLogs).toHaveLength(1) // Only enrol before end
      expect(showSummary).toBe(true)
    })

    it("ends session without summary when meta command returns quit", async () => {
      const commands = ["enrol exploration", "quit", "survey"]
      let cmdIndex = 0
      const actionLogs: ActionLog[] = []
      let showSummary = true

      await runSession("meta-quit-test", {
        getNextCommand: async () => commands[cmdIndex++] ?? null,
        onActionComplete: (log) => actionLogs.push(log),
        onSessionEnd: (_, __, summary) => {
          showSummary = summary
        },
        onInvalidCommand: () => "continue",
        metaCommands: {
          quit: () => "quit",
        },
      })

      expect(actionLogs).toHaveLength(1)
      expect(showSummary).toBe(false)
    })
  })

  describe("beforeAction hook", () => {
    it("calls beforeAction before executing each action", async () => {
      const commands = ["enrol exploration", "survey"]
      let cmdIndex = 0
      const beforeCalls: string[] = []

      await runSession("before-test", {
        getNextCommand: async () => commands[cmdIndex++] ?? null,
        onActionComplete: () => {},
        onSessionEnd: () => {},
        onInvalidCommand: () => "continue",
        beforeAction: (action) => {
          beforeCalls.push(action.type)
        },
      })

      expect(beforeCalls).toEqual(["Enrol", "Survey"])
    })
  })

  describe("onActionComplete receives correct data", () => {
    it("passes action log and current state to onActionComplete", async () => {
      const commands = ["enrol exploration"]
      let cmdIndex = 0
      let receivedLog: ActionLog | null = null
      let receivedState: WorldState | null = null

      await runSession("complete-test", {
        getNextCommand: async () => commands[cmdIndex++] ?? null,
        onActionComplete: (log, state) => {
          receivedLog = log
          receivedState = state
        },
        onSessionEnd: () => {},
        onInvalidCommand: () => "continue",
      })

      expect(receivedLog).not.toBeNull()
      expect(receivedLog!.actionType).toBe("Enrol")
      expect(receivedLog!.success).toBe(true)
      expect(receivedState).not.toBeNull()
      expect(receivedState!.player.skills.Exploration).toBeDefined()
    })
  })

  describe("onSessionStart hook", () => {
    it("calls onSessionStart with initial state before first command", async () => {
      const commands = ["enrol exploration", "survey"]
      let cmdIndex = 0
      let startState: WorldState | null = null
      const callSequence: string[] = []

      await runSession("start-hook-test", {
        getNextCommand: async () => commands[cmdIndex++] ?? null,
        onActionComplete: (log) => {
          callSequence.push(`action:${log.actionType}`)
        },
        onSessionEnd: () => {},
        onInvalidCommand: () => "continue",
        onSessionStart: (state) => {
          startState = state
          callSequence.push("start")
        },
      })

      expect(startState).not.toBeNull()
      // onSessionStart should be called before any actions
      expect(callSequence[0]).toBe("start")
      expect(callSequence[1]).toBe("action:Enrol")
      expect(callSequence[2]).toBe("action:Survey")
    })

    it("does not require onSessionStart to be provided", async () => {
      const commands = ["enrol exploration"]
      let cmdIndex = 0

      // Should not throw when onSessionStart is not provided
      await expect(
        runSession("no-start-hook-test", {
          getNextCommand: async () => commands[cmdIndex++] ?? null,
          onActionComplete: () => {},
          onSessionEnd: () => {},
          onInvalidCommand: () => "continue",
        })
      ).resolves.not.toThrow()
    })
  })
})
