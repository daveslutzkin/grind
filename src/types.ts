// Core type definitions for the simulation engine

// ============================================================================
// String-based IDs (flexible, runtime-validated)
// ============================================================================

export type AreaID = string
export type LocationID = AreaID // Alias for backwards compatibility - areas ARE locations now
export type ItemID = string
export type NodeID = string
export type MaterialID = string // Semantic alias for ItemID in gathering context

export type WeaponID = "CRUDE_WEAPON" | "IMPROVED_WEAPON"
export type SkillID =
  | "Mining"
  | "Woodcutting"
  | "Combat"
  | "Smithing"
  | "Woodcrafting"
  | "Exploration"
export type GatheringSkillID = "Mining" | "Woodcutting"
export type CraftingSkillID = "Smithing" | "Woodcrafting"
export type ContractID = string

// ============================================================================
// Exploration Types (now the primary location system)
// ============================================================================

/**
 * Location types that can be discovered within an area
 */
export enum ExplorationLocationType {
  GATHERING_NODE = "GATHERING_NODE",
  MOB_CAMP = "MOB_CAMP",
  GUILD_HALL = "GUILD_HALL",
  WAREHOUSE = "WAREHOUSE",
}

/**
 * A discoverable location within an area
 */
export interface ExplorationLocation {
  id: string
  areaId: AreaID
  type: ExplorationLocationType
  // For GATHERING_NODE: which gathering skill type
  gatheringSkillType?: GatheringSkillID
  // For MOB_CAMP: creature type and difficulty
  creatureType?: string
  difficulty?: number // area distance ± 3, normally distributed around 0
  // For GUILD_HALL: guild affiliation and level cap
  guildType?: SkillID // Which guild this hall belongs to
  guildLevel?: number // Max contract/recipe level supported here (null = unlimited)
}

/**
 * A connection between two areas
 */
export interface AreaConnection {
  fromAreaId: AreaID
  toAreaId: AreaID
  travelTimeMultiplier: number // 0.5x-4.5x range for varied travel times (5t-45t with base 10t)
}

/**
 * An area in the exploration graph
 */
export interface Area {
  id: AreaID
  name?: string // Human-readable name (optional)
  distance: number // How far from town (town = distance 0)
  generated: boolean // Areas are generated when first discovered
  // Locations are discovered via Explore action
  locations: ExplorationLocation[]
  // Index within the distance band (for deterministic generation)
  indexInDistance: number
}

/**
 * Luck surfacing info for exploration actions
 */
export interface ExplorationLuckInfo {
  actualTicks: number
  expectedTicks: number
  luckDelta: number // expected - actual (positive = lucky)
  totalLuckDelta: number // Cumulative
  currentStreak: number // After this discovery
}

// ============================================================================
// Enums for gathering MVP
// ============================================================================

export enum DistanceBand {
  TOWN = "TOWN",
  NEAR = "NEAR",
  MID = "MID",
  FAR = "FAR",
}

export enum GatherMode {
  FOCUS = "FOCUS",
  CAREFUL_ALL = "CAREFUL_ALL",
  APPRAISE = "APPRAISE",
}

export enum NodeType {
  ORE_VEIN = "ORE_VEIN",
  TREE_STAND = "TREE_STAND",
}

// ============================================================================
// Multi-material nodes for gathering MVP
// ============================================================================

export interface MaterialReserve {
  materialId: MaterialID
  remainingUnits: number
  maxUnitsInitial: number
  requiresSkill: GatheringSkillID
  requiredLevel: number // Level needed to focus-extract
  tier: number // Affects XP multiplier and variance
  fragility?: number // Influences collateral damage (optional)
}

export interface Node {
  nodeId: NodeID
  nodeType: NodeType
  areaId: AreaID // Which area this node is in
  materials: MaterialReserve[]
  depleted: boolean
}

// Skill state with level and XP
export interface SkillState {
  level: number // starts at 1
  xp: number // XP within current level (toward next level)
}

// Level-up event
export interface LevelUp {
  skill: SkillID
  fromLevel: number
  toLevel: number
}

export interface ItemStack {
  itemId: ItemID
  quantity: number
}

export interface LootTableEntry {
  itemId: ItemID
  quantity: number
  weight: number // Relative weight for weighted random selection
  replacesItem?: ItemID // If set, removes this item when dropping
  autoEquip?: boolean // If true, auto-equip this item as a weapon
}

export interface Enemy {
  id: string
  areaId: AreaID // Which area this enemy is in
  // TODO: fightTime and successProbability are currently unused - combat uses weapon stats instead.
  // Consider using these for enemy-specific modifiers or removing if weapon-only combat is intended.
  fightTime: number
  successProbability: number
  requiredSkillLevel: number
  lootTable: LootTableEntry[] // Weighted loot table - exactly one item drops per kill
  failureAreaId: AreaID // Where player goes on combat failure
}

export interface Recipe {
  id: string
  inputs: ItemStack[]
  output: ItemStack
  craftTime: number
  guildType: CraftingSkillID // Must be at a guild hall of this type to craft
  requiredSkillLevel: number
}

export interface KillRequirement {
  enemyId: string
  count: number
}

export type ContractSlot = "at-level" | "aspirational"

export interface Contract {
  id: ContractID
  level: number // Contract level - determines which guild halls can offer it
  acceptLocationId: string // Specific location where this contract can be accepted
  guildType: SkillID // Can turn in at any guild hall of this type
  requirements: ItemStack[]
  killRequirements?: KillRequirement[]
  rewards: ItemStack[]
  reputationReward: number
  xpReward?: { skill: SkillID; amount: number }
  goldReward?: number // Gold reward for completing the contract
  slot?: ContractSlot // Which slot this contract fills (at-level or aspirational)
}

export interface RngState {
  seed: string
  counter: number
}

export interface WorldState {
  time: {
    currentTick: number
  }

  player: {
    inventory: ItemStack[]
    inventoryCapacity: number
    storage: ItemStack[]
    skills: Record<SkillID, SkillState>
    gold: number // Player's currency for contract rewards and purchases
    guildReputation: number
    activeContracts: ContractID[]
    equippedWeapon: WeaponID | null
    contractKillProgress: Record<ContractID, Record<string, number>>
    appraisedNodeIds: NodeID[] // Nodes that have been appraised (show full details)
    gatheringLuckDelta: number // Cumulative ticks saved/lost from gathering variance
  }

  world: {
    nodes: Node[] // Multi-material gathering nodes
    recipes: Recipe[]
    contracts: Contract[]
    storageAreaId: AreaID // Where storage is located (usually TOWN)
  }

  // Exploration system - THE location system
  exploration: {
    // All areas in the world (generated lazily when discovered)
    areas: Map<AreaID, Area>
    // All connections between areas
    connections: AreaConnection[]
    // Player's exploration progress
    playerState: {
      currentAreaId: AreaID
      currentLocationId: string | null // Which location within area (null = hub/clearing/town square)
      knownAreaIds: AreaID[] // Using array for serialization compatibility
      knownLocationIds: string[]
      knownConnectionIds: string[] // "areaId1->areaId2" format
      visitedLocationIds: string[] // Locations the player has actually been to (for knowledge tracking)
      // Luck tracking for surfacing
      totalLuckDelta: number
      currentStreak: number
    }
  }

  rng: RngState
}

// Helper to get current area ID from state
export function getCurrentAreaId(state: WorldState): AreaID {
  return state.exploration.playerState.currentAreaId
}

// Helper to get current location ID from state (null = hub/clearing/town square)
export function getCurrentLocationId(state: WorldState): string | null {
  return state.exploration.playerState.currentLocationId
}

// Helper to check if player is in town
export function isInTown(state: WorldState): boolean {
  return state.exploration.playerState.currentAreaId === "TOWN"
}

// Action types
export type ActionType =
  | "Move" // Alias for ExplorationTravel for backwards compat
  | "AcceptContract"
  | "Gather"
  | "Mine" // Alias for Gather at ORE_VEIN (resolves node by type)
  | "Chop" // Alias for Gather at TREE_STAND (resolves node by type)
  | "Fight"
  | "Craft"
  | "Store"
  | "Drop"
  | "Enrol"
  | "TurnInCombatToken"
  | "Survey"
  | "Explore"
  | "ExplorationTravel"
  | "FarTravel" // Multi-hop travel to any known reachable area
  | "TravelToLocation"
  | "Leave"

export interface MoveAction {
  type: "Move"
  destination: string // Raw destination string - engine resolves what it means
}

export interface AcceptContractAction {
  type: "AcceptContract"
  contractId: ContractID
}

export interface GatherAction {
  type: "Gather"
  nodeId?: string // Optional - engine infers from current area if not provided
  mode?: GatherMode // Optional for backward compat; defaults to legacy behavior
  focusMaterialId?: MaterialID // Required for FOCUS mode
}

/**
 * Mine action - alias for Gather that finds ORE_VEIN node by skill type
 * Uses Mining skill, resolves to Gather action at runtime
 */
export interface MineAction {
  type: "Mine"
  mode: GatherMode
  focusMaterialId?: MaterialID // Required for FOCUS mode
}

/**
 * Chop action - alias for Gather that finds TREE_STAND node by skill type
 * Uses Woodcutting skill, resolves to Gather action at runtime
 */
export interface ChopAction {
  type: "Chop"
  mode: GatherMode
  focusMaterialId?: MaterialID // Required for FOCUS mode
}

export interface FightAction {
  type: "Fight"
  // enemyId resolved from current location during execution
}

export interface CraftAction {
  type: "Craft"
  recipeId: string
}

export interface StoreAction {
  type: "Store"
  itemId: ItemID
  quantity: number
}

export interface DropAction {
  type: "Drop"
  itemId: ItemID
  quantity: number
}

export interface GuildEnrolmentAction {
  type: "Enrol"
  // skill resolved from current guild location during execution
}

export interface TurnInCombatTokenAction {
  type: "TurnInCombatToken"
}

/**
 * Survey action - discover a new area connected to current area
 */
export interface SurveyAction {
  type: "Survey"
  // No parameters - surveys from current area
}

/**
 * Explore action - discover a location or connection within current area
 */
export interface ExploreAction {
  type: "Explore"
  // No parameters - explores current area
}

/**
 * Travel action in exploration system - move between areas
 */
export interface ExplorationTravelAction {
  type: "ExplorationTravel"
  destinationAreaId: AreaID
  scavenge?: boolean // If true, 2x travel time but chance to find resources
}

/**
 * Far travel action - multi-hop travel to any known reachable area
 * Uses shortest path routing through known connections
 */
export interface FarTravelAction {
  type: "FarTravel"
  destinationAreaId: string // Raw destination string - engine resolves to area ID
  scavenge?: boolean // If true, 2x travel time but chance to find resources
}

/**
 * Travel to a location within the current area
 */
export interface TravelToLocationAction {
  type: "TravelToLocation"
  locationId: string // The location to travel to within current area
}

/**
 * Leave current location, returning to area hub (null)
 */
export interface LeaveAction {
  type: "Leave"
  // No parameters - leaves current location to go to null (town square / clearing)
}

export type Action =
  | MoveAction
  | AcceptContractAction
  | GatherAction
  | MineAction
  | ChopAction
  | FightAction
  | CraftAction
  | StoreAction
  | DropAction
  | GuildEnrolmentAction
  | TurnInCombatTokenAction
  | SurveyAction
  | ExploreAction
  | ExplorationTravelAction
  | FarTravelAction
  | TravelToLocationAction
  | LeaveAction

// ============================================================================
// Action Tick Types (for generator-based execution)
// ============================================================================

/**
 * Structured feedback that can occur during a tick.
 * UI layer formats these for display.
 */
export interface TickFeedback {
  // Combat feedback
  damage?: {
    target: "player" | "enemy"
    amount: number
    enemyHpRemaining?: number
    playerHpRemaining?: number
  }
  combatMiss?: { attacker: "player" | "enemy" }
  combatVictory?: { enemyId: string }
  combatDefeat?: { enemyId: string }

  // Gathering feedback
  gathered?: { itemId: string; quantity: number }
  gatheringComplete?: {
    nodeId: string
    totalItems: Array<{ itemId: string; quantity: number }>
  }

  // Exploration feedback (migrate from current system)
  discovered?: {
    type: "location" | "connection" | "area"
    name: string
    id: string
  }

  // Crafting feedback
  crafted?: { itemId: string; quantity: number }
  materialsConsumed?: Array<{ itemId: string; quantity: number }>

  // General feedback
  xpGained?: { skill: SkillID; amount: number }
  message?: string // Fallback for simple messages
}

/**
 * A single tick yielded by an action generator.
 * Discriminated union: either an in-progress tick or the final done tick.
 */
export type ActionTick = { done: false; feedback?: TickFeedback } | { done: true; log: ActionLog }

/**
 * The generator type returned by action executors.
 */
export type ActionGenerator = AsyncGenerator<ActionTick, void, undefined>

/**
 * Structured failure information with context for generating helpful hints
 */
export interface FailureDetails {
  type: FailureType
  reason?: string // Sub-reason e.g., "undiscovered", "level_too_low"
  context?: Record<string, unknown> // Dynamic context e.g., { destination: "Silvermark Ridge", required: 15, current: 10 }
}

// Failure types
export type FailureType =
  | "INSUFFICIENT_SKILL"
  | "WRONG_LOCATION"
  | "MISSING_ITEMS"
  | "INVENTORY_FULL"
  | "GATHER_FAILURE"
  | "COMBAT_FAILURE"
  | "CONTRACT_NOT_FOUND"
  | "ALREADY_HAS_CONTRACT"
  | "NODE_NOT_FOUND"
  | "ENEMY_NOT_FOUND"
  | "RECIPE_NOT_FOUND"
  | "ITEM_NOT_FOUND"
  | "ALREADY_ENROLLED"
  | "MISSING_WEAPON"
  | "MISSING_FOCUS_MATERIAL"
  | "NODE_DEPLETED"
  | "MODE_NOT_UNLOCKED"
  // Exploration failure types
  | "AREA_NOT_FOUND"
  | "AREA_NOT_KNOWN"
  | "NO_PATH_TO_DESTINATION"
  | "ALREADY_IN_AREA"
  | "NO_UNDISCOVERED_AREAS"
  | "AREA_FULLY_EXPLORED"
  | "NOT_IN_EXPLORATION_GUILD"
  | "NO_CONNECTIONS"
  | "LOCATION_NOT_DISCOVERED"
  | "UNKNOWN_LOCATION"
  // Location-based action failure types
  | "ALREADY_AT_LOCATION"
  | "NOT_AT_HUB"
  | "ALREADY_AT_HUB"
  | "NOT_AT_NODE_LOCATION"
  | "WRONG_GUILD_TYPE"
  | "GUILD_LEVEL_TOO_LOW"
  // Canonical gathering failure types
  | "NOT_ENROLLED"
  | "MATERIAL_NOT_UNLOCKED"
  | "NO_CAREFUL_MATERIALS"

// RNG roll log entry
export interface RngRoll {
  label: string
  probability: number
  result: boolean
  rngCounter: number
}

// Contract completion info
export interface ContractCompletion {
  contractId: ContractID
  itemsConsumed: ItemStack[]
  rewardsGranted: ItemStack[]
  reputationGained: number
  goldEarned?: number // Gold reward from mining contracts
  xpGained?: { skill: SkillID; amount: number }
  levelUps?: LevelUp[]
}

// Appraisal info returned from APPRAISE mode
export interface AppraisalInfo {
  nodeId: NodeID
  nodeType: NodeType
  materials: {
    materialId: MaterialID
    remaining?: number // Only shown if player has Appraise mastery (M6) for this material
    max?: number // Only shown if player has Appraise mastery (M6) for this material
    requiredLevel: number
    requiresSkill: GatheringSkillID
    tier: number
    canSeeQuantity: boolean // True if player has Appraise mastery (M6) for this material
  }[]
}

// Extraction log for gathering actions
export interface ExtractionLog {
  mode: GatherMode
  focusMaterial?: MaterialID
  extracted: ItemStack[]
  discardedItems?: ItemStack[] // Items that couldn't fit in inventory
  focusWaste: number
  collateralDamage: Record<MaterialID, number>
  variance?: {
    expected: number // Base time without variance
    actual: number // Actual time with variance applied
    range: [number, number] // For yield variance (bonus yield)
    luckDelta?: number // Ticks saved (positive) or lost (negative) from time variance
  }
  appraisal?: AppraisalInfo // For APPRAISE mode
}

/**
 * Log info for exploration actions (Survey, Explore)
 */
export interface ExplorationLog {
  // What was discovered
  discoveredAreaId?: AreaID
  discoveredLocationId?: string
  discoveredConnectionId?: string // "areaId1->areaId2" format
  connectionToUnknownArea?: boolean // True if connection leads to an unknown area
  // Whether the area is fully explored
  areaFullyExplored?: boolean
  // Bonus XP for fully discovering an area (equals distance from town)
  discoveryBonusXP?: number
  // Luck surfacing per RNG canon
  luckInfo?: ExplorationLuckInfo
}

// Action log
export interface ActionLog {
  tickBefore: number
  actionType: ActionType
  parameters: Record<string, unknown>
  success: boolean
  // failureType was removed in Package 9 cleanup - use failureDetails.type instead
  failureDetails?: FailureDetails // Structured failure info with context for helpful hints
  timeConsumed: number
  skillGained?: { skill: SkillID; amount: number }
  levelUps?: LevelUp[]
  contractsCompleted?: ContractCompletion[]
  rngRolls: RngRoll[]
  stateDeltaSummary: string
  extraction?: ExtractionLog // For gathering actions
  xpSource?: string // Attribution for future contract tracking
  explorationLog?: ExplorationLog // For exploration actions
}

// Level calculation utilities
// XP required to reach level N is N²
// Level 1 → 2 requires 4 XP (2²)
// Level 2 → 3 requires 9 XP (3²)
// Level 3 → 4 requires 16 XP (4²)

/**
 * Get XP threshold to reach the next level from current level
 * To go from level N to level N+1, you need (N+1)² XP
 */
export function getXPThresholdForNextLevel(currentLevel: number): number {
  return (currentLevel + 1) * (currentLevel + 1)
}

/**
 * Add XP to a skill and handle level-ups
 * Returns the updated skill state and any level-ups that occurred
 */
export function addXPToSkill(
  skill: SkillState,
  xpGain: number
): { skill: SkillState; levelUps: LevelUp[]; skillId?: SkillID } {
  const levelUps: LevelUp[] = []
  let { level, xp } = skill
  xp += xpGain

  // Check for level-ups (can be multiple)
  let threshold = getXPThresholdForNextLevel(level)
  while (xp >= threshold) {
    const fromLevel = level
    xp -= threshold
    level++
    levelUps.push({ skill: "" as SkillID, fromLevel, toLevel: level }) // skillId filled in by caller
    threshold = getXPThresholdForNextLevel(level)
  }

  return { skill: { level, xp }, levelUps }
}

/**
 * Get total XP earned for a skill (level + current XP)
 * This is the sum of all thresholds passed plus current XP
 */
export function getTotalXP(skill: SkillState): number {
  let total = skill.xp
  for (let l = 1; l < skill.level; l++) {
    total += getXPThresholdForNextLevel(l)
  }
  return total
}

// ============================================================================
// Save/Resume Constants
// ============================================================================

/**
 * Save file version - increment when save format changes
 */
export const SAVE_VERSION = 1
