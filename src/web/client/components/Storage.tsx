import type { StorageInfo } from "../../../session/types"

interface StorageProps {
  storage: StorageInfo
}

export function Storage({ storage }: StorageProps) {
  return (
    <div class="storage panel">
      <h3>Storage</h3>
      <ul>
        {storage.items.map((item) => (
          <li key={item.itemId}>
            <span class="item-name">{item.itemId}</span>
            <span class="item-qty">x{item.quantity}</span>
          </li>
        ))}
        {storage.items.length === 0 && <li class="empty">Empty</li>}
      </ul>
    </div>
  )
}
