/**
 * Available Actions Module
 *
 * Enumerates available actions for any world state with cost preview.
 * Uses the same validation logic as the engine (via checkAction)
 * to ensure consistency.
 */

import type { WorldState, GatherMode, SkillID, Action, GatherAction, CraftAction } from "./types.js"
import {
  getCurrentAreaId,
  getCurrentLocationId,
  isInTown,
  ExplorationLocationType,
} from "./types.js"
import {
  checkAction,
  getUnlockedModes,
  getCurrentLocation,
  getWeaponParameters,
} from "./actionChecks.js"
import {
  getReachableAreas,
  getRollInterval,
  calculateExpectedTicks,
  prepareSurveyData,
  buildDiscoverables,
  isConnectionKnown,
} from "./exploration.js"
import { getSkillForGuildLocation } from "./world.js"

/**
 * Represents an available action with cost information
 */
export interface AvailableAction {
  /** Human-readable display name (e.g., "mine focus <resource>") */
  displayName: string
  /** Time cost in ticks */
  timeCost: number
  /** True if time cost is variable (RNG-dependent) */
  isVariable: boolean
  /** Success probability (1.0 for guaranteed, <1.0 for risky actions like combat) */
  successProbability: number
}

/**
 * Get all available actions for the current world state.
 * Each action is validated using checkAction to ensure it's actually executable.
 */
export function getAvailableActions(state: WorldState): AvailableAction[] {
  const actions: AvailableAction[] = []
  const currentAreaId = getCurrentAreaId(state)
  const currentLocationId = getCurrentLocationId(state)
  const currentLocation = getCurrentLocation(state)
  const isAtHub = currentLocationId === null
  const inTown = isInTown(state)

  // ========== LOCATION-SPECIFIC ACTIONS ==========

  // Leave action - available when at any non-hub location
  if (currentLocationId !== null) {
    const leaveCheck = checkAction(state, { type: "Leave" })
    if (leaveCheck.valid) {
      actions.push({
        displayName: "leave",
        timeCost: leaveCheck.timeCost,
        isVariable: false,
        successProbability: 1,
      })
    }
  }

  // Guild hall actions
  if (currentLocation?.type === ExplorationLocationType.GUILD_HALL) {
    const skill = getSkillForGuildLocation(currentLocationId)
    if (skill) {
      // Check if enrol is available
      const enrolCheck = checkAction(state, { type: "Enrol" })
      if (enrolCheck.valid) {
        actions.push({
          displayName: "enrol",
          timeCost: enrolCheck.timeCost,
          isVariable: false,
          successProbability: 1,
        })
      }

      // Crafting recipes at this guild
      addCraftingActions(state, actions, currentLocation.guildType as SkillID)

      // Accept contracts available at this location
      addContractActions(state, actions, currentLocationId!)
    }
  }

  // Warehouse actions (store)
  if (currentLocation?.type === ExplorationLocationType.WAREHOUSE) {
    addStoreActions(state, actions)
  }

  // Gathering node actions
  if (currentLocation?.type === ExplorationLocationType.GATHERING_NODE) {
    addGatheringActions(state, actions, currentLocationId!, currentAreaId)
  }

  // Mob camp actions (fight)
  if (currentLocation?.type === ExplorationLocationType.MOB_CAMP) {
    addFightActions(state, actions)
  }

  // ========== HUB ACTIONS ==========

  if (isAtHub) {
    // Travel to location actions (go to discovered locations in current area)
    addTravelToLocationActions(state, actions)

    // Survey and Explore actions (only in wilderness with Exploration skill)
    if (!inTown && state.player.skills.Exploration.level > 0) {
      addExplorationActions(state, actions)
    }

    // Far travel actions (travel to other known areas)
    addFarTravelActions(state, actions)
  }

  // ========== INVENTORY ACTIONS ==========

  // Drop actions (available anywhere with inventory)
  addDropActions(state, actions)

  // Turn in combat token (at Combat Guild with tokens)
  addTurnInCombatTokenAction(state, actions)

  return actions
}

/**
 * Add craft action if player can craft any recipe at this guild.
 * Shows placeholder since time varies by recipe.
 */
function addCraftingActions(
  state: WorldState,
  actions: AvailableAction[],
  guildType: SkillID
): void {
  const currentLocation = getCurrentLocation(state)
  const recipes = state.world.recipes.filter((r) => r.guildType === guildType)

  // Find first craftable recipe
  for (const recipe of recipes) {
    // Check guild level requirement
    if (
      currentLocation?.guildLevel !== undefined &&
      currentLocation.guildLevel < recipe.requiredSkillLevel
    ) {
      continue
    }

    const craftAction: CraftAction = { type: "Craft", recipeId: recipe.id }
    const craftCheck = checkAction(state, craftAction)

    if (craftCheck.valid) {
      // Calculate average craft time across all craftable recipes
      const craftableRecipes = recipes.filter((r) => {
        if (
          currentLocation?.guildLevel !== undefined &&
          currentLocation.guildLevel < r.requiredSkillLevel
        ) {
          return false
        }
        return checkAction(state, { type: "Craft", recipeId: r.id }).valid
      })
      const avgCraftTime = Math.round(
        craftableRecipes.reduce((sum, r) => sum + r.craftTime, 0) / craftableRecipes.length
      )

      actions.push({
        displayName: "craft <recipe>",
        timeCost: avgCraftTime,
        isVariable: true, // Time varies by recipe
        successProbability: 1,
      })
      return // Only add one craft action
    }
  }
}

/**
 * Add accept contract action if any contracts available at this location.
 * Shows placeholder since there could be multiple contracts.
 */
function addContractActions(
  state: WorldState,
  actions: AvailableAction[],
  locationId: string
): void {
  const contracts = state.world.contracts.filter(
    (c) => c.acceptLocationId === locationId && !state.player.activeContracts.includes(c.id)
  )

  // Check if any contract can be accepted
  for (const contract of contracts) {
    const acceptAction: Action = { type: "AcceptContract", contractId: contract.id }
    const acceptCheck = checkAction(state, acceptAction)

    if (acceptCheck.valid) {
      actions.push({
        displayName: "accept <contract>",
        timeCost: acceptCheck.timeCost,
        isVariable: false,
        successProbability: 1,
      })
      return // Only add one accept action
    }
  }
}

/**
 * Add store action if player has inventory items.
 * Shows placeholder since there could be many items.
 */
function addStoreActions(state: WorldState, actions: AvailableAction[]): void {
  if (state.player.inventory.length === 0) return

  // Check if at least one item can be stored
  const firstItem = state.player.inventory[0]
  const storeCheck = checkAction(state, {
    type: "Store",
    itemId: firstItem.itemId,
    quantity: 1,
  })

  if (storeCheck.valid) {
    actions.push({
      displayName: "store <quantity> <item>",
      timeCost: storeCheck.timeCost,
      isVariable: false,
      successProbability: 1,
    })
  }
}

/**
 * Add gathering actions based on current node and unlocked modes
 */
function addGatheringActions(
  state: WorldState,
  actions: AvailableAction[],
  locationId: string,
  areaId: string
): void {
  // Extract node index from location ID (e.g., "area-d1-i0-loc-0" -> "0")
  const match = locationId.match(/-loc-(\d+)$/)
  if (!match) return

  const nodeIndex = match[1]
  const nodeId = `${areaId}-node-${nodeIndex}`
  const node = state.world.nodes?.find((n) => n.nodeId === nodeId)
  if (!node || node.depleted) return

  // Determine skill type and command name
  const skill = node.materials[0]?.requiresSkill ?? "Mining"
  const skillLevel = state.player.skills[skill]?.level ?? 0
  const commandName = skill === "Mining" ? "mine" : "chop"

  // Get unlocked modes for this skill level
  const unlockedModes = getUnlockedModes(skillLevel)

  for (const mode of unlockedModes) {
    const modeLower = mode.toLowerCase()

    if (mode === "FOCUS") {
      // FOCUS mode requires a material ID - check if any material is gatherable
      const gatherableMat = node.materials.find(
        (mat) => mat.requiredLevel <= skillLevel && mat.remainingUnits > 0
      )
      if (gatherableMat) {
        const gatherAction: GatherAction = {
          type: "Gather",
          nodeId,
          mode: mode as GatherMode,
          focusMaterialId: gatherableMat.materialId,
        }
        const gatherCheck = checkAction(state, gatherAction)

        if (gatherCheck.valid) {
          actions.push({
            displayName: `${commandName} focus <resource>`,
            timeCost: gatherCheck.timeCost,
            isVariable: false,
            successProbability: 1,
          })
        }
      }
    } else {
      // APPRAISE and CAREFUL_ALL don't need material ID
      const gatherAction: GatherAction = {
        type: "Gather",
        nodeId,
        mode: mode as GatherMode,
      }
      const gatherCheck = checkAction(state, gatherAction)

      if (gatherCheck.valid) {
        actions.push({
          displayName: `${commandName} ${modeLower}`,
          timeCost: gatherCheck.timeCost,
          isVariable: false,
          successProbability: 1,
        })
      }
    }
  }
}

/**
 * Add fight action if at a mob camp with weapon equipped
 */
function addFightActions(state: WorldState, actions: AvailableAction[]): void {
  const fightCheck = checkAction(state, { type: "Fight" })

  if (fightCheck.valid) {
    const weaponParams = getWeaponParameters(state.player.equippedWeapon)
    actions.push({
      displayName: "fight",
      timeCost: weaponParams?.timeCost ?? fightCheck.timeCost,
      isVariable: false,
      successProbability: weaponParams?.successProbability ?? fightCheck.successProbability,
    })
  }
}

/**
 * Add travel to location action if any discovered locations in current area
 * OR if there are known connected adjacent areas.
 * Shows placeholder since there could be many destinations.
 */
function addTravelToLocationActions(state: WorldState, actions: AvailableAction[]): void {
  const currentAreaId = getCurrentAreaId(state)
  const area = state.exploration.areas.get(currentAreaId)
  if (!area) return

  const knownLocationIds = state.exploration.playerState.knownLocationIds
  const inTown = isInTown(state)

  // Check if at least one location is reachable
  const hasValidLocation = area.locations.some((location) => {
    if (!knownLocationIds.includes(location.id)) return false
    const check = checkAction(state, { type: "TravelToLocation", locationId: location.id })
    return check.valid
  })

  // Check if there are known connected adjacent areas (for ExplorationTravel)
  const knownConnectionIds = new Set(state.exploration.playerState.knownConnectionIds)
  const hasAdjacentArea = state.exploration.connections.some((conn) => {
    // Must connect to current area
    if (conn.fromAreaId !== currentAreaId && conn.toAreaId !== currentAreaId) {
      return false
    }

    // Must be a known connection (checks both directions)
    return isConnectionKnown(knownConnectionIds, conn.fromAreaId, conn.toAreaId)
  })

  if (hasValidLocation || hasAdjacentArea) {
    actions.push({
      displayName: hasValidLocation ? "go <location>" : "go <area>",
      timeCost: inTown ? 0 : 1,
      isVariable: hasAdjacentArea, // Variable if can travel to areas (different times)
      successProbability: 1,
    })
  }
}

/**
 * Add survey and explore actions with variable time costs
 */
function addExplorationActions(state: WorldState, actions: AvailableAction[]): void {
  const currentAreaId = getCurrentAreaId(state)
  const currentArea = state.exploration.areas.get(currentAreaId)
  if (!currentArea) return

  const level = state.player.skills.Exploration.level
  const rollInterval = getRollInterval(level)

  // Survey action - discover new areas
  const surveyData = prepareSurveyData(state, currentArea)
  if (surveyData.hasUndiscoveredAreas && surveyData.allConnections.length > 0) {
    const surveyCheck = checkAction(state, { type: "Survey" })
    if (surveyCheck.valid) {
      // Expected time = rollInterval / successChance
      const expectedTicks = Math.round(
        calculateExpectedTicks(surveyData.successChance, rollInterval)
      )
      actions.push({
        displayName: "survey",
        timeCost: expectedTicks,
        isVariable: true,
        successProbability: 1,
      })
    }
  }

  // Explore action - discover locations and connections within current area
  const { discoverables } = buildDiscoverables(state, currentArea)
  if (discoverables.length > 0) {
    const exploreCheck = checkAction(state, { type: "Explore" })
    if (exploreCheck.valid) {
      // Max threshold determines expected time to find anything
      const maxThreshold = Math.max(...discoverables.map((d) => d.threshold))
      const expectedTicks = Math.round(calculateExpectedTicks(maxThreshold, rollInterval))
      actions.push({
        displayName: "explore",
        timeCost: expectedTicks,
        isVariable: true,
        successProbability: 1,
      })
    }
  }
}

/**
 * Add far travel action if any reachable areas exist.
 * Shows placeholder since there could be many destinations.
 */
function addFarTravelActions(state: WorldState, actions: AvailableAction[]): void {
  const reachableAreas = getReachableAreas(state)
  if (reachableAreas.length === 0) return

  // Check if at least one destination is valid
  const hasValidDestination = reachableAreas.some(({ areaId }) => {
    const check = checkAction(state, { type: "FarTravel", destinationAreaId: areaId })
    return check.valid
  })

  if (hasValidDestination) {
    // Calculate average travel time across all destinations
    const avgTravelTime = Math.round(
      reachableAreas.reduce((sum, { travelTime }) => sum + travelTime, 0) / reachableAreas.length
    )
    actions.push({
      displayName: "fartravel <area>",
      timeCost: avgTravelTime,
      isVariable: true, // Time varies by destination
      successProbability: 1,
    })
  }
}

/**
 * Add drop action if player has inventory items.
 * Shows placeholder since there could be many items.
 */
function addDropActions(state: WorldState, actions: AvailableAction[]): void {
  if (state.player.inventory.length === 0) return

  // Check if at least one item can be dropped
  const firstItem = state.player.inventory[0]
  const dropCheck = checkAction(state, {
    type: "Drop",
    itemId: firstItem.itemId,
    quantity: 1,
  })

  if (dropCheck.valid) {
    actions.push({
      displayName: "drop <quantity> <item>",
      timeCost: dropCheck.timeCost,
      isVariable: false,
      successProbability: 1,
    })
  }
}

/**
 * Add turn in combat token action if at Combat Guild with tokens
 */
function addTurnInCombatTokenAction(state: WorldState, actions: AvailableAction[]): void {
  const turnInCheck = checkAction(state, { type: "TurnInCombatToken" })

  if (turnInCheck.valid) {
    actions.push({
      displayName: "turn_in_combat_token",
      timeCost: turnInCheck.timeCost,
      isVariable: false,
      successProbability: 1,
    })
  }
}
