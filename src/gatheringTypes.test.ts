/**
 * TDD Tests for Phase 1: Type System Foundation
 *
 * These tests define the expected type system for the gathering MVP.
 * Write tests first, then implement types to make them pass.
 */

import {
  // New enums
  DistanceBand,
  GatherMode,
  NodeType,
  // Extended skill types
  type SkillID,
  type GatheringSkillID,
  type CraftingSkillID,
  // New interfaces
  type Location,
  type Node,
  type MaterialReserve,
  // Updated GatherAction
  type GatherAction,
} from "./types.js"

describe("Phase 1: Type System Foundation", () => {
  describe("DistanceBand enum", () => {
    it("should have TOWN, NEAR, MID, FAR values", () => {
      expect(DistanceBand.TOWN).toBe("TOWN")
      expect(DistanceBand.NEAR).toBe("NEAR")
      expect(DistanceBand.MID).toBe("MID")
      expect(DistanceBand.FAR).toBe("FAR")
    })
  })

  describe("GatherMode enum", () => {
    it("should have FOCUS, CAREFUL_ALL, APPRAISE values", () => {
      expect(GatherMode.FOCUS).toBe("FOCUS")
      expect(GatherMode.CAREFUL_ALL).toBe("CAREFUL_ALL")
      expect(GatherMode.APPRAISE).toBe("APPRAISE")
    })
  })

  describe("NodeType enum", () => {
    it("should have ORE_VEIN and TREE_STAND values", () => {
      expect(NodeType.ORE_VEIN).toBe("ORE_VEIN")
      expect(NodeType.TREE_STAND).toBe("TREE_STAND")
    })
  })

  describe("SkillID type", () => {
    it("should include Woodcrafting as a valid skill", () => {
      // Type test: this should compile
      const skill: SkillID = "Woodcrafting"
      expect(skill).toBe("Woodcrafting")
    })

    it("should include all 5 skills", () => {
      const skills: SkillID[] = ["Mining", "Woodcutting", "Combat", "Smithing", "Woodcrafting"]
      expect(skills).toHaveLength(5)
    })
  })

  describe("GatheringSkillID type", () => {
    it("should include Mining and Woodcutting", () => {
      const gatheringSkills: GatheringSkillID[] = ["Mining", "Woodcutting"]
      expect(gatheringSkills).toHaveLength(2)
    })
  })

  describe("CraftingSkillID type", () => {
    it("should include Smithing and Woodcrafting", () => {
      const craftingSkills: CraftingSkillID[] = ["Smithing", "Woodcrafting"]
      expect(craftingSkills).toHaveLength(2)
    })
  })

  describe("Location interface", () => {
    it("should have required fields", () => {
      const location: Location = {
        id: "OUTSKIRTS_MINE",
        name: "Outskirts Mine",
        band: DistanceBand.NEAR,
        travelTicksFromTown: 3,
        nodePools: ["near_ore"],
        requiredGuildReputation: null,
      }

      expect(location.id).toBe("OUTSKIRTS_MINE")
      expect(location.name).toBe("Outskirts Mine")
      expect(location.band).toBe(DistanceBand.NEAR)
      expect(location.travelTicksFromTown).toBe(3)
      expect(location.nodePools).toEqual(["near_ore"])
      expect(location.requiredGuildReputation).toBeNull()
    })

    it("should allow requiredGuildReputation to be a number", () => {
      const location: Location = {
        id: "ANCIENT_GROVE",
        name: "Ancient Grove",
        band: DistanceBand.FAR,
        travelTicksFromTown: 15,
        nodePools: ["far_trees"],
        requiredGuildReputation: 50,
      }

      expect(location.requiredGuildReputation).toBe(50)
    })
  })

  describe("MaterialReserve interface", () => {
    it("should have required fields", () => {
      const material: MaterialReserve = {
        materialId: "COPPER_ORE",
        remainingUnits: 100,
        maxUnitsInitial: 100,
        requiresSkill: "Mining",
        requiredLevel: 1,
        tier: 1,
      }

      expect(material.materialId).toBe("COPPER_ORE")
      expect(material.remainingUnits).toBe(100)
      expect(material.maxUnitsInitial).toBe(100)
      expect(material.requiresSkill).toBe("Mining")
      expect(material.requiredLevel).toBe(1)
      expect(material.tier).toBe(1)
    })

    it("should allow optional fragility field", () => {
      const material: MaterialReserve = {
        materialId: "TIN_ORE",
        remainingUnits: 50,
        maxUnitsInitial: 50,
        requiresSkill: "Mining",
        requiredLevel: 2,
        tier: 2,
        fragility: 0.8,
      }

      expect(material.fragility).toBe(0.8)
    })
  })

  describe("Node interface", () => {
    it("should have required fields with materials array", () => {
      const node: Node = {
        nodeId: "node-001",
        nodeType: NodeType.ORE_VEIN,
        locationId: "OUTSKIRTS_MINE",
        materials: [
          {
            materialId: "COPPER_ORE",
            remainingUnits: 100,
            maxUnitsInitial: 100,
            requiresSkill: "Mining",
            requiredLevel: 1,
            tier: 1,
          },
          {
            materialId: "STONE",
            remainingUnits: 50,
            maxUnitsInitial: 50,
            requiresSkill: "Mining",
            requiredLevel: 1,
            tier: 1,
          },
        ],
        depleted: false,
      }

      expect(node.nodeId).toBe("node-001")
      expect(node.nodeType).toBe(NodeType.ORE_VEIN)
      expect(node.locationId).toBe("OUTSKIRTS_MINE")
      expect(node.materials).toHaveLength(2)
      expect(node.depleted).toBe(false)
    })

    it("should mark node as depleted when all materials exhausted", () => {
      const depletedNode: Node = {
        nodeId: "node-002",
        nodeType: NodeType.TREE_STAND,
        locationId: "COPSE",
        materials: [
          {
            materialId: "GREEN_WOOD",
            remainingUnits: 0,
            maxUnitsInitial: 100,
            requiresSkill: "Woodcutting",
            requiredLevel: 1,
            tier: 1,
          },
        ],
        depleted: true,
      }

      expect(depletedNode.depleted).toBe(true)
      expect(depletedNode.materials[0].remainingUnits).toBe(0)
    })
  })

  describe("GatherAction with mode", () => {
    it("should support FOCUS mode with focusMaterialId", () => {
      const action: GatherAction = {
        type: "Gather",
        nodeId: "node-001",
        mode: GatherMode.FOCUS,
        focusMaterialId: "COPPER_ORE",
      }

      expect(action.type).toBe("Gather")
      expect(action.nodeId).toBe("node-001")
      expect(action.mode).toBe(GatherMode.FOCUS)
      expect(action.focusMaterialId).toBe("COPPER_ORE")
    })

    it("should support CAREFUL_ALL mode without focusMaterialId", () => {
      const action: GatherAction = {
        type: "Gather",
        nodeId: "node-001",
        mode: GatherMode.CAREFUL_ALL,
      }

      expect(action.mode).toBe(GatherMode.CAREFUL_ALL)
      expect(action.focusMaterialId).toBeUndefined()
    })

    it("should support APPRAISE mode", () => {
      const action: GatherAction = {
        type: "Gather",
        nodeId: "node-001",
        mode: GatherMode.APPRAISE,
      }

      expect(action.mode).toBe(GatherMode.APPRAISE)
    })
  })
})
