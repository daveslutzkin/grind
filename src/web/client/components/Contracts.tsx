import type { ContractInfo } from "../../../session/types"

interface ContractsProps {
  contracts: ContractInfo[]
}

export function Contracts({ contracts }: ContractsProps) {
  const activeContracts = contracts.filter((c) => c.isActive)
  const availableContracts = contracts.filter((c) => !c.isActive)

  return (
    <div class="contracts panel">
      <h3>Contracts</h3>

      {activeContracts.length > 0 && (
        <div class="contracts-section">
          <h4>Active</h4>
          <ul>
            {activeContracts.map((contract) => (
              <li key={contract.id} class={contract.isComplete ? "complete" : ""}>
                <div class="contract-header">
                  <span class="contract-name">{contract.id}</span>
                  <span class="contract-level">Lv {contract.level}</span>
                  {contract.isComplete && <span class="contract-status">Ready!</span>}
                </div>
                <div class="contract-requirements">
                  {contract.requirements.map((req, i) => (
                    <span key={i} class="contract-req">
                      {req.itemId}: {req.currentQuantity}/{req.quantity}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {availableContracts.length > 0 && (
        <div class="contracts-section">
          <h4>Available</h4>
          <ul>
            {availableContracts.map((contract) => (
              <li key={contract.id}>
                <div class="contract-header">
                  <span class="contract-name">{contract.id}</span>
                  <span class="contract-level">Lv {contract.level}</span>
                </div>
                <div class="contract-location">at {contract.acceptLocationName}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {contracts.length === 0 && <p class="empty">No current contracts</p>}
    </div>
  )
}
