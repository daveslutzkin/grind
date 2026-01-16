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
} from "./types.js"
import { rollFloat } from "./rng.js"
import { TOWN_LOCATIONS } from "./world.js"
import { createConnectionId, findConnection } from "./exploration.js"

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
    // Location ID format: {areaId}-{nodeType}-loc-{index}
    // Node ID format: {areaId}-node-{index}
    const nodeMatch = node.nodeId.match(/^(.+)-node-(\d+)$/)
    if (!nodeMatch) continue

    const [, areaId, index] = nodeMatch
    const locationId = `${areaId}-ORE_VEIN-loc-${index}`

    if (knownLocationIds.has(locationId)) {
      // Player knows a node with this material
      return false
    }
  }

  // Player doesn't know any nodes with this material
  return true
}

/**
 * Find a suitable undiscovered node for a contract map
 *
 * Per design doc section 2.2:
 * - Search undiscovered nodes in world
 * - Must contain the required material
 * - Must be reachable (connection path exists, even if not yet discovered)
 * - Prefer closer nodes (lower distance)
 */
export function findNodeForMap(requiredMaterial: string, state: WorldState): ContractMap | null {
  const knownLocationIds = new Set(state.exploration.playerState.knownLocationIds)

  // Collect candidate nodes with their area distances
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
    const nodeMatch = node.nodeId.match(/^(.+)-node-(\d+)$/)
    if (!nodeMatch) continue

    const [, areaId, index] = nodeMatch
    const locationId = `${areaId}-ORE_VEIN-loc-${index}`

    // Skip if already discovered
    if (knownLocationIds.has(locationId)) continue

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

  if (candidates.length === 0) {
    return null
  }

  // Sort by distance (prefer closer nodes)
  candidates.sort((a, b) => a.distance - b.distance)

  // Select the closest candidate
  const selected = candidates[0]

  // Find the connection to this area from TOWN or a known area
  // For simplicity, we'll create a connection from TOWN if one exists
  let connectionId: string | null = null

  // Try to find a connection from TOWN to the target area
  const conn = findConnection(state.exploration.connections, "TOWN", selected.areaId)
  if (conn) {
    connectionId = createConnectionId(conn.fromAreaId, conn.toAreaId)
  } else {
    // Try to find any connection that reaches this area
    for (const conn of state.exploration.connections) {
      if (conn.toAreaId === selected.areaId || conn.fromAreaId === selected.areaId) {
        connectionId = createConnectionId(conn.fromAreaId, conn.toAreaId)
        break
      }
    }
  }

  if (!connectionId) {
    // No connection found - this shouldn't happen in a properly generated world
    return null
  }

  return {
    targetAreaId: selected.areaId,
    targetNodeId: selected.nodeId,
    connectionId,
  }
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
