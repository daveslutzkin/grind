import type { WorldState, ActionLog } from "../types.js"
import { getUnlockedModes, getNextModeUnlock } from "../actionChecks.js"

/**
 * Format WorldState as readable text for LLM consumption
 */
export function formatWorldState(state: WorldState): string {
  const lines: string[] = []

  // Current status
  lines.push("=== CURRENT STATE ===")
  lines.push(`Location: ${state.player.location}`)
  lines.push(
    `Ticks remaining: ${state.time.sessionRemainingTicks} (used: ${state.time.currentTick})`
  )

  // Inventory
  lines.push("")
  lines.push("Inventory:")
  if (state.player.inventory.length === 0) {
    lines.push("  (empty)")
  } else {
    for (const item of state.player.inventory) {
      lines.push(`  ${item.itemId}: ${item.quantity}`)
    }
  }
  lines.push(`  Capacity: ${state.player.inventory.length}/${state.player.inventoryCapacity} slots`)

  // Storage (if any)
  if (state.player.storage.length > 0) {
    lines.push("")
    lines.push("Storage (at TOWN):")
    for (const item of state.player.storage) {
      lines.push(`  ${item.itemId}: ${item.quantity}`)
    }
  }

  // Skills
  lines.push("")
  lines.push("Skills:")
  for (const [skillId, skillState] of Object.entries(state.player.skills)) {
    if (skillState.level > 0) {
      lines.push(`  ${skillId}: Level ${skillState.level} (${skillState.xp} XP toward next)`)
      // Show unlocked gather modes for gathering skills
      if (skillId === "Mining" || skillId === "Woodcutting") {
        const modes = getUnlockedModes(skillState.level)
        const nextUnlock = getNextModeUnlock(skillState.level)
        const modesStr = modes.join(", ")
        const nextStr = nextUnlock ? ` (next: ${nextUnlock.mode} at L${nextUnlock.level})` : ""
        lines.push(`    Gather modes: ${modesStr}${nextStr}`)
      }
    } else {
      lines.push(`  ${skillId}: Not enrolled`)
    }
  }

  // Active contracts
  if (state.player.activeContracts.length > 0) {
    lines.push("")
    lines.push("Active contracts:")
    for (const contractId of state.player.activeContracts) {
      const contract = state.world.contracts.find((c) => c.id === contractId)
      if (contract) {
        lines.push(`  ${contractId}:`)
        lines.push(
          `    Requires: ${contract.requirements.map((r) => `${r.quantity}x ${r.itemId}`).join(", ")}`
        )
        lines.push(
          `    Rewards: ${contract.rewards.map((r) => `${r.quantity}x ${r.itemId}`).join(", ")}`
        )
      }
    }
  }

  // Available locations with travel costs
  lines.push("")
  lines.push("Available locations:")
  const travelCosts = Object.entries(state.world.travelCosts)
    .filter(([key]) => key.startsWith(`${state.player.location}->`))
    .map(([key, cost]) => {
      const dest = key.split("->")[1]
      return { dest, cost }
    })

  if (travelCosts.length === 0) {
    // Check reverse direction
    const reverseCosts = Object.entries(state.world.travelCosts)
      .filter(([key]) => key.endsWith(`->${state.player.location}`))
      .map(([key, cost]) => {
        const dest = key.split("->")[0]
        return { dest, cost }
      })
    for (const { dest, cost } of reverseCosts) {
      lines.push(`  ${dest} (${cost} ticks)`)
    }
  } else {
    for (const { dest, cost } of travelCosts) {
      lines.push(`  ${dest} (${cost} ticks)`)
    }
  }

  // All locations for reference
  lines.push("")
  lines.push(`All world locations: ${state.world.locations.join(", ")}`)

  // Resource nodes at current location
  const nodesHere = state.world.nodes?.filter(
    (n) => n.locationId === state.player.location && !n.depleted
  )
  if (nodesHere && nodesHere.length > 0) {
    lines.push("")
    lines.push("Resource nodes here:")
    for (const node of nodesHere) {
      lines.push(`  ${node.nodeId} (${node.nodeType}):`)
      for (const mat of node.materials) {
        const levelReq =
          mat.requiredLevel > 0 ? ` [requires ${mat.requiresSkill} L${mat.requiredLevel}]` : ""
        lines.push(
          `    - ${mat.materialId}: ${mat.remainingUnits}/${mat.maxUnitsInitial} units${levelReq}`
        )
      }
    }
  } else if (state.player.location !== "TOWN") {
    lines.push("")
    lines.push("Resource nodes here: (none available)")
  }

  // Legacy resource nodes (if any)
  const legacyNodesHere = state.world.resourceNodes.filter(
    (n) => n.location === state.player.location
  )
  if (legacyNodesHere.length > 0) {
    lines.push("")
    lines.push("Resource nodes (legacy):")
    for (const node of legacyNodesHere) {
      lines.push(
        `  ${node.id}: ${node.itemId} (${node.gatherTime} ticks, ${Math.round(node.successProbability * 100)}% success)`
      )
    }
  }

  // Enemies at current location
  const enemiesHere = state.world.enemies.filter((e) => e.location === state.player.location)
  if (enemiesHere.length > 0) {
    lines.push("")
    lines.push("Enemies here:")
    for (const enemy of enemiesHere) {
      lines.push(`  ${enemy.id}: requires Combat L${enemy.requiredSkillLevel}`)
    }
  }

  // Available recipes (if at crafting location)
  const recipesHere = state.world.recipes.filter(
    (r) => r.requiredLocation === state.player.location
  )
  if (recipesHere.length > 0) {
    lines.push("")
    lines.push("Recipes available here:")
    for (const recipe of recipesHere) {
      const inputs = recipe.inputs.map((i) => `${i.quantity}x ${i.itemId}`).join(" + ")
      lines.push(`  ${recipe.id}: ${inputs} -> ${recipe.output.quantity}x ${recipe.output.itemId}`)
    }
  }

  // Available contracts (if at guild location)
  const contractsHere = state.world.contracts.filter(
    (c) => c.guildLocation === state.player.location && !state.player.activeContracts.includes(c.id)
  )
  if (contractsHere.length > 0) {
    lines.push("")
    lines.push("Contracts available here:")
    for (const contract of contractsHere) {
      lines.push(`  ${contract.id}:`)
      lines.push(
        `    Requires: ${contract.requirements.map((r) => `${r.quantity}x ${r.itemId}`).join(", ")}`
      )
      lines.push(
        `    Rewards: ${contract.rewards.map((r) => `${r.quantity}x ${r.itemId}`).join(", ")}, +${contract.reputationReward} rep`
      )
    }
  }

  return lines.join("\n")
}

/**
 * Format ActionLog as readable text for LLM consumption
 */
export function formatActionLog(log: ActionLog): string {
  const lines: string[] = []

  // Header with success/failure
  const status = log.success ? "SUCCESS" : "FAILED"
  lines.push(`=== ACTION RESULT: ${status} ===`)

  // Action type and parameters
  lines.push(`Action: ${log.actionType}`)
  const params = Object.entries(log.parameters)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ")
  if (params) {
    lines.push(`Parameters: ${params}`)
  }

  // Time consumed
  lines.push(`Time used: ${log.timeConsumed} ticks (at tick ${log.tickBefore})`)

  // Failure reason
  if (!log.success && log.failureType) {
    lines.push(`Failure reason: ${log.failureType}`)
  }

  // State delta
  if (log.stateDeltaSummary) {
    lines.push(`Changes: ${log.stateDeltaSummary}`)
  }

  // Appraisal results (from APPRAISE mode)
  if (log.extraction?.appraisal) {
    const appraisal = log.extraction.appraisal
    lines.push("")
    lines.push(`Node appraisal - ${appraisal.nodeId} (${appraisal.nodeType}):`)
    for (const mat of appraisal.materials) {
      const pct = Math.round((mat.remaining / mat.max) * 100)
      const levelReq =
        mat.requiredLevel > 0 ? ` [requires ${mat.requiresSkill} L${mat.requiredLevel}]` : ""
      lines.push(
        `  ${mat.materialId}: ${mat.remaining}/${mat.max} units (${pct}%) tier ${mat.tier}${levelReq}`
      )
    }
  }

  // Items gained (from extraction)
  if (log.extraction && log.extraction.extracted.length > 0) {
    lines.push("")
    lines.push("Items gained:")
    for (const item of log.extraction.extracted) {
      lines.push(`  +${item.quantity}x ${item.itemId}`)
    }
    if (log.extraction.focusWaste > 0) {
      lines.push(`  (${log.extraction.focusWaste} units wasted from inefficiency)`)
    }
    if (Object.keys(log.extraction.collateralDamage).length > 0) {
      lines.push("  Collateral damage to other materials:")
      for (const [matId, damage] of Object.entries(log.extraction.collateralDamage)) {
        lines.push(`    ${matId}: -${damage} units`)
      }
    }
  }

  // XP gained
  if (log.skillGained) {
    lines.push("")
    lines.push(`XP gained: +${log.skillGained.amount} ${log.skillGained.skill}`)
  }

  // Level ups
  if (log.levelUps && log.levelUps.length > 0) {
    lines.push("")
    lines.push("LEVEL UP!")
    for (const levelUp of log.levelUps) {
      lines.push(`  ${levelUp.skill}: ${levelUp.fromLevel} -> ${levelUp.toLevel}`)
    }
  }

  // Contracts completed
  if (log.contractsCompleted && log.contractsCompleted.length > 0) {
    lines.push("")
    lines.push("CONTRACT COMPLETED!")
    for (const cc of log.contractsCompleted) {
      lines.push(`  ${cc.contractId}`)
      lines.push(
        `    Rewards: ${cc.rewardsGranted.map((r) => `${r.quantity}x ${r.itemId}`).join(", ")}`
      )
      lines.push(`    Reputation: +${cc.reputationGained}`)
    }
  }

  // RNG rolls (for learning about probabilities)
  if (log.rngRolls.length > 0) {
    lines.push("")
    lines.push("RNG:")
    for (const roll of log.rngRolls) {
      const outcome = roll.result ? "success" : "fail"
      lines.push(`  ${roll.label}: ${Math.round(roll.probability * 100)}% chance -> ${outcome}`)
    }
  }

  return lines.join("\n")
}
