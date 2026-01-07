/**
 * TDD Tests for Phase 2: World Factory
 *
 * Tests for gathering world creation with:
 * - 7 areas with distance bands
 * - Material definitions with tiers
 * - Node generation with multi-material reserves
 */

import { createWorld, MATERIALS } from "./world.js"
import { NodeType, type Node } from "./types.js"

describe("Phase 2: World Factory", () => {
  // NOTE: LOCATIONS constant no longer exported - areas are now in exploration system
  describe.skip("LOCATIONS constant (deprecated - now using exploration system)", () => {
    it("should have 7 locations", () => {
      // Skip - LOCATIONS no longer exported
    })
  })

  describe("MATERIALS constant", () => {
    it("should have mining materials with tiers 1-5", () => {
      const miningMats = Object.entries(MATERIALS).filter(([_, m]) => m.skill === "Mining")
      expect(miningMats.length).toBeGreaterThanOrEqual(5)

      const tiers = miningMats.map(([_, m]) => m.tier)
      expect(tiers).toContain(1)
      expect(tiers).toContain(2)
      expect(tiers).toContain(3)
    })

    it("should have woodcutting materials with tiers 1-5", () => {
      const woodMats = Object.entries(MATERIALS).filter(([_, m]) => m.skill === "Woodcutting")
      expect(woodMats.length).toBeGreaterThanOrEqual(5)
    })

    it("should have required levels that increase with tier", () => {
      const tier1 = Object.values(MATERIALS).filter((m) => m.tier === 1)
      const tier3 = Object.values(MATERIALS).filter((m) => m.tier === 3)

      // Tier 1 materials should require lower levels
      tier1.forEach((m) => expect(m.requiredLevel).toBeLessThanOrEqual(2))
      // Tier 3+ materials should require higher levels
      tier3.forEach((m) => expect(m.requiredLevel).toBeGreaterThanOrEqual(5))
    })
  })

  // NOTE: generateTravelCosts no longer exported - now using exploration connections
  describe.skip("generateTravelCosts (deprecated - now using exploration system)", () => {
    it("should generate costs between all location pairs", () => {
      // Skip - generateTravelCosts no longer exported
    })
  })

  describe("createWorld", () => {
    it("should create a valid world state", () => {
      const world = createWorld("test-seed")

      expect(world.time.currentTick).toBe(0)
      expect(world.time.sessionRemainingTicks).toBeGreaterThan(0)
      expect(world.exploration.playerState.currentAreaId).toBe("TOWN")
    })

    it("should have all 6 skills initialized at level 0", () => {
      const world = createWorld("test-seed")

      expect(world.player.skills.Mining.level).toBe(0)
      expect(world.player.skills.Woodcutting.level).toBe(0)
      expect(world.player.skills.Combat.level).toBe(0)
      expect(world.player.skills.Smithing.level).toBe(0)
      expect(world.player.skills.Woodcrafting.level).toBe(0)
      expect(world.player.skills.Exploration.level).toBe(0)
    })

    it("should have 7 areas in exploration system", () => {
      const world = createWorld("test-seed")

      // Areas are now in the exploration system
      expect(world.exploration.areas.size).toBe(7)
    })

    it.skip("should have travel costs for all location pairs", () => {
      // Skip - travel costs no longer used, now using exploration connections
    })

    it("should generate nodes for each gathering location", () => {
      const world = createWorld("test-seed")

      // Should have nodes (stored in world.world.nodes)
      expect(world.world.nodes).toBeDefined()
      expect(world.world.nodes!.length).toBeGreaterThan(0)
    })

    it("should generate nodes deterministically based on seed", () => {
      const world1 = createWorld("seed-123")
      const world2 = createWorld("seed-123")
      const world3 = createWorld("different-seed")

      // Same seed should produce same nodes
      expect(world1.world.nodes).toEqual(world2.world.nodes)

      // Different seed should produce different nodes
      expect(world1.world.nodes).not.toEqual(world3.world.nodes)
    })

    it("should generate nodes with 2+ materials", () => {
      const world = createWorld("test-seed")

      world.world.nodes!.forEach((node: Node) => {
        expect(node.materials.length).toBeGreaterThanOrEqual(2)
      })
    })

    it("should generate ore nodes in mining areas", () => {
      const world = createWorld("test-seed")

      const miningAreaIds = ["OUTSKIRTS_MINE", "OLD_QUARRY", "ABANDONED_SHAFT"]

      const oreNodes = world.world.nodes!.filter((n: Node) => n.nodeType === NodeType.ORE_VEIN)

      oreNodes.forEach((node: Node) => {
        expect(miningAreaIds).toContain(node.areaId)
      })
    })

    it("should generate tree nodes in woodcutting areas", () => {
      const world = createWorld("test-seed")

      const woodAreaIds = ["COPSE", "DEEP_FOREST", "ANCIENT_GROVE"]

      const treeNodes = world.world.nodes!.filter((n: Node) => n.nodeType === NodeType.TREE_STAND)

      treeNodes.forEach((node: Node) => {
        expect(woodAreaIds).toContain(node.areaId)
      })
    })

    it("should not generate FAR-only materials in NEAR areas", () => {
      const world = createWorld("test-seed")

      const nearAreaIds = ["OUTSKIRTS_MINE", "COPSE"]

      // Find materials that require L9+ (FAR-only)
      const farOnlyMaterials = Object.entries(MATERIALS)
        .filter(([_, m]) => m.requiredLevel >= 9)
        .map(([id]) => id)

      const nearNodes = world.world.nodes!.filter((n: Node) => nearAreaIds.includes(n.areaId))

      nearNodes.forEach((node: Node) => {
        node.materials.forEach((mat) => {
          expect(farOnlyMaterials).not.toContain(mat.materialId)
        })
      })
    })
  })
})
