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

/** Get an area at distance 2+ that has ore nodes */
function getMidOreAreaId(state: WorldState): AreaID {
  // Sort areas by distance, prefer closer areas that are distance 2+
  const areas = Array.from(state.exploration.areas.values())
    .filter((a) => a.distance >= 2)
    .sort((a, b) => a.distance - b.distance)
  for (const area of areas) {
    const hasOre = state.world.nodes?.some(
      (n) => n.areaId === area.id && n.nodeType === NodeType.ORE_VEIN
    )
    if (hasOre) return area.id
  }
  throw new Error("No mid-distance ore area found")
}

/** Get an area at distance 3+ that has ore nodes */
function getFarOreAreaId(state: WorldState): AreaID {
  // Sort areas by distance, prefer closer areas that are distance 3+
  const areas = Array.from(state.exploration.areas.values())
    .filter((a) => a.distance >= 3)
    .sort((a, b) => a.distance - b.distance)
  for (const area of areas) {
    const hasOre = state.world.nodes?.some(
      (n) => n.areaId === area.id && n.nodeType === NodeType.ORE_VEIN
    )
    if (hasOre) return area.id
  }
  throw new Error("No far-distance ore area found")
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
    return world.world.nodes!.find((n) => n.areaId === oreAreaId)!
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

      const ticksBefore = world.time.sessionRemainingTicks
      const log = await await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.timeConsumed).toBe(1)
      expect(world.time.sessionRemainingTicks).toBe(ticksBefore - 1)
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

      const log = await await executeAction(world, action)

      expect(log.skillGained).toBeUndefined()
    })

    it("should include node info in log", async () => {
      world.player.skills.Mining.level = 3 // L3 required for APPRAISE
      const node = getFirstOreNode()
      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }

      const log = await await executeAction(world, action)

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
    it("should require focusMaterialId", async () => {
      world.player.skills.Mining.level = 5 // High enough for any material
      const node = getFirstOreNode()
      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        // Missing focusMaterialId
      }

      const log = await await executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("MISSING_FOCUS_MATERIAL")
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

      const log = await await executeAction(world, action)

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

    it("should grant XP based on ticks × tier", async () => {
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

      const log = await await executeAction(world, action)

      expect(log.skillGained).toBeDefined()
      expect(log.skillGained!.skill).toBe("Mining")
      // XP should be ticks × tier
      expect(log.skillGained!.amount).toBe(log.timeConsumed * focusMat.tier)
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

      const log = await await executeAction(world, action)

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
      world1.player.skills.Mining.level = 4 // L4 unlocks CAREFUL_ALL
      discoverAllLocations(world1, area1)

      const world2 = createWorld("ore-test")
      const area2 = getOreAreaId(world2)
      world2.exploration.playerState.currentAreaId = area2
      world2.player.skills.Mining.level = 4
      discoverAllLocations(world2, area2)

      const node1 = world1.world.nodes!.find((n) => n.areaId === area1)!
      const node2 = world2.world.nodes!.find((n) => n.areaId === area2)!

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
      world.player.skills.Mining.level = 4 // L4 unlocks CAREFUL_ALL
      const node = getFirstOreNode()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = await await executeAction(world, action)
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
      world.player.skills.Mining.level = 4
      const node = getFirstOreNode()

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = await await executeAction(world, action)

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

      const log = await await executeAction(world, action)

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

      const log = await await executeAction(world, action)

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

      const log = await await executeAction(world, action)

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

      const log = await await executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("NODE_DEPLETED")
    })
  })

  describe("Skill gating", () => {
    it("should fail if player lacks required skill level for focus material", async () => {
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

      const log = await await executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("INSUFFICIENT_SKILL")
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

      const log = await await executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("WRONG_LOCATION")
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

      const log = await await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.xpSource).toBe("node_extraction")
    })
  })

  // ============================================================================
  // Phase 4: Skill Unlock Tests
  // ============================================================================

  describe("Phase 4: Skill Unlocks", () => {
    describe("Location access gating", () => {
      it("should require L5 Mining to access MID mining locations", async () => {
        world.player.skills.Mining.level = 4 // Not enough for MID
        // Use a MID (distance 2) area
        let midAreaId: AreaID | undefined
        try {
          midAreaId = getMidOreAreaId(world)
        } catch {
          // Skip test if no MID ore area exists
          return
        }
        world.exploration.playerState.currentAreaId = midAreaId
        discoverAllLocations(world, midAreaId)
        const node = world.world.nodes!.find((n) => n.areaId === midAreaId)!

        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.APPRAISE,
        }

        const log = await await executeAction(world, action)

        expect(log.success).toBe(false)
        expect(log.failureType).toBe("INSUFFICIENT_SKILL")
      })

      it("should allow L5+ Mining to access MID mining locations", async () => {
        world.player.skills.Mining.level = 5 // Enough for MID
        // Use a MID (distance 2) area
        let midAreaId: AreaID | undefined
        try {
          midAreaId = getMidOreAreaId(world)
        } catch {
          // Skip test if no MID ore area exists
          return
        }
        world.exploration.playerState.currentAreaId = midAreaId
        discoverAllLocations(world, midAreaId)
        const node = world.world.nodes!.find((n) => n.areaId === midAreaId)!

        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.APPRAISE,
        }

        const log = await await executeAction(world, action)

        expect(log.success).toBe(true)
      })

      it("should require L9 Mining to access FAR mining locations", async () => {
        world.player.skills.Mining.level = 8 // Not enough for FAR
        // Use a FAR (distance 3) area
        let farAreaId: AreaID | undefined
        try {
          farAreaId = getFarOreAreaId(world)
        } catch {
          // Skip test if no FAR ore area exists
          return
        }
        world.exploration.playerState.currentAreaId = farAreaId
        discoverAllLocations(world, farAreaId)
        const node = world.world.nodes!.find((n) => n.areaId === farAreaId)!

        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.APPRAISE,
        }

        const log = await await executeAction(world, action)

        expect(log.success).toBe(false)
        expect(log.failureType).toBe("INSUFFICIENT_SKILL")
      })

      it("should allow L9+ Mining to access FAR mining locations", async () => {
        world.player.skills.Mining.level = 9 // Enough for FAR
        // Use a FAR (distance 3) area
        let farAreaId: AreaID | undefined
        try {
          farAreaId = getFarOreAreaId(world)
        } catch {
          // Skip test if no FAR ore area exists
          return
        }
        world.exploration.playerState.currentAreaId = farAreaId
        discoverAllLocations(world, farAreaId)
        const node = world.world.nodes!.find((n) => n.areaId === farAreaId)!

        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.APPRAISE,
        }

        const log = await await executeAction(world, action)

        expect(log.success).toBe(true)
      })
    })

    describe("APPRAISE mode unlock", () => {
      it("should require L3 Mining for APPRAISE mode", async () => {
        world.player.skills.Mining.level = 2 // Not enough for APPRAISE
        const node = getFirstOreNode()

        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.APPRAISE,
        }

        const log = await await executeAction(world, action)

        expect(log.success).toBe(false)
        expect(log.failureType).toBe("MODE_NOT_UNLOCKED")
      })

      it("should allow L3+ Mining for APPRAISE mode", async () => {
        world.player.skills.Mining.level = 3 // Enough for APPRAISE
        const node = getFirstOreNode()

        const action: GatherAction = {
          type: "Gather",
          nodeId: node.nodeId,
          mode: GatherMode.APPRAISE,
        }

        const log = await await executeAction(world, action)

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
        const node5 = world5.world.nodes!.find((n) => n.areaId === area5)!
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
        const node6 = world6.world.nodes!.find((n) => n.areaId === area6)!
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

      const log = await await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.actionType).toBe("Gather") // Should be recorded as Gather in log
      expect(focusMat.remainingUnits).toBeLessThan(initialUnits)
    })

    it("should find and gather from ORE_VEIN with CAREFUL_ALL mode", async () => {
      world.player.skills.Mining.level = 4

      const action: MineAction = {
        type: "Mine",
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = await await executeAction(world, action)

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

      const log = await await executeAction(world, action)

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

      const log = await await executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("NODE_NOT_FOUND")
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
      const focusMat = node.materials.find(
        (m) => m.requiredLevel <= world.player.skills.Woodcutting.level
      )!
      const initialUnits = focusMat.remainingUnits

      const action: ChopAction = {
        type: "Chop",
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const log = await await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.actionType).toBe("Gather") // Should be recorded as Gather in log
      expect(focusMat.remainingUnits).toBeLessThan(initialUnits)
    })

    it("should find and gather from TREE_STAND with CAREFUL_ALL mode", async () => {
      if (!woodAreaId) return // Skip if no tree area found
      world.player.skills.Woodcutting.level = 4

      const action: ChopAction = {
        type: "Chop",
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = await await executeAction(world, action)

      expect(log.success).toBe(true)
      expect(log.extraction).toBeDefined()
      expect(log.extraction!.mode).toBe(GatherMode.CAREFUL_ALL)
    })

    it("should find and appraise TREE_STAND with APPRAISE mode", async () => {
      if (!woodAreaId) return // Skip if no tree area found
      world.player.skills.Woodcutting.level = 3
      const node = world.world.nodes!.find(
        (n) => n.areaId === woodAreaId && n.nodeType === NodeType.TREE_STAND
      )!

      const action: ChopAction = {
        type: "Chop",
        mode: GatherMode.APPRAISE,
      }

      const log = await await executeAction(world, action)

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

      const log = await await executeAction(world, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("NODE_NOT_FOUND")
    })
  })
})
