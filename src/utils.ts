/**
 * Shared utility functions used across the codebase.
 */

/**
 * Converts an ID string to a human-readable name.
 * Replaces underscores with spaces and converts to lowercase.
 * Example: "IRON_INGOT" -> "iron ingot"
 */
export function formatIdAsName(id: string): string {
  return id.replace(/_/g, " ").toLowerCase()
}

/**
 * Capitalizes the first letter of a string.
 * Example: "mine" -> "Mine"
 */
export function capitalize(str: string): string {
  if (str.length === 0) return str
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Extracts the location index from a location ID.
 * Location IDs have the format "area-id-loc-N" where N is the index.
 * Returns null if the ID doesn't match the expected format.
 *
 * Example: "area-d1-i0-loc-3" -> "3"
 */
export function parseLocationIndex(locationId: string): string | null {
  const match = locationId.match(/-loc-(\d+)$/)
  return match ? match[1] : null
}
