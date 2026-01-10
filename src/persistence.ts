/**
 * Persistence module for save/resume functionality
 * Handles serialization, deserialization, and file operations for game saves
 */

import * as fs from "fs"
import * as path from "path"
import type { WorldState, AreaID, Area } from "./types.js"
import { SAVE_VERSION } from "./types.js"
import type { Session, SessionStats } from "./runner.js"

// Directory where saves are stored
let SAVES_DIR = "./saves"

/**
 * Set the saves directory (primarily for testing)
 */
export function setSavesDirectory(dir: string): void {
  SAVES_DIR = dir
}

/**
 * Serialized WorldState with areas as a plain object instead of Map
 */
export interface SerializedWorldState extends Omit<WorldState, "exploration"> {
  exploration: Omit<WorldState["exploration"], "areas"> & {
    areas: Record<AreaID, Area>
  }
}

/**
 * Save file structure
 */
export interface SaveFile {
  version: number
  savedAt: string // ISO timestamp
  seed: string
  state: SerializedWorldState
  stats: SessionStats
}

/**
 * Get the file path for a save with the given seed
 */
export function getSavePath(seed: string): string {
  return path.join(SAVES_DIR, `${seed}.json`)
}

/**
 * Check if a save file exists for the given seed
 */
export function saveExists(seed: string): boolean {
  return fs.existsSync(getSavePath(seed))
}

/**
 * Serialize a session to a SaveFile structure
 */
export function serializeSession(session: Session, seed: string): SaveFile {
  // Convert areas Map to plain object
  const serializedAreas = Object.fromEntries(session.state.exploration.areas)

  const serializedState: SerializedWorldState = {
    ...session.state,
    exploration: {
      ...session.state.exploration,
      areas: serializedAreas,
    },
  }

  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    seed,
    state: serializedState,
    stats: session.stats,
  }
}

/**
 * Deserialize a SaveFile back to a Session
 */
export function deserializeSession(save: SaveFile): Session {
  // Convert areas object back to Map
  const areasMap = new Map<AreaID, Area>(Object.entries(save.state.exploration.areas))

  const state: WorldState = {
    ...save.state,
    exploration: {
      ...save.state.exploration,
      areas: areasMap,
    },
  }

  return {
    state,
    stats: save.stats,
  }
}

/**
 * Load a save file from disk
 * Throws on read/parse errors (fail hard)
 */
export function loadSave(seed: string): SaveFile {
  const savePath = getSavePath(seed)
  try {
    const fileContent = fs.readFileSync(savePath, "utf-8")
    const save = JSON.parse(fileContent) as SaveFile

    // Warn if version mismatch, but attempt to load anyway (lenient)
    if (save.version !== SAVE_VERSION) {
      console.warn(
        `Warning: Save file version mismatch (file: ${save.version}, current: ${SAVE_VERSION}). Attempting to load anyway...`
      )
    }

    return save
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to load save file for seed '${seed}': ${error.message}`)
    }
    throw error
  }
}

/**
 * Write a save file to disk
 * Creates the saves directory if it doesn't exist
 */
export function writeSave(seed: string, session: Session): void {
  // Ensure saves directory exists
  if (!fs.existsSync(SAVES_DIR)) {
    fs.mkdirSync(SAVES_DIR, { recursive: true })
  }

  const saveFile = serializeSession(session, seed)
  const savePath = getSavePath(seed)

  // Use atomic write pattern: write to temp file, then rename
  const tempPath = `${savePath}.tmp`
  try {
    fs.writeFileSync(tempPath, JSON.stringify(saveFile, null, 2), "utf-8")
    fs.renameSync(tempPath, savePath)
  } catch (error) {
    // Clean up temp file if it exists
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath)
    }
    throw error
  }
}

/**
 * Delete a save file for the given seed
 */
export function deleteSave(seed: string): void {
  const savePath = getSavePath(seed)
  if (fs.existsSync(savePath)) {
    fs.unlinkSync(savePath)
  }
}
