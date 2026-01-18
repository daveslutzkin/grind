import type { ContractInfo, SkillInfo } from "../../../session/types"
import { formatContractName } from "./currentAreaUtils"

interface ContractsProps {
  contracts: ContractInfo[]
  skills: SkillInfo[]
}

/**
 * Check if player can accept a contract based on their skill level
 */
function canAcceptContract(contract: ContractInfo, skills: SkillInfo[]): boolean {
  const skill = skills.find((s) => s.id === contract.guildType)
  if (!skill) return false
  return skill.level >= contract.level
}

/**
 * Get the skill name for display (capitalize first letter)
 */
function formatSkillName(skillId: string): string {
  return skillId.charAt(0).toUpperCase() + skillId.slice(1)
}

export function Contracts({ contracts, skills }: ContractsProps) {
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
                  <span class="contract-name">{formatContractName(contract.id)}</span>
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
            {availableContracts.map((contract) => {
              const canAccept = canAcceptContract(contract, skills)
              return (
                <li key={contract.id} class={canAccept ? "" : "unavailable"}>
                  <div class="contract-header">
                    <span class="contract-name">{formatContractName(contract.id)}</span>
                    <span class="contract-level">Lv {contract.level}</span>
                  </div>
                  <div class="contract-location">at {contract.acceptLocationName}</div>
                  {!canAccept && (
                    <div class="contract-requirement">
                      Requires {formatSkillName(contract.guildType)} Lv {contract.level}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {contracts.length === 0 && <p class="empty">No current contracts</p>}
    </div>
  )
}
