import type { InventoryInfo } from "../../../session/types"

interface InventoryProps {
  inventory: InventoryInfo
}

export function Inventory({ inventory }: InventoryProps) {
  return (
    <div class="inventory panel">
      <h3>
        Inventory ({inventory.used}/{inventory.capacity})
      </h3>
      <ul>
        {inventory.items.map((item) => (
          <li key={item.itemId}>
            <span class="item-name">{item.itemId}</span>
            <span class="item-qty">x{item.quantity}</span>
          </li>
        ))}
        {inventory.items.length === 0 && <li class="empty">Empty</li>}
      </ul>
    </div>
  )
}
