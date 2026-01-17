/**
 * Action Parity Tests
 *
 * Ensures that the REPL (runner.ts) and agent parser (agent/parser.ts)
 * can parse the same set of actions. This prevents drift between the
 * interactive CLI and the AI agent interface.
 *
 * Note: The policy runner uses a simplified PolicyAction type that maps
 * to a subset of engine actions, so it's tested separately.
 */

import { parseAction as parseReplAction } from "./runner.js"
import { parseAgentResponse } from "./agent/parser.js"
import type { Action } from "./types.js"

/**
 * Helper to parse an action from agent-style input.
 * Wraps the command in the expected agent response format.
 */
function parseAgentAction(command: string): Action | null {
  const response = `REASONING: test\n\nACTION: ${command}\n\nLEARNING: none`
  const result = parseAgentResponse(response)
  return result.action
}

describe("Action Parity: REPL and Agent Parser", () => {
  /**
   * Test cases for actions that both systems should handle.
   * Each entry maps action type to example commands that should parse.
   */
  const actionTestCases: {
    actionType: Action["type"]
    replCommands: string[]
    agentCommands: string[]
    description: string
  }[] = [
    {
      actionType: "AcceptContract",
      replCommands: ["accept mining-contract-1"],
      agentCommands: ["accept mining-contract-1", "AcceptContract mining-contract-1"],
      description: "Accept a contract at a guild",
    },
    {
      actionType: "TurnInContract",
      replCommands: ["turn-in mining-contract-1", "turnin mining-contract-1"],
      agentCommands: ["turn-in mining-contract-1", "turnin mining-contract-1"],
      description: "Turn in a completed contract at a guild",
    },
    {
      actionType: "Mine",
      replCommands: ["mine focus STONE", "mine careful", "mine appraise"],
      agentCommands: ["mine focus STONE", "mine careful", "mine appraise"],
      description: "Mine at a node with various modes",
    },
    {
      actionType: "Chop",
      replCommands: ["chop focus OAK_LOG", "chop careful"],
      agentCommands: ["chop focus OAK_LOG", "chop careful"],
      description: "Chop at a tree stand",
    },
    {
      actionType: "Gather",
      replCommands: ["gather node-1 focus STONE", "gather node-1 careful"],
      agentCommands: ["gather node-1 focus STONE", "gather node-1 careful"],
      description: "Generic gather action",
    },
    {
      actionType: "Craft",
      replCommands: ["craft copper-bar"],
      agentCommands: ["craft copper-bar", "Craft copper-bar"],
      description: "Craft an item at a guild",
    },
    {
      actionType: "Store",
      replCommands: ["store STONE 5", "store COPPER_ORE 10"],
      agentCommands: ["store STONE 5", "store 5 STONE"],
      description: "Store items in warehouse",
    },
    {
      actionType: "Drop",
      replCommands: ["drop STONE 1", "drop COPPER_ORE 5"],
      agentCommands: ["drop STONE 1", "drop 1 STONE"],
      description: "Drop items from inventory",
    },
    {
      actionType: "Enrol",
      replCommands: ["enrol", "enroll"],
      agentCommands: ["enrol", "enroll"],
      description: "Enroll in a guild",
    },
    {
      actionType: "Move",
      replCommands: ["go miners", "goto wilderness", "move town", "travel forest"],
      agentCommands: ["go miners", "goto wilderness", "move town"],
      description: "Move/travel to a destination",
    },
    {
      actionType: "Leave",
      replCommands: ["leave"],
      agentCommands: ["leave"],
      description: "Leave current location to hub",
    },
    {
      actionType: "Explore",
      replCommands: ["explore"],
      agentCommands: ["explore"],
      description: "Explore current area for nodes",
    },
    {
      actionType: "Survey",
      replCommands: ["survey"],
      agentCommands: ["survey"],
      description: "Survey for connected areas",
    },
    {
      actionType: "Fight",
      replCommands: ["fight"],
      agentCommands: ["fight"],
      description: "Fight enemies at current location",
    },
  ]

  describe("REPL parseCommand", () => {
    for (const testCase of actionTestCases) {
      describe(testCase.actionType, () => {
        for (const command of testCase.replCommands) {
          it(`should parse "${command}" as ${testCase.actionType}`, () => {
            const result = parseReplAction(command)
            expect(result).not.toBeNull()
            expect(result?.type).toBe(testCase.actionType)
          })
        }
      })
    }
  })

  describe("Agent parseAction", () => {
    for (const testCase of actionTestCases) {
      describe(testCase.actionType, () => {
        for (const command of testCase.agentCommands) {
          it(`should parse "${command}" as ${testCase.actionType}`, () => {
            const result = parseAgentAction(command)
            expect(result).not.toBeNull()
            expect(result?.type).toBe(testCase.actionType)
          })
        }
      })
    }
  })

  describe("Cross-system parity", () => {
    it("should have test cases for all major action types", () => {
      const testedActionTypes = new Set(actionTestCases.map((tc) => tc.actionType))

      // These are the user-facing action types that should be testable
      const expectedUserActions: Action["type"][] = [
        "AcceptContract",
        "TurnInContract",
        "Mine",
        "Chop",
        "Gather",
        "Craft",
        "Store",
        "Drop",
        "Enrol",
        "Move",
        "Leave",
        "Explore",
        "Survey",
        "Fight",
      ]

      for (const actionType of expectedUserActions) {
        expect(testedActionTypes.has(actionType)).toBe(true)
      }
    })

    it("both parsers should handle the same basic commands", () => {
      // Commands that should work identically in both systems
      const universalCommands = [
        "accept test-contract",
        "turn-in test-contract",
        "mine focus STONE",
        "craft iron-bar",
        "drop STONE 1",
        "enrol",
        "leave",
        "explore",
        "survey",
        "fight",
      ]

      for (const command of universalCommands) {
        const replResult = parseReplAction(command)
        const agentResult = parseAgentAction(command)

        expect(replResult).not.toBeNull()
        expect(agentResult).not.toBeNull()
        expect(replResult?.type).toBe(agentResult?.type)
      }
    })
  })

  describe("context-aware parsing", () => {
    it("should parse turn-in without contract ID when active contract exists at current location", async () => {
      const { createWorld, TOWN_LOCATIONS } = await import("./world.js")
      const { refreshMiningContracts } = await import("./contracts.js")
      const { executeAction } = await import("./engine.js")

      // Set up a state with an active contract at the miners guild
      const state = createWorld("turn-in-no-id-test")
      state.player.skills.Mining = { level: 10, xp: 0 }
      refreshMiningContracts(state)

      // Go to miners guild and accept a contract
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD
      const contract = state.world.contracts.find(
        (c) => c.acceptLocationId === TOWN_LOCATIONS.MINERS_GUILD
      )
      expect(contract).toBeDefined()

      await executeAction(state, { type: "AcceptContract", contractId: contract!.id })
      expect(state.player.activeContracts).toContain(contract!.id)

      // Give player the required items to satisfy the contract
      const requiredItem = contract!.requirements[0]
      if (requiredItem) {
        for (let i = 0; i < requiredItem.quantity; i++) {
          state.player.inventory.push({ itemId: requiredItem.itemId, quantity: 1 })
        }
      }

      // Now test that "turn-in" (without contract ID) parses correctly
      const result = parseReplAction("turn-in", {
        currentLocationId: TOWN_LOCATIONS.MINERS_GUILD,
        state,
      })

      expect(result).not.toBeNull()
      expect(result?.type).toBe("TurnInContract")
      expect((result as { contractId: string }).contractId).toBe(contract!.id)
    })
  })
})
