/**
 * GameSession
 *
 * Unified interface for game state management, command execution, and persistence.
 * Used by REPL, Agent, and Web UIs to interact with the game engine.
 */

import type { WorldState, ActionLog, Action, SkillID } from "../types.js"
import {
  getCurrentAreaId,
  getCurrentLocationId,
  isInTown,
  getXPThresholdForNextLevel,
  GatherMode,
} from "../types.js"
import { createWorld } from "../world.js"
import { getActionGenerator, executeToCompletion } from "../engine.js"
import { parseAction, type ParseContext } from "../runner.js"
import { getAvailableActions, type AvailableAction } from "../availableActions.js"
import { getLocationDisplayName } from "../world.js"
import { getAreaDisplayName, BASE_TRAVEL_TIME } from "../exploration.js"
import { getUnlockedModes } from "../actionChecks.js"
import { deserializeSession, type SaveFile } from "../persistence.js"
import { SAVE_VERSION } from "../types.js"
import type { SessionStats } from "../runner.js"
import type {
  GameStateSnapshot,
  CommandResult,
  CommandTick,
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
import { getVisibleMaterials } from "../visibility.js"
import { nodeIdToLocationId } from "../contracts.js"

export class GameSession {
  private state: WorldState
  private stats: SessionStats
  private seed: string

  private constructor(state: WorldState, stats: SessionStats, seed: string) {
    this.state = state
    this.stats = stats
    this.seed = seed
  }

  /**
   * Create a new game session with the given seed.
   */
  static create(seed: string): GameSession {
    const state = createWorld(seed)
    const stats: SessionStats = {
      logs: [],
      startingSkills: { ...state.player.skills },
      sessionStartLogIndex: 0,
    }
    return new GameSession(state, stats, seed)
  }

  /**
   * Create a session from a saved state JSON string.
   */
  static fromSavedState(json: string): GameSession {
    const save: SaveFile = JSON.parse(json)
    const { state, stats } = deserializeSession(save)
    return new GameSession(state, stats, save.seed)
  }

  /**
   * Get the session ID (seed).
   */
  getSessionId(): string {
    return this.seed
  }

  /**
   * Get the number of elapsed ticks.
   */
  getElapsedTicks(): number {
    return this.state.time.currentTick
  }

  /**
   * Get the current game state as a structured snapshot.
   */
  getState(): GameStateSnapshot {
    return this.buildStateSnapshot()
  }

  /**
   * Get the list of valid actions in the current state.
   */
  getValidActions(): ValidAction[] {
    const available = getAvailableActions(this.state)
    return available.map((action) => this.convertToValidAction(action))
  }

  /**
   * Execute a command and return the result.
   * This is the simple synchronous-feeling API that waits for completion.
   */
  async executeCommand(command: string): Promise<CommandResult> {
    const action = this.parseCommand(command)

    if (!action) {
      // Return a failure result for invalid commands
      const failureLog: ActionLog = {
        tickBefore: this.state.time.currentTick,
        actionType: "Unknown",
        parameters: { command },
        success: false,
        failureDetails: { type: "INVALID_COMMAND", reason: "Could not parse command" },
        timeConsumed: 0,
        rngRolls: [],
        stateDeltaSummary: "Invalid command",
      }

      return {
        success: false,
        log: failureLog,
        stateAfter: this.buildStateSnapshot(),
      }
    }

    return this.executeAction(action)
  }

  /**
   * Execute an Action directly (without parsing from a command string).
   * Use this when you already have an Action object (e.g., from the Agent).
   */
  async executeAction(action: Action): Promise<CommandResult> {
    const generator = getActionGenerator(this.state, action)
    const log = await executeToCompletion(generator)
    this.stats.logs.push(log)

    return {
      success: log.success,
      log,
      stateAfter: this.buildStateSnapshot(),
    }
  }

  /**
   * Execute a command with progress updates.
   * Yields CommandTick objects during execution for UI updates.
   */
  async *executeCommandWithProgress(
    command: string
  ): AsyncGenerator<CommandTick | CommandResult, void, undefined> {
    const action = this.parseCommand(command)

    if (!action) {
      const failureLog: ActionLog = {
        tickBefore: this.state.time.currentTick,
        actionType: "Unknown",
        parameters: { command },
        success: false,
        failureDetails: { type: "INVALID_COMMAND", reason: "Could not parse command" },
        timeConsumed: 0,
        rngRolls: [],
        stateDeltaSummary: "Invalid command",
      }

      yield {
        success: false,
        log: failureLog,
        stateAfter: this.buildStateSnapshot(),
      }
      return
    }

    const generator = getActionGenerator(this.state, action)
    let ticksElapsed = 0

    for await (const tick of generator) {
      if (tick.done) {
        // Final result
        this.stats.logs.push(tick.log)
        yield {
          success: tick.log.success,
          log: tick.log,
          stateAfter: this.buildStateSnapshot(),
        }
      } else {
        // Progress tick
        ticksElapsed++
        const commandTick: CommandTick = {
          type: tick.feedback ? "feedback" : "progress",
          ticksElapsed,
          message: tick.feedback?.message,
        }

        if (tick.feedback?.gathered) {
          commandTick.gathered = tick.feedback.gathered
        }
        if (tick.feedback?.discovered) {
          commandTick.discovered = tick.feedback.discovered
        }
        if (tick.feedback?.xpGained) {
          commandTick.xpGained = tick.feedback.xpGained
        }

        yield commandTick
      }
    }
  }

  /**
   * Serialize the session to a JSON string.
   */
  serialize(): string {
    const save: SaveFile = {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      seed: this.seed,
      state: {
        ...this.state,
        exploration: {
          ...this.state.exploration,
          areas: Object.fromEntries(this.state.exploration.areas),
        },
      },
      stats: this.stats,
    }
    return JSON.stringify(save)
  }

  /**
   * Get the raw WorldState (for advanced use cases like formatters).
   */
  getRawState(): WorldState {
    return this.state
  }

  /**
   * Get the session stats (for advanced use cases).
   */
  getStats(): SessionStats {
    return this.stats
  }

  /**
   * Get a Session-compatible object for use with existing persistence functions.
   * This provides backwards compatibility with code that expects the Session type.
   */
  toSession(): { state: WorldState; stats: SessionStats } {
    return { state: this.state, stats: this.stats }
  }

  /**
   * Update internal state from a Session object (for resuming from save).
   * Used when integrating with existing persistence code.
   */
  static fromSession(state: WorldState, stats: SessionStats, seed: string): GameSession {
    return new GameSession(state, stats, seed)
  }

  /**
   * Parse a command string into an Action.
   * Returns null if the command cannot be parsed.
   */
  parseCommand(command: string): Action | null {
    const trimmed = command.trim()
    if (!trimmed) return null

    // Include both visited areas and reachable areas (via known connections)
    const currentArea = this.state.exploration.playerState.currentAreaId
    const reachableAreas = new Set(this.state.exploration.playerState.knownAreaIds)
    for (const connId of this.state.exploration.playerState.knownConnectionIds) {
      const [from, to] = connId.split("->")
      if (from === currentArea) reachableAreas.add(to)
      if (to === currentArea) reachableAreas.add(from)
    }

    const context: ParseContext = {
      knownAreaIds: Array.from(reachableAreas),
      currentLocationId: getCurrentLocationId(this.state),
      state: this.state,
    }

    return parseAction(trimmed, context)
  }

  /**
   * Record an action log from external execution (e.g., interactive handlers).
   * Use this when actions are executed outside of executeCommand().
   */
  recordLog(log: ActionLog): void {
    this.stats.logs.push(log)
  }

  /**
   * Record multiple action logs from external execution.
   */
  recordLogs(logs: ActionLog[]): void {
    for (const log of logs) {
      this.stats.logs.push(log)
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  private convertToValidAction(available: AvailableAction): ValidAction {
    // Parse the display name to get a command string
    const command = available.displayName

    // Try to parse the action from the display name
    // For actions with placeholders like "go <location>", we'll use a simplified action
    const context: ParseContext = {
      knownAreaIds: Array.from(this.state.exploration.playerState.knownAreaIds),
      currentLocationId: getCurrentLocationId(this.state),
      state: this.state,
    }

    const action = parseAction(command, context) ?? { type: "Move" as const, destination: "" }

    return {
      displayName: available.displayName,
      command,
      action,
      timeCost: available.timeCost,
      isVariable: available.isVariable,
      successProbability: available.successProbability,
    }
  }

  private buildStateSnapshot(): GameStateSnapshot {
    return {
      location: this.buildLocationInfo(),
      inventory: this.buildInventoryInfo(),
      storage: this.buildStorageInfo(),
      skills: this.buildSkillsInfo(),
      contracts: this.buildContractsInfo(),
      exploration: this.buildExplorationInfo(),
      time: this.buildTimeInfo(),
      gold: this.state.player.gold,
      guildReputation: this.state.player.guildReputation,
    }
  }

  private buildLocationInfo(): LocationInfo {
    const areaId = getCurrentAreaId(this.state)
    const locationId = getCurrentLocationId(this.state)
    const area = this.state.exploration.areas.get(areaId)
    const inTown = isInTown(this.state)

    return {
      areaId,
      areaName: getAreaDisplayName(areaId, area),
      areaDistance: area?.distance ?? 0,
      locationId,
      locationName: getLocationDisplayName(locationId, areaId, this.state),
      isInTown: inTown,
      explorationStatus: this.getExplorationStatus(areaId),
    }
  }

  private getExplorationStatus(
    areaId: string
  ): "unexplored" | "partly explored" | "fully explored" {
    const area = this.state.exploration.areas.get(areaId)
    if (!area) return "unexplored"

    const knownLocationIds = this.state.exploration.playerState.knownLocationIds
    const knownConnectionIds = new Set(this.state.exploration.playerState.knownConnectionIds)

    const knownLocs = area.locations.filter((loc) => knownLocationIds.includes(loc.id)).length
    const totalLocs = area.locations.length

    // Count known connections from this area
    const connectionsFromArea = this.state.exploration.connections.filter(
      (conn) => conn.fromAreaId === areaId || conn.toAreaId === areaId
    )
    const knownConns = connectionsFromArea.filter((conn) => {
      const fwd = `${conn.fromAreaId}->${conn.toAreaId}`
      const rev = `${conn.toAreaId}->${conn.fromAreaId}`
      return knownConnectionIds.has(fwd) || knownConnectionIds.has(rev)
    }).length
    const totalConns = connectionsFromArea.length

    if (knownLocs === 0 && knownConns <= 1) {
      return "unexplored"
    } else if (knownLocs === totalLocs && knownConns === totalConns) {
      return "fully explored"
    } else {
      return "partly explored"
    }
  }

  private buildInventoryInfo(): InventoryInfo {
    return {
      items: [...this.state.player.inventory],
      capacity: this.state.player.inventoryCapacity,
      used: this.state.player.inventory.length,
    }
  }

  private buildStorageInfo(): StorageInfo {
    return {
      items: [...this.state.player.storage],
    }
  }

  private buildSkillsInfo(): SkillInfo[] {
    const skillIds: SkillID[] = [
      "Mining",
      "Woodcutting",
      "Combat",
      "Exploration",
      "Smithing",
      "Woodcrafting",
    ]

    return skillIds.map((id) => {
      const skill = this.state.player.skills[id]
      const isEnrolled = skill.level > 0

      const info: SkillInfo = {
        id,
        level: skill.level,
        xp: skill.xp,
        xpToNextLevel: isEnrolled ? getXPThresholdForNextLevel(skill.level) : 0,
        isEnrolled,
      }

      // Add unlocked modes for gathering skills
      if ((id === "Mining" || id === "Woodcutting") && isEnrolled) {
        info.unlockedModes = getUnlockedModes(skill.level).map((m) => m as GatherMode)
      }

      return info
    })
  }

  private buildContractsInfo(): ContractInfo[] {
    const contracts: ContractInfo[] = []

    for (const contract of this.state.world.contracts) {
      const isActive = this.state.player.activeContracts.includes(contract.id)

      // Check if requirements are met
      let isComplete = true
      const requirements: ContractRequirement[] = contract.requirements.map((req) => {
        const invItem = this.state.player.inventory.find((i) => i.itemId === req.itemId)
        const currentQuantity = invItem?.quantity ?? 0
        if (currentQuantity < req.quantity) {
          isComplete = false
        }
        return {
          itemId: req.itemId,
          quantity: req.quantity,
          currentQuantity,
        }
      })

      const rewards: ContractReward = {
        gold: contract.goldReward,
        reputation: contract.reputationReward,
        xp: contract.xpReward,
      }
      if (contract.rewards.length > 0) {
        rewards.itemId = contract.rewards[0].itemId
        rewards.quantity = contract.rewards[0].quantity
      }

      contracts.push({
        id: contract.id,
        level: contract.level,
        guildType: contract.guildType,
        requirements,
        rewards,
        isActive,
        isComplete: isActive && isComplete,
        acceptLocationId: contract.acceptLocationId,
        acceptLocationName: getLocationDisplayName(contract.acceptLocationId, "TOWN", this.state),
      })
    }

    return contracts
  }

  private buildExplorationInfo(): ExplorationInfo {
    const currentAreaId = getCurrentAreaId(this.state)
    const currentArea = this.state.exploration.areas.get(currentAreaId)
    const knownConnectionIds = new Set(this.state.exploration.playerState.knownConnectionIds)
    const knownLocationIds = this.state.exploration.playerState.knownLocationIds

    // Build connections list
    const connections: ConnectionInfo[] = []
    for (const connId of knownConnectionIds) {
      const [from, to] = connId.split("->")
      let destId: string | null = null

      if (from === currentAreaId) {
        destId = to
      } else if (to === currentAreaId) {
        destId = from
      }

      if (destId && !connections.find((c) => c.toAreaId === destId)) {
        const destArea = this.state.exploration.areas.get(destId)
        const conn = this.state.exploration.connections.find(
          (c) =>
            (c.fromAreaId === currentAreaId && c.toAreaId === destId) ||
            (c.fromAreaId === destId && c.toAreaId === currentAreaId)
        )
        const travelTime = Math.round(BASE_TRAVEL_TIME * (conn?.travelTimeMultiplier ?? 1))

        const currentDistance = currentArea?.distance ?? 0
        const destDistance = destArea?.distance ?? 0

        connections.push({
          toAreaId: destId,
          toAreaName: getAreaDisplayName(destId, destArea),
          travelTime,
          explorationStatus: this.getExplorationStatus(destId),
          relativeDistance:
            destDistance < currentDistance
              ? "closer"
              : destDistance > currentDistance
                ? "further"
                : "same",
        })
      }
    }

    // Build known gathering nodes
    const knownGatheringNodes: GatheringNodeInfo[] = []
    for (const node of this.state.world.nodes) {
      const locId = nodeIdToLocationId(node.nodeId)
      if (!locId || !knownLocationIds.includes(locId)) continue

      const visibleMaterials = getVisibleMaterials(node, this.state)
      const skill = node.materials[0]?.requiresSkill ?? "Mining"
      const skillLevel = this.state.player.skills[skill]?.level ?? 0
      const isAppraised = this.state.player.appraisedNodeIds.includes(node.nodeId)

      const materials: NodeMaterialInfo[] = visibleMaterials.map((m) => ({
        materialId: m.materialId,
        materialName: m.materialId.replace(/_/g, " ").toLowerCase(),
        requiredLevel: m.requiredLevel,
        remainingUnits: isAppraised ? m.remainingUnits : undefined,
        maxUnits: isAppraised ? m.maxUnitsInitial : undefined,
        canGather: m.requiredLevel <= skillLevel,
        isVisible: true,
      }))

      knownGatheringNodes.push({
        nodeId: node.nodeId,
        nodeType: node.nodeType,
        nodeName: node.nodeType === "ORE_VEIN" ? "Ore Vein" : "Tree Stand",
        locationId: locId,
        areaId: node.areaId,
        materials,
        isAppraised,
        isDepleted: node.depleted,
      })
    }

    // Check for undiscovered areas and locations
    const hasUndiscoveredAreas = this.state.exploration.connections.some((conn) => {
      if (conn.fromAreaId !== currentAreaId && conn.toAreaId !== currentAreaId) return false
      const otherId = conn.fromAreaId === currentAreaId ? conn.toAreaId : conn.fromAreaId
      return !this.state.exploration.playerState.knownAreaIds.includes(otherId)
    })

    const hasUndiscoveredLocations = currentArea
      ? currentArea.locations.some((loc) => !knownLocationIds.includes(loc.id))
      : false

    return {
      connections,
      knownGatheringNodes,
      hasUndiscoveredAreas,
      hasUndiscoveredLocations,
    }
  }

  private buildTimeInfo(): TimeInfo {
    return {
      currentTick: this.state.time.currentTick,
      gatheringLuckDelta: this.state.player.gatheringLuckDelta,
    }
  }
}
