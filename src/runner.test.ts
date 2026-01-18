/**
 * Tests for the shared runner module
 */

import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import type { ActionLog, WorldState, ExtractionLog } from "./types.js"
import type { SessionStats } from "./runner.js"
import { runSession, buildRngStreams, computeLuckString } from "./runner.js"
import { GatherMode } from "./types.js"
import { setSavesDirectory, deleteSave } from "./persistence.js"

describe("runSession", () => {
  let TEST_SAVES_DIR: string
  const TEST_SEEDS = [
    "test-seed",
    "time-check-test",
    "end-test",
    "error-test",
    "exit-test",
    "meta-test",
    "meta-end-test",
    "meta-quit-test",
    "before-test",
    "complete-test",
    "start-hook-test",
    "no-start-hook-test",
  ]

  // Set up temp directory for test saves
  beforeAll(() => {
    TEST_SAVES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "grind-runner-test-"))
    setSavesDirectory(TEST_SAVES_DIR)
  })

  // Clean up test saves directory after all tests
  afterAll(() => {
    if (fs.existsSync(TEST_SAVES_DIR)) {
      fs.rmSync(TEST_SAVES_DIR, { recursive: true, force: true })
    }
  })

  // Clean up individual test saves after each test
  afterEach(() => {
    TEST_SEEDS.forEach((seed) => deleteSave(seed))
  })

  describe("basic execution", () => {
    it("executes commands from getNextCommand until null", async () => {
      // Must go to Explorers Guild before enrolling (location-based actions)
      const commands = ["goto town_explorers_guild", "enrol exploration", "leave", "survey"]
      let cmdIndex = 0
      const actionLogs: ActionLog[] = []

      await runSession("test-seed", {
        getNextCommand: async () => commands[cmdIndex++] ?? null,
        onActionComplete: (log) => actionLogs.push(log),
        onSessionEnd: () => {},
        onInvalidCommand: () => "continue",
      })

      expect(actionLogs).toHaveLength(4)
      expect(actionLogs[0].actionType).toBe("TravelToLocation")
      expect(actionLogs[1].actionType).toBe("Enrol")
      expect(actionLogs[2].actionType).toBe("Leave")
      expect(actionLogs[3].actionType).toBe("Survey")
    })

    it("checks time before each command", async () => {
      // Verify that the session checks remaining ticks and stops appropriately
      // Must go to Explorers Guild before enrolling (location-based actions)
      const commands = [
        "goto town_explorers_guild",
        "enrol exploration",
        "leave",
        "survey",
        "survey",
      ]
      let cmdIndex = 0
      let lastCurrentTick = 0

      await runSession("time-check-test", {
        getNextCommand: async () => commands[cmdIndex++] ?? null,
        onActionComplete: (log, state) => {
          // Time should increase (or stay same if action fails)
          expect(state.time.currentTick).toBeGreaterThanOrEqual(lastCurrentTick)
          lastCurrentTick = state.time.currentTick
        },
        onSessionEnd: () => {
          // Session ended normally
        },
        onInvalidCommand: () => "continue",
      })

      // Time should have been consumed (enrol takes 3 ticks)
      expect(lastCurrentTick).toBeGreaterThan(0)
    })

    it("passes final state and stats to onSessionEnd", async () => {
      // Must go to Explorers Guild before enrolling (location-based actions)
      const commands = ["goto town_explorers_guild", "enrol exploration"]
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
      expect(finalStats!.logs).toHaveLength(2)
      expect(finalState!.time.currentTick).toBeGreaterThan(0)
    })
  })

  describe("error handling", () => {
    it("calls onInvalidCommand for unparseable commands", async () => {
      // Must go to Explorers Guild before enrolling (location-based actions)
      const commands = ["invalid-command", "goto town_explorers_guild", "enrol exploration"]
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
      expect(actionLogs).toHaveLength(2) // goto + enrol (valid commands)
    })

    it("stops execution when onInvalidCommand returns exit", async () => {
      // Must go to Explorers Guild before enrolling (location-based actions)
      const commands = ["goto town_explorers_guild", "enrol exploration", "bad-command", "survey"]
      let cmdIndex = 0
      const actionLogs: ActionLog[] = []

      await runSession("exit-test", {
        getNextCommand: async () => commands[cmdIndex++] ?? null,
        onActionComplete: (log) => actionLogs.push(log),
        onSessionEnd: () => {},
        onInvalidCommand: () => "exit",
      })

      expect(actionLogs).toHaveLength(2) // goto + enrol before error
    })
  })

  describe("meta commands", () => {
    it("handles meta commands without executing actions", async () => {
      // Must go to Explorers Guild before enrolling (location-based actions)
      const commands = ["goto town_explorers_guild", "enrol exploration", "help", "leave", "survey"]
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
      expect(actionLogs).toHaveLength(4) // goto, enrol, leave, survey (not help)
    })

    it("ends session when meta command returns end", async () => {
      // Must go to Explorers Guild before enrolling (location-based actions)
      const commands = ["goto town_explorers_guild", "enrol exploration", "end", "survey"]
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

      expect(actionLogs).toHaveLength(2) // goto + enrol before end
      expect(showSummary).toBe(true)
    })

    it("ends session without summary when meta command returns quit", async () => {
      // Must go to Explorers Guild before enrolling (location-based actions)
      const commands = ["goto town_explorers_guild", "enrol exploration", "quit", "survey"]
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

      expect(actionLogs).toHaveLength(2) // goto + enrol
      expect(showSummary).toBe(false)
    })
  })

  describe("beforeAction hook", () => {
    it("calls beforeAction before executing each action", async () => {
      // Must go to Explorers Guild before enrolling (location-based actions)
      const commands = ["goto town_explorers_guild", "enrol exploration", "leave", "survey"]
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

      // After refactoring: parser returns "Move", not "TravelToLocation"
      expect(beforeCalls).toEqual(["Move", "Enrol", "Leave", "Survey"])
    })
  })

  describe("onActionComplete receives correct data", () => {
    it("passes action log and current state to onActionComplete", async () => {
      // Must go to Explorers Guild before enrolling (location-based actions)
      const commands = ["goto town_explorers_guild", "enrol exploration"]
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

describe("buildRngStreams and computeLuckString", () => {
  function makeGatherLog(variance: {
    expected: number
    actual: number
    luckDelta: number
  }): ActionLog {
    const extraction: ExtractionLog = {
      mode: GatherMode.FOCUS,
      focusMaterial: "STONE",
      extracted: [{ itemId: "STONE", quantity: 1 }],
      focusWaste: 0,
      collateralDamage: {},
      variance: {
        expected: variance.expected,
        actual: variance.actual,
        range: [1, 1],
        luckDelta: variance.luckDelta,
      },
    }
    return {
      tickBefore: 0,
      actionType: "Gather",
      parameters: { nodeId: "test-node", mode: GatherMode.FOCUS },
      success: true,
      timeConsumed: variance.actual,
      rngRolls: [],
      stateDeltaSummary: "test",
      extraction,
    }
  }

  describe("gathering time variance", () => {
    it("should include gathering extractions in RNG result", () => {
      // 10 extractions, each with expected=20, actual=15 (5 ticks saved each = lucky)
      const logs: ActionLog[] = []
      for (let i = 0; i < 10; i++) {
        logs.push(makeGatherLog({ expected: 20, actual: 15, luckDelta: 5 }))
      }

      const result = buildRngStreams(logs)

      // Should have z-scores for gathering time variance
      expect(result.gatheringZScores.length).toBe(10)
      // Each z-score should be positive (lucky - faster than expected)
      // z = luckDelta / (expected * 0.25) = 5 / 5 = 1
      expect(result.gatheringZScores[0]).toBe(1)
    })

    it("should not return N/A when only gathering actions are present", () => {
      // Multiple extractions to build up RNG data
      const logs: ActionLog[] = []
      for (let i = 0; i < 10; i++) {
        logs.push(makeGatherLog({ expected: 20, actual: 15, luckDelta: 5 }))
      }

      const rngResult = buildRngStreams(logs)
      const luckStr = computeLuckString(rngResult)

      // Should NOT say "N/A (no RNG actions)" since we have gathering variance
      expect(luckStr).not.toBe("N/A (no RNG actions)")
    })

    it("should show lucky when extractions are faster than expected", () => {
      // 10 extractions, each finishing 5 ticks faster (luckDelta = 5)
      // With stdDev = 25% of expected (20 * 0.25 = 5), z-score = 5/5 = 1 per extraction
      const logs: ActionLog[] = []
      for (let i = 0; i < 10; i++) {
        logs.push(makeGatherLog({ expected: 20, actual: 15, luckDelta: 5 }))
      }

      const rngResult = buildRngStreams(logs)
      const luckStr = computeLuckString(rngResult)

      // With z-score of 1 per extraction, combined should show lucky
      expect(luckStr).toContain("lucky")
    })

    it("should show unlucky when extractions are slower than expected", () => {
      // 10 extractions, each finishing 5 ticks slower (luckDelta = -5)
      const logs: ActionLog[] = []
      for (let i = 0; i < 10; i++) {
        logs.push(makeGatherLog({ expected: 20, actual: 25, luckDelta: -5 }))
      }

      const rngResult = buildRngStreams(logs)
      const luckStr = computeLuckString(rngResult)

      // Should show unlucky
      expect(luckStr).toContain("unlucky")
    })

    it("should show average when extractions match expected time", () => {
      // 10 extractions with no variance (actual = expected)
      const logs: ActionLog[] = []
      for (let i = 0; i < 10; i++) {
        logs.push(makeGatherLog({ expected: 20, actual: 20, luckDelta: 0 }))
      }

      const rngResult = buildRngStreams(logs)
      const luckStr = computeLuckString(rngResult)

      // Should show average or not be N/A
      expect(luckStr).not.toBe("N/A (no RNG actions)")
    })
  })
})
