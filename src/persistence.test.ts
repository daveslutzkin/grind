import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import {
  serializeSession,
  deserializeSession,
  getSavePath,
  saveExists,
  loadSave,
  writeSave,
  deleteSave,
  setSavesDirectory,
} from "./persistence.js"
import { SAVE_VERSION } from "./types.js"
import { createWorld } from "./world.js"
import type { Session } from "./runner.js"

describe("Persistence", () => {
  const TEST_SEED = "test-persistence-seed"
  let TEST_SAVES_DIR: string

  // Set up temp directory for test saves
  beforeAll(() => {
    TEST_SAVES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "grind-test-saves-"))
    setSavesDirectory(TEST_SAVES_DIR)
  })

  // Clean up test saves directory after all tests
  afterAll(() => {
    if (fs.existsSync(TEST_SAVES_DIR)) {
      fs.rmSync(TEST_SAVES_DIR, { recursive: true, force: true })
    }
  })

  // Clean up test saves before and after tests
  beforeEach(() => {
    if (saveExists(TEST_SEED)) {
      deleteSave(TEST_SEED)
    }
  })

  afterEach(() => {
    if (saveExists(TEST_SEED)) {
      deleteSave(TEST_SEED)
    }
  })

  describe("getSavePath", () => {
    it("should return correct save path", () => {
      const savePath = getSavePath(TEST_SEED)
      expect(savePath).toBe(path.join(TEST_SAVES_DIR, `${TEST_SEED}.json`))
    })
  })

  describe("saveExists", () => {
    it("should return false when save does not exist", () => {
      expect(saveExists(TEST_SEED)).toBe(false)
    })

    it("should return true when save exists", () => {
      const state = createWorld(TEST_SEED)
      const session: Session = {
        state,
        stats: {
          logs: [],
          startingSkills: { ...state.player.skills },
          sessionStartLogIndex: 0,
        },
      }
      writeSave(TEST_SEED, session)
      expect(saveExists(TEST_SEED)).toBe(true)
    })
  })

  describe("serializeSession and deserializeSession", () => {
    it("should round-trip serialize and deserialize a session", () => {
      const state = createWorld(TEST_SEED)
      const originalSession: Session = {
        state,
        stats: {
          logs: [],
          startingSkills: { ...state.player.skills },
          sessionStartLogIndex: 0,
        },
      }

      // Serialize
      const saveFile = serializeSession(originalSession, TEST_SEED)

      // Verify save file structure
      expect(saveFile.version).toBe(SAVE_VERSION)
      expect(saveFile.seed).toBe(TEST_SEED)
      expect(saveFile.savedAt).toBeDefined()
      expect(typeof saveFile.savedAt).toBe("string")

      // Deserialize
      const deserializedSession = deserializeSession(saveFile)

      // Verify the session is restored correctly
      expect(deserializedSession.state.time.currentTick).toBe(
        originalSession.state.time.currentTick
      )
      expect(deserializedSession.state.player.inventory).toEqual(
        originalSession.state.player.inventory
      )
      expect(deserializedSession.state.player.skills).toEqual(originalSession.state.player.skills)
      expect(deserializedSession.state.rng).toEqual(originalSession.state.rng)

      // Verify exploration.areas Map is restored
      expect(deserializedSession.state.exploration.areas).toBeInstanceOf(Map)
      expect(deserializedSession.state.exploration.areas.size).toBe(
        originalSession.state.exploration.areas.size
      )

      // Verify area IDs match
      const originalAreaIds = Array.from(originalSession.state.exploration.areas.keys()).sort()
      const deserializedAreaIds = Array.from(
        deserializedSession.state.exploration.areas.keys()
      ).sort()
      expect(deserializedAreaIds).toEqual(originalAreaIds)

      // Verify stats
      expect(deserializedSession.stats).toEqual(originalSession.stats)
    })

    it("should correctly convert areas Map to object and back", () => {
      const state = createWorld(TEST_SEED)
      const session: Session = {
        state,
        stats: {
          logs: [],
          startingSkills: { ...state.player.skills },
          sessionStartLogIndex: 0,
        },
      }

      // Get original areas
      const originalAreas = state.exploration.areas

      // Serialize and deserialize
      const saveFile = serializeSession(session, TEST_SEED)
      const restoredSession = deserializeSession(saveFile)

      // Verify Map was converted correctly
      expect(restoredSession.state.exploration.areas).toBeInstanceOf(Map)
      expect(restoredSession.state.exploration.areas.size).toBe(originalAreas.size)

      // Verify each area is identical
      for (const [areaId, originalArea] of originalAreas.entries()) {
        const restoredArea = restoredSession.state.exploration.areas.get(areaId)
        expect(restoredArea).toEqual(originalArea)
      }
    })
  })

  describe("writeSave and loadSave", () => {
    it("should write and load a save file", () => {
      const state = createWorld(TEST_SEED)
      const session: Session = {
        state,
        stats: {
          logs: [],
          startingSkills: { ...state.player.skills },
          sessionStartLogIndex: 0,
        },
      }

      // Write save
      writeSave(TEST_SEED, session)

      // Verify file exists
      expect(saveExists(TEST_SEED)).toBe(true)

      // Load save
      const loadedSave = loadSave(TEST_SEED)

      // Verify loaded save
      expect(loadedSave.version).toBe(SAVE_VERSION)
      expect(loadedSave.seed).toBe(TEST_SEED)
      expect(loadedSave.state).toBeDefined()
      expect(loadedSave.stats).toBeDefined()

      // Deserialize and verify session
      const loadedSession = deserializeSession(loadedSave)
      expect(loadedSession.state.time.currentTick).toBe(session.state.time.currentTick)
      expect(loadedSession.state.player.skills).toEqual(session.state.player.skills)
    })

    it("should create saves directory if it does not exist", () => {
      // Create a new temp directory that doesn't exist yet
      const newTempDir = path.join(os.tmpdir(), `grind-test-mkdir-${Date.now()}`)
      setSavesDirectory(newTempDir)

      try {
        const state = createWorld(TEST_SEED)
        const session: Session = {
          state,
          stats: {
            logs: [],
            startingSkills: { ...state.player.skills },
            sessionStartLogIndex: 0,
          },
        }

        // This should create the directory if needed
        expect(() => writeSave(TEST_SEED, session)).not.toThrow()
        expect(saveExists(TEST_SEED)).toBe(true)
      } finally {
        // Clean up and restore original test directory
        if (fs.existsSync(newTempDir)) {
          fs.rmSync(newTempDir, { recursive: true, force: true })
        }
        setSavesDirectory(TEST_SAVES_DIR)
      }
    })

    it("should use atomic writes (temp file pattern)", () => {
      const state = createWorld(TEST_SEED)
      const session: Session = {
        state,
        stats: {
          logs: [],
          startingSkills: { ...state.player.skills },
          sessionStartLogIndex: 0,
        },
      }

      writeSave(TEST_SEED, session)

      // Verify temp file does not exist after write
      const tempPath = `${getSavePath(TEST_SEED)}.tmp`
      expect(fs.existsSync(tempPath)).toBe(false)

      // Verify actual save file exists
      expect(saveExists(TEST_SEED)).toBe(true)
    })

    it("should throw error on corrupted save file", () => {
      // Write invalid JSON to save file
      if (!fs.existsSync(TEST_SAVES_DIR)) {
        fs.mkdirSync(TEST_SAVES_DIR, { recursive: true })
      }
      fs.writeFileSync(getSavePath(TEST_SEED), "{ invalid json", "utf-8")

      // loadSave should throw
      expect(() => loadSave(TEST_SEED)).toThrow()
    })

    it("should warn on version mismatch but load anyway", () => {
      const state = createWorld(TEST_SEED)
      const session: Session = {
        state,
        stats: {
          logs: [],
          startingSkills: { ...state.player.skills },
          sessionStartLogIndex: 0,
        },
      }

      // Write save with wrong version
      const saveFile = serializeSession(session, TEST_SEED)
      saveFile.version = 999 // Wrong version

      if (!fs.existsSync(TEST_SAVES_DIR)) {
        fs.mkdirSync(TEST_SAVES_DIR, { recursive: true })
      }
      fs.writeFileSync(getSavePath(TEST_SEED), JSON.stringify(saveFile), "utf-8")

      // Mock console.warn to capture warning
      const originalWarn = console.warn
      const warnings: string[] = []
      console.warn = (msg: string) => warnings.push(msg)

      try {
        // Should load despite version mismatch
        const loaded = loadSave(TEST_SEED)
        expect(loaded.version).toBe(999)

        // Should have warned
        expect(warnings.length).toBeGreaterThan(0)
        expect(warnings[0]).toContain("version mismatch")
      } finally {
        console.warn = originalWarn
      }
    })
  })

  describe("deleteSave", () => {
    it("should delete an existing save file", () => {
      const state = createWorld(TEST_SEED)
      const session: Session = {
        state,
        stats: {
          logs: [],
          startingSkills: { ...state.player.skills },
          sessionStartLogIndex: 0,
        },
      }

      // Create save
      writeSave(TEST_SEED, session)
      expect(saveExists(TEST_SEED)).toBe(true)

      // Delete save
      deleteSave(TEST_SEED)
      expect(saveExists(TEST_SEED)).toBe(false)
    })

    it("should not throw when deleting non-existent save", () => {
      expect(saveExists(TEST_SEED)).toBe(false)
      expect(() => deleteSave(TEST_SEED)).not.toThrow()
    })
  })

  describe("session state preservation", () => {
    it("should preserve RNG counter and seed", () => {
      const state = createWorld(TEST_SEED)
      state.rng.counter = 42
      const session: Session = {
        state,
        stats: {
          logs: [],
          startingSkills: { ...state.player.skills },
          sessionStartLogIndex: 0,
        },
      }

      writeSave(TEST_SEED, session)
      const loaded = deserializeSession(loadSave(TEST_SEED))

      expect(loaded.state.rng.seed).toBe(TEST_SEED)
      expect(loaded.state.rng.counter).toBe(42)
    })

    it("should preserve action logs in stats", () => {
      const state = createWorld(TEST_SEED)
      const session: Session = {
        state,
        stats: {
          logs: [
            {
              tickBefore: 0,
              actionType: "Survey",
              parameters: {},
              success: true,
              timeConsumed: 10,
              rngRolls: [],
              stateDeltaSummary: "test",
            },
          ],
          startingSkills: { ...state.player.skills },
          sessionStartLogIndex: 0,
        },
      }

      writeSave(TEST_SEED, session)
      const loaded = deserializeSession(loadSave(TEST_SEED))

      expect(loaded.stats.logs).toHaveLength(1)
      expect(loaded.stats.logs[0].actionType).toBe("Survey")
      expect(loaded.stats.logs[0].success).toBe(true)
    })

    it("should preserve all player state", () => {
      const state = createWorld(TEST_SEED)
      // Modify player state
      state.player.inventory.push({ itemId: "TEST_ITEM", quantity: 5 })
      state.player.skills.Mining.level = 10
      state.player.skills.Mining.xp = 50
      state.player.guildReputation = 100

      const session: Session = {
        state,
        stats: {
          logs: [],
          startingSkills: { ...state.player.skills },
          sessionStartLogIndex: 0,
        },
      }

      writeSave(TEST_SEED, session)
      const loaded = deserializeSession(loadSave(TEST_SEED))

      expect(loaded.state.player.inventory).toContainEqual({ itemId: "TEST_ITEM", quantity: 5 })
      expect(loaded.state.player.skills.Mining.level).toBe(10)
      expect(loaded.state.player.skills.Mining.xp).toBe(50)
      expect(loaded.state.player.guildReputation).toBe(100)
    })

    it("should preserve exploration connections", () => {
      const state = createWorld(TEST_SEED)

      // Verify we have connections in the original state
      expect(state.exploration.connections.length).toBeGreaterThan(0)
      const originalConnections = [...state.exploration.connections]

      const session: Session = {
        state,
        stats: {
          logs: [],
          startingSkills: { ...state.player.skills },
          sessionStartLogIndex: 0,
        },
      }

      writeSave(TEST_SEED, session)
      const loaded = deserializeSession(loadSave(TEST_SEED))

      // Connections should be preserved exactly
      expect(loaded.state.exploration.connections).toEqual(originalConnections)
      expect(loaded.state.exploration.connections.length).toBe(originalConnections.length)
    })

    it("should preserve area locations", () => {
      const state = createWorld(TEST_SEED)

      // Find an area with locations
      const areasWithLocations = Array.from(state.exploration.areas.values()).filter(
        (area) => area.locations.length > 0
      )
      expect(areasWithLocations.length).toBeGreaterThan(0)

      const testArea = areasWithLocations[0]
      const originalLocations = [...testArea.locations]

      const session: Session = {
        state,
        stats: {
          logs: [],
          startingSkills: { ...state.player.skills },
          sessionStartLogIndex: 0,
        },
      }

      writeSave(TEST_SEED, session)
      const loaded = deserializeSession(loadSave(TEST_SEED))

      // Area should exist in loaded state
      const loadedArea = loaded.state.exploration.areas.get(testArea.id)
      expect(loadedArea).toBeDefined()

      // Locations should be preserved
      expect(loadedArea!.locations).toEqual(originalLocations)
      expect(loadedArea!.locations.length).toBe(originalLocations.length)
    })

    it("should preserve exploration state after traveling to an area", async () => {
      const { executeExplorationTravel } = await import("./exploration.js")
      const state = createWorld(TEST_SEED)

      // Enroll in exploration guild first
      state.player.skills.Exploration.level = 1

      // Find a distance 1 area to travel to
      const distance1Areas = Array.from(state.exploration.areas.values()).filter(
        (area) => area.distance === 1
      )
      expect(distance1Areas.length).toBeGreaterThan(0)
      const targetArea = distance1Areas[0]

      // Make the area known and add connection
      state.exploration.playerState.knownAreaIds.push(targetArea.id)
      state.exploration.playerState.knownConnectionIds.push(`TOWN->${targetArea.id}`)
      state.exploration.connections.push({
        fromAreaId: "TOWN",
        toAreaId: targetArea.id,
        travelTimeMultiplier: 1,
      })

      // Travel to the area
      await executeExplorationTravel(state, {
        type: "ExplorationTravel",
        destinationAreaId: targetArea.id,
      })

      // Count connections and undiscovered connections before save
      const currentAreaId = state.exploration.playerState.currentAreaId
      const knownConnIds = new Set(state.exploration.playerState.knownConnectionIds)
      const connectionsBefore = state.exploration.connections.filter(
        (conn) => conn.fromAreaId === currentAreaId || conn.toAreaId === currentAreaId
      )
      const undiscoveredBefore = connectionsBefore.filter((conn) => {
        const connId = `${conn.fromAreaId}->${conn.toAreaId}`
        const reverseId = `${conn.toAreaId}->${conn.fromAreaId}`
        return !knownConnIds.has(connId) && !knownConnIds.has(reverseId)
      })

      // Save and load
      const session: Session = {
        state,
        stats: {
          logs: [],
          startingSkills: { ...state.player.skills },
          sessionStartLogIndex: 0,
        },
      }
      writeSave(TEST_SEED, session)
      const loaded = deserializeSession(loadSave(TEST_SEED))

      // Same checks after load
      const loadedKnownConnIds = new Set(loaded.state.exploration.playerState.knownConnectionIds)
      const connectionsAfter = loaded.state.exploration.connections.filter(
        (conn) => conn.fromAreaId === currentAreaId || conn.toAreaId === currentAreaId
      )
      const undiscoveredAfter = connectionsAfter.filter((conn) => {
        const connId = `${conn.fromAreaId}->${conn.toAreaId}`
        const reverseId = `${conn.toAreaId}->${conn.fromAreaId}`
        return !loadedKnownConnIds.has(connId) && !loadedKnownConnIds.has(reverseId)
      })

      // Should have same number of connections
      expect(connectionsAfter.length).toBe(connectionsBefore.length)
      // Should have same number of undiscovered connections
      expect(undiscoveredAfter.length).toBe(undiscoveredBefore.length)
      // Current area should be same
      expect(loaded.state.exploration.playerState.currentAreaId).toBe(currentAreaId)
    })

    it("should show same exploration status before and after save/load", async () => {
      const { executeExplorationTravel } = await import("./exploration.js")
      const { formatWorldState } = await import("./agent/formatters.js")
      const state = createWorld(TEST_SEED)

      // Enroll in exploration guild first
      state.player.skills.Exploration.level = 1

      // Find a distance 1 area to travel to
      const distance1Areas = Array.from(state.exploration.areas.values()).filter(
        (area) => area.distance === 1
      )
      const targetArea = distance1Areas[0]

      // Make the area known and add connection
      state.exploration.playerState.knownAreaIds.push(targetArea.id)
      state.exploration.playerState.knownConnectionIds.push(`TOWN->${targetArea.id}`)
      state.exploration.connections.push({
        fromAreaId: "TOWN",
        toAreaId: targetArea.id,
        travelTimeMultiplier: 1,
      })

      // Travel to the area
      await executeExplorationTravel(state, {
        type: "ExplorationTravel",
        destinationAreaId: targetArea.id,
      })

      // Get exploration status before save
      const outputBefore = formatWorldState(state)
      const hasFullyExploredBefore = outputBefore.includes("fully explored")
      const hasPartlyExploredBefore = outputBefore.includes("partly explored")
      const hasUnexploredBefore = outputBefore.includes("unexplored")

      // Save and load
      const session: Session = {
        state,
        stats: {
          logs: [],
          startingSkills: { ...state.player.skills },
          sessionStartLogIndex: 0,
        },
      }
      writeSave(TEST_SEED, session)
      const loaded = deserializeSession(loadSave(TEST_SEED))

      // Get exploration status after load
      const outputAfter = formatWorldState(loaded.state)
      const hasFullyExploredAfter = outputAfter.includes("fully explored")
      const hasPartlyExploredAfter = outputAfter.includes("partly explored")
      const hasUnexploredAfter = outputAfter.includes("unexplored")

      // Status should be the same
      expect(hasFullyExploredAfter).toBe(hasFullyExploredBefore)
      expect(hasPartlyExploredAfter).toBe(hasPartlyExploredBefore)
      expect(hasUnexploredAfter).toBe(hasUnexploredBefore)
    })
  })
})
