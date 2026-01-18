/**
 * Map Utilities
 *
 * Pure functions for mini-map and full-screen map calculations.
 */

import type { ConnectionInfo, ExplorationInfo, LocationInfo } from "../../../session/types"
import type { AreaID } from "../../../types"

// ============================================================================
// Mini-Map Configuration
// ============================================================================

export const MINI_MAP = {
  width: 300,
  height: 200,
  centerX: 150,
  centerY: 85, // Shifted up to leave room for legend
  currentAreaRadius: 8, // Small dot for current area
  connectedAreaRadius: 18, // Larger dots for connected areas (where can I go?)
  connectionDistance: 55, // Distance from center to connected area dots
} as const

// ============================================================================
// Position Calculations
// ============================================================================

export interface Position {
  x: number
  y: number
}

/**
 * Calculate the position of a connected area dot around the center.
 * Areas are arranged in a circle around the current location.
 */
export function getConnectedAreaPosition(
  index: number,
  total: number,
  config = MINI_MAP
): Position {
  // Start from the top (-π/2) and go clockwise
  const angle = (index / total) * 2 * Math.PI - Math.PI / 2
  return {
    x: config.centerX + Math.cos(angle) * config.connectionDistance,
    y: config.centerY + Math.sin(angle) * config.connectionDistance,
  }
}

// ============================================================================
// Color Mapping
// ============================================================================

export type ExplorationStatus = ConnectionInfo["explorationStatus"]

const STATUS_COLORS: Record<ExplorationStatus, string> = {
  "fully explored": "#4ade80", // green
  "partly explored": "#facc15", // yellow
  unexplored: "#f97316", // orange
  undiscovered: "#6b7280", // gray
}

export function getStatusColor(status: ExplorationStatus): string {
  return STATUS_COLORS[status]
}

// ============================================================================
// Distance Style (for connection lines)
// ============================================================================

export type RelativeDistance = ConnectionInfo["relativeDistance"]

export interface LineStyle {
  strokeDasharray: string
  strokeWidth: number
}

const DISTANCE_STYLES: Record<RelativeDistance, LineStyle> = {
  closer: { strokeDasharray: "none", strokeWidth: 2 },
  same: { strokeDasharray: "4,4", strokeWidth: 1.5 },
  further: { strokeDasharray: "2,4", strokeWidth: 1 },
}

export function getDistanceLineStyle(distance: RelativeDistance): LineStyle {
  return DISTANCE_STYLES[distance]
}

// ============================================================================
// Text Truncation
// ============================================================================

export function truncateText(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text
}

// ============================================================================
// World Map Data
// ============================================================================

export interface WorldMapArea {
  areaId: AreaID
  areaName: string
  distance: number // Distance from town (0 = town)
  explorationStatus: ExplorationStatus
  isCurrent: boolean
}

export interface WorldMapConnection {
  fromAreaId: AreaID
  toAreaId: AreaID
}

export interface WorldMapData {
  areas: WorldMapArea[]
  connections: WorldMapConnection[]
}

/**
 * Build world map data from exploration info plus full world graph.
 * This is used for the full-screen map view.
 */
export function buildWorldMapData(
  currentLocation: LocationInfo,
  exploration: ExplorationInfo,
  knownAreaIds: AreaID[],
  knownConnectionIds: string[],
  areaDistances: Map<AreaID, number>,
  areaNames: Map<AreaID, string>
): WorldMapData {
  const areas: WorldMapArea[] = []
  const connections: WorldMapConnection[] = []
  const addedConnections = new Set<string>()

  // Build area nodes
  for (const areaId of knownAreaIds) {
    const distance = areaDistances.get(areaId) ?? 0
    const name = areaNames.get(areaId) ?? areaId

    // Find exploration status - check if it's in the current area's connections
    let explorationStatus: ExplorationStatus = "unexplored"
    const conn = exploration.connections.find((c) => c.toAreaId === areaId)
    if (conn) {
      explorationStatus = conn.explorationStatus
    } else if (areaId === currentLocation.areaId) {
      // Current area uses the location's exploration status
      explorationStatus = currentLocation.explorationStatus
    }

    areas.push({
      areaId,
      areaName: name,
      distance,
      explorationStatus,
      isCurrent: areaId === currentLocation.areaId,
    })
  }

  // Build connections
  for (const connId of knownConnectionIds) {
    const [from, to] = connId.split("->")
    // Only add if both areas are known
    if (knownAreaIds.includes(from) && knownAreaIds.includes(to)) {
      // Avoid duplicate connections (A->B and B->A)
      const normalizedId = [from, to].sort().join("-")
      if (!addedConnections.has(normalizedId)) {
        addedConnections.add(normalizedId)
        connections.push({ fromAreaId: from, toAreaId: to })
      }
    }
  }

  return { areas, connections }
}

// ============================================================================
// Full-Screen Map Layout
// ============================================================================

export const FULL_MAP = {
  width: 800,
  height: 600,
  padding: 60,
  minNodeRadius: 20,
  maxNodeRadius: 40,
  currentNodeRadius: 30,
} as const

/**
 * Calculate positions for all areas in the full-screen map.
 * Uses a simple layout: horizontal by distance from town.
 */
export function calculateFullMapPositions(
  worldMap: WorldMapData,
  config = FULL_MAP
): Map<AreaID, Position> {
  const positions = new Map<AreaID, Position>()

  if (worldMap.areas.length === 0) {
    return positions
  }

  // Group areas by distance
  const byDistance = new Map<number, WorldMapArea[]>()
  let maxDistance = 0

  for (const area of worldMap.areas) {
    const group = byDistance.get(area.distance) || []
    group.push(area)
    byDistance.set(area.distance, group)
    maxDistance = Math.max(maxDistance, area.distance)
  }

  // Calculate positions
  const usableWidth = config.width - 2 * config.padding
  const usableHeight = config.height - 2 * config.padding

  for (const [distance, areas] of byDistance.entries()) {
    // X position based on distance (town on left, far areas on right)
    const x =
      maxDistance === 0 ? config.width / 2 : config.padding + (distance / maxDistance) * usableWidth

    // Y positions spread vertically
    const ySpacing = usableHeight / (areas.length + 1)

    areas.forEach((area, index) => {
      positions.set(area.areaId, {
        x,
        y: config.padding + ySpacing * (index + 1),
      })
    })
  }

  return positions
}
