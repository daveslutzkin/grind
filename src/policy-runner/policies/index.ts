/**
 * Policy Registry
 *
 * Exports all available policies for the policy runner.
 */

export { safeMiner } from "./safe.js"

import { safeMiner } from "./safe.js"
import type { Policy } from "../types.js"

/**
 * All available policies.
 */
export const allPolicies: Policy[] = [safeMiner]

/**
 * Get a policy by ID.
 */
export function getPolicyById(id: string): Policy | undefined {
  return allPolicies.find((p) => p.id === id)
}
