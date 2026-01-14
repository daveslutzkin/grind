/**
 * TDD Tests for Phase 1: Mastery Data Model
 *
 * Tests the mastery progression table that maps Mining skill level
 * to per-material mastery gains.
 */

import {
  getMaterialMastery,
  hasMasteryUnlock,
  getSpeedForMaterial,
  getCollateralRate,
  getBonusYieldChance,
} from "./masteryData.js"

describe("Mastery Data Model", () => {
  describe("getMaterialMastery - derives mastery level from skill level", () => {
    // Per mining-levels-1-200.md:
    // L1 = Stone M1, L2 = Stone M2, ... L19 = Stone M19
    // L20 = Copper M1, L21 = Copper M2, ... L39 = Copper M19
    // L37 = Stone M20 (Bonus Yield II)

    it("should return 0 for materials not yet unlocked", () => {
      // Copper unlocks at L20
      expect(getMaterialMastery(15, "Copper")).toBe(0)
      expect(getMaterialMastery(19, "Copper")).toBe(0)
    })

    it("should return M1 (Unlock) at unlock level", () => {
      // Stone unlocks at L1
      expect(getMaterialMastery(1, "Stone")).toBe(1)
      // Copper unlocks at L20
      expect(getMaterialMastery(20, "Copper")).toBe(1)
      // Tin unlocks at L40
      expect(getMaterialMastery(40, "Tin")).toBe(1)
      // Iron unlocks at L60
      expect(getMaterialMastery(60, "Iron")).toBe(1)
    })

    it("should track mastery progression for Stone", () => {
      // Stone M1 at L1, M2 at L2, ... M19 at L19
      expect(getMaterialMastery(1, "Stone")).toBe(1)
      expect(getMaterialMastery(2, "Stone")).toBe(2)
      expect(getMaterialMastery(9, "Stone")).toBe(9)
      expect(getMaterialMastery(10, "Stone")).toBe(10)
      expect(getMaterialMastery(17, "Stone")).toBe(17)
      expect(getMaterialMastery(19, "Stone")).toBe(19)
    })

    it("should cap Stone mastery at M19 until M20 at L37", () => {
      // Stone stays at M19 from L19 until L37 when M20 unlocks
      expect(getMaterialMastery(19, "Stone")).toBe(19)
      expect(getMaterialMastery(20, "Stone")).toBe(19)
      expect(getMaterialMastery(36, "Stone")).toBe(19)
      expect(getMaterialMastery(37, "Stone")).toBe(20)
    })

    it("should track mastery progression for Copper", () => {
      // Copper M1 at L20, M2 at L21, ... M19 at L39
      expect(getMaterialMastery(20, "Copper")).toBe(1)
      expect(getMaterialMastery(21, "Copper")).toBe(2)
      expect(getMaterialMastery(28, "Copper")).toBe(9) // Speed II
      expect(getMaterialMastery(35, "Copper")).toBe(16) // Careful
      expect(getMaterialMastery(36, "Copper")).toBe(17) // Speed III
    })

    it("should handle high-level Stone mastery progression", () => {
      // Per the spec:
      // L37 = Stone M20, L55 = Stone M21, L58 = Stone M22
      // L73 = Stone M23, L78 = Stone M24, L87 = Stone M25
      expect(getMaterialMastery(37, "Stone")).toBe(20)
      expect(getMaterialMastery(55, "Stone")).toBe(21)
      expect(getMaterialMastery(58, "Stone")).toBe(22)
      expect(getMaterialMastery(73, "Stone")).toBe(23)
      expect(getMaterialMastery(78, "Stone")).toBe(24)
      expect(getMaterialMastery(87, "Stone")).toBe(25)
    })
  })

  describe("hasMasteryUnlock - checks specific ability unlocks", () => {
    it("should return true for Unlock at the right level", () => {
      // Stone unlocks at L1
      expect(hasMasteryUnlock(1, "Stone", "Unlock")).toBe(true)
      expect(hasMasteryUnlock(0, "Stone", "Unlock")).toBe(false)
      // Copper unlocks at L20
      expect(hasMasteryUnlock(20, "Copper", "Unlock")).toBe(true)
      expect(hasMasteryUnlock(19, "Copper", "Unlock")).toBe(false)
    })

    it("should return true for Speed_I at M2", () => {
      // Stone Speed_I at L2
      expect(hasMasteryUnlock(2, "Stone", "Speed_I")).toBe(true)
      expect(hasMasteryUnlock(1, "Stone", "Speed_I")).toBe(false)
      // Copper Speed_I at L21
      expect(hasMasteryUnlock(21, "Copper", "Speed_I")).toBe(true)
      expect(hasMasteryUnlock(20, "Copper", "Speed_I")).toBe(false)
    })

    it("should return true for Waste_I at M3", () => {
      // Stone Waste_I at L3
      expect(hasMasteryUnlock(3, "Stone", "Waste_I")).toBe(true)
      expect(hasMasteryUnlock(2, "Stone", "Waste_I")).toBe(false)
    })

    it("should return true for Appraise at M6", () => {
      // Stone Appraise at L6
      expect(hasMasteryUnlock(6, "Stone", "Appraise")).toBe(true)
      expect(hasMasteryUnlock(5, "Stone", "Appraise")).toBe(false)
      // Copper Appraise at L25
      expect(hasMasteryUnlock(25, "Copper", "Appraise")).toBe(true)
      expect(hasMasteryUnlock(24, "Copper", "Appraise")).toBe(false)
    })

    it("should return true for Speed_II at M9", () => {
      // Stone Speed_II at L9
      expect(hasMasteryUnlock(9, "Stone", "Speed_II")).toBe(true)
      expect(hasMasteryUnlock(8, "Stone", "Speed_II")).toBe(false)
    })

    it("should return true for Bonus_I at M10", () => {
      // Stone Bonus_I at L10
      expect(hasMasteryUnlock(10, "Stone", "Bonus_I")).toBe(true)
      expect(hasMasteryUnlock(9, "Stone", "Bonus_I")).toBe(false)
    })

    it("should return true for Waste_II at M11", () => {
      // Stone Waste_II at L11
      expect(hasMasteryUnlock(11, "Stone", "Waste_II")).toBe(true)
      expect(hasMasteryUnlock(10, "Stone", "Waste_II")).toBe(false)
    })

    it("should return true for Careful at M16", () => {
      // Stone Careful at L16
      expect(hasMasteryUnlock(16, "Stone", "Careful")).toBe(true)
      expect(hasMasteryUnlock(15, "Stone", "Careful")).toBe(false)
      // Copper Careful at L35
      expect(hasMasteryUnlock(35, "Copper", "Careful")).toBe(true)
      expect(hasMasteryUnlock(34, "Copper", "Careful")).toBe(false)
    })

    it("should return true for Speed_III at M17", () => {
      // Stone Speed_III at L17
      expect(hasMasteryUnlock(17, "Stone", "Speed_III")).toBe(true)
      expect(hasMasteryUnlock(16, "Stone", "Speed_III")).toBe(false)
      // Copper Speed_III at L36
      expect(hasMasteryUnlock(36, "Copper", "Speed_III")).toBe(true)
      expect(hasMasteryUnlock(35, "Copper", "Speed_III")).toBe(false)
    })

    it("should return true for Waste_III at M19", () => {
      // Stone Waste_III at L19
      expect(hasMasteryUnlock(19, "Stone", "Waste_III")).toBe(true)
      expect(hasMasteryUnlock(18, "Stone", "Waste_III")).toBe(false)
    })

    it("should return true for Bonus_II at M20", () => {
      // Stone Bonus_II at L37
      expect(hasMasteryUnlock(37, "Stone", "Bonus_II")).toBe(true)
      expect(hasMasteryUnlock(36, "Stone", "Bonus_II")).toBe(false)
    })
  })

  describe("getSpeedForMaterial - returns ticks based on mastery", () => {
    it("should return 20 ticks at base (no Speed mastery)", () => {
      expect(getSpeedForMaterial(1, "Stone")).toBe(20)
      expect(getSpeedForMaterial(20, "Copper")).toBe(20) // Copper just unlocked
    })

    it("should return 15 ticks with Speed_I (M2)", () => {
      expect(getSpeedForMaterial(2, "Stone")).toBe(15)
      expect(getSpeedForMaterial(21, "Copper")).toBe(15)
    })

    it("should return 10 ticks with Speed_II (M9)", () => {
      expect(getSpeedForMaterial(9, "Stone")).toBe(10)
      expect(getSpeedForMaterial(28, "Copper")).toBe(10)
    })

    it("should return 5 ticks with Speed_III (M17)", () => {
      expect(getSpeedForMaterial(17, "Stone")).toBe(5)
      expect(getSpeedForMaterial(36, "Copper")).toBe(5)
    })
  })

  describe("getCollateralRate - returns waste percentage based on mastery", () => {
    it("should return 0.40 (40%) at base (no Waste mastery)", () => {
      expect(getCollateralRate(1, "Stone")).toBe(0.4)
      expect(getCollateralRate(20, "Copper")).toBe(0.4)
    })

    it("should return 0.30 (30%) with Waste_I (M3)", () => {
      expect(getCollateralRate(3, "Stone")).toBe(0.3)
      expect(getCollateralRate(22, "Copper")).toBe(0.3)
    })

    it("should return 0.15 (15%) with Waste_II (M11)", () => {
      expect(getCollateralRate(11, "Stone")).toBe(0.15)
      expect(getCollateralRate(30, "Copper")).toBe(0.15)
    })

    it("should return 0.05 (5%) with Waste_III (M19)", () => {
      expect(getCollateralRate(19, "Stone")).toBe(0.05)
      expect(getCollateralRate(39, "Copper")).toBe(0.05)
    })
  })

  describe("getBonusYieldChance - returns double yield probability", () => {
    it("should return 0 at base (no Bonus mastery)", () => {
      expect(getBonusYieldChance(9, "Stone")).toBe(0)
      expect(getBonusYieldChance(28, "Copper")).toBe(0)
    })

    it("should return 0.05 (5%) with Bonus_I (M10)", () => {
      expect(getBonusYieldChance(10, "Stone")).toBe(0.05)
      expect(getBonusYieldChance(29, "Copper")).toBe(0.05)
    })

    it("should return 0.10 (10%) with Bonus_II (M20)", () => {
      expect(getBonusYieldChance(37, "Stone")).toBe(0.1) // Stone M20 at L37
      expect(getBonusYieldChance(59, "Copper")).toBe(0.1) // Copper M20 at L59
    })
  })
})
