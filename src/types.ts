// Core type definitions for the simulation engine

// ============================================================================
// String-based IDs (flexible, runtime-validated)
// ============================================================================

export type LocationID = string
export type ItemID = string
export type NodeID = string
export type MaterialID = string // Semantic alias for ItemID in gathering context

export type WeaponID = "CRUDE_WEAPON" | "IMPROVED_WEAPON"
export type SkillID = "Mining" | "Woodcutting" | "Combat" | "Smithing" | "Woodcrafting"
export type GatheringSkillID = "Mining" | "Woodcutting"
export type CraftingSkillID = "Smithing" | "Woodcrafting"
export type ContractID = string

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
// Location (expanded from simple LocationID)
// ============================================================================

export interface Location {
  id: LocationID
  name: string
  band: DistanceBand
  travelTicksFromTown: number
  nodePools: string[] // Node pool IDs for generation
  requiredGuildReputation: number | null // Hook for future guild-gating
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
  locationId: LocationID
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

export interface ResourceNode {
  id: string
  location: LocationID
  itemId: ItemID
  gatherTime: number
  successProbability: number
  requiredSkillLevel: number
  skillType: GatheringSkillID
}

export interface Enemy {
  id: string
  location: LocationID
  // TODO: fightTime and successProbability are currently unused - combat uses weapon stats instead.
  // Consider using these for enemy-specific modifiers or removing if weapon-only combat is intended.
  fightTime: number
  successProbability: number
  requiredSkillLevel: number
  lootTable: LootTableEntry[] // Weighted loot table - exactly one item drops per kill
  failureRelocation: LocationID
}

export interface Recipe {
  id: string
  inputs: ItemStack[]
  output: ItemStack
  craftTime: number
  requiredLocation: LocationID
  requiredSkillLevel: number
}

export interface KillRequirement {
  enemyId: string
  count: number
}

export interface Contract {
  id: ContractID
  guildLocation: LocationID
  requirements: ItemStack[]
  killRequirements?: KillRequirement[]
  rewards: ItemStack[]
  reputationReward: number
  xpReward?: { skill: SkillID; amount: number }
}

export interface RngState {
  seed: string
  counter: number
}

export interface WorldState {
  time: {
    currentTick: number
    sessionRemainingTicks: number
  }

  player: {
    location: LocationID
    inventory: ItemStack[]
    inventoryCapacity: number
    storage: ItemStack[]
    skills: Record<SkillID, SkillState>
    guildReputation: number
    activeContracts: ContractID[]
    equippedWeapon: WeaponID | null
    contractKillProgress: Record<ContractID, Record<string, number>>
  }

  world: {
    locations: LocationID[]
    travelCosts: Record<string, number> // "LOC1->LOC2" format
    resourceNodes: ResourceNode[]
    nodes?: Node[] // Multi-material nodes for gathering MVP
    enemies: Enemy[]
    recipes: Recipe[]
    contracts: Contract[]
    storageLocation: LocationID
  }

  rng: RngState
}

// Action types
export type ActionType =
  | "Move"
  | "AcceptContract"
  | "Gather"
  | "Fight"
  | "Craft"
  | "Store"
  | "Drop"
  | "Enrol"
  | "TurnInCombatToken"

export interface MoveAction {
  type: "Move"
  destination: LocationID
}

export interface AcceptContractAction {
  type: "AcceptContract"
  contractId: ContractID
}

export interface GatherAction {
  type: "Gather"
  nodeId: string
  mode?: GatherMode // Optional for backward compat; defaults to legacy behavior
  focusMaterialId?: MaterialID // Required for FOCUS mode
}

export interface FightAction {
  type: "Fight"
  enemyId: string
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
  skill: SkillID
}

export interface TurnInCombatTokenAction {
  type: "TurnInCombatToken"
}

export type Action =
  | MoveAction
  | AcceptContractAction
  | GatherAction
  | FightAction
  | CraftAction
  | StoreAction
  | DropAction
  | GuildEnrolmentAction
  | TurnInCombatTokenAction

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
  | "SESSION_ENDED"
  | "ALREADY_ENROLLED"
  | "MISSING_WEAPON"
  | "MISSING_FOCUS_MATERIAL"
  | "NODE_DEPLETED"
  | "MODE_NOT_UNLOCKED"

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
  xpGained?: { skill: SkillID; amount: number }
  levelUps?: LevelUp[]
}

// Extraction log for gathering actions
export interface ExtractionLog {
  mode: GatherMode
  focusMaterial?: MaterialID
  extracted: ItemStack[]
  focusWaste: number
  collateralDamage: Record<MaterialID, number>
  variance?: {
    expected: number
    actual: number
    range: [number, number]
  }
}

// Action log
export interface ActionLog {
  tickBefore: number
  actionType: ActionType
  parameters: Record<string, unknown>
  success: boolean
  failureType?: FailureType
  timeConsumed: number
  skillGained?: { skill: SkillID; amount: number }
  levelUps?: LevelUp[]
  contractsCompleted?: ContractCompletion[]
  rngRolls: RngRoll[]
  stateDeltaSummary: string
  extraction?: ExtractionLog // For gathering actions
  xpSource?: string // Attribution for future contract tracking
}

// Evaluation results
export interface ActionEvaluation {
  expectedTime: number
  expectedXP: number
  successProbability: number
}

export interface PlanViolation {
  actionIndex: number
  reason: string
}

export interface PlanEvaluation {
  expectedTime: number
  expectedXP: number
  violations: PlanViolation[]
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
