import { useState } from "preact/hooks"
import type { LocationInfo, ExplorationInfo } from "../../../session/types"
import {
  getConnectedAreaPosition,
  getStatusColor,
  getDistanceLineStyle,
  truncateText,
  MINI_MAP,
  FULL_MAP,
} from "./mapUtils"

interface MapProps {
  location: LocationInfo
  exploration: ExplorationInfo
}

// Mini-map SVG showing current area and connections
// Design: small dot for current area, larger dots for "where can I go?" destinations
function MiniMap({ location, exploration, onClick }: MapProps & { onClick: () => void }) {
  const { connections } = exploration
  const { centerX, centerY, currentAreaRadius, connectedAreaRadius } = MINI_MAP

  return (
    <svg
      viewBox={`0 0 ${MINI_MAP.width} ${MINI_MAP.height}`}
      class="map-svg clickable"
      onClick={onClick}
      role="button"
      aria-label="Click to open full map"
    >
      {/* Draw connection lines first (behind nodes) */}
      {connections.map((conn, i) => {
        const pos = getConnectedAreaPosition(i, connections.length)
        const style = getDistanceLineStyle(conn.relativeDistance)
        return (
          <line
            key={`line-${conn.toAreaId}`}
            x1={centerX}
            y1={centerY}
            x2={pos.x}
            y2={pos.y}
            stroke="#666"
            strokeDasharray={style.strokeDasharray}
            strokeWidth={style.strokeWidth}
          />
        )
      })}

      {/* Connected areas - LARGER dots (navigation focus) */}
      {connections.map((conn, i) => {
        const pos = getConnectedAreaPosition(i, connections.length)
        const color = getStatusColor(conn.explorationStatus)
        return (
          <g key={conn.toAreaId}>
            <circle
              cx={pos.x}
              cy={pos.y}
              r={connectedAreaRadius}
              fill={color}
              stroke="#333"
              strokeWidth={2}
            />
            <text
              x={pos.x}
              y={pos.y + 3}
              textAnchor="middle"
              fill="white"
              fontSize={9}
              fontWeight="bold"
            >
              {truncateText(conn.toAreaName, 9)}
            </text>
            <text
              x={pos.x}
              y={pos.y + connectedAreaRadius + 12}
              textAnchor="middle"
              fill="#888"
              fontSize={8}
            >
              {conn.travelTime} ticks
            </text>
          </g>
        )
      })}

      {/* Current location - SMALL dot (you are here) */}
      <circle
        cx={centerX}
        cy={centerY}
        r={currentAreaRadius}
        fill="#3b82f6"
        stroke="#60a5fa"
        strokeWidth={2}
      />

      {/* Current location label below the mini-map area */}
      <text x={centerX} y={MINI_MAP.height - 25} textAnchor="middle" fill="#aaa" fontSize={9}>
        You: {truncateText(location.areaName, 20)}
      </text>

      {/* Legend row */}
      <g class="map-legend" transform={`translate(10, ${MINI_MAP.height - 12})`}>
        <circle cx={5} cy={0} r={4} fill="#4ade80" />
        <text x={12} y={3} fill="#aaa" fontSize={7}>
          Explored
        </text>
        <circle cx={70} cy={0} r={4} fill="#facc15" />
        <text x={77} y={3} fill="#aaa" fontSize={7}>
          Partial
        </text>
        <circle cx={130} cy={0} r={4} fill="#f97316" />
        <text x={137} y={3} fill="#aaa" fontSize={7}>
          New
        </text>
        <circle cx={175} cy={0} r={4} fill="#6b7280" />
        <text x={182} y={3} fill="#aaa" fontSize={7}>
          Unknown
        </text>

        {/* Click hint */}
        <text x={MINI_MAP.width - 20} y={3} fill="#666" fontSize={7}>
          (click)
        </text>
      </g>
    </svg>
  )
}

// Full-screen map showing entire known world
function FullScreenMap({ location, exploration, onClose }: MapProps & { onClose: () => void }) {
  const { worldMap } = exploration
  const { width, height, padding } = FULL_MAP

  // Calculate positions for areas based on distance from town
  const positions = new Map<string, { x: number; y: number }>()

  if (worldMap.areas.length > 0) {
    // Group areas by distance
    const byDistance = new Map<number, typeof worldMap.areas>()
    let maxDistance = 0

    for (const area of worldMap.areas) {
      const group = byDistance.get(area.distance) || []
      group.push(area)
      byDistance.set(area.distance, group)
      maxDistance = Math.max(maxDistance, area.distance)
    }

    // Calculate positions
    const usableWidth = width - 2 * padding
    const usableHeight = height - 2 * padding

    for (const [distance, areas] of byDistance.entries()) {
      // X position based on distance (town on left, far areas on right)
      const x = maxDistance === 0 ? width / 2 : padding + (distance / maxDistance) * usableWidth

      // Y positions spread vertically
      const ySpacing = usableHeight / (areas.length + 1)

      areas.forEach((area, index) => {
        positions.set(area.areaId, {
          x,
          y: padding + ySpacing * (index + 1),
        })
      })
    }
  }

  return (
    <div class="full-map-modal">
      <div class="full-map-header">
        <h3>World Map</h3>
        <button class="close-map" onClick={onClose}>
          ✕ Close
        </button>
      </div>
      <div class="full-map-content">
        <svg viewBox={`0 0 ${width} ${height}`} class="full-map-svg">
          {/* Draw connections */}
          {worldMap.connections.map((conn) => {
            const fromPos = positions.get(conn.fromAreaId)
            const toPos = positions.get(conn.toAreaId)
            if (!fromPos || !toPos) return null

            return (
              <line
                key={`${conn.fromAreaId}-${conn.toAreaId}`}
                x1={fromPos.x}
                y1={fromPos.y}
                x2={toPos.x}
                y2={toPos.y}
                stroke="#555"
                strokeWidth={2}
              />
            )
          })}

          {/* Draw areas */}
          {worldMap.areas.map((area) => {
            const pos = positions.get(area.areaId)
            if (!pos) return null

            const color = getStatusColor(area.explorationStatus)
            const isCurrent = area.areaId === location.areaId
            const radius = isCurrent ? FULL_MAP.currentNodeRadius : 25

            return (
              <g key={area.areaId}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={radius}
                  fill={color}
                  stroke={isCurrent ? "#60a5fa" : "#333"}
                  strokeWidth={isCurrent ? 4 : 2}
                />
                <text
                  x={pos.x}
                  y={pos.y + 4}
                  textAnchor="middle"
                  fill="white"
                  fontSize={12}
                  fontWeight={isCurrent ? "bold" : "normal"}
                >
                  {truncateText(area.areaName, 12)}
                </text>
                {isCurrent && (
                  <text
                    x={pos.x}
                    y={pos.y + radius + 15}
                    textAnchor="middle"
                    fill="#60a5fa"
                    fontSize={10}
                  >
                    (You are here)
                  </text>
                )}
              </g>
            )
          })}

          {/* Legend */}
          <g transform={`translate(20, ${height - 40})`}>
            <text x={0} y={0} fill="#888" fontSize={11}>
              Legend:
            </text>
            <circle cx={60} cy={-4} r={6} fill="#4ade80" />
            <text x={70} y={0} fill="#aaa" fontSize={10}>
              Explored
            </text>
            <circle cx={140} cy={-4} r={6} fill="#facc15" />
            <text x={150} y={0} fill="#aaa" fontSize={10}>
              Partial
            </text>
            <circle cx={210} cy={-4} r={6} fill="#f97316" />
            <text x={220} y={0} fill="#aaa" fontSize={10}>
              New
            </text>
            <circle cx={265} cy={-4} r={6} fill="#6b7280" />
            <text x={275} y={0} fill="#aaa" fontSize={10}>
              Unknown
            </text>

            <text x={width - 200} y={0} fill="#666" fontSize={10}>
              Distance from town →
            </text>
          </g>
        </svg>
      </div>
    </div>
  )
}

// Main Map component
export function Map({ location, exploration }: MapProps) {
  const [showFullMap, setShowFullMap] = useState(false)

  if (showFullMap) {
    return (
      <div class="map panel">
        <FullScreenMap
          location={location}
          exploration={exploration}
          onClose={() => setShowFullMap(false)}
        />
      </div>
    )
  }

  return (
    <div class="map panel">
      <h3>Map</h3>
      <MiniMap location={location} exploration={exploration} onClick={() => setShowFullMap(true)} />
    </div>
  )
}
