import type { GameStateSnapshot } from "../../../session/types"
import { Inventory } from "./Inventory"
import { Storage } from "./Storage"
import { Skills } from "./Skills"
import { Contracts } from "./Contracts"
import { GameMap } from "./Map"

interface SidebarProps {
  state: GameStateSnapshot
}

export function Sidebar({ state }: SidebarProps) {
  const hasExplorationSkill = state.skills.some((s) => s.id === "Exploration" && s.level >= 1)
  const hasMiningSkill = state.skills.some((s) => s.id === "Mining" && s.level >= 1)
  const hasWoodcuttingSkill = state.skills.some((s) => s.id === "Woodcutting" && s.level >= 1)
  const hasCombatSkill = state.skills.some((s) => s.id === "Combat" && s.level >= 1)

  return (
    <aside class="sidebar">
      <div class="sidebar-top">
        <Inventory inventory={state.inventory} />
        <Storage storage={state.storage} />
        <Skills skills={state.skills} />
        <Contracts contracts={state.contracts} skills={state.skills} />
      </div>
      <div class="sidebar-bottom">
        <GameMap
          location={state.location}
          exploration={state.exploration}
          hasExplorationSkill={hasExplorationSkill}
          hasMiningSkill={hasMiningSkill}
          hasWoodcuttingSkill={hasWoodcuttingSkill}
          hasCombatSkill={hasCombatSkill}
        />
      </div>
    </aside>
  )
}
