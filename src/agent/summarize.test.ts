import { describe, it, expect } from "@jest/globals"
import { summarizeAction, summarizeActionHistory, summarizeLearnings } from "./summarize.js"
import { GatherMode, type ActionLog } from "../types.js"
import type { AgentKnowledge } from "./output.js"

describe("summarizeAction", () => {
  it("should summarize a successful gather action", () => {
    const log: ActionLog = {
      actionType: "Gather",
      parameters: { nodeId: "node_1", mode: "FOCUS", materialId: "COPPER_ORE" },
      success: true,
      tickBefore: 3,
      timeConsumed: 5,
      stateDeltaSummary: "gathered resources",
      rngRolls: [],
      extraction: {
        mode: GatherMode.FOCUS,
        focusMaterial: "COPPER_ORE",
        extracted: [{ itemId: "COPPER_ORE", quantity: 4 }],
        focusWaste: 0.6,
        collateralDamage: {},
      },
      skillGained: { skill: "Mining", amount: 5 },
    }

    const summary = summarizeAction(log)

    expect(summary).toBe("T3: Gather node_1 FOCUS COPPER_ORE → +4 COPPER_ORE, +5 Mining XP")
  })

  it("should summarize a failed action", () => {
    const log: ActionLog = {
      actionType: "Gather",
      parameters: { nodeId: "node_1", mode: "CAREFUL_ALL" },
      success: false,
      failureType: "INSUFFICIENT_SKILL",
      tickBefore: 5,
      timeConsumed: 0,
      stateDeltaSummary: "",
      rngRolls: [],
    }

    const summary = summarizeAction(log)

    expect(summary).toBe("T5: Gather node_1 CAREFUL_ALL → FAIL: INSUFFICIENT_SKILL")
  })

  it("should summarize a move action", () => {
    const log: ActionLog = {
      actionType: "Move",
      parameters: { destination: "TOWN" },
      success: true,
      tickBefore: 8,
      timeConsumed: 3,
      stateDeltaSummary: "moved to TOWN",
      rngRolls: [],
    }

    const summary = summarizeAction(log)

    expect(summary).toBe("T8: Move TOWN → 3t")
  })

  it("should summarize an enrol action with level up", () => {
    const log: ActionLog = {
      actionType: "Enrol",
      parameters: { skill: "Mining" },
      success: true,
      tickBefore: 0,
      timeConsumed: 3,
      stateDeltaSummary: "enrolled in Mining",
      rngRolls: [],
      levelUps: [{ skill: "Mining", fromLevel: 0, toLevel: 1 }],
    }

    const summary = summarizeAction(log)

    expect(summary).toBe("T0: Enrol Mining → Mining→L1")
  })

  it("should summarize a store action (0 ticks)", () => {
    const log: ActionLog = {
      actionType: "Store",
      parameters: { itemId: "COPPER_ORE", quantity: 10 },
      success: true,
      tickBefore: 15,
      timeConsumed: 0,
      stateDeltaSummary: "stored items",
      rngRolls: [],
    }

    const summary = summarizeAction(log)

    expect(summary).toBe("T15: Store 10x COPPER_ORE → OK")
  })

  it("should include contract completion", () => {
    const log: ActionLog = {
      actionType: "Store",
      parameters: { itemId: "COPPER_ORE", quantity: 5 },
      success: true,
      tickBefore: 20,
      timeConsumed: 0,
      stateDeltaSummary: "stored items, completed contract",
      rngRolls: [],
      contractsCompleted: [
        {
          contractId: "contract_1",
          itemsConsumed: [{ itemId: "COPPER_ORE", quantity: 10 }],
          rewardsGranted: [{ itemId: "GOLD", quantity: 100 }],
          reputationGained: 10,
        },
      ],
    }

    const summary = summarizeAction(log)

    expect(summary).toContain("completed:contract_1")
  })
})

describe("summarizeActionHistory", () => {
  it("should combine multiple action summaries", () => {
    const logs: ActionLog[] = [
      {
        actionType: "Enrol",
        parameters: { skill: "Mining" },
        success: true,
        tickBefore: 0,
        timeConsumed: 3,
        stateDeltaSummary: "",
        rngRolls: [],
        levelUps: [{ skill: "Mining", fromLevel: 0, toLevel: 1 }],
      },
      {
        actionType: "Move",
        parameters: { destination: "OUTSKIRTS_MINE" },
        success: true,
        tickBefore: 3,
        timeConsumed: 3,
        stateDeltaSummary: "",
        rngRolls: [],
      },
    ]

    const history = summarizeActionHistory(logs)

    expect(history).toContain("T0: Enrol Mining")
    expect(history).toContain("T3: Move OUTSKIRTS_MINE")
    expect(history.split("\n")).toHaveLength(2)
  })

  it("should return empty string for empty logs", () => {
    expect(summarizeActionHistory([])).toBe("")
  })
})

describe("summarizeLearnings", () => {
  it("should extract key mechanics facts", () => {
    const knowledge: AgentKnowledge = {
      world: [],
      mechanics: [
        "Enrolling in a skill costs 3 ticks and immediately gives Level 1",
        "Gathering takes 5 ticks per action",
        "L1 materials give 5 XP, L2 materials give 10 XP",
        "Storage costs 0 ticks at TOWN",
      ],
      items: [],
      strategies: [],
    }

    const summary = summarizeLearnings(knowledge)

    expect(summary).toContain("KNOWN:")
    expect(summary).toContain("Enrol costs 3 ticks")
    expect(summary).toContain("Gather costs 5 ticks")
    expect(summary).toContain("Storage is free")
  })

  it("should extract world facts", () => {
    const knowledge: AgentKnowledge = {
      world: ["There are 7 areas in the world", "Travel costs vary with distance"],
      mechanics: [],
      items: [],
      strategies: [],
    }

    const summary = summarizeLearnings(knowledge)

    expect(summary).toContain("7 world areas")
  })

  it("should return empty string for empty knowledge", () => {
    const knowledge: AgentKnowledge = {
      world: [],
      mechanics: [],
      items: [],
      strategies: [],
    }

    const summary = summarizeLearnings(knowledge)

    expect(summary).toBe("")
  })

  it("should not duplicate facts", () => {
    const knowledge: AgentKnowledge = {
      world: [],
      mechanics: [
        "Enrol costs 3 ticks",
        "Enrolling costs 3 ticks too",
        "Another mention of 3 tick enrol cost",
      ],
      items: [],
      strategies: [],
    }

    const summary = summarizeLearnings(knowledge)

    // Should only have one "Enrol costs 3 ticks"
    const matches = summary.match(/Enrol costs 3 ticks/g)
    expect(matches).toHaveLength(1)
  })
})

// extractStaticWorldData and formatDynamicState were removed in favor of
// agent-managed notes system. See prompts.ts for the new memory system.
