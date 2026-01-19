import type { LocationInfo, ContractInfo, ValidAction } from "../../../session/types"
import {
  groupActionsByType,
  filterContractsAtLocation,
  formatContractName,
} from "./currentAreaUtils"

interface CurrentAreaProps {
  location: LocationInfo
  contracts: ContractInfo[]
  actions: ValidAction[]
  onAction: (command: string) => void
  disabled?: boolean
}

export function CurrentArea({
  location,
  contracts,
  actions,
  onAction,
  disabled = false,
}: CurrentAreaProps) {
  const contractsHere = filterContractsAtLocation(contracts, location)
  const groupedActions = groupActionsByType(actions)
  const actionTypes = Object.keys(groupedActions)

  return (
    <div class="current-area">
      <div class="area-header">
        <h2 class="area-title">{location.areaName}</h2>
        <span class="area-location">{location.locationName}</span>
        {location.explorationStatus && location.explorationStatus !== "fully explored" && (
          <span class="area-status">{location.explorationStatus}</span>
        )}
      </div>

      {contractsHere.length > 0 && (
        <div class="area-contracts">
          <h3>Contracts Available Here</h3>
          <ul>
            {contractsHere.map((contract) => (
              <li key={contract.id} class="area-contract">
                <div class="contract-info">
                  <span class="contract-name">{formatContractName(contract.id)}</span>
                  <span class="contract-level">Lv {contract.level}</span>
                </div>
                <div class="contract-rewards">
                  {contract.rewards.gold && <span>{contract.rewards.gold.toFixed(2)} gold</span>}
                  {contract.rewards.reputation > 0 && (
                    <span>{contract.rewards.reputation} rep</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div class="area-actions">
        <h3>Available Actions</h3>
        {actionTypes.length === 0 ? (
          <p class="no-actions">No actions available</p>
        ) : (
          <div class="action-list">
            {actionTypes.map((type) => (
              <div key={type} class="action-category">
                <span class="action-category-name">{type}</span>
                <div class="action-items">
                  {groupedActions[type].map((action) => (
                    <div key={action.command} class="action-item">
                      <button
                        onClick={() => onAction(action.command)}
                        disabled={disabled}
                        title={
                          action.description ||
                          `${action.displayName} (${action.timeCost} ticks)${action.isVariable ? " - variable" : ""}`
                        }
                      >
                        {action.displayName}
                        {action.timeCost > 0 && (
                          <span class="time-cost">{action.timeCost} ticks</span>
                        )}
                      </button>
                      <code class="action-command">{action.command}</code>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
