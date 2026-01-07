import { describe, it, expect } from "@jest/globals"
import {
  summarizeAction,
  summarizeActionHistory,
  summarizeLearnings,
  extractStaticWorldData,
  formatDynamicState,
} from "./summarize.js"
import { formatWorldState } from "./formatters.js"
import { GatherMode, type ActionLog } from "../types.js"
import type { AgentKnowledge } from "./output.js"
import { createGatheringWorld } from "../gatheringWorld.js"

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

describe("extractStaticWorldData", () => {
  it("should extract locations and travel costs", () => {
    const state = createGatheringWorld("test-seed")

    const staticData = extractStaticWorldData(state)

    expect(staticData).toContain("WORLD REFERENCE")
    expect(staticData).toContain("Areas:") // Changed from Locations: to Areas:
    expect(staticData).toContain("TOWN")
    expect(staticData).toContain("Travel:")
  })

  it("should include recipes if present", () => {
    const state = createGatheringWorld("test-seed")
    // Add a test recipe
    state.world.recipes.push({
      id: "TEST_RECIPE",
      requiredAreaId: "TOWN",
      inputs: [{ itemId: "COPPER_ORE", quantity: 2 }],
      output: { itemId: "COPPER_BAR", quantity: 1 },
      craftTime: 5,
      requiredSkillLevel: 1,
    })

    const staticData = extractStaticWorldData(state)

    expect(staticData).toContain("Recipes:")
    expect(staticData).toContain("TEST_RECIPE")
  })

  it("should include contracts if present", () => {
    const state = createGatheringWorld("test-seed")

    const staticData = extractStaticWorldData(state)

    // The gathering world has contracts
    if (state.world.contracts.length > 0) {
      expect(staticData).toContain("Contracts:")
    }
  })
})

describe("formatDynamicState", () => {
  it("should format current state compactly", () => {
    const state = createGatheringWorld("test-seed")
    state.time.sessionRemainingTicks = 45
    state.time.currentTick = 5

    const dynamicState = formatDynamicState(state)

    expect(dynamicState).toContain("CURRENT STATE:")
    expect(dynamicState).toContain("Location: TOWN")
    expect(dynamicState).toContain("Ticks: 45 remaining")
    expect(dynamicState).toContain("used 5")
  })

  it("should show inventory compactly", () => {
    const state = createGatheringWorld("test-seed")
    state.player.inventory = [
      { itemId: "COPPER_ORE", quantity: 10 },
      { itemId: "TIN_ORE", quantity: 5 },
    ]

    const dynamicState = formatDynamicState(state)

    expect(dynamicState).toContain("Inventory [2/")
    expect(dynamicState).toContain("10xCOPPER_ORE")
    expect(dynamicState).toContain("5xTIN_ORE")
  })

  it("should show skills compactly", () => {
    const state = createGatheringWorld("test-seed")
    state.player.skills.Mining = { level: 3, xp: 15 }

    const dynamicState = formatDynamicState(state)

    expect(dynamicState).toContain("Skills:")
    expect(dynamicState).toContain("Mining:L3(15xp)")
  })

  it("should show nodes at current location", () => {
    const state = createGatheringWorld("test-seed")
    state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"

    const dynamicState = formatDynamicState(state)

    // Should show nodes at mine
    expect(dynamicState).toContain("Nodes here:")
  })

  it("should be more compact than full state", () => {
    const state = createGatheringWorld("test-seed")
    state.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
    state.player.skills.Mining = { level: 2, xp: 10 }

    const fullState = formatWorldState(state)
    const dynamicState = formatDynamicState(state)

    // Dynamic state should be significantly smaller
    expect(dynamicState.length).toBeLessThan(fullState.length * 0.7)
  })
})
