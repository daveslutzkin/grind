/**
 * Available Actions Module
 *
 * Enumerates available actions for any world state with cost preview.
 * Uses the same validation logic as the engine (via checkAction)
 * to ensure consistency.
 */

import type {
  WorldState,
  SkillID,
  Action,
  GatherAction,
  CraftAction,
  BuyMapAction,
  TurnInContractAction,
  SeeGatheringMapAction,
} from "./types.js"
import { GatherMode } from "./types.js"
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
import { TIER_ORDER, MATERIAL_TIERS, NODE_MAP_PRICES, getAreaMapPrice } from "./contracts.js"

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

      // Turn in active contracts at this location
      addTurnInContractActions(state, actions, currentLocationId!)

      // Map shop actions (Phase 3)
      addMapShopActions(state, actions, currentLocation.guildType as SkillID)

      // See gathering map action (at Mining and Woodcutting guilds)
      if (skill === "Mining" || skill === "Woodcutting") {
        const seeMapAction: SeeGatheringMapAction = { type: "SeeGatheringMap" }
        const check = checkAction(state, seeMapAction)
        if (check.valid) {
          actions.push({
            displayName: "see gathering map",
            timeCost: 0,
            isVariable: false,
            successProbability: 1,
          })
        }
      }
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

  // ========== TOWN LOCATION ACTIONS ==========

  // Far travel is also available from any town location (not just hub)
  // This allows players to fartravel directly from guilds without going to the hub first
  if (inTown && !isAtHub) {
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
 * Add turn-in contract action if player has an active contract that can be turned in here.
 */
function addTurnInContractActions(
  state: WorldState,
  actions: AvailableAction[],
  locationId: string
): void {
  // Check if player has any active contracts that can be turned in at this location
  for (const contractId of state.player.activeContracts) {
    const contract = state.world.contracts.find((c) => c.id === contractId)
    if (!contract || contract.acceptLocationId !== locationId) continue

    const turnInAction: TurnInContractAction = { type: "TurnInContract", contractId }
    const turnInCheck = checkAction(state, turnInAction)

    if (turnInCheck.valid) {
      actions.push({
        displayName: "turn-in",
        timeCost: turnInCheck.timeCost,
        isVariable: false,
        successProbability: 1,
      })
      return // Only add one turn-in action
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

  // FOCUS mode is always available at L1+ - check if any material is gatherable
  if (skillLevel >= 1) {
    const gatherableMaterials = node.materials.filter(
      (mat) => mat.requiredLevel <= skillLevel && mat.remainingUnits > 0
    )
    if (gatherableMaterials.length > 0) {
      const gatherAction: GatherAction = {
        type: "Gather",
        nodeId,
        mode: GatherMode.FOCUS,
        focusMaterialId: gatherableMaterials[0].materialId,
      }
      const gatherCheck = checkAction(state, gatherAction)

      if (gatherCheck.valid) {
        // Show simpler command when only one material is gatherable
        const displayName =
          gatherableMaterials.length === 1 ? commandName : `${commandName} <resource>`
        actions.push({
          displayName,
          timeCost: gatherCheck.timeCost,
          isVariable: false,
          successProbability: 1,
        })
      }
    }
  }

  // Get other unlocked modes for this skill level (APPRAISE, CAREFUL_ALL)
  const unlockedModes = getUnlockedModes(skillLevel)

  for (const mode of unlockedModes) {
    const modeLower = mode.toLowerCase()

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

  // Add "go <location>" if locations are available in current area
  if (hasValidLocation) {
    actions.push({
      displayName: "go <location>",
      timeCost: inTown ? 0 : 1,
      isVariable: false,
      successProbability: 1,
    })
  }

  // Add "go <area>" if adjacent areas are available
  // This is separate from locations - both can be shown at the same time
  if (hasAdjacentArea) {
    actions.push({
      displayName: "go <area>",
      timeCost: 0, // Use 0 to show just "varies" without misleading estimate
      isVariable: true,
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

/**
 * Add map shop actions at guild halls (Phase 3: Map Shops)
 *
 * Mining Guild: Node maps for unlocked material tiers
 * Exploration Guild: Area maps by distance
 */
function addMapShopActions(
  state: WorldState,
  actions: AvailableAction[],
  guildType: SkillID
): void {
  if (guildType === "Mining") {
    // Mining Guild sells node maps
    const miningLevel = state.player.skills.Mining?.level ?? 0
    if (miningLevel < 1) return // Must be enrolled

    // Check if player has any gold
    if (state.player.gold <= 0) return

    // Check if any unlocked tier has a valid map
    for (const tierId of TIER_ORDER) {
      const tier = MATERIAL_TIERS[tierId]
      if (miningLevel < tier.unlockLevel) continue

      const price = NODE_MAP_PRICES[tierId]
      if (state.player.gold < price) continue

      const buyMapAction: BuyMapAction = {
        type: "BuyMap",
        mapType: "node",
        materialTier: tierId,
      }
      const buyMapCheck = checkAction(state, buyMapAction)

      if (buyMapCheck.valid) {
        // Show one generic action since there could be multiple affordable tiers
        actions.push({
          displayName: "buy node map",
          timeCost: 0,
          isVariable: false,
          successProbability: 1,
        })
        return // Only add one buy map action
      }
    }
  } else if (guildType === "Exploration") {
    // Exploration Guild sells area maps
    const explorationLevel = state.player.skills.Exploration?.level ?? 0
    if (explorationLevel < 1) return // Must be enrolled

    // Check if player has any gold
    if (state.player.gold <= 0) return

    // Check if player can afford at least distance 1 map
    const minPrice = getAreaMapPrice(1)
    if (state.player.gold < minPrice) return

    const buyMapAction: BuyMapAction = {
      type: "BuyMap",
      mapType: "area",
      targetDistance: 1,
    }
    const buyMapCheck = checkAction(state, buyMapAction)

    if (buyMapCheck.valid) {
      actions.push({
        displayName: "buy area map",
        timeCost: 0,
        isVariable: false,
        successProbability: 1,
      })
    }
  }
}
