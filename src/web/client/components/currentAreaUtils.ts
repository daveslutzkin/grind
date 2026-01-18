/**
 * Pure utility functions for CurrentArea and CompactActionLog components
 * Extracted to enable testing without JSX/preact dependencies
 */

import type { ValidAction, ContractInfo, LocationInfo } from "../../../session/types"

/**
 * Group actions by their command type (first word of command)
 */
export function groupActionsByType(actions: ValidAction[]): Record<string, ValidAction[]> {
  return actions.reduce(
    (groups, action) => {
      const type = action.command.split(" ")[0]
      if (!groups[type]) {
        groups[type] = []
      }
      groups[type].push(action)
      return groups
    },
    {} as Record<string, ValidAction[]>
  )
}

/**
 * Filter contracts to those available at the current location
 */
export function filterContractsAtLocation(
  contracts: ContractInfo[],
  location: LocationInfo
): ContractInfo[] {
  return contracts.filter((c) => !c.isActive && c.acceptLocationId === location.locationId)
}

/**
 * Format a contract ID as a friendly display name
 * e.g., "miners-guild-copper-1" -> "Miners Guild Copper 1"
 */
export function formatContractName(contractId: string): string {
  return contractId
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
