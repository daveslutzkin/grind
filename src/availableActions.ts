/**
 * Available Actions Module
 *
 * Enumerates available actions for any world state with cost preview.
 * Uses the same validation logic as the engine (via checkAction)
 * to ensure consistency.
 */

import type {
  WorldState,
  GatherMode,
  SkillID,
  Action,
  GatherAction,
  CraftAction,
  StoreAction,
  DropAction,
  TravelToLocationAction,
} from "./types.js"
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
  getAreaDisplayName,
} from "./exploration.js"
import { getSkillForGuildLocation, getLocationDisplayName } from "./world.js"

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
 * Add crafting actions if player has ingredients and skill
 */
function addCraftingActions(
  state: WorldState,
  actions: AvailableAction[],
  guildType: SkillID
): void {
  const currentLocation = getCurrentLocation(state)
  const recipes = state.world.recipes.filter((r) => r.guildType === guildType)

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
      actions.push({
        displayName: `craft ${recipe.id}`,
        timeCost: craftCheck.timeCost,
        isVariable: false,
        successProbability: 1,
      })
    }
  }
}

/**
 * Add contract acceptance actions
 */
function addContractActions(
  state: WorldState,
  actions: AvailableAction[],
  locationId: string
): void {
  const contracts = state.world.contracts.filter(
    (c) => c.acceptLocationId === locationId && !state.player.activeContracts.includes(c.id)
  )

  for (const contract of contracts) {
    const acceptAction: Action = { type: "AcceptContract", contractId: contract.id }
    const acceptCheck = checkAction(state, acceptAction)

    if (acceptCheck.valid) {
      actions.push({
        displayName: `accept ${contract.id}`,
        timeCost: acceptCheck.timeCost,
        isVariable: false,
        successProbability: 1,
      })
    }
  }
}

/**
 * Add store actions for items in inventory
 */
function addStoreActions(state: WorldState, actions: AvailableAction[]): void {
  for (const item of state.player.inventory) {
    const storeAction: StoreAction = {
      type: "Store",
      itemId: item.itemId,
      quantity: item.quantity,
    }
    const storeCheck = checkAction(state, storeAction)

    if (storeCheck.valid) {
      actions.push({
        displayName: `store <quantity> ${item.itemId}`,
        timeCost: storeCheck.timeCost,
        isVariable: false,
        successProbability: 1,
      })
    }
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
      // FOCUS mode requires a material ID
      // List each gatherable material as a separate action
      for (const mat of node.materials) {
        if (mat.requiredLevel <= skillLevel && mat.remainingUnits > 0) {
          const gatherAction: GatherAction = {
            type: "Gather",
            nodeId,
            mode: mode as GatherMode,
            focusMaterialId: mat.materialId,
          }
          const gatherCheck = checkAction(state, gatherAction)

          if (gatherCheck.valid) {
            actions.push({
              displayName: `${commandName} focus ${mat.materialId.toLowerCase()}`,
              timeCost: gatherCheck.timeCost,
              isVariable: false,
              successProbability: 1,
            })
          }
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
 * Add travel to location actions for discovered locations in current area
 */
function addTravelToLocationActions(state: WorldState, actions: AvailableAction[]): void {
  const currentAreaId = getCurrentAreaId(state)
  const area = state.exploration.areas.get(currentAreaId)
  if (!area) return

  const knownLocationIds = state.exploration.playerState.knownLocationIds

  for (const location of area.locations) {
    if (!knownLocationIds.includes(location.id)) continue

    const travelAction: TravelToLocationAction = {
      type: "TravelToLocation",
      locationId: location.id,
    }
    const travelCheck = checkAction(state, travelAction)

    if (travelCheck.valid) {
      const locationName = getLocationDisplayName(location.id, currentAreaId, state)
      actions.push({
        displayName: `go ${locationName}`,
        timeCost: travelCheck.timeCost,
        isVariable: false,
        successProbability: 1,
      })
    }
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
 * Add far travel actions to known reachable areas
 */
function addFarTravelActions(state: WorldState, actions: AvailableAction[]): void {
  const reachableAreas = getReachableAreas(state)

  for (const { areaId, travelTime } of reachableAreas) {
    const farTravelCheck = checkAction(state, {
      type: "FarTravel",
      destinationAreaId: areaId,
    })

    if (farTravelCheck.valid) {
      const area = state.exploration.areas.get(areaId)
      const areaName = getAreaDisplayName(areaId, area)
      actions.push({
        displayName: `fartravel ${areaName}`,
        timeCost: Math.round(travelTime),
        isVariable: false,
        successProbability: 1,
      })
    }
  }
}

/**
 * Add drop actions for items in inventory
 */
function addDropActions(state: WorldState, actions: AvailableAction[]): void {
  for (const item of state.player.inventory) {
    const dropAction: DropAction = {
      type: "Drop",
      itemId: item.itemId,
      quantity: 1, // Use 1 as representative; actual quantity is a parameter
    }
    const dropCheck = checkAction(state, dropAction)

    if (dropCheck.valid) {
      actions.push({
        displayName: `drop <quantity> ${item.itemId}`,
        timeCost: dropCheck.timeCost,
        isVariable: false,
        successProbability: 1,
      })
    }
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
