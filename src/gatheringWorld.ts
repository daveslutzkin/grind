/**
 * Gathering World Factory
 *
 * Creates the world state for the gathering MVP with:
 * - 7 locations with distance bands
 * - Material definitions with tiers
 * - Node generation with multi-material reserves
 */

import type {
  WorldState,
  Location,
  Node,
  MaterialReserve,
  GatheringSkillID,
  RngState,
} from "./types.js"
import { DistanceBand, NodeType } from "./types.js"
import { createRng, rollFloat } from "./rng.js"

// ============================================================================
// Location Definitions
// ============================================================================

export const LOCATIONS: Location[] = [
  {
    id: "TOWN",
    name: "Town",
    band: DistanceBand.TOWN,
    travelTicksFromTown: 0,
    nodePools: [],
    requiredGuildReputation: null,
  },
  {
    id: "OUTSKIRTS_MINE",
    name: "Outskirts Mine",
    band: DistanceBand.NEAR,
    travelTicksFromTown: 3,
    nodePools: ["near_ore"],
    requiredGuildReputation: null,
  },
  {
    id: "COPSE",
    name: "Copse",
    band: DistanceBand.NEAR,
    travelTicksFromTown: 3,
    nodePools: ["near_trees"],
    requiredGuildReputation: null,
  },
  {
    id: "OLD_QUARRY",
    name: "Old Quarry",
    band: DistanceBand.MID,
    travelTicksFromTown: 8,
    nodePools: ["mid_ore"],
    requiredGuildReputation: null,
  },
  {
    id: "DEEP_FOREST",
    name: "Deep Forest",
    band: DistanceBand.MID,
    travelTicksFromTown: 8,
    nodePools: ["mid_trees"],
    requiredGuildReputation: null,
  },
  {
    id: "ABANDONED_SHAFT",
    name: "Abandoned Shaft",
    band: DistanceBand.FAR,
    travelTicksFromTown: 15,
    nodePools: ["far_ore"],
    requiredGuildReputation: null,
  },
  {
    id: "ANCIENT_GROVE",
    name: "Ancient Grove",
    band: DistanceBand.FAR,
    travelTicksFromTown: 15,
    nodePools: ["far_trees"],
    requiredGuildReputation: null,
  },
]

// ============================================================================
// Material Definitions
// ============================================================================

export interface MaterialDefinition {
  tier: number
  skill: GatheringSkillID
  requiredLevel: number
  baseUnits: number // Base amount in a node
}

export const MATERIALS: Record<string, MaterialDefinition> = {
  // Mining materials - NEAR (tier 1-2)
  STONE: { tier: 1, skill: "Mining", requiredLevel: 1, baseUnits: 100 },
  COPPER_ORE: { tier: 1, skill: "Mining", requiredLevel: 1, baseUnits: 80 },
  TIN_ORE: { tier: 2, skill: "Mining", requiredLevel: 2, baseUnits: 60 },

  // Mining materials - MID (tier 3-4)
  IRON_ORE: { tier: 3, skill: "Mining", requiredLevel: 5, baseUnits: 50 },
  SILVER_ORE: { tier: 4, skill: "Mining", requiredLevel: 8, baseUnits: 30 },

  // Mining materials - FAR (tier 5)
  DEEP_ORE: { tier: 5, skill: "Mining", requiredLevel: 9, baseUnits: 40 },
  MITHRIL_ORE: { tier: 5, skill: "Mining", requiredLevel: 10, baseUnits: 20 },

  // Woodcutting materials - NEAR (tier 1-2)
  GREEN_WOOD: {
    tier: 1,
    skill: "Woodcutting",
    requiredLevel: 1,
    baseUnits: 100,
  },
  SOFTWOOD: { tier: 1, skill: "Woodcutting", requiredLevel: 1, baseUnits: 80 },
  HARDWOOD: { tier: 2, skill: "Woodcutting", requiredLevel: 2, baseUnits: 60 },

  // Woodcutting materials - MID (tier 3-4)
  OAK_WOOD: { tier: 3, skill: "Woodcutting", requiredLevel: 5, baseUnits: 50 },
  IRONWOOD: { tier: 4, skill: "Woodcutting", requiredLevel: 8, baseUnits: 30 },

  // Woodcutting materials - FAR (tier 5)
  ANCIENT_WOOD: {
    tier: 5,
    skill: "Woodcutting",
    requiredLevel: 9,
    baseUnits: 40,
  },
  SPIRITWOOD: {
    tier: 5,
    skill: "Woodcutting",
    requiredLevel: 10,
    baseUnits: 20,
  },
}

// ============================================================================
// Node Pool Definitions
// ============================================================================

interface NodePoolConfig {
  nodeType: NodeType
  materialsPool: string[] // Material IDs that can appear
  nodesPerLocation: number
}

const NODE_POOLS: Record<string, NodePoolConfig> = {
  near_ore: {
    nodeType: NodeType.ORE_VEIN,
    materialsPool: ["STONE", "COPPER_ORE", "TIN_ORE"],
    nodesPerLocation: 5,
  },
  mid_ore: {
    nodeType: NodeType.ORE_VEIN,
    materialsPool: ["STONE", "COPPER_ORE", "TIN_ORE", "IRON_ORE", "SILVER_ORE"],
    nodesPerLocation: 4,
  },
  far_ore: {
    nodeType: NodeType.ORE_VEIN,
    materialsPool: ["IRON_ORE", "SILVER_ORE", "DEEP_ORE", "MITHRIL_ORE"],
    nodesPerLocation: 3,
  },
  near_trees: {
    nodeType: NodeType.TREE_STAND,
    materialsPool: ["GREEN_WOOD", "SOFTWOOD", "HARDWOOD"],
    nodesPerLocation: 5,
  },
  mid_trees: {
    nodeType: NodeType.TREE_STAND,
    materialsPool: ["GREEN_WOOD", "SOFTWOOD", "HARDWOOD", "OAK_WOOD", "IRONWOOD"],
    nodesPerLocation: 4,
  },
  far_trees: {
    nodeType: NodeType.TREE_STAND,
    materialsPool: ["OAK_WOOD", "IRONWOOD", "ANCIENT_WOOD", "SPIRITWOOD"],
    nodesPerLocation: 3,
  },
}

// ============================================================================
// Travel Cost Generation
// ============================================================================

export function generateTravelCosts(locations: Location[]): Record<string, number> {
  const costs: Record<string, number> = {}

  for (const from of locations) {
    for (const to of locations) {
      if (from.id !== to.id) {
        // Cost is based on Manhattan-style distance through town
        // If going via town: from.travelTicksFromTown + to.travelTicksFromTown
        // Direct: we use the simpler model of just the target's distance if from town,
        // or sum of both distances for cross-travel
        let cost: number
        if (from.id === "TOWN") {
          cost = to.travelTicksFromTown
        } else if (to.id === "TOWN") {
          cost = from.travelTicksFromTown
        } else {
          // Travel between non-town locations goes through town
          cost = from.travelTicksFromTown + to.travelTicksFromTown
        }
        costs[`${from.id}->${to.id}`] = cost
      }
    }
  }

  return costs
}

// ============================================================================
// Node Generation
// ============================================================================

function generateMaterialReserve(materialId: string, rng: RngState): MaterialReserve {
  const def = MATERIALS[materialId]
  // Randomize units ±30%
  const variance = rollFloat(rng, 0.7, 1.3, `material_units_${materialId}`)
  const units = Math.round(def.baseUnits * variance)

  return {
    materialId,
    remainingUnits: units,
    maxUnitsInitial: units,
    requiresSkill: def.skill,
    requiredLevel: def.requiredLevel,
    tier: def.tier,
  }
}

function generateNode(
  nodeId: string,
  locationId: string,
  poolConfig: NodePoolConfig,
  rng: RngState
): Node {
  // Pick 2-4 materials from the pool
  const numMaterials = 2 + Math.floor(rollFloat(rng, 0, 2.99, `num_materials_${nodeId}`))
  const shuffled = [...poolConfig.materialsPool].sort(() =>
    rollFloat(rng, -1, 1, `shuffle_${nodeId}`)
  )
  const selectedMaterials = shuffled.slice(0, numMaterials)

  const materials = selectedMaterials.map((matId) => generateMaterialReserve(matId, rng))

  return {
    nodeId,
    nodeType: poolConfig.nodeType,
    locationId,
    materials,
    depleted: false,
  }
}

function generateNodesForLocation(location: Location, rng: RngState): Node[] {
  const nodes: Node[] = []

  for (const poolId of location.nodePools) {
    const poolConfig = NODE_POOLS[poolId]
    if (!poolConfig) continue

    for (let i = 0; i < poolConfig.nodesPerLocation; i++) {
      const nodeId = `${location.id}-${poolId}-${i}`
      nodes.push(generateNode(nodeId, location.id, poolConfig, rng))
    }
  }

  return nodes
}

function generateAllNodes(rng: RngState): Node[] {
  const allNodes: Node[] = []

  for (const location of LOCATIONS) {
    const locationNodes = generateNodesForLocation(location, rng)
    allNodes.push(...locationNodes)
  }

  return allNodes
}

// ============================================================================
// World Factory
// ============================================================================

export function createGatheringWorld(seed: string): WorldState {
  const rng = createRng(seed)
  const nodes = generateAllNodes(rng)

  return {
    time: {
      currentTick: 0,
      sessionRemainingTicks: 200, // Shorter sessions for testing
    },

    player: {
      location: "TOWN",
      inventory: [],
      inventoryCapacity: 20,
      storage: [],
      skills: {
        Mining: { level: 0, xp: 0 },
        Woodcutting: { level: 0, xp: 0 },
        Combat: { level: 0, xp: 0 },
        Smithing: { level: 0, xp: 0 },
        Woodcrafting: { level: 0, xp: 0 },
        Exploration: { level: 0, xp: 0 },
      },
      guildReputation: 0,
      activeContracts: [],
      equippedWeapon: null,
      contractKillProgress: {},
    },

    world: {
      locations: LOCATIONS.map((l) => l.id),
      travelCosts: generateTravelCosts(LOCATIONS),
      resourceNodes: [], // Legacy - empty for gathering world
      nodes,
      enemies: [],
      recipes: [], // TODO: Add smelting/crafting recipes
      contracts: [],
      storageLocation: "TOWN",
    },

    rng,
  }
}
