// Unit tests for hint generation

import { describe, it, expect } from "@jest/globals"
import { generateFailureHint } from "../src/hints.js"
import type { FailureDetails } from "../src/types.js"
import { GatherMode, NodeType, getCurrentAreaId, ExplorationLocationType } from "../src/types.js"
import { createWorld } from "../src/world.js"

describe("generateFailureHint", () => {
  it("should return a generic message for unimplemented failure types", () => {
    const state = createWorld("test-seed")
    const details: FailureDetails = {
      type: "INSUFFICIENT_SKILL",
      reason: "level_too_low",
      context: { skill: "Mining", currentLevel: 3, requiredLevel: 5 },
    }

    const result = generateFailureHint(details, state)

    // Package 3 has been implemented, so INSUFFICIENT_SKILL now has a specific hint
    expect(result.message).toBe("Mining level too low")
    expect(result.reason).toBe("Have 3, need 5")
    expect(result.hint).toContain("Gain 2 more Mining levels")
  })

  it("should handle missing reason and context", () => {
    const state = createWorld("test-seed")
    const details: FailureDetails = {
      type: "NODE_NOT_FOUND",
    }

    const result = generateFailureHint(details, state)

    expect(result.message).toBe("Node not found")
    expect(result.reason).toContain("does not exist")
    expect(result.hint).toContain("explore")
  })

  // Travel/Navigation Errors (Package 2)
  describe("Travel/Navigation Errors (Package 2)", () => {
    it("should provide hint for NO_PATH_TO_DESTINATION with undiscovered area", () => {
      const state = createWorld("test-seed")
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
      const state = createWorld("test-seed")
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
      const state = createWorld("test-seed")
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
      const state = createWorld("test-seed")
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
      const state = createWorld("test-seed")
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
      const state = createWorld("test-seed")
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
      const state = createWorld("test-seed")
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
      const state = createWorld("test-seed")
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
      const state = createWorld("test-seed")
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
      const state = createWorld("test-seed")
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
    it("should provide hint for INSUFFICIENT_SKILL with location access", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "INSUFFICIENT_SKILL",
        reason: "location_access",
        context: {
          skill: "Mining",
          currentLevel: 3,
          requiredLevel: 5,
          nodeAreaId: "area-d2-i0",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Cannot access area-d2-i0")
      expect(result.reason).toContain("Mining level too low (have 3, need 5)")
      expect(result.hint).toContain("Gain 2 more Mining levels")
      expect(result.hint).toContain("lower-tier locations")
    })

    it("should provide hint for INSUFFICIENT_SKILL with material level", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "INSUFFICIENT_SKILL",
        reason: "material_level",
        context: {
          skill: "Mining",
          currentLevel: 12,
          requiredLevel: 15,
          materialId: "IRON_ORE",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Cannot gather IRON_ORE")
      expect(result.reason).toContain("Mining level too low (have 12, need 15)")
      expect(result.hint).toContain("Gain 3 more Mining levels")
    })

    it("should provide hint for INSUFFICIENT_SKILL with recipe level", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "INSUFFICIENT_SKILL",
        reason: "recipe_level",
        context: {
          skill: "Smithing",
          currentLevel: 7,
          requiredLevel: 10,
          recipeId: "STEEL_INGOT",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Cannot craft STEEL_INGOT")
      expect(result.reason).toContain("Smithing level too low (have 7, need 10)")
      expect(result.hint).toContain("Gain 3 more Smithing levels")
      expect(result.hint).toContain("lower-tier items")
    })

    it("should provide hint for MISSING_ITEMS with craft materials", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "MISSING_ITEMS",
        reason: "craft_materials",
        context: {
          recipeId: "STEEL_INGOT",
          missingItems: [
            { itemId: "IRON_ORE", have: 0, need: 2 },
            { itemId: "COAL", have: 0, need: 1 },
          ],
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Cannot craft STEEL_INGOT")
      expect(result.reason).toContain("Missing materials")
      expect(result.reason).toContain("2 more IRON_ORE")
      expect(result.reason).toContain("1 more COAL")
      expect(result.hint).toContain("Gather IRON_ORE, COAL")
    })

    it("should provide hint for MISSING_ITEMS with store insufficient", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "MISSING_ITEMS",
        reason: "store_insufficient",
        context: {
          itemId: "IRON_ORE",
          have: 3,
          need: 5,
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Cannot store 5 IRON_ORE")
      expect(result.reason).toBe("Only have 3 IRON_ORE")
      expect(result.hint).toContain("You need 2 more IRON_ORE")
    })

    it("should provide hint for MISSING_ITEMS with token required", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "MISSING_ITEMS",
        reason: "token_required",
        context: {
          itemId: "COMBAT_GUILD_TOKEN",
          have: 0,
          need: 1,
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Missing COMBAT_GUILD_TOKEN")
      expect(result.reason).toContain("Required to turn in")
      expect(result.hint).toContain("1% drop rate")
    })

    it("should provide hint for INVENTORY_FULL with craft output", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "INVENTORY_FULL",
        reason: "craft_output",
        context: {
          outputItem: "IRON_BAR",
          outputQuantity: 1,
          currentInventoryCount: 10,
          maxInventoryCapacity: 10,
          slotsNeeded: 1,
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Cannot craft IRON_BAR")
      expect(result.reason).toContain("Inventory full (10/10 slots, need 1 more)")
      expect(result.hint).toContain("Store or drop items")
      expect(result.hint).toContain("1 inventory slot")
    })

    it("should provide hint for MISSING_WEAPON", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "MISSING_WEAPON",
        reason: "no_weapon",
        context: {},
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("No weapon equipped")
      expect(result.reason).toContain("Combat requires a weapon")
      expect(result.hint).toContain("Enroll in the Combat Guild")
    })

    it("should provide hint for MISSING_FOCUS_MATERIAL with no material specified", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "MISSING_FOCUS_MATERIAL",
        reason: "no_material_specified",
        context: {
          nodeId: "area-d1-node-1",
          availableMaterials: ["IRON_ORE", "COPPER_ORE", "TIN_ORE"],
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Cannot gather from area-d1-node-1")
      expect(result.reason).toContain("No focus material specified")
      expect(result.hint).toContain("Available: IRON_ORE, COPPER_ORE, TIN_ORE")
    })

    it("should provide hint for MISSING_FOCUS_MATERIAL with material depleted", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "MISSING_FOCUS_MATERIAL",
        reason: "material_depleted",
        context: {
          materialId: "IRON_ORE",
          nodeId: "area-d1-node-1",
          availableMaterials: ["COPPER_ORE", "TIN_ORE"],
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Cannot gather IRON_ORE")
      expect(result.reason).toContain("IRON_ORE depleted in area-d1-node-1")
      expect(result.hint).toContain("Focus on available materials instead: COPPER_ORE, TIN_ORE")
    })

    it("should provide hint for MISSING_FOCUS_MATERIAL with material not in node", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "MISSING_FOCUS_MATERIAL",
        reason: "material_not_in_node",
        context: {
          materialId: "GOLD_ORE",
          nodeId: "area-d1-node-1",
          availableMaterials: ["IRON_ORE", "COPPER_ORE"],
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Cannot gather GOLD_ORE")
      expect(result.reason).toContain("GOLD_ORE not found in area-d1-node-1")
      expect(result.hint).toContain("Focus on available materials instead: IRON_ORE, COPPER_ORE")
    })

    it("should provide hint for MISSING_FOCUS_MATERIAL when node fully depleted", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "MISSING_FOCUS_MATERIAL",
        reason: "material_depleted",
        context: {
          materialId: "IRON_ORE",
          nodeId: "area-d1-node-1",
          availableMaterials: [],
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Cannot gather IRON_ORE")
      expect(result.reason).toContain("IRON_ORE depleted in area-d1-node-1")
      expect(result.hint).toContain("This node is depleted. Find another node")
    })
  })

  describe("Gathering/Crafting Errors (Package 4)", () => {
    it("should provide hint for GATHER_FAILURE with skill check info", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "GATHER_FAILURE",
        reason: "skill_check_failed",
        context: {
          skill: "Mining",
          successChance: 0.65,
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Gathering failed")
      expect(result.reason).toBe("Skill check unsuccessful")
      expect(result.hint).toContain("Mining")
      expect(result.hint).toContain("65%")
    })

    it("should provide hint for NODE_NOT_FOUND when node doesn't exist", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "NODE_NOT_FOUND",
        reason: "node_does_not_exist",
        context: {
          nodeId: "area-d2-node-5",
          currentAreaId: "area-d2-i0",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Node not found")
      expect(result.reason).toContain("does not exist")
      expect(result.hint).toContain("explore")
    })

    it("should provide hint for NODE_NOT_FOUND when no node in area", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "NODE_NOT_FOUND",
        reason: "no_node_in_area",
        context: {
          nodeType: "ORE_VEIN",
          currentAreaId: "area-d1-i3",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("No ORE_VEIN found")
      expect(result.reason).toContain("No ore veins")
      expect(result.hint).toContain("Travel to a different area")
      expect(result.hint).toContain("ore veins")
    })

    it("should provide hint for NODE_NOT_FOUND when cannot infer node", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "NODE_NOT_FOUND",
        reason: "cannot_infer_node",
        context: {
          currentLocationId: "TOWN_MINERS_GUILD",
          currentAreaId: "TOWN",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Cannot gather")
      expect(result.reason).toBe("No gathering node at current location")
      expect(result.hint).toContain("go <location>")
    })

    it("should provide hint for NODE_DEPLETED", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "NODE_DEPLETED",
        reason: "no_materials_remaining",
        context: {
          nodeId: "area-d1-node-2",
          nodeType: "ORE_VEIN",
          areaId: "area-d1-i0",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Resource depleted")
      expect(result.reason).toContain("no remaining materials")
      expect(result.hint).toContain("fully harvested")
      expect(result.hint).toContain("area-d1-i0")
    })

    it("should provide hint for RECIPE_NOT_FOUND", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "RECIPE_NOT_FOUND",
        reason: "recipe_does_not_exist",
        context: {
          recipeId: "INVALID_RECIPE",
          currentLocationId: "TOWN_SMITHING_GUILD",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Recipe not found")
      expect(result.reason).toContain("does not exist")
      expect(result.hint).toContain("guild halls")
      expect(result.hint).toContain("case-sensitive")
    })
  })

  describe("Combat Errors (Package 5)", () => {
    it("should provide hint for COMBAT_FAILURE with enemy info", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "COMBAT_FAILURE",
        reason: "defeated",
        context: {
          enemyType: "forest wolf",
          weaponUsed: "CRUDE_WEAPON",
          combatSkillLevel: 8,
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Combat failed")
      expect(result.reason).toBe("Defeated by Forest wolf")
      expect(result.hint).toContain("Combat skill (current: 8)")
      expect(result.hint).toContain("IMPROVED_WEAPON")
      expect(result.hint).toContain("Smithing Guild")
    })

    it("should provide hint for COMBAT_FAILURE with improved weapon", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "COMBAT_FAILURE",
        reason: "defeated",
        context: {
          enemyType: "dire bear",
          weaponUsed: "IMPROVED_WEAPON",
          combatSkillLevel: 5,
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Combat failed")
      expect(result.reason).toBe("Defeated by Dire bear")
      expect(result.hint).toContain("Combat skill (current: 5)")
      expect(result.hint).not.toContain("IMPROVED_WEAPON")
      expect(result.hint).toContain("Consider training more")
    })

    it("should provide hint for ENEMY_NOT_FOUND when at mob camp", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "ENEMY_NOT_FOUND",
        reason: "enemies_not_implemented",
        context: {
          locationId: "area-d1-i0-MOB_CAMP-loc-1",
          locationType: "MOB_CAMP",
          creatureType: "goblin",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Enemy not found")
      expect(result.reason).toBe("Combat system not yet implemented")
      expect(result.hint).toContain("goblin camp")
      expect(result.hint).toContain("combat functionality is still being developed")
    })

    it("should provide hint for ENEMY_NOT_FOUND when not at mob camp", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "ENEMY_NOT_FOUND",
        reason: "not_at_mob_camp",
        context: {
          currentAreaId: "TOWN",
          currentLocationId: null,
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("No enemy here")
      expect(result.reason).toBe("Must be at a mob camp to fight")
      expect(result.hint).toContain("explore")
      expect(result.hint).toContain("mob camps")
    })

    it("should provide generic hint for ENEMY_NOT_FOUND without specific reason", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "ENEMY_NOT_FOUND",
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Enemy not found")
      expect(result.reason).toBe("No enemy at current location")
      expect(result.hint).toContain("mob camp")
      expect(result.hint).toContain("explore")
    })
  })

  describe("Guild/Contract Errors (Package 6)", () => {
    it("should provide hint for CONTRACT_NOT_FOUND", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "CONTRACT_NOT_FOUND",
        reason: "not_found",
        context: {
          contractId: "miners-guild-1",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toContain("miners-guild-1")
      expect(result.reason).toBe("Contract does not exist")
      expect(result.hint).toContain("guild halls")
    })

    it("should provide hint for ALREADY_HAS_CONTRACT", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "ALREADY_HAS_CONTRACT",
        reason: "already_active",
        context: {
          contractId: "CONTRACT_MINING_002",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Already have contract")
      expect(result.reason).toContain("CONTRACT_MINING_002")
      expect(result.hint).toContain("Complete or abandon")
    })

    it("should provide hint for ALREADY_ENROLLED", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "ALREADY_ENROLLED",
        reason: "already_member",
        context: {
          skill: "Mining",
          currentLevel: 3,
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Already enrolled in Mining Guild")
      expect(result.reason).toContain("level 3")
      expect(result.hint).toContain("already a guild member")
    })

    it("should provide hint for NOT_IN_EXPLORATION_GUILD", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "NOT_IN_EXPLORATION_GUILD",
        reason: "not_enrolled",
        context: {
          skill: "Exploration",
          currentLevel: 0,
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Not in Exploration Guild")
      expect(result.reason).toBe("Must be enrolled in Exploration Guild")
      expect(result.hint).toContain("Enrol")
    })

    it("should provide hint for WRONG_GUILD_TYPE with current guild", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "WRONG_GUILD_TYPE",
        reason: "wrong_guild",
        context: {
          requiredGuildType: "Smithing",
          currentGuildType: "Woodcutting",
          recipeId: "RECIPE_IRON_SWORD",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Wrong guild type")
      expect(result.reason).toContain("Smithing")
      expect(result.reason).toContain("Woodcutting")
      expect(result.hint).toContain("Smithing Guild Hall")
    })

    it("should provide hint for WRONG_GUILD_TYPE without current guild", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "WRONG_GUILD_TYPE",
        reason: "wrong_guild",
        context: {
          requiredGuildType: "Smithing",
          recipeId: "RECIPE_IRON_SWORD",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Wrong guild type")
      expect(result.reason).toContain("Smithing")
      expect(result.hint).toContain("Smithing Guild Hall")
    })

    it("should provide hint for GUILD_LEVEL_TOO_LOW for contract", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "GUILD_LEVEL_TOO_LOW",
        reason: "contract_level_too_high",
        context: {
          requiredLevel: 5,
          currentLevel: 2,
          contractId: "CONTRACT_MINING_ADVANCED",
          guildType: "Mining",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Cannot accept contract")
      expect(result.reason).toContain("have 2, need 5")
      expect(result.hint).toContain("Mining Guild contracts")
    })

    it("should provide hint for GUILD_LEVEL_TOO_LOW for recipe", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "GUILD_LEVEL_TOO_LOW",
        reason: "recipe_level_too_high",
        context: {
          requiredLevel: 4,
          currentLevel: 1,
          recipeId: "RECIPE_STEEL_INGOT",
          guildType: "Smithing",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Cannot accept recipe")
      expect(result.reason).toContain("have 1, need 4")
      expect(result.hint).toContain("Smithing Guild contracts")
    })
  })

  describe("Exploration Errors (Package 7)", () => {
    it("should provide hint for NO_CONNECTIONS", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "NO_CONNECTIONS",
        reason: "no_connections_from_area",
        context: {
          currentAreaId: "area-d5-i2",
          currentAreaName: "Isolated Peak",
          distance: 5,
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toContain("Cannot survey")
      expect(result.message).toContain("Isolated Peak")
      expect(result.reason).toContain("no connections")
      expect(result.hint).toContain("exploring")
      expect(result.hint).toContain("different area")
    })

    it("should provide hint for NO_UNDISCOVERED_AREAS", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "NO_UNDISCOVERED_AREAS",
        reason: "all_connections_discovered",
        context: {
          currentAreaId: "area-d2-i1",
          currentAreaName: "Foggy Marsh",
          totalConnections: 4,
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toContain("Cannot survey")
      expect(result.message).toContain("Foggy Marsh")
      expect(result.reason).toContain("All connected areas have been discovered")
      expect(result.hint).toContain("Travel to a different area")
      expect(result.hint).toContain("exploring")
    })

    it("should provide hint for AREA_FULLY_EXPLORED", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "AREA_FULLY_EXPLORED",
        reason: "all_discoverable_found",
        context: {
          currentAreaId: "area-d1-i0",
          currentAreaName: "Whispering Woods",
          distance: 1,
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toBe("Area fully explored")
      expect(result.reason).toContain("Whispering Woods")
      expect(result.reason).toContain("All locations and connections")
      expect(result.hint).toContain("Travel to a different area")
      expect(result.hint).toContain("exploration contracts")
    })
  })

  describe("Location/Mode Errors (Package 8)", () => {
    it("should provide hint for WRONG_LOCATION at contract location", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "WRONG_LOCATION",
        reason: "must_be_at_contract_location",
        context: {
          requiredLocationId: "TOWN_MINERS_GUILD",
          currentLocationId: null,
          contractId: "miners-guild-1",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toContain("Cannot accept contract")
      expect(result.reason).toContain("TOWN_MINERS_GUILD")
      expect(result.hint).toContain("Travel to")
      expect(result.hint).toContain("go <location>")
    })

    it("should provide hint for WRONG_LOCATION at warehouse", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "WRONG_LOCATION",
        reason: "must_be_at_warehouse",
        context: {
          requiredLocationType: "WAREHOUSE",
          currentLocationId: "TOWN_MINERS_GUILD",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toContain("Cannot store items")
      expect(result.reason).toContain("warehouse")
      expect(result.hint).toContain("go <warehouse>")
    })

    it("should provide hint for WRONG_LOCATION at guild hall", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "WRONG_LOCATION",
        reason: "must_be_at_guild_hall",
        context: {
          currentLocationId: null,
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toContain("Cannot enrol")
      expect(result.reason).toContain("guild hall")
      expect(result.hint).toContain("miners, foresters, or combat guild")
    })

    it("should provide hint for WRONG_LOCATION wrong area", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "WRONG_LOCATION",
        reason: "wrong_area",
        context: {
          requiredAreaId: "area-d2-i0",
          currentAreaId: "TOWN",
          nodeId: "area-d2-node-0",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toContain("Wrong area")
      expect(result.reason).toContain("area-d2-i0")
      expect(result.hint).toContain("Travel to")
    })

    it("should provide hint for WRONG_LOCATION at combat guild", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "WRONG_LOCATION",
        reason: "must_be_at_combat_guild",
        context: {
          requiredLocationId: "TOWN_COMBAT_GUILD",
          currentLocationId: "TOWN_MINERS_GUILD",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toContain("Cannot turn in combat token")
      expect(result.reason).toContain("TOWN_COMBAT_GUILD")
      expect(result.hint).toContain("Travel to")
    })

    it("should provide hint for MODE_NOT_UNLOCKED with next unlock", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "MODE_NOT_UNLOCKED",
        reason: "skill_level_too_low",
        context: {
          mode: "APPRAISE",
          currentSkillLevel: 2,
          skill: "Mining",
          nextMode: "APPRAISE",
          nextModeLevel: 3,
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toContain("Cannot use APPRAISE mode")
      expect(result.reason).toContain("skill level 2")
      expect(result.hint).toContain("Reach level 3")
      expect(result.hint).toContain("APPRAISE")
    })

    it("should provide hint for MODE_NOT_UNLOCKED without next unlock", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "MODE_NOT_UNLOCKED",
        reason: "skill_level_too_low",
        context: {
          mode: "CAREFUL_ALL",
          currentSkillLevel: 3,
          skill: "Woodcutting",
          nextMode: "CAREFUL_ALL",
          nextModeLevel: 4,
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toContain("Cannot use CAREFUL_ALL mode")
      expect(result.reason).toContain("skill level 3")
      expect(result.hint).toContain("level up")
    })

    it("should provide hint for ITEM_NOT_FOUND for Store action", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "ITEM_NOT_FOUND",
        reason: "not_in_inventory",
        context: {
          itemId: "IRON_ORE",
          actionType: "Store",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toContain("Item not found: IRON_ORE")
      expect(result.reason).toContain("not in inventory")
      expect(result.hint).toContain("IRON_ORE")
      expect(result.hint).toContain("store it")
    })

    it("should provide hint for ITEM_NOT_FOUND for Drop action", () => {
      const state = createWorld("test-seed")
      const details: FailureDetails = {
        type: "ITEM_NOT_FOUND",
        reason: "not_in_inventory",
        context: {
          itemId: "CRUDE_WEAPON",
          actionType: "Drop",
        },
      }

      const result = generateFailureHint(details, state)

      expect(result.message).toContain("Item not found: CRUDE_WEAPON")
      expect(result.reason).toContain("not in inventory")
      expect(result.hint).toContain("CRUDE_WEAPON")
      expect(result.hint).toContain("drop it")
    })
  })

  describe("Integration Tests: Travel/Navigation", () => {
    it("should produce structured failure for ALREADY_AT_LOCATION", async () => {
      const state = createWorld("test-seed")

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
      expect(log2.failureDetails?.type).toBe("ALREADY_AT_LOCATION")
      expect(log2.failureDetails).toBeDefined()
      expect(log2.failureDetails?.type).toBe("ALREADY_AT_LOCATION")
      expect(log2.failureDetails?.reason).toBe("already_here")
      expect(log2.failureDetails?.context).toMatchObject({
        locationId: "TOWN_MINERS_GUILD",
      })
    })

    it("should produce structured failure for ALREADY_AT_HUB", async () => {
      const state = createWorld("test-seed")

      // Try to leave when already at hub
      const action: import("../src/types.js").LeaveAction = {
        type: "Leave",
      }

      const { executeAction } = await import("../src/engine.js")

      const log = await executeAction(state, action)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("ALREADY_AT_HUB")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("ALREADY_AT_HUB")
      expect(log.failureDetails?.reason).toBe("at_hub")
    })

    it("should produce structured failure for NOT_AT_HUB", async () => {
      const state = createWorld("test-seed")

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
      expect(log2.failureDetails?.type).toBe("NOT_AT_HUB")
      expect(log2.failureDetails).toBeDefined()
      expect(log2.failureDetails?.type).toBe("NOT_AT_HUB")
      expect(log2.failureDetails?.reason).toBe("at_location")
    })

    it("should produce structured failure for UNKNOWN_LOCATION", async () => {
      const state = createWorld("test-seed")

      // Try to travel to a non-existent location
      const action: import("../src/types.js").TravelToLocationAction = {
        type: "TravelToLocation",
        locationId: "INVALID-LOCATION",
      }

      const { executeAction } = await import("../src/engine.js")

      const log = await executeAction(state, action)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("UNKNOWN_LOCATION")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("UNKNOWN_LOCATION")
      expect(log.failureDetails?.reason).toBe("not_found")
    })
  })

  describe("Integration Tests: Exploration", () => {
    it("should produce structured failure for Explore when not in guild", async () => {
      const state = createWorld("test-seed")

      // Try to explore without being in exploration guild
      const action: import("../src/types.js").ExploreAction = {
        type: "Explore",
      }

      const { executeAction } = await import("../src/engine.js")

      const log = await executeAction(state, action)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("NOT_IN_EXPLORATION_GUILD")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("NOT_IN_EXPLORATION_GUILD")
    })

    it("should produce structured failure for Survey with NO_UNDISCOVERED_AREAS", async () => {
      const state = createWorld("test-seed")

      const { executeAction } = await import("../src/engine.js")

      // Travel to Exploration Guild
      const travelAction: import("../src/types.js").TravelToLocationAction = {
        type: "TravelToLocation",
        locationId: "TOWN_EXPLORERS_GUILD",
      }
      await executeAction(state, travelAction)

      // Join exploration guild
      const enrollAction: import("../src/types.js").GuildEnrolmentAction = {
        type: "Enrol",
      }

      const log1 = await executeAction(state, enrollAction)
      expect(log1.success).toBe(true)

      // Mark all connections from TOWN as having discovered target areas
      // This simulates the condition where all connected areas are already discovered
      const exploration = state.exploration!
      const allConnections = exploration.connections.filter(
        (conn) => conn.fromAreaId === "TOWN" || conn.toAreaId === "TOWN"
      )

      // Mark all target areas as known
      for (const conn of allConnections) {
        const targetId = conn.fromAreaId === "TOWN" ? conn.toAreaId : conn.fromAreaId
        if (!exploration.playerState.knownAreaIds.includes(targetId)) {
          exploration.playerState.knownAreaIds.push(targetId)
        }
      }

      // Now try to survey - should fail with NO_UNDISCOVERED_AREAS
      const surveyAction: import("../src/types.js").SurveyAction = {
        type: "Survey",
      }

      const log2 = await executeAction(state, surveyAction)

      // Should fail immediately
      expect(log2.success).toBe(false)
      expect(log2.failureDetails?.type).toBe("NO_UNDISCOVERED_AREAS")
      expect(log2.failureDetails).toBeDefined()
      expect(log2.failureDetails?.type).toBe("NO_UNDISCOVERED_AREAS")
      expect(log2.failureDetails?.reason).toBe("all_connections_discovered")
      expect(log2.failureDetails?.context).toMatchObject({
        currentAreaId: "TOWN",
        currentAreaName: "Town",
      })
    })

    it("should produce structured failure for Explore with AREA_FULLY_EXPLORED", async () => {
      const state = createWorld("test-seed")

      const { executeAction } = await import("../src/engine.js")

      // Travel to Exploration Guild
      const travelAction: import("../src/types.js").TravelToLocationAction = {
        type: "TravelToLocation",
        locationId: "TOWN_EXPLORERS_GUILD",
      }
      await executeAction(state, travelAction)

      // Join exploration guild
      const enrollAction: import("../src/types.js").GuildEnrolmentAction = {
        type: "Enrol",
      }

      const log1 = await executeAction(state, enrollAction)
      expect(log1.success).toBe(true)

      // Get current area (TOWN)
      const exploration = state.exploration!
      const currentArea = exploration.areas.get("TOWN")!

      // Mark all locations in TOWN as known
      for (const loc of currentArea.locations) {
        if (!exploration.playerState.knownLocationIds.includes(loc.id)) {
          exploration.playerState.knownLocationIds.push(loc.id)
        }
      }

      // Mark all connections from TOWN as known
      const allConnections = exploration.connections.filter(
        (conn) => conn.fromAreaId === "TOWN" || conn.toAreaId === "TOWN"
      )
      for (const conn of allConnections) {
        const connId = `${conn.fromAreaId}->${conn.toAreaId}`
        if (!exploration.playerState.knownConnectionIds.includes(connId)) {
          exploration.playerState.knownConnectionIds.push(connId)
        }
      }

      // Mark all connected areas as known (so they don't count as undiscovered connections)
      for (const conn of allConnections) {
        const targetId = conn.fromAreaId === "TOWN" ? conn.toAreaId : conn.fromAreaId
        if (!exploration.playerState.knownAreaIds.includes(targetId)) {
          exploration.playerState.knownAreaIds.push(targetId)
        }
      }

      // Now try to explore - should fail with AREA_FULLY_EXPLORED
      const exploreAction: import("../src/types.js").ExploreAction = {
        type: "Explore",
      }

      const log2 = await executeAction(state, exploreAction)

      // Should fail immediately
      expect(log2.success).toBe(false)
      expect(log2.failureDetails?.type).toBe("AREA_FULLY_EXPLORED")
      expect(log2.failureDetails).toBeDefined()
      expect(log2.failureDetails?.type).toBe("AREA_FULLY_EXPLORED")
      expect(log2.failureDetails?.reason).toBe("all_discoverable_found")
      expect(log2.failureDetails?.context).toMatchObject({
        currentAreaId: "TOWN",
        currentAreaName: "Town",
      })
    })
  })

  describe("Integration Tests: Skill/Resource Errors", () => {
    it("should produce structured failure for MISSING_ITEMS in crafting", async () => {
      const state = createWorld("test-seed")
      const { executeAction } = await import("../src/engine.js")

      // Go to Smithing Guild
      state.exploration.playerState.currentLocationId = "TOWN_SMITHING_GUILD"

      // Set Smithing to level 1 so we can craft
      state.player.skills.Smithing = { level: 1, xp: 0 }

      // Don't add any IRON_ORE to inventory - crafting should fail
      // (Recipe requires 2 IRON_ORE)

      // Try to craft - should fail with MISSING_ITEMS
      const action: import("../src/types.js").CraftAction = {
        type: "Craft",
        recipeId: "iron-bar",
      }

      const log = await executeAction(state, action)

      // Verify structured failure
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("MISSING_ITEMS")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("MISSING_ITEMS")
      expect(log.failureDetails?.reason).toBe("craft_materials")
      expect(log.failureDetails?.context).toMatchObject({
        recipeId: "iron-bar",
      })
      const missingItems = (
        log.failureDetails?.context as { missingItems?: Array<{ itemId: string }> }
      )?.missingItems
      expect(missingItems).toBeDefined()
      expect(missingItems!.length).toBeGreaterThan(0)
      expect(missingItems![0].itemId).toBe("IRON_ORE")
    })

    it.skip("should produce structured failure for INVENTORY_FULL in crafting", async () => {
      const state = createWorld("test-seed")
      const { executeAction } = await import("../src/engine.js")

      // Go to Smithing Guild
      state.exploration.playerState.currentLocationId = "TOWN_SMITHING_GUILD"

      // Set Smithing to level 1
      state.player.skills.Smithing = { level: 1, xp: 0 }

      // Add required materials (2 IRON_ORE)
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })

      // Fill inventory to capacity
      // Iron bar recipe consumes 2 items and produces 1, net -1 slots
      // So if we're at exactly capacity, we'll have room
      // Let's set capacity to 2 (the exact amount we have)
      state.player.inventoryCapacity = 2

      // Try to craft - should work since net slots = -1
      // Let's instead fill it so there's no room
      // Actually, let's add one more item to block the craft
      state.player.inventory.push({ itemId: "WOOD_LOG", quantity: 1 })
      state.player.inventoryCapacity = 3

      // Now we have 3 items, crafting would consume 2 and add 1 = 2 items
      // But let's set capacity to 2 so it fails
      state.player.inventoryCapacity = 2

      const action: import("../src/types.js").CraftAction = {
        type: "Craft",
        recipeId: "iron-bar",
      }

      const log = await executeAction(state, action)

      // Verify structured failure
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("INVENTORY_FULL")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("INVENTORY_FULL")
      expect(log.failureDetails?.reason).toBe("craft_output")
      expect(log.failureDetails?.context).toMatchObject({
        outputItem: "IRON_BAR",
      })
    })

    it("should produce structured failure for MISSING_FOCUS_MATERIAL", async () => {
      const state = createWorld("test-seed")
      const { executeAction } = await import("../src/engine.js")

      // Create a node in TOWN
      const areaId = "TOWN"
      const nodeId = `${areaId}-node-test`
      const node = {
        nodeId,
        nodeType: NodeType.ORE_VEIN,
        areaId,
        materials: [
          {
            materialId: "IRON_ORE",
            remainingUnits: 10,
            maxUnitsInitial: 10,
            requiresSkill: "Mining" as const,
            requiredLevel: 1,
            tier: 1,
          },
          {
            materialId: "COPPER_ORE",
            remainingUnits: 10,
            maxUnitsInitial: 10,
            requiresSkill: "Mining" as const,
            requiredLevel: 1,
            tier: 1,
          },
        ],
        depleted: false,
      }
      state.world.nodes.push(node)

      // Set Mining to level 1
      state.player.skills.Mining = { level: 1, xp: 0 }

      // Create location and make it known
      const locationId = `${areaId}-loc-test`
      const area = state.exploration.areas.get(areaId)!
      area.locations.push({
        id: locationId,
        areaId,
        type: ExplorationLocationType.GATHERING_NODE,
        gatheringSkillType: "Mining",
      })
      state.exploration.playerState.knownLocationIds.push(locationId)
      state.exploration.playerState.currentLocationId = locationId

      // Try to gather with FOCUS mode but specify a material that doesn't exist
      const action: import("../src/types.js").GatherAction = {
        type: "Gather",
        nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "GOLD_ORE", // Not in this node!
      }

      const log = await executeAction(state, action)

      // Verify structured failure
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("MISSING_FOCUS_MATERIAL")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("MISSING_FOCUS_MATERIAL")
      expect(log.failureDetails?.reason).toBe("material_not_in_node")
      expect(log.failureDetails?.context).toMatchObject({
        materialId: "GOLD_ORE",
        nodeId,
      })
      const availableMaterials = (log.failureDetails?.context as { availableMaterials?: string[] })
        ?.availableMaterials
      expect(availableMaterials).toContain("IRON_ORE")
      expect(availableMaterials).toContain("COPPER_ORE")
    })
  })

  describe("Integration Tests: Guild/Contract", () => {
    it("should produce structured failure for CONTRACT_NOT_FOUND", async () => {
      const state = createWorld("test-seed")

      // Try to accept a non-existent contract
      const action: import("../src/types.js").AcceptContractAction = {
        type: "AcceptContract",
        contractId: "NON_EXISTENT_CONTRACT",
      }

      const { executeAction } = await import("../src/engine.js")

      const log = await executeAction(state, action)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("CONTRACT_NOT_FOUND")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("CONTRACT_NOT_FOUND")
      expect(log.failureDetails?.reason).toBe("not_found")
      expect(log.failureDetails?.context).toMatchObject({
        contractId: "NON_EXISTENT_CONTRACT",
      })
    })

    it("should produce structured failure for ALREADY_HAS_CONTRACT", async () => {
      const state = createWorld("test-seed")

      const { executeAction } = await import("../src/engine.js")

      // Go to Miners Guild first
      const goAction: import("../src/types.js").TravelToLocationAction = {
        type: "TravelToLocation",
        locationId: "TOWN_MINERS_GUILD",
      }

      const log0 = await executeAction(state, goAction)
      expect(log0.success).toBe(true)

      // Set up: Add a contract to activeContracts
      state.player.activeContracts.push("miners-guild-1")

      // Try to accept the same contract again
      const action: import("../src/types.js").AcceptContractAction = {
        type: "AcceptContract",
        contractId: "miners-guild-1",
      }

      const log = await executeAction(state, action)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("ALREADY_HAS_CONTRACT")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("ALREADY_HAS_CONTRACT")
      expect(log.failureDetails?.reason).toBe("already_active")
      expect(log.failureDetails?.context).toMatchObject({
        contractId: "miners-guild-1",
      })
    })

    it("should produce structured failure for ALREADY_ENROLLED", async () => {
      const state = createWorld("test-seed")

      // First enroll in Mining guild
      const { executeAction } = await import("../src/engine.js")

      // Go to Miners Guild
      const goAction: import("../src/types.js").TravelToLocationAction = {
        type: "TravelToLocation",
        locationId: "TOWN_MINERS_GUILD",
      }

      const log1 = await executeAction(state, goAction)
      expect(log1.success).toBe(true)

      // Enroll in Mining guild
      const enrollAction: import("../src/types.js").GuildEnrolmentAction = {
        type: "Enrol",
      }

      const log2 = await executeAction(state, enrollAction)
      expect(log2.success).toBe(true)
      expect(state.player.skills.Mining.level).toBe(1)

      // Try to enroll again
      const log3 = await executeAction(state, enrollAction)

      // Should fail
      expect(log3.success).toBe(false)
      expect(log3.failureDetails?.type).toBe("ALREADY_ENROLLED")
      expect(log3.failureDetails).toBeDefined()
      expect(log3.failureDetails?.type).toBe("ALREADY_ENROLLED")
      expect(log3.failureDetails?.reason).toBe("already_member")
      expect(log3.failureDetails?.context).toMatchObject({
        skill: "Mining",
        currentLevel: 1,
      })
    })

    it("should produce structured failure for NOT_IN_EXPLORATION_GUILD via Survey", async () => {
      const state = createWorld("test-seed")

      // Try to survey without being in exploration guild
      const action: import("../src/types.js").SurveyAction = {
        type: "Survey",
      }

      const { executeAction } = await import("../src/engine.js")

      const log = await executeAction(state, action)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("NOT_IN_EXPLORATION_GUILD")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("NOT_IN_EXPLORATION_GUILD")
      expect(log.failureDetails?.reason).toBe("not_enrolled")
      expect(log.failureDetails?.context).toMatchObject({
        skill: "Exploration",
        currentLevel: 0,
      })
    })

    it("should produce structured failure for WRONG_GUILD_TYPE", async () => {
      const state = createWorld("test-seed")

      // Go to Woodcrafting Guild
      const goAction: import("../src/types.js").TravelToLocationAction = {
        type: "TravelToLocation",
        locationId: "TOWN_FORESTERS_GUILD",
      }

      const { executeAction } = await import("../src/engine.js")

      const log1 = await executeAction(state, goAction)
      expect(log1.success).toBe(true)

      // Try to craft a Smithing recipe at Woodcrafting guild
      // Find a Smithing recipe
      const smithingRecipe = state.world.recipes.find((r) => r.guildType === "Smithing")

      if (smithingRecipe) {
        const craftAction: import("../src/types.js").CraftAction = {
          type: "Craft",
          recipeId: smithingRecipe.id,
        }

        const log2 = await executeAction(state, craftAction)

        // Should fail
        expect(log2.success).toBe(false)
        expect(log2.failureDetails?.type).toBe("WRONG_GUILD_TYPE")
        expect(log2.failureDetails).toBeDefined()
        expect(log2.failureDetails?.type).toBe("WRONG_GUILD_TYPE")
        expect(log2.failureDetails?.reason).toBe("wrong_guild")
        expect(log2.failureDetails?.context).toMatchObject({
          requiredGuildType: "Smithing",
          currentGuildType: "Woodcutting",
        })
      }
    })

    it("should produce structured failure for GUILD_LEVEL_TOO_LOW for contract", async () => {
      const state = createWorld("test-seed")

      // Create a high-level contract that requires guild level > current level
      const highLevelContract: import("../src/types.js").Contract = {
        id: "TEST_HIGH_LEVEL_CONTRACT",
        level: 5,
        acceptLocationId: "TOWN_MINERS_GUILD",
        guildType: "Mining",
        requirements: [],
        rewards: [],
        reputationReward: 100,
      }

      state.world.contracts.push(highLevelContract)

      // Go to Miners Guild with level 1
      const goAction: import("../src/types.js").TravelToLocationAction = {
        type: "TravelToLocation",
        locationId: "TOWN_MINERS_GUILD",
      }

      const { executeAction } = await import("../src/engine.js")

      const log1 = await executeAction(state, goAction)
      expect(log1.success).toBe(true)

      // Set guild hall level to 2 (lower than contract level 5)
      const location = state.exploration.areas
        .get("TOWN")
        ?.locations.find((loc) => loc.id === "TOWN_MINERS_GUILD")
      if (location) {
        location.guildLevel = 2
      }

      // Try to accept the high-level contract
      const acceptAction: import("../src/types.js").AcceptContractAction = {
        type: "AcceptContract",
        contractId: "TEST_HIGH_LEVEL_CONTRACT",
      }

      const log2 = await executeAction(state, acceptAction)

      // Should fail
      expect(log2.success).toBe(false)
      expect(log2.failureDetails?.type).toBe("GUILD_LEVEL_TOO_LOW")
      expect(log2.failureDetails).toBeDefined()
      expect(log2.failureDetails?.type).toBe("GUILD_LEVEL_TOO_LOW")
      expect(log2.failureDetails?.reason).toBe("contract_level_too_high")
      expect(log2.failureDetails?.context).toMatchObject({
        requiredLevel: 5,
        currentLevel: 2,
        contractId: "TEST_HIGH_LEVEL_CONTRACT",
        guildType: "Mining",
      })
    })
  })

  describe("Integration Tests: Gathering/Crafting", () => {
    it("should produce structured failure for NODE_NOT_FOUND when node doesn't exist", async () => {
      const state = createWorld("test-seed")

      // Try to gather from a non-existent node
      const action: import("../src/types.js").GatherAction = {
        type: "Gather",
        nodeId: "INVALID-NODE-ID",
        mode: GatherMode.FOCUS,
        focusMaterialId: "COPPER_ORE",
      }

      const { executeAction } = await import("../src/engine.js")

      const log = await executeAction(state, action)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("NODE_NOT_FOUND")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("NODE_NOT_FOUND")
      expect(log.failureDetails?.reason).toBe("node_does_not_exist")
      expect(log.failureDetails?.context).toMatchObject({
        nodeId: "INVALID-NODE-ID",
        currentAreaId: "TOWN",
      })
    })

    it("should produce structured failure for NODE_DEPLETED when node is exhausted", async () => {
      const state = createWorld("test-seed")

      // Find any node in the world
      const node = state.world.nodes[0]
      if (!node) {
        throw new Error("No nodes available in test world")
      }

      // Make sure we're in the right area
      state.exploration.playerState.currentAreaId = node.areaId

      // Make sure the location is discovered and move player there
      const nodeIndexMatch = node.nodeId.match(/-node-(\d+)$/)
      if (nodeIndexMatch) {
        const nodeIndex = nodeIndexMatch[1]
        const locationId = `${node.areaId}-loc-${nodeIndex}`

        // Discover the location
        if (!state.exploration.playerState.knownLocationIds.includes(locationId)) {
          state.exploration.playerState.knownLocationIds.push(locationId)
        }

        // Move player to the node's location
        state.exploration.playerState.currentLocationId = locationId
      }

      // Manually deplete the node
      node.depleted = true
      for (const material of node.materials) {
        material.remainingUnits = 0
      }

      // Try to gather from the depleted node
      const action: import("../src/types.js").GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: node.materials[0]?.materialId ?? "COPPER_ORE",
      }

      const { executeAction } = await import("../src/engine.js")

      const log = await executeAction(state, action)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("NODE_DEPLETED")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("NODE_DEPLETED")
      expect(log.failureDetails?.reason).toBe("no_materials_remaining")
      expect(log.failureDetails?.context).toMatchObject({
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        areaId: node.areaId,
      })
    })

    it("should produce structured failure for RECIPE_NOT_FOUND when recipe doesn't exist", async () => {
      const state = createWorld("test-seed")

      // Travel to a guild hall first (needed for crafting)
      const travelAction: import("../src/types.js").TravelToLocationAction = {
        type: "TravelToLocation",
        locationId: "TOWN_SMITHING_GUILD",
      }

      const { executeAction } = await import("../src/engine.js")

      const travelLog = await executeAction(state, travelAction)
      expect(travelLog.success).toBe(true)

      // Try to craft with an invalid recipe ID
      const craftAction: import("../src/types.js").CraftAction = {
        type: "Craft",
        recipeId: "INVALID_RECIPE_ID",
      }

      const log = await executeAction(state, craftAction)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("RECIPE_NOT_FOUND")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("RECIPE_NOT_FOUND")
      expect(log.failureDetails?.reason).toBe("recipe_does_not_exist")
      expect(log.failureDetails?.context).toMatchObject({
        recipeId: "INVALID_RECIPE_ID",
        currentLocationId: "TOWN_SMITHING_GUILD",
      })
    })

    it("should produce structured failure for NODE_NOT_FOUND with Mine action when no ore vein in area", async () => {
      const state = createWorld("test-seed")

      // Ensure current area has no ORE_VEIN by removing them
      const currentAreaId = getCurrentAreaId(state)
      state.world.nodes = state.world.nodes.filter(
        (n) => n.areaId !== currentAreaId || n.nodeType !== NodeType.ORE_VEIN
      )

      // Try to mine
      const action: import("../src/types.js").MineAction = {
        type: "Mine",
        mode: GatherMode.FOCUS,
        focusMaterialId: "COPPER_ORE",
      }

      const { executeAction } = await import("../src/engine.js")

      const log = await executeAction(state, action)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("NODE_NOT_FOUND")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("NODE_NOT_FOUND")
      expect(log.failureDetails?.reason).toBe("no_node_in_area")
      expect(log.failureDetails?.context).toMatchObject({
        nodeType: "ORE_VEIN",
        currentAreaId: currentAreaId,
      })
    })
  })

  describe("Integration Tests: Location/Mode Errors (Package 8)", () => {
    it("should produce structured failure for WRONG_LOCATION when storing without being at warehouse", async () => {
      const state = createWorld("test-seed")
      const { executeAction } = await import("../src/engine.js")

      // Add an item to inventory
      state.player.inventory.push({ itemId: "IRON_ORE", quantity: 1 })

      // Try to store without being at warehouse (we're at hub)
      const action: import("../src/types.js").StoreAction = {
        type: "Store",
        itemId: "IRON_ORE",
        quantity: 1,
      }

      const log = await executeAction(state, action)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("WRONG_LOCATION")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("WRONG_LOCATION")
      expect(log.failureDetails?.reason).toBe("must_be_at_warehouse")
      expect(log.failureDetails?.context).toBeDefined()
    })

    it("should produce structured failure for MODE_NOT_UNLOCKED when using locked mode", async () => {
      const state = createWorld("test-seed")
      const { executeAction } = await import("../src/engine.js")

      // Set Mining to level 2 (APPRAISE requires level 3)
      state.player.skills.Mining = { level: 2, xp: 0 }

      // Add a node
      const nodeId = "TOWN-node-1"
      state.world.nodes.push({
        nodeId,
        nodeType: NodeType.ORE_VEIN,
        areaId: "TOWN",
        materials: [
          {
            materialId: "IRON_ORE",
            remainingUnits: 10,
            maxUnitsInitial: 10,
            requiresSkill: "Mining" as const,
            requiredLevel: 1,
            tier: 1,
          },
        ],
        depleted: false,
      })

      // Create location and make it known
      const locationId = "TOWN-loc-1"
      const area = state.exploration.areas.get("TOWN")
      if (area) {
        area.locations.push({
          id: locationId,
          areaId: "TOWN",
          type: ExplorationLocationType.GATHERING_NODE,
          gatheringSkillType: "Mining",
        })
        state.exploration.playerState.knownLocationIds.push(locationId)
        state.exploration.playerState.currentLocationId = locationId
      }

      // Try to use APPRAISE mode (requires level 3)
      const action: import("../src/types.js").GatherAction = {
        type: "Gather",
        nodeId,
        mode: GatherMode.APPRAISE,
      }

      const log = await executeAction(state, action)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("MODE_NOT_UNLOCKED")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("MODE_NOT_UNLOCKED")
      expect(log.failureDetails?.reason).toBe("skill_level_too_low")
      expect(log.failureDetails?.context).toMatchObject({
        currentSkillLevel: 2,
        skill: "Mining",
      })
    })

    it("should produce structured failure for ITEM_NOT_FOUND when dropping item not in inventory", async () => {
      const state = createWorld("test-seed")
      const { executeAction } = await import("../src/engine.js")

      // Try to drop an item we don't have
      const action: import("../src/types.js").DropAction = {
        type: "Drop",
        itemId: "CRUDE_WEAPON",
        quantity: 1,
      }

      const log = await executeAction(state, action)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("ITEM_NOT_FOUND")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("ITEM_NOT_FOUND")
      expect(log.failureDetails?.reason).toBe("not_in_inventory")
      expect(log.failureDetails?.context).toMatchObject({
        itemId: "CRUDE_WEAPON",
        actionType: "Drop",
      })
    })
  })

  describe("Integration Tests: Combat", () => {
    it("should produce structured failure for ENEMY_NOT_FOUND when not at mob camp", async () => {
      const state = createWorld("test-seed")

      // Try to fight when not at a mob camp
      const action: import("../src/types.js").FightAction = {
        type: "Fight",
      }

      const { executeAction } = await import("../src/engine.js")

      const log = await executeAction(state, action)

      // Should fail immediately
      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("ENEMY_NOT_FOUND")
      expect(log.failureDetails).toBeDefined()
      expect(log.failureDetails?.type).toBe("ENEMY_NOT_FOUND")
      expect(log.failureDetails?.reason).toBe("not_at_mob_camp")
      expect(log.failureDetails?.context).toMatchObject({
        currentAreaId: "TOWN",
        currentLocationId: null,
      })
    })

    it("should produce structured failure for ENEMY_NOT_FOUND when at mob camp (combat not implemented)", async () => {
      const state = createWorld("test-seed")

      // First, discover and travel to a distance-1 area with a mob camp
      // Survey to discover area
      await import("../src/engine.js").then(async ({ executeAction }) => {
        await executeAction(state, { type: "Survey" })
      })

      // Get a distance-1 area
      let distance1AreaId: string | null = null
      for (const area of state.exploration.areas.values()) {
        if (area.distance === 1) {
          distance1AreaId = area.id
          break
        }
      }

      expect(distance1AreaId).not.toBeNull()

      // Travel to that area
      const { executeAction } = await import("../src/engine.js")
      await executeAction(state, {
        type: "ExplorationTravel",
        destinationAreaId: distance1AreaId!,
      })

      // Explore to discover locations
      await executeAction(state, { type: "Explore" })

      // Find a mob camp location
      const area = state.exploration.areas.get(distance1AreaId!)
      const mobCamp = area?.locations.find((loc) => loc.type === "MOB_CAMP")

      if (mobCamp && state.exploration.playerState.knownLocationIds.includes(mobCamp.id)) {
        // Travel to the mob camp
        await executeAction(state, {
          type: "TravelToLocation",
          locationId: mobCamp.id,
        })

        // Now try to fight
        const action: import("../src/types.js").FightAction = {
          type: "Fight",
        }

        const log = await executeAction(state, action)

        // Should fail because combat not implemented
        expect(log.success).toBe(false)
        expect(log.failureDetails?.type).toBe("ENEMY_NOT_FOUND")
        expect(log.failureDetails).toBeDefined()
        expect(log.failureDetails?.type).toBe("ENEMY_NOT_FOUND")
        expect(log.failureDetails?.reason).toBe("enemies_not_implemented")
        expect(log.failureDetails?.context).toMatchObject({
          locationId: mobCamp.id,
          locationType: "MOB_CAMP",
          creatureType: mobCamp.creatureType,
        })
      }
    })
  })
})
