/**
 * Acceptance Tests for Gathering MVP
 *
 * These tests verify the spec requirements from design-docs/spec-gathering-mvp.md
 */

import { executeAction } from "./engine.js"
import { createWorld } from "./world.js"
import { GatherMode, type GatherAction, type MoveAction } from "./types.js"

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
      // Make OUTSKIRTS_MINE known
      world1.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      world1.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")

      const world2 = createWorld("travel-test")
      world2.player.skills.Mining.level = 10
      world2.exploration.playerState.currentAreaId = "TOWN"
      // Make OUTSKIRTS_MINE known
      world2.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      world2.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")

      // Travel to the same destination
      const moveAction: MoveAction = { type: "Move", destination: "OUTSKIRTS_MINE" }

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
      // Make OUTSKIRTS_MINE known
      world.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      world.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      world.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      world.player.skills.Mining.level = 5

      const node = world.world.nodes!.find((n) => n.areaId === "OUTSKIRTS_MINE")!
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
      // Make OUTSKIRTS_MINE known
      world.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      world.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      world.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      world.player.skills.Mining.level = 5

      const node = world.world.nodes!.find((n) => n.areaId === "OUTSKIRTS_MINE")!
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
      // Make OUTSKIRTS_MINE known
      world.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      world.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      world.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      world.player.skills.Mining.level = 5

      const node = world.world.nodes!.find(
        (n) => n.areaId === "OUTSKIRTS_MINE" && n.materials.length >= 2
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
      const world = createWorld("careful-test")
      // Make OUTSKIRTS_MINE known
      world.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      world.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      world.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      world.player.skills.Mining.level = 5 // L4+ for CAREFUL_ALL

      const node = world.world.nodes!.find((n) => n.areaId === "OUTSKIRTS_MINE")!

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
      // Make OUTSKIRTS_MINE known
      world1.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      world1.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      world1.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      world1.player.skills.Mining.level = 1

      const world10 = createWorld("yield-test")
      // Make OUTSKIRTS_MINE known
      world10.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      world10.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      world10.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      world10.player.skills.Mining.level = 10

      const node1 = world1.world.nodes!.find((n) => n.areaId === "OUTSKIRTS_MINE")!
      const node10 = world10.world.nodes!.find((n) => n.areaId === "OUTSKIRTS_MINE")!

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
      // Make OUTSKIRTS_MINE known
      world.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      world.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      world.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      world.player.skills.Mining.level = 10 // Max level

      const node = world.world.nodes!.find(
        (n) => n.areaId === "OUTSKIRTS_MINE" && n.materials.length >= 2
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
      // Make OUTSKIRTS_MINE known
      world.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      world.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      world.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      world.player.skills.Mining.level = 5

      const node = world.world.nodes!.find((n) => n.areaId === "OUTSKIRTS_MINE")!
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
      // Make OUTSKIRTS_MINE known
      world.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      world.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      world.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      world.player.skills.Mining.level = 5

      const node = world.world.nodes!.find((n) => n.areaId === "OUTSKIRTS_MINE")!
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
      expect(variance.range[0]).toBeLessThanOrEqual(variance.expected)
      expect(variance.range[1]).toBeGreaterThanOrEqual(variance.expected)
    })
  })

  // ============================================================================
  // Progression
  // ============================================================================

  describe("Progression", () => {
    it("should unlock new actions at specific levels", () => {
      const world = createWorld("unlock-test")
      // Make OUTSKIRTS_MINE known
      world.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      world.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      world.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      const node = world.world.nodes!.find((n) => n.areaId === "OUTSKIRTS_MINE")!

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
      // Make OLD_QUARRY known
      world.exploration.playerState.knownAreaIds.push("OLD_QUARRY")
      world.exploration.playerState.knownConnectionIds.push("TOWN->OLD_QUARRY")
      world.exploration.playerState.currentAreaId = "OLD_QUARRY" // MID location
      const node = world.world.nodes!.find((n) => n.areaId === "OLD_QUARRY")!

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
      // Make OUTSKIRTS_MINE known
      world.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      world.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      world.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      world.player.skills.Mining.level = 5

      const node = world.world.nodes!.find((n) => n.areaId === "OUTSKIRTS_MINE")!
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
      // Make OUTSKIRTS_MINE known
      world1.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      world1.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      world1.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      world1.player.skills.Mining.level = 5

      const world2 = createWorld("xp-rng-2")
      // Make OUTSKIRTS_MINE known
      world2.exploration.playerState.knownAreaIds.push("OUTSKIRTS_MINE")
      world2.exploration.playerState.knownConnectionIds.push("TOWN->OUTSKIRTS_MINE")
      world2.exploration.playerState.currentAreaId = "OUTSKIRTS_MINE"
      world2.player.skills.Mining.level = 5

      const node1 = world1.world.nodes!.find((n) => n.areaId === "OUTSKIRTS_MINE")!
      const node2 = world2.world.nodes!.find((n) => n.areaId === "OUTSKIRTS_MINE")!

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
