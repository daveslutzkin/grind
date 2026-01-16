import type { WorldState, ActionLog, TickFeedback } from "../types.js"
import { getXPThresholdForNextLevel } from "../types.js"
import { getCurrentAreaId, getCurrentLocationId, ExplorationLocationType } from "../types.js"
import {
  getUnlockedModes,
  getNextModeUnlock,
  getCurrentLocation,
  getLocationSkillRequirement,
} from "../actionChecks.js"
import { getLocationDisplayName } from "../world.js"
import {
  BASE_TRAVEL_TIME,
  getAreaDisplayName as getAreaDisplayNameBase,
  getRollInterval,
  getExplorationXPThreshold,
} from "../exploration.js"
import {
  getPlayerNodeView,
  getNodeTypeName,
  getSkillForNodeType,
  isMaterialVisible,
  getMaxVisibleMaterialLevel,
} from "../visibility.js"
import type { GatheringSkillID } from "../types.js"
import { normalCDF } from "../runner.js"
import { getAvailableActions, type AvailableAction } from "../availableActions.js"
import { generateFailureHint, getGenericFailureMessage } from "../hints.js"

/**
 * Get the guild name where a gathering skill can be learned
 */
function getGuildForSkill(skill: GatheringSkillID): string {
  return skill === "Mining" ? "Miners Guild" : "Foresters Guild"
}

/**
 * Convert a material ID like "COPPER_ORE" to human-readable form like "Copper Ore"
 */
function formatMaterialName(materialId: string): string {
  return materialId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

/**
 * Get display name for an area from WorldState.
 * Wrapper around getAreaDisplayName from exploration.ts that looks up the area automatically.
 * Uses LLM-generated name if available, otherwise falls back to distance-based generic names.
 */
function getAreaDisplayName(state: WorldState, areaId: string): string {
  const area = state.exploration?.areas.get(areaId)
  return getAreaDisplayNameBase(areaId, area)
}

/**
 * Get the exploration status of an area for display purposes.
 * Returns: "undiscovered" | "unexplored" | "partly explored" | "fully explored"
 */
function getAreaExplorationStatus(state: WorldState, areaId: string): string {
  const knownAreaIds = state.exploration.playerState.knownAreaIds
  const knownLocationIds = state.exploration.playerState.knownLocationIds
  const knownConnectionIds = new Set(state.exploration.playerState.knownConnectionIds)

  // If area is not in knownAreaIds, we only know a connection exists
  if (!knownAreaIds.includes(areaId)) {
    return "undiscovered"
  }

  const area = state.exploration.areas.get(areaId)
  if (!area) {
    return "unexplored"
  }

  // Count known locations in this area
  const knownLocs = area.locations.filter((loc) => knownLocationIds.includes(loc.id)).length

  // Count discovered connections from this area
  const connectionsFromArea = state.exploration.connections.filter(
    (conn) => conn.fromAreaId === areaId || conn.toAreaId === areaId
  )
  const discoveredConnectionsFromArea = connectionsFromArea.filter((conn) => {
    const connId = `${conn.fromAreaId}->${conn.toAreaId}`
    const reverseConnId = `${conn.toAreaId}->${conn.fromAreaId}`
    // Don't count the TOWN->here connection as a discovery from this area
    if (conn.fromAreaId === "TOWN" && conn.toAreaId === areaId) return false
    return knownConnectionIds.has(connId) || knownConnectionIds.has(reverseConnId)
  })

  // Check if any discoveries have been made
  const hasAnyDiscovery = knownLocs > 0 || discoveredConnectionsFromArea.length > 1

  // Check if fully explored
  const remainingLocations = area.locations.filter((loc) => !knownLocationIds.includes(loc.id))
  const remainingConnections = state.exploration.connections.filter((conn) => {
    const isFromCurrent = conn.fromAreaId === areaId
    const isToCurrent = conn.toAreaId === areaId
    if (!isFromCurrent && !isToCurrent) return false
    const connId = `${conn.fromAreaId}->${conn.toAreaId}`
    const reverseConnId = `${conn.toAreaId}->${conn.fromAreaId}`
    const isDiscovered = knownConnectionIds.has(connId) || knownConnectionIds.has(reverseConnId)
    return !isDiscovered
  })

  const isFullyExplored = remainingLocations.length === 0 && remainingConnections.length === 0

  if (!hasAnyDiscovery) {
    return "unexplored"
  } else if (isFullyExplored) {
    return "fully explored"
  } else {
    return "partly explored"
  }
}

/**
 * Format tick feedback for display during animated actions
 * Returns a string to show after the dot, or null if no display needed
 * @param feedback The feedback to format
 * @param ticksCompleted Number of ticks completed so far
 */
export function formatTickFeedback(feedback: TickFeedback, ticksCompleted: number): string | null {
  if (feedback.damage) {
    const { target, amount, enemyHpRemaining, playerHpRemaining } = feedback.damage
    if (target === "enemy") {
      return `(-${amount} enemy${enemyHpRemaining !== undefined ? `, ${enemyHpRemaining} HP left` : ""})`
    } else {
      return `(-${amount} you${playerHpRemaining !== undefined ? `, ${playerHpRemaining} HP left` : ""})`
    }
  }

  if (feedback.combatMiss) {
    return feedback.combatMiss.attacker === "player" ? "(miss)" : "(dodged)"
  }

  if (feedback.combatVictory) {
    return `Victory!`
  }

  if (feedback.combatDefeat) {
    return `Defeated!`
  }

  if (feedback.gathered) {
    return `(+${feedback.gathered.quantity} ${feedback.gathered.itemId})`
  }

  if (feedback.gatheringComplete) {
    const items = feedback.gatheringComplete.totalItems
    const itemStr = items.map((i) => `${i.quantity} ${i.itemId}`).join(", ")
    return `(gathered: ${itemStr})`
  }

  if (feedback.crafted) {
    return `(+${feedback.crafted.quantity} ${feedback.crafted.itemId})`
  }

  if (feedback.materialsConsumed) {
    const items = feedback.materialsConsumed
    const itemStr = items.map((i) => `${i.quantity} ${i.itemId}`).join(", ")
    return `(consumed: ${itemStr})`
  }

  if (feedback.discovered) {
    return `*found after ${ticksCompleted - 1} ticks*`
  }

  if (feedback.xpGained) {
    return `(+${feedback.xpGained.amount} ${feedback.xpGained.skill} XP)`
  }

  if (feedback.message) {
    return feedback.message
  }

  return null
}

/**
 * Format WorldState as concise text for LLM consumption
 */
export function formatWorldState(state: WorldState): string {
  const lines: string[] = []
  const currentArea = getCurrentAreaId(state)

  // ========== PLAYER SECTION (separated by blank line) ==========

  // Inventory - compact
  if (state.player.inventory.length === 0) {
    lines.push(`Inventory: empty (0/${state.player.inventoryCapacity})`)
  } else {
    const items = state.player.inventory.map((i) => `${i.quantity} ${i.itemId}`).join(", ")
    lines.push(
      `Inventory: ${items} (${state.player.inventory.length}/${state.player.inventoryCapacity})`
    )
  }

  // Storage - compact, only if non-empty
  if (state.player.storage.length > 0) {
    const items = state.player.storage.map((i) => `${i.quantity} ${i.itemId}`).join(", ")
    lines.push(`Storage: ${items}`)
  }

  // Skills - only show enrolled skills
  const enrolledSkills = Object.entries(state.player.skills)
    .filter(([, s]) => s.level > 0)
    .map(([id, s]) => {
      let skillStr = `${id} L${s.level}`
      // Add gather modes for gathering skills
      if (id === "Mining" || id === "Woodcutting") {
        const modes = getUnlockedModes(s.level)
        const nextUnlock = getNextModeUnlock(s.level)
        const modesStr = modes.join("/")
        skillStr += ` [${modesStr}]`
        if (nextUnlock) {
          skillStr += ` (${nextUnlock.mode}@L${nextUnlock.level})`
        }
      }
      return skillStr
    })
  lines.push(`Skills: ${enrolledSkills.length > 0 ? enrolledSkills.join(", ") : "none"}`)

  // Show player gold if non-zero
  if (state.player.gold > 0) {
    lines.push(`Gold: ${state.player.gold}`)
  }

  // Show cumulative gathering luck if non-zero
  if (state.player.gatheringLuckDelta !== 0) {
    const luck = state.player.gatheringLuckDelta
    const luckStr = luck > 0 ? `+${luck}` : `${luck}`
    lines.push(`Gathering Luck: ${luckStr} ticks`)
  }

  // Active contracts - compact
  if (state.player.activeContracts.length > 0) {
    const contracts = state.player.activeContracts
      .map((id) => {
        const c = state.world.contracts.find((x) => x.id === id)
        if (!c) return id
        const reqs = c.requirements.map((r) => `${r.quantity} ${r.itemId}`).join(", ")
        return `${id} (need ${reqs})`
      })
      .join("; ")
    lines.push(`Active: ${contracts}`)
  }

  // Recipes - only show when at a guild hall of matching type
  const currentLocationId = getCurrentLocationId(state)
  const currentLocation = getCurrentLocation(state)
  const isAtGuildHall =
    currentLocation?.type === ExplorationLocationType.GUILD_HALL && currentLocation.guildType
  const recipes = isAtGuildHall
    ? state.world.recipes.filter((r) => r.guildType === currentLocation.guildType)
    : []
  if (recipes.length > 0) {
    const recipeStr = recipes
      .map((r) => {
        const inputs = r.inputs.map((i) => `${i.quantity} ${i.itemId}`).join("+")
        return `${r.id} (${inputs}, ${r.guildType})`
      })
      .join(", ")
    lines.push(`Recipes: ${recipeStr}`)
  }

  // Contracts - only show at the specific accept location
  const contracts = state.world.contracts.filter(
    (c) => c.acceptLocationId === currentLocationId && !state.player.activeContracts.includes(c.id)
  )
  if (contracts.length > 0) {
    const contractStr = contracts
      .map((c) => {
        const reqs = c.requirements.map((r) => `${r.quantity} ${r.itemId}`).join("+")
        // Show goldReward for mining contracts, item rewards for others
        const rewardStr = c.goldReward
          ? `${c.goldReward.toFixed(1)} gold`
          : c.rewards.map((r) => `${r.quantity} ${r.itemId}`).join("+")
        return `${c.id} (${reqs} → ${rewardStr}, +${c.reputationReward} rep)`
      })
      .join("; ")
    lines.push(`Contracts: ${contractStr}`)
  }

  // ========== LOCATION SECTION ==========
  lines.push("")

  const area = state.exploration.areas.get(currentArea)
  const knownLocationIds = state.exploration.playerState.knownLocationIds

  // Check if we're at a special location (used later for conditional display)
  const areaLocationObj = area?.locations.find((loc) => loc.id === currentLocationId)
  const isAtGatheringNode =
    currentLocationId !== null && areaLocationObj?.type === ExplorationLocationType.GATHERING_NODE
  const isAtMobCamp =
    currentLocationId !== null && areaLocationObj?.type === ExplorationLocationType.MOB_CAMP

  if (currentArea === "TOWN") {
    // TOWN: show current location name and available locations by type
    const locationName = getLocationDisplayName(currentLocationId, currentArea, state)
    lines.push(`Location: ${locationName} in TOWN`)
    lines.push("")

    // Group TOWN locations by type
    if (!currentLocationId && area && area.locations.length > 0) {
      const guilds = area.locations.filter((loc) => loc.type === ExplorationLocationType.GUILD_HALL)
      const services = area.locations.filter(
        (loc) => loc.type !== ExplorationLocationType.GUILD_HALL
      )

      if (guilds.length > 0) {
        const guildNames = guilds
          .map((loc) => getLocationDisplayName(loc.id, currentArea, state))
          .join(", ")
        lines.push(`Guilds (go <name> to enter): ${guildNames}`)
      }
      if (services.length > 0) {
        const serviceNames = services
          .map((loc) => getLocationDisplayName(loc.id, currentArea, state))
          .join(", ")
        lines.push(`Services (go <name>): ${serviceNames}`)
      }
    }
  } else {
    // Wilderness: show location name (Clearing when at hub) with status suffix
    const locationName = getLocationDisplayName(currentLocationId, currentArea, state)
    const knownLocs = area
      ? area.locations.filter((loc) => knownLocationIds.includes(loc.id)).length
      : 0

    // Count discovered connections FROM this area (not including the one we came from)
    const knownConnectionIds = new Set(state.exploration.playerState.knownConnectionIds)
    const connectionsFromArea = state.exploration.connections.filter(
      (conn) => conn.fromAreaId === currentArea || conn.toAreaId === currentArea
    )
    const discoveredConnectionsFromArea = connectionsFromArea.filter((conn) => {
      const connId = `${conn.fromAreaId}->${conn.toAreaId}`
      // Don't count the TOWN->here connection as a discovery FROM this area
      if (conn.fromAreaId === "TOWN" && conn.toAreaId === currentArea) return false
      return knownConnectionIds.has(connId)
    })

    // Determine exploration status for Location line
    let explorationStatus = ""

    // Every area has 1 connection discovered (that's how the player got there)
    // so only MORE THAN one connection counts as a discovery
    const hasAnyDiscovery = knownLocs > 0 || discoveredConnectionsFromArea.length > 1

    // Check if area is fully explored
    const remainingLocations = area
      ? area.locations.filter((loc) => !knownLocationIds.includes(loc.id))
      : []
    const remainingKnownConnections = state.exploration.connections.filter((conn) => {
      const isFromCurrent = conn.fromAreaId === currentArea
      const isToCurrent = conn.toAreaId === currentArea
      if (!isFromCurrent && !isToCurrent) return false
      // Check both forward and reverse connection IDs
      const connId = `${conn.fromAreaId}->${conn.toAreaId}`
      const reverseConnId = `${conn.toAreaId}->${conn.fromAreaId}`
      const isDiscovered = knownConnectionIds.has(connId) || knownConnectionIds.has(reverseConnId)
      const targetId = isFromCurrent ? conn.toAreaId : conn.fromAreaId
      const targetIsKnown = state.exploration.playerState.knownAreaIds.includes(targetId)
      return !isDiscovered && targetIsKnown
    })
    // Also check for undiscovered connections to UNKNOWN areas
    const remainingUnknownConnections = state.exploration.connections.filter((conn) => {
      const isFromCurrent = conn.fromAreaId === currentArea
      const isToCurrent = conn.toAreaId === currentArea
      if (!isFromCurrent && !isToCurrent) return false
      // Check both forward and reverse connection IDs
      const connId = `${conn.fromAreaId}->${conn.toAreaId}`
      const reverseConnId = `${conn.toAreaId}->${conn.fromAreaId}`
      const isDiscovered = knownConnectionIds.has(connId) || knownConnectionIds.has(reverseConnId)
      const targetId = isFromCurrent ? conn.toAreaId : conn.fromAreaId
      const targetIsKnown = state.exploration.playerState.knownAreaIds.includes(targetId)
      // Connection to unknown area that hasn't been discovered yet
      return !isDiscovered && !targetIsKnown
    })
    const isFullyExplored =
      remainingLocations.length === 0 &&
      remainingKnownConnections.length === 0 &&
      remainingUnknownConnections.length === 0

    if (!hasAnyDiscovery) {
      // Nothing discovered yet (no locations AND no connections from here)
      explorationStatus = "Unexplored (use explore action to start)"
    } else if (isFullyExplored) {
      // All locations and all connections discovered
      explorationStatus = "Fully explored!"
    } else {
      // Something discovered but not everything
      explorationStatus = "Partly explored"
    }

    // Title format: just area name at hub, "Location Name (area)" at a location
    const areaName = getAreaDisplayName(state, currentArea)
    const isAtHub = currentLocationId === null
    if (isAtHub) {
      lines.push(`** ${areaName} **`)
      lines.push("")
      lines.push(explorationStatus)
    } else {
      // At a sub-location - don't show exploration status
      lines.push(`${locationName} (${areaName})`)
    }

    lines.push("")

    if (isAtGatheringNode) {
      // At a gathering location - show only this location's information
      // Find the corresponding node
      const match = currentLocationId!.match(/-loc-(\d+)$/)
      if (match) {
        const nodeId = `${currentArea}-node-${match[1]}`
        const node = state.world.nodes?.find((n) => n.nodeId === nodeId)
        if (node) {
          const view = getPlayerNodeView(node, state)
          const skill = getSkillForNodeType(view.nodeType)
          const skillLevel = state.player.skills[skill]?.level ?? 0
          const locationRequirement = getLocationSkillRequirement(node.areaId)

          if (view.visibilityTier === "none") {
            // No skill - show that they need to enroll
            const guildName = getGuildForSkill(skill)
            lines.push(
              `You need to enrol in ${skill} at the ${guildName} to gather resources here.`
            )
          } else if (skillLevel < locationRequirement) {
            // Has skill but not enough for this tier
            lines.push(`This location requires ${skill} level ${locationRequirement}.`)
            lines.push(`Your current level: ${skillLevel}`)
          } else {
            // Has sufficient skill - show materials
            const sortedMaterials = [...view.visibleMaterials].sort(
              (a, b) => a.requiredLevel - b.requiredLevel
            )
            const matStrings = sortedMaterials.map((m) => {
              const canGather = m.requiredLevel <= skillLevel
              const suffix = canGather ? " ✓" : ` (L${m.requiredLevel})`
              const materialName = formatMaterialName(m.materialId)
              if (view.visibilityTier === "full") {
                // Appraised - show quantities (format: "70/70 Stone ✓")
                return `${m.remainingUnits}/${m.maxUnitsInitial} ${materialName}${suffix}`
              } else {
                // Not appraised - just material name
                return `${materialName}${suffix}`
              }
            })
            if (matStrings.length > 0) {
              lines.push("Resources:")
              for (const str of matStrings) {
                lines.push(`  ${str}`)
              }
              lines.push("")
            } else {
              lines.push("No visible resources at your current skill level.")
            }
          }
        }
      }
    } else if (isAtMobCamp) {
      // At an enemy camp - show creature type and difficulty
      if (areaLocationObj) {
        const creatureType = areaLocationObj.creatureType || "unknown creature"
        const difficulty = areaLocationObj.difficulty ?? 0

        lines.push(`Enemy camp: ${creatureType}`)
        lines.push(`Difficulty: ${difficulty}`)
      }
    } else {
      // At hub - show area-level information
      // Count known gathering locations separately from other location types
      const knownGatheringLocs = area
        ? area.locations.filter(
            (loc) =>
              loc.type === ExplorationLocationType.GATHERING_NODE &&
              knownLocationIds.includes(loc.id)
          ).length
        : 0

      // Only show Gathering line if we've discovered at least one gathering location
      if (knownGatheringLocs > 0) {
        const nodesHere = state.world.nodes?.filter((n) => {
          if (n.areaId !== currentArea || n.depleted) return false
          const match = n.nodeId.match(/-node-(\d+)$/)
          if (!match) return false
          const locationId = `${n.areaId}-loc-${match[1]}`
          return knownLocationIds.includes(locationId)
        })

        if (nodesHere && nodesHere.length > 0) {
          lines.push("Gathering:")
          for (const node of nodesHere) {
            const view = getPlayerNodeView(node, state)
            const nodeName = getNodeTypeName(view.nodeType)

            const skill = getSkillForNodeType(view.nodeType)
            const skillLevel = state.player.skills[skill]?.level ?? 0
            const locationRequirement = getLocationSkillRequirement(node.areaId)

            if (view.visibilityTier === "none") {
              // No skill - show node type with required skill and guild
              const requiredSkill = getSkillForNodeType(view.nodeType)
              const guildName = getGuildForSkill(requiredSkill)
              lines.push(`  ${nodeName} (requires ${requiredSkill} - ${guildName})`)
            } else if (skillLevel < locationRequirement) {
              // Has skill but not enough for this tier - show as locked
              lines.push(`  ${nodeName} 🔒 (${skill} L${locationRequirement})`)
            } else {
              // Has sufficient skill - show materials with requirements
              // Sort materials by unlock level (lowest first)
              const sortedMaterials = [...view.visibleMaterials].sort(
                (a, b) => a.requiredLevel - b.requiredLevel
              )
              const matStrings = sortedMaterials.map((m) => {
                const canGather = m.requiredLevel <= skillLevel
                const suffix = canGather ? " ✓" : ` (L${m.requiredLevel})`
                const materialName = formatMaterialName(m.materialId)
                if (view.visibilityTier === "full") {
                  // Appraised - show quantities
                  return `${m.remainingUnits}/${m.maxUnitsInitial} ${materialName}${suffix}`
                } else {
                  // Not appraised - just material name
                  return `${materialName}${suffix}`
                }
              })
              if (matStrings.length > 0) {
                lines.push(`  ${nodeName} - ${matStrings.join(", ")}`)
              }
            }
          }
        } else {
          lines.push("Gathering:")
          lines.push("  none visible")
        }
      }

      // Show discovered enemy camps (separate from gathering nodes)
      const knownMobCamps = area?.locations.filter(
        (loc) => loc.type === ExplorationLocationType.MOB_CAMP && knownLocationIds.includes(loc.id)
      )
      if (knownMobCamps && knownMobCamps.length > 0) {
        const campDescriptions = knownMobCamps.map((camp) => {
          const difficultyStr =
            camp.difficulty !== undefined ? ` (difficulty ${camp.difficulty})` : ""
          return `enemy camp${difficultyStr}`
        })
        lines.push(`Enemy camps: ${campDescriptions.join(", ")}`)
      }
    }

    if (lines[lines.length - 1] != "") {
      lines.push("")
    }
  }

  // Only show connections and enemies when not at a special location
  // (when at a special location, focus is on that specific location)
  if (!currentLocationId) {
    // Travel - available connections (bidirectional - can go back the way you came)
    const knownConnections = state.exploration.playerState.knownConnectionIds
    const destinations = new Map<string, number>() // dest -> travel time

    for (const connId of knownConnections) {
      const [from, to] = connId.split("->")
      let dest: string | null = null
      let conn

      if (from === currentArea) {
        // Outgoing connection: currentArea -> somewhere
        dest = to
        conn = state.exploration.connections.find(
          (c) => c.fromAreaId === currentArea && c.toAreaId === to
        )
      } else if (to === currentArea) {
        // Incoming connection: somewhere -> currentArea (can travel back)
        dest = from
        conn = state.exploration.connections.find(
          (c) => c.fromAreaId === from && c.toAreaId === currentArea
        )
      }

      if (dest && !destinations.has(dest)) {
        const actualTravelTime = BASE_TRAVEL_TIME * (conn?.travelTimeMultiplier ?? 1)
        destinations.set(dest, actualTravelTime)
      }
    }

    if (destinations.size > 0) {
      // Get current area's distance from town
      const currentAreaDistance = area?.distance ?? 0

      // Group connections by distance relative to current area
      const closer: [string, number][] = []
      const same: [string, number][] = []
      const further: [string, number][] = []

      for (const [dest, time] of destinations.entries()) {
        const destArea = state.exploration.areas.get(dest)
        const destDistance = destArea?.distance ?? 0

        if (destDistance < currentAreaDistance) {
          closer.push([dest, time])
        } else if (destDistance === currentAreaDistance) {
          same.push([dest, time])
        } else {
          further.push([dest, time])
        }
      }

      // Sort each group by travel time (shortest first)
      const sortByTime = (a: [string, number], b: [string, number]) => a[1] - b[1]
      closer.sort(sortByTime)
      same.sort(sortByTime)
      further.sort(sortByTime)

      // Format each group with exploration status
      const formatGroup = (group: [string, number][]) =>
        group
          .map(([dest, time]) => {
            const areaName = getAreaDisplayName(state, dest)
            // Town doesn't show exploration status
            if (dest === "TOWN") {
              return `${time}t - ${areaName}`
            }
            const status = getAreaExplorationStatus(state, dest)
            return `${time}t - ${areaName} (${status})`
          })
          .join(", ")

      // Display groups in order: closer, same, further
      if (closer.length > 0) {
        lines.push(`Connections closer to Town: ${formatGroup(closer)}`)
      }
      if (same.length > 0) {
        lines.push(`Connections at this distance: ${formatGroup(same)}`)
      }
      if (further.length > 0) {
        lines.push(`Connections further from Town: ${formatGroup(further)}`)
      }
    } else {
      lines.push("Connections: none known")
    }
  }

  // ========== AVAILABLE ACTIONS SECTION ==========
  const available = getAvailableActions(state)
  if (available.length > 0) {
    lines.push("")
    lines.push("Available actions:")
    for (const action of available) {
      lines.push(formatAvailableAction(action))
    }
  }

  return lines.join("\n")
}

/**
 * Format a single available action for display
 */
function formatAvailableAction(action: AvailableAction): string {
  let cost: string
  if (action.isVariable) {
    // If timeCost is 0, just show "varies" without a misleading estimate
    if (action.timeCost === 0) {
      cost = `varies`
    } else {
      cost = `~${action.timeCost}t, varies`
    }
  } else {
    cost = `${action.timeCost}t`
  }

  let suffix = ""
  if (action.successProbability < 1.0) {
    const pct = Math.round(action.successProbability * 100)
    suffix = `, ${pct}% success`
  }

  return `  - ${action.displayName} (${cost}${suffix})`
}

/**
 * Calculate percentile for discovery time using geometric distribution
 * For geometric distribution (trials until first success):
 * - Mean = 1/p (in trials) or rollInterval/p (in ticks)
 * - StdDev = sqrt(1-p)/p (in trials) or rollInterval*sqrt(1-p)/p (in ticks)
 */
function calculateDiscoveryPercentile(
  actualTicks: number,
  expectedTicks: number,
  rollInterval: number
): number {
  // Success probability per roll
  const p = rollInterval / expectedTicks

  // Standard deviation for geometric distribution (in ticks)
  // stdDev = rollInterval * sqrt(1-p) / p = expectedTicks * sqrt(1-p)
  const stdDev = expectedTicks * Math.sqrt(1 - p)

  // Z-score: how many standard deviations from the mean
  // Note: actualTicks < expectedTicks means lucky (negative z-score, lower percentile)
  const zScore = (actualTicks - expectedTicks) / stdDev

  // Convert to percentile (0-100)
  return normalCDF(zScore) * 100
}

/**
 * Format ActionLog as concise text for LLM consumption
 * @param log The action log to format
 * @param state Optional world state for filtering material visibility
 */
export function formatActionLog(log: ActionLog, state?: WorldState): string {
  const lines: string[] = []

  // One-line summary - focus on what happened, not internal action names
  const icon = log.success ? "✓" : "✗"
  let timeStr = log.timeConsumed > 0 ? ` (${log.timeConsumed}t)` : ""

  // For connection discoveries, show connection travel time instead of discovery time
  if (log.explorationLog?.discoveredConnectionId && state) {
    const connId = log.explorationLog.discoveredConnectionId
    const [fromId, toId] = connId.split("->")
    const connection = state.exploration.connections.find(
      (c) => c.fromAreaId === fromId && c.toAreaId === toId
    )
    if (connection) {
      const travelTime = Math.round(BASE_TRAVEL_TIME * connection.travelTimeMultiplier)
      timeStr = ` (${travelTime}t travel time)`
    }
  }

  let summary: string
  if (!log.success) {
    // For failures, use structured failure details
    if (log.failureDetails) {
      if (state) {
        // Full hint generation with state
        const formatted = generateFailureHint(log.failureDetails, state)
        summary = `${icon} ${formatted.message}`
        if (formatted.reason) {
          summary += `\n  Reason: ${formatted.reason}`
        }
        if (formatted.hint) {
          summary += `\n  Hint: ${formatted.hint}`
        }
      } else {
        // Generic message without state (for backwards compatibility)
        summary = `${icon} ${getGenericFailureMessage(log.failureDetails.type)}`
      }
    } else {
      // Fallback when no failureDetails
      summary = `${icon} Action failed`
    }
  } else if (log.stateDeltaSummary) {
    // For successes, just show the human-readable summary
    summary = `${icon} ${log.stateDeltaSummary}${timeStr}`
  } else {
    // Fallback to action type if no summary
    summary = `${icon} ${log.actionType}${timeStr}`
  }

  lines.push(summary)

  // Appraisal results (important detail to show)
  if (log.extraction?.appraisal) {
    const a = log.extraction.appraisal
    // Filter materials by visibility if state is provided
    const visibleMats = state
      ? a.materials.filter((m) => {
          const skillLevel = state.player.skills[m.requiresSkill]?.level ?? 0
          return m.requiredLevel <= getMaxVisibleMaterialLevel(skillLevel)
        })
      : a.materials
    if (visibleMats.length > 0) {
      const mats = visibleMats
        .map((m) => {
          const req = m.requiredLevel > 0 ? ` [${m.requiresSkill} L${m.requiredLevel}]` : ""
          // Show quantities only if canSeeQuantity is true (M6 Appraise mastery)
          const qty = m.canSeeQuantity ? `${m.remaining}/${m.max}` : "???/???"
          return `${qty} ${m.materialId}${req}`
        })
        .join(", ")
      lines.push(`  ${a.nodeId}: ${mats}`)
    }
  }

  // Items gained
  if (log.extraction && log.extraction.extracted.length > 0) {
    const items = log.extraction.extracted.map((i) => `+${i.quantity} ${i.itemId}`).join(", ")
    let itemLine = `  Gained: ${items}`
    if (log.extraction.focusWaste > 0) {
      itemLine += ` (${log.extraction.focusWaste} wasted)`
    }
    lines.push(itemLine)

    // Filter collateral damage by material visibility
    if (state) {
      const visibleCollateral = Object.entries(log.extraction.collateralDamage).filter(([m]) =>
        isMaterialVisible(m, state)
      )
      if (visibleCollateral.length > 0) {
        const dmg = visibleCollateral.map(([m, d]) => `-${d} ${m}`).join(", ")
        lines.push(`  Collateral: ${dmg}`)
      }
    } else if (Object.keys(log.extraction.collateralDamage).length > 0) {
      // No state = show all collateral
      const dmg = Object.entries(log.extraction.collateralDamage)
        .map(([m, d]) => `-${d} ${m}`)
        .join(", ")
      lines.push(`  Collateral: ${dmg}`)
    }

    // Show time variance luck if significant
    if (log.extraction.variance?.luckDelta && log.extraction.variance.luckDelta !== 0) {
      const { expected, actual, luckDelta } = log.extraction.variance
      const luckStr = luckDelta > 0 ? `+${luckDelta} luck` : `${luckDelta} luck`
      lines.push(`  Time: ${actual} ticks (${expected} base, ${luckStr})`)
    }
  }

  // XP gained (inline with level ups if any)
  if (log.skillGained) {
    let xpLine = `  +${log.skillGained.amount} ${log.skillGained.skill} XP`

    // Add XP progress if state is available
    if (state) {
      const skill = state.player.skills[log.skillGained.skill]
      if (skill) {
        const threshold =
          log.skillGained.skill === "Exploration"
            ? getExplorationXPThreshold(skill.level)
            : getXPThresholdForNextLevel(skill.level)
        const remaining = threshold - skill.xp
        const percentToNext = Math.round((skill.xp / threshold) * 100)
        xpLine += ` (${remaining} to next level, ${percentToNext}% there)`
      }
    }

    if (log.levelUps && log.levelUps.length > 0) {
      const lvls = log.levelUps.map((l) => `${l.skill} ${l.fromLevel}→${l.toLevel}`).join(", ")
      xpLine += ` [LEVEL UP: ${lvls}]`
    }
    lines.push(xpLine)
  }

  // Contracts completed
  if (log.contractsCompleted && log.contractsCompleted.length > 0) {
    for (const cc of log.contractsCompleted) {
      // Show goldEarned for mining contracts, item rewards for others
      let rewardStr: string
      if (cc.goldEarned) {
        rewardStr = `${cc.goldEarned.toFixed(1)} gold`
      } else {
        rewardStr = cc.rewardsGranted.map((r) => `${r.quantity} ${r.itemId}`).join(", ")
      }
      lines.push(`  CONTRACT DONE: ${cc.contractId} → ${rewardStr}, +${cc.reputationGained} rep`)
    }
  }

  // RNG display - exploration uses luckInfo, others show individual rolls
  const isExplorationAction = log.actionType === "Explore" || log.actionType === "Survey"

  if (log.explorationLog?.luckInfo && state) {
    // Exploration: show luck summary without revealing individual rolls
    const luck = log.explorationLog.luckInfo
    const delta = luck.luckDelta

    // Get roll interval based on player's exploration level
    const explorationLevel = state.player.skills.Exploration.level
    const rollInterval = getRollInterval(explorationLevel)

    // Calculate percentile using geometric distribution
    const percentile = calculateDiscoveryPercentile(
      luck.actualTicks,
      luck.expectedTicks,
      rollInterval
    )

    // Determine luck label based on percentile
    // Lower percentile = faster/luckier (e.g., 35% means faster than 35% of outcomes)
    let luckLabel: string
    if (percentile <= 15) {
      luckLabel = "very lucky"
    } else if (percentile <= 40) {
      luckLabel = "lucky"
    } else if (percentile >= 85) {
      luckLabel = "very unlucky"
    } else if (percentile >= 60) {
      luckLabel = "unlucky"
    } else {
      luckLabel = "average"
    }

    const deltaStr =
      delta > 0 ? `${delta}t faster` : delta < 0 ? `${Math.abs(delta)}t slower` : "on target"

    lines.push(
      `  RNG: ${luckLabel} (${Math.round(percentile)}% percentile) - took ${luck.actualTicks}t, ${deltaStr} than expected`
    )
  } else if (log.explorationLog?.luckInfo) {
    // Fallback if state is not available - use old format
    const luck = log.explorationLog.luckInfo
    const delta = luck.luckDelta
    const deltaPercent = luck.expectedTicks > 0 ? (delta / luck.expectedTicks) * 100 : 0

    let luckLabel: string
    if (deltaPercent >= 50) {
      luckLabel = "very lucky"
    } else if (deltaPercent > 0) {
      luckLabel = "lucky"
    } else if (deltaPercent <= -50) {
      luckLabel = "very unlucky"
    } else if (deltaPercent < 0) {
      luckLabel = "unlucky"
    } else {
      luckLabel = "average"
    }

    const deltaStr =
      delta > 0 ? `${delta}t faster` : delta < 0 ? `${Math.abs(delta)}t slower` : "on target"

    lines.push(`  RNG: ${deltaStr} (${luckLabel})`)
  } else if (isExplorationAction) {
    // Failed exploration - don't show individual rolls
    // as they reveal information about undiscovered things
  } else if (log.rngRolls.length > 0) {
    // Non-exploration: show individual rolls
    const rolls = log.rngRolls.map(
      (r) => `${Math.round(r.probability * 100)}%:${r.result ? "✓" : "✗"}`
    )

    // Calculate luck: expected ticks vs actual ticks
    // For repeated rolls at probability p every N ticks, expected = N/p per success
    // Assume 2-tick intervals for exploration-style rolls
    const successCount = log.rngRolls.filter((r) => r.result).length
    if (successCount > 0 && log.rngRolls.length > 0) {
      const avgProb = log.rngRolls.reduce((sum, r) => sum + r.probability, 0) / log.rngRolls.length
      const rollInterval = 2 // ticks per roll attempt
      const expectedTicksPerSuccess = rollInterval / avgProb
      const expectedTicks = Math.round(expectedTicksPerSuccess * successCount)
      const actualTicks = log.timeConsumed
      const delta = expectedTicks - actualTicks
      const deltaPercent = expectedTicks > 0 ? (delta / expectedTicks) * 100 : 0

      // Determine luck label based on how far from expected
      let luckLabel: string
      if (deltaPercent >= 50) {
        luckLabel = "very lucky"
      } else if (deltaPercent > 0) {
        luckLabel = "lucky"
      } else if (deltaPercent <= -50) {
        luckLabel = "very unlucky"
      } else if (deltaPercent < 0) {
        luckLabel = "unlucky"
      } else {
        luckLabel = "average"
      }

      const deltaStr =
        delta > 0 ? `${delta}t faster` : delta < 0 ? `${Math.abs(delta)}t slower` : "on target"

      lines.push(`  RNG: [${rolls.join(", ")}] — ${deltaStr} (${luckLabel})`)
    } else {
      lines.push(`  RNG: [${rolls.join(", ")}]`)
    }
  }

  return lines.join("\n")
}
