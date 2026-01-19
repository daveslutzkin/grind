import { describe, it, expect } from "@jest/globals"
import { render } from "preact-render-to-string"
import { Inventory } from "./Inventory"
import type { InventoryInfo } from "../../../session/types"

describe("Inventory component", () => {
  describe("visual grid display", () => {
    it("renders exactly 10 inventory slots", () => {
      const inventory: InventoryInfo = {
        items: [],
        capacity: 10,
        used: 0,
      }

      const html = render(<Inventory inventory={inventory} />)

      // Should have 10 inventory-slot divs
      const slotMatches = html.match(/class="inventory-slot/g)
      expect(slotMatches).toHaveLength(10)
    })

    it("shows empty slots with empty class when inventory has no items", () => {
      const inventory: InventoryInfo = {
        items: [],
        capacity: 10,
        used: 0,
      }

      const html = render(<Inventory inventory={inventory} />)

      // All 10 slots should be empty
      const emptySlotMatches = html.match(/inventory-slot empty/g)
      expect(emptySlotMatches).toHaveLength(10)
    })

    it("shows filled slots with item names", () => {
      const inventory: InventoryInfo = {
        items: [
          { itemId: "STONE", quantity: 1 },
          { itemId: "IRON_ORE", quantity: 3 },
        ],
        capacity: 10,
        used: 4,
      }

      const html = render(<Inventory inventory={inventory} />)

      // Should have 2 filled slots and 8 empty slots
      const filledSlotMatches = html.match(/inventory-slot filled/g)
      const emptySlotMatches = html.match(/inventory-slot empty/g)
      expect(filledSlotMatches).toHaveLength(2)
      expect(emptySlotMatches).toHaveLength(8)

      // Should show item names
      expect(html).toContain("STONE")
      expect(html).toContain("IRON_ORE")
    })

    it("only shows quantity when greater than 1", () => {
      const inventory: InventoryInfo = {
        items: [
          { itemId: "STONE", quantity: 1 },
          { itemId: "IRON_ORE", quantity: 3 },
        ],
        capacity: 10,
        used: 4,
      }

      const html = render(<Inventory inventory={inventory} />)

      // Should show x3 for iron ore but NOT x1 for stone
      expect(html).toContain("x3")
      expect(html).not.toContain("x1")
    })

    it("does not show (used/capacity) in header", () => {
      const inventory: InventoryInfo = {
        items: [{ itemId: "STONE", quantity: 1 }],
        capacity: 10,
        used: 1,
      }

      const html = render(<Inventory inventory={inventory} />)

      // Should not contain the old format
      expect(html).not.toContain("(1/10)")
      expect(html).not.toContain("used")
      expect(html).not.toContain("capacity")
    })

    it("uses inventory-grid class for the container", () => {
      const inventory: InventoryInfo = {
        items: [],
        capacity: 10,
        used: 0,
      }

      const html = render(<Inventory inventory={inventory} />)

      expect(html).toContain('class="inventory-grid"')
    })
  })
})
