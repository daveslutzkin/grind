/**
 * Session Module
 *
 * Exports the GameSession class and related types for unified game state management.
 */

export { GameSession } from "./GameSession.js"

export type {
  GameStateSnapshot,
  CommandTick,
  CommandResult,
  ValidAction,
  LocationInfo,
  InventoryInfo,
  StorageInfo,
  SkillInfo,
  ContractInfo,
  ExplorationInfo,
  TimeInfo,
  ConnectionInfo,
  GatheringNodeInfo,
  NodeMaterialInfo,
  ContractRequirement,
  ContractReward,
} from "./types.js"
