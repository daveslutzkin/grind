import { describe, it, expect } from "@jest/globals"
import { parseAgentResponse } from "./parser.js"
import type { GatherMode } from "../types.js"

describe("Action Parser", () => {
  describe("parseAgentResponse", () => {
    it("should parse a simple Move action", () => {
      const response = `
REASONING: I need to go to the mine to gather resources.

ACTION: Move to OUTSKIRTS_MINE

LEARNING: The town is a hub location.
`
      const parsed = parseAgentResponse(response)

      expect(parsed.reasoning).toContain("go to the mine")
      expect(parsed.action).toEqual({
        type: "Move",
        destination: "OUTSKIRTS_MINE",
      })
      expect(parsed.learning).toContain("town is a hub")
    })

    it("should parse a Gather action with FOCUS mode", () => {
      const response = `
REASONING: I want to focus on extracting copper.

ACTION: Gather node ore_vein_1 FOCUS copper_ore
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Gather",
        nodeId: "ore_vein_1",
        mode: "FOCUS" as GatherMode,
        focusMaterialId: "copper_ore",
      })
    })

    it("should parse a Gather action with CAREFUL_ALL mode", () => {
      const response = `
REASONING: I want to extract all materials carefully.

ACTION: Gather node tree_stand_1 CAREFUL_ALL
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Gather",
        nodeId: "tree_stand_1",
        mode: "CAREFUL_ALL" as GatherMode,
      })
    })

    it("should parse a Gather action with APPRAISE mode", () => {
      const response = `
REASONING: I want to check what's in this node.

ACTION: Gather node ore_vein_1 APPRAISE
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Gather",
        nodeId: "ore_vein_1",
        mode: "APPRAISE" as GatherMode,
      })
    })

    it("should parse a Mine action with FOCUS mode", () => {
      const response = `
REASONING: I want to focus mine copper.

ACTION: mine FOCUS COPPER_ORE
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Mine",
        mode: "FOCUS" as GatherMode,
        focusMaterialId: "COPPER_ORE",
      })
    })

    it("should parse a Mine action with CAREFUL_ALL mode", () => {
      const response = `
REASONING: I want to carefully extract all minerals.

ACTION: mine CAREFUL_ALL
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Mine",
        mode: "CAREFUL_ALL" as GatherMode,
      })
    })

    it("should parse a Mine action with APPRAISE mode", () => {
      const response = `
REASONING: I want to check what's in the ore vein.

ACTION: mine APPRAISE
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Mine",
        mode: "APPRAISE" as GatherMode,
      })
    })

    it("should parse a Chop action with FOCUS mode", () => {
      const response = `
REASONING: I want to focus chop oak.

ACTION: chop FOCUS OAK
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Chop",
        mode: "FOCUS" as GatherMode,
        focusMaterialId: "OAK",
      })
    })

    it("should parse a Chop action with CAREFUL_ALL mode", () => {
      const response = `
REASONING: I want to carefully extract all wood.

ACTION: chop CAREFUL_ALL
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Chop",
        mode: "CAREFUL_ALL" as GatherMode,
      })
    })

    it("should parse a Chop action with APPRAISE mode", () => {
      const response = `
REASONING: I want to check what's in the tree stand.

ACTION: chop APPRAISE
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Chop",
        mode: "APPRAISE" as GatherMode,
      })
    })

    it("should parse an Enrol action", () => {
      const response = `
REASONING: I need to learn mining before I can gather.

ACTION: Enrol Mining
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Enrol",
        skill: "Mining",
      })
    })

    it("should parse a Craft action", () => {
      const response = `
REASONING: I have enough iron to craft something.

ACTION: Craft iron_bar
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Craft",
        recipeId: "iron_bar",
      })
    })

    it("should parse a Store action", () => {
      const response = `
REASONING: My inventory is getting full.

ACTION: Store 5 copper_ore
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Store",
        itemId: "copper_ore",
        quantity: 5,
      })
    })

    it("should parse a Drop action", () => {
      const response = `
REASONING: I need to make room.

ACTION: Drop 3 stone
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Drop",
        itemId: "stone",
        quantity: 3,
      })
    })

    it("should parse a Fight action", () => {
      const response = `
REASONING: Time to battle!

ACTION: Fight cave_rat
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Fight",
        enemyId: "cave_rat",
      })
    })

    it("should parse an AcceptContract action", () => {
      const response = `
REASONING: This contract looks profitable.

ACTION: AcceptContract iron_delivery
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "AcceptContract",
        contractId: "iron_delivery",
      })
    })

    it("should parse a TurnInCombatToken action", () => {
      const response = `
REASONING: I have a combat token to turn in.

ACTION: TurnInCombatToken
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "TurnInCombatToken",
      })
    })

    it("should handle CONTINUE_IF for hybrid decisions", () => {
      const response = `
REASONING: I want to keep gathering until I'm full or the node is depleted.

ACTION: Gather node ore_vein_1 FOCUS copper_ore

CONTINUE_IF: inventory not full and node not depleted
`
      const parsed = parseAgentResponse(response)

      expect(parsed.continueCondition).toContain("inventory not full")
    })

    it("should handle missing sections gracefully", () => {
      const response = `ACTION: Move to MINE`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Move",
        destination: "MINE",
      })
      expect(parsed.reasoning).toBe("")
      expect(parsed.learning).toBe("")
    })

    it("should return null action for unparseable response", () => {
      const response = `I don't understand what to do.`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toBeNull()
      expect(parsed.error).toBeDefined()
    })

    it("should handle case-insensitive action types", () => {
      const response = `
REASONING: Testing case insensitivity.

ACTION: move to COPSE
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action).toEqual({
        type: "Move",
        destination: "COPSE",
      })
    })

    it("should parse alternative action formats", () => {
      const response = `
REASONING: Using different format.

ACTION: Move(destination=FOREST)
`
      const parsed = parseAgentResponse(response)

      expect(parsed.action?.type).toBe("Move")
    })

    it("should parse NOTES section", () => {
      const response = `
REASONING: I should note what I found here.

ACTION: Move to TOWN

NOTES: Miners Guild has contract: 2 copper bars -> 5 copper ore. Travel to mine takes 3 ticks.
`
      const parsed = parseAgentResponse(response)

      expect(parsed.notes).toContain("Miners Guild has contract")
      expect(parsed.notes).toContain("Travel to mine takes 3 ticks")
    })

    it("should parse multiline NOTES section", () => {
      const response = `
REASONING: Recording discoveries.

ACTION: Move to TOWN

NOTES: Discovered:
- Miners Guild at TOWN_MINERS_GUILD has copper contract
- Smithing Guild has recipes for bars
- Travel to area-d1-i0 takes 2 ticks

CONTINUE_IF: inventory not full
`
      const parsed = parseAgentResponse(response)

      expect(parsed.notes).toContain("Miners Guild")
      expect(parsed.notes).toContain("Smithing Guild")
      expect(parsed.notes).toContain("area-d1-i0")
      expect(parsed.continueCondition).toContain("inventory not full")
    })

    it("should return null notes when NOTES section is missing", () => {
      const response = `
REASONING: No notes this time.

ACTION: Enrol Mining

LEARNING: Mining costs 3 ticks.
`
      const parsed = parseAgentResponse(response)

      expect(parsed.notes).toBeNull()
      expect(parsed.learning).toContain("Mining costs 3 ticks")
    })

    it("should handle NOTES before LEARNING", () => {
      const response = `
REASONING: Testing section order.

ACTION: Move to MINE

NOTES: Mine location discovered.

LEARNING: Travel cost was 2 ticks.
`
      const parsed = parseAgentResponse(response)

      expect(parsed.notes).toBe("Mine location discovered.")
      expect(parsed.learning).toBe("Travel cost was 2 ticks.")
    })
  })
})
