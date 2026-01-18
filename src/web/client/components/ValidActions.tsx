import type { ValidAction } from "../../../session/types"

interface ValidActionsProps {
  actions: ValidAction[]
  onAction: (command: string) => void
  disabled?: boolean
}

export function ValidActions({ actions, onAction, disabled = false }: ValidActionsProps) {
  // Group actions by type for better organization
  const groupedActions = actions.reduce(
    (groups, action) => {
      // Extract action type from command (first word)
      const type = action.command.split(" ")[0]
      if (!groups[type]) {
        groups[type] = []
      }
      groups[type].push(action)
      return groups
    },
    {} as Record<string, ValidAction[]>
  )

  const actionTypes = Object.keys(groupedActions)

  return (
    <div class="valid-actions">
      {actionTypes.length === 0 ? (
        <p class="no-actions">No actions available</p>
      ) : (
        <div class="action-groups">
          {actionTypes.map((type) => (
            <div key={type} class="action-group">
              <span class="action-type">{type}</span>
              <div class="action-buttons">
                {groupedActions[type].map((action) => (
                  <button
                    key={action.command}
                    onClick={() => onAction(action.command)}
                    disabled={disabled}
                    title={`${action.displayName} (${action.timeCost} ticks)${action.isVariable ? " - variable" : ""}`}
                  >
                    {action.displayName}
                    {action.timeCost > 0 && <span class="time-cost">{action.timeCost}t</span>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
