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
  { level: 1, material: "STONE", masteryLevel: 1, gain: "Unlock" },
  { level: 2, material: "STONE", masteryLevel: 2, gain: "Speed I" },
  { level: 3, material: "STONE", masteryLevel: 3, gain: "Waste I" },
  { level: 4, material: "STONE", masteryLevel: 4, gain: "Stack I" },
  { level: 5, material: "STONE", masteryLevel: 5, gain: "Handling I" },
  { level: 6, material: "STONE", masteryLevel: 6, gain: "Appraise" },
  { level: 7, material: "STONE", masteryLevel: 7, gain: "Scavenge I" },
  { level: 8, material: "STONE", masteryLevel: 8, gain: "Container I" },
  { level: 9, material: "STONE", masteryLevel: 9, gain: "Speed II" },
  { level: 10, material: "STONE", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 11, material: "STONE", masteryLevel: 11, gain: "Waste II" },
  { level: 12, material: "STONE", masteryLevel: 12, gain: "Value I" },
  { level: 13, material: "STONE", masteryLevel: 13, gain: "Stack II" },
  { level: 14, material: "STONE", masteryLevel: 14, gain: "Handling II" },
  { level: 15, material: "STONE", masteryLevel: 15, gain: "Scavenge II" },
  { level: 16, material: "STONE", masteryLevel: 16, gain: "Careful" },
  { level: 17, material: "STONE", masteryLevel: 17, gain: "Speed III" },
  { level: 18, material: "STONE", masteryLevel: 18, gain: "Container II" },
  { level: 19, material: "STONE", masteryLevel: 19, gain: "Waste III" },
  { level: 20, material: "COPPER_ORE", masteryLevel: 1, gain: "Unlock" },
  { level: 21, material: "COPPER_ORE", masteryLevel: 2, gain: "Speed I" },
  { level: 22, material: "COPPER_ORE", masteryLevel: 3, gain: "Waste I" },
  { level: 23, material: "COPPER_ORE", masteryLevel: 4, gain: "Stack I" },
  { level: 24, material: "COPPER_ORE", masteryLevel: 5, gain: "Handling I" },
  { level: 25, material: "COPPER_ORE", masteryLevel: 6, gain: "Appraise" },
  { level: 26, material: "COPPER_ORE", masteryLevel: 7, gain: "Scavenge I" },
  { level: 27, material: "COPPER_ORE", masteryLevel: 8, gain: "Container I" },
  { level: 28, material: "COPPER_ORE", masteryLevel: 9, gain: "Speed II" },
  { level: 29, material: "COPPER_ORE", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 30, material: "COPPER_ORE", masteryLevel: 11, gain: "Waste II" },
  { level: 31, material: "COPPER_ORE", masteryLevel: 12, gain: "Value I" },
  { level: 32, material: "COPPER_ORE", masteryLevel: 13, gain: "Stack II" },
  { level: 33, material: "COPPER_ORE", masteryLevel: 14, gain: "Handling II" },
  { level: 34, material: "COPPER_ORE", masteryLevel: 15, gain: "Scavenge II" },
  { level: 35, material: "COPPER_ORE", masteryLevel: 16, gain: "Careful" },
  { level: 36, material: "COPPER_ORE", masteryLevel: 17, gain: "Speed III" },
  { level: 37, material: "STONE", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 38, material: "COPPER_ORE", masteryLevel: 18, gain: "Container II" },
  { level: 39, material: "COPPER_ORE", masteryLevel: 19, gain: "Waste III" },
  { level: 40, material: "TIN_ORE", masteryLevel: 1, gain: "Unlock" },
  { level: 41, material: "TIN_ORE", masteryLevel: 2, gain: "Speed I" },
  { level: 42, material: "TIN_ORE", masteryLevel: 3, gain: "Waste I" },
  { level: 43, material: "TIN_ORE", masteryLevel: 4, gain: "Stack I" },
  { level: 44, material: "TIN_ORE", masteryLevel: 5, gain: "Handling I" },
  { level: 45, material: "TIN_ORE", masteryLevel: 6, gain: "Appraise" },
  { level: 46, material: "TIN_ORE", masteryLevel: 7, gain: "Scavenge I" },
  { level: 47, material: "TIN_ORE", masteryLevel: 8, gain: "Container I" },
  { level: 48, material: "TIN_ORE", masteryLevel: 9, gain: "Speed II" },
  { level: 49, material: "TIN_ORE", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 50, material: "TIN_ORE", masteryLevel: 11, gain: "Waste II" },
  { level: 51, material: "TIN_ORE", masteryLevel: 12, gain: "Value I" },
  { level: 52, material: "TIN_ORE", masteryLevel: 13, gain: "Stack II" },
  { level: 53, material: "TIN_ORE", masteryLevel: 14, gain: "Handling II" },
  { level: 54, material: "TIN_ORE", masteryLevel: 15, gain: "Scavenge II" },
  { level: 55, material: "STONE", masteryLevel: 21, gain: "Stack III" },
  { level: 56, material: "TIN_ORE", masteryLevel: 16, gain: "Careful" },
  { level: 57, material: "TIN_ORE", masteryLevel: 17, gain: "Speed III" },
  { level: 58, material: "STONE", masteryLevel: 22, gain: "Value II" },
  { level: 59, material: "COPPER_ORE", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 60, material: "IRON_ORE", masteryLevel: 1, gain: "Unlock" },
  { level: 61, material: "IRON_ORE", masteryLevel: 2, gain: "Speed I" },
  { level: 62, material: "IRON_ORE", masteryLevel: 3, gain: "Waste I" },
  { level: 63, material: "IRON_ORE", masteryLevel: 4, gain: "Stack I" },
  { level: 64, material: "IRON_ORE", masteryLevel: 5, gain: "Handling I" },
  { level: 65, material: "IRON_ORE", masteryLevel: 6, gain: "Appraise" },
  { level: 66, material: "IRON_ORE", masteryLevel: 7, gain: "Scavenge I" },
  { level: 67, material: "IRON_ORE", masteryLevel: 8, gain: "Container I" },
  { level: 68, material: "IRON_ORE", masteryLevel: 9, gain: "Speed II" },
  { level: 69, material: "IRON_ORE", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 70, material: "IRON_ORE", masteryLevel: 11, gain: "Waste II" },
  { level: 71, material: "IRON_ORE", masteryLevel: 12, gain: "Value I" },
  { level: 72, material: "IRON_ORE", masteryLevel: 13, gain: "Stack II" },
  { level: 73, material: "STONE", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 74, material: "IRON_ORE", masteryLevel: 14, gain: "Handling II" },
  { level: 75, material: "IRON_ORE", masteryLevel: 15, gain: "Scavenge II" },
  { level: 76, material: "TIN_ORE", masteryLevel: 18, gain: "Container II" },
  { level: 77, material: "COPPER_ORE", masteryLevel: 21, gain: "Stack III" },
  { level: 78, material: "STONE", masteryLevel: 24, gain: "Refined fragments" },
  { level: 79, material: "IRON_ORE", masteryLevel: 16, gain: "Careful" },
  { level: 80, material: "SILVER_ORE", masteryLevel: 1, gain: "Unlock" },
  { level: 81, material: "SILVER_ORE", masteryLevel: 2, gain: "Speed I" },
  { level: 82, material: "SILVER_ORE", masteryLevel: 3, gain: "Waste I" },
  { level: 83, material: "SILVER_ORE", masteryLevel: 4, gain: "Stack I" },
  { level: 84, material: "SILVER_ORE", masteryLevel: 5, gain: "Handling I" },
  { level: 85, material: "SILVER_ORE", masteryLevel: 6, gain: "Appraise" },
  { level: 86, material: "SILVER_ORE", masteryLevel: 7, gain: "Scavenge I" },
  { level: 87, material: "STONE", masteryLevel: 25, gain: "Grandmaster" },
  { level: 88, material: "SILVER_ORE", masteryLevel: 8, gain: "Container I" },
  { level: 89, material: "SILVER_ORE", masteryLevel: 9, gain: "Speed II" },
  { level: 90, material: "SILVER_ORE", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 91, material: "COPPER_ORE", masteryLevel: 22, gain: "Value II" },
  { level: 92, material: "SILVER_ORE", masteryLevel: 11, gain: "Waste II" },
  { level: 93, material: "TIN_ORE", masteryLevel: 19, gain: "Waste III" },
  { level: 94, material: "SILVER_ORE", masteryLevel: 12, gain: "Value I" },
  { level: 95, material: "COPPER_ORE", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 96, material: "SILVER_ORE", masteryLevel: 13, gain: "Stack II" },
  { level: 97, material: "TIN_ORE", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 98, material: "IRON_ORE", masteryLevel: 17, gain: "Speed III" },
  { level: 99, material: "SILVER_ORE", masteryLevel: 14, gain: "Handling II" },
  { level: 100, material: "GOLD_ORE", masteryLevel: 1, gain: "Unlock" },
  { level: 101, material: "GOLD_ORE", masteryLevel: 2, gain: "Speed I" },
  { level: 102, material: "GOLD_ORE", masteryLevel: 3, gain: "Waste I" },
  { level: 103, material: "GOLD_ORE", masteryLevel: 4, gain: "Stack I" },
  { level: 104, material: "COPPER_ORE", masteryLevel: 24, gain: "Refined fragments" },
  { level: 105, material: "GOLD_ORE", masteryLevel: 5, gain: "Handling I" },
  { level: 106, material: "GOLD_ORE", masteryLevel: 6, gain: "Appraise" },
  { level: 107, material: "COPPER_ORE", masteryLevel: 25, gain: "Grandmaster" },
  { level: 108, material: "GOLD_ORE", masteryLevel: 7, gain: "Scavenge I" },
  { level: 109, material: "GOLD_ORE", masteryLevel: 8, gain: "Container I" },
  { level: 110, material: "TIN_ORE", masteryLevel: 21, gain: "Stack III" },
  { level: 111, material: "GOLD_ORE", masteryLevel: 9, gain: "Speed II" },
  { level: 112, material: "GOLD_ORE", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 113, material: "TIN_ORE", masteryLevel: 22, gain: "Value II" },
  { level: 114, material: "IRON_ORE", masteryLevel: 18, gain: "Container II" },
  { level: 115, material: "GOLD_ORE", masteryLevel: 11, gain: "Waste II" },
  { level: 116, material: "GOLD_ORE", masteryLevel: 12, gain: "Value I" },
  { level: 117, material: "TIN_ORE", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 118, material: "IRON_ORE", masteryLevel: 19, gain: "Waste III" },
  { level: 119, material: "SILVER_ORE", masteryLevel: 15, gain: "Scavenge II" },
  { level: 120, material: "MITHRIL_ORE", masteryLevel: 1, gain: "Unlock" },
  { level: 121, material: "MITHRIL_ORE", masteryLevel: 2, gain: "Speed I" },
  { level: 122, material: "MITHRIL_ORE", masteryLevel: 3, gain: "Waste I" },
  { level: 123, material: "MITHRIL_ORE", masteryLevel: 4, gain: "Stack I" },
  { level: 124, material: "MITHRIL_ORE", masteryLevel: 5, gain: "Handling I" },
  { level: 125, material: "TIN_ORE", masteryLevel: 24, gain: "Refined fragments" },
  { level: 126, material: "MITHRIL_ORE", masteryLevel: 6, gain: "Appraise" },
  { level: 127, material: "MITHRIL_ORE", masteryLevel: 7, gain: "Scavenge I" },
  { level: 128, material: "TIN_ORE", masteryLevel: 25, gain: "Grandmaster" },
  { level: 129, material: "IRON_ORE", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 130, material: "MITHRIL_ORE", masteryLevel: 8, gain: "Container I" },
  { level: 131, material: "MITHRIL_ORE", masteryLevel: 9, gain: "Speed II" },
  { level: 132, material: "IRON_ORE", masteryLevel: 21, gain: "Stack III" },
  { level: 133, material: "SILVER_ORE", masteryLevel: 16, gain: "Careful" },
  { level: 134, material: "MITHRIL_ORE", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 135, material: "GOLD_ORE", masteryLevel: 13, gain: "Stack II" },
  { level: 136, material: "IRON_ORE", masteryLevel: 22, gain: "Value II" },
  { level: 137, material: "SILVER_ORE", masteryLevel: 17, gain: "Speed III" },
  { level: 138, material: "MITHRIL_ORE", masteryLevel: 11, gain: "Waste II" },
  { level: 139, material: "GOLD_ORE", masteryLevel: 14, gain: "Handling II" },
  { level: 140, material: "OBSIDIUM_ORE", masteryLevel: 1, gain: "Unlock" },
  { level: 141, material: "OBSIDIUM_ORE", masteryLevel: 2, gain: "Speed I" },
  { level: 142, material: "OBSIDIUM_ORE", masteryLevel: 3, gain: "Waste I" },
  { level: 143, material: "OBSIDIUM_ORE", masteryLevel: 4, gain: "Stack I" },
  { level: 144, material: "IRON_ORE", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 145, material: "OBSIDIUM_ORE", masteryLevel: 5, gain: "Handling I" },
  { level: 146, material: "IRON_ORE", masteryLevel: 24, gain: "Refined fragments" },
  { level: 147, material: "OBSIDIUM_ORE", masteryLevel: 6, gain: "Appraise" },
  { level: 148, material: "OBSIDIUM_ORE", masteryLevel: 7, gain: "Scavenge I" },
  { level: 149, material: "IRON_ORE", masteryLevel: 25, gain: "Grandmaster" },
  { level: 150, material: "SILVER_ORE", masteryLevel: 18, gain: "Container II" },
  { level: 151, material: "OBSIDIUM_ORE", masteryLevel: 8, gain: "Container I" },
  { level: 152, material: "SILVER_ORE", masteryLevel: 19, gain: "Waste III" },
  { level: 153, material: "OBSIDIUM_ORE", masteryLevel: 9, gain: "Speed II" },
  { level: 154, material: "SILVER_ORE", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 155, material: "GOLD_ORE", masteryLevel: 15, gain: "Scavenge II" },
  { level: 156, material: "OBSIDIUM_ORE", masteryLevel: 10, gain: "Bonus Yield I" },
  { level: 157, material: "MITHRIL_ORE", masteryLevel: 12, gain: "Value I" },
  { level: 158, material: "SILVER_ORE", masteryLevel: 21, gain: "Stack III" },
  { level: 159, material: "GOLD_ORE", masteryLevel: 16, gain: "Careful" },
  { level: 160, material: "OBSIDIUM_ORE", masteryLevel: 11, gain: "Waste II" },
  { level: 161, material: "SILVER_ORE", masteryLevel: 22, gain: "Value II" },
  { level: 162, material: "MITHRIL_ORE", masteryLevel: 13, gain: "Stack II" },
  { level: 163, material: "GOLD_ORE", masteryLevel: 17, gain: "Speed III" },
  { level: 164, material: "SILVER_ORE", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 165, material: "OBSIDIUM_ORE", masteryLevel: 12, gain: "Value I" },
  { level: 166, material: "MITHRIL_ORE", masteryLevel: 14, gain: "Handling II" },
  { level: 167, material: "SILVER_ORE", masteryLevel: 24, gain: "Refined fragments" },
  { level: 168, material: "GOLD_ORE", masteryLevel: 18, gain: "Container II" },
  { level: 169, material: "SILVER_ORE", masteryLevel: 25, gain: "Grandmaster" },
  { level: 170, material: "GOLD_ORE", masteryLevel: 19, gain: "Waste III" },
  { level: 171, material: "MITHRIL_ORE", masteryLevel: 15, gain: "Scavenge II" },
  { level: 172, material: "OBSIDIUM_ORE", masteryLevel: 13, gain: "Stack II" },
  { level: 173, material: "GOLD_ORE", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 174, material: "MITHRIL_ORE", masteryLevel: 16, gain: "Careful" },
  { level: 175, material: "OBSIDIUM_ORE", masteryLevel: 14, gain: "Handling II" },
  { level: 176, material: "GOLD_ORE", masteryLevel: 21, gain: "Stack III" },
  { level: 177, material: "MITHRIL_ORE", masteryLevel: 17, gain: "Speed III" },
  { level: 178, material: "GOLD_ORE", masteryLevel: 22, gain: "Value II" },
  { level: 179, material: "OBSIDIUM_ORE", masteryLevel: 15, gain: "Scavenge II" },
  { level: 180, material: "MITHRIL_ORE", masteryLevel: 18, gain: "Container II" },
  { level: 181, material: "GOLD_ORE", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 182, material: "OBSIDIUM_ORE", masteryLevel: 16, gain: "Careful" },
  { level: 183, material: "GOLD_ORE", masteryLevel: 24, gain: "Refined fragments" },
  { level: 184, material: "MITHRIL_ORE", masteryLevel: 19, gain: "Waste III" },
  { level: 185, material: "GOLD_ORE", masteryLevel: 25, gain: "Grandmaster" },
  { level: 186, material: "OBSIDIUM_ORE", masteryLevel: 17, gain: "Speed III" },
  { level: 187, material: "MITHRIL_ORE", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 188, material: "MITHRIL_ORE", masteryLevel: 21, gain: "Stack III" },
  { level: 189, material: "OBSIDIUM_ORE", masteryLevel: 18, gain: "Container II" },
  { level: 190, material: "MITHRIL_ORE", masteryLevel: 22, gain: "Value II" },
  { level: 191, material: "OBSIDIUM_ORE", masteryLevel: 19, gain: "Waste III" },
  { level: 192, material: "MITHRIL_ORE", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 193, material: "OBSIDIUM_ORE", masteryLevel: 20, gain: "Bonus Yield II" },
  { level: 194, material: "MITHRIL_ORE", masteryLevel: 24, gain: "Refined fragments" },
  { level: 195, material: "MITHRIL_ORE", masteryLevel: 25, gain: "Grandmaster" },
  { level: 196, material: "OBSIDIUM_ORE", masteryLevel: 21, gain: "Stack III" },
  { level: 197, material: "OBSIDIUM_ORE", masteryLevel: 22, gain: "Value II" },
  { level: 198, material: "OBSIDIUM_ORE", masteryLevel: 23, gain: "Ignore minor penalties" },
  { level: 199, material: "OBSIDIUM_ORE", masteryLevel: 24, gain: "Refined fragments" },
  { level: 200, material: "OBSIDIUM_ORE", masteryLevel: 25, gain: "Grandmaster" },
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
 * For materials not in the mining mastery table (e.g., woodcutting),
 * returns a mastery level based on skill level as a fallback.
 */
export function getMaterialMastery(skillLevel: number, materialId: MaterialID): number {
  const entries = MATERIAL_MASTERY_MAP.get(materialId)

  // For materials not in the mastery table (e.g., woodcutting), use skill level directly
  // This provides backwards compatibility with non-mining materials
  if (!entries || entries.length === 0) {
    return skillLevel > 0 ? skillLevel : 0
  }

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
 * For materials not in the mastery table, uses skill level as mastery level.
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
