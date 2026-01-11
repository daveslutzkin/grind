/**
 * Tests for World Factory
 *
 * Tests for world creation with:
 * - Procedural areas with Fibonacci counts per distance
 * - Material definitions with tiers
 * - Node generation with multi-material reserves
 */

import { createWorld, MATERIALS } from "./world.js"
import { NodeType, type Node } from "./types.js"

describe("World Factory", () => {
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

  describe("createWorld", () => {
    it("should create a valid world state", () => {
      const world = createWorld("test-seed")

      expect(world.time.currentTick).toBe(0)
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

    it("should have 27 areas in exploration system (Fibonacci counts)", () => {
      const world = createWorld("test-seed")

      // 1 TOWN + 5 distance-1 + 8 distance-2 + 13 distance-3 = 27 areas
      expect(world.exploration.areas.size).toBe(27)
    })

    it("should generate nodes for each gathering area", () => {
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

    it("should generate nodes with procedural area IDs", () => {
      const world = createWorld("test-seed")

      // All nodes should be in areas with procedural IDs (area-d{distance}-i{index})
      world.world.nodes!.forEach((node: Node) => {
        expect(node.areaId).toMatch(/^area-d\d+-i\d+$/)
      })
    })

    it("should generate both ore and tree nodes", () => {
      const world = createWorld("test-seed")

      const oreNodes = world.world.nodes!.filter((n: Node) => n.nodeType === NodeType.ORE_VEIN)
      const treeNodes = world.world.nodes!.filter((n: Node) => n.nodeType === NodeType.TREE_STAND)

      // Should have some of each type
      expect(oreNodes.length).toBeGreaterThan(0)
      expect(treeNodes.length).toBeGreaterThan(0)
    })

    it("should not generate FAR-only materials in NEAR areas (distance 1)", () => {
      const world = createWorld("test-seed")

      // Find materials that require L9+ (FAR-only)
      const farOnlyMaterials = Object.entries(MATERIALS)
        .filter(([_, m]) => m.requiredLevel >= 9)
        .map(([id]) => id)

      // Get all distance-1 areas
      const distance1AreaIds = Array.from(world.exploration.areas.values())
        .filter((area) => area.distance === 1)
        .map((area) => area.id)

      const nearNodes = world.world.nodes!.filter((n: Node) => distance1AreaIds.includes(n.areaId))

      nearNodes.forEach((node: Node) => {
        node.materials.forEach((mat) => {
          expect(farOnlyMaterials).not.toContain(mat.materialId)
        })
      })
    })

    it("should only know TOWN at start", () => {
      const world = createWorld("test-seed")

      expect(world.exploration.playerState.knownAreaIds).toEqual(["TOWN"])
      expect(world.exploration.playerState.knownConnectionIds).toEqual([])
    })
  })
})
