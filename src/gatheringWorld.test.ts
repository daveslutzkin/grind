/**
 * TDD Tests for Phase 2: World Factory
 *
 * Tests for gathering world creation with:
 * - 7 locations with distance bands
 * - Material definitions with tiers
 * - Node generation with multi-material reserves
 * - Travel cost generation
 */

import {
  createGatheringWorld,
  LOCATIONS,
  MATERIALS,
  generateTravelCosts,
} from "./gatheringWorld.js"
import { DistanceBand, NodeType, type Node } from "./types.js"

describe("Phase 2: World Factory", () => {
  describe("LOCATIONS constant", () => {
    it("should have 7 locations", () => {
      expect(LOCATIONS).toHaveLength(7)
    })

    it("should have TOWN with band TOWN", () => {
      const town = LOCATIONS.find((l) => l.id === "TOWN")
      expect(town).toBeDefined()
      expect(town!.band).toBe(DistanceBand.TOWN)
      expect(town!.travelTicksFromTown).toBe(0)
      expect(town!.nodePools).toEqual([])
    })

    it("should have 2 NEAR locations", () => {
      const nearLocations = LOCATIONS.filter((l) => l.band === DistanceBand.NEAR)
      expect(nearLocations).toHaveLength(2)
      // One for mining, one for woodcutting
      expect(nearLocations.some((l) => l.nodePools.includes("near_ore"))).toBe(true)
      expect(nearLocations.some((l) => l.nodePools.includes("near_trees"))).toBe(true)
    })

    it("should have 2 MID locations", () => {
      const midLocations = LOCATIONS.filter((l) => l.band === DistanceBand.MID)
      expect(midLocations).toHaveLength(2)
    })

    it("should have 2 FAR locations", () => {
      const farLocations = LOCATIONS.filter((l) => l.band === DistanceBand.FAR)
      expect(farLocations).toHaveLength(2)
    })

    it("should have increasing travel times by band", () => {
      const nearTimes = LOCATIONS.filter((l) => l.band === DistanceBand.NEAR).map(
        (l) => l.travelTicksFromTown
      )
      const midTimes = LOCATIONS.filter((l) => l.band === DistanceBand.MID).map(
        (l) => l.travelTicksFromTown
      )
      const farTimes = LOCATIONS.filter((l) => l.band === DistanceBand.FAR).map(
        (l) => l.travelTicksFromTown
      )

      const minNear = Math.min(...nearTimes)
      const minMid = Math.min(...midTimes)
      const minFar = Math.min(...farTimes)

      expect(minNear).toBeGreaterThan(0)
      expect(minMid).toBeGreaterThan(minNear)
      expect(minFar).toBeGreaterThan(minMid)
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

  describe("generateTravelCosts", () => {
    it("should generate costs between all location pairs", () => {
      const costs = generateTravelCosts(LOCATIONS)

      // Should have n*(n-1) entries for n locations (both directions)
      const expectedEntries = LOCATIONS.length * (LOCATIONS.length - 1)
      expect(Object.keys(costs)).toHaveLength(expectedEntries)
    })

    it("should have symmetric travel costs", () => {
      const costs = generateTravelCosts(LOCATIONS)

      expect(costs["TOWN->OUTSKIRTS_MINE"]).toBe(costs["OUTSKIRTS_MINE->TOWN"])
    })

    it("should calculate costs based on travelTicksFromTown", () => {
      const costs = generateTravelCosts(LOCATIONS)

      // Town to NEAR should equal the NEAR location's travelTicksFromTown
      const nearLoc = LOCATIONS.find((l) => l.band === DistanceBand.NEAR)!
      expect(costs[`TOWN->${nearLoc.id}`]).toBe(nearLoc.travelTicksFromTown)
    })
  })

  describe("createGatheringWorld", () => {
    it("should create a valid world state", () => {
      const world = createGatheringWorld("test-seed")

      expect(world.time.currentTick).toBe(0)
      expect(world.time.sessionRemainingTicks).toBeGreaterThan(0)
      expect(world.player.location).toBe("TOWN")
    })

    it("should have all 5 skills initialized at level 0", () => {
      const world = createGatheringWorld("test-seed")

      expect(world.player.skills.Mining.level).toBe(0)
      expect(world.player.skills.Woodcutting.level).toBe(0)
      expect(world.player.skills.Combat.level).toBe(0)
      expect(world.player.skills.Smithing.level).toBe(0)
      expect(world.player.skills.Woodcrafting.level).toBe(0)
    })

    it("should have 7 locations in world.locations", () => {
      const world = createGatheringWorld("test-seed")

      // For now, world.locations is still string[] for backward compat
      // The full Location objects are in a separate structure
      expect(world.world.locations).toHaveLength(7)
    })

    it("should have travel costs for all location pairs", () => {
      const world = createGatheringWorld("test-seed")

      const numCosts = Object.keys(world.world.travelCosts).length
      expect(numCosts).toBe(7 * 6) // 7 locations, each to 6 others
    })

    it("should generate nodes for each gathering location", () => {
      const world = createGatheringWorld("test-seed")

      // Should have nodes (stored in world.world.nodes)
      expect(world.world.nodes).toBeDefined()
      expect(world.world.nodes!.length).toBeGreaterThan(0)
    })

    it("should generate nodes deterministically based on seed", () => {
      const world1 = createGatheringWorld("seed-123")
      const world2 = createGatheringWorld("seed-123")
      const world3 = createGatheringWorld("different-seed")

      // Same seed should produce same nodes
      expect(world1.world.nodes).toEqual(world2.world.nodes)

      // Different seed should produce different nodes
      expect(world1.world.nodes).not.toEqual(world3.world.nodes)
    })

    it("should generate nodes with 2+ materials", () => {
      const world = createGatheringWorld("test-seed")

      world.world.nodes!.forEach((node: Node) => {
        expect(node.materials.length).toBeGreaterThanOrEqual(2)
      })
    })

    it("should generate ore nodes in mining locations", () => {
      const world = createGatheringWorld("test-seed")

      const miningLocIds = LOCATIONS.filter((l) => l.nodePools.some((p) => p.includes("ore"))).map(
        (l) => l.id
      )

      const oreNodes = world.world.nodes!.filter((n: Node) => n.nodeType === NodeType.ORE_VEIN)

      oreNodes.forEach((node: Node) => {
        expect(miningLocIds).toContain(node.locationId)
      })
    })

    it("should generate tree nodes in woodcutting locations", () => {
      const world = createGatheringWorld("test-seed")

      const woodLocIds = LOCATIONS.filter((l) => l.nodePools.some((p) => p.includes("trees"))).map(
        (l) => l.id
      )

      const treeNodes = world.world.nodes!.filter((n: Node) => n.nodeType === NodeType.TREE_STAND)

      treeNodes.forEach((node: Node) => {
        expect(woodLocIds).toContain(node.locationId)
      })
    })

    it("should not generate FAR-only materials in NEAR locations", () => {
      const world = createGatheringWorld("test-seed")

      const nearLocIds = LOCATIONS.filter((l) => l.band === DistanceBand.NEAR).map((l) => l.id)

      // Find materials that require L9+ (FAR-only)
      const farOnlyMaterials = Object.entries(MATERIALS)
        .filter(([_, m]) => m.requiredLevel >= 9)
        .map(([id]) => id)

      const nearNodes = world.world.nodes!.filter((n: Node) => nearLocIds.includes(n.locationId))

      nearNodes.forEach((node: Node) => {
        node.materials.forEach((mat) => {
          expect(farOnlyMaterials).not.toContain(mat.materialId)
        })
      })
    })
  })
})
