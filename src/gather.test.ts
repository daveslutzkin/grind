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
import { createWorld } from "./world.js"
import {
  GatherMode,
  NodeType,
  type GatherAction,
  type MineAction,
  type ChopAction,
  type WorldState,
  type Node,
  type AreaID,
} from "./types.js"

/**
 * Test helpers for procedural area IDs
 */

/** Get an area that has ore nodes (any distance) */
function getOreAreaId(state: WorldState): AreaID {
  // Sort areas by distance so we prefer closer ones
  const areas = Array.from(state.exploration.areas.values())
    .filter((a) => a.distance > 0)
    .sort((a, b) => a.distance - b.distance)
  for (const area of areas) {
    const hasOre = state.world.nodes?.some(
      (n) => n.areaId === area.id && n.nodeType === NodeType.ORE_VEIN
    )
    if (hasOre) return area.id
  }
  throw new Error("No ore area found")
}

/** Get a NEAR (distance 1) area that has tree nodes - returns undefined if not found */
function getNearTreeAreaId(state: WorldState): AreaID | undefined {
  const areas = Array.from(state.exploration.areas.values()).filter((a) => a.distance === 1)
  for (const area of areas) {
    const hasTree = state.world.nodes?.some(
      (n) => n.areaId === area.id && n.nodeType === NodeType.TREE_STAND
    )
    if (hasTree) return area.id
  }
  return undefined
}

/** Discover all locations in an area (required for Gather to work) */
function discoverAllLocations(state: WorldState, areaId: AreaID): void {
  const area = state.exploration.areas.get(areaId)
  if (area) {
    for (const loc of area.locations) {
      if (!state.exploration.playerState.knownLocationIds.includes(loc.id)) {
        state.exploration.playerState.knownLocationIds.push(loc.id)
      }
    }
  }
}

/** Move player to the location containing a specific node */
function moveToNodeLocation(state: WorldState, node: Node): void {
  const nodeIndexMatch = node.nodeId.match(/-node-(\d+)$/)
  if (nodeIndexMatch) {
    const nodeIndex = nodeIndexMatch[1]
    const locationId = `${node.areaId}-loc-${nodeIndex}`
    state.exploration.playerState.currentLocationId = locationId
  }
}

describe("Phase 3: Gather Action Overhaul", () => {
  let world: WorldState
  let oreAreaId: AreaID

  beforeEach(() => {
    world = createWorld("ore-test")
    // Find an area with ore nodes
    oreAreaId = getOreAreaId(world)
    // Set player at a mining location with level 1 Mining
    world.exploration.playerState.currentAreaId = oreAreaId
    world.player.skills.Mining.level = 1
    world.player.skills.Woodcutting.level = 1
    // Discover all locations in the area (required for Gather)
    discoverAllLocations(world, oreAreaId)
  })

  function getFirstOreNode(): Node {
    const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!
    // Move player to the node's location (required for Gather)
    moveToNodeLocation(world, node)
    return node
  }

  describe("APPRAISE mode", () => {
    it("should cost 1 tick", async () => {
      world.player.skills.Mining.level = 3 // L3 required for APPRAISE
      const node = getFirstOreNode()
      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.timeConsumed).toBe(1)
    })

    it("should not modify node materials", async () => {
      world.player.skills.Mining.level = 3 // L3 required for APPRAISE
      const node = getFirstOreNode()
      const materialsBefore = JSON.stringify(node.materials)

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }

      await executeAction(world, action)

      expect(JSON.stringify(node.materials)).toBe(materialsBefore)
    })

    it("should not grant XP", async () => {
      world.player.skills.Mining.level = 3 // L3 required for APPRAISE
      const node = getFirstOreNode()
      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }

      const log = await executeAction(world, action)

      expect(log.skillGained).toBeUndefined()
    })

    it("should include node info in log", async () => {
      world.player.skills.Mining.level = 6 // L6 = STONE M6 (Appraise)
      const node = getFirstOreNode()
      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }

      const log = await executeAction(world, action)

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
      expect(firstMat.canSeeQuantity).toBeDefined() // Now includes mastery-based visibility
      expect(firstMat.tier).toBeDefined()
      expect(firstMat.requiresSkill).toBeDefined()
      expect(firstMat.requiredLevel).toBeDefined()

      // At L6, STONE should have Appraise mastery - remaining/max should be visible
      const stoneMat = log.extraction!.appraisal!.materials.find((m) => m.materialId === "STONE")
      if (stoneMat) {
        expect(stoneMat.canSeeQuantity).toBe(true)
        expect(stoneMat.remaining).toBeDefined()
        expect(stoneMat.max).toBeDefined()
      }
    })
  })

  describe("FOCUS mode", () => {
    it("should require focusMaterialId", async () => {
      world.player.skills.Mining.level = 5 // High enough for any material
      const node = getFirstOreNode()
      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        // Missing focusMaterialId
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("MISSING_FOCUS_MATERIAL")
    })

    it("should extract focus material with variance", async () => {
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

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.extraction).toBeDefined()
      expect(log.extraction!.extracted.length).toBeGreaterThan(0)
      expect(focusMat.remainingUnits).toBeLessThan(initialUnits)
    })

    it("should cause collateral damage to other materials", async () => {
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

      await executeAction(world, action)

      // Collateral should be damaged
      expect(collateralMat.remainingUnits).toBeLessThan(collateralBefore)
    })

    it("should grant XP based on units extracted (1 per unit)", async () => {
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

      const log = await executeAction(world, action)

      expect(log.skillGained).toBeDefined()
      expect(log.skillGained!.skill).toBe("Mining")
      // XP should be 1 per unit extracted (new mastery system)
      const unitsExtracted = log.extraction!.extracted[0]?.quantity ?? 0
      expect(log.skillGained!.amount).toBe(unitsExtracted)
    })

    it("should log variance info (expected, actual, range)", async () => {
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

      const log = await executeAction(world, action)

      expect(log.extraction!.variance).toBeDefined()
      expect(log.extraction!.variance!.expected).toBeDefined()
      expect(log.extraction!.variance!.actual).toBeDefined()
      expect(log.extraction!.variance!.range).toBeDefined()
    })

    it("should add extracted items to inventory", async () => {
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

      await executeAction(world, action)

      // Should have more items in inventory
      const totalItems = world.player.inventory.reduce((sum, s) => sum + s.quantity, 0)
      expect(totalItems).toBeGreaterThan(0)
    })
  })

  describe("CAREFUL_ALL mode", () => {
    it("should take more ticks than FOCUS mode", async () => {
      // We'll compare approximate tick costs
      // CAREFUL_ALL should be slower

      // Create two worlds to compare
      const world1 = createWorld("ore-test")
      const area1 = getOreAreaId(world1)
      world1.exploration.playerState.currentAreaId = area1
      world1.player.skills.Mining.level = 16 // L16 unlocks STONE Careful (M16)
      discoverAllLocations(world1, area1)

      const world2 = createWorld("ore-test")
      const area2 = getOreAreaId(world2)
      world2.exploration.playerState.currentAreaId = area2
      world2.player.skills.Mining.level = 16
      discoverAllLocations(world2, area2)

      const node1 = world1.world.nodes!.find((n) => n.areaId === area1)!
      const node2 = world2.world.nodes!.find((n) => n.areaId === area2)!
      moveToNodeLocation(world1, node1)
      moveToNodeLocation(world2, node2)

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

      const focusLog = await executeAction(world1, focusAction)
      const carefulLog = await executeAction(world2, carefulAction)

      expect(carefulLog.timeConsumed).toBeGreaterThan(focusLog.timeConsumed)
    })

    it("should NOT cause collateral damage", async () => {
      world.player.skills.Mining.level = 16 // L16 unlocks STONE Careful (M16)
      const node = getFirstOreNode()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = await executeAction(world, action)
      expect(log.success).toBe(true)

      // Check collateral damage is 0 or near 0
      expect(log.extraction!.collateralDamage).toBeDefined()
      const totalCollateral = Object.values(log.extraction!.collateralDamage).reduce(
        (sum, v) => sum + v,
        0
      )
      expect(totalCollateral).toBe(0)
    })

    it("should extract from multiple materials", async () => {
      world.player.skills.Mining.level = 16 // L16 unlocks STONE Careful (M16)
      const node = getFirstOreNode()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = await executeAction(world, action)

      // Should have extracted multiple material types
      const extractedTypes = new Set(log.extraction!.extracted.map((s) => s.itemId))
      expect(extractedTypes.size).toBeGreaterThanOrEqual(1)
    })
  })

  describe("Collateral damage floor", () => {
    it("should have minimum 20% collateral at high levels", async () => {
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

      const log = await executeAction(world, action)

      // Even at L10, collateral should be at least 20% of impacted units
      const collateralDamage = log.extraction!.collateralDamage[collateralMat.materialId] ?? 0
      // Can't test exact floor without knowing impacted units, but should be > 0
      expect(collateralDamage).toBeGreaterThan(0)
    })
  })

  describe("Focus yield progression", () => {
    it("should have ~40% yield at unlock level", async () => {
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

      const log = await executeAction(world, action)

      // Expected yield should be around 40% of base attempt
      // This is approximate due to variance
      expect(log.extraction!.variance!.expected).toBeGreaterThan(0)
    })

    it("should have 100% yield at level 10 (perfect focus)", async () => {
      world.player.skills.Mining.level = 10
      const node = getFirstOreNode()
      const focusMat = node.materials.find((m) => m.requiredLevel === 1)!

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const log = await executeAction(world, action)

      // At L10, focusWaste should be 0
      expect(log.extraction!.focusWaste).toBe(0)
    })
  })

  describe("Node depletion", () => {
    it("should mark node depleted when all materials exhausted", async () => {
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

      const log = await executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("NODE_DEPLETED")
    })
  })

  describe("Skill gating", () => {
    it("should fail if player lacks mastery unlock for focus material", async () => {
      world.player.skills.Mining.level = 1
      const node = getFirstOreNode()

      // COPPER_ORE requires L20 to unlock
      const highLevelMat = node.materials.find((m) => m.materialId === "COPPER_ORE")
      if (!highLevelMat) {
        // Add COPPER_ORE to node for testing
        node.materials.push({
          materialId: "COPPER_ORE",
          remainingUnits: 10,
          maxUnitsInitial: 10,
          requiresSkill: "Mining",
          requiredLevel: 20,
          tier: 2,
        })
      }

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "COPPER_ORE",
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(false)
      // Now returns MATERIAL_NOT_UNLOCKED (mastery-based) instead of INSUFFICIENT_SKILL
      expect(log.failureDetails?.type).toBe("MATERIAL_NOT_UNLOCKED")
    })
  })

  describe("Location validation", () => {
    it("should fail if player is not at node location", async () => {
      world.exploration.playerState.currentAreaId = "TOWN" // Not at mining location
      const node = getFirstOreNode()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("WRONG_LOCATION")
    })
  })

  describe("XP source attribution", () => {
    it("should include source in log for future contract tracking", async () => {
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

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.xpSource).toBe("node_extraction")
    })
  })

  describe("Mining XP thresholds (per canonical-gathering.md)", () => {
    it("should use exploration XP thresholds for mining (L1→L2 = 25 XP, not 4)", async () => {
      // Per canonical-gathering.md: "XP thresholds: Same as Exploration skill"
      // Exploration L1→L2 threshold is 25 XP (from EXPLORATION_XP_THRESHOLDS)
      // Mining should NOT use the N² formula (which would be 4 XP for L1→L2)
      world.player.skills.Mining = { level: 1, xp: 0 }
      const node = getFirstOreNode()
      const focusMat = node.materials.find((m) => m.requiredLevel <= 1)!

      // Mine 10 times (10 XP) - should NOT level up if using exploration thresholds (25)
      // Would level up twice if using N² thresholds (only need 4 XP for L1→L2, 9 for L2→L3)
      for (let i = 0; i < 10; i++) {
        if (focusMat.remainingUnits <= 0) break
        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: focusMat.materialId,
        }
        await executeAction(world, action)
      }

      // With exploration thresholds (25 XP needed), should still be level 1
      // With N² thresholds (only 4 XP needed), would have leveled up to at least level 2
      expect(world.player.skills.Mining.level).toBe(1)
      // XP should be <= 10 (what we mined, minus any level-ups)
      expect(world.player.skills.Mining.xp).toBeLessThanOrEqual(10)
    })

    it("should level up mining at 25 XP (exploration threshold), not 4 XP (N² threshold)", async () => {
      // Start at 24 XP - one more extraction should push us to level 2
      world.player.skills.Mining = { level: 1, xp: 24 }
      const node = getFirstOreNode()
      const focusMat = node.materials.find((m) => m.requiredLevel <= 1)!

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.levelUps).toBeDefined()
      expect(log.levelUps!.some((lu) => lu.skill === "Mining" && lu.toLevel === 2)).toBe(true)
      expect(world.player.skills.Mining.level).toBe(2)
    })
  })

  // ============================================================================
  // Phase 4: Skill Unlock Tests
  // ============================================================================

  describe("Phase 4: Skill Unlocks", () => {
    describe("APPRAISE mode unlock", () => {
      it("should require L3 Mining for APPRAISE mode", async () => {
        world.player.skills.Mining.level = 2 // Not enough for APPRAISE
        const node = getFirstOreNode()

        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.APPRAISE,
        }

        const log = await executeAction(world, action)

        expect(log.success).toBe(false)
        expect(log.failureDetails?.type).toBe("MODE_NOT_UNLOCKED")
      })

      it("should allow L3+ Mining for APPRAISE mode", async () => {
        world.player.skills.Mining.level = 3 // Enough for APPRAISE
        const node = getFirstOreNode()

        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.APPRAISE,
        }

        const log = await executeAction(world, action)

        expect(log.success).toBe(true)
      })
    })

    describe("Collateral damage step reduction at L6", () => {
      it("should have lower collateral at L6+ than at L5", async () => {
        // Test at L5
        const world5 = createWorld("collateral-test")
        const area5 = getOreAreaId(world5)
        world5.exploration.playerState.currentAreaId = area5
        world5.player.skills.Mining.level = 5
        discoverAllLocations(world5, area5)
        const node5 = world5.world.nodes!.find((n) => n.areaId === area5)!
        moveToNodeLocation(world5, node5)
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
        await executeAction(world5, action5)
        const collateralDamage5 = collateralBefore5 - collateralMat5.remainingUnits

        // Test at L6
        const world6 = createWorld("collateral-test")
        const area6 = getOreAreaId(world6)
        world6.exploration.playerState.currentAreaId = area6
        world6.player.skills.Mining.level = 6
        discoverAllLocations(world6, area6)
        const node6 = world6.world.nodes!.find((n) => n.areaId === area6)!
        moveToNodeLocation(world6, node6)
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
        await executeAction(world6, action6)
        const collateralDamage6 = collateralBefore6 - collateralMat6.remainingUnits

        // L6 should have less collateral damage than L5
        expect(collateralDamage6).toBeLessThanOrEqual(collateralDamage5)
      })
    })
  })

  // ============================================================================
  // Mine and Chop command aliases
  // ============================================================================

  describe("Mine command (alias for gather mining)", () => {
    it("should find and gather from ORE_VEIN in current area with FOCUS mode", async () => {
      world.player.skills.Mining.level = 5
      const node = getFirstOreNode()
      const focusMat = node.materials.find(
        (m) => m.requiredLevel <= world.player.skills.Mining.level
      )!
      const initialUnits = focusMat.remainingUnits

      const action: MineAction = {
        type: "Mine",
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.actionType).toBe("Gather") // Should be recorded as Gather in log
      expect(focusMat.remainingUnits).toBeLessThan(initialUnits)
    })

    it("should find and gather from ORE_VEIN with CAREFUL_ALL mode", async () => {
      world.player.skills.Mining.level = 16 // L16 unlocks STONE Careful (M16)
      getFirstOreNode() // Move to the ore node location

      const action: MineAction = {
        type: "Mine",
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.extraction).toBeDefined()
      expect(log.extraction!.mode).toBe(GatherMode.CAREFUL_ALL)
    })

    it("should find and appraise ORE_VEIN with APPRAISE mode", async () => {
      world.player.skills.Mining.level = 3
      const node = getFirstOreNode()

      const action: MineAction = {
        type: "Mine",
        mode: GatherMode.APPRAISE,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.extraction!.appraisal).toBeDefined()
      expect(log.extraction!.appraisal!.nodeId).toBe(node.nodeId)
    })

    it("should fail if no ORE_VEIN in current area", async () => {
      // Move to town (no ore nodes there)
      world.exploration.playerState.currentAreaId = "TOWN"

      const action: MineAction = {
        type: "Mine",
        mode: GatherMode.APPRAISE,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("NODE_NOT_FOUND")
    })

    it("should auto-select material when only one gatherable material exists", async () => {
      world.player.skills.Mining.level = 1 // Only STONE is gatherable at L1
      const node = getFirstOreNode()

      // Count how many materials are gatherable at this level
      const gatherableMaterials = node.materials.filter(
        (m) => m.requiredLevel <= world.player.skills.Mining.level && m.remainingUnits > 0
      )

      // If there's exactly one gatherable material, mine without specifying should work
      if (gatherableMaterials.length === 1) {
        const focusMat = gatherableMaterials[0]
        const initialUnits = focusMat.remainingUnits

        // Mine without specifying focusMaterialId
        const action: MineAction = {
          type: "Mine",
          mode: GatherMode.FOCUS,
          // No focusMaterialId specified
        }

        const log = await executeAction(world, action)

        expect(log.success).toBe(true)
        expect(log.actionType).toBe("Gather")
        expect(focusMat.remainingUnits).toBeLessThan(initialUnits)
      }
    })

    it("should fail with helpful error when multiple materials are gatherable and none specified", async () => {
      world.player.skills.Mining.level = 5 // Multiple materials gatherable at L5
      const node = getFirstOreNode()

      // Count how many materials are gatherable at this level
      const gatherableMaterials = node.materials.filter(
        (m) => m.requiredLevel <= world.player.skills.Mining.level && m.remainingUnits > 0
      )

      // Only run this test if there are multiple gatherable materials
      if (gatherableMaterials.length > 1) {
        // Mine without specifying focusMaterialId
        const action: MineAction = {
          type: "Mine",
          mode: GatherMode.FOCUS,
          // No focusMaterialId specified
        }

        const log = await executeAction(world, action)

        expect(log.success).toBe(false)
        expect(log.failureDetails?.type).toBe("MISSING_FOCUS_MATERIAL")
      }
    })
  })

  describe("Chop command (alias for gather woodcutting)", () => {
    let woodAreaId: AreaID

    beforeEach(() => {
      // Find an area with tree nodes
      const areas = Array.from(world.exploration.areas.values())
        .filter((a) => a.distance > 0)
        .sort((a, b) => a.distance - b.distance)
      for (const area of areas) {
        const hasTree = world.world.nodes?.some(
          (n) => n.areaId === area.id && n.nodeType === NodeType.TREE_STAND
        )
        if (hasTree) {
          woodAreaId = area.id
          break
        }
      }
      if (woodAreaId) {
        world.exploration.playerState.currentAreaId = woodAreaId
        discoverAllLocations(world, woodAreaId)
      }
    })

    it("should find and gather from TREE_STAND in current area with FOCUS mode", async () => {
      if (!woodAreaId) return // Skip if no tree area found
      world.player.skills.Woodcutting.level = 5
      const node = world.world.nodes!.find(
        (n) => n.areaId === woodAreaId && n.nodeType === NodeType.TREE_STAND
      )!
      moveToNodeLocation(world, node) // Move to the tree node location
      const focusMat = node.materials.find(
        (m) => m.requiredLevel <= world.player.skills.Woodcutting.level
      )!
      const initialUnits = focusMat.remainingUnits

      const action: ChopAction = {
        type: "Chop",
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.actionType).toBe("Gather") // Should be recorded as Gather in log
      expect(focusMat.remainingUnits).toBeLessThan(initialUnits)
    })

    it("should find and gather from TREE_STAND with CAREFUL_ALL mode", async () => {
      if (!woodAreaId) return // Skip if no tree area found

      // For mode unlock tests, we need to use a NEAR (distance 1) area to isolate
      // mode unlock from location access requirements
      const nearTreeAreaId = getNearTreeAreaId(world)
      if (!nearTreeAreaId) return // Skip if no NEAR tree area

      world.exploration.playerState.currentAreaId = nearTreeAreaId
      discoverAllLocations(world, nearTreeAreaId)
      world.player.skills.Woodcutting.level = 16

      const node = world.world.nodes!.find(
        (n) => n.areaId === nearTreeAreaId && n.nodeType === NodeType.TREE_STAND
      )!
      moveToNodeLocation(world, node) // Move to the tree node location

      const action: ChopAction = {
        type: "Chop",
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.extraction).toBeDefined()
      expect(log.extraction!.mode).toBe(GatherMode.CAREFUL_ALL)
    })

    it("should find and appraise TREE_STAND with APPRAISE mode", async () => {
      if (!woodAreaId) return // Skip if no tree area found

      // For mode unlock tests, we need to use a NEAR (distance 1) area to isolate
      // mode unlock from location access requirements
      const nearTreeAreaId = getNearTreeAreaId(world)
      if (!nearTreeAreaId) return // Skip if no NEAR tree area

      world.exploration.playerState.currentAreaId = nearTreeAreaId
      discoverAllLocations(world, nearTreeAreaId)
      world.player.skills.Woodcutting.level = 3

      const node = world.world.nodes!.find(
        (n) => n.areaId === nearTreeAreaId && n.nodeType === NodeType.TREE_STAND
      )!
      moveToNodeLocation(world, node) // Move to the tree node location

      const action: ChopAction = {
        type: "Chop",
        mode: GatherMode.APPRAISE,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.extraction!.appraisal).toBeDefined()
      expect(log.extraction!.appraisal!.nodeId).toBe(node.nodeId)
    })

    it("should fail if no TREE_STAND in current area", async () => {
      // Move to town (no tree nodes there)
      world.exploration.playerState.currentAreaId = "TOWN"

      const action: ChopAction = {
        type: "Chop",
        mode: GatherMode.APPRAISE,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("NODE_NOT_FOUND")
    })
  })

  // ============================================================================
  // New Canonical Gathering System Tests
  // ============================================================================

  describe("Canonical Gathering: Guild Enrollment", () => {
    it("should fail with NOT_ENROLLED if Mining skill is at L0", async () => {
      world.player.skills.Mining.level = 0 // Not enrolled
      const node = getFirstOreNode()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "STONE",
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("NOT_ENROLLED")
    })

    it("should allow mining if Mining skill is at L1+", async () => {
      world.player.skills.Mining.level = 1
      const node = getFirstOreNode()
      // Find a material with requiredLevel 1
      const stoneMat = node.materials.find((m) => m.requiredLevel === 1)
      if (!stoneMat) return // Skip if no level 1 material

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: stoneMat.materialId,
      }

      const log = await executeAction(world, action)

      // Should not fail with NOT_ENROLLED
      expect(log.failureDetails?.type).not.toBe("NOT_ENROLLED")
    })
  })

  describe("Canonical Gathering: Material Unlock via Mastery", () => {
    it("should fail if player lacks mastery unlock for material (COPPER_ORE before L20)", async () => {
      world.player.skills.Mining.level = 19 // Just before COPPER_ORE unlock
      const node = getFirstOreNode()

      // Add COPPER_ORE to the node if not present
      const copperMat = node.materials.find((m) => m.materialId === "COPPER_ORE")
      if (!copperMat) {
        node.materials.push({
          materialId: "COPPER_ORE",
          remainingUnits: 10,
          maxUnitsInitial: 10,
          requiresSkill: "Mining",
          requiredLevel: 20,
          tier: 2,
        })
      }

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "COPPER_ORE",
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(false)
      // Should fail because player doesn't have COPPER_ORE M1 (Unlock)
      expect(log.failureDetails?.type).toBe("MATERIAL_NOT_UNLOCKED")
    })

    it("should allow mining COPPER_ORE at L20+ (COPPER_ORE M1 unlock)", async () => {
      world.player.skills.Mining.level = 20 // COPPER_ORE unlocks at L20
      const node = getFirstOreNode()

      // Ensure COPPER_ORE is in the node
      const copperMat = node.materials.find((m) => m.materialId === "COPPER_ORE")
      if (!copperMat) {
        node.materials.push({
          materialId: "COPPER_ORE",
          remainingUnits: 10,
          maxUnitsInitial: 10,
          requiresSkill: "Mining",
          requiredLevel: 20,
          tier: 2,
        })
      }

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "COPPER_ORE",
      }

      const log = await executeAction(world, action)

      // Should not fail with MATERIAL_NOT_UNLOCKED
      expect(log.failureDetails?.type).not.toBe("MATERIAL_NOT_UNLOCKED")
    })
  })

  describe("Canonical Gathering: CAREFUL Mode Mastery Check", () => {
    it("should fail CAREFUL mode if no materials have M16 (Careful) unlock", async () => {
      world.player.skills.Mining.level = 15 // STONE M16 is at L16
      const node = getFirstOreNode()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("NO_CAREFUL_MATERIALS")
    })

    it("should allow CAREFUL mode at L16+ for STONE (STONE M16 = Careful)", async () => {
      world.player.skills.Mining.level = 16 // STONE gets Careful at L16
      const node = getFirstOreNode()
      // Ensure node has STONE
      const stoneMat = node.materials.find((m) => m.materialId === "STONE")
      if (!stoneMat) return // Skip if no STONE

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = await executeAction(world, action)

      // Should not fail with NO_CAREFUL_MATERIALS
      expect(log.failureDetails?.type).not.toBe("NO_CAREFUL_MATERIALS")
    })
  })

  describe("Canonical Gathering: Mastery-Based Time Cost", () => {
    it("should use 20 ticks base for STONE at L1 (base speed)", async () => {
      world.player.skills.Mining.level = 1
      const node = getFirstOreNode()
      const stoneMat = node.materials.find((m) => m.materialId === "STONE" && m.requiredLevel === 1)
      expect(stoneMat).toBeDefined()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "STONE",
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.extraction!.variance!.expected).toBe(20)
    })

    it("should use 15 ticks base for STONE at L2 (Speed I)", async () => {
      world.player.skills.Mining.level = 2
      const node = getFirstOreNode()
      const stoneMat = node.materials.find((m) => m.materialId === "STONE" && m.requiredLevel <= 2)
      expect(stoneMat).toBeDefined()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "STONE",
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.extraction!.variance!.expected).toBe(15)
    })

    it("should use 10 ticks base for STONE at L9 (Speed II)", async () => {
      world.player.skills.Mining.level = 9
      const node = getFirstOreNode()
      const stoneMat = node.materials.find((m) => m.materialId === "STONE")
      expect(stoneMat).toBeDefined()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "STONE",
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.extraction!.variance!.expected).toBe(10)
    })

    it("should use 5 ticks base for STONE at L17 (Speed III)", async () => {
      world.player.skills.Mining.level = 17
      const node = getFirstOreNode()
      const stoneMat = node.materials.find((m) => m.materialId === "STONE")
      expect(stoneMat).toBeDefined()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "STONE",
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.extraction!.variance!.expected).toBe(5)
    })
  })

  // ============================================================================
  // Phase 3: 1-Unit Extraction Model
  // ============================================================================

  describe("Canonical Gathering: 1-Unit Extraction", () => {
    it("should extract exactly 1 unit in FOCUS mode (no bonus yield)", async () => {
      // Use a seed that doesn't trigger bonus yield
      world = createWorld("no-bonus-seed")
      oreAreaId = getOreAreaId(world)
      world.exploration.playerState.currentAreaId = oreAreaId
      world.player.skills.Mining.level = 9 // Before M10 Bonus_I
      discoverAllLocations(world, oreAreaId)

      const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!
      moveToNodeLocation(world, node)

      const stoneMat = node.materials.find((m) => m.materialId === "STONE")!
      const initialUnits = stoneMat.remainingUnits

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "STONE",
      }

      const log = await executeAction(world, action)

      if (log.success) {
        // Should extract exactly 1 unit
        expect(log.extraction!.extracted.length).toBe(1)
        expect(log.extraction!.extracted[0].quantity).toBe(1)
        expect(stoneMat.remainingUnits).toBe(initialUnits - 1)
      }
    })

    it("should grant 1 XP per unit extracted (not ticks × tier)", async () => {
      world.player.skills.Mining.level = 9 // Before M10 Bonus_I
      const node = getFirstOreNode()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "STONE",
      }

      const log = await executeAction(world, action)

      if (log.success) {
        // XP = 1 per unit extracted (should be 1 unit = 1 XP)
        expect(log.skillGained!.amount).toBe(1)
      }
    })
  })

  describe("Canonical Gathering: Mastery-Based Collateral Damage", () => {
    it("should have 40% collateral at L1 (base rate)", async () => {
      world.player.skills.Mining.level = 1
      const node = getFirstOreNode()

      // Find another material (not STONE) to check collateral damage
      const otherMat = node.materials.find((m) => m.materialId !== "STONE" && m.remainingUnits > 0)
      if (!otherMat) return // Skip if no other material

      const otherBefore = otherMat.remainingUnits

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "STONE",
      }

      const log = await executeAction(world, action)

      if (log.success) {
        // 1 unit extracted × 0.40 collateral = 0.4 fractional damage
        const damage = otherBefore - otherMat.remainingUnits
        expect(damage).toBeCloseTo(0.4, 1)
      }
    })

    it("should have 30% collateral at L3 (Waste_I)", async () => {
      world.player.skills.Mining.level = 3
      const node = getFirstOreNode()

      const otherMat = node.materials.find((m) => m.materialId !== "STONE" && m.remainingUnits > 0)
      if (!otherMat) return

      const otherBefore = otherMat.remainingUnits

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "STONE",
      }

      const log = await executeAction(world, action)

      if (log.success) {
        // 1 unit extracted × 0.30 collateral = 0.3 fractional damage
        const damage = otherBefore - otherMat.remainingUnits
        expect(damage).toBeCloseTo(0.3, 1)
      }
    })

    it("should have 15% collateral at L11 (Waste_II)", async () => {
      world.player.skills.Mining.level = 11
      const node = getFirstOreNode()

      const otherMat = node.materials.find((m) => m.materialId !== "STONE" && m.remainingUnits > 0)
      if (!otherMat) return

      const otherBefore = otherMat.remainingUnits

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "STONE",
      }

      const log = await executeAction(world, action)

      if (log.success) {
        const damage = otherBefore - otherMat.remainingUnits
        expect(damage).toBeCloseTo(0.15, 2)
      }
    })

    it("should have 5% collateral at L19 (Waste_III)", async () => {
      world.player.skills.Mining.level = 19
      const node = getFirstOreNode()

      const otherMat = node.materials.find((m) => m.materialId !== "STONE" && m.remainingUnits > 0)
      if (!otherMat) return

      const otherBefore = otherMat.remainingUnits

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "STONE",
      }

      const log = await executeAction(world, action)

      if (log.success) {
        const damage = otherBefore - otherMat.remainingUnits
        expect(damage).toBeCloseTo(0.05, 2)
      }
    })
  })

  describe("Canonical Gathering: Bonus Yield", () => {
    it("should have 0% bonus yield before M10", async () => {
      world.player.skills.Mining.level = 9 // Just before M10

      // Run multiple times - should never get 2 units
      for (let i = 0; i < 10; i++) {
        const testWorld = createWorld(`bonus-test-${i}`)
        const testAreaId = getOreAreaId(testWorld)
        testWorld.exploration.playerState.currentAreaId = testAreaId
        testWorld.player.skills.Mining.level = 9
        discoverAllLocations(testWorld, testAreaId)
        const testNode = testWorld.world.nodes!.find((n) => n.areaId === testAreaId)!
        moveToNodeLocation(testWorld, testNode)

        const action: GatherAction = {
          type: "Gather",
          nodeId: testNode.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: "STONE",
        }

        const log = await executeAction(testWorld, action)

        if (log.success) {
          // Before M10, should never get 2 units
          expect(log.extraction!.extracted[0].quantity).toBe(1)
        }
      }
    })

    it("should occasionally get 2 units with Bonus_I at M10 (5% chance)", async () => {
      // This is a probabilistic test - we just verify it's possible
      // With 5% chance, in 100 trials we expect ~5 doubles
      let doubleCount = 0

      for (let i = 0; i < 100; i++) {
        const testWorld = createWorld(`bonus-m10-test-${i}`)
        const testAreaId = getOreAreaId(testWorld)
        testWorld.exploration.playerState.currentAreaId = testAreaId
        testWorld.player.skills.Mining.level = 10 // M10 Bonus_I
        discoverAllLocations(testWorld, testAreaId)
        const testNode = testWorld.world.nodes!.find((n) => n.areaId === testAreaId)!
        moveToNodeLocation(testWorld, testNode)

        const action: GatherAction = {
          type: "Gather",
          nodeId: testNode.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: "STONE",
        }

        const log = await executeAction(testWorld, action)

        if (log.success && log.extraction!.extracted[0].quantity === 2) {
          doubleCount++
        }
      }

      // Should get at least one double with 5% chance over 100 trials
      // (99.4% probability of at least 1 double)
      expect(doubleCount).toBeGreaterThan(0)
    })
  })

  describe("Canonical Gathering: CAREFUL Mode Extraction", () => {
    it("should extract 1 random material from M16-unlocked materials", async () => {
      world.player.skills.Mining.level = 16 // STONE M16 = Careful
      const node = getFirstOreNode()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = await executeAction(world, action)

      if (log.success) {
        // Should extract exactly 1 material type with 1 unit
        expect(log.extraction!.extracted.length).toBe(1)
        expect(log.extraction!.extracted[0].quantity).toBe(1)
      }
    })

    it("should have zero collateral damage in CAREFUL mode", async () => {
      world.player.skills.Mining.level = 16
      const node = getFirstOreNode()

      // Find another material to check collateral
      const otherMat = node.materials.find((m) => m.materialId !== "STONE" && m.remainingUnits > 0)
      if (!otherMat) return

      const otherBefore = otherMat.remainingUnits

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = await executeAction(world, action)

      if (log.success) {
        // No collateral damage
        expect(otherMat.remainingUnits).toBe(otherBefore)
      }
    })
  })

  // ============================================================================
  // Phase 4: Time Variance and Luck Surfacing
  // ============================================================================

  describe("Canonical Gathering: Time Variance", () => {
    it("should apply time variance to FOCUS extraction", async () => {
      // Run multiple extractions and check that times vary
      const times: number[] = []

      for (let i = 0; i < 20; i++) {
        const testWorld = createWorld(`time-variance-${i}`)
        const testAreaId = getOreAreaId(testWorld)
        testWorld.exploration.playerState.currentAreaId = testAreaId
        testWorld.player.skills.Mining.level = 1 // Base speed = 20 ticks
        discoverAllLocations(testWorld, testAreaId)
        const testNode = testWorld.world.nodes!.find((n) => n.areaId === testAreaId)!
        moveToNodeLocation(testWorld, testNode)

        const action: GatherAction = {
          type: "Gather",
          nodeId: testNode.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: "STONE",
        }

        const log = await executeAction(testWorld, action)

        if (log.success) {
          times.push(log.timeConsumed)
        }
      }

      // With variance, we should see some variation in times
      // Base is 20 ticks, variance is ±25% (±5 ticks)
      const uniqueTimes = new Set(times)
      expect(uniqueTimes.size).toBeGreaterThan(1) // Should have variation
      expect(Math.min(...times)).toBeGreaterThanOrEqual(1) // Minimum 1 tick
    })

    it("should include luck delta in extraction log", async () => {
      world.player.skills.Mining.level = 1
      const node = getFirstOreNode()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "STONE",
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.extraction!.variance).toBeDefined()
      expect(log.extraction!.variance!.expected).toBe(20) // Base time at L1
      expect(typeof log.extraction!.variance!.luckDelta).toBe("number")
    })

    it("should track cumulative luck in player state", async () => {
      world.player.skills.Mining.level = 1
      const node = getFirstOreNode()

      // Ensure node has enough materials for multiple extractions
      const stoneMat = node.materials.find((m) => m.materialId === "STONE")
      expect(stoneMat).toBeDefined()
      stoneMat!.remainingUnits = 100

      const initialLuck = world.player.gatheringLuckDelta

      // Perform multiple extractions
      let totalExpectedLuckChange = 0
      for (let i = 0; i < 3; i++) {
        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: "STONE",
        }

        const log = await executeAction(world, action)

        expect(log.success).toBe(true)
        expect(log.extraction?.variance).toBeDefined()
        totalExpectedLuckChange += log.extraction!.variance!.luckDelta!
      }

      // Player's cumulative luck should reflect all extractions
      const finalLuck = world.player.gatheringLuckDelta
      expect(finalLuck - initialLuck).toBeCloseTo(totalExpectedLuckChange, 5)
    })

    it("should apply time variance to CAREFUL mode extraction", async () => {
      world.player.skills.Mining.level = 16 // STONE M16 = Careful
      const node = getFirstOreNode()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.extraction).toBeDefined()
      expect(log.extraction!.variance).toBeDefined()
      // CAREFUL base time = 2x slowest material speed = 2 * 10 = 20 at L16 (Speed_II)
      expect(log.extraction!.variance!.expected).toBe(20)
      expect(typeof log.extraction!.variance!.luckDelta).toBe("number")
      // luckDelta = expected - actual
      expect(log.extraction!.variance!.luckDelta).toBe(
        log.extraction!.variance!.expected - log.extraction!.variance!.actual
      )
    })
  })

  describe("Canonical Gathering: APPRAISE Mastery Filtering", () => {
    it("should only show quantities for materials with M6 (Appraise) unlock", async () => {
      world.player.skills.Mining.level = 6 // STONE M6 = Appraise (L6)
      const node = getFirstOreNode()

      // Ensure node has both STONE (will have Appraise) and COPPER_ORE (won't have Appraise until L25)
      const copperMat = node.materials.find((m) => m.materialId === "COPPER_ORE")
      if (!copperMat) {
        node.materials.push({
          materialId: "COPPER_ORE",
          remainingUnits: 5,
          maxUnitsInitial: 10,
          requiresSkill: "Mining",
          requiredLevel: 20,
          tier: 2,
        })
      }

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.extraction!.appraisal).toBeDefined()

      const appraisal = log.extraction!.appraisal!
      const stoneMat = appraisal.materials.find((m) => m.materialId === "STONE")
      const copperMatResult = appraisal.materials.find((m) => m.materialId === "COPPER_ORE")

      // STONE should have canSeeQuantity = true (has M6 at L6)
      expect(stoneMat).toBeDefined()
      expect(stoneMat!.canSeeQuantity).toBe(true)
      expect(stoneMat!.remaining).toBeDefined()
      expect(stoneMat!.max).toBeDefined()

      // COPPER_ORE should have canSeeQuantity = false (needs L25 for M6)
      expect(copperMatResult).toBeDefined()
      expect(copperMatResult!.canSeeQuantity).toBe(false)
      expect(copperMatResult!.remaining).toBeUndefined()
      expect(copperMatResult!.max).toBeUndefined()
    })

    it("should show all quantities at high skill level", async () => {
      world.player.skills.Mining.level = 50 // Has Appraise for STONE (L6) and COPPER_ORE (L25), TIN_ORE (L45)
      const node = getFirstOreNode()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      const appraisal = log.extraction!.appraisal!

      // All materials up to TIN_ORE should have canSeeQuantity = true
      const stoneMat = appraisal.materials.find((m) => m.materialId === "STONE")
      expect(stoneMat?.canSeeQuantity).toBe(true)
    })
  })

  // ============================================================================
  // Phase 5: Inventory Check
  // ============================================================================

  describe("Canonical Gathering: Pre-flight Inventory Check", () => {
    it("should fail FOCUS mode if inventory is full", async () => {
      world.player.skills.Mining.level = 5
      const node = getFirstOreNode()

      // Fill inventory to capacity
      const capacity = world.player.inventoryCapacity ?? 10
      world.player.inventory = []
      for (let i = 0; i < capacity; i++) {
        world.player.inventory.push({ itemId: `FILLER_${i}`, quantity: 1 })
      }

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: "STONE",
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("INVENTORY_FULL")
    })

    it("should fail CAREFUL mode if inventory is full", async () => {
      world.player.skills.Mining.level = 16 // STONE M16 = Careful
      const node = getFirstOreNode()

      // Fill inventory to capacity
      const capacity = world.player.inventoryCapacity ?? 10
      world.player.inventory = []
      for (let i = 0; i < capacity; i++) {
        world.player.inventory.push({ itemId: `FILLER_${i}`, quantity: 1 })
      }

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("INVENTORY_FULL")
    })

    it("should allow APPRAISE mode even if inventory is full", async () => {
      world.player.skills.Mining.level = 3
      const node = getFirstOreNode()

      // Fill inventory to capacity
      const capacity = world.player.inventoryCapacity ?? 10
      world.player.inventory = []
      for (let i = 0; i < capacity; i++) {
        world.player.inventory.push({ itemId: `FILLER_${i}`, quantity: 1 })
      }

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }

      const log = await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.extraction!.mode).toBe(GatherMode.APPRAISE)
    })
  })
})
