import { isClientMessage, validateClientMessage } from "./protocol.js"

describe("protocol type guards", () => {
  describe("isClientMessage", () => {
    it("returns false for non-object values", () => {
      expect(isClientMessage(null)).toBe(false)
      expect(isClientMessage(undefined)).toBe(false)
      expect(isClientMessage("string")).toBe(false)
      expect(isClientMessage(123)).toBe(false)
    })

    it("returns false for objects without type", () => {
      expect(isClientMessage({})).toBe(false)
      expect(isClientMessage({ data: "test" })).toBe(false)
    })

    it("returns false for invalid message types", () => {
      expect(isClientMessage({ type: "invalid" })).toBe(false)
      expect(isClientMessage({ type: "destroy_world" })).toBe(false)
    })

    it("returns true for valid message types", () => {
      expect(isClientMessage({ type: "new_game" })).toBe(true)
      expect(isClientMessage({ type: "load_game", savedState: "{}" })).toBe(true)
      expect(isClientMessage({ type: "command", command: "survey" })).toBe(true)
      expect(isClientMessage({ type: "get_state" })).toBe(true)
      expect(isClientMessage({ type: "get_valid_actions" })).toBe(true)
      expect(isClientMessage({ type: "save_game" })).toBe(true)
    })
  })

  describe("validateClientMessage", () => {
    it("returns null for invalid messages", () => {
      expect(validateClientMessage(null)).toBe(null)
      expect(validateClientMessage({ type: "invalid" })).toBe(null)
    })

    it("validates new_game message", () => {
      expect(validateClientMessage({ type: "new_game" })).toEqual({ type: "new_game" })
      expect(validateClientMessage({ type: "new_game", seed: "test-seed" })).toEqual({
        type: "new_game",
        seed: "test-seed",
      })
      expect(validateClientMessage({ type: "new_game", seed: 123 })).toBe(null)
    })

    it("validates load_game message", () => {
      expect(validateClientMessage({ type: "load_game", savedState: "{}" })).toEqual({
        type: "load_game",
        savedState: "{}",
      })
      expect(validateClientMessage({ type: "load_game" })).toBe(null)
      expect(validateClientMessage({ type: "load_game", savedState: 123 })).toBe(null)
    })

    it("validates command message", () => {
      expect(validateClientMessage({ type: "command", command: "survey" })).toEqual({
        type: "command",
        command: "survey",
      })
      expect(validateClientMessage({ type: "command" })).toBe(null)
      expect(validateClientMessage({ type: "command", command: 123 })).toBe(null)
    })

    it("validates get_state message", () => {
      expect(validateClientMessage({ type: "get_state" })).toEqual({ type: "get_state" })
    })

    it("validates get_valid_actions message", () => {
      expect(validateClientMessage({ type: "get_valid_actions" })).toEqual({
        type: "get_valid_actions",
      })
    })

    it("validates save_game message", () => {
      expect(validateClientMessage({ type: "save_game" })).toEqual({ type: "save_game" })
    })
  })
})
