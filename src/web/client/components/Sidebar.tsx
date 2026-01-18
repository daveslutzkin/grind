import type { GameStateSnapshot } from "../../../session/types"
import { Inventory } from "./Inventory"
import { Storage } from "./Storage"
import { Skills } from "./Skills"
import { Contracts } from "./Contracts"
import { Map } from "./Map"

interface SidebarProps {
  state: GameStateSnapshot
}

export function Sidebar({ state }: SidebarProps) {
  return (
    <aside class="sidebar">
      <div class="sidebar-top">
        <Inventory inventory={state.inventory} />
        <Storage storage={state.storage} />
        <Skills skills={state.skills} />
        <Contracts contracts={state.contracts} />
      </div>
      <div class="sidebar-bottom">
        <Map location={state.location} exploration={state.exploration} />
      </div>
    </aside>
  )
}
