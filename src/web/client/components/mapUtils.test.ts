import { describe, it, expect } from "@jest/globals"
import {
  getConnectedAreaPosition,
  getStatusColor,
  getDistanceLineStyle,
  truncateText,
  buildWorldMapData,
  calculateFullMapPositions,
  MINI_MAP,
  FULL_MAP,
  type WorldMapData,
} from "./mapUtils"
import type { ExplorationInfo, LocationInfo, ConnectionInfo } from "../../../session/types"

describe("mapUtils", () => {
  describe("getConnectedAreaPosition", () => {
    it("places first of one at the top", () => {
      const pos = getConnectedAreaPosition(0, 1)
      expect(pos.x).toBeCloseTo(MINI_MAP.centerX)
      expect(pos.y).toBeCloseTo(MINI_MAP.centerY - MINI_MAP.connectionDistance)
    })

    it("places first of four at the top", () => {
      const pos = getConnectedAreaPosition(0, 4)
      expect(pos.x).toBeCloseTo(MINI_MAP.centerX)
      expect(pos.y).toBeCloseTo(MINI_MAP.centerY - MINI_MAP.connectionDistance)
    })

    it("places second of four to the right", () => {
      const pos = getConnectedAreaPosition(1, 4)
      expect(pos.x).toBeCloseTo(MINI_MAP.centerX + MINI_MAP.connectionDistance)
      expect(pos.y).toBeCloseTo(MINI_MAP.centerY)
    })

    it("places third of four at the bottom", () => {
      const pos = getConnectedAreaPosition(2, 4)
      expect(pos.x).toBeCloseTo(MINI_MAP.centerX)
      expect(pos.y).toBeCloseTo(MINI_MAP.centerY + MINI_MAP.connectionDistance)
    })

    it("places fourth of four to the left", () => {
      const pos = getConnectedAreaPosition(3, 4)
      expect(pos.x).toBeCloseTo(MINI_MAP.centerX - MINI_MAP.connectionDistance)
      expect(pos.y).toBeCloseTo(MINI_MAP.centerY)
    })

    it("distributes positions evenly for any count", () => {
      // Test with 3 connections
      const positions = [0, 1, 2].map((i) => getConnectedAreaPosition(i, 3))

      // All should be at same distance from center
      for (const pos of positions) {
        const dist = Math.sqrt(
          Math.pow(pos.x - MINI_MAP.centerX, 2) + Math.pow(pos.y - MINI_MAP.centerY, 2)
        )
        expect(dist).toBeCloseTo(MINI_MAP.connectionDistance)
      }
    })
  })

  describe("getStatusColor", () => {
    it("returns green for fully explored", () => {
      expect(getStatusColor("fully explored")).toBe("#4ade80")
    })

    it("returns yellow for partly explored", () => {
      expect(getStatusColor("partly explored")).toBe("#facc15")
    })

    it("returns orange for unexplored", () => {
      expect(getStatusColor("unexplored")).toBe("#f97316")
    })

    it("returns gray for undiscovered", () => {
      expect(getStatusColor("undiscovered")).toBe("#6b7280")
    })
  })

  describe("getDistanceLineStyle", () => {
    it("returns solid line for closer areas", () => {
      const style = getDistanceLineStyle("closer")
      expect(style.strokeDasharray).toBe("none")
      expect(style.strokeWidth).toBe(2)
    })

    it("returns dashed line for same distance", () => {
      const style = getDistanceLineStyle("same")
      expect(style.strokeDasharray).toBe("4,4")
    })

    it("returns dotted line for further areas", () => {
      const style = getDistanceLineStyle("further")
      expect(style.strokeDasharray).toBe("2,4")
      expect(style.strokeWidth).toBe(1)
    })
  })

  describe("truncateText", () => {
    it("returns text unchanged if shorter than max", () => {
      expect(truncateText("Hello", 10)).toBe("Hello")
    })

    it("returns text unchanged if equal to max", () => {
      expect(truncateText("Hello", 5)).toBe("Hello")
    })

    it("truncates with ellipsis if longer than max", () => {
      expect(truncateText("Hello World", 6)).toBe("Hello…")
    })

    it("handles empty string", () => {
      expect(truncateText("", 5)).toBe("")
    })

    it("handles maxLen of 1", () => {
      expect(truncateText("Hello", 1)).toBe("…")
    })
  })

  describe("buildWorldMapData", () => {
    const mockLocation: LocationInfo = {
      areaId: "TOWN",
      areaName: "Town",
      areaDistance: 0,
      locationId: null,
      locationName: "Town Square",
      isInTown: true,
      explorationStatus: "fully explored",
    }

    const mockConnection: ConnectionInfo = {
      toAreaId: "area-1",
      toAreaName: "Rocky Clearing",
      travelTime: 10,
      explorationStatus: "partly explored",
      relativeDistance: "further",
    }

    const mockExploration: ExplorationInfo = {
      connections: [mockConnection],
      knownGatheringNodes: [],
      hasUndiscoveredAreas: false,
      hasUndiscoveredLocations: false,
    }

    it("includes current area in world map", () => {
      const result = buildWorldMapData(
        mockLocation,
        mockExploration,
        ["TOWN"],
        [],
        new Map([["TOWN", 0]]),
        new Map([["TOWN", "Town"]])
      )

      expect(result.areas).toHaveLength(1)
      expect(result.areas[0].areaId).toBe("TOWN")
      expect(result.areas[0].isCurrent).toBe(true)
    })

    it("includes connected areas with correct exploration status", () => {
      const result = buildWorldMapData(
        mockLocation,
        mockExploration,
        ["TOWN", "area-1"],
        ["TOWN->area-1"],
        new Map([
          ["TOWN", 0],
          ["area-1", 1],
        ]),
        new Map([
          ["TOWN", "Town"],
          ["area-1", "Rocky Clearing"],
        ])
      )

      expect(result.areas).toHaveLength(2)

      const area1 = result.areas.find((a) => a.areaId === "area-1")
      expect(area1).toBeDefined()
      expect(area1!.explorationStatus).toBe("partly explored")
      expect(area1!.isCurrent).toBe(false)
    })

    it("builds connections between known areas", () => {
      const result = buildWorldMapData(
        mockLocation,
        mockExploration,
        ["TOWN", "area-1"],
        ["TOWN->area-1"],
        new Map([
          ["TOWN", 0],
          ["area-1", 1],
        ]),
        new Map([
          ["TOWN", "Town"],
          ["area-1", "Rocky Clearing"],
        ])
      )

      expect(result.connections).toHaveLength(1)
      expect(result.connections[0].fromAreaId).toBe("TOWN")
      expect(result.connections[0].toAreaId).toBe("area-1")
    })

    it("deduplicates bidirectional connections", () => {
      const result = buildWorldMapData(
        mockLocation,
        mockExploration,
        ["TOWN", "area-1"],
        ["TOWN->area-1", "area-1->TOWN"],
        new Map([
          ["TOWN", 0],
          ["area-1", 1],
        ]),
        new Map([
          ["TOWN", "Town"],
          ["area-1", "Rocky Clearing"],
        ])
      )

      expect(result.connections).toHaveLength(1)
    })

    it("only includes connections where both areas are known", () => {
      const result = buildWorldMapData(
        mockLocation,
        mockExploration,
        ["TOWN"], // Only TOWN is known
        ["TOWN->area-1", "TOWN->area-2"],
        new Map([["TOWN", 0]]),
        new Map([["TOWN", "Town"]])
      )

      expect(result.connections).toHaveLength(0)
    })
  })

  describe("calculateFullMapPositions", () => {
    it("returns empty map for empty world", () => {
      const worldMap: WorldMapData = { areas: [], connections: [] }
      const positions = calculateFullMapPositions(worldMap)
      expect(positions.size).toBe(0)
    })

    it("places single area at center", () => {
      const worldMap: WorldMapData = {
        areas: [
          {
            areaId: "TOWN",
            areaName: "Town",
            distance: 0,
            explorationStatus: "fully explored",
            isCurrent: true,
          },
        ],
        connections: [],
      }

      const positions = calculateFullMapPositions(worldMap)

      expect(positions.size).toBe(1)
      const townPos = positions.get("TOWN")!
      expect(townPos.x).toBe(FULL_MAP.width / 2)
    })

    it("places areas horizontally by distance", () => {
      const worldMap: WorldMapData = {
        areas: [
          {
            areaId: "TOWN",
            areaName: "Town",
            distance: 0,
            explorationStatus: "fully explored",
            isCurrent: false,
          },
          {
            areaId: "area-1",
            areaName: "Area 1",
            distance: 1,
            explorationStatus: "unexplored",
            isCurrent: true,
          },
          {
            areaId: "area-2",
            areaName: "Area 2",
            distance: 2,
            explorationStatus: "unexplored",
            isCurrent: false,
          },
        ],
        connections: [],
      }

      const positions = calculateFullMapPositions(worldMap)

      const townX = positions.get("TOWN")!.x
      const area1X = positions.get("area-1")!.x
      const area2X = positions.get("area-2")!.x

      // Town (distance 0) should be leftmost
      expect(townX).toBeLessThan(area1X)
      // Area 2 (distance 2) should be rightmost
      expect(area1X).toBeLessThan(area2X)
    })

    it("spreads areas at same distance vertically", () => {
      const worldMap: WorldMapData = {
        areas: [
          {
            areaId: "TOWN",
            areaName: "Town",
            distance: 0,
            explorationStatus: "fully explored",
            isCurrent: true,
          },
          {
            areaId: "area-1",
            areaName: "Area 1",
            distance: 1,
            explorationStatus: "unexplored",
            isCurrent: false,
          },
          {
            areaId: "area-2",
            areaName: "Area 2",
            distance: 1, // Same distance as area-1
            explorationStatus: "unexplored",
            isCurrent: false,
          },
        ],
        connections: [],
      }

      const positions = calculateFullMapPositions(worldMap)

      const area1Pos = positions.get("area-1")!
      const area2Pos = positions.get("area-2")!

      // Same X (same distance)
      expect(area1Pos.x).toBe(area2Pos.x)
      // Different Y (spread vertically)
      expect(area1Pos.y).not.toBe(area2Pos.y)
    })

    it("keeps all positions within bounds", () => {
      const worldMap: WorldMapData = {
        areas: Array.from({ length: 10 }, (_, i) => ({
          areaId: `area-${i}`,
          areaName: `Area ${i}`,
          distance: i % 3,
          explorationStatus: "unexplored" as const,
          isCurrent: i === 0,
        })),
        connections: [],
      }

      const positions = calculateFullMapPositions(worldMap)

      for (const pos of positions.values()) {
        expect(pos.x).toBeGreaterThanOrEqual(FULL_MAP.padding)
        expect(pos.x).toBeLessThanOrEqual(FULL_MAP.width - FULL_MAP.padding)
        expect(pos.y).toBeGreaterThanOrEqual(FULL_MAP.padding)
        expect(pos.y).toBeLessThanOrEqual(FULL_MAP.height - FULL_MAP.padding)
      }
    })
  })
})
