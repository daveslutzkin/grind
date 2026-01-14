/**
 * Tests for action validation checks
 */

import { getLocationSkillRequirement } from "./actionChecks.js"

describe("actionChecks", () => {
  describe("getLocationSkillRequirement", () => {
    it("should return 1 for TOWN (no gating)", () => {
      expect(getLocationSkillRequirement("TOWN")).toBe(1)
    })

    it("should return 1 for distance 1 areas (no gating)", () => {
      expect(getLocationSkillRequirement("area-d1-i0")).toBe(1)
      expect(getLocationSkillRequirement("area-d1-i3")).toBe(1)
    })

    it("should return 1 for distance 2 areas (no location-based gating)", () => {
      // Per mining-levels-1-200.md, material levels control progression, not location access
      expect(getLocationSkillRequirement("area-d2-i0")).toBe(1)
      expect(getLocationSkillRequirement("area-d2-i5")).toBe(1)
    })

    it("should return 1 for distance 3+ areas (no location-based gating)", () => {
      // Per mining-levels-1-200.md, material levels control progression, not location access
      expect(getLocationSkillRequirement("area-d3-i0")).toBe(1)
      expect(getLocationSkillRequirement("area-d4-i2")).toBe(1)
      expect(getLocationSkillRequirement("area-d10-i0")).toBe(1)
    })

    it("should return 1 for any unknown location ID", () => {
      expect(getLocationSkillRequirement("unknown-location")).toBe(1)
      expect(getLocationSkillRequirement("")).toBe(1)
    })
  })
})
