import { describe, it, expect } from "@jest/globals"
import type { ValidAction, ContractInfo, LocationInfo } from "../../../session/types"
import {
  groupActionsByType,
  filterContractsAtLocation,
  formatContractName,
} from "./currentAreaUtils"

describe("CurrentArea utilities", () => {
  describe("groupActionsByType", () => {
    it("groups actions by the first word of their command", () => {
      const actions: ValidAction[] = [
        {
          displayName: "Rocky Clearing",
          command: "go rocky-clearing",
          action: { type: "Move", parameters: { target: "area-1" } },
          timeCost: 10,
          isVariable: false,
          successProbability: 1,
        },
        {
          displayName: "Silverhew Glade",
          command: "go silverhew-glade",
          action: { type: "Move", parameters: { target: "area-2" } },
          timeCost: 15,
          isVariable: false,
          successProbability: 1,
        },
        {
          displayName: "Mining Guild",
          command: "fartravel mining-guild",
          action: { type: "Fartravel", parameters: { target: "area-3" } },
          timeCost: 20,
          isVariable: true,
          successProbability: 1,
        },
      ]

      const result = groupActionsByType(actions)

      expect(Object.keys(result)).toHaveLength(2)
      expect(result["go"]).toHaveLength(2)
      expect(result["fartravel"]).toHaveLength(1)
      expect(result["go"][0].displayName).toBe("Rocky Clearing")
      expect(result["go"][1].displayName).toBe("Silverhew Glade")
      expect(result["fartravel"][0].displayName).toBe("Mining Guild")
    })

    it("returns empty object for empty actions array", () => {
      const result = groupActionsByType([])
      expect(result).toEqual({})
    })

    it("handles single-word commands", () => {
      const actions: ValidAction[] = [
        {
          displayName: "Explore",
          command: "explore",
          action: { type: "Explore", parameters: {} },
          timeCost: 5,
          isVariable: false,
          successProbability: 1,
        },
      ]

      const result = groupActionsByType(actions)

      expect(Object.keys(result)).toHaveLength(1)
      expect(result["explore"]).toHaveLength(1)
    })

    it("handles commands with multiple parameters", () => {
      const actions: ValidAction[] = [
        {
          displayName: "Mine Stone",
          command: "mine stone focus",
          action: { type: "Gather", parameters: { material: "stone", mode: "focus" } },
          timeCost: 30,
          isVariable: true,
          successProbability: 0.9,
        },
      ]

      const result = groupActionsByType(actions)

      expect(result["mine"]).toHaveLength(1)
    })
  })

  describe("filterContractsAtLocation", () => {
    const baseContract: Omit<ContractInfo, "id" | "isActive" | "acceptLocationId"> = {
      level: 1,
      guildType: "Mining",
      requirements: [],
      rewards: { reputation: 10 },
      isComplete: false,
      acceptLocationName: "Town",
    }

    const location: LocationInfo = {
      areaId: "area-1",
      areaName: "Rocky Clearing",
      areaDistance: 0,
      locationId: "loc-1",
      locationName: "Clearing",
      isInTown: false,
      explorationStatus: "partly explored",
    }

    it("filters contracts available at the current location", () => {
      const contracts: ContractInfo[] = [
        { ...baseContract, id: "contract-1", isActive: false, acceptLocationId: "loc-1" },
        { ...baseContract, id: "contract-2", isActive: false, acceptLocationId: "loc-2" },
        { ...baseContract, id: "contract-3", isActive: false, acceptLocationId: "loc-1" },
      ]

      const result = filterContractsAtLocation(contracts, location)

      expect(result).toHaveLength(2)
      expect(result.map((c) => c.id)).toEqual(["contract-1", "contract-3"])
    })

    it("excludes active contracts", () => {
      const contracts: ContractInfo[] = [
        { ...baseContract, id: "contract-1", isActive: true, acceptLocationId: "loc-1" },
        { ...baseContract, id: "contract-2", isActive: false, acceptLocationId: "loc-1" },
      ]

      const result = filterContractsAtLocation(contracts, location)

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("contract-2")
    })

    it("returns empty array when no contracts match", () => {
      const contracts: ContractInfo[] = [
        { ...baseContract, id: "contract-1", isActive: false, acceptLocationId: "loc-other" },
      ]

      const result = filterContractsAtLocation(contracts, location)

      expect(result).toHaveLength(0)
    })

    it("returns empty array for empty contracts", () => {
      const result = filterContractsAtLocation([], location)
      expect(result).toHaveLength(0)
    })

    it("handles null locationId", () => {
      const locationAtHub: LocationInfo = {
        ...location,
        locationId: null,
      }

      const contracts: ContractInfo[] = [
        { ...baseContract, id: "contract-1", isActive: false, acceptLocationId: "loc-1" },
      ]

      const result = filterContractsAtLocation(contracts, locationAtHub)

      expect(result).toHaveLength(0)
    })
  })

  describe("formatContractName", () => {
    it("converts dash-separated ID to title case", () => {
      expect(formatContractName("miners-guild-copper-1")).toBe("Miners Guild Copper 1")
    })

    it("handles single-word IDs", () => {
      expect(formatContractName("contract")).toBe("Contract")
    })

    it("preserves numbers", () => {
      expect(formatContractName("level-5-quest")).toBe("Level 5 Quest")
    })

    it("handles empty string", () => {
      expect(formatContractName("")).toBe("")
    })

    it("handles already capitalized words", () => {
      expect(formatContractName("MINERS-GUILD")).toBe("MINERS GUILD")
    })
  })
})
