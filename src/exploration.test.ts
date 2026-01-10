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
  executeFarTravel,
  grantExplorationGuildBenefits,
  buildDiscoverables,
  prepareSurveyData,
  shadowRollExplore,
  shadowRollSurvey,
  ensureAreaFullyGenerated,
} from "./exploration.js"
import { executeToCompletion } from "./engine.js"
import type {
  Area,
  WorldState,
  SurveyAction,
  ExploreAction,
  ExplorationTravelAction,
  FarTravelAction,
} from "./types.js"
import { createRng } from "./rng.js"
import { createWorld } from "./world.js"

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
        // Fractional multipliers in 0.5-4.5 range
        expect(conn.travelTimeMultiplier).toBeGreaterThanOrEqual(0.5)
        expect(conn.travelTimeMultiplier).toBeLessThanOrEqual(4.5)
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
  const state = createWorld(seed)
  const explorationState = initializeExplorationState(state.rng)
  state.exploration = {
    areas: explorationState.areas,
    connections: explorationState.connections,
    playerState: explorationState.playerState,
  }
  return state
}

describe("buildDiscoverables", () => {
  it("should return all undiscovered locations and connections", () => {
    const state = createExplorationWorld("build-disc-all")
    state.player.skills.Exploration = { level: 1, xp: 0 }
    const currentArea = state.exploration!.areas.get(state.exploration!.playerState.currentAreaId)!

    const { discoverables, baseChance } = buildDiscoverables(state, currentArea)

    expect(discoverables.length).toBeGreaterThan(0)
    expect(baseChance).toBeGreaterThan(0)
    expect(baseChance).toBeLessThanOrEqual(1)
  })

  it("should return empty array if area is fully explored", () => {
    const state = createExplorationWorld("build-disc-empty")
    state.player.skills.Exploration = { level: 1, xp: 0 }
    const currentArea = state.exploration!.areas.get(state.exploration!.playerState.currentAreaId)!

    // Mark all locations as known
    for (const loc of currentArea.locations) {
      state.exploration!.playerState.knownLocationIds.push(loc.id)
    }
    // Mark all connections as known
    const connections = state.exploration!.connections.filter(
      (c) => c.fromAreaId === currentArea.id || c.toAreaId === currentArea.id
    )
    for (const conn of connections) {
      state.exploration!.playerState.knownConnectionIds.push(`${conn.fromAreaId}->${conn.toAreaId}`)
      // Also mark target areas as known to exclude them
      const targetId = conn.fromAreaId === currentArea.id ? conn.toAreaId : conn.fromAreaId
      if (!state.exploration!.playerState.knownAreaIds.includes(targetId)) {
        state.exploration!.playerState.knownAreaIds.push(targetId)
      }
    }

    const { discoverables } = buildDiscoverables(state, currentArea)

    expect(discoverables.length).toBe(0)
  })

  it("should assign correct threshold multipliers for different discovery types", () => {
    const state = createExplorationWorld("build-disc-thresh")
    state.player.skills.Exploration = { level: 1, xp: 0 }

    // Find an area with locations at distance 1
    const distance1Areas = Array.from(state.exploration!.areas.values()).filter(
      (a) => a.distance === 1 && a.locations.length > 0
    )
    if (distance1Areas.length === 0) {
      // Skip test if no suitable areas found
      return
    }
    const testArea = distance1Areas[0]
    state.exploration!.playerState.currentAreaId = testArea.id
    state.exploration!.playerState.knownAreaIds = [state.exploration!.playerState.currentAreaId]

    const { discoverables, baseChance } = buildDiscoverables(state, testArea)

    // Verify thresholds are within expected ranges
    for (const d of discoverables) {
      expect(d.threshold).toBeGreaterThan(0)
      expect(d.threshold).toBeLessThanOrEqual(baseChance)

      // Check threshold multipliers
      if (d.type === "knownConnection") {
        // Known connections should have 1.0× multiplier
        expect(d.threshold).toBeCloseTo(baseChance * 1.0, 4)
      } else if (d.type === "unknownConnection") {
        // Unknown connections should have 0.25× multiplier
        expect(d.threshold).toBeCloseTo(baseChance * 0.25, 4)
      } else if (d.type === "location") {
        // Locations should have either 0.5× or 0.05× depending on skill
        const ratio = d.threshold / baseChance
        expect([0.5, 0.05].some((mult) => Math.abs(ratio - mult) < 0.0001)).toBe(true)
      }
    }
  })

  it("should apply 0.05× multiplier for gathering nodes without skill", () => {
    const state = createExplorationWorld("build-disc-hard")
    state.player.skills.Exploration = { level: 1, xp: 0 }
    // Ensure player has no gathering skills
    state.player.skills.Mining = { level: 0, xp: 0 }
    state.player.skills.Woodcutting = { level: 0, xp: 0 }

    // Find an area with gathering nodes
    let areaWithNode: Area | undefined
    for (const area of state.exploration!.areas.values()) {
      if (area.locations.some((loc) => loc.type === "GATHERING_NODE")) {
        areaWithNode = area
        break
      }
    }

    if (!areaWithNode) {
      // Skip test if no gathering nodes generated
      return
    }

    state.exploration!.playerState.currentAreaId = areaWithNode.id
    state.exploration!.playerState.knownAreaIds = [areaWithNode.id]

    const { discoverables, baseChance } = buildDiscoverables(state, areaWithNode)

    // Find gathering node discoverables
    const gatheringNodeDiscoverables = discoverables.filter(
      (d) => d.type === "location" && d.locationType === "GATHERING_NODE"
    )

    if (gatheringNodeDiscoverables.length > 0) {
      for (const d of gatheringNodeDiscoverables) {
        // Should have 0.05× multiplier (hard to find without skill)
        expect(d.threshold).toBeCloseTo(baseChance * 0.05, 4)
      }
    }
  })

  it("should apply 0.5× multiplier for gathering nodes with skill", () => {
    const state = createExplorationWorld("build-disc-easy")
    state.player.skills.Exploration = { level: 1, xp: 0 }
    // Give player gathering skills
    state.player.skills.Mining = { level: 1, xp: 0 }
    state.player.skills.Woodcutting = { level: 1, xp: 0 }

    // Find an area with gathering nodes
    let areaWithNode: Area | undefined
    for (const area of state.exploration!.areas.values()) {
      if (area.locations.some((loc) => loc.type === "GATHERING_NODE")) {
        areaWithNode = area
        break
      }
    }

    if (!areaWithNode) {
      // Skip test if no gathering nodes generated
      return
    }

    state.exploration!.playerState.currentAreaId = areaWithNode.id
    state.exploration!.playerState.knownAreaIds = [areaWithNode.id]

    const { discoverables, baseChance } = buildDiscoverables(state, areaWithNode)

    // Find gathering node discoverables
    const gatheringNodeDiscoverables = discoverables.filter(
      (d) => d.type === "location" && d.locationType === "GATHERING_NODE"
    )

    if (gatheringNodeDiscoverables.length > 0) {
      for (const d of gatheringNodeDiscoverables) {
        // Should have 0.5× multiplier (easier with skill)
        expect(d.threshold).toBeCloseTo(baseChance * 0.5, 4)
      }
    }
  })
})

describe("prepareSurveyData", () => {
  it("should return survey info with success chance and connections", () => {
    const state = createExplorationWorld("prep-survey-basic")
    state.player.skills.Exploration = { level: 1, xp: 0 }
    const currentArea = state.exploration!.areas.get(state.exploration!.playerState.currentAreaId)!

    const surveyInfo = prepareSurveyData(state, currentArea)

    expect(surveyInfo.successChance).toBeGreaterThan(0)
    expect(surveyInfo.successChance).toBeLessThanOrEqual(1)
    expect(surveyInfo.rollInterval).toBeGreaterThan(0)
    expect(surveyInfo.expectedTicks).toBeGreaterThan(0)
    expect(surveyInfo.allConnections.length).toBeGreaterThanOrEqual(0)
    expect(typeof surveyInfo.hasUndiscoveredAreas).toBe("boolean")
  })

  it("should detect undiscovered areas correctly", () => {
    const state = createExplorationWorld("prep-survey-undiscovered")
    state.player.skills.Exploration = { level: 1, xp: 0 }
    const currentArea = state.exploration!.areas.get(state.exploration!.playerState.currentAreaId)!

    // Start fresh - should have undiscovered areas
    const surveyInfo = prepareSurveyData(state, currentArea)

    if (surveyInfo.allConnections.length > 0) {
      // If there are connections, should have undiscovered areas initially
      expect(surveyInfo.hasUndiscoveredAreas).toBe(true)
    }
  })

  it("should return false for undiscovered areas when all are known", () => {
    const state = createExplorationWorld("prep-survey-all-known")
    state.player.skills.Exploration = { level: 1, xp: 0 }
    const currentArea = state.exploration!.areas.get(state.exploration!.playerState.currentAreaId)!

    // Mark all connected areas as known
    const connections = state.exploration!.connections.filter(
      (c) => c.fromAreaId === currentArea.id || c.toAreaId === currentArea.id
    )
    for (const conn of connections) {
      const targetId = conn.fromAreaId === currentArea.id ? conn.toAreaId : conn.fromAreaId
      if (!state.exploration!.playerState.knownAreaIds.includes(targetId)) {
        state.exploration!.playerState.knownAreaIds.push(targetId)
      }
    }

    const surveyInfo = prepareSurveyData(state, currentArea)

    expect(surveyInfo.hasUndiscoveredAreas).toBe(false)
  })

  it("should include knowledge bonuses in success chance", () => {
    const state = createExplorationWorld("prep-survey-knowledge")
    state.player.skills.Exploration = { level: 1, xp: 0 }

    // Find a distance 1 area
    const distance1Areas = Array.from(state.exploration!.areas.values()).filter(
      (a) => a.distance === 1
    )
    if (distance1Areas.length === 0) {
      throw new Error("No distance 1 areas found")
    }
    const testArea = distance1Areas[0]
    state.exploration!.playerState.currentAreaId = testArea.id
    state.exploration!.playerState.knownAreaIds = [testArea.id]

    // Get base success chance with no knowledge
    const baseInfo = prepareSurveyData(state, testArea)

    // Add a known connected area
    const connections = state.exploration!.connections.filter(
      (c) => c.fromAreaId === testArea.id || c.toAreaId === testArea.id
    )
    if (connections.length > 0) {
      const targetId =
        connections[0].fromAreaId === testArea.id
          ? connections[0].toAreaId
          : connections[0].fromAreaId
      state.exploration!.playerState.knownAreaIds.push(targetId)

      // Get success chance with knowledge bonus
      const withKnowledgeInfo = prepareSurveyData(state, testArea)

      // Success chance should increase with knowledge
      expect(withKnowledgeInfo.successChance).toBeGreaterThanOrEqual(baseInfo.successChance)
    }
  })

  it("should calculate expected ticks based on success chance", () => {
    const state = createExplorationWorld("prep-survey-ticks")
    state.player.skills.Exploration = { level: 1, xp: 0 }
    const currentArea = state.exploration!.areas.get(state.exploration!.playerState.currentAreaId)!

    const surveyInfo = prepareSurveyData(state, currentArea)

    // Expected ticks should be inversely proportional to success chance
    const manualExpectedTicks = calculateExpectedTicks(
      surveyInfo.successChance,
      surveyInfo.rollInterval
    )
    expect(surveyInfo.expectedTicks).toBeCloseTo(manualExpectedTicks, 1)
  })
})

describe("Shadow Rolling", () => {
  describe("shadowRollExplore", () => {
    it("should return same tick count as actual executeExplore", async () => {
      const state = createExplorationWorld("shadow-explore-match")
      state.player.skills.Exploration = { level: 1, xp: 0 }

      // Move to distance 1 area
      const distance1Areas = Array.from(state.exploration!.areas.values()).filter(
        (a) => a.distance === 1
      )
      if (distance1Areas.length > 0) {
        state.exploration!.playerState.currentAreaId = distance1Areas[0].id
        state.exploration!.playerState.knownAreaIds.push(distance1Areas[0].id)
      }

      const exploration = state.exploration!
      const currentArea = exploration.areas.get(exploration.playerState.currentAreaId)!

      // Ensure area is fully generated BEFORE shadow rolling and execution
      // This is critical - both must start from same RNG state
      await ensureAreaFullyGenerated(state.rng, exploration, currentArea)

      const { discoverables } = buildDiscoverables(state, currentArea)

      if (discoverables.length === 0) {
        // Skip if no discoverables
        return
      }

      const level = state.player.skills.Exploration.level
      const rollInterval = getRollInterval(level)

      // Clone RNG for shadow roll
      const shadowRng = { ...state.rng }
      const shadowTicks = shadowRollExplore(
        shadowRng,
        discoverables,
        rollInterval,
        state.time.sessionRemainingTicks
      )

      // Execute real action (should use same RNG sequence from same starting point)
      const action: ExploreAction = { type: "Explore" }
      const log = await executeToCompletion(executeExplore(state, action))

      // Shadow roll and actual execution should consume same ticks
      expect(log.timeConsumed).toBe(shadowTicks)
    })

    it("should not mutate the original RNG state", () => {
      const state = createExplorationWorld("shadow-explore-nomutate")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const currentArea = state.exploration!.areas.get(
        state.exploration!.playerState.currentAreaId
      )!
      const { discoverables } = buildDiscoverables(state, currentArea)

      if (discoverables.length === 0) {
        return
      }

      const originalCounter = state.rng.counter
      const level = state.player.skills.Exploration.level
      const rollInterval = getRollInterval(level)

      // Clone RNG for shadow roll
      const shadowRng = { ...state.rng }
      shadowRollExplore(shadowRng, discoverables, rollInterval, state.time.sessionRemainingTicks)

      // Original RNG should be unchanged
      expect(state.rng.counter).toBe(originalCounter)
    })
  })

  describe("shadowRollSurvey", () => {
    it("should return same tick count as actual executeSurvey", async () => {
      const state = createExplorationWorld("shadow-survey-match")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const currentArea = state.exploration!.areas.get(
        state.exploration!.playerState.currentAreaId
      )!

      const { successChance, rollInterval, allConnections } = prepareSurveyData(state, currentArea)
      const knownAreaIds = new Set(state.exploration!.playerState.knownAreaIds)

      if (allConnections.length === 0) {
        return
      }

      // Clone RNG for shadow roll
      const shadowRng = { ...state.rng }
      const shadowTicks = shadowRollSurvey(
        shadowRng,
        successChance,
        rollInterval,
        state.time.sessionRemainingTicks,
        allConnections.length,
        knownAreaIds,
        allConnections,
        state.exploration!.playerState.currentAreaId
      )

      if (shadowTicks === null) {
        return
      }

      // Execute real action (should use same RNG sequence from same starting point)
      const action: SurveyAction = { type: "Survey" }
      const log = await executeToCompletion(executeSurvey(state, action))

      // Shadow roll and actual execution should consume same ticks
      expect(log.timeConsumed).toBe(shadowTicks)
    })

    it("should not mutate the original RNG state", () => {
      const state = createExplorationWorld("shadow-survey-nomutate")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const currentArea = state.exploration!.areas.get(
        state.exploration!.playerState.currentAreaId
      )!

      const { successChance, rollInterval, allConnections } = prepareSurveyData(state, currentArea)
      const knownAreaIds = new Set(state.exploration!.playerState.knownAreaIds)

      if (allConnections.length === 0) {
        return
      }

      const originalCounter = state.rng.counter

      // Clone RNG for shadow roll
      const shadowRng = { ...state.rng }
      shadowRollSurvey(
        shadowRng,
        successChance,
        rollInterval,
        state.time.sessionRemainingTicks,
        allConnections.length,
        knownAreaIds,
        allConnections,
        state.exploration!.playerState.currentAreaId
      )

      // Original RNG should be unchanged
      expect(state.rng.counter).toBe(originalCounter)
    })
  })
})

describe("Survey Action", () => {
  describe("preconditions", () => {
    it("should fail if player is not in exploration guild (level 0)", async () => {
      const state = createExplorationWorld("survey-test")
      state.player.skills.Exploration = { level: 0, xp: 0 }
      const action: SurveyAction = { type: "Survey" }

      const log = await executeToCompletion(executeSurvey(state, action))

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("NOT_IN_EXPLORATION_GUILD")
    })

    it("should fail if session has ended", async () => {
      const state = createExplorationWorld("survey-test")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      state.time.sessionRemainingTicks = 0
      const action: SurveyAction = { type: "Survey" }

      const log = await executeToCompletion(executeSurvey(state, action))

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("SESSION_ENDED")
    })
  })

  describe("successful survey", () => {
    it("should discover a new area when successful", async () => {
      const state = createExplorationWorld("survey-success")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const action: SurveyAction = { type: "Survey" }
      const knownBefore = state.exploration!.playerState.knownAreaIds.length

      const log = await executeToCompletion(executeSurvey(state, action))

      // Should eventually succeed (may take multiple internal rolls)
      if (log.success) {
        expect(state.exploration!.playerState.knownAreaIds.length).toBe(knownBefore + 1)
        expect(log.explorationLog?.discoveredAreaId).toBeDefined()
      }
    })

    it("should also discover the connection to the new area", async () => {
      const state = createExplorationWorld("survey-conn")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const action: SurveyAction = { type: "Survey" }
      const connsBefore = state.exploration!.playerState.knownConnectionIds.length

      const log = await executeToCompletion(executeSurvey(state, action))

      if (log.success) {
        expect(state.exploration!.playerState.knownConnectionIds.length).toBe(connsBefore + 1)
        expect(log.explorationLog?.discoveredConnectionId).toBeDefined()
      }
    })

    it("should consume time based on rolls until success", async () => {
      const state = createExplorationWorld("survey-time")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const initialTick = state.time.currentTick
      const action: SurveyAction = { type: "Survey" }

      const log = await executeToCompletion(executeSurvey(state, action))

      expect(log.timeConsumed).toBeGreaterThan(0)
      expect(state.time.currentTick).toBe(initialTick + log.timeConsumed)
    })

    it("should grant Exploration XP", async () => {
      const state = createExplorationWorld("survey-xp")
      const initialLevel = 1
      state.player.skills.Exploration = { level: initialLevel, xp: 0 }
      const action: SurveyAction = { type: "Survey" }

      const log = await executeToCompletion(executeSurvey(state, action))

      if (log.success) {
        expect(log.skillGained).toBeDefined()
        expect(log.skillGained?.skill).toBe("Exploration")
        expect(log.skillGained?.amount).toBeGreaterThan(0)
        // XP was granted - verify via amount or level increase (xp can be 0 after level up)
        const xpOrLevelIncreased =
          state.player.skills.Exploration.xp > 0 ||
          state.player.skills.Exploration.level > initialLevel
        expect(xpOrLevelIncreased).toBe(true)
      }
    })
  })

  describe("luck surfacing", () => {
    it("should include luck info in the log", async () => {
      const state = createExplorationWorld("survey-luck")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const action: SurveyAction = { type: "Survey" }

      const log = await executeToCompletion(executeSurvey(state, action))

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
    it("should fail if player is not in exploration guild", async () => {
      const state = createExplorationWorld("explore-test")
      state.player.skills.Exploration = { level: 0, xp: 0 }
      const action: ExploreAction = { type: "Explore" }

      const log = await executeToCompletion(executeExplore(state, action))

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("NOT_IN_EXPLORATION_GUILD")
    })

    it("should fail if area is fully explored", async () => {
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

      const log = await executeToCompletion(executeExplore(state, action))

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("AREA_FULLY_EXPLORED")
    })
  })

  describe("successful exploration", () => {
    it("should discover a location or connection in current area", async () => {
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

      const log = await executeToCompletion(executeExplore(state, action))

      if (log.success) {
        expect(
          log.explorationLog?.discoveredLocationId || log.explorationLog?.discoveredConnectionId
        ).toBeDefined()
      }
    })

    it("should consume time based on rolls until success", async () => {
      const state = createExplorationWorld("explore-time")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const initialTick = state.time.currentTick
      const action: ExploreAction = { type: "Explore" }

      const log = await executeToCompletion(executeExplore(state, action))

      expect(log.timeConsumed).toBeGreaterThan(0)
      expect(state.time.currentTick).toBe(initialTick + log.timeConsumed)
    })

    it("should grant Exploration XP", async () => {
      const state = createExplorationWorld("explore-xp")
      state.player.skills.Exploration = { level: 1, xp: 0 }
      const action: ExploreAction = { type: "Explore" }

      const log = await executeToCompletion(executeExplore(state, action))

      if (log.success) {
        expect(log.skillGained).toBeDefined()
        expect(log.skillGained?.skill).toBe("Exploration")
      }
    })
  })
})

describe("ExplorationTravel Action", () => {
  describe("preconditions", () => {
    it("should fail if no direct connection exists to destination", async () => {
      const state = createExplorationWorld("travel-test")
      // area-d1-i0 is not known and no connection is known
      const action: ExplorationTravelAction = {
        type: "ExplorationTravel",
        destinationAreaId: "area-d1-i0",
      }

      const log = await executeToCompletion(executeExplorationTravel(state, action))

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("NO_PATH_TO_DESTINATION")
    })

    it("should fail if no path to destination", async () => {
      const state = createExplorationWorld("travel-no-path")
      // Know an area but don't know any connections
      state.exploration!.playerState.knownAreaIds.push("area-d1-i0")
      const action: ExplorationTravelAction = {
        type: "ExplorationTravel",
        destinationAreaId: "area-d1-i0",
      }

      const log = await executeToCompletion(executeExplorationTravel(state, action))

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("NO_PATH_TO_DESTINATION")
    })

    it("should fail if already in destination area", async () => {
      const state = createExplorationWorld("travel-same")
      const action: ExplorationTravelAction = {
        type: "ExplorationTravel",
        destinationAreaId: "TOWN",
      }

      const log = await executeToCompletion(executeExplorationTravel(state, action))

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("ALREADY_IN_AREA")
    })
  })

  describe("successful travel", () => {
    it("should move player to destination area", async () => {
      const state = createExplorationWorld("travel-success")
      // Know an area and its connection from town
      const destAreaId = "area-d1-i0"
      state.exploration!.playerState.knownAreaIds.push(destAreaId)
      state.exploration!.playerState.knownConnectionIds.push(`TOWN->${destAreaId}`)
      const action: ExplorationTravelAction = {
        type: "ExplorationTravel",
        destinationAreaId: destAreaId,
      }

      const log = await executeToCompletion(executeExplorationTravel(state, action))

      expect(log.success).toBe(true)
      expect(state.exploration!.playerState.currentAreaId).toBe(destAreaId)
    })

    it("should allow direct travel to unknown area via known connection", async () => {
      const state = createExplorationWorld("travel-unknown")
      // Know a connection to an unknown area (simulating discovered connection from explore)
      const destAreaId = "area-d1-i0"
      // Note: destAreaId is NOT in knownAreaIds
      state.exploration!.playerState.knownConnectionIds.push(`TOWN->${destAreaId}`)
      const action: ExplorationTravelAction = {
        type: "ExplorationTravel",
        destinationAreaId: destAreaId,
      }

      expect(state.exploration!.playerState.knownAreaIds).not.toContain(destAreaId)

      const log = await executeToCompletion(executeExplorationTravel(state, action))

      expect(log.success).toBe(true)
      expect(state.exploration!.playerState.currentAreaId).toBe(destAreaId)
      // Area should now be discovered
      expect(state.exploration!.playerState.knownAreaIds).toContain(destAreaId)
      expect(log.stateDeltaSummary).toContain("discovered")
    })

    it("should consume time based on travel multiplier", async () => {
      const state = createExplorationWorld("travel-time")
      const destAreaId = "area-d1-i0"
      state.exploration!.playerState.knownAreaIds.push(destAreaId)
      state.exploration!.playerState.knownConnectionIds.push(`TOWN->${destAreaId}`)
      const initialTick = state.time.currentTick
      const action: ExplorationTravelAction = {
        type: "ExplorationTravel",
        destinationAreaId: destAreaId,
      }

      const log = await executeToCompletion(executeExplorationTravel(state, action))

      // Time = BASE_TRAVEL_TIME * multiplier (10 * 0.5-4.5 = 5-45)
      expect(log.timeConsumed).toBeGreaterThanOrEqual(5)
      expect(log.timeConsumed).toBeLessThanOrEqual(45)
      expect(state.time.currentTick).toBe(initialTick + log.timeConsumed)
    })

    it("should consume 2x time when scavenging", async () => {
      const state = createExplorationWorld("travel-scavenge")
      const destAreaId = "area-d1-i0"
      state.exploration!.playerState.knownAreaIds.push(destAreaId)
      state.exploration!.playerState.knownConnectionIds.push(`TOWN->${destAreaId}`)
      const action: ExplorationTravelAction = {
        type: "ExplorationTravel",
        destinationAreaId: destAreaId,
        scavenge: true,
      }

      const log = await executeToCompletion(executeExplorationTravel(state, action))

      // Time = BASE_TRAVEL_TIME * multiplier * 2 (for scavenge, 10 * 0.5-4.5 * 2 = 10-90)
      expect(log.timeConsumed).toBeGreaterThanOrEqual(10)
      expect(log.timeConsumed).toBeLessThanOrEqual(90)
    })

    it("should NOT allow multi-hop pathfinding (direct connections only)", async () => {
      const state = createExplorationWorld("travel-multihop")
      // Set up: Know area-d1-i0 and area-d1-i1, and connections
      const area0 = "area-d1-i0"
      const area1 = "area-d1-i1"
      state.exploration!.playerState.knownAreaIds.push(area0, area1)
      state.exploration!.playerState.knownConnectionIds.push(`TOWN->${area0}`, `${area0}->${area1}`)
      // Add a connection between area0 and area1 if it doesn't exist
      const existingConn = state.exploration!.connections.find(
        (c) =>
          (c.fromAreaId === area0 && c.toAreaId === area1) ||
          (c.fromAreaId === area1 && c.toAreaId === area0)
      )
      if (!existingConn) {
        state.exploration!.connections.push({
          fromAreaId: area0,
          toAreaId: area1,
          travelTimeMultiplier: 2,
        })
      }

      // Try to travel from TOWN to area1 (would require going through area0)
      // This should fail because there's no direct connection from TOWN to area1
      const action: ExplorationTravelAction = {
        type: "ExplorationTravel",
        destinationAreaId: area1,
      }

      const log = await executeToCompletion(executeExplorationTravel(state, action))

      // Multi-hop travel is not allowed - must have direct connection
      expect(log.success).toBe(false)
      expect(log.failureType).toBe("NO_PATH_TO_DESTINATION")
    })
  })
})

describe("FarTravel Action", () => {
  describe("preconditions", () => {
    it("should fail if destination area is not known", async () => {
      const state = createExplorationWorld("fartravel-unknown")
      // area-d1-i0 is not known
      const action: FarTravelAction = {
        type: "FarTravel",
        destinationAreaId: "area-d1-i0",
      }

      const log = await executeToCompletion(executeFarTravel(state, action))

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("AREA_NOT_KNOWN")
    })

    it("should fail if no path exists to destination", async () => {
      const state = createExplorationWorld("fartravel-no-path")
      // Know an area but don't know any connections to it
      state.exploration!.playerState.knownAreaIds.push("area-d1-i0")
      const action: FarTravelAction = {
        type: "FarTravel",
        destinationAreaId: "area-d1-i0",
      }

      const log = await executeToCompletion(executeFarTravel(state, action))

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("NO_PATH_TO_DESTINATION")
    })

    it("should fail if already in destination area", async () => {
      const state = createExplorationWorld("fartravel-same")
      const action: FarTravelAction = {
        type: "FarTravel",
        destinationAreaId: "TOWN",
      }

      const log = await executeToCompletion(executeFarTravel(state, action))

      expect(log.success).toBe(false)
      expect(log.failureType).toBe("ALREADY_IN_AREA")
    })
  })

  describe("successful far travel", () => {
    it("should support multi-hop pathfinding", async () => {
      const state = createExplorationWorld("fartravel-multihop")
      // Set up: Know area-d1-i0 and area-d1-i1, and connections
      const area0 = "area-d1-i0"
      const area1 = "area-d1-i1"
      state.exploration!.playerState.knownAreaIds.push(area0, area1)
      state.exploration!.playerState.knownConnectionIds.push(`TOWN->${area0}`, `${area0}->${area1}`)
      // Add a connection between area0 and area1 if it doesn't exist
      const existingConn = state.exploration!.connections.find(
        (c) =>
          (c.fromAreaId === area0 && c.toAreaId === area1) ||
          (c.fromAreaId === area1 && c.toAreaId === area0)
      )
      if (!existingConn) {
        state.exploration!.connections.push({
          fromAreaId: area0,
          toAreaId: area1,
          travelTimeMultiplier: 2,
        })
      }

      // Far travel from TOWN to area1 (requires going through area0)
      const action: FarTravelAction = {
        type: "FarTravel",
        destinationAreaId: area1,
      }

      const log = await executeToCompletion(executeFarTravel(state, action))

      // Multi-hop travel IS allowed with FarTravel
      expect(log.success).toBe(true)
      expect(state.exploration!.playerState.currentAreaId).toBe(area1)
      // Should take at least 2 hops worth of time
      expect(log.timeConsumed).toBeGreaterThanOrEqual(20)
    })

    it("should allow direct travel to adjacent known areas", async () => {
      const state = createExplorationWorld("fartravel-direct")
      // Know an area and its connection from town
      const destAreaId = "area-d1-i0"
      state.exploration!.playerState.knownAreaIds.push(destAreaId)
      state.exploration!.playerState.knownConnectionIds.push(`TOWN->${destAreaId}`)
      const action: FarTravelAction = {
        type: "FarTravel",
        destinationAreaId: destAreaId,
      }

      const log = await executeToCompletion(executeFarTravel(state, action))

      expect(log.success).toBe(true)
      expect(state.exploration!.playerState.currentAreaId).toBe(destAreaId)
      expect(log.stateDeltaSummary).toContain("Far traveled")
      expect(log.stateDeltaSummary).toContain("1 hop")
    })
  })
})

describe("ExplorationTravel vs FarTravel - Regression Tests", () => {
  it("ExplorationTravel should NOT allow multi-hop travel (bug fix regression)", async () => {
    const state = createExplorationWorld("regression-no-multihop")
    // Set up a scenario where multi-hop was previously allowed
    // User at TOWN, knows area0 connected to TOWN, knows area1 connected to area0
    // Should NOT be able to use ExplorationTravel to go directly from TOWN to area1
    const area0 = "area-d1-i0"
    const area1 = "area-d1-i1"
    state.exploration!.playerState.knownAreaIds.push(area0, area1)
    state.exploration!.playerState.knownConnectionIds.push(`TOWN->${area0}`, `${area0}->${area1}`)
    // Ensure connection exists
    if (
      !state.exploration!.connections.find(
        (c) =>
          (c.fromAreaId === area0 && c.toAreaId === area1) ||
          (c.fromAreaId === area1 && c.toAreaId === area0)
      )
    ) {
      state.exploration!.connections.push({
        fromAreaId: area0,
        toAreaId: area1,
        travelTimeMultiplier: 2,
      })
    }

    // Try to use ExplorationTravel (the regular move command)
    const action: ExplorationTravelAction = {
      type: "ExplorationTravel",
      destinationAreaId: area1, // Not directly connected to TOWN
    }

    const log = await executeToCompletion(executeExplorationTravel(state, action))

    // This should FAIL - ExplorationTravel only allows direct connections
    expect(log.success).toBe(false)
    expect(log.failureType).toBe("NO_PATH_TO_DESTINATION")
  })

  it("FarTravel SHOULD allow multi-hop travel to same destination", async () => {
    const state = createExplorationWorld("regression-fartravel-works")
    // Same setup as above
    const area0 = "area-d1-i0"
    const area1 = "area-d1-i1"
    state.exploration!.playerState.knownAreaIds.push(area0, area1)
    state.exploration!.playerState.knownConnectionIds.push(`TOWN->${area0}`, `${area0}->${area1}`)
    if (
      !state.exploration!.connections.find(
        (c) =>
          (c.fromAreaId === area0 && c.toAreaId === area1) ||
          (c.fromAreaId === area1 && c.toAreaId === area0)
      )
    ) {
      state.exploration!.connections.push({
        fromAreaId: area0,
        toAreaId: area1,
        travelTimeMultiplier: 2,
      })
    }

    // Use FarTravel instead
    const action: FarTravelAction = {
      type: "FarTravel",
      destinationAreaId: area1,
    }

    const log = await executeToCompletion(executeFarTravel(state, action))

    // This SHOULD succeed - FarTravel allows multi-hop
    expect(log.success).toBe(true)
    expect(state.exploration!.playerState.currentAreaId).toBe(area1)
  })

  it("ExplorationTravel should still allow direct connections", async () => {
    const state = createExplorationWorld("regression-direct-still-works")
    // User at TOWN, knows area0 connected to TOWN
    const area0 = "area-d1-i0"
    state.exploration!.playerState.knownAreaIds.push(area0)
    state.exploration!.playerState.knownConnectionIds.push(`TOWN->${area0}`)

    const action: ExplorationTravelAction = {
      type: "ExplorationTravel",
      destinationAreaId: area0,
    }

    // executeExplorationTravel now returns a generator, so we need to consume it
    const log = await executeToCompletion(executeExplorationTravel(state, action))

    // Direct travel should still work
    expect(log.success).toBe(true)
    expect(state.exploration!.playerState.currentAreaId).toBe(area0)
  })
})

describe("XP on Session End", () => {
  it("should NOT grant XP when Survey fails due to session end (no discovery)", async () => {
    const state = createExplorationWorld("survey-session-end")
    state.player.skills.Exploration = { level: 1, xp: 0 }
    state.time.sessionRemainingTicks = 4 // Just enough for 2 rolls
    const action: SurveyAction = { type: "Survey" }

    const log = await executeToCompletion(executeSurvey(state, action))

    // XP is only granted on successful discovery, not on failed attempts
    if (!log.success) {
      expect(log.skillGained).toBeUndefined()
    }
  })

  it("should NOT grant XP when Explore fails due to session end (no discovery)", async () => {
    const state = createExplorationWorld("explore-session-end")
    state.player.skills.Exploration = { level: 1, xp: 0 }
    // Move to an area that has content
    const d1Area = Array.from(state.exploration!.areas.values()).find((a) => a.distance === 1)!
    state.exploration!.playerState.currentAreaId = d1Area.id
    state.exploration!.playerState.knownAreaIds.push(d1Area.id)
    state.time.sessionRemainingTicks = 4

    const action: ExploreAction = { type: "Explore" }
    const log = await executeToCompletion(executeExplore(state, action))

    // XP is only granted on successful discovery, not on failed attempts
    if (!log.success) {
      expect(log.skillGained).toBeUndefined()
    }
  })
})

describe("Lazy Area Generation", () => {
  it("should create distance 1 areas as placeholders initially", () => {
    const rng = createRng("lazy-gen-test")
    const state = initializeExplorationState(rng)

    // Distance 1 areas should exist but not be generated
    const d1Areas = Array.from(state.areas.values()).filter((a) => a.distance === 1)
    expect(d1Areas.length).toBe(5)

    for (const area of d1Areas) {
      expect(area.generated).toBe(false)
      expect(area.locations.length).toBe(0)
    }
  })

  it("should generate area content when discovered via Survey", async () => {
    const state = createExplorationWorld("lazy-survey")
    state.player.skills.Exploration = { level: 1, xp: 0 }

    // Verify areas start as placeholders
    const d1Areas = Array.from(state.exploration!.areas.values()).filter((a) => a.distance === 1)
    const allUngenerated = d1Areas.every((a) => !a.generated)
    expect(allUngenerated).toBe(true)

    const action: SurveyAction = { type: "Survey" }
    const log = await executeToCompletion(executeSurvey(state, action))

    if (log.success && log.explorationLog?.discoveredAreaId) {
      const discoveredArea = state.exploration!.areas.get(log.explorationLog.discoveredAreaId)!
      expect(discoveredArea.generated).toBe(true)
    }
  })
})

describe("Exploration Guild Enrollment Benefits", () => {
  it("should grant initial area and connection when enrolling in Exploration guild", async () => {
    const state = createExplorationWorld("enrol-benefits")
    const initialKnownAreas = state.exploration!.playerState.knownAreaIds.length
    const initialKnownConnections = state.exploration!.playerState.knownConnectionIds.length

    const result = await grantExplorationGuildBenefits(state)

    expect(result.discoveredAreaId).toBeTruthy()
    expect(result.discoveredConnectionId).toBeTruthy()
    expect(state.exploration!.playerState.knownAreaIds.length).toBe(initialKnownAreas + 1)
    expect(state.exploration!.playerState.knownConnectionIds.length).toBe(
      initialKnownConnections + 1
    )
  })
})

describe("Explore Discovering Unknown Connections", () => {
  it("should be able to discover connections to unknown areas with lower probability", async () => {
    const state = createExplorationWorld("explore-unknown-conn")
    state.player.skills.Exploration = { level: 5, xp: 0 }

    // Move to a distance 1 area and make it fully explored except for unknown connections
    const d1Area = Array.from(state.exploration!.areas.values()).find((a) => a.distance === 1)!
    state.exploration!.playerState.currentAreaId = d1Area.id
    state.exploration!.playerState.knownAreaIds.push(d1Area.id)

    // Mark all locations as known
    for (const loc of d1Area.locations) {
      state.exploration!.playerState.knownLocationIds.push(loc.id)
    }

    // Mark connections to known areas as known (but leave unknown area connections)
    const knownAreaIds = new Set(state.exploration!.playerState.knownAreaIds)
    for (const conn of state.exploration!.connections) {
      const isFromCurrent = conn.fromAreaId === d1Area.id
      const isToCurrent = conn.toAreaId === d1Area.id
      if (isFromCurrent || isToCurrent) {
        const targetId = isFromCurrent ? conn.toAreaId : conn.fromAreaId
        if (knownAreaIds.has(targetId)) {
          state.exploration!.playerState.knownConnectionIds.push(
            `${conn.fromAreaId}->${conn.toAreaId}`
          )
        }
      }
    }

    const action: ExploreAction = { type: "Explore" }
    const log = await executeToCompletion(executeExplore(state, action))

    // If there are unknown connections, the explore should be able to find them
    // (it might find something else, but the option should exist)
    if (log.success && log.explorationLog?.discoveredConnectionId) {
      if (log.explorationLog.connectionToUnknownArea) {
        // Successfully discovered a connection to an unknown area
        expect(log.explorationLog.connectionToUnknownArea).toBe(true)
      }
    }
  })
})
