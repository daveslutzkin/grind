import { describe, it, expect } from "@jest/globals"
import { render } from "preact-render-to-string"
import { CurrentArea } from "./CurrentArea"
import type { LocationInfo, ContractInfo, ValidAction, StorageInfo } from "../../../session/types"

describe("CurrentArea component", () => {
  const mockLocation: LocationInfo = {
    areaId: "area-1" as LocationInfo["areaId"],
    areaName: "Test Area",
    areaDistance: 0,
    locationId: "loc-1",
    locationName: "Test Location",
    isInTown: false,
    explorationStatus: "fully explored",
  }

  const mockWarehouseLocation: LocationInfo = {
    areaId: "TOWN" as LocationInfo["areaId"],
    areaName: "Town",
    areaDistance: 0,
    locationId: "TOWN_WAREHOUSE",
    locationName: "Warehouse",
    isInTown: true,
    explorationStatus: "fully explored",
  }

  const mockStorage: StorageInfo = {
    items: [],
  }

  const mockStorageWithItems: StorageInfo = {
    items: [
      { itemId: "STONE", quantity: 10 },
      { itemId: "WOOD", quantity: 5 },
    ],
  }

  const mockActions: ValidAction[] = []

  describe("contract gold display", () => {
    it("displays gold with exactly 2 decimal places", () => {
      const contracts: ContractInfo[] = [
        {
          id: "contract-1" as ContractInfo["id"],
          level: 1,
          guildType: "Mining",
          requirements: [{ itemId: "STONE", quantity: 5, currentQuantity: 0 }],
          rewards: { gold: 1.4926490000000001, reputation: 5 },
          isActive: false,
          isComplete: false,
          acceptLocationId: "loc-1",
          acceptLocationName: "Test Location",
        },
      ]

      const html = render(
        <CurrentArea
          location={mockLocation}
          contracts={contracts}
          actions={mockActions}
          storage={mockStorage}
          onAction={() => {}}
        />
      )

      // Should show 1.49 gold, not 1.4926490000000001
      expect(html).toContain("1.49 gold")
      expect(html).not.toContain("1.4926490000000001")
    })

    it("displays whole numbers with 2 decimal places", () => {
      const contracts: ContractInfo[] = [
        {
          id: "contract-1" as ContractInfo["id"],
          level: 1,
          guildType: "Mining",
          requirements: [{ itemId: "STONE", quantity: 5, currentQuantity: 0 }],
          rewards: { gold: 10, reputation: 5 },
          isActive: false,
          isComplete: false,
          acceptLocationId: "loc-1",
          acceptLocationName: "Test Location",
        },
      ]

      const html = render(
        <CurrentArea
          location={mockLocation}
          contracts={contracts}
          actions={mockActions}
          storage={mockStorage}
          onAction={() => {}}
        />
      )

      // Should show 10.00 gold
      expect(html).toContain("10.00 gold")
    })
  })

  describe("storage display", () => {
    it("shows storage panel when at warehouse location", () => {
      const html = render(
        <CurrentArea
          location={mockWarehouseLocation}
          contracts={[]}
          actions={mockActions}
          storage={mockStorageWithItems}
          onAction={() => {}}
        />
      )

      expect(html).toContain("Storage")
      expect(html).toContain("STONE")
      expect(html).toContain("x10")
      expect(html).toContain("WOOD")
      expect(html).toContain("x5")
    })

    it("shows empty message when at warehouse with no stored items", () => {
      const html = render(
        <CurrentArea
          location={mockWarehouseLocation}
          contracts={[]}
          actions={mockActions}
          storage={mockStorage}
          onAction={() => {}}
        />
      )

      expect(html).toContain("Storage")
      expect(html).toContain("Empty")
    })

    it("does NOT show storage panel when not at warehouse", () => {
      const html = render(
        <CurrentArea
          location={mockLocation}
          contracts={[]}
          actions={mockActions}
          storage={mockStorageWithItems}
          onAction={() => {}}
        />
      )

      // Storage should not be visible when not at warehouse
      expect(html).not.toContain('class="storage')
    })
  })
})
