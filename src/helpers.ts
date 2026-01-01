// Shared helpers used by both engine and evaluation logic
// This ensures consistency between execution and evaluation

import type { WorldState, ItemStack } from "./types.js"

/**
 * Get the number of inventory slots used (slot-based capacity)
 * Inventory capacity is based on distinct item stacks, not total quantity
 */
export function getInventorySlotCount(state: WorldState): number {
  return state.player.inventory.length
}

/**
 * Check if inventory has all required items
 */
export function hasItems(inventory: ItemStack[], required: ItemStack[]): boolean {
  for (const req of required) {
    const item = inventory.find((i) => i.itemId === req.itemId)
    if (!item || item.quantity < req.quantity) {
      return false
    }
  }
  return true
}

/**
 * Check if gathering would exceed inventory capacity
 * Returns true if there's room (either has existing stack or has free slot)
 */
export function canGatherItem(state: WorldState, itemId: string): boolean {
  if (getInventorySlotCount(state) < state.player.inventoryCapacity) {
    return true // Has free slot
  }
  // Full, but check if we can stack on existing item
  const existingItem = state.player.inventory.find((i) => i.itemId === itemId)
  return existingItem !== undefined
}
