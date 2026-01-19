/**
 * Session Types
 *
 * Structured data types for the GameSession abstraction.
 * These types provide UI-agnostic representations of game state and command results,
 * allowing different UIs (REPL, Agent, Web) to format them as needed.
 */

import type {
  AreaID,
  ItemStack,
  SkillID,
  ContractID,
  NodeType,
  ActionLog,
  Action,
  GatherMode,
} from "../types.js"

// ============================================================================
// Location Information
// ============================================================================

export interface LocationInfo {
  areaId: AreaID
  areaName: string
  areaDistance: number
  locationId: string | null // null = at hub/clearing
  locationName: string
  isInTown: boolean
  // Note: No "undiscovered" status - player's current location is always discovered.
  // See ConnectionInfo.explorationStatus for areas that may be undiscovered.
  // Returns null if player doesn't have Exploration skill (can't see exploration status).
  explorationStatus: "unexplored" | "partly explored" | "fully explored" | null
}

// ============================================================================
// Inventory & Storage
// ============================================================================

export interface InventoryInfo {
  items: ItemStack[]
  capacity: number
  used: number
}

export interface StorageInfo {
  items: ItemStack[]
}

// ============================================================================
// Skills
// ============================================================================

export interface SkillInfo {
  id: SkillID
  level: number
  xp: number
  xpToNextLevel: number
  isEnrolled: boolean
  unlockedModes?: GatherMode[] // For gathering skills
}

// ============================================================================
// Contracts
// ============================================================================

export interface ContractRequirement {
  itemId: string
  quantity: number
  currentQuantity: number // How many player has
}

export interface ContractReward {
  itemId?: string
  quantity?: number
  gold?: number
  reputation: number
  xp?: { skill: SkillID; amount: number }
}

export interface ContractInfo {
  id: ContractID
  level: number
  guildType: SkillID
  requirements: ContractRequirement[]
  rewards: ContractReward
  isActive: boolean
  isComplete: boolean // Requirements are met
  acceptLocationId: string
  acceptLocationName: string
}

// ============================================================================
// Exploration
// ============================================================================

export interface ConnectionInfo {
  toAreaId: AreaID
  toAreaName: string
  travelTime: number
  // Includes "undiscovered" for areas the player knows about but hasn't visited.
  // Compare to LocationInfo.explorationStatus which excludes "undiscovered".
  // Returns null if player doesn't have Exploration skill.
  explorationStatus: "undiscovered" | "unexplored" | "partly explored" | "fully explored" | null
  relativeDistance: "closer" | "same" | "further"
}

export interface NodeMaterialInfo {
  materialId: string
  materialName: string
  requiredLevel: number
  remainingUnits?: number // Only shown if appraised
  maxUnits?: number // Only shown if appraised
  canGather: boolean // Player has required level
  isVisible: boolean // Player can see this material
}

export interface GatheringNodeInfo {
  nodeId: string
  nodeType: NodeType
  nodeName: string
  locationId: string
  areaId: AreaID
  materials: NodeMaterialInfo[]
  isAppraised: boolean
  isDepleted: boolean
}

export interface ExplorationInfo {
  connections: ConnectionInfo[]
  knownGatheringNodes: GatheringNodeInfo[]
  hasUndiscoveredAreas: boolean
  hasUndiscoveredLocations: boolean
  worldMap: WorldMapInfo
}

// ============================================================================
// World Map (for full-screen map view)
// ============================================================================

export interface WorldMapAreaInfo {
  areaId: AreaID
  areaName: string
  distance: number // Distance from town (0 = town)
  // Returns null if player doesn't have Exploration skill.
  explorationStatus: "undiscovered" | "unexplored" | "partly explored" | "fully explored" | null
}

export interface WorldMapConnectionInfo {
  fromAreaId: AreaID
  toAreaId: AreaID
}

export interface WorldMapInfo {
  areas: WorldMapAreaInfo[]
  connections: WorldMapConnectionInfo[]
}

// ============================================================================
// Time
// ============================================================================

export interface TimeInfo {
  currentTick: number
  gatheringLuckDelta: number // Cumulative luck from gathering time variance
}

// ============================================================================
// Game State Snapshot
// ============================================================================

/**
 * Complete structured representation of the game state.
 * Used by UIs to render current state without needing to format text.
 */
export interface GameStateSnapshot {
  location: LocationInfo
  inventory: InventoryInfo
  storage: StorageInfo
  skills: SkillInfo[]
  contracts: ContractInfo[]
  exploration: ExplorationInfo
  time: TimeInfo
  gold: number
  guildReputation: number
}

// ============================================================================
// Command Execution
// ============================================================================

/**
 * Progress update during command execution.
 * Used for streaming updates to the UI during multi-tick actions.
 */
export interface CommandTick {
  type: "progress" | "feedback"
  ticksElapsed?: number
  totalTicks?: number
  message?: string
  // Structured feedback for specific action types
  gathered?: { itemId: string; quantity: number }
  discovered?: { type: "location" | "connection" | "area"; name: string }
  xpGained?: { skill: SkillID; amount: number }
}

/**
 * Result of executing a command.
 * Distinguish from CommandTick by checking for the presence of 'log'.
 */
export interface CommandResult {
  success: boolean
  log: ActionLog
  stateAfter: GameStateSnapshot
}

// ============================================================================
// Valid Actions
// ============================================================================

/**
 * An action that can be performed in the current state.
 * Extends AvailableAction with the actual Action object for execution.
 */
export interface ValidAction {
  displayName: string
  command: string // The command string to execute (e.g., "mine stone")
  action: Action // The parsed action object
  timeCost: number
  isVariable: boolean
  successProbability: number
}
