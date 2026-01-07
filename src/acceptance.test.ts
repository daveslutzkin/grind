/**
 * Acceptance Tests for Gathering MVP
 *
 * These tests verify the spec requirements from design-docs/spec-gathering-mvp.md
 */

import { executeAction } from "./engine.js"
import { createWorld } from "./world.js"
import {
  GatherMode,
  NodeType,
  type GatherAction,
  type MoveAction,
  type WorldState,
  type AreaID,
} from "./types.js"

/**
 * Test helpers for procedural area IDs
 */

/** Get a distance-1 area that has ore nodes */
function getOreAreaId(state: WorldState): AreaID {
  for (const area of state.exploration.areas.values()) {
    if (area.distance === 1) {
      const hasOre = state.world.nodes?.some(
        (n) => n.areaId === area.id && n.nodeType === NodeType.ORE_VEIN
      )
      if (hasOre) return area.id
    }
  }
  throw new Error("No ore area found")
}

/** Get a distance-2 (MID) area that has ore nodes */
function getMidOreAreaId(state: WorldState): AreaID {
  for (const area of state.exploration.areas.values()) {
    if (area.distance === 2) {
      const hasOre = state.world.nodes?.some(
        (n) => n.areaId === area.id && n.nodeType === NodeType.ORE_VEIN
      )
      if (hasOre) return area.id
    }
  }
  throw new Error("No MID ore area found")
}

/** Make an area and its connection from TOWN known */
function makeAreaKnown(state: WorldState, areaId: AreaID): void {
  if (!state.exploration.playerState.knownAreaIds.includes(areaId)) {
    state.exploration.playerState.knownAreaIds.push(areaId)
  }
  const connectionId = `TOWN->${areaId}`
  if (!state.exploration.playerState.knownConnectionIds.includes(connectionId)) {
    state.exploration.playerState.knownConnectionIds.push(connectionId)
  }
}

describe("Acceptance Tests: Gathering MVP", () => {
  // ============================================================================
  // Geography
  // ============================================================================

  describe("Geography", () => {
    it("should have fixed travel time that is never modified by skills", () => {
      // Create two worlds with different skill levels
      const world1 = createWorld("travel-test")
      world1.player.skills.Mining.level = 1
      world1.exploration.playerState.currentAreaId = "TOWN"
      // Get and make ore area known
      const oreAreaId = getOreAreaId(world1)
      makeAreaKnown(world1, oreAreaId)

      const world2 = createWorld("travel-test")
      world2.player.skills.Mining.level = 10
      world2.exploration.playerState.currentAreaId = "TOWN"
      // Use the same area ID for comparison
      makeAreaKnown(world2, oreAreaId)

      // Travel to the same destination
      const moveAction: MoveAction = { type: "Move", destination: oreAreaId }

      const log1 = executeAction(world1, moveAction)
      const log2 = executeAction(world2, moveAction)

      // Travel time should be identical regardless of skill level
      expect(log1.timeConsumed).toBe(log2.timeConsumed)
      expect(log1.success).toBe(true)
      expect(log2.success).toBe(true)
    })
  })

  // ============================================================================
  // Node Persistence
  // ============================================================================

  describe("Node Persistence", () => {
    it("should reduce reserves when extracting and persist changes", () => {
      const world = createWorld("persist-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      world.player.skills.Mining.level = 5

      const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!
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

      executeAction(world, action)

      // Reserves should be reduced
      expect(focusMat.remainingUnits).toBeLessThan(initialUnits)

      // Execute again - should still work on same node with reduced reserves
      const secondUnits = focusMat.remainingUnits
      executeAction(world, action)

      expect(focusMat.remainingUnits).toBeLessThan(secondUnits)
    })

    it("should never regenerate node materials", () => {
      const world = createWorld("regen-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      world.player.skills.Mining.level = 5

      const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!
      const focusMat = node.materials.find(
        (m) => m.requiredLevel <= world.player.skills.Mining.level
      )!

      // Extract multiple times
      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const unitsAfterFirst = focusMat.remainingUnits
      executeAction(world, action)
      const unitsAfterSecond = focusMat.remainingUnits
      executeAction(world, action)
      const unitsAfterThird = focusMat.remainingUnits

      // Units should only decrease, never increase
      expect(unitsAfterSecond).toBeLessThan(unitsAfterFirst)
      expect(unitsAfterThird).toBeLessThan(unitsAfterSecond)
    })
  })

  // ============================================================================
  // Multi-Material and Destruction
  // ============================================================================

  describe("Multi-Material and Destruction", () => {
    it("should have nodes contain at least 2 materials in most cases", () => {
      const world = createWorld("multi-mat-test")
      const allNodes = world.world.nodes!

      // Count nodes with 2+ materials
      const multiMaterialNodes = allNodes.filter((n) => n.materials.length >= 2)

      // Most nodes should have 2+ materials
      expect(multiMaterialNodes.length / allNodes.length).toBeGreaterThanOrEqual(0.5)
    })

    it("should cause collateral damage with FOCUS mode", () => {
      const world = createWorld("collateral-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      world.player.skills.Mining.level = 5

      const node = world.world.nodes!.find(
        (n) => n.areaId === oreAreaId && n.materials.length >= 2
      )!
      expect(node.materials.length).toBeGreaterThanOrEqual(2)

      const focusMat = node.materials.find(
        (m) => m.requiredLevel <= world.player.skills.Mining.level
      )!
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

    it("should NOT cause collateral damage with CAREFUL_ALL mode", () => {
      const world = createWorld("collateral-test") // Use same seed as collateral test
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      world.player.skills.Mining.level = 5 // L4+ for CAREFUL_ALL

      const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = executeAction(world, action)
      expect(log.success).toBe(true)

      // Collateral damage should be 0
      expect(log.extraction!.collateralDamage).toBeDefined()
      const totalCollateral = Object.values(log.extraction!.collateralDamage).reduce(
        (sum, v) => sum + v,
        0
      )
      expect(totalCollateral).toBe(0)
    })
  })

  // ============================================================================
  // Focus Yield and Collateral Damage
  // ============================================================================

  describe("Focus Yield Progression", () => {
    it("should have focus waste decrease with level and reach 0% at mastery", () => {
      const world1 = createWorld("yield-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world1)
      makeAreaKnown(world1, oreAreaId)
      world1.exploration.playerState.currentAreaId = oreAreaId
      world1.player.skills.Mining.level = 1

      const world10 = createWorld("yield-test")
      // Use the same area for comparison
      makeAreaKnown(world10, oreAreaId)
      world10.exploration.playerState.currentAreaId = oreAreaId
      world10.player.skills.Mining.level = 10

      const node1 = world1.world.nodes!.find((n) => n.areaId === oreAreaId)!
      const node10 = world10.world.nodes!.find((n) => n.areaId === oreAreaId)!

      const focusMat1 = node1.materials.find((m) => m.requiredLevel === 1)!
      const focusMat10 = node10.materials.find((m) => m.requiredLevel === 1)!

      const action1: GatherAction = {
        type: "Gather",
        nodeId: node1.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat1.materialId,
      }

      const action10: GatherAction = {
        type: "Gather",
        nodeId: node10.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat10.materialId,
      }

      const log1 = executeAction(world1, action1)
      const log10 = executeAction(world10, action10)

      // L1 should have significant waste (~60%)
      expect(log1.extraction!.focusWaste).toBeGreaterThan(0.3)

      // L10 should have 0% waste (perfect focus)
      expect(log10.extraction!.focusWaste).toBe(0)
    })

    it("should have collateral damage with hard floor at high levels", () => {
      const world = createWorld("floor-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      world.player.skills.Mining.level = 10 // Max level

      const node = world.world.nodes!.find(
        (n) => n.areaId === oreAreaId && n.materials.length >= 2
      )!
      const focusMat = node.materials[0]
      const collateralMat = node.materials.find((m) => m.materialId !== focusMat.materialId)!

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const log = executeAction(world, action)

      // Even at L10, there should be some collateral damage (20% floor)
      const collateralDamage = log.extraction!.collateralDamage[collateralMat.materialId] ?? 0
      expect(collateralDamage).toBeGreaterThan(0)
    })
  })

  // ============================================================================
  // Variance
  // ============================================================================

  describe("Variance", () => {
    it("should have extraction yield vary around expected value", () => {
      const world = createWorld("variance-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      world.player.skills.Mining.level = 5

      const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!
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

      // Variance info should be present
      expect(log.extraction!.variance).toBeDefined()
      expect(log.extraction!.variance!.expected).toBeDefined()
      expect(log.extraction!.variance!.actual).toBeDefined()
      expect(log.extraction!.variance!.range).toBeDefined()
      expect(log.extraction!.variance!.range.length).toBe(2)
    })

    it("should show variance info explicitly (EV, range, actual vs expected)", () => {
      const world = createWorld("explicit-variance-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      world.player.skills.Mining.level = 5

      const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!
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

      // Variance should include expected, actual, and range
      const variance = log.extraction!.variance!
      expect(typeof variance.expected).toBe("number")
      expect(typeof variance.actual).toBe("number")
      expect(Array.isArray(variance.range)).toBe(true)
      // Use toBeCloseTo for floating point comparisons
      expect(variance.range[0]).toBeLessThanOrEqual(variance.expected + 0.01)
      expect(variance.range[1]).toBeGreaterThanOrEqual(variance.expected - 0.01)
    })
  })

  // ============================================================================
  // Progression
  // ============================================================================

  describe("Progression", () => {
    it("should unlock new actions at specific levels", () => {
      const world = createWorld("unlock-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!

      // L2: APPRAISE should fail
      world.player.skills.Mining.level = 2
      const appraiseAction: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }
      const failLog = executeAction(world, appraiseAction)
      expect(failLog.success).toBe(false)
      expect(failLog.failureType).toBe("MODE_NOT_UNLOCKED")

      // L3: APPRAISE should succeed
      world.player.skills.Mining.level = 3
      const successLog = executeAction(world, appraiseAction)
      expect(successLog.success).toBe(true)
    })

    it("should unlock locations at specific levels", () => {
      const world = createWorld("location-unlock-test")
      // Get a MID area (distance 2) that has ore
      const midAreaId = getMidOreAreaId(world)
      makeAreaKnown(world, midAreaId)
      world.exploration.playerState.currentAreaId = midAreaId
      const node = world.world.nodes!.find((n) => n.areaId === midAreaId)!

      // L4: MID should fail (requires L5) - use APPRAISE to avoid material level issues
      world.player.skills.Mining.level = 4
      const appraiseAction: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }
      const failLog = executeAction(world, appraiseAction)
      expect(failLog.success).toBe(false)
      expect(failLog.failureType).toBe("INSUFFICIENT_SKILL")

      // L5: MID should succeed
      world.player.skills.Mining.level = 5
      const successLog = executeAction(world, appraiseAction)
      expect(successLog.success).toBe(true)
    })
  })

  // ============================================================================
  // XP Model
  // ============================================================================

  describe("XP Model", () => {
    it("should calculate XP based on ticks × tier, not units extracted", () => {
      const world = createWorld("xp-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      world.player.skills.Mining.level = 5

      const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!
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

      // XP should be ticks × tier
      expect(log.skillGained).toBeDefined()
      expect(log.skillGained!.amount).toBe(log.timeConsumed * focusMat.tier)
    })

    it("should not double-punish bad RNG (yield varies, XP stays constant)", () => {
      // Use two different seeds to get different RNG outcomes
      const world1 = createWorld("xp-rng-1")
      // Get ore area and make it known
      const oreAreaId1 = getOreAreaId(world1)
      makeAreaKnown(world1, oreAreaId1)
      world1.exploration.playerState.currentAreaId = oreAreaId1
      world1.player.skills.Mining.level = 5

      const world2 = createWorld("xp-rng-2")
      // Get ore area for this world
      const oreAreaId2 = getOreAreaId(world2)
      makeAreaKnown(world2, oreAreaId2)
      world2.exploration.playerState.currentAreaId = oreAreaId2
      world2.player.skills.Mining.level = 5

      const node1 = world1.world.nodes!.find((n) => n.areaId === oreAreaId1)!
      const node2 = world2.world.nodes!.find((n) => n.areaId === oreAreaId2)!

      // Find matching materials (same tier)
      const focusMat1 = node1.materials.find(
        (m) => m.requiredLevel <= world1.player.skills.Mining.level
      )!
      const focusMat2 = node2.materials.find((m) => m.materialId === focusMat1.materialId)

      // If the same material exists in both worlds
      if (focusMat2) {
        const action1: GatherAction = {
          type: "Gather",
          nodeId: node1.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: focusMat1.materialId,
        }

        const action2: GatherAction = {
          type: "Gather",
          nodeId: node2.nodeId,
          mode: GatherMode.FOCUS,
          focusMaterialId: focusMat2.materialId,
        }

        const log1 = executeAction(world1, action1)
        const log2 = executeAction(world2, action2)

        // Yields may differ due to RNG
        // But XP should be based on ticks × tier (constant for same tier)
        expect(log1.skillGained!.amount).toBe(log1.timeConsumed * focusMat1.tier)
        expect(log2.skillGained!.amount).toBe(log2.timeConsumed * focusMat2.tier)

        // If tiers match, XP should be the same even if yields differ
        if (focusMat1.tier === focusMat2.tier) {
          expect(log1.skillGained!.amount).toBe(log2.skillGained!.amount)
        }
      }
    })
  })
})
