/**
 * Mastery Data Model for Mining
 *
 * This module encodes the mining-levels-1-200.md progression table,
 * mapping Mining skill levels to per-material mastery levels and gains.
 */

import type { MaterialID } from "./types.js"

/**
 * Types of mastery gains (in-scope for this implementation)
 */
export type MasteryGain =
  | "Unlock" // M1: Can mine this material
  | "Speed_I" // M2: 20→15 ticks
  | "Waste_I" // M3: 40→30% collateral
  | "Appraise" // M6: See quantities
  | "Speed_II" // M9: 15→10 ticks
  | "Bonus_I" // M10: 5% double yield
  | "Waste_II" // M11: 30→15% collateral
  | "Careful" // M16: Zero collateral mode
  | "Speed_III" // M17: 10→5 ticks
  | "Waste_III" // M19: 15→5% collateral
  | "Bonus_II" // M20: 10% double yield

/**
 * A single entry in the mastery progression table
 */
interface MasteryEntry {
  level: number
  material: MaterialID
  masteryLevel: number
  gain: string
}

/**
 * Complete mining mastery table from mining-levels-1-200.md
 * Indexed by skill level, contains material and mastery level at that skill level
 */
const MINING_MASTERY_TABLE: MasteryEntry[] = [
  { level: 1, material: "Stone", masteryLevel: 1, gain: "Unlock" },
  { level: 2, material: "Stone", masteryLevel: 2, gain: "Speed I" },
  { level: 3, material: "Stone", masteryLevel: 3, gain: "Waste I" },
  { level: 4, material: "Stone", masteryLevel: 4, gain: "Stack I" },
  { level: 5, material: "Stone", masteryLevel: 5, gain: "Handling I" },
  { level: 6, material: "Stone", masteryLevel: 6, gain: "Appraise" },
  { level: 7, material: "Stone", masteryLevel: 7, gain: "Scavenge I" },
  { level: 8, material: "Stone", masteryLevel: 8, gain: "Container I" },
  { level: 9, material: "Stone", masteryLevel: 9, gain: "Speed II" },
  { level: 10, material: "Stone", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 11, material: "Stone", masteryLevel: 11, gain: "Waste II" },
  { level: 12, material: "Stone", masteryLevel: 12, gain: "Value I" },
  { level: 13, material: "Stone", masteryLevel: 13, gain: "Stack II" },
  { level: 14, material: "Stone", masteryLevel: 14, gain: "Handling II" },
  { level: 15, material: "Stone", masteryLevel: 15, gain: "Scavenge II" },
  { level: 16, material: "Stone", masteryLevel: 16, gain: "Careful" },
  { level: 17, material: "Stone", masteryLevel: 17, gain: "Speed III" },
  { level: 18, material: "Stone", masteryLevel: 18, gain: "Container II" },
  { level: 19, material: "Stone", masteryLevel: 19, gain: "Waste III" },
  { level: 20, material: "Copper", masteryLevel: 1, gain: "Unlock" },
  { level: 21, material: "Copper", masteryLevel: 2, gain: "Speed I" },
  { level: 22, material: "Copper", masteryLevel: 3, gain: "Waste I" },
  { level: 23, material: "Copper", masteryLevel: 4, gain: "Stack I" },
  { level: 24, material: "Copper", masteryLevel: 5, gain: "Handling I" },
  { level: 25, material: "Copper", masteryLevel: 6, gain: "Appraise" },
  { level: 26, material: "Copper", masteryLevel: 7, gain: "Scavenge I" },
  { level: 27, material: "Copper", masteryLevel: 8, gain: "Container I" },
  { level: 28, material: "Copper", masteryLevel: 9, gain: "Speed II" },
  { level: 29, material: "Copper", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 30, material: "Copper", masteryLevel: 11, gain: "Waste II" },
  { level: 31, material: "Copper", masteryLevel: 12, gain: "Value I" },
  { level: 32, material: "Copper", masteryLevel: 13, gain: "Stack II" },
  { level: 33, material: "Copper", masteryLevel: 14, gain: "Handling II" },
  { level: 34, material: "Copper", masteryLevel: 15, gain: "Scavenge II" },
  { level: 35, material: "Copper", masteryLevel: 16, gain: "Careful" },
  { level: 36, material: "Copper", masteryLevel: 17, gain: "Speed III" },
  { level: 37, material: "Stone", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 38, material: "Copper", masteryLevel: 18, gain: "Container II" },
  { level: 39, material: "Copper", masteryLevel: 19, gain: "Waste III" },
  { level: 40, material: "Tin", masteryLevel: 1, gain: "Unlock" },
  { level: 41, material: "Tin", masteryLevel: 2, gain: "Speed I" },
  { level: 42, material: "Tin", masteryLevel: 3, gain: "Waste I" },
  { level: 43, material: "Tin", masteryLevel: 4, gain: "Stack I" },
  { level: 44, material: "Tin", masteryLevel: 5, gain: "Handling I" },
  { level: 45, material: "Tin", masteryLevel: 6, gain: "Appraise" },
  { level: 46, material: "Tin", masteryLevel: 7, gain: "Scavenge I" },
  { level: 47, material: "Tin", masteryLevel: 8, gain: "Container I" },
  { level: 48, material: "Tin", masteryLevel: 9, gain: "Speed II" },
  { level: 49, material: "Tin", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 50, material: "Tin", masteryLevel: 11, gain: "Waste II" },
  { level: 51, material: "Tin", masteryLevel: 12, gain: "Value I" },
  { level: 52, material: "Tin", masteryLevel: 13, gain: "Stack II" },
  { level: 53, material: "Tin", masteryLevel: 14, gain: "Handling II" },
  { level: 54, material: "Tin", masteryLevel: 15, gain: "Scavenge II" },
  { level: 55, material: "Stone", masteryLevel: 21, gain: "Stack III" },
  { level: 56, material: "Tin", masteryLevel: 16, gain: "Careful" },
  { level: 57, material: "Tin", masteryLevel: 17, gain: "Speed III" },
  { level: 58, material: "Stone", masteryLevel: 22, gain: "Value II" },
  { level: 59, material: "Copper", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 60, material: "Iron", masteryLevel: 1, gain: "Unlock" },
  { level: 61, material: "Iron", masteryLevel: 2, gain: "Speed I" },
  { level: 62, material: "Iron", masteryLevel: 3, gain: "Waste I" },
  { level: 63, material: "Iron", masteryLevel: 4, gain: "Stack I" },
  { level: 64, material: "Iron", masteryLevel: 5, gain: "Handling I" },
  { level: 65, material: "Iron", masteryLevel: 6, gain: "Appraise" },
  { level: 66, material: "Iron", masteryLevel: 7, gain: "Scavenge I" },
  { level: 67, material: "Iron", masteryLevel: 8, gain: "Container I" },
  { level: 68, material: "Iron", masteryLevel: 9, gain: "Speed II" },
  { level: 69, material: "Iron", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 70, material: "Iron", masteryLevel: 11, gain: "Waste II" },
  { level: 71, material: "Iron", masteryLevel: 12, gain: "Value I" },
  { level: 72, material: "Iron", masteryLevel: 13, gain: "Stack II" },
  { level: 73, material: "Stone", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 74, material: "Iron", masteryLevel: 14, gain: "Handling II" },
  { level: 75, material: "Iron", masteryLevel: 15, gain: "Scavenge II" },
  { level: 76, material: "Tin", masteryLevel: 18, gain: "Container II" },
  { level: 77, material: "Copper", masteryLevel: 21, gain: "Stack III" },
  { level: 78, material: "Stone", masteryLevel: 24, gain: "Refined fragments" },
  { level: 79, material: "Iron", masteryLevel: 16, gain: "Careful" },
  { level: 80, material: "Silver", masteryLevel: 1, gain: "Unlock" },
  { level: 81, material: "Silver", masteryLevel: 2, gain: "Speed I" },
  { level: 82, material: "Silver", masteryLevel: 3, gain: "Waste I" },
  { level: 83, material: "Silver", masteryLevel: 4, gain: "Stack I" },
  { level: 84, material: "Silver", masteryLevel: 5, gain: "Handling I" },
  { level: 85, material: "Silver", masteryLevel: 6, gain: "Appraise" },
  { level: 86, material: "Silver", masteryLevel: 7, gain: "Scavenge I" },
  { level: 87, material: "Stone", masteryLevel: 25, gain: "Grandmaster" },
  { level: 88, material: "Silver", masteryLevel: 8, gain: "Container I" },
  { level: 89, material: "Silver", masteryLevel: 9, gain: "Speed II" },
  { level: 90, material: "Silver", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 91, material: "Copper", masteryLevel: 22, gain: "Value II" },
  { level: 92, material: "Silver", masteryLevel: 11, gain: "Waste II" },
  { level: 93, material: "Tin", masteryLevel: 19, gain: "Waste III" },
  { level: 94, material: "Silver", masteryLevel: 12, gain: "Value I" },
  { level: 95, material: "Copper", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 96, material: "Silver", masteryLevel: 13, gain: "Stack II" },
  { level: 97, material: "Tin", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 98, material: "Iron", masteryLevel: 17, gain: "Speed III" },
  { level: 99, material: "Silver", masteryLevel: 14, gain: "Handling II" },
  { level: 100, material: "Gold", masteryLevel: 1, gain: "Unlock" },
  { level: 101, material: "Gold", masteryLevel: 2, gain: "Speed I" },
  { level: 102, material: "Gold", masteryLevel: 3, gain: "Waste I" },
  { level: 103, material: "Gold", masteryLevel: 4, gain: "Stack I" },
  { level: 104, material: "Copper", masteryLevel: 24, gain: "Refined fragments" },
  { level: 105, material: "Gold", masteryLevel: 5, gain: "Handling I" },
  { level: 106, material: "Gold", masteryLevel: 6, gain: "Appraise" },
  { level: 107, material: "Copper", masteryLevel: 25, gain: "Grandmaster" },
  { level: 108, material: "Gold", masteryLevel: 7, gain: "Scavenge I" },
  { level: 109, material: "Gold", masteryLevel: 8, gain: "Container I" },
  { level: 110, material: "Tin", masteryLevel: 21, gain: "Stack III" },
  { level: 111, material: "Gold", masteryLevel: 9, gain: "Speed II" },
  { level: 112, material: "Gold", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 113, material: "Tin", masteryLevel: 22, gain: "Value II" },
  { level: 114, material: "Iron", masteryLevel: 18, gain: "Container II" },
  { level: 115, material: "Gold", masteryLevel: 11, gain: "Waste II" },
  { level: 116, material: "Gold", masteryLevel: 12, gain: "Value I" },
  { level: 117, material: "Tin", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 118, material: "Iron", masteryLevel: 19, gain: "Waste III" },
  { level: 119, material: "Silver", masteryLevel: 15, gain: "Scavenge II" },
  { level: 120, material: "Mithril", masteryLevel: 1, gain: "Unlock" },
  { level: 121, material: "Mithril", masteryLevel: 2, gain: "Speed I" },
  { level: 122, material: "Mithril", masteryLevel: 3, gain: "Waste I" },
  { level: 123, material: "Mithril", masteryLevel: 4, gain: "Stack I" },
  { level: 124, material: "Mithril", masteryLevel: 5, gain: "Handling I" },
  { level: 125, material: "Tin", masteryLevel: 24, gain: "Refined fragments" },
  { level: 126, material: "Mithril", masteryLevel: 6, gain: "Appraise" },
  { level: 127, material: "Mithril", masteryLevel: 7, gain: "Scavenge I" },
  { level: 128, material: "Tin", masteryLevel: 25, gain: "Grandmaster" },
  { level: 129, material: "Iron", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 130, material: "Mithril", masteryLevel: 8, gain: "Container I" },
  { level: 131, material: "Mithril", masteryLevel: 9, gain: "Speed II" },
  { level: 132, material: "Iron", masteryLevel: 21, gain: "Stack III" },
  { level: 133, material: "Silver", masteryLevel: 16, gain: "Careful" },
  { level: 134, material: "Mithril", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 135, material: "Gold", masteryLevel: 13, gain: "Stack II" },
  { level: 136, material: "Iron", masteryLevel: 22, gain: "Value II" },
  { level: 137, material: "Silver", masteryLevel: 17, gain: "Speed III" },
  { level: 138, material: "Mithril", masteryLevel: 11, gain: "Waste II" },
  { level: 139, material: "Gold", masteryLevel: 14, gain: "Handling II" },
  { level: 140, material: "Obsidium", masteryLevel: 1, gain: "Unlock" },
  { level: 141, material: "Obsidium", masteryLevel: 2, gain: "Speed I" },
  { level: 142, material: "Obsidium", masteryLevel: 3, gain: "Waste I" },
  { level: 143, material: "Obsidium", masteryLevel: 4, gain: "Stack I" },
  { level: 144, material: "Iron", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 145, material: "Obsidium", masteryLevel: 5, gain: "Handling I" },
  { level: 146, material: "Iron", masteryLevel: 24, gain: "Refined fragments" },
  { level: 147, material: "Obsidium", masteryLevel: 6, gain: "Appraise" },
  { level: 148, material: "Obsidium", masteryLevel: 7, gain: "Scavenge I" },
  { level: 149, material: "Iron", masteryLevel: 25, gain: "Grandmaster" },
  { level: 150, material: "Silver", masteryLevel: 18, gain: "Container II" },
  { level: 151, material: "Obsidium", masteryLevel: 8, gain: "Container I" },
  { level: 152, material: "Silver", masteryLevel: 19, gain: "Waste III" },
  { level: 153, material: "Obsidium", masteryLevel: 9, gain: "Speed II" },
  { level: 154, material: "Silver", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 155, material: "Gold", masteryLevel: 15, gain: "Scavenge II" },
  { level: 156, material: "Obsidium", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 157, material: "Mithril", masteryLevel: 12, gain: "Value I" },
  { level: 158, material: "Silver", masteryLevel: 21, gain: "Stack III" },
  { level: 159, material: "Gold", masteryLevel: 16, gain: "Careful" },
  { level: 160, material: "Obsidium", masteryLevel: 11, gain: "Waste II" },
  { level: 161, material: "Silver", masteryLevel: 22, gain: "Value II" },
  { level: 162, material: "Mithril", masteryLevel: 13, gain: "Stack II" },
  { level: 163, material: "Gold", masteryLevel: 17, gain: "Speed III" },
  { level: 164, material: "Silver", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 165, material: "Obsidium", masteryLevel: 12, gain: "Value I" },
  { level: 166, material: "Mithril", masteryLevel: 14, gain: "Handling II" },
  { level: 167, material: "Silver", masteryLevel: 24, gain: "Refined fragments" },
  { level: 168, material: "Gold", masteryLevel: 18, gain: "Container II" },
  { level: 169, material: "Silver", masteryLevel: 25, gain: "Grandmaster" },
  { level: 170, material: "Gold", masteryLevel: 19, gain: "Waste III" },
  { level: 171, material: "Mithril", masteryLevel: 15, gain: "Scavenge II" },
  { level: 172, material: "Obsidium", masteryLevel: 13, gain: "Stack II" },
  { level: 173, material: "Gold", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 174, material: "Mithril", masteryLevel: 16, gain: "Careful" },
  { level: 175, material: "Obsidium", masteryLevel: 14, gain: "Handling II" },
  { level: 176, material: "Gold", masteryLevel: 21, gain: "Stack III" },
  { level: 177, material: "Mithril", masteryLevel: 17, gain: "Speed III" },
  { level: 178, material: "Gold", masteryLevel: 22, gain: "Value II" },
  { level: 179, material: "Obsidium", masteryLevel: 15, gain: "Scavenge II" },
  { level: 180, material: "Mithril", masteryLevel: 18, gain: "Container II" },
  { level: 181, material: "Gold", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 182, material: "Obsidium", masteryLevel: 16, gain: "Careful" },
  { level: 183, material: "Gold", masteryLevel: 24, gain: "Refined fragments" },
  { level: 184, material: "Mithril", masteryLevel: 19, gain: "Waste III" },
  { level: 185, material: "Gold", masteryLevel: 25, gain: "Grandmaster" },
  { level: 186, material: "Obsidium", masteryLevel: 17, gain: "Speed III" },
  { level: 187, material: "Mithril", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 188, material: "Mithril", masteryLevel: 21, gain: "Stack III" },
  { level: 189, material: "Obsidium", masteryLevel: 18, gain: "Container II" },
  { level: 190, material: "Mithril", masteryLevel: 22, gain: "Value II" },
  { level: 191, material: "Obsidium", masteryLevel: 19, gain: "Waste III" },
  { level: 192, material: "Mithril", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 193, material: "Obsidium", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 194, material: "Mithril", masteryLevel: 24, gain: "Refined fragments" },
  { level: 195, material: "Mithril", masteryLevel: 25, gain: "Grandmaster" },
  { level: 196, material: "Obsidium", masteryLevel: 21, gain: "Stack III" },
  { level: 197, material: "Obsidium", masteryLevel: 22, gain: "Value II" },
  { level: 198, material: "Obsidium", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 199, material: "Obsidium", masteryLevel: 24, gain: "Refined fragments" },
  { level: 200, material: "Obsidium", masteryLevel: 25, gain: "Grandmaster" },
]

/**
 * Build a lookup map for fast access: materialId -> list of (skillLevel, masteryLevel) pairs
 * Sorted by skill level so we can binary search
 */
const MATERIAL_MASTERY_MAP: Map<MaterialID, Array<{ level: number; mastery: number }>> = new Map()

// Initialize the map
for (const entry of MINING_MASTERY_TABLE) {
  if (!MATERIAL_MASTERY_MAP.has(entry.material)) {
    MATERIAL_MASTERY_MAP.set(entry.material, [])
  }
  MATERIAL_MASTERY_MAP.get(entry.material)!.push({
    level: entry.level,
    mastery: entry.masteryLevel,
  })
}

/**
 * Get the mastery level for a material at a given skill level.
 * Returns 0 if the material is not yet unlocked.
 */
export function getMaterialMastery(skillLevel: number, materialId: MaterialID): number {
  const entries = MATERIAL_MASTERY_MAP.get(materialId)
  if (!entries || entries.length === 0) return 0

  // Find the highest mastery level at or below the current skill level
  let mastery = 0
  for (const entry of entries) {
    if (entry.level <= skillLevel) {
      mastery = entry.mastery
    } else {
      break
    }
  }

  return mastery
}

/**
 * Check if a player has unlocked a specific mastery ability for a material.
 */
export function hasMasteryUnlock(
  skillLevel: number,
  materialId: MaterialID,
  gain: MasteryGain
): boolean {
  const currentMastery = getMaterialMastery(skillLevel, materialId)

  // Map gain type to required mastery level
  const requiredMastery: Record<MasteryGain, number> = {
    Unlock: 1,
    Speed_I: 2,
    Waste_I: 3,
    Appraise: 6,
    Speed_II: 9,
    Bonus_I: 10,
    Waste_II: 11,
    Careful: 16,
    Speed_III: 17,
    Waste_III: 19,
    Bonus_II: 20,
  }

  return currentMastery >= requiredMastery[gain]
}

/**
 * Get the speed (ticks) for mining a material based on mastery.
 * Base: 20 ticks
 * Speed I (M2): 15 ticks
 * Speed II (M9): 10 ticks
 * Speed III (M17): 5 ticks
 */
export function getSpeedForMaterial(skillLevel: number, materialId: MaterialID): number {
  if (hasMasteryUnlock(skillLevel, materialId, "Speed_III")) return 5
  if (hasMasteryUnlock(skillLevel, materialId, "Speed_II")) return 10
  if (hasMasteryUnlock(skillLevel, materialId, "Speed_I")) return 15
  return 20 // Base speed
}

/**
 * Get the collateral damage rate for focusing on a material.
 * Base: 40%
 * Waste I (M3): 30%
 * Waste II (M11): 15%
 * Waste III (M19): 5%
 */
export function getCollateralRate(skillLevel: number, materialId: MaterialID): number {
  if (hasMasteryUnlock(skillLevel, materialId, "Waste_III")) return 0.05
  if (hasMasteryUnlock(skillLevel, materialId, "Waste_II")) return 0.15
  if (hasMasteryUnlock(skillLevel, materialId, "Waste_I")) return 0.3
  return 0.4 // Base rate
}

/**
 * Get the bonus yield chance for a material.
 * Base: 0%
 * Bonus I (M10): 5%
 * Bonus II (M20): 10%
 */
export function getBonusYieldChance(skillLevel: number, materialId: MaterialID): number {
  if (hasMasteryUnlock(skillLevel, materialId, "Bonus_II")) return 0.1
  if (hasMasteryUnlock(skillLevel, materialId, "Bonus_I")) return 0.05
  return 0
}

/**
 * Get all materials the player has unlocked at a given skill level
 */
export function getUnlockedMaterials(skillLevel: number): MaterialID[] {
  const materials: MaterialID[] = []
  for (const materialId of MATERIAL_MASTERY_MAP.keys()) {
    if (hasMasteryUnlock(skillLevel, materialId, "Unlock")) {
      materials.push(materialId)
    }
  }
  return materials
}

/**
 * Get all materials the player has Careful unlock for at a given skill level
 */
export function getCarefulMaterials(skillLevel: number): MaterialID[] {
  const materials: MaterialID[] = []
  for (const materialId of MATERIAL_MASTERY_MAP.keys()) {
    if (hasMasteryUnlock(skillLevel, materialId, "Careful")) {
      materials.push(materialId)
    }
  }
  return materials
}

/**
 * Get all materials the player can Appraise at a given skill level
 */
export function getAppraiseMaterials(skillLevel: number): MaterialID[] {
  const materials: MaterialID[] = []
  for (const materialId of MATERIAL_MASTERY_MAP.keys()) {
    if (hasMasteryUnlock(skillLevel, materialId, "Appraise")) {
      materials.push(materialId)
    }
  }
  return materials
}
