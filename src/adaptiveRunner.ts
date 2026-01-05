/**
 * Adaptive Gameplay Runner
 *
 * Runs gameplay sessions that adapt decisions based on state to maximize fun:
 * - Explore diverse locations
 * - Try different gathering modes
 * - Level up skills strategically
 * - Balance risk vs reward
 */

import { WorldState, Action, ActionLog, GatherMode, Node, GatheringSkillID } from "./types.js"
import { createGatheringWorld, LOCATIONS } from "./gatheringWorld.js"
import { executeAction } from "./engine.js"
import { writeFileSync } from "fs"

interface GameTrace {
  seed: string
  runNumber: number
  actions: ActionLog[]
  finalState: {
    tick: number
    miningLevel: number
    miningXP: number
    woodcuttingLevel: number
    woodcuttingXP: number
    inventory: Record<string, number>
    nodesVisited: string[]
    locationsVisited: string[]
  }
  summary: {
    totalActions: number
    successfulActions: number
    totalXPGained: number
    levelUps: number
    uniqueLocations: number
    uniqueNodes: number
    highestTierGathered: number
  }
}

/**
 * Get accessible locations based on skill levels
 */
function getAccessibleLocations(state: WorldState): string[] {
  const miningLevel = state.player.skills.Mining.level
  const woodcuttingLevel = state.player.skills.Woodcutting.level
  const maxLevel = Math.max(miningLevel, woodcuttingLevel)

  const accessible: string[] = ["TOWN"]

  for (const loc of LOCATIONS) {
    if (loc.id === "TOWN") continue

    // NEAR locations: L1+
    if (loc.band === "NEAR" && maxLevel >= 1) {
      accessible.push(loc.id)
    }
    // MID locations: L5+
    if (loc.band === "MID" && maxLevel >= 5) {
      accessible.push(loc.id)
    }
    // FAR locations: L9+
    if (loc.band === "FAR" && maxLevel >= 9) {
      accessible.push(loc.id)
    }
  }

  return accessible
}

/**
 * Get available nodes at current location that aren't depleted
 */
function getAvailableNodes(state: WorldState): Node[] {
  const nodes = state.world.nodes || []
  return nodes.filter((n) => n.locationId === state.player.location && !n.depleted)
}

/**
 * Find the best material to focus on in a node based on skill and tier
 */
function selectFocusMaterial(
  node: Node,
  skillLevel: number
): { materialId: string; tier: number } | null {
  // Find the highest tier material we can gather
  const gatherableMaterials = node.materials.filter(
    (m) => m.remainingUnits > 0 && skillLevel >= m.requiredLevel
  )

  if (gatherableMaterials.length === 0) return null

  // Sort by tier descending to get highest tier first
  gatherableMaterials.sort((a, b) => b.tier - a.tier)
  return {
    materialId: gatherableMaterials[0].materialId,
    tier: gatherableMaterials[0].tier,
  }
}

/**
 * Decide the best gathering mode based on situation
 */
function selectGatherMode(
  state: WorldState,
  node: Node,
  skill: GatheringSkillID
): { mode: GatherMode; focusMaterialId?: string } {
  const skillLevel = state.player.skills[skill].level

  // APPRAISE unlocks at L3 - use it occasionally to scout nodes
  const canAppraise = skillLevel >= 3
  const canCarefulAll = skillLevel >= 4

  // Count remaining materials in the node
  const materialsWithUnits = node.materials.filter((m) => m.remainingUnits > 0)
  const totalUnits = materialsWithUnits.reduce((sum, m) => sum + m.remainingUnits, 0)

  // If node is almost depleted, use CAREFUL_ALL to get everything
  if (canCarefulAll && totalUnits < 30) {
    return { mode: GatherMode.CAREFUL_ALL }
  }

  // Every 5th action on a new node, appraise it for "fun" exploration
  if (canAppraise && Math.random() < 0.15) {
    return { mode: GatherMode.APPRAISE }
  }

  // Otherwise, FOCUS on the best material
  const bestMaterial = selectFocusMaterial(node, skillLevel)
  if (bestMaterial) {
    return {
      mode: GatherMode.FOCUS,
      focusMaterialId: bestMaterial.materialId,
    }
  }

  // Fallback to CAREFUL_ALL if we can
  if (canCarefulAll) {
    return { mode: GatherMode.CAREFUL_ALL }
  }

  // Emergency fallback - try to focus on any material
  const anyMaterial = node.materials.find((m) => m.remainingUnits > 0)
  return {
    mode: GatherMode.FOCUS,
    focusMaterialId: anyMaterial?.materialId || node.materials[0].materialId,
  }
}

/**
 * Choose the best location to travel to for fun gameplay
 */
function chooseTravelDestination(state: WorldState, visitedLocations: Set<string>): string | null {
  const accessible = getAccessibleLocations(state)
  const current = state.player.location

  // Prioritize unvisited locations for exploration
  const unvisited = accessible.filter(
    (loc) => !visitedLocations.has(loc) && loc !== current && loc !== "TOWN"
  )
  if (unvisited.length > 0) {
    return unvisited[0]
  }

  // Otherwise, find location with most undepleted nodes
  let bestLocation = null
  let bestNodeCount = 0

  for (const locId of accessible) {
    if (locId === current || locId === "TOWN") continue

    const nodes = (state.world.nodes || []).filter((n) => n.locationId === locId && !n.depleted)
    if (nodes.length > bestNodeCount) {
      bestNodeCount = nodes.length
      bestLocation = locId
    }
  }

  return bestLocation
}

/**
 * Determine which skill to enroll in based on randomness for variety
 */
function chooseSkillToEnroll(state: WorldState): GatheringSkillID | null {
  const miningLevel = state.player.skills.Mining.level
  const woodcuttingLevel = state.player.skills.Woodcutting.level

  // If neither is enrolled, pick randomly for variety
  if (miningLevel === 0 && woodcuttingLevel === 0) {
    return Math.random() < 0.5 ? "Mining" : "Woodcutting"
  }

  // If only one is enrolled, enroll the other for variety
  if (miningLevel === 0) return "Mining"
  if (woodcuttingLevel === 0) return "Woodcutting"

  return null
}

/**
 * Get the skill type for a location
 */
function getLocationSkill(locationId: string): GatheringSkillID {
  const miningLocations = ["OUTSKIRTS_MINE", "OLD_QUARRY", "ABANDONED_SHAFT"]
  return miningLocations.includes(locationId) ? "Mining" : "Woodcutting"
}

/**
 * Run a single adaptive gameplay session
 */
function runAdaptiveSession(seed: string, runNumber: number): GameTrace {
  const state = createGatheringWorld(seed)
  const actions: ActionLog[] = []
  const visitedLocations = new Set<string>()
  const visitedNodes = new Set<string>()
  let totalXPGained = 0
  let levelUps = 0
  let highestTierGathered = 0

  // Main gameplay loop
  while (state.time.sessionRemainingTicks > 0) {
    let action: Action | null = null

    // Check if we need to enroll in a guild
    const skillToEnroll = chooseSkillToEnroll(state)
    if (skillToEnroll && state.player.location === "TOWN") {
      action = { type: "Enrol", skill: skillToEnroll }
    }

    // If in town and enrolled, travel to a gathering location
    if (!action && state.player.location === "TOWN") {
      const destination = chooseTravelDestination(state, visitedLocations)
      if (destination) {
        action = { type: "Move", destination }
      }
    }

    // If at a gathering location, try to gather
    if (!action && state.player.location !== "TOWN") {
      const nodes = getAvailableNodes(state)
      visitedLocations.add(state.player.location)

      if (nodes.length > 0) {
        // Pick a node - prioritize unvisited nodes
        const unvisitedNodes = nodes.filter((n) => !visitedNodes.has(n.nodeId))
        const node = unvisitedNodes.length > 0 ? unvisitedNodes[0] : nodes[0]

        visitedNodes.add(node.nodeId)

        // Determine the skill for this location
        const skill = getLocationSkill(state.player.location)
        const skillLevel = state.player.skills[skill].level

        // Choose gather mode
        const { mode, focusMaterialId } = selectGatherMode(state, node, skill)

        // Track highest tier we're attempting
        if (focusMaterialId) {
          const material = node.materials.find((m) => m.materialId === focusMaterialId)
          if (material && material.tier > highestTierGathered) {
            highestTierGathered = material.tier
          }
        }

        action = {
          type: "Gather",
          nodeId: node.nodeId,
          mode,
          focusMaterialId,
        }

        // Safety check - if skill level is 0, we can't gather
        if (skillLevel === 0) {
          // Travel back to town to enroll
          action = { type: "Move", destination: "TOWN" }
        }
      } else {
        // No nodes available, travel somewhere else
        const destination = chooseTravelDestination(state, visitedLocations)
        if (destination) {
          action = { type: "Move", destination }
        } else {
          // All locations exhausted, return to town
          action = { type: "Move", destination: "TOWN" }
        }
      }
    }

    // Fallback: wait in town if nothing to do
    if (!action) {
      // No action possible, break the loop
      break
    }

    // Execute action
    const log = executeAction(state, action)
    actions.push(log)

    // Track stats
    if (log.skillGained) {
      totalXPGained += log.skillGained.amount
    }
    if (log.levelUps) {
      levelUps += log.levelUps.length
    }

    // Safety: if session ended, stop
    if (log.failureType === "SESSION_ENDED") {
      break
    }
  }

  // Build final state summary
  const inventoryMap: Record<string, number> = {}
  for (const item of state.player.inventory) {
    inventoryMap[item.itemId] = item.quantity
  }

  const trace: GameTrace = {
    seed,
    runNumber,
    actions,
    finalState: {
      tick: state.time.currentTick,
      miningLevel: state.player.skills.Mining.level,
      miningXP: state.player.skills.Mining.xp,
      woodcuttingLevel: state.player.skills.Woodcutting.level,
      woodcuttingXP: state.player.skills.Woodcutting.xp,
      inventory: inventoryMap,
      nodesVisited: Array.from(visitedNodes),
      locationsVisited: Array.from(visitedLocations),
    },
    summary: {
      totalActions: actions.length,
      successfulActions: actions.filter((a) => a.success).length,
      totalXPGained,
      levelUps,
      uniqueLocations: visitedLocations.size,
      uniqueNodes: visitedNodes.size,
      highestTierGathered,
    },
  }

  return trace
}

/**
 * Run multiple adaptive sessions and save traces
 */
function runAdaptiveSessions(count: number): void {
  console.log(`\n🎮 Running ${count} Adaptive Gameplay Sessions\n`)
  console.log("=".repeat(60))

  const traces: GameTrace[] = []

  for (let i = 1; i <= count; i++) {
    const seed = `adaptive-run-${i}-${Date.now()}`
    console.log(`\n📍 Run ${i}/${count} (seed: ${seed})`)

    const trace = runAdaptiveSession(seed, i)
    traces.push(trace)

    // Print summary
    console.log(`   ✅ Actions: ${trace.summary.totalActions}`)
    console.log(`   📊 XP Gained: ${trace.summary.totalXPGained}`)
    console.log(`   ⬆️  Level Ups: ${trace.summary.levelUps}`)
    console.log(`   🗺️  Locations: ${trace.summary.uniqueLocations}`)
    console.log(`   ⛏️  Nodes: ${trace.summary.uniqueNodes}`)
    console.log(`   💎 Highest Tier: ${trace.summary.highestTierGathered}`)
    console.log(`   ⏱️  Final Tick: ${trace.finalState.tick}/200`)
    console.log(
      `   📦 Inventory: ${
        Object.entries(trace.finalState.inventory)
          .map(([k, v]) => `${k}:${v}`)
          .join(", ") || "(empty)"
      }`
    )
  }

  // Save all traces
  const outputPath = `./traces/adaptive-runs-${Date.now()}.json`
  writeFileSync(outputPath, JSON.stringify(traces, null, 2))
  console.log(`\n💾 Traces saved to: ${outputPath}`)

  // Overall summary
  console.log("\n" + "=".repeat(60))
  console.log("📈 Overall Summary:")
  const avgXP = traces.reduce((sum, t) => sum + t.summary.totalXPGained, 0) / count
  const avgLevelUps = traces.reduce((sum, t) => sum + t.summary.levelUps, 0) / count
  const avgActions = traces.reduce((sum, t) => sum + t.summary.totalActions, 0) / count
  console.log(`   Average XP: ${avgXP.toFixed(1)}`)
  console.log(`   Average Level Ups: ${avgLevelUps.toFixed(1)}`)
  console.log(`   Average Actions: ${avgActions.toFixed(1)}`)
  console.log("=".repeat(60) + "\n")
}

// Run 5 adaptive sessions
runAdaptiveSessions(5)
