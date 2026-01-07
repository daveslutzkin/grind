import type { WorldState, ActionLog } from "../types.js"
import { getCurrentAreaId } from "../types.js"
import { getUnlockedModes, getNextModeUnlock } from "../actionChecks.js"
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

  // Location + ticks on one line
  lines.push(`Location: ${currentArea} (${state.time.sessionRemainingTicks} ticks left)`)

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

  // Travel - available connections
  const knownConnections = state.exploration.playerState.knownConnectionIds
  const outgoing = knownConnections
    .filter((connId) => connId.startsWith(`${currentArea}->`))
    .map((connId) => {
      const dest = connId.split("->")[1]
      const conn = state.exploration.connections.find(
        (c) => c.fromAreaId === currentArea && c.toAreaId === dest
      )
      return `${dest} (${conn?.travelTimeMultiplier ?? 1}t)`
    })
  if (outgoing.length > 0) {
    lines.push(`Travel: ${outgoing.join(", ")}`)
  } else {
    lines.push("Travel: none known")
  }

  // Resource nodes at current location (discovered only)
  const knownLocationIds = state.exploration.playerState.knownLocationIds
  const nodesHere = state.world.nodes?.filter((n) => {
    if (n.areaId !== currentArea || n.depleted) return false
    const match = n.nodeId.match(/-node-(\d+)$/)
    if (!match) return false
    const locationId = `${n.areaId}-loc-${match[1]}`
    return knownLocationIds.includes(locationId)
  })
  if (nodesHere && nodesHere.length > 0) {
    lines.push("")
    lines.push("Nodes:")
    for (const node of nodesHere) {
      const view = getPlayerNodeView(node, state)

      if (view.visibilityTier === "none" || view.visibleMaterials.length === 0) {
        // No skill or no visible materials - just show node type
        lines.push(`  ${view.nodeId}: ${getNodeTypeName(view.nodeType)}`)
      } else if (view.visibilityTier === "materials") {
        // Has skill but not appraised - show material names only
        const mats = view.visibleMaterials.map((m) => m.materialId).join(", ")
        lines.push(`  ${view.nodeId}: ${mats}`)
      } else {
        // Appraised - show full details with counts
        const mats = view.visibleMaterials
          .map((m) => {
            const req = m.requiredLevel > 0 ? ` [${m.requiresSkill} L${m.requiredLevel}]` : ""
            return `${m.remainingUnits}/${m.maxUnitsInitial} ${m.materialId}${req}`
          })
          .join(", ")
        lines.push(`  ${view.nodeId}: ${mats}`)
      }
    }
  }

  // Enemies at current location
  const enemies = state.world.enemies.filter((e) => e.areaId === currentArea)
  if (enemies.length > 0) {
    const enemyStr = enemies.map((e) => `${e.id} (Combat L${e.requiredSkillLevel})`).join(", ")
    lines.push(`Enemies: ${enemyStr}`)
  }

  // Recipes - compact
  const recipes = state.world.recipes.filter((r) => r.requiredAreaId === currentArea)
  if (recipes.length > 0) {
    const recipeStr = recipes
      .map((r) => {
        const inputs = r.inputs.map((i) => `${i.quantity} ${i.itemId}`).join("+")
        const id = r.id.replace(/-recipe$/, "")
        return `${id} (${inputs})`
      })
      .join(", ")
    lines.push(`Recipes: ${recipeStr}`)
  }

  // Contracts - compact
  const contracts = state.world.contracts.filter(
    (c) => c.guildAreaId === currentArea && !state.player.activeContracts.includes(c.id)
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

  // RNG rolls (compact)
  if (log.rngRolls.length > 0) {
    const rolls = log.rngRolls
      .map((r) => `${r.label} ${Math.round(r.probability * 100)}%:${r.result ? "✓" : "✗"}`)
      .join(", ")
    lines.push(`  RNG: ${rolls}`)
  }

  return lines.join("\n")
}
