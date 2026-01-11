/**
 * Shared state manipulation helpers
 *
 * These utilities are used by both the engine (for execution) and evaluate (for simulation).
 * Keeping them in one place ensures consistency and reduces duplication.
 */

import type { WorldState, ItemID, ItemStack, ContractID, LevelUp, SkillID } from "./types.js"
import { addXPToSkill } from "./types.js"

// ============================================================================
// Time Management
// ============================================================================

/**
 * Consume ticks from the session
 */
export function consumeTime(state: WorldState, ticks: number): void {
  state.time.currentTick += ticks
}

// ============================================================================
// Inventory Operations
// ============================================================================

/**
 * Add items to player inventory, stacking with existing items
 */
export function addToInventory(state: WorldState, itemId: ItemID, quantity: number): void {
  const existing = state.player.inventory.find((i) => i.itemId === itemId)
  if (existing) {
    existing.quantity += quantity
  } else {
    state.player.inventory.push({ itemId, quantity })
  }
}

/**
 * Remove items from player inventory
 */
export function removeFromInventory(state: WorldState, itemId: ItemID, quantity: number): void {
  const item = state.player.inventory.find((i) => i.itemId === itemId)
  if (item) {
    item.quantity -= quantity
    if (item.quantity <= 0) {
      const index = state.player.inventory.indexOf(item)
      state.player.inventory.splice(index, 1)
    }
  }
}

/**
 * Add items to player storage, stacking with existing items
 */
export function addToStorage(state: WorldState, itemId: ItemID, quantity: number): void {
  const existing = state.player.storage.find((i) => i.itemId === itemId)
  if (existing) {
    existing.quantity += quantity
  } else {
    state.player.storage.push({ itemId, quantity })
  }
}

/**
 * Remove items from player storage
 */
export function removeFromStorage(state: WorldState, itemId: ItemID, quantity: number): void {
  const item = state.player.storage.find((i) => i.itemId === itemId)
  if (item) {
    item.quantity -= quantity
    if (item.quantity <= 0) {
      const index = state.player.storage.indexOf(item)
      state.player.storage.splice(index, 1)
    }
  }
}

// ============================================================================
// Contract Helpers
// ============================================================================

/**
 * Check if contract rewards will fit in inventory after consuming requirements.
 * Simulates the inventory state to account for freed slots.
 */
export function canFitContractRewards(
  state: WorldState,
  requirements: ItemStack[],
  rewards: ItemStack[]
): boolean {
  // Simulate inventory state after consuming requirements
  const simulatedInventory = new Map<ItemID, number>()
  for (const item of state.player.inventory) {
    simulatedInventory.set(item.itemId, item.quantity)
  }

  // Simulate consuming requirements from inventory
  for (const req of requirements) {
    const current = simulatedInventory.get(req.itemId) ?? 0
    // We consume from inventory first; if not enough, remainder comes from storage
    // For slot calculation, we only care about inventory
    const toConsume = Math.min(current, req.quantity)
    if (toConsume >= current) {
      simulatedInventory.delete(req.itemId) // Slot freed
    } else {
      simulatedInventory.set(req.itemId, current - toConsume)
    }
  }

  // Simulate adding rewards
  for (const reward of rewards) {
    const current = simulatedInventory.get(reward.itemId) ?? 0
    simulatedInventory.set(reward.itemId, current + reward.quantity)
  }

  // Check if simulated inventory fits in capacity
  return simulatedInventory.size <= state.player.inventoryCapacity
}

/**
 * Consume items required for a contract from inventory first, then storage.
 */
export function consumeContractRequirements(state: WorldState, requirements: ItemStack[]): void {
  for (const req of requirements) {
    let remaining = req.quantity

    // Take from inventory first
    const invItem = state.player.inventory.find((i) => i.itemId === req.itemId)
    if (invItem) {
      const takeFromInv = Math.min(invItem.quantity, remaining)
      invItem.quantity -= takeFromInv
      remaining -= takeFromInv
      if (invItem.quantity <= 0) {
        const index = state.player.inventory.indexOf(invItem)
        state.player.inventory.splice(index, 1)
      }
    }

    // Take remainder from storage
    if (remaining > 0) {
      removeFromStorage(state, req.itemId, remaining)
    }
  }
}

/**
 * Grant rewards from a contract to inventory.
 */
export function grantContractRewards(state: WorldState, rewards: ItemStack[]): void {
  for (const reward of rewards) {
    addToInventory(state, reward.itemId, reward.quantity)
  }
}

// ============================================================================
// XP and Skills
// ============================================================================

/**
 * Grant XP to a skill and handle level-ups
 * Returns any level-ups that occurred
 */
export function grantXP(state: WorldState, skill: SkillID, amount: number): LevelUp[] {
  const result = addXPToSkill(state.player.skills[skill], amount)
  state.player.skills[skill] = result.skill
  // Fill in the skill ID for each level-up
  return result.levelUps.map((lu) => ({ ...lu, skill }))
}

// ============================================================================
// Contract Completion
// ============================================================================

export interface ContractCompletionResult {
  contractId: ContractID
  itemsConsumed: ItemStack[]
  rewardsGranted: ItemStack[]
  reputationGained: number
  xpGained?: { skill: SkillID; amount: number }
  levelUps?: LevelUp[]
}

/**
 * Check and process contract completions.
 * This is the single source of truth for contract completion logic.
 *
 * @param state The current world state (will be mutated if contracts complete)
 * @returns Array of completed contracts with their details
 */
export function checkAndCompleteContracts(state: WorldState): ContractCompletionResult[] {
  const completions: ContractCompletionResult[] = []

  // Check each active contract
  for (const contractId of [...state.player.activeContracts]) {
    const contract = state.world.contracts.find((c) => c.id === contractId)
    if (!contract) continue

    // Check if all item requirements are met (in inventory or storage)
    const allItemRequirementsMet = contract.requirements.every((req) => {
      const inInventory = state.player.inventory.find((i) => i.itemId === req.itemId)
      const inStorage = state.player.storage.find((i) => i.itemId === req.itemId)
      const totalQuantity = (inInventory?.quantity ?? 0) + (inStorage?.quantity ?? 0)
      return totalQuantity >= req.quantity
    })

    // Check if all kill requirements are met
    const allKillRequirementsMet = (contract.killRequirements ?? []).every((req) => {
      const progress = state.player.contractKillProgress[contractId]?.[req.enemyId] ?? 0
      return progress >= req.count
    })

    // Check if rewards will fit in inventory (respecting slot capacity)
    const rewardsWillFit = canFitContractRewards(state, contract.requirements, contract.rewards)

    if (allItemRequirementsMet && allKillRequirementsMet && rewardsWillFit) {
      // Record what we're consuming for the log
      const itemsConsumed = contract.requirements.map((req) => ({
        itemId: req.itemId,
        quantity: req.quantity,
      }))

      // Consume required items
      consumeContractRequirements(state, contract.requirements)

      // Record what we're granting for the log
      const rewardsGranted = contract.rewards.map((reward) => ({
        itemId: reward.itemId,
        quantity: reward.quantity,
      }))

      // Grant contract rewards
      grantContractRewards(state, contract.rewards)

      // Award reputation
      state.player.guildReputation += contract.reputationReward

      // Award XP if contract has xpReward and capture level-ups
      let contractLevelUps: LevelUp[] = []
      if (contract.xpReward) {
        contractLevelUps = grantXP(state, contract.xpReward.skill, contract.xpReward.amount)
      }

      // Remove from active contracts
      const index = state.player.activeContracts.indexOf(contractId)
      state.player.activeContracts.splice(index, 1)

      // Clean up kill progress for this contract
      delete state.player.contractKillProgress[contractId]

      completions.push({
        contractId,
        itemsConsumed,
        rewardsGranted,
        reputationGained: contract.reputationReward,
        xpGained: contract.xpReward,
        levelUps: contractLevelUps.length > 0 ? contractLevelUps : undefined,
      })
    }
  }

  return completions
}
