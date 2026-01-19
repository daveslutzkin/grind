import {
  resolveDestination,
  GATHERING_NODE_ALIASES,
  ENEMY_CAMP_ALIASES,
  toSlug,
  normalizeName,
} from "./resolution.js"
import type { WorldState, Area } from "./types.js"
import { ExplorationLocationType } from "./types.js"
import { createWorld } from "./world.js"

describe("toSlug", () => {
  it("converts spaces to dashes", () => {
    expect(toSlug("Rocky Clearing")).toBe("rocky-clearing")
  })

  it("converts to lowercase", () => {
    expect(toSlug("TOWN")).toBe("town")
  })

  it("removes punctuation", () => {
    expect(toSlug("Dragon's Lair")).toBe("dragons-lair")
  })

  it("handles multiple spaces", () => {
    expect(toSlug("a  distant   area")).toBe("a-distant-area")
  })

  it("trims whitespace", () => {
    expect(toSlug("  area  ")).toBe("area")
  })

  it("handles generic fallback names", () => {
    expect(toSlug("a nearby area")).toBe("a-nearby-area")
    expect(toSlug("a distant area")).toBe("a-distant-area")
    expect(toSlug("a remote area")).toBe("a-remote-area")
  })
})

describe("normalizeName", () => {
  it("converts dashes to spaces (allows slug matching)", () => {
    expect(normalizeName("rocky-clearing")).toBe("rocky clearing")
  })

  it("converts underscores to spaces", () => {
    expect(normalizeName("rocky_clearing")).toBe("rocky clearing")
  })

  it("converts to lowercase", () => {
    expect(normalizeName("Rocky Clearing")).toBe("rocky clearing")
  })

  it("removes punctuation", () => {
    expect(normalizeName("Dragon's Lair")).toBe("dragons lair")
  })
})

describe("toSlug and normalizeName round-trip", () => {
  it("slug can be matched back to original area name", () => {
    const testNames = [
      "Rocky Clearing",
      "Dragon's Lair",
      "a nearby area",
      "Misty Mountains",
      "TOWN",
    ]

    for (const name of testNames) {
      const slug = toSlug(name)
      const normalizedSlug = normalizeName(slug)
      const normalizedName = normalizeName(name)
      expect(normalizedSlug).toBe(normalizedName)
    }
  })
})

describe("Resolution Module", () => {
  let state: WorldState

  beforeEach(() => {
    // Create a test world with known areas and locations
    state = createWorld("test-seed")

    // Ensure we have some known areas and locations for testing
    // TOWN should exist by default
    state.exploration.playerState.knownAreaIds = ["TOWN"]
    state.exploration.playerState.knownLocationIds = []
    state.exploration.playerState.currentAreaId = "TOWN"

    // Add a test area with various location types
    const testArea: Area = {
      id: "TEST_AREA",
      name: "Test Area",
      distance: 1,
      generated: true,
      locations: [
        {
          id: "TEST_AREA-loc-1",
          areaId: "TEST_AREA",
          type: ExplorationLocationType.GATHERING_NODE,
          gatheringSkillType: "Mining",
        },
        {
          id: "TEST_AREA-loc-2",
          areaId: "TEST_AREA",
          type: ExplorationLocationType.GATHERING_NODE,
          gatheringSkillType: "Woodcutting",
        },
        {
          id: "TEST_AREA-MOB_CAMP-loc-3",
          areaId: "TEST_AREA",
          type: ExplorationLocationType.MOB_CAMP,
          creatureType: "Goblin",
          difficulty: 0,
        },
        {
          id: "TEST_AREA-MOB_CAMP-loc-4",
          areaId: "TEST_AREA",
          type: ExplorationLocationType.MOB_CAMP,
          creatureType: "Orc",
          difficulty: 1,
        },
      ],
      indexInDistance: 0,
    }

    state.exploration.areas.set("TEST_AREA", testArea)
    state.exploration.playerState.knownAreaIds.push("TEST_AREA")
    state.exploration.playerState.knownLocationIds = [
      "TEST_AREA-loc-1",
      "TEST_AREA-loc-2",
      "TEST_AREA-MOB_CAMP-loc-3",
      "TEST_AREA-MOB_CAMP-loc-4",
    ]

    // Add a second test area for multi-area resolution
    const secondArea: Area = {
      id: "SECOND_AREA",
      name: "Second Test Area",
      distance: 1,
      generated: true,
      locations: [],
      indexInDistance: 1,
    }

    state.exploration.areas.set("SECOND_AREA", secondArea)
    state.exploration.playerState.knownAreaIds.push("SECOND_AREA")

    // Set current area to TEST_AREA for location resolution
    state.exploration.playerState.currentAreaId = "TEST_AREA"
  })

  describe("resolveDestination - gathering node aliases", () => {
    it("should resolve 'ore' to ore vein location", () => {
      const result = resolveDestination(state, "ore", "near")
      expect(result.type).toBe("location")
      expect(result.locationId).toBe("TEST_AREA-loc-1")
    })

    it("should resolve 'ore vein' to ore vein location", () => {
      const result = resolveDestination(state, "ore vein", "near")
      expect(result.type).toBe("location")
      expect(result.locationId).toBe("TEST_AREA-loc-1")
    })

    it("should resolve 'mining' to ore vein location", () => {
      const result = resolveDestination(state, "mining", "near")
      expect(result.type).toBe("location")
      expect(result.locationId).toBe("TEST_AREA-loc-1")
    })

    it("should resolve 'mine' to ore vein location", () => {
      const result = resolveDestination(state, "mine", "near")
      expect(result.type).toBe("location")
      expect(result.locationId).toBe("TEST_AREA-loc-1")
    })

    it("should resolve 'tree' to tree stand location", () => {
      const result = resolveDestination(state, "tree", "near")
      expect(result.type).toBe("location")
      expect(result.locationId).toBe("TEST_AREA-loc-2")
    })

    it("should resolve 'tree stand' to tree stand location", () => {
      const result = resolveDestination(state, "tree stand", "near")
      expect(result.type).toBe("location")
      expect(result.locationId).toBe("TEST_AREA-loc-2")
    })

    it("should resolve 'woodcutting' to tree stand location", () => {
      const result = resolveDestination(state, "woodcutting", "near")
      expect(result.type).toBe("location")
      expect(result.locationId).toBe("TEST_AREA-loc-2")
    })

    it("should resolve 'chop' to tree stand location", () => {
      const result = resolveDestination(state, "chop", "near")
      expect(result.type).toBe("location")
      expect(result.locationId).toBe("TEST_AREA-loc-2")
    })

    it("should return farTravel when gathering node is in another known area", () => {
      // Player is in TOWN but the ore vein is in TEST_AREA
      state.exploration.playerState.currentAreaId = "TOWN"

      // Ensure we have a connection from TOWN to TEST_AREA for pathfinding
      state.exploration.connections.push({
        fromAreaId: "TOWN",
        toAreaId: "TEST_AREA",
        travelTimeMultiplier: 1,
      })
      state.exploration.playerState.knownConnectionIds.push("TOWN->TEST_AREA")

      const result = resolveDestination(state, "ore", "near")
      expect(result.type).toBe("farTravel")
      expect(result.areaId).toBe("TEST_AREA")
    })

    it("should return notFound when gathering node not found anywhere", () => {
      // Create a state with no gathering nodes at all
      state.exploration.playerState.currentAreaId = "TOWN"
      // Remove the test area from known locations
      state.exploration.playerState.knownLocationIds = []

      const result = resolveDestination(state, "ore", "near")
      expect(result.type).toBe("notFound")
      expect(result.reason).toContain("No Mining node found")
    })
  })

  describe("resolveDestination - enemy camp aliases", () => {
    it("should resolve 'camp' to first enemy camp", () => {
      const result = resolveDestination(state, "camp", "near")
      expect(result.type).toBe("location")
      expect(result.locationId).toBe("TEST_AREA-MOB_CAMP-loc-3")
    })

    it("should resolve 'enemy camp' to first enemy camp", () => {
      const result = resolveDestination(state, "enemy camp", "near")
      expect(result.type).toBe("location")
      expect(result.locationId).toBe("TEST_AREA-MOB_CAMP-loc-3")
    })

    it("should resolve 'mob camp' to first enemy camp", () => {
      const result = resolveDestination(state, "mob camp", "near")
      expect(result.type).toBe("location")
      expect(result.locationId).toBe("TEST_AREA-MOB_CAMP-loc-3")
    })

    it("should resolve 'enemy camp 2' to second enemy camp", () => {
      const result = resolveDestination(state, "enemy camp 2", "near")
      expect(result.type).toBe("location")
      expect(result.locationId).toBe("TEST_AREA-MOB_CAMP-loc-4")
    })

    it("should resolve 'camp 2' to second enemy camp", () => {
      const result = resolveDestination(state, "camp 2", "near")
      expect(result.type).toBe("location")
      expect(result.locationId).toBe("TEST_AREA-MOB_CAMP-loc-4")
    })

    it("should return notFound for invalid camp index", () => {
      const result = resolveDestination(state, "camp 5", "near")
      expect(result.type).toBe("notFound")
    })

    it("should return notFound when no enemy camps in current area", () => {
      state.exploration.playerState.currentAreaId = "TOWN"
      const result = resolveDestination(state, "camp", "near")
      expect(result.type).toBe("notFound")
      expect(result.reason).toContain("No enemy camps found")
    })
  })

  describe("resolveDestination - area names", () => {
    it("should resolve exact area name match", () => {
      const result = resolveDestination(state, "Test Area", "near")
      expect(result.type).toBe("area")
      expect(result.areaId).toBe("TEST_AREA")
    })

    it("should resolve area name prefix match", () => {
      const result = resolveDestination(state, "Test", "near")
      expect(result.type).toBe("area")
      expect(result.areaId).toBe("TEST_AREA")
    })

    it("should resolve area name case-insensitively", () => {
      const result = resolveDestination(state, "test area", "near")
      expect(result.type).toBe("area")
      expect(result.areaId).toBe("TEST_AREA")
    })

    it("should resolve raw area ID", () => {
      const result = resolveDestination(state, "TEST_AREA", "near")
      expect(result.type).toBe("area")
      expect(result.areaId).toBe("TEST_AREA")
    })

    it("should resolve raw area ID case-insensitively", () => {
      const result = resolveDestination(state, "test_area", "near")
      expect(result.type).toBe("area")
      expect(result.areaId).toBe("TEST_AREA")
    })

    it("should prefer exact match over prefix match", () => {
      // Add another area with a similar prefix
      const area: Area = {
        id: "TEST_SHORTER",
        name: "Test Shorter",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 2,
      }
      state.exploration.areas.set("TEST_SHORTER", area)
      state.exploration.playerState.knownAreaIds.push("TEST_SHORTER")

      // "Test Area" exactly matches TEST_AREA's name
      const result = resolveDestination(state, "Test Area", "near")
      expect(result.type).toBe("area")
      expect(result.areaId).toBe("TEST_AREA")
    })

    it("should return notFound for ambiguous prefix", () => {
      // Create two areas that both match the same prefix
      const area1: Area = {
        id: "SIMILAR_ONE",
        name: "Similar One",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 2,
      }
      const area2: Area = {
        id: "SIMILAR_TWO",
        name: "Similar Two",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 3,
      }
      state.exploration.areas.set("SIMILAR_ONE", area1)
      state.exploration.areas.set("SIMILAR_TWO", area2)
      state.exploration.playerState.knownAreaIds.push("SIMILAR_ONE", "SIMILAR_TWO")

      // "Similar" is ambiguous - matches both areas
      const result = resolveDestination(state, "Similar", "near")
      expect(result.type).toBe("notFound")
    })

    it("should return notFound for unknown area", () => {
      const result = resolveDestination(state, "Unknown Area", "near")
      expect(result.type).toBe("notFound")
      expect(result.reason).toContain("Unknown destination")
    })
  })

  describe("resolveDestination - fallback area names", () => {
    it("should resolve 'a nearby area' to area without name at distance 1", () => {
      // Create an area without a name (like unexplored areas from maps)
      const nearbyArea: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
        // No name property - this simulates an unexplored area
      }
      state.exploration.areas.set("area-d1-i0", nearbyArea)
      state.exploration.playerState.knownAreaIds.push("area-d1-i0")

      // Add connection from TOWN to the area
      state.exploration.playerState.knownConnectionIds.push("TOWN->area-d1-i0")
      state.exploration.playerState.currentAreaId = "TOWN"

      const result = resolveDestination(state, "a nearby area", "near")
      expect(result.type).toBe("area")
      expect(result.areaId).toBe("area-d1-i0")
    })

    it("should resolve 'a distant area' to area without name at distance 2", () => {
      // Create an area at distance 2 without a name
      const distantArea: Area = {
        id: "area-d2-i0",
        distance: 2,
        generated: true,
        locations: [],
        indexInDistance: 0,
        // No name property
      }
      state.exploration.areas.set("area-d2-i0", distantArea)
      state.exploration.playerState.knownAreaIds.push("area-d2-i0")

      // Add connection
      state.exploration.playerState.knownConnectionIds.push("TOWN->area-d2-i0")
      state.exploration.playerState.currentAreaId = "TOWN"

      const result = resolveDestination(state, "a distant area", "near")
      expect(result.type).toBe("area")
      expect(result.areaId).toBe("area-d2-i0")
    })

    it("should resolve 'a remote area' to area without name at distance 3+", () => {
      // Create an area at distance 3 without a name
      const remoteArea: Area = {
        id: "area-d3-i0",
        distance: 3,
        generated: true,
        locations: [],
        indexInDistance: 0,
        // No name property
      }
      state.exploration.areas.set("area-d3-i0", remoteArea)
      state.exploration.playerState.knownAreaIds.push("area-d3-i0")

      // Add connection
      state.exploration.playerState.knownConnectionIds.push("TOWN->area-d3-i0")
      state.exploration.playerState.currentAreaId = "TOWN"

      const result = resolveDestination(state, "a remote area", "near")
      expect(result.type).toBe("area")
      expect(result.areaId).toBe("area-d3-i0")
    })

    it("should return notFound when multiple areas match fallback name", () => {
      // Create two areas at distance 1 without names
      const nearbyArea1: Area = {
        id: "area-d1-i0",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 0,
      }
      const nearbyArea2: Area = {
        id: "area-d1-i1",
        distance: 1,
        generated: true,
        locations: [],
        indexInDistance: 1,
      }
      state.exploration.areas.set("area-d1-i0", nearbyArea1)
      state.exploration.areas.set("area-d1-i1", nearbyArea2)
      state.exploration.playerState.knownAreaIds.push("area-d1-i0", "area-d1-i1")

      // Add connections
      state.exploration.playerState.knownConnectionIds.push("TOWN->area-d1-i0", "TOWN->area-d1-i1")
      state.exploration.playerState.currentAreaId = "TOWN"

      // "a nearby area" is ambiguous - matches both
      const result = resolveDestination(state, "a nearby area", "near")
      expect(result.type).toBe("notFound")
    })
  })

  describe("resolveDestination - mode differences", () => {
    it("should resolve to 'area' type in 'near' mode", () => {
      const result = resolveDestination(state, "TEST_AREA", "near")
      expect(result.type).toBe("area")
    })

    it("should resolve to 'farTravel' type in 'far' mode", () => {
      const result = resolveDestination(state, "TEST_AREA", "far")
      expect(result.type).toBe("farTravel")
      expect(result.areaId).toBe("TEST_AREA")
    })

    it("should search all known areas in 'far' mode", () => {
      // Move to TOWN (not adjacent to SECOND_AREA)
      state.exploration.playerState.currentAreaId = "TOWN"

      // In 'near' mode, SECOND_AREA might not be reachable
      // But in 'far' mode, it should be found
      const result = resolveDestination(state, "SECOND_AREA", "far")
      expect(result.type).toBe("farTravel")
      expect(result.areaId).toBe("SECOND_AREA")
    })
  })

  describe("GATHERING_NODE_ALIASES constant", () => {
    it("should contain all ore vein aliases", () => {
      expect(GATHERING_NODE_ALIASES["ore"]).toBe("Mining")
      expect(GATHERING_NODE_ALIASES["ore vein"]).toBe("Mining")
      expect(GATHERING_NODE_ALIASES["mining"]).toBe("Mining")
      expect(GATHERING_NODE_ALIASES["mine"]).toBe("Mining")
    })

    it("should contain all tree stand aliases", () => {
      expect(GATHERING_NODE_ALIASES["tree"]).toBe("Woodcutting")
      expect(GATHERING_NODE_ALIASES["tree stand"]).toBe("Woodcutting")
      expect(GATHERING_NODE_ALIASES["woodcutting"]).toBe("Woodcutting")
      expect(GATHERING_NODE_ALIASES["chop"]).toBe("Woodcutting")
    })
  })

  describe("ENEMY_CAMP_ALIASES constant", () => {
    it("should contain all enemy camp aliases", () => {
      expect(ENEMY_CAMP_ALIASES).toContain("enemy camp")
      expect(ENEMY_CAMP_ALIASES).toContain("camp")
      expect(ENEMY_CAMP_ALIASES).toContain("mob camp")
    })
  })
})
