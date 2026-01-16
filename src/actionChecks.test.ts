/**
 * Tests for action validation checks
 */

import { getLocationSkillRequirement, checkAcceptContractAction } from "./actionChecks.js"
import { createWorld, TOWN_LOCATIONS } from "./world.js"
import { refreshMiningContracts } from "./contracts.js"

describe("actionChecks", () => {
  describe("checkAcceptContractAction", () => {
    it("should reject accepting a second contract when one is already active", () => {
      const state = createWorld("one-contract-test")
      state.player.skills.Mining = { level: 10, xp: 0 }

      // Generate mining contracts
      refreshMiningContracts(state)

      // Position player at miners guild
      state.exploration.playerState.currentAreaId = "TOWN"
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

      // Find both contracts
      const miningContracts = state.world.contracts.filter((c) => c.guildType === "Mining")
      expect(miningContracts.length).toBeGreaterThanOrEqual(2)

      const contract1 = miningContracts[0]
      const contract2 = miningContracts[1]

      // Accept first contract
      state.player.activeContracts.push(contract1.id)

      // Try to accept second contract - should fail
      const result = checkAcceptContractAction(state, {
        type: "AcceptContract",
        contractId: contract2.id,
      })

      expect(result.valid).toBe(false)
      expect(result.failureType).toBe("ALREADY_HAS_CONTRACT")
    })

    it("should allow accepting a contract when none are active", () => {
      const state = createWorld("no-contract-test")
      state.player.skills.Mining = { level: 10, xp: 0 }

      refreshMiningContracts(state)

      state.exploration.playerState.currentAreaId = "TOWN"
      state.exploration.playerState.currentLocationId = TOWN_LOCATIONS.MINERS_GUILD

      const contract = state.world.contracts.find((c) => c.guildType === "Mining")
      expect(contract).toBeDefined()

      const result = checkAcceptContractAction(state, {
        type: "AcceptContract",
        contractId: contract!.id,
      })

      expect(result.valid).toBe(true)
    })
  })

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
