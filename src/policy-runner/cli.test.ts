/**
 * Tests for cli.ts - CLI utility functions
 */

import { formatDuration, formatPolicyAction } from "./cli.js"
import { GatherMode } from "../types.js"
import type { PolicyAction } from "./types.js"

describe("cli", () => {
  describe("formatDuration", () => {
    it("formats milliseconds for durations under 1 second", () => {
      expect(formatDuration(0)).toBe("0ms")
      expect(formatDuration(100)).toBe("100ms")
      expect(formatDuration(999)).toBe("999ms")
    })

    it("formats seconds for durations under 1 minute", () => {
      expect(formatDuration(1000)).toBe("1.0s")
      expect(formatDuration(1500)).toBe("1.5s")
      expect(formatDuration(30000)).toBe("30.0s")
      expect(formatDuration(59999)).toBe("60.0s")
    })

    it("formats minutes for durations 1 minute or more", () => {
      expect(formatDuration(60000)).toBe("1.0m")
      expect(formatDuration(90000)).toBe("1.5m")
      expect(formatDuration(300000)).toBe("5.0m")
    })
  })

  describe("formatPolicyAction", () => {
    it("formats Mine action without mode", () => {
      const action: PolicyAction = { type: "Mine", nodeId: "node-123" }
      expect(formatPolicyAction(action)).toBe("Mine(node-123)")
    })

    it("formats Mine action with mode", () => {
      const action: PolicyAction = {
        type: "Mine",
        nodeId: "node-123",
        mode: GatherMode.CAREFUL_ALL,
      }
      expect(formatPolicyAction(action)).toBe("Mine(node-123, CAREFUL_ALL)")
    })

    it("formats Explore action", () => {
      const action: PolicyAction = { type: "Explore", areaId: "AREA_1" }
      expect(formatPolicyAction(action)).toBe("Explore(AREA_1)")
    })

    it("formats Travel action", () => {
      const action: PolicyAction = { type: "Travel", toAreaId: "AREA_2" }
      expect(formatPolicyAction(action)).toBe("Travel(AREA_2)")
    })

    it("formats ReturnToTown action", () => {
      const action: PolicyAction = { type: "ReturnToTown" }
      expect(formatPolicyAction(action)).toBe("ReturnToTown")
    })

    it("formats DepositInventory action", () => {
      const action: PolicyAction = { type: "DepositInventory" }
      expect(formatPolicyAction(action)).toBe("DepositInventory")
    })

    it("formats Wait action", () => {
      const action: PolicyAction = { type: "Wait" }
      expect(formatPolicyAction(action)).toBe("Wait")
    })
  })
})
