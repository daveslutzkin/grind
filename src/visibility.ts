/**
 * Visibility module - determines what information is available to the player
 *
 * This separates "what can they see" from "how do we display it"
 */

import type { Node, MaterialReserve, WorldState, NodeType, GatheringSkillID } from "./types.js"

/** Visibility tier for a node */
export type NodeVisibilityTier = "none" | "materials" | "full"

/**
 * Get the gathering skill required for a node type
 */
export function getSkillForNodeType(nodeType: NodeType): GatheringSkillID {
  return nodeType === "ORE_VEIN" ? "Mining" : "Woodcutting"
}

/**
 * Get the human-readable name for a node type
 */
export function getNodeTypeName(nodeType: NodeType): string {
  return nodeType === "ORE_VEIN" ? "Ore vein" : "Tree stand"
}

/**
 * Get the player's skill level for a given node
 */
export function getPlayerSkillLevelForNode(node: Node, state: WorldState): number {
  const skill = getSkillForNodeType(node.nodeType)
  return state.player.skills[skill]?.level ?? 0
}

/**
 * Get the maximum material level the player can see for a given skill level
 * Rule: can see materials up to skillLevel + 2
 */
export function getMaxVisibleMaterialLevel(skillLevel: number): number {
  return skillLevel + 2
}

/**
 * Determine the visibility tier for a node
 * - 'none': Player has no skill, only sees node type
 * - 'materials': Player has skill but hasn't appraised, sees material names
 * - 'full': Player has appraised, sees full details with quantities
 */
export function getNodeVisibilityTier(node: Node, state: WorldState): NodeVisibilityTier {
  const skillLevel = getPlayerSkillLevelForNode(node, state)

  if (skillLevel === 0) {
    return "none"
  }

  const isAppraised = state.player.appraisedNodeIds.includes(node.nodeId)
  return isAppraised ? "full" : "materials"
}

/**
 * Get the materials visible to the player for a given node
 * Filters by: skillLevel + 2 rule
 */
export function getVisibleMaterials(node: Node, state: WorldState): MaterialReserve[] {
  const skillLevel = getPlayerSkillLevelForNode(node, state)
  const maxLevel = getMaxVisibleMaterialLevel(skillLevel)

  return node.materials.filter((m) => m.requiredLevel <= maxLevel)
}

/**
 * Check if a specific material is visible to the player
 * Used for filtering collateral damage in action logs
 */
export function isMaterialVisible(materialId: string, state: WorldState): boolean {
  // Find the material in any node to get its required level and skill
  for (const node of state.world.nodes || []) {
    const mat = node.materials.find((m) => m.materialId === materialId)
    if (mat) {
      const skillLevel = state.player.skills[mat.requiresSkill]?.level ?? 0
      const maxLevel = getMaxVisibleMaterialLevel(skillLevel)
      return mat.requiredLevel <= maxLevel
    }
  }
  // Material not found in nodes - default to visible
  return true
}

/**
 * Structured view of a node from the player's perspective
 */
export interface PlayerNodeView {
  nodeId: string
  nodeType: NodeType
  visibilityTier: NodeVisibilityTier
  /** Only populated if tier is 'materials' or 'full' */
  visibleMaterials: MaterialReserve[]
}

/**
 * Get a player's view of a node - combines visibility tier and filtered materials
 */
export function getPlayerNodeView(node: Node, state: WorldState): PlayerNodeView {
  const tier = getNodeVisibilityTier(node, state)
  const visibleMaterials = tier === "none" ? [] : getVisibleMaterials(node, state)

  return {
    nodeId: node.nodeId,
    nodeType: node.nodeType,
    visibilityTier: tier,
    visibleMaterials,
  }
}
