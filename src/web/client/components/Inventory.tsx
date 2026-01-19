import type { InventoryInfo } from "../../../session/types"
import type { ItemStack } from "../../../types"

interface InventoryProps {
  inventory: InventoryInfo
}

export function Inventory({ inventory }: InventoryProps) {
  // Create array of capacity length, filled with items or null
  const slots: (ItemStack | null)[] = []
  for (let i = 0; i < inventory.capacity; i++) {
    slots.push(inventory.items[i] ?? null)
  }

  return (
    <div class="inventory panel">
      <h3>Inventory</h3>
      <div class="inventory-grid">
        {slots.map((slot, index) => (
          <div key={index} class={`inventory-slot ${slot ? "filled" : "empty"}`}>
            {slot && (
              <>
                <span class="item-name">{slot.itemId}</span>
                {slot.quantity > 1 && <span class="item-qty">x{slot.quantity}</span>}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
