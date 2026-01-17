/**
 * Mining Contract Generation System
 *
 * Generates procedural mining contracts with gold rewards, replacing the
 * hardcoded contract system. Contracts reward money instead of raw materials.
 */

import type {
  Contract,
  RngState,
  ContractID,
  ContractSlot,
  WorldState,
  ContractMap,
  AreaID,
  AreaConnection,
} from "./types.js"
import { rollFloat } from "./rng.js"
import { TOWN_LOCATIONS } from "./world.js"
import {
  createConnectionId,
  ensureAreaGenerated,
  createAreaPlaceholder,
  getAreaCountForDistance,
  BASE_TRAVEL_TIME,
} from "./exploration.js"

// ============================================================================
// Node ID Helpers
// ============================================================================

/**
 * Convert a node ID to its corresponding location ID.
 *
 * Node ID format: {areaId}-node-{index}
 * Location ID format: {areaId}-loc-{index}
 *
 * @returns The location ID, or null if the node ID format is invalid
 */
export function nodeIdToLocationId(nodeId: string): string | null {
  const match = nodeId.match(/^(.+)-node-(\d+)$/)
  if (!match) return null
  const [, areaId, index] = match
  return `${areaId}-loc-${index}`
}

// ============================================================================
// Material Tier Definitions
// ============================================================================

export interface MaterialTier {
  materialId: string
  unlockLevel: number
  resaleValue: number // gold per unit
  reputation: number
}

/**
 * Material tiers for mining contracts
 * Per design-docs/implementation-plan-mining-contracts.md
 */
export const MATERIAL_TIERS: Record<string, MaterialTier> = {
  STONE: { materialId: "STONE", unlockLevel: 1, resaleValue: 0.1, reputation: 5 },
  COPPER_ORE: { materialId: "COPPER_ORE", unlockLevel: 20, resaleValue: 0.4, reputation: 10 },
  TIN_ORE: { materialId: "TIN_ORE", unlockLevel: 40, resaleValue: 1.0, reputation: 20 },
  IRON_ORE: { materialId: "IRON_ORE", unlockLevel: 60, resaleValue: 2.5, reputation: 40 },
  SILVER_ORE: { materialId: "SILVER_ORE", unlockLevel: 80, resaleValue: 6.0, reputation: 80 },
  GOLD_ORE: { materialId: "GOLD_ORE", unlockLevel: 100, resaleValue: 15.0, reputation: 160 },
  MITHRIL_ORE: { materialId: "MITHRIL_ORE", unlockLevel: 120, resaleValue: 35.0, reputation: 320 },
  OBSIDIUM_ORE: {
    materialId: "OBSIDIUM_ORE",
    unlockLevel: 140,
    resaleValue: 80.0,
    reputation: 640,
  },
}

// Ordered list of material tiers for progression
const TIER_ORDER = [
  "STONE",
  "COPPER_ORE",
  "TIN_ORE",
  "IRON_ORE",
  "SILVER_ORE",
  "GOLD_ORE",
  "MITHRIL_ORE",
  "OBSIDIUM_ORE",
]

// Export for use in other modules
export { TIER_ORDER }

// ============================================================================
// Phase 3: Map Shop Pricing
// ============================================================================

/**
 * Map prices by material tier (Mining Guild node maps)
 * Per design doc: ~3 contracts worth of gold for early tiers, relatively cheaper for higher
 */
export const NODE_MAP_PRICES: Record<string, number> = {
  STONE: 4,
  COPPER_ORE: 11,
  TIN_ORE: 22,
  IRON_ORE: 45,
  SILVER_ORE: 80,
  GOLD_ORE: 135,
  MITHRIL_ORE: 225,
  OBSIDIUM_ORE: 375,
}

/**
 * Area map prices by distance tier (Exploration Guild)
 * 60% of equivalent Mining Guild map price (50-70% range per spec)
 * Distance tier roughly maps to material tier: distance 1-8 = tier 1, 9-16 = tier 2, etc.
 */
export function getAreaMapPrice(distance: number): number {
  // Map distance to tier index (1-8 = tier 1, 9-16 = tier 2, etc.)
  const tierIndex = Math.ceil(distance / 8)
  // Cap at highest tier (Obsidium) for distances > 64
  const tierId = TIER_ORDER[Math.min(tierIndex - 1, TIER_ORDER.length - 1)]
  const nodeMapPrice = NODE_MAP_PRICES[tierId]
  // 60% of node map price
  return Math.round(nodeMapPrice * 0.6)
}

/**
 * Get the price for a node map of a specific material tier
 */
export function getNodeMapPrice(materialTier: string): number | null {
  return NODE_MAP_PRICES[materialTier] ?? null
}

// ============================================================================
// Contract Generation Parameters
// ============================================================================

export interface ContractGenerationParams {
  playerMiningLevel: number
  rng: RngState
  state?: WorldState // Optional state for Phase 2 map generation
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get the material tier for a given mining level
 * Returns the highest tier the player has unlocked
 */
export function getMaterialTierForLevel(level: number): string {
  let result = TIER_ORDER[0]
  for (const tierId of TIER_ORDER) {
    const tier = MATERIAL_TIERS[tierId]
    if (level >= tier.unlockLevel) {
      result = tierId
    } else {
      break
    }
  }
  return result
}

/**
 * Get the next material tier after the given tier
 * Returns null if already at max tier
 */
function getNextTier(currentTierId: string): string | null {
  const currentIndex = TIER_ORDER.indexOf(currentTierId)
  if (currentIndex === -1 || currentIndex >= TIER_ORDER.length - 1) {
    return null
  }
  return TIER_ORDER[currentIndex + 1]
}

/**
 * Get quantity for level within a tier
 * Scales from ~5 at tier start to ~20 at tier end
 */
export function getQuantityForLevel(level: number): number {
  const currentTierId = getMaterialTierForLevel(level)
  const currentTier = MATERIAL_TIERS[currentTierId]
  const nextTierId = getNextTier(currentTierId)

  // Calculate position within the tier (0.0 to 1.0)
  let tierProgress: number
  if (nextTierId) {
    const nextTier = MATERIAL_TIERS[nextTierId]
    const tierRange = nextTier.unlockLevel - currentTier.unlockLevel
    tierProgress = (level - currentTier.unlockLevel) / tierRange
  } else {
    // At max tier, use 20 levels as the range
    tierProgress = Math.min(1, (level - currentTier.unlockLevel) / 20)
  }

  // Scale from 5 to 20 based on progress
  const minQuantity = 5
  const maxQuantity = 20
  return Math.round(minQuantity + tierProgress * (maxQuantity - minQuantity))
}

/**
 * Roll bounty percentage for contract
 *
 * Distribution (weighted toward lower end with rare jackpots):
 * - Common (70-80%): 10-50% bounty
 * - Uncommon (15-20%): 50-100% bounty
 * - Rare (5-10%): 150-200% bounty
 *
 * Returns value between 0.1 and 2.0 (representing 10% to 200%)
 */
export function rollBounty(rng: RngState): number {
  const roll = rollFloat(rng, 0, 1, "bounty_tier")

  if (roll < 0.75) {
    // Common: 10-50% bounty (0.1 to 0.5)
    return rollFloat(rng, 0.1, 0.5, "bounty_value")
  } else if (roll < 0.93) {
    // Uncommon: 50-100% bounty (0.5 to 1.0)
    return rollFloat(rng, 0.5, 1.0, "bounty_value")
  } else {
    // Rare: 150-200% bounty (1.5 to 2.0)
    return rollFloat(rng, 1.5, 2.0, "bounty_value")
  }
}

// ============================================================================
// Phase 2: Map Inclusion Logic
// ============================================================================

/**
 * Get the tier index (1-8) for a material ID
 */
function getMaterialTierIndex(materialId: string): number {
  const index = TIER_ORDER.indexOf(materialId)
  return index === -1 ? 1 : index + 1
}

/**
 * Get the distance range where a material tier primarily spawns.
 * Based on world.ts: getMiningTierForDistance(distance) = ceil(distance / 8)
 *
 * Tier 1 (STONE): distance 1-8
 * Tier 2 (COPPER): distance 9-16
 * etc.
 */
function getDistanceRangeForTier(tierIndex: number): { min: number; max: number } {
  const min = (tierIndex - 1) * 8 + 1
  const max = tierIndex * 8
  return { min, max }
}

/**
 * Ensure a "corridor" of areas exists from TOWN to a target distance.
 * Rather than generating ALL areas at each distance (which could be 500+ areas),
 * this generates just enough areas to create a path.
 *
 * Returns the IDs of areas in the corridor that were generated/ensured.
 */
export function ensureCorridorToDistance(state: WorldState, targetDistance: number): AreaID[] {
  const exploration = state.exploration
  const corridorAreas: AreaID[] = []

  // For each distance, ensure at least one area exists and is generated
  for (let distance = 1; distance <= targetDistance; distance++) {
    // Check if we already have a generated area at this distance
    let areaAtDistance: AreaID | null = null

    for (const [areaId, area] of exploration.areas) {
      if (area.distance === distance && area.generated) {
        areaAtDistance = areaId
        break
      }
    }

    // If no generated area exists, create and generate one
    if (!areaAtDistance) {
      // Pick index 0 for simplicity - deterministic choice
      const areaId = `area-d${distance}-i0`
      if (!exploration.areas.has(areaId)) {
        const placeholder = createAreaPlaceholder(distance, 0)
        exploration.areas.set(placeholder.id, placeholder)
      }

      const area = exploration.areas.get(areaId)!
      ensureAreaGenerated(state, area)
      areaAtDistance = areaId
    }

    corridorAreas.push(areaAtDistance)
  }

  // Now ensure connections exist along the corridor
  // TOWN -> d1 -> d2 -> ... -> targetDistance
  let prevAreaId: AreaID = "TOWN"

  for (const areaId of corridorAreas) {
    // Check if connection already exists
    const connectionExists = exploration.connections.some(
      (c) =>
        (c.fromAreaId === prevAreaId && c.toAreaId === areaId) ||
        (c.fromAreaId === areaId && c.toAreaId === prevAreaId)
    )

    if (!connectionExists) {
      exploration.connections.push({
        fromAreaId: prevAreaId,
        toAreaId: areaId,
        travelTimeMultiplier: 1.0,
      })
    }

    prevAreaId = areaId
  }

  return corridorAreas
}

/**
 * Ensure enough areas exist at target distance to find a node with the required material.
 * Generates areas one at a time until we find a suitable node, up to a limit.
 */
function ensureAreasWithMaterial(
  state: WorldState,
  targetDistance: number,
  requiredMaterial: string,
  maxAreasToTry: number = 10
): void {
  const exploration = state.exploration

  // First, ensure the corridor exists
  ensureCorridorToDistance(state, targetDistance)

  // Now generate additional areas at target distance until we find the material
  // (or hit the limit)
  const existingAreasAtDistance = Array.from(exploration.areas.values()).filter(
    (a) => a.distance === targetDistance && a.generated
  )

  // Check if we already have a node with this material
  const hasNodeWithMaterial = () => {
    return state.world.nodes.some((node) => {
      const area = exploration.areas.get(node.areaId)
      if (!area || area.distance !== targetDistance) return false
      return node.materials.some((m) => m.materialId === requiredMaterial)
    })
  }

  if (hasNodeWithMaterial()) return

  // Try generating more areas at this distance
  const maxIndex = getAreaCountForDistance(targetDistance)
  let triedCount = existingAreasAtDistance.length

  for (let i = 0; i < maxIndex && triedCount < maxAreasToTry; i++) {
    const areaId = `area-d${targetDistance}-i${i}`

    // Skip if already generated
    if (exploration.areas.has(areaId) && exploration.areas.get(areaId)!.generated) {
      continue
    }

    // Create placeholder if needed
    if (!exploration.areas.has(areaId)) {
      const placeholder = createAreaPlaceholder(targetDistance, i)
      exploration.areas.set(placeholder.id, placeholder)
    }

    // Generate the area
    const area = exploration.areas.get(areaId)!
    ensureAreaGenerated(state, area)

    // Connect it to an existing area at distance-1
    const prevDistAreas = Array.from(exploration.areas.values()).filter(
      (a) => a.distance === targetDistance - 1 && a.generated
    )
    if (prevDistAreas.length > 0) {
      const connectionExists = exploration.connections.some(
        (c) =>
          (c.fromAreaId === prevDistAreas[0].id && c.toAreaId === areaId) ||
          (c.fromAreaId === areaId && c.toAreaId === prevDistAreas[0].id)
      )
      if (!connectionExists) {
        exploration.connections.push({
          fromAreaId: prevDistAreas[0].id,
          toAreaId: areaId,
          travelTimeMultiplier: 1.0,
        })
      }
    }

    triedCount++

    // Check if we found the material
    if (hasNodeWithMaterial()) return
  }
}

/**
 * Find a path between two areas using ALL connections (not just known ones).
 * Returns the path of areas and connections, or null if no path exists.
 */
export function findPathUsingAllConnections(
  state: WorldState,
  fromAreaId: AreaID,
  toAreaId: AreaID
): { areaIds: AreaID[]; connectionIds: string[]; totalTravelTime: number } | null {
  const exploration = state.exploration

  // BFS for shortest path
  const queue: { areaId: AreaID; path: AreaID[]; connections: AreaConnection[] }[] = [
    { areaId: fromAreaId, path: [fromAreaId], connections: [] },
  ]
  const visited = new Set<AreaID>([fromAreaId])

  while (queue.length > 0) {
    const current = queue.shift()!

    if (current.areaId === toAreaId) {
      // Build connection IDs from the path
      const connectionIds = current.connections.map((conn) =>
        createConnectionId(conn.fromAreaId, conn.toAreaId)
      )
      // Calculate total travel time using connection multipliers
      let totalTravelTime = 0
      for (const conn of current.connections) {
        totalTravelTime += BASE_TRAVEL_TIME * conn.travelTimeMultiplier
      }
      return { areaIds: current.path, connectionIds, totalTravelTime: Math.round(totalTravelTime) }
    }

    // Find all connections from current area (not filtered by knowledge)
    for (const conn of exploration.connections) {
      let nextAreaId: AreaID | null = null
      if (conn.fromAreaId === current.areaId && !visited.has(conn.toAreaId)) {
        nextAreaId = conn.toAreaId
      } else if (conn.toAreaId === current.areaId && !visited.has(conn.fromAreaId)) {
        nextAreaId = conn.fromAreaId
      }

      if (nextAreaId) {
        visited.add(nextAreaId)
        queue.push({
          areaId: nextAreaId,
          path: [...current.path, nextAreaId],
          connections: [...current.connections, conn],
        })
      }
    }
  }

  return null
}

/**
 * Determine if a map should be included with a contract
 *
 * Per design doc section 2.2:
 * - Early game (L1-19): Always include a map
 * - Later (L20+): Include map only if player doesn't know any nodes containing the required material
 */
export function shouldIncludeMap(
  playerLevel: number,
  requiredMaterial: string,
  state: WorldState
): boolean {
  // Early game: always include a map
  if (playerLevel < 20) {
    return true
  }

  // L20+: Include map only if player doesn't know any nodes with the material
  const knownLocationIds = new Set(state.exploration.playerState.knownLocationIds)

  // Check if player knows any nodes containing this material
  for (const node of state.world.nodes) {
    const hasMaterial = node.materials.some((m) => m.materialId === requiredMaterial)
    if (!hasMaterial) continue

    // Check if the node's location is known
    const locationId = nodeIdToLocationId(node.nodeId)
    if (!locationId) continue

    if (knownLocationIds.has(locationId)) {
      // Player knows a node with this material
      return false
    }
  }

  // Player doesn't know any nodes with this material
  return true
}

/**
 * Find undiscovered nodes containing the required material.
 * Returns candidates sorted by distance (closest first).
 */
function findCandidateNodes(
  requiredMaterial: string,
  state: WorldState
): Array<{ nodeId: string; areaId: AreaID; locationId: string; distance: number }> {
  const knownLocationIds = new Set(state.exploration.playerState.knownLocationIds)
  const candidates: Array<{
    nodeId: string
    areaId: AreaID
    locationId: string
    distance: number
  }> = []

  for (const node of state.world.nodes) {
    // Check if node contains the required material
    const hasMaterial = node.materials.some((m) => m.materialId === requiredMaterial)
    if (!hasMaterial) continue

    // Get the location ID for this node
    const locationId = nodeIdToLocationId(node.nodeId)
    if (!locationId) continue

    // Skip if already discovered
    if (knownLocationIds.has(locationId)) continue

    // Extract area ID from node ID (format: {areaId}-node-{index})
    const areaId = node.nodeId.replace(/-node-\d+$/, "")

    // Get area distance
    const area = state.exploration.areas.get(areaId)
    if (!area) continue

    candidates.push({
      nodeId: node.nodeId,
      areaId,
      locationId,
      distance: area.distance,
    })
  }

  // Sort by distance (prefer closer nodes)
  candidates.sort((a, b) => a.distance - b.distance)
  return candidates
}

/**
 * Find a suitable undiscovered node for a contract map.
 *
 * This function will generate areas on-demand if needed, enabling maps to guide
 * players to nodes even in areas they haven't explored yet. This allows players
 * to level Mining without needing to level Exploration.
 *
 * Rather than generating ALL areas at a distance (which could be 500+), this
 * generates a targeted "corridor" of areas plus a few extras at the target distance.
 *
 * Per design doc section 2.2:
 * - Search undiscovered nodes in world
 * - Must contain the required material
 * - Must be reachable (connection path exists)
 * - Prefer closer nodes (lower distance)
 */
export function findNodeForMap(requiredMaterial: string, state: WorldState): ContractMap | null {
  // First, try to find candidates in already-generated areas
  let candidates = findCandidateNodes(requiredMaterial, state)

  // If no candidates found, generate areas at appropriate distances
  if (candidates.length === 0) {
    const tierIndex = getMaterialTierIndex(requiredMaterial)
    const { min: minDistance } = getDistanceRangeForTier(tierIndex)

    // Generate a corridor to the minimum distance for this tier,
    // plus some extra areas at that distance to find the material
    ensureAreasWithMaterial(state, minDistance, requiredMaterial)

    // Try again after generation
    candidates = findCandidateNodes(requiredMaterial, state)
  }

  if (candidates.length === 0) {
    return null
  }

  // Try each candidate (closest first) until we find one with a valid path
  for (const candidate of candidates) {
    const pathResult = findPathUsingAllConnections(state, "TOWN", candidate.areaId)

    if (pathResult) {
      return {
        targetAreaId: candidate.areaId,
        targetNodeId: candidate.nodeId,
        connectionIds: pathResult.connectionIds,
        areaIds: pathResult.areaIds,
      }
    }
  }

  // If candidates exist but are unreachable, create a corridor to the closest one
  // This can happen when areas exist but have no connections yet
  if (candidates.length > 0) {
    const closestCandidate = candidates[0] // Already sorted by distance
    const targetDistance = closestCandidate.distance

    // Ensure corridor exists to this distance
    ensureCorridorToDistance(state, targetDistance)

    // Also connect the candidate's area to the corridor if needed
    const corridorAreaAtDistance = `area-d${targetDistance}-i0`
    const connectionExists = state.exploration.connections.some(
      (c) =>
        (c.fromAreaId === corridorAreaAtDistance && c.toAreaId === closestCandidate.areaId) ||
        (c.fromAreaId === closestCandidate.areaId && c.toAreaId === corridorAreaAtDistance)
    )
    if (!connectionExists && closestCandidate.areaId !== corridorAreaAtDistance) {
      state.exploration.connections.push({
        fromAreaId: corridorAreaAtDistance,
        toAreaId: closestCandidate.areaId,
        travelTimeMultiplier: 1.0,
      })
    }

    // Try again to find path
    const pathResult = findPathUsingAllConnections(state, "TOWN", closestCandidate.areaId)
    if (pathResult) {
      return {
        targetAreaId: closestCandidate.areaId,
        targetNodeId: closestCandidate.nodeId,
        connectionIds: pathResult.connectionIds,
        areaIds: pathResult.areaIds,
      }
    }
  }

  // No reachable candidates found
  return null
}

// Contract ID counter for unique IDs
let contractIdCounter = 0

/**
 * Generate a unique contract ID
 */
function generateContractId(): ContractID {
  contractIdCounter++
  return `mining-contract-${contractIdCounter}`
}

// ============================================================================
// Main Contract Generation
// ============================================================================

/**
 * Extended contract interface with gold reward
 */
export interface MiningContract extends Contract {
  goldReward: number
  slot: ContractSlot
}

/**
 * Generate a mining contract
 *
 * @param slot - "at-level" uses player's current tier, "aspirational" uses next tier
 * @param params - Generation parameters including player level and RNG
 * @returns The generated contract, or null if aspirational and at max tier
 */
export function generateMiningContract(
  slot: ContractSlot,
  params: ContractGenerationParams
): MiningContract | null {
  const { playerMiningLevel, rng, state } = params

  // Determine which material tier to use
  const currentTierId = getMaterialTierForLevel(playerMiningLevel)
  let targetTierId: string

  if (slot === "at-level") {
    targetTierId = currentTierId
  } else {
    // Aspirational: next tier
    const nextTierId = getNextTier(currentTierId)
    if (!nextTierId) {
      return null // Already at max tier
    }
    targetTierId = nextTierId
  }

  const tier = MATERIAL_TIERS[targetTierId]

  // Calculate quantity based on level
  const quantity = getQuantityForLevel(playerMiningLevel)

  // Roll bounty
  const bounty = rollBounty(rng)

  // Calculate gold reward: quantity * resaleValue * (1 + bounty)
  const goldReward = quantity * tier.resaleValue * (1 + bounty)

  // Generate the contract
  const contract: MiningContract = {
    id: generateContractId(),
    level: tier.unlockLevel,
    acceptLocationId: TOWN_LOCATIONS.MINERS_GUILD,
    guildType: "Mining",
    requirements: [{ itemId: tier.materialId, quantity }],
    rewards: [], // Gold is now separate, not an item reward
    reputationReward: tier.reputation,
    // No XP reward - player already earned XP from mining
    goldReward,
    slot,
  }

  // Phase 2: Include map if appropriate
  if (state && shouldIncludeMap(playerMiningLevel, tier.materialId, state)) {
    const map = findNodeForMap(tier.materialId, state)
    if (map) {
      contract.includedMap = map
    }
  }

  return contract
}

/**
 * Reset contract ID counter (for testing)
 */
export function resetContractIdCounter(): void {
  contractIdCounter = 0
}

// Re-export ContractSlot for backwards compatibility
export type { ContractSlot } from "./types.js"

// ============================================================================
// Contract Slot Management
// ============================================================================

/**
 * Refresh mining contracts for a specific slot or all slots
 *
 * @param state - World state to modify
 * @param slot - Specific slot to refresh, or undefined to refresh all mining contracts
 */
export function refreshMiningContracts(state: WorldState, slot?: ContractSlot): void {
  const playerMiningLevel = state.player.skills.Mining?.level ?? 0

  // If player hasn't enrolled in mining, no contracts available
  if (playerMiningLevel < 1) {
    // Remove any existing mining contracts
    state.world.contracts = state.world.contracts.filter((c) => c.guildType !== "Mining")
    return
  }

  const params: ContractGenerationParams = {
    playerMiningLevel,
    rng: state.rng,
    state, // Include state for Phase 2 map generation
  }

  if (slot) {
    // Refresh only the specified slot
    // Remove existing contract in this slot, but keep accepted contracts (they're still needed for completion)
    state.world.contracts = state.world.contracts.filter(
      (c) =>
        !(c.guildType === "Mining" && c.slot === slot) ||
        state.player.activeContracts.includes(c.id)
    )

    // Generate new contract
    const newContract = generateMiningContract(slot, params)
    if (newContract) {
      state.world.contracts.push(newContract)
    }
  } else {
    // Refresh all mining contracts, but keep accepted contracts
    state.world.contracts = state.world.contracts.filter(
      (c) => c.guildType !== "Mining" || state.player.activeContracts.includes(c.id)
    )

    // Generate at-level contract
    const atLevelContract = generateMiningContract("at-level", params)
    if (atLevelContract) {
      state.world.contracts.push(atLevelContract)
    }

    // Generate aspirational contract
    const aspirationalContract = generateMiningContract("aspirational", params)
    if (aspirationalContract) {
      state.world.contracts.push(aspirationalContract)
    }
  }
}

/**
 * Initialize mining contracts on world creation
 * Called after world creation to populate initial contracts
 */
export function initializeMiningContracts(state: WorldState): void {
  // Only initialize if player has enrolled in mining
  if (state.player.skills.Mining?.level >= 1) {
    refreshMiningContracts(state)
  }
}
