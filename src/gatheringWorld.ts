/**
 * Gathering World Factory
 *
 * Creates the world state for the gathering MVP with:
 * - 7 areas with distance bands
 * - Material definitions with tiers
 * - Node generation with multi-material reserves
 */

import type {
  WorldState,
  Area,
  AreaConnection,
  Node,
  MaterialReserve,
  GatheringSkillID,
  RngState,
  AreaID,
} from "./types.js"
import { DistanceBand, NodeType } from "./types.js"
import { createRng, rollFloat } from "./rng.js"

// ============================================================================
// Area Definitions (replaces old Location type)
// ============================================================================

interface AreaDefinition {
  id: AreaID
  name: string
  band: DistanceBand
  distance: number // Numeric distance for exploration
  nodePools: string[]
}

const AREA_DEFINITIONS: AreaDefinition[] = [
  {
    id: "TOWN",
    name: "Town",
    band: DistanceBand.TOWN,
    distance: 0,
    nodePools: [],
  },
  {
    id: "OUTSKIRTS_MINE",
    name: "Outskirts Mine",
    band: DistanceBand.NEAR,
    distance: 1,
    nodePools: ["near_ore"],
  },
  {
    id: "COPSE",
    name: "Copse",
    band: DistanceBand.NEAR,
    distance: 1,
    nodePools: ["near_trees"],
  },
  {
    id: "OLD_QUARRY",
    name: "Old Quarry",
    band: DistanceBand.MID,
    distance: 2,
    nodePools: ["mid_ore"],
  },
  {
    id: "DEEP_FOREST",
    name: "Deep Forest",
    band: DistanceBand.MID,
    distance: 2,
    nodePools: ["mid_trees"],
  },
  {
    id: "ABANDONED_SHAFT",
    name: "Abandoned Shaft",
    band: DistanceBand.FAR,
    distance: 3,
    nodePools: ["far_ore"],
  },
  {
    id: "ANCIENT_GROVE",
    name: "Ancient Grove",
    band: DistanceBand.FAR,
    distance: 3,
    nodePools: ["far_trees"],
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
// Connection Generation
// ============================================================================

function generateConnections(areas: AreaDefinition[]): AreaConnection[] {
  const connections: AreaConnection[] = []
  const town = areas.find((a) => a.distance === 0)!

  // Connect town to all distance-1 areas
  for (const area of areas) {
    if (area.distance === 1) {
      connections.push({
        fromAreaId: town.id,
        toAreaId: area.id,
        travelTimeMultiplier: 2,
      })
      connections.push({
        fromAreaId: area.id,
        toAreaId: town.id,
        travelTimeMultiplier: 2,
      })
    }
  }

  // Connect distance-1 to distance-2
  const dist1 = areas.filter((a) => a.distance === 1)
  const dist2 = areas.filter((a) => a.distance === 2)
  for (const near of dist1) {
    for (const mid of dist2) {
      // Connect areas of matching type (mining to mining, woodcutting to woodcutting)
      const nearIsOre = near.nodePools.some((p) => p.includes("ore"))
      const midIsOre = mid.nodePools.some((p) => p.includes("ore"))
      if (nearIsOre === midIsOre) {
        connections.push({
          fromAreaId: near.id,
          toAreaId: mid.id,
          travelTimeMultiplier: 3,
        })
        connections.push({
          fromAreaId: mid.id,
          toAreaId: near.id,
          travelTimeMultiplier: 3,
        })
      }
    }
  }

  // Connect distance-2 to distance-3
  const dist3 = areas.filter((a) => a.distance === 3)
  for (const mid of dist2) {
    for (const far of dist3) {
      // Connect areas of matching type
      const midIsOre = mid.nodePools.some((p) => p.includes("ore"))
      const farIsOre = far.nodePools.some((p) => p.includes("ore"))
      if (midIsOre === farIsOre) {
        connections.push({
          fromAreaId: mid.id,
          toAreaId: far.id,
          travelTimeMultiplier: 4,
        })
        connections.push({
          fromAreaId: far.id,
          toAreaId: mid.id,
          travelTimeMultiplier: 4,
        })
      }
    }
  }

  return connections
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
  areaId: AreaID,
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
    areaId,
    materials,
    depleted: false,
  }
}

function generateNodesForArea(areaDef: AreaDefinition, rng: RngState): Node[] {
  const nodes: Node[] = []

  for (const poolId of areaDef.nodePools) {
    const poolConfig = NODE_POOLS[poolId]
    if (!poolConfig) continue

    for (let i = 0; i < poolConfig.nodesPerLocation; i++) {
      const nodeId = `${areaDef.id}-${poolId}-${i}`
      nodes.push(generateNode(nodeId, areaDef.id, poolConfig, rng))
    }
  }

  return nodes
}

function generateAllNodes(rng: RngState): Node[] {
  const allNodes: Node[] = []

  for (const areaDef of AREA_DEFINITIONS) {
    const areaNodes = generateNodesForArea(areaDef, rng)
    allNodes.push(...areaNodes)
  }

  return allNodes
}

// ============================================================================
// World Factory
// ============================================================================

export function createGatheringWorld(seed: string): WorldState {
  const rng = createRng(seed)
  const nodes = generateAllNodes(rng)

  // Create areas map
  const areas = new Map<AreaID, Area>()
  let indexByDistance: Record<number, number> = {}

  for (const areaDef of AREA_DEFINITIONS) {
    const idx = indexByDistance[areaDef.distance] ?? 0
    indexByDistance[areaDef.distance] = idx + 1

    const area: Area = {
      id: areaDef.id,
      name: areaDef.name,
      distance: areaDef.distance,
      generated: true,
      locations: [], // Exploration locations (not gathering nodes)
      indexInDistance: idx,
    }
    areas.set(areaDef.id, area)
  }

  // Generate connections
  const connections = generateConnections(AREA_DEFINITIONS)

  // All areas and connections are known at start for gathering world
  const knownAreaIds = AREA_DEFINITIONS.map((a) => a.id)
  const knownConnectionIds = connections.map((c) => `${c.fromAreaId}->${c.toAreaId}`)

  return {
    time: {
      currentTick: 0,
      sessionRemainingTicks: 200, // Shorter sessions for testing
    },

    player: {
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
      nodes,
      enemies: [
        {
          id: "cave-rat",
          areaId: "OUTSKIRTS_MINE",
          fightTime: 3,
          successProbability: 0.7,
          requiredSkillLevel: 1,
          lootTable: [
            { itemId: "COPPER_ORE", quantity: 1, weight: 89 },
            {
              itemId: "IMPROVED_WEAPON",
              quantity: 1,
              weight: 10,
              replacesItem: "CRUDE_WEAPON",
              autoEquip: true,
            },
            { itemId: "COMBAT_GUILD_TOKEN", quantity: 1, weight: 1 },
          ],
          failureAreaId: "TOWN",
        },
      ],
      recipes: [
        {
          id: "iron-bar-recipe",
          inputs: [{ itemId: "IRON_ORE", quantity: 2 }],
          output: { itemId: "IRON_BAR", quantity: 1 },
          craftTime: 3,
          requiredAreaId: "TOWN",
          requiredSkillLevel: 1,
        },
        {
          id: "copper-bar-recipe",
          inputs: [{ itemId: "COPPER_ORE", quantity: 2 }],
          output: { itemId: "COPPER_BAR", quantity: 1 },
          craftTime: 2,
          requiredAreaId: "TOWN",
          requiredSkillLevel: 1,
        },
      ],
      contracts: [
        {
          id: "miners-guild-1",
          guildAreaId: "TOWN",
          requirements: [{ itemId: "COPPER_BAR", quantity: 2 }],
          rewards: [{ itemId: "COPPER_ORE", quantity: 5 }],
          reputationReward: 10,
          xpReward: { skill: "Mining", amount: 2 },
        },
      ],
      storageAreaId: "TOWN",
    },

    exploration: {
      areas,
      connections,
      playerState: {
        currentAreaId: "TOWN",
        knownAreaIds,
        knownLocationIds: [],
        knownConnectionIds,
        totalLuckDelta: 0,
        currentStreak: 0,
      },
    },

    rng,
  }
}
