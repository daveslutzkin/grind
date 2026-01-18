import type { LocationInfo, ExplorationInfo, ConnectionInfo } from "../../../session/types"

interface MapProps {
  location: LocationInfo
  exploration: ExplorationInfo
}

// Simple SVG map showing current area and connections
export function Map({ location, exploration }: MapProps) {
  const { connections } = exploration
  const centerX = 150
  const centerY = 100

  // Position connected areas in a circle around the current location
  const getConnectionPosition = (index: number, total: number) => {
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2
    const radius = 60
    return {
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    }
  }

  const getStatusColor = (status: ConnectionInfo["explorationStatus"]) => {
    switch (status) {
      case "fully explored":
        return "#4ade80" // green
      case "partly explored":
        return "#facc15" // yellow
      case "unexplored":
        return "#f97316" // orange
      case "undiscovered":
        return "#6b7280" // gray
    }
  }

  const getDistanceStyle = (distance: ConnectionInfo["relativeDistance"]) => {
    switch (distance) {
      case "closer":
        return { strokeDasharray: "none", strokeWidth: 2 }
      case "same":
        return { strokeDasharray: "4,4", strokeWidth: 1.5 }
      case "further":
        return { strokeDasharray: "2,4", strokeWidth: 1 }
    }
  }

  return (
    <div class="map panel">
      <h3>Map</h3>
      <svg viewBox="0 0 300 200" class="map-svg">
        {/* Draw connections first (behind nodes) */}
        {connections.map((conn, i) => {
          const pos = getConnectionPosition(i, connections.length)
          const style = getDistanceStyle(conn.relativeDistance)
          return (
            <line
              key={`line-${conn.toAreaId}`}
              x1={centerX}
              y1={centerY}
              x2={pos.x}
              y2={pos.y}
              stroke="#666"
              {...style}
            />
          )
        })}

        {/* Current location (center) */}
        <circle cx={centerX} cy={centerY} r={20} fill="#3b82f6" stroke="#60a5fa" strokeWidth={3} />
        <text x={centerX} y={centerY + 4} textAnchor="middle" fill="white" fontSize={10}>
          {location.areaName.slice(0, 6)}
        </text>
        <text
          x={centerX}
          y={centerY + 35}
          textAnchor="middle"
          fill="#aaa"
          fontSize={8}
          class="map-label"
        >
          {location.locationName}
        </text>

        {/* Connected areas */}
        {connections.map((conn, i) => {
          const pos = getConnectionPosition(i, connections.length)
          const color = getStatusColor(conn.explorationStatus)
          return (
            <g key={conn.toAreaId}>
              <circle cx={pos.x} cy={pos.y} r={15} fill={color} stroke="#333" strokeWidth={2} />
              <text x={pos.x} y={pos.y + 3} textAnchor="middle" fill="white" fontSize={8}>
                {conn.toAreaName.slice(0, 5)}
              </text>
              <text x={pos.x} y={pos.y + 25} textAnchor="middle" fill="#888" fontSize={7}>
                {conn.travelTime}t
              </text>
            </g>
          )
        })}

        {/* Legend */}
        <g class="map-legend" transform="translate(5, 170)">
          <circle cx={5} cy={5} r={4} fill="#4ade80" />
          <text x={12} y={8} fill="#aaa" fontSize={7}>
            Explored
          </text>
          <circle cx={55} cy={5} r={4} fill="#facc15" />
          <text x={62} y={8} fill="#aaa" fontSize={7}>
            Partial
          </text>
          <circle cx={100} cy={5} r={4} fill="#f97316" />
          <text x={107} y={8} fill="#aaa" fontSize={7}>
            New
          </text>
          <circle cx={135} cy={5} r={4} fill="#6b7280" />
          <text x={142} y={8} fill="#aaa" fontSize={7}>
            Unknown
          </text>
        </g>
      </svg>
    </div>
  )
}
