import { describe, it, expect } from "@jest/globals"
import type { CommandTick, CommandResult } from "../../../session/types"
import type { ActionLog, GatherMode } from "../../../types"
import {
  isMeaningfulTick,
  collapseTicks,
  extractResultDetails,
  getResultMessage,
  formatTick,
  formatLevelUp,
} from "./actionHistoryUtils"

describe("ActionHistory utilities", () => {
  describe("isMeaningfulTick", () => {
    it("returns true for ticks with messages", () => {
      const tick: CommandTick = { type: "feedback", message: "Hello" }
      expect(isMeaningfulTick(tick)).toBe(true)
    })

    it("returns true for ticks with gathered items", () => {
      const tick: CommandTick = {
        type: "feedback",
        gathered: { itemId: "STONE", quantity: 3 },
      }
      expect(isMeaningfulTick(tick)).toBe(true)
    })

    it("returns true for ticks with discoveries", () => {
      const tick: CommandTick = {
        type: "feedback",
        discovered: { type: "location", name: "Iron Vein" },
      }
      expect(isMeaningfulTick(tick)).toBe(true)
    })

    it("returns true for ticks with XP gained", () => {
      const tick: CommandTick = {
        type: "feedback",
        xpGained: { skill: "Mining", amount: 15 },
      }
      expect(isMeaningfulTick(tick)).toBe(true)
    })

    it("returns false for progress-only ticks", () => {
      const tick: CommandTick = {
        type: "progress",
        ticksElapsed: 5,
        totalTicks: 20,
      }
      expect(isMeaningfulTick(tick)).toBe(false)
    })

    it("returns false for empty feedback ticks", () => {
      const tick: CommandTick = { type: "feedback" }
      expect(isMeaningfulTick(tick)).toBe(false)
    })
  })

  describe("collapseTicks", () => {
    it("separates meaningful ticks from progress ticks", () => {
      const ticks: CommandTick[] = [
        { type: "progress", ticksElapsed: 1, totalTicks: 20 },
        { type: "progress", ticksElapsed: 2, totalTicks: 20 },
        { type: "feedback", gathered: { itemId: "STONE", quantity: 1 } },
        { type: "progress", ticksElapsed: 3, totalTicks: 20 },
        { type: "feedback", xpGained: { skill: "Mining", amount: 5 } },
        { type: "progress", ticksElapsed: 4, totalTicks: 20 },
      ]

      const result = collapseTicks(ticks)

      expect(result.meaningful).toHaveLength(2)
      expect(result.meaningful[0].gathered).toEqual({ itemId: "STONE", quantity: 1 })
      expect(result.meaningful[1].xpGained).toEqual({ skill: "Mining", amount: 5 })
      expect(result.progressCount).toBe(4)
      expect(result.lastProgress?.ticksElapsed).toBe(4)
    })

    it("handles all progress ticks (enrol action)", () => {
      const ticks: CommandTick[] = Array.from({ length: 20 }, (_, i) => ({
        type: "progress" as const,
        ticksElapsed: i + 1,
        totalTicks: 20,
      }))

      const result = collapseTicks(ticks)

      expect(result.meaningful).toHaveLength(0)
      expect(result.progressCount).toBe(20)
      expect(result.lastProgress?.ticksElapsed).toBe(20)
    })

    it("handles all meaningful ticks (no progress)", () => {
      const ticks: CommandTick[] = [
        { type: "feedback", message: "Starting..." },
        { type: "feedback", gathered: { itemId: "STONE", quantity: 3 } },
      ]

      const result = collapseTicks(ticks)

      expect(result.meaningful).toHaveLength(2)
      expect(result.progressCount).toBe(0)
      expect(result.lastProgress).toBeNull()
    })

    it("handles empty ticks array", () => {
      const result = collapseTicks([])

      expect(result.meaningful).toHaveLength(0)
      expect(result.progressCount).toBe(0)
      expect(result.lastProgress).toBeNull()
    })
  })

  describe("extractResultDetails", () => {
    function makeBaseLog(overrides: Partial<ActionLog> = {}): ActionLog {
      return {
        tickBefore: 0,
        actionType: "Gather",
        parameters: {},
        success: true,
        timeConsumed: 10,
        rngRolls: [],
        stateDeltaSummary: "Done",
        ...overrides,
      }
    }

    it("extracts items from extraction log", () => {
      const log = makeBaseLog({
        extraction: {
          mode: "FOCUS" as GatherMode,
          extracted: [
            { itemId: "STONE", quantity: 3 },
            { itemId: "IRON_ORE", quantity: 2 },
          ],
          focusWaste: 0,
          collateralDamage: {},
        },
      })

      const result = extractResultDetails(log)

      expect(result.details).toContain("+3 STONE, +2 IRON_ORE")
    })

    it("extracts XP gained", () => {
      const log = makeBaseLog({
        skillGained: { skill: "Mining", amount: 15 },
      })

      const result = extractResultDetails(log)

      expect(result.details).toContain("+15 Mining XP")
    })

    it("extracts level ups", () => {
      const log = makeBaseLog({
        levelUps: [{ skill: "Mining", fromLevel: 1, toLevel: 2 }],
      })

      const result = extractResultDetails(log)

      expect(result.levelUps).toHaveLength(1)
      expect(result.levelUps[0]).toEqual({ skill: "Mining", fromLevel: 1, toLevel: 2 })
    })

    it("extracts level ups from completed contracts", () => {
      const log = makeBaseLog({
        contractsCompleted: [
          {
            contractId: "contract-1",
            itemsConsumed: [],
            rewardsGranted: [],
            reputationGained: 10,
            levelUps: [{ skill: "Mining", fromLevel: 2, toLevel: 3 }],
          },
        ],
      })

      const result = extractResultDetails(log)

      expect(result.levelUps).toHaveLength(1)
      expect(result.levelUps[0]).toEqual({ skill: "Mining", fromLevel: 2, toLevel: 3 })
    })

    it("combines multiple details sources", () => {
      const log = makeBaseLog({
        extraction: {
          mode: "FOCUS" as GatherMode,
          extracted: [{ itemId: "STONE", quantity: 5 }],
          focusWaste: 0,
          collateralDamage: {},
        },
        skillGained: { skill: "Mining", amount: 20 },
        levelUps: [{ skill: "Mining", fromLevel: 3, toLevel: 4 }],
      })

      const result = extractResultDetails(log)

      expect(result.details).toHaveLength(2)
      expect(result.details).toContain("+5 STONE")
      expect(result.details).toContain("+20 Mining XP")
      expect(result.levelUps).toHaveLength(1)
    })

    it("returns empty arrays when no details present", () => {
      const log = makeBaseLog()

      const result = extractResultDetails(log)

      expect(result.details).toHaveLength(0)
      expect(result.levelUps).toHaveLength(0)
    })
  })

  describe("getResultMessage", () => {
    function makeBaseLog(overrides: Partial<ActionLog> = {}): ActionLog {
      return {
        tickBefore: 0,
        actionType: "Move",
        parameters: {},
        success: true,
        timeConsumed: 10,
        rngRolls: [],
        stateDeltaSummary: "",
        ...overrides,
      }
    }

    it("returns stateDeltaSummary for successful results", () => {
      const result: CommandResult = {
        success: true,
        log: makeBaseLog({ stateDeltaSummary: "Traveled to Miners Guild" }),
        stateAfter: {} as CommandResult["stateAfter"],
      }

      expect(getResultMessage(result)).toBe("Traveled to Miners Guild")
    })

    it("returns 'Done' when stateDeltaSummary is empty on success", () => {
      const result: CommandResult = {
        success: true,
        log: makeBaseLog({ stateDeltaSummary: "" }),
        stateAfter: {} as CommandResult["stateAfter"],
      }

      expect(getResultMessage(result)).toBe("Done")
    })

    it("returns stateDeltaSummary for failed results", () => {
      const result: CommandResult = {
        success: false,
        log: makeBaseLog({
          success: false,
          stateDeltaSummary: "Not enough skill level",
        }),
        stateAfter: {} as CommandResult["stateAfter"],
      }

      expect(getResultMessage(result)).toBe("Not enough skill level")
    })

    it("returns failureDetails.reason when stateDeltaSummary is empty", () => {
      const result: CommandResult = {
        success: false,
        log: makeBaseLog({
          success: false,
          stateDeltaSummary: "",
          failureDetails: {
            type: "INSUFFICIENT_SKILL",
            reason: "level_too_low",
          },
        }),
        stateAfter: {} as CommandResult["stateAfter"],
      }

      expect(getResultMessage(result)).toBe("level_too_low")
    })

    it("returns 'Failed' when no failure info available", () => {
      const result: CommandResult = {
        success: false,
        log: makeBaseLog({
          success: false,
          stateDeltaSummary: "",
        }),
        stateAfter: {} as CommandResult["stateAfter"],
      }

      expect(getResultMessage(result)).toBe("Failed")
    })
  })

  describe("formatTick", () => {
    it("formats message ticks", () => {
      const tick: CommandTick = { type: "feedback", message: "Starting extraction..." }
      expect(formatTick(tick)).toBe("Starting extraction...")
    })

    it("formats gathered ticks", () => {
      const tick: CommandTick = {
        type: "feedback",
        gathered: { itemId: "STONE", quantity: 3 },
      }
      expect(formatTick(tick)).toBe("Gathered 3x STONE")
    })

    it("formats discovered ticks", () => {
      const tick: CommandTick = {
        type: "feedback",
        discovered: { type: "location", name: "Iron Vein" },
      }
      expect(formatTick(tick)).toBe("Discovered location: Iron Vein")
    })

    it("formats XP gained ticks", () => {
      const tick: CommandTick = {
        type: "feedback",
        xpGained: { skill: "Mining", amount: 15 },
      }
      expect(formatTick(tick)).toBe("+15 Mining XP")
    })

    it("returns empty string for progress-only ticks", () => {
      const tick: CommandTick = {
        type: "progress",
        ticksElapsed: 5,
        totalTicks: 20,
      }
      expect(formatTick(tick)).toBe("")
    })
  })

  describe("formatLevelUp", () => {
    it("formats level up with arrow notation", () => {
      expect(formatLevelUp({ skill: "Mining", fromLevel: 1, toLevel: 2 })).toBe("Mining 1→2")
    })

    it("formats multi-level jumps", () => {
      expect(formatLevelUp({ skill: "Combat", fromLevel: 3, toLevel: 5 })).toBe("Combat 3→5")
    })
  })
})
