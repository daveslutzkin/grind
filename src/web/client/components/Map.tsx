import { useState } from "preact/hooks"
import type { LocationInfo, ExplorationInfo, AreaActivities } from "../../../session/types"
import {
  getConnectedAreaPosition,
  getStatusColor,
  getDistanceLineStyle,
  calculateFullMapPositions,
  MINI_MAP,
  FULL_MAP,
} from "./mapUtils"

interface MapProps {
  location: LocationInfo
  exploration: ExplorationInfo
  hasExplorationSkill: boolean
  hasMiningSkill: boolean
  hasWoodcuttingSkill: boolean
  hasCombatSkill: boolean
}

// Activity icons for map areas (emoji + small font)
function ActivityIcons({
  activities,
  x,
  y,
  fontSize = 8,
}: {
  activities?: AreaActivities
  x: number
  y: number
  fontSize?: number
}) {
  if (!activities) return null

  const icons: string[] = []
  if (activities.hasMining) icons.push("⛏")
  if (activities.hasForestry) icons.push("🌲")
  if (activities.hasCombat) icons.push("⚔")
  if (activities.hasUnexploredPaths) icons.push("?")

  if (icons.length === 0) return null

  // Center the icons horizontally
  const totalWidth = icons.length * (fontSize + 2)
  const startX = x - totalWidth / 2

  return (
    <g>
      {icons.map((icon, i) => (
        <text
          key={i}
          x={startX + i * (fontSize + 2)}
          y={y}
          fontSize={fontSize}
          fill={icon === "?" ? "#f97316" : "#aaa"}
        >
          {icon}
        </text>
      ))}
    </g>
  )
}

// Mini-map SVG showing current area and connections
// Design: small dot for current area, larger dots for "where can I go?" destinations
function MiniMap({
  location,
  exploration,
  hasExplorationSkill,
  hasMiningSkill,
  hasWoodcuttingSkill,
  hasCombatSkill,
  onClick,
}: MapProps & { onClick: () => void }) {
  const { connections, worldMap } = exploration
  const { centerX, centerY, currentAreaRadius, connectedAreaRadius } = MINI_MAP

  // Helper to get activities for an area from worldMap
  const getAreaActivities = (areaId: string) => {
    return worldMap.areas.find((a) => a.areaId === areaId)?.activities
  }

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
        const activities = getAreaActivities(conn.toAreaId)
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
              fontSize={7}
              fontWeight="bold"
            >
              {conn.toAreaName}
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
            {/* Activity icons below travel time */}
            <ActivityIcons
              activities={activities}
              x={pos.x}
              y={pos.y + connectedAreaRadius + 22}
              fontSize={7}
            />
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
        You: {location.areaName}
      </text>

      {/* Legend - vertical layout, only shown if player has Exploration skill */}
      {hasExplorationSkill && (
        <g class="map-legend" transform={`translate(10, ${MINI_MAP.height - 70})`}>
          <circle cx={6} cy={0} r={5} fill="#4ade80" />
          <text x={16} y={4} fill="#aaa" fontSize={10}>
            Explored
          </text>
          <circle cx={6} cy={18} r={5} fill="#facc15" />
          <text x={16} y={22} fill="#aaa" fontSize={10}>
            Partial
          </text>
          <circle cx={6} cy={36} r={5} fill="#f97316" />
          <text x={16} y={40} fill="#aaa" fontSize={10}>
            New
          </text>
          <circle cx={6} cy={54} r={5} fill="#6b7280" />
          <text x={16} y={58} fill="#aaa" fontSize={10}>
            Unknown
          </text>
        </g>
      )}

      {/* Activity icons legend - positioned on right side */}
      {(hasMiningSkill || hasWoodcuttingSkill || hasCombatSkill) && (
        <g transform={`translate(${MINI_MAP.width - 80}, ${MINI_MAP.height - 70})`}>
          {hasMiningSkill && (
            <g>
              <text x={0} y={4} fill="#aaa" fontSize={9}>
                ⛏ Mining
              </text>
            </g>
          )}
          {hasWoodcuttingSkill && (
            <g transform={`translate(0, ${hasMiningSkill ? 14 : 0})`}>
              <text x={0} y={4} fill="#aaa" fontSize={9}>
                🌲 Forestry
              </text>
            </g>
          )}
          {hasCombatSkill && (
            <g
              transform={`translate(0, ${(hasMiningSkill ? 14 : 0) + (hasWoodcuttingSkill ? 14 : 0)})`}
            >
              <text x={0} y={4} fill="#aaa" fontSize={9}>
                ⚔ Combat
              </text>
            </g>
          )}
          {hasExplorationSkill && (
            <g
              transform={`translate(0, ${(hasMiningSkill ? 14 : 0) + (hasWoodcuttingSkill ? 14 : 0) + (hasCombatSkill ? 14 : 0)})`}
            >
              <text x={0} y={4} fill="#f97316" fontSize={9}>
                ? Unexplored
              </text>
            </g>
          )}
        </g>
      )}

      {/* Click hint */}
      <text x={MINI_MAP.width - 30} y={MINI_MAP.height - 8} fill="#666" fontSize={10}>
        (click)
      </text>
    </svg>
  )
}

// Full-screen map showing entire known world
function FullScreenMap({
  location,
  exploration,
  hasExplorationSkill,
  hasMiningSkill,
  hasWoodcuttingSkill,
  hasCombatSkill,
  onClose,
}: MapProps & { onClose: () => void }) {
  const { worldMap } = exploration
  const { width, height } = FULL_MAP

  // Calculate positions for areas using the utility function
  const positions = calculateFullMapPositions(worldMap)

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
            const radius = isCurrent ? FULL_MAP.currentNodeRadius : FULL_MAP.minNodeRadius

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
                  fontSize={8}
                  fontWeight={isCurrent ? "bold" : "normal"}
                >
                  {area.areaName}
                </text>
                {/* Activity icons below area name */}
                <ActivityIcons
                  activities={area.activities}
                  x={pos.x}
                  y={pos.y + radius + (isCurrent ? 28 : 12)}
                  fontSize={9}
                />
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

          {/* Legend - only shown if player has Exploration skill */}
          {hasExplorationSkill && (
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
            </g>
          )}

          {/* Activity icons legend - second row */}
          {(hasMiningSkill || hasWoodcuttingSkill || hasCombatSkill || hasExplorationSkill) && (
            <g transform={`translate(20, ${height - 20})`}>
              <text x={0} y={0} fill="#888" fontSize={11}>
                Activities:
              </text>
              {hasMiningSkill && (
                <text x={75} y={0} fill="#aaa" fontSize={10}>
                  ⛏ Mining
                </text>
              )}
              {hasWoodcuttingSkill && (
                <text x={145} y={0} fill="#aaa" fontSize={10}>
                  🌲 Forestry
                </text>
              )}
              {hasCombatSkill && (
                <text x={225} y={0} fill="#aaa" fontSize={10}>
                  ⚔ Combat
                </text>
              )}
              {hasExplorationSkill && (
                <text x={300} y={0} fill="#f97316" fontSize={10}>
                  ? Unexplored paths
                </text>
              )}
            </g>
          )}

          <g transform={`translate(${width - 200}, ${height - 40})`}>
            <text x={0} y={0} fill="#666" fontSize={10}>
              Distance from town →
            </text>
          </g>
        </svg>
      </div>
    </div>
  )
}

// Main Map component (named GameMap to avoid shadowing JS built-in Map)
export function GameMap({
  location,
  exploration,
  hasExplorationSkill,
  hasMiningSkill,
  hasWoodcuttingSkill,
  hasCombatSkill,
}: MapProps) {
  const [showFullMap, setShowFullMap] = useState(false)

  if (showFullMap) {
    return (
      <div class="map panel">
        <FullScreenMap
          location={location}
          exploration={exploration}
          hasExplorationSkill={hasExplorationSkill}
          hasMiningSkill={hasMiningSkill}
          hasWoodcuttingSkill={hasWoodcuttingSkill}
          hasCombatSkill={hasCombatSkill}
          onClose={() => setShowFullMap(false)}
        />
      </div>
    )
  }

  return (
    <div class="map panel">
      <h3>Map</h3>
      <MiniMap
        location={location}
        exploration={exploration}
        hasExplorationSkill={hasExplorationSkill}
        hasMiningSkill={hasMiningSkill}
        hasWoodcuttingSkill={hasWoodcuttingSkill}
        hasCombatSkill={hasCombatSkill}
        onClick={() => setShowFullMap(true)}
      />
    </div>
  )
}
