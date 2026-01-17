/**
 * Shared state manipulation helpers
 *
 * These utilities are used by both the engine (for execution) and evaluate (for simulation).
 * Keeping them in one place ensures consistency and reduces duplication.
 */

import type { WorldState, ItemID, ItemStack, ContractID, LevelUp, SkillID } from "./types.js"
import { addXPToSkill } from "./types.js"
import { getExplorationXPThreshold } from "./exploration.js"
import { refreshMiningContracts } from "./contracts.js"

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
 * Add items to player inventory - non-stacking (each unit takes 1 slot)
 */
export function addToInventory(state: WorldState, itemId: ItemID, quantity: number): void {
  for (let i = 0; i < quantity; i++) {
    state.player.inventory.push({ itemId, quantity: 1 })
  }
}

/**
 * Remove items from player inventory - removes across multiple slots
 */
export function removeFromInventory(state: WorldState, itemId: ItemID, quantity: number): void {
  let remaining = quantity
  while (remaining > 0) {
    const index = state.player.inventory.findIndex((s) => s.itemId === itemId)
    if (index === -1) {
      throw new Error(`Not enough ${itemId} in inventory`)
    }
    state.player.inventory.splice(index, 1)
    remaining--
  }
}

/**
 * Add items to inventory with overflow handling - returns items that couldn't fit
 */
export function addToInventoryWithOverflow(
  state: WorldState,
  itemId: ItemID,
  quantity: number
): { added: number; discarded: number } {
  const available = state.player.inventoryCapacity - state.player.inventory.length
  const toAdd = Math.min(quantity, available)
  const discarded = quantity - toAdd

  for (let i = 0; i < toAdd; i++) {
    state.player.inventory.push({ itemId, quantity: 1 })
  }

  return { added: toAdd, discarded }
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
 * Non-stacking: checks total item count (each unit = 1 slot)
 */
export function canFitContractRewards(
  state: WorldState,
  requirements: ItemStack[],
  rewards: ItemStack[]
): boolean {
  const currentCount = state.player.inventory.length

  // Calculate how many items we'll remove from inventory (not storage)
  let removeCount = 0
  for (const req of requirements) {
    // Count all slots with this item ID
    const inInventoryCount = state.player.inventory.filter((i) => i.itemId === req.itemId).length
    const toRemove = Math.min(inInventoryCount, req.quantity)
    removeCount += toRemove
  }

  // Calculate how many items we'll add
  const addCount = rewards.reduce((sum, r) => sum + r.quantity, 0)

  return currentCount - removeCount + addCount <= state.player.inventoryCapacity
}

/**
 * Consume items required for a contract from inventory first, then storage.
 */
export function consumeContractRequirements(state: WorldState, requirements: ItemStack[]): void {
  for (const req of requirements) {
    let remaining = req.quantity

    // Take from inventory first (may be spread across multiple non-stacking slots)
    while (remaining > 0) {
      const invItem = state.player.inventory.find((i) => i.itemId === req.itemId)
      if (!invItem) break

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
 *
 * Per canonical-gathering.md: Mining/Woodcutting use exploration XP thresholds
 * Other skills use the standard N² thresholds
 */
export function grantXP(state: WorldState, skill: SkillID, amount: number): LevelUp[] {
  // Gathering skills use exploration XP thresholds per canonical-gathering.md
  const useExplorationThresholds = skill === "Mining" || skill === "Woodcutting"

  if (useExplorationThresholds) {
    // Use exploration XP thresholds for gathering skills
    const result = addXPToSkillWithThreshold(
      state.player.skills[skill],
      amount,
      getExplorationXPThreshold
    )
    state.player.skills[skill] = result.skill
    return result.levelUps.map((lu) => ({ ...lu, skill }))
  } else {
    // Use standard N² thresholds for other skills
    const result = addXPToSkill(state.player.skills[skill], amount)
    state.player.skills[skill] = result.skill
    return result.levelUps.map((lu) => ({ ...lu, skill }))
  }
}

/**
 * Add XP to a skill using a custom threshold function
 * Used for gathering skills which use exploration thresholds
 */
function addXPToSkillWithThreshold(
  skill: { level: number; xp: number },
  xpGain: number,
  getThreshold: (level: number) => number
): { skill: { level: number; xp: number }; levelUps: LevelUp[] } {
  const levelUps: LevelUp[] = []
  let { level, xp } = skill
  xp += xpGain

  // Check for level-ups (can be multiple)
  let threshold = getThreshold(level)
  while (xp >= threshold) {
    const fromLevel = level
    xp -= threshold
    level++
    levelUps.push({ skill: "" as SkillID, fromLevel, toLevel: level })
    threshold = getThreshold(level)
  }

  return { skill: { level, xp }, levelUps }
}

// ============================================================================
// Contract Completion
// ============================================================================

export interface ContractCompletionResult {
  contractId: ContractID
  itemsConsumed: ItemStack[]
  rewardsGranted: ItemStack[]
  reputationGained: number
  goldEarned?: number
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
    // Sum quantities across all matching slots (inventory may be non-stacking)
    const allItemRequirementsMet = contract.requirements.every((req) => {
      const inventoryQuantity = state.player.inventory
        .filter((i) => i.itemId === req.itemId)
        .reduce((sum, i) => sum + i.quantity, 0)
      const storageQuantity = state.player.storage
        .filter((i) => i.itemId === req.itemId)
        .reduce((sum, i) => sum + i.quantity, 0)
      const totalQuantity = inventoryQuantity + storageQuantity
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

      // Award gold if contract has goldReward
      let goldEarned: number | undefined
      if (contract.goldReward) {
        state.player.gold += contract.goldReward
        goldEarned = contract.goldReward
      }

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
        goldEarned,
        xpGained: contract.xpReward,
        levelUps: contractLevelUps.length > 0 ? contractLevelUps : undefined,
      })

      // Regenerate the completed contract's slot immediately (spec section 1.5)
      if (contract.slot && contract.guildType === "Mining") {
        refreshMiningContracts(state, contract.slot)
      }
    }
  }

  return completions
}
