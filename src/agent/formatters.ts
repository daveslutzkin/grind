import type { WorldState, ActionLog } from "../types.js"
import { getCurrentAreaId, getCurrentLocationId, ExplorationLocationType } from "../types.js"
import { getUnlockedModes, getNextModeUnlock, getCurrentLocation } from "../actionChecks.js"
import { getLocationDisplayName } from "../world.js"
import { BASE_TRAVEL_TIME } from "../exploration.js"
import {
  getPlayerNodeView,
  getNodeTypeName,
  isMaterialVisible,
  getMaxVisibleMaterialLevel,
} from "../visibility.js"

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
        const id = r.id.replace(/-recipe$/, "")
        return `${id} (${inputs}, ${r.guildType})`
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
        const rewards = c.rewards.map((r) => `${r.quantity} ${r.itemId}`).join("+")
        return `${c.id} (${reqs} → ${rewards}, +${c.reputationReward} rep)`
      })
      .join("; ")
    lines.push(`Contracts: ${contractStr}`)
  }

  // ========== LOCATION SECTION ==========
  lines.push("")

  const area = state.exploration.areas.get(currentArea)
  const knownLocationIds = state.exploration.playerState.knownLocationIds

  if (currentArea === "TOWN") {
    // TOWN: show current location name and available locations by type
    const locationName = getLocationDisplayName(currentLocationId, currentArea)
    lines.push(`Location: ${locationName} in TOWN`)

    // Group TOWN locations by type
    if (area && area.locations.length > 0) {
      const guilds = area.locations.filter((loc) => loc.type === ExplorationLocationType.GUILD_HALL)
      const services = area.locations.filter(
        (loc) => loc.type !== ExplorationLocationType.GUILD_HALL
      )

      if (guilds.length > 0) {
        const guildNames = guilds.map((loc) => getLocationDisplayName(loc.id)).join(", ")
        lines.push(`Guilds: ${guildNames}`)
      }
      if (services.length > 0) {
        const serviceNames = services.map((loc) => getLocationDisplayName(loc.id)).join(", ")
        lines.push(`Services: ${serviceNames}`)
      }
    }
  } else {
    // Wilderness: show location name (Clearing when at hub) with status suffix
    const locationName = getLocationDisplayName(currentLocationId, currentArea)
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

    // Determine status suffix for Location line
    let statusSuffix = ""
    const hasAnyDiscovery = knownLocs > 0 || discoveredConnectionsFromArea.length > 0

    if (!hasAnyDiscovery) {
      // Nothing discovered yet (no locations AND no connections from here)
      statusSuffix = " — unexplored"
    } else if (area) {
      // Check if fully explored (all locations + ALL connections discovered)
      const totalLocs = area.locations.length
      const remainingConnections = connectionsFromArea.filter((conn) => {
        const connId = `${conn.fromAreaId}->${conn.toAreaId}`
        return !knownConnectionIds.has(connId)
      })
      const fullyExplored = knownLocs >= totalLocs && remainingConnections.length === 0
      if (fullyExplored) {
        statusSuffix = " — FULLY EXPLORED!"
      }
    }

    lines.push(`Location: ${locationName} in ${currentArea}${statusSuffix}`)

    // Only show Gathering line if we've discovered at least one location
    if (knownLocs > 0) {
      const nodesHere = state.world.nodes?.filter((n) => {
        if (n.areaId !== currentArea || n.depleted) return false
        const match = n.nodeId.match(/-node-(\d+)$/)
        if (!match) return false
        const locationId = `${n.areaId}-loc-${match[1]}`
        return knownLocationIds.includes(locationId)
      })

      if (nodesHere && nodesHere.length > 0) {
        const nodeNames = nodesHere.map((node) => {
          const view = getPlayerNodeView(node, state)
          return getNodeTypeName(view.nodeType)
        })
        lines.push(`Gathering: ${nodeNames.join(", ")}`)
      } else {
        lines.push("Gathering: none visible")
      }
    }
  }

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
    const travelList = Array.from(destinations.entries())
      .map(([dest, time]) => `${dest} (${time}t)`)
      .join(", ")
    lines.push(`Travel: ${travelList}`)
  } else {
    lines.push("Travel: none known")
  }

  // Enemies at current location
  const enemies = state.world.enemies.filter((e) => e.areaId === currentArea)
  if (enemies.length > 0) {
    const enemyStr = enemies.map((e) => `${e.id} (Combat L${e.requiredSkillLevel})`).join(", ")
    lines.push(`Enemies: ${enemyStr}`)
  }

  // Show enrol hint at guild halls (last, as it's the actionable item)
  if (isAtGuildHall && currentLocation?.guildType) {
    const skill = currentLocation.guildType
    const playerSkill = state.player.skills[skill]
    if (!playerSkill || playerSkill.level === 0) {
      lines.push("")
      lines.push(`Can enrol in: ${skill}`)
    }
  }

  return lines.join("\n")
}

/**
 * Format ActionLog as concise text for LLM consumption
 * @param log The action log to format
 * @param state Optional world state for filtering material visibility
 */
export function formatActionLog(log: ActionLog, state?: WorldState): string {
  const lines: string[] = []

  // One-line summary
  const icon = log.success ? "✓" : "✗"
  const params = Object.entries(log.parameters)
    .map(([, v]) => v)
    .join(" ")
  let summary = `${icon} ${log.actionType}`
  if (params) summary += ` ${params}`
  summary += ` (${log.timeConsumed}t)`

  if (!log.success && log.failureType) {
    summary += `: ${log.failureType}`
  } else if (log.stateDeltaSummary) {
    summary += `: ${log.stateDeltaSummary}`
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
          return `${m.remaining}/${m.max} ${m.materialId}${req}`
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
  }

  // XP gained (inline with level ups if any)
  if (log.skillGained) {
    let xpLine = `  +${log.skillGained.amount} ${log.skillGained.skill} XP`
    if (log.levelUps && log.levelUps.length > 0) {
      const lvls = log.levelUps.map((l) => `${l.skill} ${l.fromLevel}→${l.toLevel}`).join(", ")
      xpLine += ` [LEVEL UP: ${lvls}]`
    }
    lines.push(xpLine)
  }

  // Contracts completed
  if (log.contractsCompleted && log.contractsCompleted.length > 0) {
    for (const cc of log.contractsCompleted) {
      const rewards = cc.rewardsGranted.map((r) => `${r.quantity} ${r.itemId}`).join(", ")
      lines.push(`  CONTRACT DONE: ${cc.contractId} → ${rewards}, +${cc.reputationGained} rep`)
    }
  }

  // RNG display - exploration uses luckInfo, others show individual rolls
  const isExplorationAction = log.actionType === "Explore" || log.actionType === "Survey"

  if (log.explorationLog?.luckInfo) {
    // Exploration: show luck summary without revealing individual rolls
    const luck = log.explorationLog.luckInfo
    const delta = luck.luckDelta
    const deltaPercent = luck.expectedTicks > 0 ? (delta / luck.expectedTicks) * 100 : 0

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

    lines.push(`  RNG: ${deltaStr} (${luckLabel})`)
  } else if (isExplorationAction) {
    // Failed exploration (e.g., SESSION_ENDED) - don't show individual rolls
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
