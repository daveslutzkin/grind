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
  SkillID,
} from "./types.js"
import { NodeType, ExplorationLocationType } from "./types.js"
import { getNodeTypeName } from "./visibility.js"

// ============================================================================
// Location Generation Constants
// ============================================================================

/** Probability of generating a mob camp in an area */
const MOB_CAMP_PROBABILITY = 0.25

/** Standard deviation for mob difficulty offset (normally distributed) */
const MOB_DIFFICULTY_STD_DEV = 1.5 // ~95% of values within ±3

// ============================================================================
// Town Location IDs
// ============================================================================

export const TOWN_LOCATIONS = {
  MINERS_GUILD: "TOWN_MINERS_GUILD",
  FORESTERS_GUILD: "TOWN_FORESTERS_GUILD",
  COMBAT_GUILD: "TOWN_COMBAT_GUILD",
  SMITHING_GUILD: "TOWN_SMITHING_GUILD",
  WOODCRAFTERS_GUILD: "TOWN_WOODCRAFTERS_GUILD",
  EXPLORERS_GUILD: "TOWN_EXPLORERS_GUILD",
  WAREHOUSE: "TOWN_WAREHOUSE",
} as const

/** Display names for locations */
export const LOCATION_DISPLAY_NAMES: Record<string, string> = {
  [TOWN_LOCATIONS.MINERS_GUILD]: "Miners Guild",
  [TOWN_LOCATIONS.FORESTERS_GUILD]: "Foresters Guild",
  [TOWN_LOCATIONS.COMBAT_GUILD]: "Combat Guild",
  [TOWN_LOCATIONS.SMITHING_GUILD]: "Smithing Guild",
  [TOWN_LOCATIONS.WOODCRAFTERS_GUILD]: "Woodcrafters Guild",
  [TOWN_LOCATIONS.EXPLORERS_GUILD]: "Explorers Guild",
  [TOWN_LOCATIONS.WAREHOUSE]: "Warehouse",
}

/** Get display name for a location ID, or the ID itself if not found */
export function getLocationDisplayName(
  locationId: string | null,
  areaId?: string,
  state?: { exploration?: { areas: Map<string, Area> }; world?: { nodes?: Node[] } }
): string {
  if (locationId === null) {
    return areaId === "TOWN" ? "Town Square" : "Clearing"
  }

  // Check static location names first (town locations)
  if (LOCATION_DISPLAY_NAMES[locationId]) {
    return LOCATION_DISPLAY_NAMES[locationId]
  }

  // For gathering locations, try to find the corresponding node and use its type name
  if (state?.exploration && state?.world?.nodes) {
    // Extract area and location index from ID (e.g., "area-d1-i0-loc-0" -> ["area-d1-i0", "0"])
    const match = locationId.match(/^(.+)-loc-(\d+)$/)
    if (match) {
      const [, extractedAreaId, locIndex] = match
      const area = state.exploration.areas.get(extractedAreaId)
      if (area) {
        const location = area.locations.find((loc) => loc.id === locationId)
        if (location && location.type === ExplorationLocationType.GATHERING_NODE) {
          // Find the corresponding node
          const nodeId = `${extractedAreaId}-node-${locIndex}`
          const node = state.world.nodes.find((n) => n.nodeId === nodeId)
          if (node) {
            return getNodeTypeName(node.nodeType)
          }
        } else if (location && location.type === ExplorationLocationType.MOB_CAMP) {
          // For mob camps, use the creature type to generate a display name
          const creatureType = location.creatureType || "creature"
          const capitalizedType = creatureType.charAt(0).toUpperCase() + creatureType.slice(1)
          return `${capitalizedType} Camp`
        }
      }
    }
  }

  // Fallback to raw ID
  return locationId
}

/** Get the guild hall location ID for a skill type */
export function getGuildLocationForSkill(skill: SkillID): string {
  switch (skill) {
    case "Mining":
      return TOWN_LOCATIONS.MINERS_GUILD
    case "Woodcutting":
      return TOWN_LOCATIONS.FORESTERS_GUILD
    case "Combat":
      return TOWN_LOCATIONS.COMBAT_GUILD
    case "Smithing":
      return TOWN_LOCATIONS.SMITHING_GUILD
    case "Woodcrafting":
      return TOWN_LOCATIONS.WOODCRAFTERS_GUILD
    case "Exploration":
      return TOWN_LOCATIONS.EXPLORERS_GUILD
  }
}

/** Get the skill type for a guild hall location ID, or null if not a guild */
export function getSkillForGuildLocation(locationId: string | null): SkillID | null {
  switch (locationId) {
    case TOWN_LOCATIONS.MINERS_GUILD:
      return "Mining"
    case TOWN_LOCATIONS.FORESTERS_GUILD:
      return "Woodcutting"
    case TOWN_LOCATIONS.COMBAT_GUILD:
      return "Combat"
    case TOWN_LOCATIONS.SMITHING_GUILD:
      return "Smithing"
    case TOWN_LOCATIONS.WOODCRAFTERS_GUILD:
      return "Woodcrafting"
    case TOWN_LOCATIONS.EXPLORERS_GUILD:
      return "Exploration"
    default:
      return null
  }
}

import { createRng, rollFloat, rollNormal } from "./rng.js"
import {
  getAreaCountForDistance,
  createAreaPlaceholder,
  generateAreaConnections,
} from "./exploration.js"

/** Default guild hall level for town (high cap) */
const TOWN_GUILD_LEVEL = 100

/** Create all town locations (guild halls and warehouse) */
function createTownLocations(): ExplorationLocation[] {
  return [
    {
      id: TOWN_LOCATIONS.MINERS_GUILD,
      areaId: "TOWN",
      type: ExplorationLocationType.GUILD_HALL,
      guildType: "Mining",
      guildLevel: TOWN_GUILD_LEVEL,
    },
    {
      id: TOWN_LOCATIONS.FORESTERS_GUILD,
      areaId: "TOWN",
      type: ExplorationLocationType.GUILD_HALL,
      guildType: "Woodcutting",
      guildLevel: TOWN_GUILD_LEVEL,
    },
    {
      id: TOWN_LOCATIONS.COMBAT_GUILD,
      areaId: "TOWN",
      type: ExplorationLocationType.GUILD_HALL,
      guildType: "Combat",
      guildLevel: TOWN_GUILD_LEVEL,
    },
    {
      id: TOWN_LOCATIONS.SMITHING_GUILD,
      areaId: "TOWN",
      type: ExplorationLocationType.GUILD_HALL,
      guildType: "Smithing",
      guildLevel: TOWN_GUILD_LEVEL,
    },
    {
      id: TOWN_LOCATIONS.WOODCRAFTERS_GUILD,
      areaId: "TOWN",
      type: ExplorationLocationType.GUILD_HALL,
      guildType: "Woodcrafting",
      guildLevel: TOWN_GUILD_LEVEL,
    },
    {
      id: TOWN_LOCATIONS.EXPLORERS_GUILD,
      areaId: "TOWN",
      type: ExplorationLocationType.GUILD_HALL,
      guildType: "Exploration",
      guildLevel: TOWN_GUILD_LEVEL,
    },
    {
      id: TOWN_LOCATIONS.WAREHOUSE,
      areaId: "TOWN",
      type: ExplorationLocationType.WAREHOUSE,
    },
  ]
}

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
 * Also generates corresponding ExplorationLocation entries for discovery tracking,
 * including mob camps (which don't need nodes).
 *
 * This is the single source of truth for area content generation.
 */
export function generateNodesForArea(
  areaId: AreaID,
  distance: number,
  rng: RngState
): NodeGenerationResult {
  const pools = getNodePoolsForDistance(distance)
  if (distance === 0) return { nodes: [], locations: [] } // TOWN has no content

  const nodes: Node[] = []
  const locations: ExplorationLocation[] = []
  let nodeIndex = 0
  let locationIndex = 0

  // Roll for each gathering node type independently
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

  // Roll for mob camp (doesn't need a corresponding node)
  const mobRoll = rollFloat(rng, 0, 1, `location_roll_${areaId}_MOB_CAMP`)
  if (mobRoll < MOB_CAMP_PROBABILITY) {
    // Difficulty = area distance ± ~3 (normally distributed, stdDev 1.5 means ~95% within ±3)
    const difficultyOffset = Math.round(
      rollNormal(rng, 0, MOB_DIFFICULTY_STD_DEV, `mob_difficulty_${areaId}`)
    )
    locations.push({
      id: `${areaId}-loc-${locationIndex}`,
      areaId,
      type: ExplorationLocationType.MOB_CAMP,
      creatureType: "creature", // Placeholder - creature types TBD
      difficulty: Math.max(1, distance + difficultyOffset), // Minimum difficulty 1
    })
  }

  return { nodes, locations }
}

// ============================================================================
// World Factory
// ============================================================================

export function createWorld(seed: string): WorldState {
  const rng = createRng(seed)

  // Create TOWN as the only initial area with all guild halls and warehouse
  const townLocations = createTownLocations()
  const town: Area = {
    id: "TOWN",
    name: "Town",
    distance: 0,
    generated: true,
    locations: townLocations,
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

  // Start knowing only TOWN and all town locations
  const knownAreaIds = ["TOWN"]
  const knownLocationIds = townLocations.map((loc) => loc.id) // All town locations known from start
  const knownConnectionIds: string[] = []

  return {
    time: {
      currentTick: 0,
      sessionRemainingTicks: 20000,
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
      appraisedNodeIds: [],
    },

    world: {
      nodes: allNodes,
      recipes: [
        {
          id: "iron-bar-recipe",
          inputs: [{ itemId: "IRON_ORE", quantity: 2 }],
          output: { itemId: "IRON_BAR", quantity: 1 },
          craftTime: 3,
          guildType: "Smithing",
          requiredSkillLevel: 1,
        },
        {
          id: "copper-bar-recipe",
          inputs: [{ itemId: "COPPER_ORE", quantity: 2 }],
          output: { itemId: "COPPER_BAR", quantity: 1 },
          craftTime: 2,
          guildType: "Smithing",
          requiredSkillLevel: 1,
        },
      ],
      contracts: [
        {
          id: "miners-guild-1",
          level: 1,
          acceptLocationId: TOWN_LOCATIONS.MINERS_GUILD,
          guildType: "Mining",
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
        currentLocationId: null, // Start at Town Square (hub)
        knownAreaIds,
        knownLocationIds,
        knownConnectionIds,
        totalLuckDelta: 0,
        currentStreak: 0,
      },
    },

    rng,
  }
}
