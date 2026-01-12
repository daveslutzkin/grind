/**
 * Tests for goto enemy camp command parsing
 * After refactoring: parser returns raw strings, engine resolves destinations
 */

import { parseAction } from "./runner.js"
import { createWorld } from "./world.js"

describe("parseAction - goto commands (raw strings)", () => {
  it("parses 'goto enemy camp' to Move with raw destination", () => {
    const state = createWorld("test-seed")

    const action = parseAction("goto enemy camp", { state })

    expect(action).toEqual({
      type: "Move",
      destination: "enemy camp",
    })
  })

  it("parses 'goto camp' to Move with raw destination", () => {
    const state = createWorld("test-seed")

    const action = parseAction("goto camp", { state })

    expect(action).toEqual({
      type: "Move",
      destination: "camp",
    })
  })

  it("parses 'goto mob camp' to Move with raw destination", () => {
    const state = createWorld("test-seed")

    const action = parseAction("goto mob camp", { state })

    expect(action).toEqual({
      type: "Move",
      destination: "mob camp",
    })
  })

  it("parses 'goto enemy camp 2' to Move with indexed destination", () => {
    const state = createWorld("test-seed")

    const action = parseAction("goto enemy camp 2", { state })

    expect(action).toEqual({
      type: "Move",
      destination: "enemy camp 2",
    })
  })

  it("parses 'goto camp 1' to Move with indexed destination", () => {
    const state = createWorld("test-seed")

    const action = parseAction("goto camp 1", { state })

    expect(action).toEqual({
      type: "Move",
      destination: "camp 1",
    })
  })

  it("parses various goto commands to Move actions", () => {
    const state = createWorld("test-seed")

    expect(parseAction("goto ore", { state })).toEqual({ type: "Move", destination: "ore" })
    expect(parseAction("goto tree", { state })).toEqual({ type: "Move", destination: "tree" })
    expect(parseAction("goto miners guild", { state })).toEqual({
      type: "Move",
      destination: "miners guild",
    })
  })

  it("returns null when no destination provided", () => {
    const state = createWorld("test-seed")

    const action = parseAction("goto", { state })

    expect(action).toBeNull()
  })
})
