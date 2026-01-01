// Core type definitions for the simulation engine

export type LocationID = 'TOWN' | 'MINE' | 'FOREST';
export type ItemID = 'IRON_ORE' | 'WOOD_LOG' | 'IRON_BAR';
export type SkillID = 'Travel' | 'Gathering' | 'Combat' | 'Crafting' | 'Logistics';
export type ContractID = string;

export interface ItemStack {
  itemId: ItemID;
  quantity: number;
}

export interface ResourceNode {
  id: string;
  location: LocationID;
  itemId: ItemID;
  gatherTime: number;
  successProbability: number;
  requiredSkillLevel: number;
}

export interface Enemy {
  id: string;
  location: LocationID;
  fightTime: number;
  successProbability: number;
  requiredSkillLevel: number;
  loot: ItemStack[];
  failureRelocation: LocationID;
}

export interface Recipe {
  id: string;
  inputs: ItemStack[];
  output: ItemStack;
  craftTime: number;
  requiredLocation: LocationID;
  requiredSkillLevel: number;
}

export interface Contract {
  id: ContractID;
  guildLocation: LocationID;
  requirements: ItemStack[];
  rewards: ItemStack[];
  reputationReward: number;
}

export interface RngState {
  seed: string;
  counter: number;
}

export interface WorldState {
  time: {
    currentTick: number;
    sessionRemainingTicks: number;
  };

  player: {
    location: LocationID;
    inventory: ItemStack[];
    inventoryCapacity: number;
    storage: ItemStack[];
    skills: Record<SkillID, number>;
    guildReputation: number;
    activeContracts: ContractID[];
  };

  world: {
    locations: LocationID[];
    travelCosts: Record<string, number>; // "LOC1->LOC2" format
    resourceNodes: ResourceNode[];
    enemies: Enemy[];
    recipes: Recipe[];
    contracts: Contract[];
    storageLocation: LocationID;
    storageRequiredSkillLevel: number;
  };

  rng: RngState;
}

// Action types
export type ActionType = 'Move' | 'AcceptContract' | 'Gather' | 'Fight' | 'Craft' | 'Store' | 'Drop';

export interface MoveAction {
  type: 'Move';
  destination: LocationID;
}

export interface AcceptContractAction {
  type: 'AcceptContract';
  contractId: ContractID;
}

export interface GatherAction {
  type: 'Gather';
  nodeId: string;
}

export interface FightAction {
  type: 'Fight';
  enemyId: string;
}

export interface CraftAction {
  type: 'Craft';
  recipeId: string;
}

export interface StoreAction {
  type: 'Store';
  itemId: ItemID;
  quantity: number;
}

export interface DropAction {
  type: 'Drop';
  itemId: ItemID;
  quantity: number;
}

export type Action =
  | MoveAction
  | AcceptContractAction
  | GatherAction
  | FightAction
  | CraftAction
  | StoreAction
  | DropAction;

// Failure types
export type FailureType =
  | 'INSUFFICIENT_SKILL'
  | 'WRONG_LOCATION'
  | 'MISSING_ITEMS'
  | 'INVENTORY_FULL'
  | 'RNG_FAILURE'
  | 'CONTRACT_NOT_FOUND'
  | 'ALREADY_HAS_CONTRACT'
  | 'NODE_NOT_FOUND'
  | 'ENEMY_NOT_FOUND'
  | 'RECIPE_NOT_FOUND'
  | 'ITEM_NOT_FOUND'
  | 'SESSION_ENDED';

// RNG roll log entry
export interface RngRoll {
  label: string;
  probability: number;
  result: boolean;
  rngCounter: number;
}

// Action log
export interface ActionLog {
  tickBefore: number;
  actionType: ActionType;
  parameters: Record<string, unknown>;
  success: boolean;
  failureType?: FailureType;
  timeConsumed: number;
  skillGained?: { skill: SkillID; amount: number };
  rngRolls: RngRoll[];
  stateDeltaSummary: string;
}

// Evaluation results
export interface ActionEvaluation {
  expectedTime: number;
  expectedXP: number;
  successProbability: number;
}

export interface PlanViolation {
  actionIndex: number;
  reason: string;
}

export interface PlanEvaluation {
  expectedTime: number;
  expectedXP: number;
  violations: PlanViolation[];
}
