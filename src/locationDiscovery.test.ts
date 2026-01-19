/**
 * TDD Tests for Location Discovery
 *
 * Per the exploration spec:
 * - Locations (nodes) must be discovered via Explore action before they're visible
 * - Gather requires the node's location to be discovered first
 * - "The map is not given; it is earned"
 */

import { executeAction, executeToCompletion } from "./engine.js"
import { createWorld } from "./world.js"
import { executeExplore } from "./exploration.js"
import type { WorldState, AreaID, GatherAction, ExploreAction, Node } from "./types.js"
import { GatherMode, NodeType } from "./types.js"
import { formatWorldState } from "./agent/formatters.js"

/**
 * Helper: Get an area that has ore nodes
 */
function getOreAreaId(state: WorldState): AreaID {
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

/**
 * Helper: Make an area known (but NOT its locations)
 */
function makeAreaKnown(state: WorldState, areaId: AreaID): void {
  if (!state.exploration.playerState.knownAreaIds.includes(areaId)) {
    state.exploration.playerState.knownAreaIds.push(areaId)
  }
  const connectionId = `TOWN->${areaId}`
  if (!state.exploration.playerState.knownConnectionIds.includes(connectionId)) {
    state.exploration.playerState.knownConnectionIds.push(connectionId)
  }
}

/**
 * Helper: Get the location ID for a node based on its skill type
 */
function getLocationIdForNode(node: Node): string {
  // Location IDs follow the pattern: {areaId}-loc-{index}
  // Mining nodes get index 0, Woodcutting nodes get index 1
  const skillIndex = node.nodeType === NodeType.ORE_VEIN ? 0 : 1
  return `${node.areaId}-loc-${skillIndex}`
}

/**
 * Helper: Discover a specific location
 */
function discoverLocation(state: WorldState, locationId: string): void {
  if (!state.exploration.playerState.knownLocationIds.includes(locationId)) {
    state.exploration.playerState.knownLocationIds.push(locationId)
  }
}

describe("Location Discovery", () => {
  describe("Nodes not visible until discovered", () => {
    it("should NOT show nodes at an area until locations are discovered", async () => {
      const state = createWorld("ore-test")
      state.player.skills.Exploration = { level: 1, xp: 0 } // Need Exploration skill to see status
      const oreAreaId = getOreAreaId(state)
      makeAreaKnown(state, oreAreaId)
      state.exploration.playerState.currentAreaId = oreAreaId

      // Verify there ARE nodes at this area
      const areaNodes = state.world.nodes.filter((n) => n.areaId === oreAreaId)
      expect(areaNodes.length).toBeGreaterThan(0)

      // Wilderness locations are NOT discovered yet (town locations are known from start)
      const wildernessLocations = state.exploration.playerState.knownLocationIds.filter(
        (id) => !id.startsWith("TOWN")
      )
      expect(wildernessLocations.length).toBe(0)

      // Format state should NOT show resource nodes (shows unexplored instead)
      const formatted = formatWorldState(state)
      expect(formatted).toContain("Unexplored")
      expect(formatted).not.toContain("Ore vein")
    })

    it("should show nodes AFTER their location is discovered", async () => {
      const state = createWorld("ore-test")
      const oreAreaId = getOreAreaId(state)
      makeAreaKnown(state, oreAreaId)
      state.exploration.playerState.currentAreaId = oreAreaId

      // Get a node and discover its location
      const node = state.world.nodes.find((n) => n.areaId === oreAreaId)!
      const locationId = getLocationIdForNode(node)
      discoverLocation(state, locationId)

      // Now format state SHOULD show resource nodes
      const formatted = formatWorldState(state)
      expect(formatted).toContain("Gathering:")
      expect(formatted).toContain("Ore vein")
    })
  })

  describe("Gather requires discovered location", () => {
    it("should fail Gather if node location is not discovered", async () => {
      const state = createWorld("ore-test")
      state.player.skills.Mining = { level: 1, xp: 0 }
      const oreAreaId = getOreAreaId(state)
      makeAreaKnown(state, oreAreaId)
      state.exploration.playerState.currentAreaId = oreAreaId

      // Get node but DON'T discover its location
      const node = state.world.nodes.find((n) => n.areaId === oreAreaId)!
      const material = node.materials.find((m) => m.requiredLevel <= 1)!

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      }

      const log = await executeAction(state, action)

      expect(log.success).toBe(false)
      expect(log.failureDetails?.type).toBe("LOCATION_NOT_DISCOVERED")
    })

    it("should succeed Gather if node location IS discovered", async () => {
      const state = createWorld("ore-test")
      state.player.skills.Mining = { level: 1, xp: 0 }
      const oreAreaId = getOreAreaId(state)
      makeAreaKnown(state, oreAreaId)
      state.exploration.playerState.currentAreaId = oreAreaId

      // Get node AND discover its location
      const node = state.world.nodes.find((n) => n.areaId === oreAreaId)!
      const locationId = getLocationIdForNode(node)
      discoverLocation(state, locationId)

      const material = node.materials.find((m) => m.requiredLevel <= 1)!

      const action: GatherAction = {
        type: "Gather",
        nodeId: node.nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: material.materialId,
      }

      const log = await executeAction(state, action)

      // Should not fail due to location not discovered
      expect(log.failureDetails?.type).not.toBe("LOCATION_NOT_DISCOVERED")
    })
  })

  describe("Explore discovers locations", () => {
    it("should discover a location or connection via Explore action", async () => {
      const state = createWorld("ore-test")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const oreAreaId = getOreAreaId(state)
      makeAreaKnown(state, oreAreaId)
      state.exploration.playerState.currentAreaId = oreAreaId

      // Ensure the area has locations to discover
      const area = state.exploration.areas.get(oreAreaId)!
      expect(area.locations.length).toBeGreaterThan(0)

      const initialKnownLocations = state.exploration.playerState.knownLocationIds.length
      const initialKnownConnections = state.exploration.playerState.knownConnectionIds.length
      const action: ExploreAction = { type: "Explore" }

      const log = await executeToCompletion(executeExplore(state, action))

      if (log.success) {
        // Should have discovered either a location or a connection
        const discoveredLocation =
          state.exploration.playerState.knownLocationIds.length > initialKnownLocations
        const discoveredConnection =
          state.exploration.playerState.knownConnectionIds.length > initialKnownConnections
        expect(discoveredLocation || discoveredConnection).toBe(true)
        expect(
          log.explorationLog?.discoveredLocationId || log.explorationLog?.discoveredConnectionId
        ).toBeDefined()
      }
    })

    it("should allow gathering after Explore discovers the node location", async () => {
      const state = createWorld("ore-test")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      state.player.skills.Mining = { level: 1, xp: 0 }
      const oreAreaId = getOreAreaId(state)
      makeAreaKnown(state, oreAreaId)
      state.exploration.playerState.currentAreaId = oreAreaId

      // Keep exploring until we discover a Mining location
      let discoveredMiningLocation = false
      for (let i = 0; i < 50 && !discoveredMiningLocation; i++) {
        const exploreAction: ExploreAction = { type: "Explore" }
        const exploreLog = await executeToCompletion(executeExplore(state, exploreAction))

        if (exploreLog.success && exploreLog.explorationLog?.discoveredLocationId) {
          const locId = exploreLog.explorationLog.discoveredLocationId
          // Check if this is a Mining location
          const area = state.exploration.areas.get(oreAreaId)!
          const loc = area.locations.find((l) => l.id === locId)
          if (loc?.gatheringSkillType === "Mining") {
            discoveredMiningLocation = true
          }
        }
      }

      if (discoveredMiningLocation) {
        // Now try to gather from a node at this location
        const node = state.world.nodes.find(
          (n) => n.areaId === oreAreaId && n.nodeType === NodeType.ORE_VEIN
        )!
        const material = node.materials.find((m) => m.requiredLevel <= 1)

        if (material) {
          const gatherAction: GatherAction = {
            type: "Gather",
            nodeId: node.nodeId,
            mode: GatherMode.FOCUS,
            focusMaterialId: material.materialId,
          }

          const gatherLog = await executeAction(state, gatherAction)

          // Should NOT fail due to location not discovered
          expect(gatherLog.failureDetails?.type).not.toBe("LOCATION_NOT_DISCOVERED")
        }
      }
    })
  })

  describe("Location-Node linkage", () => {
    it("should have exploration locations for each node type in an area", () => {
      const state = createWorld("ore-test")
      const oreAreaId = getOreAreaId(state)

      // Ensure area is generated
      const area = state.exploration.areas.get(oreAreaId)!

      // Get nodes at this area
      const oreNodes = state.world.nodes.filter(
        (n) => n.areaId === oreAreaId && n.nodeType === NodeType.ORE_VEIN
      )
      const treeNodes = state.world.nodes.filter(
        (n) => n.areaId === oreAreaId && n.nodeType === NodeType.TREE_STAND
      )

      // Check that locations exist for each node type
      const miningLocations = area.locations.filter((l) => l.gatheringSkillType === "Mining")
      const woodcuttingLocations = area.locations.filter(
        (l) => l.gatheringSkillType === "Woodcutting"
      )

      // If there are ore nodes, there should be a mining location
      if (oreNodes.length > 0) {
        expect(miningLocations.length).toBe(1)
      }
      // If there are tree nodes, there should be a woodcutting location
      if (treeNodes.length > 0) {
        expect(woodcuttingLocations.length).toBe(1)
      }
    })
  })
})

describe("Sparse Node Generation Verification", () => {
  it("should have ~56% of areas with no nodes (matching spec)", () => {
    // Use multiple seeds to get statistical significance
    let totalAreas = 0
    let emptyAreas = 0

    for (const seed of ["sparse-1", "sparse-2", "sparse-3", "sparse-4", "sparse-5"]) {
      const state = createWorld(seed)

      for (const area of state.exploration.areas.values()) {
        if (area.distance === 0) continue // Skip TOWN
        totalAreas++

        const areaNodes = state.world.nodes.filter((n) => n.areaId === area.id)
        if (areaNodes.length === 0) {
          emptyAreas++
        }
      }
    }

    const emptyRate = emptyAreas / totalAreas
    // With 25% probability for each of 2 node types, ~56% should be empty
    // Allow ±15% tolerance for randomness
    expect(emptyRate).toBeGreaterThan(0.4)
    expect(emptyRate).toBeLessThan(0.7)
  })

  it("should have areas with 0, 1, or 2 node types (not more)", () => {
    const state = createWorld("node-count-test")

    for (const area of state.exploration.areas.values()) {
      if (area.distance === 0) continue // Skip TOWN

      const areaNodes = state.world.nodes.filter((n) => n.areaId === area.id)
      const nodeTypes = new Set(areaNodes.map((n) => n.nodeType))

      // Each area should have at most 2 node types (ore and/or trees)
      expect(nodeTypes.size).toBeLessThanOrEqual(2)
    }
  })
})
