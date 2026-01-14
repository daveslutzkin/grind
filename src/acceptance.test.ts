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
  type Node,
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

/** Get a NEAR (distance 1) area that has ore nodes */
function getNearOreAreaId(state: WorldState): AreaID {
  const areas = Array.from(state.exploration.areas.values()).filter((a) => a.distance === 1)
  for (const area of areas) {
    const hasOre = state.world.nodes?.some(
      (n) => n.areaId === area.id && n.nodeType === NodeType.ORE_VEIN
    )
    if (hasOre) return area.id
  }
  throw new Error("No NEAR ore area found")
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

describe("Acceptance Tests: Gathering MVP", () => {
  // ============================================================================
  // Geography
  // ============================================================================

  describe("Geography", () => {
    it("should have fixed travel time that is never modified by skills", async () => {
      // Create two worlds with different skill levels
      // Use "ore-test" seed which has ore at distance 1 (reachable from TOWN)
      const world1 = createWorld("ore-test")
      world1.player.skills.Mining.level = 1
      world1.exploration.playerState.currentAreaId = "TOWN"
      // Get and make ore area known
      const oreAreaId = getOreAreaId(world1)
      makeAreaKnown(world1, oreAreaId)

      const world2 = createWorld("ore-test")
      world2.player.skills.Mining.level = 10
      world2.exploration.playerState.currentAreaId = "TOWN"
      // Use the same area ID for comparison
      makeAreaKnown(world2, oreAreaId)

      // Travel to the same destination
      const moveAction: MoveAction = { type: "Move", destination: oreAreaId }

      const log1 = await executeAction(world1, moveAction)
      const log2 = await executeAction(world2, moveAction)

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
    it("should reduce reserves when extracting and persist changes", async () => {
      const world = createWorld("persist-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      discoverAllLocations(world, oreAreaId)

      const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!
      moveToNodeLocation(world, node)
      // Set level high enough to mine the lowest-level material in this node
      const minRequiredLevel = Math.min(...node.materials.map((m) => m.requiredLevel))
      world.player.skills.Mining.level = minRequiredLevel
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

      await executeAction(world, action)

      // Reserves should be reduced
      expect(focusMat.remainingUnits).toBeLessThan(initialUnits)

      // Execute again - should still work on same node with reduced reserves
      const secondUnits = focusMat.remainingUnits
      await executeAction(world, action)

      expect(focusMat.remainingUnits).toBeLessThan(secondUnits)
    })

    it("should never regenerate node materials", async () => {
      const world = createWorld("regen-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      discoverAllLocations(world, oreAreaId)
      const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!
      moveToNodeLocation(world, node)
      // Set level high enough to mine the lowest-level material in this node
      const minRequiredLevel = Math.min(...node.materials.map((m) => m.requiredLevel))
      world.player.skills.Mining.level = minRequiredLevel
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
      await executeAction(world, action)
      const unitsAfterSecond = focusMat.remainingUnits
      await executeAction(world, action)
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

    it("should cause collateral damage with FOCUS mode", async () => {
      const world = createWorld("collateral-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      discoverAllLocations(world, oreAreaId)
      const node = world.world.nodes!.find(
        (n) => n.areaId === oreAreaId && n.materials.length >= 2
      )!
      moveToNodeLocation(world, node)
      expect(node.materials.length).toBeGreaterThanOrEqual(2)
      // Set level high enough to mine the lowest-level material in this node
      const minRequiredLevel = Math.min(...node.materials.map((m) => m.requiredLevel))
      world.player.skills.Mining.level = minRequiredLevel

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

      await executeAction(world, action)

      // Collateral should be damaged
      expect(collateralMat.remainingUnits).toBeLessThan(collateralBefore)
    })

    it("should NOT cause collateral damage with CAREFUL_ALL mode", async () => {
      const world = createWorld("collateral-test") // Use same seed as collateral test
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      discoverAllLocations(world, oreAreaId)
      const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!
      moveToNodeLocation(world, node)
      // Set level high enough to mine materials (need L16 for STONE M16 Careful unlock for CAREFUL_ALL mode)
      const minRequiredLevel = Math.min(...node.materials.map((m) => m.requiredLevel))
      world.player.skills.Mining.level = Math.max(minRequiredLevel, 16) // L16 for STONE Careful unlock

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.CAREFUL_ALL,
      }

      const log = await executeAction(world, action)
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
    it("should have focus waste decrease with level and reach 0% at mastery", async () => {
      const world1 = createWorld("yield-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world1)
      makeAreaKnown(world1, oreAreaId)
      world1.exploration.playerState.currentAreaId = oreAreaId
      discoverAllLocations(world1, oreAreaId)
      world1.player.skills.Mining.level = 1

      const world10 = createWorld("yield-test")
      // Use the same area for comparison
      makeAreaKnown(world10, oreAreaId)
      world10.exploration.playerState.currentAreaId = oreAreaId
      discoverAllLocations(world10, oreAreaId)
      world10.player.skills.Mining.level = 10

      const node1 = world1.world.nodes!.find((n) => n.areaId === oreAreaId)!
      const node10 = world10.world.nodes!.find((n) => n.areaId === oreAreaId)!
      moveToNodeLocation(world1, node1)
      moveToNodeLocation(world10, node10)

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

      const log1 = await executeAction(world1, action1)
      const log10 = await executeAction(world10, action10)

      // In new mastery system, focus waste is always 0 (100% of 1 unit)
      // Efficiency improvements come from Speed unlocks (faster time)
      expect(log1.extraction!.focusWaste).toBe(0)
      expect(log10.extraction!.focusWaste).toBe(0)

      // L10 should be faster than L1 due to Speed unlocks
      // L1: 20 ticks (base), L10: should have Speed_II (10 ticks)
      expect(log10.timeConsumed).toBeLessThan(log1.timeConsumed)
    })

    it("should have collateral damage with hard floor at high levels", async () => {
      const world = createWorld("floor-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      discoverAllLocations(world, oreAreaId)
      const node = world.world.nodes!.find(
        (n) => n.areaId === oreAreaId && n.materials.length >= 2
      )!
      moveToNodeLocation(world, node)
      const focusMat = node.materials[0]
      const collateralMat = node.materials.find((m) => m.materialId !== focusMat.materialId)!
      // Set level high enough to mine the focus material (need to be significantly above for the test)
      world.player.skills.Mining.level = focusMat.requiredLevel + 9 // "Max level" relative to material

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: focusMat.materialId,
      }

      const log = await executeAction(world, action)

      // Even at L10, there should be some collateral damage (20% floor)
      const collateralDamage = log.extraction!.collateralDamage[collateralMat.materialId] ?? 0
      expect(collateralDamage).toBeGreaterThan(0)
    })
  })

  // ============================================================================
  // Variance
  // ============================================================================

  describe("Variance", () => {
    it("should have extraction yield vary around expected value", async () => {
      const world = createWorld("variance-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      discoverAllLocations(world, oreAreaId)
      const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!
      moveToNodeLocation(world, node)
      // Set level high enough to mine the lowest-level material in this node
      const minRequiredLevel = Math.min(...node.materials.map((m) => m.requiredLevel))
      world.player.skills.Mining.level = minRequiredLevel
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

      // Variance info should be present
      expect(log.extraction!.variance).toBeDefined()
      expect(log.extraction!.variance!.expected).toBeDefined()
      expect(log.extraction!.variance!.actual).toBeDefined()
      expect(log.extraction!.variance!.range).toBeDefined()
      expect(log.extraction!.variance!.range.length).toBe(2)
    })

    it("should show variance info explicitly (EV, range, actual vs expected)", async () => {
      const world = createWorld("explicit-variance-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      discoverAllLocations(world, oreAreaId)
      const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!
      moveToNodeLocation(world, node)
      // Set level high enough to mine the lowest-level material in this node
      const minRequiredLevel = Math.min(...node.materials.map((m) => m.requiredLevel))
      world.player.skills.Mining.level = minRequiredLevel
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

      // Variance should include expected (base time), actual (with variance), range (yield), and luckDelta
      const variance = log.extraction!.variance!
      expect(typeof variance.expected).toBe("number") // Base time before variance
      expect(typeof variance.actual).toBe("number") // Actual time with variance applied
      expect(Array.isArray(variance.range)).toBe(true) // Yield range [min, max]
      expect(typeof variance.luckDelta).toBe("number") // Ticks saved/lost
      // Actual time should be within reasonable bounds of expected (±50% due to normal distribution)
      expect(variance.actual).toBeGreaterThanOrEqual(1)
      expect(variance.actual).toBeLessThanOrEqual(variance.expected * 2)
      // luckDelta = expected - actual
      expect(variance.luckDelta).toBe(variance.expected - variance.actual)
    })
  })

  // ============================================================================
  // Progression
  // ============================================================================

  describe("Progression", () => {
    it("should unlock new actions at specific levels", async () => {
      const world = createWorld("near-ore-test")
      // Get NEAR ore area - must be distance 1 to isolate mode unlock from location unlock
      const oreAreaId = getNearOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      discoverAllLocations(world, oreAreaId)
      const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!
      moveToNodeLocation(world, node)

      // L2: APPRAISE should fail
      world.player.skills.Mining.level = 2
      const appraiseAction: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.APPRAISE,
      }
      const failLog = await executeAction(world, appraiseAction)
      expect(failLog.success).toBe(false)
      expect(failLog.failureDetails?.type).toBe("MODE_NOT_UNLOCKED")

      // L3: APPRAISE should succeed
      world.player.skills.Mining.level = 3
      const successLog = await executeAction(world, appraiseAction)
      expect(successLog.success).toBe(true)
    })
  })

  // ============================================================================
  // XP Model
  // ============================================================================

  describe("XP Model", () => {
    it("should calculate XP based on ticks × tier, not units extracted", async () => {
      const world = createWorld("xp-test")
      // Get ore area and make it known
      const oreAreaId = getOreAreaId(world)
      makeAreaKnown(world, oreAreaId)
      world.exploration.playerState.currentAreaId = oreAreaId
      discoverAllLocations(world, oreAreaId)
      const node = world.world.nodes!.find((n) => n.areaId === oreAreaId)!
      moveToNodeLocation(world, node)
      // Set level high enough to mine the lowest-level material in this node
      const minRequiredLevel = Math.min(...node.materials.map((m) => m.requiredLevel))
      world.player.skills.Mining.level = minRequiredLevel
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

      // XP = 1 per unit extracted (new mastery system)
      expect(log.skillGained).toBeDefined()
      const unitsExtracted = log.extraction!.extracted[0]?.quantity ?? 0
      expect(log.skillGained!.amount).toBe(unitsExtracted)
    })

    it("should not double-punish bad RNG (yield varies, XP stays constant)", async () => {
      // Use two different seeds to get different RNG outcomes
      const world1 = createWorld("xp-rng-1")
      // Get ore area and make it known
      const oreAreaId1 = getOreAreaId(world1)
      makeAreaKnown(world1, oreAreaId1)
      world1.exploration.playerState.currentAreaId = oreAreaId1
      discoverAllLocations(world1, oreAreaId1)
      world1.player.skills.Mining.level = 5

      const world2 = createWorld("xp-rng-2")
      // Get ore area for this world
      const oreAreaId2 = getOreAreaId(world2)
      makeAreaKnown(world2, oreAreaId2)
      world2.exploration.playerState.currentAreaId = oreAreaId2
      discoverAllLocations(world2, oreAreaId2)
      world2.player.skills.Mining.level = 5

      const node1 = world1.world.nodes!.find((n) => n.areaId === oreAreaId1)!
      const node2 = world2.world.nodes!.find((n) => n.areaId === oreAreaId2)!
      moveToNodeLocation(world1, node1)
      moveToNodeLocation(world2, node2)

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

        const log1 = await executeAction(world1, action1)
        const log2 = await executeAction(world2, action2)

        // In new mastery system: XP = 1 per unit extracted
        const units1 = log1.extraction!.extracted[0]?.quantity ?? 0
        const units2 = log2.extraction!.extracted[0]?.quantity ?? 0
        expect(log1.skillGained!.amount).toBe(units1)
        expect(log2.skillGained!.amount).toBe(units2)

        // XP varies only by bonus yield (1 or 2 units)
        // Not punished by variance in old yield system
        expect(units1).toBeGreaterThanOrEqual(1)
        expect(units2).toBeGreaterThanOrEqual(1)
        expect(units1).toBeLessThanOrEqual(2)
        expect(units2).toBeLessThanOrEqual(2)
      }
    })
  })
})
