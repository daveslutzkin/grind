/**
 * Utils Tests
 *
 * Tests for shared utility functions.
 */

import { formatIdAsName, capitalize, parseLocationIndex } from "./utils.js"

describe("utils", () => {
  describe("formatIdAsName", () => {
    it("replaces underscores with spaces", () => {
      expect(formatIdAsName("IRON_INGOT")).toBe("iron ingot")
    })

    it("converts to lowercase", () => {
      expect(formatIdAsName("COPPER_ORE")).toBe("copper ore")
    })

    it("handles single word IDs", () => {
      expect(formatIdAsName("STONE")).toBe("stone")
    })

    it("handles IDs with multiple underscores", () => {
      expect(formatIdAsName("HIGH_QUALITY_IRON_BAR")).toBe("high quality iron bar")
    })

    it("handles empty string", () => {
      expect(formatIdAsName("")).toBe("")
    })

    it("handles already lowercase IDs", () => {
      expect(formatIdAsName("oak_log")).toBe("oak log")
    })
  })

  describe("capitalize", () => {
    it("capitalizes the first letter", () => {
      expect(capitalize("mine")).toBe("Mine")
    })

    it("leaves rest of string unchanged", () => {
      expect(capitalize("hello world")).toBe("Hello world")
    })

    it("handles empty string", () => {
      expect(capitalize("")).toBe("")
    })

    it("handles single character", () => {
      expect(capitalize("a")).toBe("A")
    })

    it("handles already capitalized string", () => {
      expect(capitalize("Already")).toBe("Already")
    })

    it("handles all uppercase string", () => {
      expect(capitalize("SHOUTING")).toBe("SHOUTING")
    })
  })

  describe("parseLocationIndex", () => {
    it("extracts index from standard location ID", () => {
      expect(parseLocationIndex("area-d1-i0-loc-3")).toBe("3")
    })

    it("extracts index from simple location ID", () => {
      expect(parseLocationIndex("TOWN-loc-0")).toBe("0")
    })

    it("extracts multi-digit index", () => {
      expect(parseLocationIndex("area-d2-i5-loc-42")).toBe("42")
    })

    it("returns null for non-matching ID", () => {
      expect(parseLocationIndex("invalid-location")).toBeNull()
    })

    it("returns null for empty string", () => {
      expect(parseLocationIndex("")).toBeNull()
    })

    it("extracts from ID with ORE_VEIN in path", () => {
      expect(parseLocationIndex("area-d1-i0-ORE_VEIN-loc-2")).toBe("2")
    })

    it("extracts from ID with TREE_STAND in path", () => {
      expect(parseLocationIndex("area-d1-i0-TREE_STAND-loc-1")).toBe("1")
    })

    it("extracts from ID with MOB_CAMP in path", () => {
      expect(parseLocationIndex("area-d1-i0-MOB_CAMP-loc-5")).toBe("5")
    })
  })
})
