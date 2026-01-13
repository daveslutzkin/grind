/**
 * Policy Registry
 *
 * Exports all available policies for the policy runner.
 */

export { safeMiner } from "./safe.js"
export { greedyMiner } from "./greedy.js"
export { balancedMiner } from "./balanced.js"

import { safeMiner } from "./safe.js"
import { greedyMiner } from "./greedy.js"
import { balancedMiner } from "./balanced.js"
import type { Policy } from "../types.js"

/**
 * All available policies.
 */
export const allPolicies: Policy[] = [safeMiner, greedyMiner, balancedMiner]

/**
 * Get a policy by ID.
 */
export function getPolicyById(id: string): Policy | undefined {
  return allPolicies.find((p) => p.id === id)
}
