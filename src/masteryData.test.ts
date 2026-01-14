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
      // COPPER_ORE unlocks at L20
      expect(getMaterialMastery(15, "COPPER_ORE")).toBe(0)
      expect(getMaterialMastery(19, "COPPER_ORE")).toBe(0)
    })

    it("should return M1 (Unlock) at unlock level", () => {
      // STONE unlocks at L1
      expect(getMaterialMastery(1, "STONE")).toBe(1)
      // COPPER_ORE unlocks at L20
      expect(getMaterialMastery(20, "COPPER_ORE")).toBe(1)
      // TIN_ORE unlocks at L40
      expect(getMaterialMastery(40, "TIN_ORE")).toBe(1)
      // IRON_ORE unlocks at L60
      expect(getMaterialMastery(60, "IRON_ORE")).toBe(1)
    })

    it("should track mastery progression for STONE", () => {
      // STONE M1 at L1, M2 at L2, ... M19 at L19
      expect(getMaterialMastery(1, "STONE")).toBe(1)
      expect(getMaterialMastery(2, "STONE")).toBe(2)
      expect(getMaterialMastery(9, "STONE")).toBe(9)
      expect(getMaterialMastery(10, "STONE")).toBe(10)
      expect(getMaterialMastery(17, "STONE")).toBe(17)
      expect(getMaterialMastery(19, "STONE")).toBe(19)
    })

    it("should cap STONE mastery at M19 until M20 at L37", () => {
      // STONE stays at M19 from L19 until L37 when M20 unlocks
      expect(getMaterialMastery(19, "STONE")).toBe(19)
      expect(getMaterialMastery(20, "STONE")).toBe(19)
      expect(getMaterialMastery(36, "STONE")).toBe(19)
      expect(getMaterialMastery(37, "STONE")).toBe(20)
    })

    it("should track mastery progression for COPPER_ORE", () => {
      // COPPER_ORE M1 at L20, M2 at L21, ... M19 at L39
      expect(getMaterialMastery(20, "COPPER_ORE")).toBe(1)
      expect(getMaterialMastery(21, "COPPER_ORE")).toBe(2)
      expect(getMaterialMastery(28, "COPPER_ORE")).toBe(9) // Speed II
      expect(getMaterialMastery(35, "COPPER_ORE")).toBe(16) // Careful
      expect(getMaterialMastery(36, "COPPER_ORE")).toBe(17) // Speed III
    })

    it("should handle high-level STONE mastery progression", () => {
      // Per the spec:
      // L37 = STONE M20, L55 = STONE M21, L58 = STONE M22
      // L73 = STONE M23, L78 = STONE M24, L87 = STONE M25
      expect(getMaterialMastery(37, "STONE")).toBe(20)
      expect(getMaterialMastery(55, "STONE")).toBe(21)
      expect(getMaterialMastery(58, "STONE")).toBe(22)
      expect(getMaterialMastery(73, "STONE")).toBe(23)
      expect(getMaterialMastery(78, "STONE")).toBe(24)
      expect(getMaterialMastery(87, "STONE")).toBe(25)
    })
  })

  describe("hasMasteryUnlock - checks specific ability unlocks", () => {
    it("should return true for Unlock at the right level", () => {
      // STONE unlocks at L1
      expect(hasMasteryUnlock(1, "STONE", "Unlock")).toBe(true)
      expect(hasMasteryUnlock(0, "STONE", "Unlock")).toBe(false)
      // COPPER_ORE unlocks at L20
      expect(hasMasteryUnlock(20, "COPPER_ORE", "Unlock")).toBe(true)
      expect(hasMasteryUnlock(19, "COPPER_ORE", "Unlock")).toBe(false)
    })

    it("should return true for Speed_I at M2", () => {
      // STONE Speed_I at L2
      expect(hasMasteryUnlock(2, "STONE", "Speed_I")).toBe(true)
      expect(hasMasteryUnlock(1, "STONE", "Speed_I")).toBe(false)
      // COPPER_ORE Speed_I at L21
      expect(hasMasteryUnlock(21, "COPPER_ORE", "Speed_I")).toBe(true)
      expect(hasMasteryUnlock(20, "COPPER_ORE", "Speed_I")).toBe(false)
    })

    it("should return true for Waste_I at M3", () => {
      // STONE Waste_I at L3
      expect(hasMasteryUnlock(3, "STONE", "Waste_I")).toBe(true)
      expect(hasMasteryUnlock(2, "STONE", "Waste_I")).toBe(false)
    })

    it("should return true for Appraise at M6", () => {
      // STONE Appraise at L6
      expect(hasMasteryUnlock(6, "STONE", "Appraise")).toBe(true)
      expect(hasMasteryUnlock(5, "STONE", "Appraise")).toBe(false)
      // COPPER_ORE Appraise at L25
      expect(hasMasteryUnlock(25, "COPPER_ORE", "Appraise")).toBe(true)
      expect(hasMasteryUnlock(24, "COPPER_ORE", "Appraise")).toBe(false)
    })

    it("should return true for Speed_II at M9", () => {
      // STONE Speed_II at L9
      expect(hasMasteryUnlock(9, "STONE", "Speed_II")).toBe(true)
      expect(hasMasteryUnlock(8, "STONE", "Speed_II")).toBe(false)
    })

    it("should return true for Bonus_I at M10", () => {
      // STONE Bonus_I at L10
      expect(hasMasteryUnlock(10, "STONE", "Bonus_I")).toBe(true)
      expect(hasMasteryUnlock(9, "STONE", "Bonus_I")).toBe(false)
    })

    it("should return true for Waste_II at M11", () => {
      // STONE Waste_II at L11
      expect(hasMasteryUnlock(11, "STONE", "Waste_II")).toBe(true)
      expect(hasMasteryUnlock(10, "STONE", "Waste_II")).toBe(false)
    })

    it("should return true for Careful at M16", () => {
      // STONE Careful at L16
      expect(hasMasteryUnlock(16, "STONE", "Careful")).toBe(true)
      expect(hasMasteryUnlock(15, "STONE", "Careful")).toBe(false)
      // COPPER_ORE Careful at L35
      expect(hasMasteryUnlock(35, "COPPER_ORE", "Careful")).toBe(true)
      expect(hasMasteryUnlock(34, "COPPER_ORE", "Careful")).toBe(false)
    })

    it("should return true for Speed_III at M17", () => {
      // STONE Speed_III at L17
      expect(hasMasteryUnlock(17, "STONE", "Speed_III")).toBe(true)
      expect(hasMasteryUnlock(16, "STONE", "Speed_III")).toBe(false)
      // COPPER_ORE Speed_III at L36
      expect(hasMasteryUnlock(36, "COPPER_ORE", "Speed_III")).toBe(true)
      expect(hasMasteryUnlock(35, "COPPER_ORE", "Speed_III")).toBe(false)
    })

    it("should return true for Waste_III at M19", () => {
      // STONE Waste_III at L19
      expect(hasMasteryUnlock(19, "STONE", "Waste_III")).toBe(true)
      expect(hasMasteryUnlock(18, "STONE", "Waste_III")).toBe(false)
    })

    it("should return true for Bonus_II at M20", () => {
      // STONE Bonus_II at L37
      expect(hasMasteryUnlock(37, "STONE", "Bonus_II")).toBe(true)
      expect(hasMasteryUnlock(36, "STONE", "Bonus_II")).toBe(false)
    })
  })

  describe("getSpeedForMaterial - returns ticks based on mastery", () => {
    it("should return 20 ticks at base (no Speed mastery)", () => {
      expect(getSpeedForMaterial(1, "STONE")).toBe(20)
      expect(getSpeedForMaterial(20, "COPPER_ORE")).toBe(20) // COPPER_ORE just unlocked
    })

    it("should return 15 ticks with Speed_I (M2)", () => {
      expect(getSpeedForMaterial(2, "STONE")).toBe(15)
      expect(getSpeedForMaterial(21, "COPPER_ORE")).toBe(15)
    })

    it("should return 10 ticks with Speed_II (M9)", () => {
      expect(getSpeedForMaterial(9, "STONE")).toBe(10)
      expect(getSpeedForMaterial(28, "COPPER_ORE")).toBe(10)
    })

    it("should return 5 ticks with Speed_III (M17)", () => {
      expect(getSpeedForMaterial(17, "STONE")).toBe(5)
      expect(getSpeedForMaterial(36, "COPPER_ORE")).toBe(5)
    })
  })

  describe("getCollateralRate - returns waste percentage based on mastery", () => {
    it("should return 0.40 (40%) at base (no Waste mastery)", () => {
      expect(getCollateralRate(1, "STONE")).toBe(0.4)
      expect(getCollateralRate(20, "COPPER_ORE")).toBe(0.4)
    })

    it("should return 0.30 (30%) with Waste_I (M3)", () => {
      expect(getCollateralRate(3, "STONE")).toBe(0.3)
      expect(getCollateralRate(22, "COPPER_ORE")).toBe(0.3)
    })

    it("should return 0.15 (15%) with Waste_II (M11)", () => {
      expect(getCollateralRate(11, "STONE")).toBe(0.15)
      expect(getCollateralRate(30, "COPPER_ORE")).toBe(0.15)
    })

    it("should return 0.05 (5%) with Waste_III (M19)", () => {
      expect(getCollateralRate(19, "STONE")).toBe(0.05)
      expect(getCollateralRate(39, "COPPER_ORE")).toBe(0.05)
    })
  })

  describe("getBonusYieldChance - returns double yield probability", () => {
    it("should return 0 at base (no Bonus mastery)", () => {
      expect(getBonusYieldChance(9, "STONE")).toBe(0)
      expect(getBonusYieldChance(28, "COPPER_ORE")).toBe(0)
    })

    it("should return 0.05 (5%) with Bonus_I (M10)", () => {
      expect(getBonusYieldChance(10, "STONE")).toBe(0.05)
      expect(getBonusYieldChance(29, "COPPER_ORE")).toBe(0.05)
    })

    it("should return 0.10 (10%) with Bonus_II (M20)", () => {
      expect(getBonusYieldChance(37, "STONE")).toBe(0.1) // STONE M20 at L37
      expect(getBonusYieldChance(59, "COPPER_ORE")).toBe(0.1) // COPPER_ORE M20 at L59
    })
  })
})
