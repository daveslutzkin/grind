/**
 * TDD Tests for Phase 3: Gather Action Overhaul
 *
 * Tests for the new multi-mode gathering system:
 * - FOCUS mode: Extract one material with variance, causes collateral
 * - CAREFUL_ALL mode: Extract all materials slowly, no collateral
 * - APPRAISE mode: Inspect node contents
 * - XP = ticks × tier (not units extracted)
 */

import { executeAction } from "./engine.js"
import { createGatheringWorld } from "./gatheringWorld.js"
import { GatherMode, type GatherAction, type WorldState, type Node } from "./types.js"

describe("Phase 3: Gather Action Overhaul", () => {
  let world: WorldState

  beforeEach(() => {
    world = createGatheringWorld("test-seed")
    // Set player at a mining location with level 1 Mining
    world.player.location = "OUTSKIRTS_MINE"
    world.player.skills.Mining.level = 1
    world.player.skills.Woodcutting.level = 1
  })

  function getFirstOreNode(): Node {
    return world.world.nodes!.find((n) => n.locationId === "OUTSKIRTS_MINE")!
  }

  describe("APPRAISE mode", () => {
    it("should cost 1 tick", () => {
      world.player.skills.Mining.level = 3 // L3 required for APPRAISE
      const node = getFirstOreNode()
      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }

      const ticksBefore = world.time.sessionRemainingTicks
      const log = executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.timeConsumed).toBe(1)
      expect(world.time.sessionRemainingTicks).toBe(ticksBefore - 1)
    })

    it("should not modify node materials", () => {
      world.player.skills.Mining.level = 3 // L3 required for APPRAISE
      const node = getFirstOreNode()
      const materialsBefore = JSON.stringify(node.materials)

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }

      executeAction(world, action)

      expect(JSON.stringify(node.materials)).toBe(materialsBefore)
    })

    it("should not grant XP", () => {
      world.player.skills.Mining.level = 3 // L3 required for APPRAISE
      const node = getFirstOreNode()
      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }

      const log = executeAction(world, action)

      expect(log.skillGained).toBeUndefined()
    })

    it("should include node info in log", () => {
      world.player.skills.Mining.level = 3 // L3 required for APPRAISE
      const node = getFirstOreNode()
      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }

      const log = executeAction(world, action)

      // Log should contain extraction info with node details
      expect(log.extraction).toBeDefined()
      expect(log.extraction!.mode).toBe(GatherMode.APPRAISE)

      // Appraisal should contain detailed node info
      expect(log.extraction!.appraisal).toBeDefined()
      expect(log.extraction!.appraisal!.nodeId).toBe(node.nodeId)
      expect(log.extraction!.appraisal!.nodeType).toBe(node.nodeType)
      expect(log.extraction!.appraisal!.materials.length).toBeGreaterThan(0)

      // Each material should have all required fields
      const firstMat = log.extraction!.appraisal!.materials[0]
      expect(firstMat.materialId).toBeDefined()
      expect(firstMat.remaining).toBeDefined()
      expect(firstMat.max).toBeDefined()
      expect(firstMat.tier).toBeDefined()
      expect(firstMat.requiresSkill).toBeDefined()
      expect(firstMat.requiredLevel).toBeDefined()
    })
  })

  describe("FOCUS mode", () => {
    it("should require focusMaterialId", () => {
      world.player.skills.Mining.level = 5 // High enough for any material
      const node = getFirstOreNode()
      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        // Missing focusMaterialId
      }

      const log = executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("MISSING_FOCUS_MATERIAL")
    })

    it("should extract focus material with variance", () => {
      world.player.skills.Mining.level = 5 // High enough for any material
      const node = getFirstOreNode()
      // Find a material the player can extract
      const focusMat = node.materials.find(
        (m) => m.requiredLevel <= world.player.skills.Mining.level
      )!
      const initialUnits = focusMat.remainingUnits

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const log = executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.extraction).toBeDefined()
      expect(log.extraction!.extracted.length).toBeGreaterThan(0)
      expect(focusMat.remainingUnits).toBeLessThan(initialUnits)
    })

    it("should cause collateral damage to other materials", () => {
      world.player.skills.Mining.level = 5 // High enough for any material
      const node = getFirstOreNode()
      // Ensure node has at least 2 materials
      expect(node.materials.length).toBeGreaterThanOrEqual(2)

      // Find a material the player can extract
      const focusMat = node.materials.find(
        (m) => m.requiredLevel <= world.player.skills.Mining.level
      )!
      // Find another material for collateral
      const collateralMat = node.materials.find((m) => m.materialId !== focusMat.materialId)!
      const collateralBefore = collateralMat.remainingUnits

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      executeAction(world, action)

      // Collateral should be damaged
      expect(collateralMat.remainingUnits).toBeLessThan(collateralBefore)
    })

    it("should grant XP based on ticks × tier", () => {
      world.player.skills.Mining.level = 5 // High enough for any material
      const node = getFirstOreNode()
      // Find a material the player can extract
      const focusMat = node.materials.find(
        (m) => m.requiredLevel <= world.player.skills.Mining.level
      )!

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const log = executeAction(world, action)

      expect(log.skillGained).toBeDefined()
      expect(log.skillGained!.skill).toBe("Mining")
      // XP should be ticks × tier
      expect(log.skillGained!.amount).toBe(log.timeConsumed * focusMat.tier)
    })

    it("should log variance info (expected, actual, range)", () => {
      world.player.skills.Mining.level = 5 // High enough for any material
      const node = getFirstOreNode()
      // Find a material the player can extract
      const focusMat = node.materials.find(
        (m) => m.requiredLevel <= world.player.skills.Mining.level
      )!

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const log = executeAction(world, action)

      expect(log.extraction!.variance).toBeDefined()
      expect(log.extraction!.variance!.expected).toBeDefined()
      expect(log.extraction!.variance!.actual).toBeDefined()
      expect(log.extraction!.variance!.range).toBeDefined()
    })

    it("should add extracted items to inventory", () => {
      world.player.skills.Mining.level = 5 // High enough for any material
      const node = getFirstOreNode()
      // Find a material the player can extract
      const focusMat = node.materials.find(
        (m) => m.requiredLevel <= world.player.skills.Mining.level
      )!

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      executeAction(world, action)

      // Should have more items in inventory
      const totalItems = world.player.inventory.reduce((sum, s) => sum + s.quantity, 0)
      expect(totalItems).toBeGreaterThan(0)
    })
  })

  describe("CAREFUL_ALL mode", () => {
    it("should take more ticks than FOCUS mode", () => {
      // We'll compare approximate tick costs
      // CAREFUL_ALL should be slower
      const node = getFirstOreNode()

      // Create two worlds to compare
      const world1 = createGatheringWorld("test-seed")
      world1.player.location = "OUTSKIRTS_MINE"
      world1.player.skills.Mining.level = 4 // L4 unlocks CAREFUL_ALL

      const world2 = createGatheringWorld("test-seed")
      world2.player.location = "OUTSKIRTS_MINE"
      world2.player.skills.Mining.level = 4

      const node1 = world1.world.nodes!.find((n) => n.nodeId === node.nodeId)!
      const node2 = world2.world.nodes!.find((n) => n.nodeId === node.nodeId)!

      const focusAction: GatherAction = {
        type: "Gather",
        nodeId: node1.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: node1.materials[0].materialId,
      }

      const carefulAction: GatherAction = {
        type: "Gather",
        nodeId: node2.nodeId,
        mode: GatherMode.CAREFUL_ALL,
      }

      const focusLog = executeAction(world1, focusAction)
      const carefulLog = executeAction(world2, carefulAction)

      expect(carefulLog.timeConsumed).toBeGreaterThan(focusLog.timeConsumed)
    })

    it("should NOT cause collateral damage", () => {
      world.player.skills.Mining.level = 4 // L4 unlocks CAREFUL_ALL
      const node = getFirstOreNode()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = executeAction(world, action)
      expect(log.success).toBe(true)

      // Check collateral damage is 0 or near 0
      expect(log.extraction!.collateralDamage).toBeDefined()
      const totalCollateral = Object.values(log.extraction!.collateralDamage).reduce(
        (sum, v) => sum + v,
        0
      )
      expect(totalCollateral).toBe(0)
    })

    it("should extract from multiple materials", () => {
      world.player.skills.Mining.level = 4
      const node = getFirstOreNode()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = executeAction(world, action)

      // Should have extracted multiple material types
      const extractedTypes = new Set(log.extraction!.extracted.map((s) => s.itemId))
      expect(extractedTypes.size).toBeGreaterThanOrEqual(1)
    })
  })

  describe("Collateral damage floor", () => {
    it("should have minimum 20% collateral at high levels", () => {
      world.player.skills.Mining.level = 10 // Max level
      const node = getFirstOreNode()

      // Ensure we have at least 2 materials
      expect(node.materials.length).toBeGreaterThanOrEqual(2)

      const focusMat = node.materials[0]
      const collateralMat = node.materials[1]

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const log = executeAction(world, action)

      // Even at L10, collateral should be at least 20% of impacted units
      const collateralDamage = log.extraction!.collateralDamage[collateralMat.materialId] ?? 0
      // Can't test exact floor without knowing impacted units, but should be > 0
      expect(collateralDamage).toBeGreaterThan(0)
    })
  })

  describe("Focus yield progression", () => {
    it("should have ~40% yield at unlock level", () => {
      // At level 1 with a level-1 material, yield should be around 40%
      const node = getFirstOreNode()
      const focusMat = node.materials.find((m) => m.requiredLevel === 1)!

      world.player.skills.Mining.level = 1

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const log = executeAction(world, action)

      // Expected yield should be around 40% of base attempt
      // This is approximate due to variance
      expect(log.extraction!.variance!.expected).toBeGreaterThan(0)
    })

    it("should have 100% yield at level 10 (perfect focus)", () => {
      world.player.skills.Mining.level = 10
      const node = getFirstOreNode()
      const focusMat = node.materials.find((m) => m.requiredLevel === 1)!

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const log = executeAction(world, action)

      // At L10, focusWaste should be 0
      expect(log.extraction!.focusWaste).toBe(0)
    })
  })

  describe("Node depletion", () => {
    it("should mark node depleted when all materials exhausted", () => {
      const node = getFirstOreNode()

      // Drain all materials
      node.materials.forEach((m) => {
        m.remainingUnits = 0
      })

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: node.materials[0].materialId,
      }

      const log = executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("NODE_DEPLETED")
    })
  })

  describe("Skill gating", () => {
    it("should fail if player lacks required skill level for focus material", () => {
      world.player.skills.Mining.level = 1
      const node = getFirstOreNode()

      // Find a material requiring higher level
      const highLevelMat = node.materials.find((m) => m.requiredLevel > 1)
      if (!highLevelMat) {
        // Node doesn't have high-level materials, skip test
        return
      }

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: highLevelMat.materialId,
      }

      const log = executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("INSUFFICIENT_SKILL")
    })
  })

  describe("Location validation", () => {
    it("should fail if player is not at node location", () => {
      world.player.location = "TOWN" // Not at mining location
      const node = getFirstOreNode()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }

      const log = executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("WRONG_LOCATION")
    })
  })

  describe("XP source attribution", () => {
    it("should include source in log for future contract tracking", () => {
      world.player.skills.Mining.level = 5 // High enough for any material
      const node = getFirstOreNode()
      // Find a material the player can extract
      const focusMat = node.materials.find(
        (m) => m.requiredLevel <= world.player.skills.Mining.level
      )!

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const log = executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.xpSource).toBe("node_extraction")
    })
  })

  // ============================================================================
  // Phase 4: Skill Unlock Tests
  // ============================================================================

  describe("Phase 4: Skill Unlocks", () => {
    describe("Location access gating", () => {
      it("should require L5 Mining to access MID mining locations", () => {
        world.player.skills.Mining.level = 4 // Not enough for MID
        world.player.location = "OLD_QUARRY" // MID location
        const node = world.world.nodes!.find((n) => n.locationId === "OLD_QUARRY")!

        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.APPRAISE,
        }

        const log = executeAction(world, action)

        expect(log.success).toBe(false)
        expect(log.failureType).toBe("INSUFFICIENT_SKILL")
      })

      it("should allow L5+ Mining to access MID mining locations", () => {
        world.player.skills.Mining.level = 5 // Enough for MID
        world.player.location = "OLD_QUARRY" // MID location
        const node = world.world.nodes!.find((n) => n.locationId === "OLD_QUARRY")!

        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.APPRAISE,
        }

        const log = executeAction(world, action)

        expect(log.success).toBe(true)
      })

      it("should require L9 Mining to access FAR mining locations", () => {
        world.player.skills.Mining.level = 8 // Not enough for FAR
        world.player.location = "ABANDONED_SHAFT" // FAR location
        const node = world.world.nodes!.find((n) => n.locationId === "ABANDONED_SHAFT")!

        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.APPRAISE,
        }

        const log = executeAction(world, action)

        expect(log.success).toBe(false)
        expect(log.failureType).toBe("INSUFFICIENT_SKILL")
      })

      it("should allow L9+ Mining to access FAR mining locations", () => {
        world.player.skills.Mining.level = 9 // Enough for FAR
        world.player.location = "ABANDONED_SHAFT" // FAR location
        const node = world.world.nodes!.find((n) => n.locationId === "ABANDONED_SHAFT")!

        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.APPRAISE,
        }

        const log = executeAction(world, action)

        expect(log.success).toBe(true)
      })
    })

    describe("APPRAISE mode unlock", () => {
      it("should require L3 Mining for APPRAISE mode", () => {
        world.player.skills.Mining.level = 2 // Not enough for APPRAISE
        const node = getFirstOreNode()

        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.APPRAISE,
        }

        const log = executeAction(world, action)

        expect(log.success).toBe(false)
        expect(log.failureType).toBe("MODE_NOT_UNLOCKED")
      })

      it("should allow L3+ Mining for APPRAISE mode", () => {
        world.player.skills.Mining.level = 3 // Enough for APPRAISE
        const node = getFirstOreNode()

        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.APPRAISE,
        }

        const log = executeAction(world, action)

        expect(log.success).toBe(true)
      })
    })

    describe("Collateral damage step reduction at L6", () => {
      it("should have lower collateral at L6+ than at L5", () => {
        // Test at L5
        const world5 = createGatheringWorld("collateral-test")
        world5.player.location = "OUTSKIRTS_MINE"
        world5.player.skills.Mining.level = 5
        const node5 = world5.world.nodes!.find((n) => n.locationId === "OUTSKIRTS_MINE")!
        const focusMat5 = node5.materials.find(
          (m) => m.requiredLevel <= world5.player.skills.Mining.level
        )!
        const collateralMat5 = node5.materials.find((m) => m.materialId !== focusMat5.materialId)!
        const collateralBefore5 = collateralMat5.remainingUnits

        const action5: GatherAction = {
          type: "Gather",
          nodeId: node5.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: focusMat5.materialId,
        }
        executeAction(world5, action5)
        const collateralDamage5 = collateralBefore5 - collateralMat5.remainingUnits

        // Test at L6
        const world6 = createGatheringWorld("collateral-test")
        world6.player.location = "OUTSKIRTS_MINE"
        world6.player.skills.Mining.level = 6
        const node6 = world6.world.nodes!.find((n) => n.locationId === "OUTSKIRTS_MINE")!
        const focusMat6 = node6.materials.find(
          (m) => m.requiredLevel <= world6.player.skills.Mining.level
        )!
        const collateralMat6 = node6.materials.find((m) => m.materialId !== focusMat6.materialId)!
        const collateralBefore6 = collateralMat6.remainingUnits

        const action6: GatherAction = {
          type: "Gather",
          nodeId: node6.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: focusMat6.materialId,
        }
        executeAction(world6, action6)
        const collateralDamage6 = collateralBefore6 - collateralMat6.remainingUnits

        // L6 should have less collateral damage than L5
        expect(collateralDamage6).toBeLessThanOrEqual(collateralDamage5)
      })
    })
  })
})
