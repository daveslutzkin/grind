/**
 * World Factory
 *
 * Creates the initial world state with:
 * - TOWN as the only known area
 * - Areas discovered procedurally through exploration
 * - Nodes generated when areas are discovered
 */

import type {
  WorldState,
  Area,
  Node,
  MaterialReserve,
  GatheringSkillID,
  RngState,
  AreaID,
  ExplorationLocation,
} from "./types.js"
import { NodeType, ExplorationLocationType } from "./types.js"
import { createRng, rollFloat } from "./rng.js"
import {
  getAreaCountForDistance,
  createAreaPlaceholder,
  generateAreaConnections,
} from "./exploration.js"

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
  // Mining materials - distance 1 (tier 1-2)
  STONE: { tier: 1, skill: "Mining", requiredLevel: 1, baseUnits: 100 },
  COPPER_ORE: { tier: 1, skill: "Mining", requiredLevel: 1, baseUnits: 80 },
  TIN_ORE: { tier: 2, skill: "Mining", requiredLevel: 2, baseUnits: 60 },

  // Mining materials - distance 2 (tier 3-4)
  IRON_ORE: { tier: 3, skill: "Mining", requiredLevel: 5, baseUnits: 50 },
  SILVER_ORE: { tier: 4, skill: "Mining", requiredLevel: 8, baseUnits: 30 },

  // Mining materials - distance 3+ (tier 5)
  DEEP_ORE: { tier: 5, skill: "Mining", requiredLevel: 9, baseUnits: 40 },
  MITHRIL_ORE: { tier: 5, skill: "Mining", requiredLevel: 10, baseUnits: 20 },

  // Woodcutting materials - distance 1 (tier 1-2)
  GREEN_WOOD: { tier: 1, skill: "Woodcutting", requiredLevel: 1, baseUnits: 100 },
  SOFTWOOD: { tier: 1, skill: "Woodcutting", requiredLevel: 1, baseUnits: 80 },
  HARDWOOD: { tier: 2, skill: "Woodcutting", requiredLevel: 2, baseUnits: 60 },

  // Woodcutting materials - distance 2 (tier 3-4)
  OAK_WOOD: { tier: 3, skill: "Woodcutting", requiredLevel: 5, baseUnits: 50 },
  IRONWOOD: { tier: 4, skill: "Woodcutting", requiredLevel: 8, baseUnits: 30 },

  // Woodcutting materials - distance 3+ (tier 5)
  ANCIENT_WOOD: { tier: 5, skill: "Woodcutting", requiredLevel: 9, baseUnits: 40 },
  SPIRITWOOD: { tier: 5, skill: "Woodcutting", requiredLevel: 10, baseUnits: 20 },
}

// ============================================================================
// Node Pool Definitions - mapped by distance
// ============================================================================

interface NodePoolConfig {
  nodeType: NodeType
  materialsPool: string[]
  probability: number // Probability of this location type existing in an area
}

/** Get node pools available at a given distance */
function getNodePoolsForDistance(distance: number): NodePoolConfig[] {
  if (distance === 0) return [] // TOWN has no gathering nodes

  // Each location type rolls independently with low probability
  // Spec: "Most rolls fail, so most areas are naturally sparse"
  // Spec: "Many areas have nothing, and that's ok"

  if (distance === 1) {
    return [
      {
        nodeType: NodeType.ORE_VEIN,
        materialsPool: ["STONE", "COPPER_ORE", "TIN_ORE"],
        probability: 0.25, // 25% chance of an ore vein
      },
      {
        nodeType: NodeType.TREE_STAND,
        materialsPool: ["GREEN_WOOD", "SOFTWOOD", "HARDWOOD"],
        probability: 0.25, // 25% chance of a tree stand
      },
    ]
  }

  if (distance === 2) {
    return [
      {
        nodeType: NodeType.ORE_VEIN,
        materialsPool: ["STONE", "COPPER_ORE", "TIN_ORE", "IRON_ORE", "SILVER_ORE"],
        probability: 0.25,
      },
      {
        nodeType: NodeType.TREE_STAND,
        materialsPool: ["GREEN_WOOD", "SOFTWOOD", "HARDWOOD", "OAK_WOOD", "IRONWOOD"],
        probability: 0.25,
      },
    ]
  }

  // distance 3+
  return [
    {
      nodeType: NodeType.ORE_VEIN,
      materialsPool: ["IRON_ORE", "SILVER_ORE", "DEEP_ORE", "MITHRIL_ORE"],
      probability: 0.2, // Slightly lower at higher distances
    },
    {
      nodeType: NodeType.TREE_STAND,
      materialsPool: ["OAK_WOOD", "IRONWOOD", "ANCIENT_WOOD", "SPIRITWOOD"],
      probability: 0.2,
    },
  ]
}

// ============================================================================
// Node Generation
// ============================================================================

function generateMaterialReserve(materialId: string, rng: RngState): MaterialReserve {
  const def = MATERIALS[materialId]
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

/**
 * Result of generating nodes for an area - includes both nodes and their locations
 */
export interface NodeGenerationResult {
  nodes: Node[]
  locations: ExplorationLocation[]
}

/**
 * Generate nodes for an area based on its distance.
 * Per spec: Each location type rolls independently for existence.
 * Most rolls fail, so most areas are naturally sparse.
 * Also generates corresponding ExplorationLocation entries for discovery tracking.
 */
export function generateNodesForArea(
  areaId: AreaID,
  distance: number,
  rng: RngState
): NodeGenerationResult {
  const pools = getNodePoolsForDistance(distance)
  if (pools.length === 0) return { nodes: [], locations: [] }

  const nodes: Node[] = []
  const locations: ExplorationLocation[] = []
  let nodeIndex = 0
  let locationIndex = 0

  // Roll for each location type independently
  for (const pool of pools) {
    const roll = rollFloat(rng, 0, 1, `location_roll_${areaId}_${pool.nodeType}`)
    if (roll < pool.probability) {
      // Success! Generate one node of this type
      const nodeId = `${areaId}-node-${nodeIndex}`
      nodes.push(generateNode(nodeId, areaId, pool, rng))
      nodeIndex++

      // Also create the corresponding ExplorationLocation
      const skillType: GatheringSkillID =
        pool.nodeType === NodeType.ORE_VEIN ? "Mining" : "Woodcutting"
      locations.push({
        id: `${areaId}-loc-${locationIndex}`,
        areaId,
        type: ExplorationLocationType.GATHERING_NODE,
        gatheringSkillType: skillType,
      })
      locationIndex++
    }
  }

  return { nodes, locations }
}

// ============================================================================
// World Factory
// ============================================================================

export function createWorld(seed: string): WorldState {
  const rng = createRng(seed)

  // Create TOWN as the only initial area
  const town: Area = {
    id: "TOWN",
    name: "Town",
    distance: 0,
    generated: true,
    locations: [],
    indexInDistance: 0,
  }

  // Create area placeholders for all possible areas (lazy generation)
  const areas = new Map<AreaID, Area>()
  areas.set("TOWN", town)

  // Create placeholders for areas at each distance
  // Using Fibonacci counts: distance 1 = 5 areas, distance 2 = 8, distance 3 = 13, etc.
  for (let distance = 1; distance <= 3; distance++) {
    const count = getAreaCountForDistance(distance)
    for (let i = 0; i < count; i++) {
      const placeholder = createAreaPlaceholder(distance, i)
      areas.set(placeholder.id, placeholder)
    }
  }

  // Generate connections between all areas
  const connections = generateAreaConnections(rng, town, Array.from(areas.values()))

  // Generate nodes and locations for all non-town areas
  const allNodes: Node[] = []
  for (const area of areas.values()) {
    if (area.id !== "TOWN") {
      const result = generateNodesForArea(area.id, area.distance, rng)
      allNodes.push(...result.nodes)
      // Populate the area's locations for discovery tracking
      area.locations = result.locations
    }
  }

  // Start knowing only TOWN
  const knownAreaIds = ["TOWN"]
  const knownConnectionIds: string[] = []

  return {
    time: {
      currentTick: 0,
      sessionRemainingTicks: 200,
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
      nodes: allNodes,
      enemies: [], // Enemies generated when areas are discovered
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
