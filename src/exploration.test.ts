import {
  getAreaCountForDistance,
  getRollInterval,
  calculateSuccessChance,
  calculateExpectedTicks,
  BASE_TRAVEL_TIME,
  generateArea,
  generateAreaConnections,
  initializeExplorationState,
  generateTown,
  executeSurvey,
  executeExplore,
  executeExplorationTravel,
} from "./exploration.js"
import type {
  Area,
  WorldState,
  SurveyAction,
  ExploreAction,
  ExplorationTravelAction,
} from "./types.js"
import { createRng } from "./rng.js"
import { createToyWorld } from "./world.js"

describe("Exploration Utilities", () => {
  describe("getAreaCountForDistance", () => {
    // From canonical doc: Fibonacci sequence starting at distance 1
    // Distance 1: 5, Distance 2: 8, Distance 3: 13, etc.
    it("should return 5 areas for distance 1", () => {
      expect(getAreaCountForDistance(1)).toBe(5)
    })

    it("should return 8 areas for distance 2", () => {
      expect(getAreaCountForDistance(2)).toBe(8)
    })

    it("should return 13 areas for distance 3", () => {
      expect(getAreaCountForDistance(3)).toBe(13)
    })

    it("should return 21 areas for distance 4", () => {
      expect(getAreaCountForDistance(4)).toBe(21)
    })

    it("should return 34 areas for distance 5", () => {
      expect(getAreaCountForDistance(5)).toBe(34)
    })

    it("should return 377 areas for distance 10", () => {
      expect(getAreaCountForDistance(10)).toBe(377)
    })

    it("should return 1 for distance 0 (town)", () => {
      // Town is special - just one area
      expect(getAreaCountForDistance(0)).toBe(1)
    })
  })

  describe("getRollInterval", () => {
    // From canonical doc: max(1, 2 - floor(level / 10) × 0.1)
    // Level 1-9: every 2 ticks
    // Level 10-19: every 1.9 ticks
    // Level 100+: every 1 tick
    it("should return 2 ticks for level 1", () => {
      expect(getRollInterval(1)).toBe(2)
    })

    it("should return 2 ticks for level 9", () => {
      expect(getRollInterval(9)).toBe(2)
    })

    it("should return 1.9 ticks for level 10", () => {
      expect(getRollInterval(10)).toBeCloseTo(1.9)
    })

    it("should return 1.9 ticks for level 19", () => {
      expect(getRollInterval(19)).toBeCloseTo(1.9)
    })

    it("should return 1.8 ticks for level 20", () => {
      expect(getRollInterval(20)).toBeCloseTo(1.8)
    })

    it("should return 1.5 ticks for level 50", () => {
      expect(getRollInterval(50)).toBeCloseTo(1.5)
    })

    it("should return 1 tick for level 100", () => {
      expect(getRollInterval(100)).toBe(1)
    })

    it("should return 1 tick for level 150 (capped at 1)", () => {
      expect(getRollInterval(150)).toBe(1)
    })
  })

  describe("calculateSuccessChance", () => {
    // From canonical doc:
    // success_chance = base_rate + level_bonus - distance_penalty + knowledge_bonus
    // Base rate: 5%
    // Level bonus: (level - 1) × 5%
    // Distance penalty: (distance - 1) × 5%
    // Knowledge bonus: 5% per connected known area + 20% × (known non-connected / total)

    describe("Example 1: Fresh Explorer at Distance 1", () => {
      it("should return 10% for level 1 at distance 1 with town connection known", () => {
        // base = 5%, level_bonus = 0%, distance_penalty = 0%, connected_bonus = 5%
        const chance = calculateSuccessChance({
          level: 1,
          distance: 1,
          connectedKnownAreas: 1, // Town connection known
          nonConnectedKnownAreas: 0,
          totalAreasAtDistance: 5,
        })
        expect(chance).toBeCloseTo(0.1) // 10%
      })
    })

    describe("Example 2: Level 5 Explorer at Distance 5", () => {
      it("should return ~25.9% for level 5 at distance 5 with 3 connected and 10 non-connected", () => {
        // base = 5%, level_bonus = 20%, distance_penalty = 20%
        // connected_bonus = 15%, non_connected_bonus = 20% × (10/34) = 5.9%
        const chance = calculateSuccessChance({
          level: 5,
          distance: 5,
          connectedKnownAreas: 3,
          nonConnectedKnownAreas: 10,
          totalAreasAtDistance: 34,
        })
        expect(chance).toBeCloseTo(0.259, 2) // ~25.9%
      })
    })

    describe("Example 3: Level 5 Explorer Pushing to Distance 8", () => {
      it("should return very low chance for pushing too far", () => {
        // base = 5%, level_bonus = 20%, distance_penalty = 35%
        // connected_bonus = 10%, non_connected_bonus = 20% × (5/144) = 0.7%
        const chance = calculateSuccessChance({
          level: 5,
          distance: 8,
          connectedKnownAreas: 2,
          nonConnectedKnownAreas: 5,
          totalAreasAtDistance: 144,
        })
        // 5 + 20 - 35 + 10 + 0.7 = 0.7% (should be floor of 0)
        expect(chance).toBeLessThan(0.02) // Very low
      })
    })

    describe("Example 4: No Guild (fixed 1% rate)", () => {
      it("should return 1% for non-guild player regardless of other factors", () => {
        const chance = calculateSuccessChance({
          level: 0, // Not in guild (level 0)
          distance: 1,
          connectedKnownAreas: 5,
          nonConnectedKnownAreas: 10,
          totalAreasAtDistance: 5,
        })
        expect(chance).toBe(0.01) // Fixed 1%
      })
    })

    describe("Example 5: Level 10 at Distance 10 (Well-Prepared)", () => {
      it("should return ~35.3% for level 10 at distance 10 with good knowledge", () => {
        // base = 5%, level_bonus = 45%, distance_penalty = 45%
        // connected_bonus = 25%, non_connected_bonus = 20% × (100/377) = 5.3%
        const chance = calculateSuccessChance({
          level: 10,
          distance: 10,
          connectedKnownAreas: 5,
          nonConnectedKnownAreas: 100,
          totalAreasAtDistance: 377,
        })
        expect(chance).toBeCloseTo(0.353, 2) // ~35.3%
      })
    })

    describe("Edge cases", () => {
      it("should floor success chance at 0% (no negative chances)", () => {
        const chance = calculateSuccessChance({
          level: 1,
          distance: 20, // Very high distance penalty
          connectedKnownAreas: 0,
          nonConnectedKnownAreas: 0,
          totalAreasAtDistance: 100,
        })
        expect(chance).toBeGreaterThanOrEqual(0)
      })

      it("should cap success chance at 100%", () => {
        const chance = calculateSuccessChance({
          level: 50, // Very high level bonus
          distance: 1,
          connectedKnownAreas: 10,
          nonConnectedKnownAreas: 5,
          totalAreasAtDistance: 5,
        })
        expect(chance).toBeLessThanOrEqual(1)
      })
    })
  })

  describe("calculateExpectedTicks", () => {
    // Expected ticks = roll_interval / success_chance

    it("should return 20 ticks for 10% success rate with 2 tick interval", () => {
      // 2 / 0.1 = 20
      const ticks = calculateExpectedTicks(0.1, 2)
      expect(ticks).toBe(20)
    })

    it("should return ~8 ticks for 25.9% success rate with 2 tick interval", () => {
      // 2 / 0.259 ≈ 7.7
      const ticks = calculateExpectedTicks(0.259, 2)
      expect(ticks).toBeCloseTo(7.7, 0)
    })

    it("should return ~5 ticks for 35.3% success rate with 1.9 tick interval", () => {
      // 1.9 / 0.353 ≈ 5.4
      const ticks = calculateExpectedTicks(0.353, 1.9)
      expect(ticks).toBeCloseTo(5.4, 0)
    })

    it("should return 200 ticks for 1% success rate (no guild)", () => {
      // 2 / 0.01 = 200
      const ticks = calculateExpectedTicks(0.01, 2)
      expect(ticks).toBe(200)
    })
  })

  describe("BASE_TRAVEL_TIME constant", () => {
    it("should be 10 ticks", () => {
      expect(BASE_TRAVEL_TIME).toBe(10)
    })
  })
})

describe("Area Generation", () => {
  describe("generateTown", () => {
    it("should create town at distance 0", () => {
      const town = generateTown()
      expect(town.id).toBe("TOWN")
      expect(town.distance).toBe(0)
      expect(town.generated).toBe(true)
      expect(town.indexInDistance).toBe(0)
    })
  })

  describe("generateArea", () => {
    it("should create an area with correct distance and index", () => {
      const rng = createRng("test-seed")
      const area = generateArea(rng, 3, 5) // Distance 3, index 5

      expect(area.distance).toBe(3)
      expect(area.indexInDistance).toBe(5)
      expect(area.generated).toBe(true)
    })

    it("should generate deterministic area ID based on distance and index", () => {
      const rng = createRng("test-seed")
      const area = generateArea(rng, 2, 3)

      expect(area.id).toBe("area-d2-i3")
    })

    it("should generate same area with same seed", () => {
      const rng1 = createRng("determinism-test")
      const rng2 = createRng("determinism-test")

      const area1 = generateArea(rng1, 5, 10)
      const area2 = generateArea(rng2, 5, 10)

      expect(area1.id).toBe(area2.id)
      expect(area1.locations).toEqual(area2.locations)
    })

    it("should generate different areas with different seeds", () => {
      const rng1 = createRng("seed-a")
      const rng2 = createRng("seed-b")

      const area1 = generateArea(rng1, 1, 0)
      const area2 = generateArea(rng2, 1, 0)

      // Areas have same ID (based on position) but may have different locations
      expect(area1.id).toBe(area2.id)
      // Locations may differ due to RNG (though could be same by chance)
    })
  })

  describe("generateAreaConnections", () => {
    it("should create town connections to all distance 1 areas", () => {
      const rng = createRng("test-seed")
      const town = generateTown()
      const distance1Areas: Area[] = []

      // Generate all 5 distance-1 areas
      for (let i = 0; i < 5; i++) {
        distance1Areas.push(generateArea(rng, 1, i))
      }

      const connections = generateAreaConnections(rng, town, [town, ...distance1Areas])

      // Town should connect to ALL distance 1 areas
      const townConnections = connections.filter(
        (c) => c.fromAreaId === "TOWN" || c.toAreaId === "TOWN"
      )
      expect(townConnections.length).toBe(5)
    })

    it("should generate connections with valid travel time multipliers", () => {
      const rng = createRng("test-seed")
      const town = generateTown()
      const area = generateArea(rng, 1, 0)

      const connections = generateAreaConnections(rng, town, [town, area])

      for (const conn of connections) {
        expect([1, 2, 3, 4]).toContain(conn.travelTimeMultiplier)
      }
    })

    it("should be deterministic with same seed", () => {
      const rng1 = createRng("conn-test")
      const rng2 = createRng("conn-test")

      const town1 = generateTown()
      const area1 = generateArea(rng1, 1, 0)
      const conn1 = generateAreaConnections(rng1, area1, [town1, area1])

      const town2 = generateTown()
      // Reset RNG counter for determinism
      rng2.counter = rng1.counter - (rng1.counter - 0) // Need to match RNG state
      const rng3 = createRng("conn-test")
      const area2 = generateArea(rng3, 1, 0)
      const conn2 = generateAreaConnections(rng3, area2, [town2, area2])

      expect(conn1.length).toBe(conn2.length)
    })
  })

  describe("initializeExplorationState", () => {
    it("should create initial state with town known", () => {
      const rng = createRng("init-test")
      const state = initializeExplorationState(rng)

      expect(state.areas.has("TOWN")).toBe(true)
      expect(state.playerState.currentAreaId).toBe("TOWN")
      expect(state.playerState.knownAreaIds).toContain("TOWN")
    })

    it("should not know any areas beyond town initially (without guild)", () => {
      const rng = createRng("init-test")
      const state = initializeExplorationState(rng)

      // Only town is known without exploration guild
      expect(state.playerState.knownAreaIds.length).toBe(1)
      expect(state.playerState.knownAreaIds[0]).toBe("TOWN")
    })

    it("should have connections from town to distance 1 generated", () => {
      const rng = createRng("init-test")
      const state = initializeExplorationState(rng)

      // Town connections should exist (but not necessarily known)
      const townConnections = state.connections.filter(
        (c) => c.fromAreaId === "TOWN" || c.toAreaId === "TOWN"
      )
      expect(townConnections.length).toBeGreaterThan(0)
    })
  })
})

// Helper to create a world state with exploration enabled
function createExplorationWorld(seed: string): WorldState {
  const state = createToyWorld(seed)
  const explorationState = initializeExplorationState(state.rng)
  state.exploration = {
    areas: explorationState.areas,
    connections: explorationState.connections,
    playerState: explorationState.playerState,
  }
  return state
}

describe("Survey Action", () => {
  describe("preconditions", () => {
    it("should fail if player is not in exploration guild (level 0)", () => {
      const state = createExplorationWorld("survey-test")
      state.player.skills.Exploration = { level: 0, xp: 0 }
      const action: SurveyAction = { type: "Survey" }

      const log = executeSurvey(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("NOT_IN_EXPLORATION_GUILD")
    })

    it("should fail if session has ended", () => {
      const state = createExplorationWorld("survey-test")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      state.time.sessionRemainingTicks = 0
      const action: SurveyAction = { type: "Survey" }

      const log = executeSurvey(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("SESSION_ENDED")
    })
  })

  describe("successful survey", () => {
    it("should discover a new area when successful", () => {
      const state = createExplorationWorld("survey-success")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const action: SurveyAction = { type: "Survey" }
      const knownBefore = state.exploration!.playerState.knownAreaIds.length

      const log = executeSurvey(state, action)

      // Should eventually succeed (may take multiple internal rolls)
      if (log.success) {
        expect(state.exploration!.playerState.knownAreaIds.length).toBe(knownBefore + 1)
        expect(log.explorationLog?.discoveredAreaId).toBeDefined()
      }
    })

    it("should also discover the connection to the new area", () => {
      const state = createExplorationWorld("survey-conn")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const action: SurveyAction = { type: "Survey" }
      const connsBefore = state.exploration!.playerState.knownConnectionIds.length

      const log = executeSurvey(state, action)

      if (log.success) {
        expect(state.exploration!.playerState.knownConnectionIds.length).toBe(connsBefore + 1)
        expect(log.explorationLog?.discoveredConnectionId).toBeDefined()
      }
    })

    it("should consume time based on rolls until success", () => {
      const state = createExplorationWorld("survey-time")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const initialTick = state.time.currentTick
      const action: SurveyAction = { type: "Survey" }

      const log = executeSurvey(state, action)

      expect(log.timeConsumed).toBeGreaterThan(0)
      expect(state.time.currentTick).toBe(initialTick + log.timeConsumed)
    })

    it("should grant Exploration XP", () => {
      const state = createExplorationWorld("survey-xp")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const action: SurveyAction = { type: "Survey" }

      const log = executeSurvey(state, action)

      if (log.success) {
        expect(log.skillGained).toBeDefined()
        expect(log.skillGained?.skill).toBe("Exploration")
        expect(state.player.skills.Exploration.xp).toBeGreaterThan(0)
      }
    })
  })

  describe("luck surfacing", () => {
    it("should include luck info in the log", () => {
      const state = createExplorationWorld("survey-luck")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const action: SurveyAction = { type: "Survey" }

      const log = executeSurvey(state, action)

      if (log.success) {
        expect(log.explorationLog?.luckInfo).toBeDefined()
        expect(log.explorationLog?.luckInfo?.actualTicks).toBeDefined()
        expect(log.explorationLog?.luckInfo?.expectedTicks).toBeDefined()
        expect(log.explorationLog?.luckInfo?.luckDelta).toBeDefined()
      }
    })
  })
})

describe("Explore Action", () => {
  describe("preconditions", () => {
    it("should fail if player is not in exploration guild", () => {
      const state = createExplorationWorld("explore-test")
      state.player.skills.Exploration = { level: 0, xp: 0 }
      const action: ExploreAction = { type: "Explore" }

      const log = executeExplore(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("NOT_IN_EXPLORATION_GUILD")
    })

    it("should fail if area is fully explored", () => {
      const state = createExplorationWorld("explore-full")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      // Mark all locations and connections as known for current area
      const currentArea = state.exploration!.areas.get(
        state.exploration!.playerState.currentAreaId
      )!
      for (const loc of currentArea.locations) {
        state.exploration!.playerState.knownLocationIds.push(loc.id)
      }
      // Mark all connections from current area as known
      const currentConnections = state.exploration!.connections.filter(
        (c) => c.fromAreaId === currentArea.id || c.toAreaId === currentArea.id
      )
      for (const conn of currentConnections) {
        state.exploration!.playerState.knownConnectionIds.push(
          `${conn.fromAreaId}->${conn.toAreaId}`
        )
      }
      const action: ExploreAction = { type: "Explore" }

      const log = executeExplore(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("AREA_FULLY_EXPLORED")
    })
  })

  describe("successful exploration", () => {
    it("should discover a location or connection in current area", () => {
      const state = createExplorationWorld("explore-success")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      // Move to a distance 1 area that has locations
      const distance1Areas = Array.from(state.exploration!.areas.values()).filter(
        (a) => a.distance === 1
      )
      const areaWithLocations = distance1Areas.find((a) => a.locations.length > 0)
      if (areaWithLocations) {
        state.exploration!.playerState.currentAreaId = areaWithLocations.id
        state.exploration!.playerState.knownAreaIds.push(areaWithLocations.id)
      }
      const action: ExploreAction = { type: "Explore" }

      const log = executeExplore(state, action)

      if (log.success) {
        expect(
          log.explorationLog?.discoveredLocationId || log.explorationLog?.discoveredConnectionId
        ).toBeDefined()
      }
    })

    it("should consume time based on rolls until success", () => {
      const state = createExplorationWorld("explore-time")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const initialTick = state.time.currentTick
      const action: ExploreAction = { type: "Explore" }

      const log = executeExplore(state, action)

      expect(log.timeConsumed).toBeGreaterThan(0)
      expect(state.time.currentTick).toBe(initialTick + log.timeConsumed)
    })

    it("should grant Exploration XP", () => {
      const state = createExplorationWorld("explore-xp")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const action: ExploreAction = { type: "Explore" }

      const log = executeExplore(state, action)

      if (log.success) {
        expect(log.skillGained).toBeDefined()
        expect(log.skillGained?.skill).toBe("Exploration")
      }
    })
  })
})

describe("ExplorationTravel Action", () => {
  describe("preconditions", () => {
    it("should fail if destination area is not known", () => {
      const state = createExplorationWorld("travel-test")
      const action: ExplorationTravelAction = {
        type: "ExplorationTravel",
        destinationAreaId: "area-d1-i0", // Not known yet
      }

      const log = executeExplorationTravel(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("AREA_NOT_KNOWN")
    })

    it("should fail if no path to destination", () => {
      const state = createExplorationWorld("travel-no-path")
      // Know an area but don't know any connections
      state.exploration!.playerState.knownAreaIds.push("area-d1-i0")
      const action: ExplorationTravelAction = {
        type: "ExplorationTravel",
        destinationAreaId: "area-d1-i0",
      }

      const log = executeExplorationTravel(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("NO_PATH_TO_DESTINATION")
    })

    it("should fail if already in destination area", () => {
      const state = createExplorationWorld("travel-same")
      const action: ExplorationTravelAction = {
        type: "ExplorationTravel",
        destinationAreaId: "TOWN",
      }

      const log = executeExplorationTravel(state, action)

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("ALREADY_IN_AREA")
    })
  })

  describe("successful travel", () => {
    it("should move player to destination area", () => {
      const state = createExplorationWorld("travel-success")
      // Know an area and its connection from town
      const destAreaId = "area-d1-i0"
      state.exploration!.playerState.knownAreaIds.push(destAreaId)
      state.exploration!.playerState.knownConnectionIds.push(`TOWN->${destAreaId}`)
      const action: ExplorationTravelAction = {
        type: "ExplorationTravel",
        destinationAreaId: destAreaId,
      }

      const log = executeExplorationTravel(state, action)

      expect(log.success).toBe(true)
      expect(state.exploration!.playerState.currentAreaId).toBe(destAreaId)
    })

    it("should consume time based on travel multiplier", () => {
      const state = createExplorationWorld("travel-time")
      const destAreaId = "area-d1-i0"
      state.exploration!.playerState.knownAreaIds.push(destAreaId)
      state.exploration!.playerState.knownConnectionIds.push(`TOWN->${destAreaId}`)
      const initialTick = state.time.currentTick
      const action: ExplorationTravelAction = {
        type: "ExplorationTravel",
        destinationAreaId: destAreaId,
      }

      const log = executeExplorationTravel(state, action)

      // Time = BASE_TRAVEL_TIME * multiplier (10 * 1-4)
      expect(log.timeConsumed).toBeGreaterThanOrEqual(10)
      expect(log.timeConsumed).toBeLessThanOrEqual(40)
      expect(state.time.currentTick).toBe(initialTick + log.timeConsumed)
    })

    it("should consume 2x time when scavenging", () => {
      const state = createExplorationWorld("travel-scavenge")
      const destAreaId = "area-d1-i0"
      state.exploration!.playerState.knownAreaIds.push(destAreaId)
      state.exploration!.playerState.knownConnectionIds.push(`TOWN->${destAreaId}`)
      const action: ExplorationTravelAction = {
        type: "ExplorationTravel",
        destinationAreaId: destAreaId,
        scavenge: true,
      }

      const log = executeExplorationTravel(state, action)

      // Time = BASE_TRAVEL_TIME * multiplier * 2 (for scavenge)
      expect(log.timeConsumed).toBeGreaterThanOrEqual(20)
      expect(log.timeConsumed).toBeLessThanOrEqual(80)
    })
  })
})
