/**
 * Tests for goto enemy camp command parsing
 */

import { parseAction } from "./runner.js"
import type { ExplorationLocation } from "./types.js"
import { ExplorationLocationType } from "./types.js"
import { createWorld } from "./world.js"

describe("parseAction - goto enemy camp", () => {
  it("parses 'goto enemy camp' to travel to discovered mob camp", () => {
    // Create a world state with a discovered enemy camp
    const state = createWorld("test-seed")
    const currentAreaId = state.exploration.playerState.currentAreaId
    const area = state.exploration.areas.get(currentAreaId)!

    // Add a MOB_CAMP location to the current area
    const mobCampLocation: ExplorationLocation = {
      id: "test-mob-camp-1",
      areaId: currentAreaId,
      type: ExplorationLocationType.MOB_CAMP,
      difficulty: 1,
      creatureType: "goblin",
    }
    area.locations.push(mobCampLocation)

    // Mark the camp as discovered
    state.exploration.playerState.knownLocationIds.push(mobCampLocation.id)

    const action = parseAction("goto enemy camp", { state })

    expect(action).toEqual({
      type: "TravelToLocation",
      locationId: "test-mob-camp-1",
    })
  })

  it("parses 'goto camp' to travel to discovered mob camp", () => {
    const state = createWorld("test-seed")
    const currentAreaId = state.exploration.playerState.currentAreaId
    const area = state.exploration.areas.get(currentAreaId)!

    const mobCampLocation: ExplorationLocation = {
      id: "test-mob-camp-1",
      areaId: currentAreaId,
      type: ExplorationLocationType.MOB_CAMP,
      difficulty: 1,
    }
    area.locations.push(mobCampLocation)
    state.exploration.playerState.knownLocationIds.push(mobCampLocation.id)

    const action = parseAction("goto camp", { state })

    expect(action).toEqual({
      type: "TravelToLocation",
      locationId: "test-mob-camp-1",
    })
  })

  it("parses 'goto mob camp' to travel to discovered mob camp", () => {
    const state = createWorld("test-seed")
    const currentAreaId = state.exploration.playerState.currentAreaId
    const area = state.exploration.areas.get(currentAreaId)!

    const mobCampLocation: ExplorationLocation = {
      id: "test-mob-camp-1",
      areaId: currentAreaId,
      type: ExplorationLocationType.MOB_CAMP,
      difficulty: 2,
    }
    area.locations.push(mobCampLocation)
    state.exploration.playerState.knownLocationIds.push(mobCampLocation.id)

    const action = parseAction("goto mob camp", { state })

    expect(action).toEqual({
      type: "TravelToLocation",
      locationId: "test-mob-camp-1",
    })
  })

  it("supports index to select specific camp when multiple exist", () => {
    const state = createWorld("test-seed")
    const currentAreaId = state.exploration.playerState.currentAreaId
    const area = state.exploration.areas.get(currentAreaId)!

    // Add two mob camps
    const mobCamp1: ExplorationLocation = {
      id: "test-mob-camp-1",
      areaId: currentAreaId,
      type: ExplorationLocationType.MOB_CAMP,
      difficulty: 1,
    }
    const mobCamp2: ExplorationLocation = {
      id: "test-mob-camp-2",
      areaId: currentAreaId,
      type: ExplorationLocationType.MOB_CAMP,
      difficulty: 2,
    }
    area.locations.push(mobCamp1, mobCamp2)
    state.exploration.playerState.knownLocationIds.push(mobCamp1.id, mobCamp2.id)

    // Test going to first camp (default)
    const action1 = parseAction("goto enemy camp", { state })
    expect(action1).toEqual({
      type: "TravelToLocation",
      locationId: "test-mob-camp-1",
    })

    // Test going to second camp (explicit index)
    const action2 = parseAction("goto enemy camp 2", { state })
    expect(action2).toEqual({
      type: "TravelToLocation",
      locationId: "test-mob-camp-2",
    })

    // Test going to first camp (explicit index)
    const action3 = parseAction("goto camp 1", { state })
    expect(action3).toEqual({
      type: "TravelToLocation",
      locationId: "test-mob-camp-1",
    })
  })

  it("returns null when no enemy camps are discovered", () => {
    const state = createWorld("test-seed")
    // Don't add any mob camps

    const action = parseAction("goto enemy camp", { state, logErrors: false })

    expect(action).toBeNull()
  })

  it("returns null when camp index is out of bounds", () => {
    const state = createWorld("test-seed")
    const currentAreaId = state.exploration.playerState.currentAreaId
    const area = state.exploration.areas.get(currentAreaId)!

    const mobCamp: ExplorationLocation = {
      id: "test-mob-camp-1",
      areaId: currentAreaId,
      type: ExplorationLocationType.MOB_CAMP,
      difficulty: 1,
    }
    area.locations.push(mobCamp)
    state.exploration.playerState.knownLocationIds.push(mobCamp.id)

    // Try to go to camp 2 when only 1 exists
    const action = parseAction("goto enemy camp 2", { state, logErrors: false })

    expect(action).toBeNull()
  })

  it("returns null when camp index is invalid (0 or negative)", () => {
    const state = createWorld("test-seed")
    const currentAreaId = state.exploration.playerState.currentAreaId
    const area = state.exploration.areas.get(currentAreaId)!

    const mobCamp: ExplorationLocation = {
      id: "test-mob-camp-1",
      areaId: currentAreaId,
      type: ExplorationLocationType.MOB_CAMP,
      difficulty: 1,
    }
    area.locations.push(mobCamp)
    state.exploration.playerState.knownLocationIds.push(mobCamp.id)

    const action1 = parseAction("goto enemy camp 0", { state, logErrors: false })
    expect(action1).toBeNull()

    const action2 = parseAction("goto enemy camp -1", { state, logErrors: false })
    expect(action2).toBeNull()
  })

  it("ignores undiscovered enemy camps", () => {
    const state = createWorld("test-seed")
    const currentAreaId = state.exploration.playerState.currentAreaId
    const area = state.exploration.areas.get(currentAreaId)!

    // Add a mob camp but don't mark it as discovered
    const mobCamp: ExplorationLocation = {
      id: "test-mob-camp-1",
      areaId: currentAreaId,
      type: ExplorationLocationType.MOB_CAMP,
      difficulty: 1,
    }
    area.locations.push(mobCamp)
    // Don't add to knownLocationIds

    const action = parseAction("goto enemy camp", { state, logErrors: false })

    expect(action).toBeNull()
  })
})
