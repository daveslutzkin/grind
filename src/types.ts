// Core type definitions for the simulation engine

export type LocationID = "TOWN" | "MINE" | "FOREST"
export type ItemID =
  | "IRON_ORE"
  | "WOOD_LOG"
  | "IRON_BAR"
  | "CRUDE_WEAPON"
  | "IMPROVED_WEAPON"
  | "COMBAT_GUILD_TOKEN"

export type WeaponID = "CRUDE_WEAPON" | "IMPROVED_WEAPON"
export type SkillID = "Mining" | "Woodcutting" | "Combat" | "Smithing"
export type GatheringSkillID = "Mining" | "Woodcutting"
export type ContractID = string

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
  fightTime: number
  successProbability: number
  requiredSkillLevel: number
  loot: ItemStack[]
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
  expectedLevels: Record<SkillID, number> // Expected level gains per skill
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

/**
 * Create initial skill state (level 0, 0 XP)
 * Skills start at level 0 and must be unlocked via GuildEnrolment
 */
export function createInitialSkillState(): SkillState {
  return { level: 0, xp: 0 }
}
