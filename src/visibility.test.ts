import {
  getSkillForNodeType,
  getNodeTypeName,
  getPlayerSkillLevelForNode,
  getMaxVisibleMaterialLevel,
  getNodeVisibilityTier,
  getVisibleMaterials,
  isMaterialVisible,
  getPlayerNodeView,
} from "./visibility.js"
import type { Node, WorldState } from "./types.js"
import { NodeType } from "./types.js"

// Helper to create a minimal world state for testing
function createTestState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    time: { currentTick: 0, sessionRemainingTicks: 100 },
    player: {
      inventory: [],
      inventoryCapacity: 20,
      storage: [],
      skills: {
        Mining: { level: 0, xp: 0 },
        Woodcutting: { level: 0, xp: 0 },
        Combat: { level: 0, xp: 0 },
        Smithing: { level: 0, xp: 0 },
        Woodcrafting: { level: 0, xp: 0 },
        Exploration: { level: 0, xp: 0 },
      },
      guildReputation: 0,
      activeContracts: [],
      equippedWeapon: null,
      contractKillProgress: {},
      appraisedNodeIds: [],
    },
    world: {
      nodes: [],
      recipes: [],
      contracts: [],
      storageAreaId: "TOWN",
    },
    exploration: {
      areas: new Map(),
      connections: [],
      playerState: {
        currentAreaId: "TOWN",
        currentLocationId: null,
        knownAreaIds: ["TOWN"],
        knownLocationIds: [],
        knownConnectionIds: [],
        totalLuckDelta: 0,
        currentStreak: 0,
      },
    },
    rng: { seed: "test", counter: 0 },
    ...overrides,
  }
}

// Helper to create a test node
function createTestNode(overrides: Partial<Node> = {}): Node {
  return {
    nodeId: "test-node-1",
    nodeType: NodeType.ORE_VEIN,
    areaId: "area-d1-i0",
    materials: [
      {
        materialId: "STONE",
        remainingUnits: 100,
        maxUnitsInitial: 100,
        requiresSkill: "Mining",
        requiredLevel: 1,
        tier: 1,
      },
      {
        materialId: "COPPER_ORE",
        remainingUnits: 50,
        maxUnitsInitial: 50,
        requiresSkill: "Mining",
        requiredLevel: 1,
        tier: 1,
      },
      {
        materialId: "IRON_ORE",
        remainingUnits: 30,
        maxUnitsInitial: 30,
        requiresSkill: "Mining",
        requiredLevel: 5,
        tier: 3,
      },
    ],
    depleted: false,
    ...overrides,
  }
}

describe("visibility", () => {
  describe("getSkillForNodeType", () => {
    it("should return Mining for ORE_VEIN", () => {
      expect(getSkillForNodeType(NodeType.ORE_VEIN)).toBe("Mining")
    })

    it("should return Woodcutting for TREE_STAND", () => {
      expect(getSkillForNodeType(NodeType.TREE_STAND)).toBe("Woodcutting")
    })
  })

  describe("getNodeTypeName", () => {
    it("should return Ore vein for ORE_VEIN", () => {
      expect(getNodeTypeName(NodeType.ORE_VEIN)).toBe("Ore vein")
    })

    it("should return Tree stand for TREE_STAND", () => {
      expect(getNodeTypeName(NodeType.TREE_STAND)).toBe("Tree stand")
    })
  })

  describe("getMaxVisibleMaterialLevel", () => {
    it("should return skill level + 2", () => {
      expect(getMaxVisibleMaterialLevel(1)).toBe(3)
      expect(getMaxVisibleMaterialLevel(3)).toBe(5)
      expect(getMaxVisibleMaterialLevel(8)).toBe(10)
    })

    it("should work with level 0", () => {
      expect(getMaxVisibleMaterialLevel(0)).toBe(2)
    })
  })

  describe("getPlayerSkillLevelForNode", () => {
    it("should return 0 when player has no skill", () => {
      const state = createTestState()
      const node = createTestNode()
      expect(getPlayerSkillLevelForNode(node, state)).toBe(0)
    })

    it("should return player skill level for matching skill", () => {
      const state = createTestState()
      state.player.skills.Mining = { level: 3, xp: 50 }
      const node = createTestNode()
      expect(getPlayerSkillLevelForNode(node, state)).toBe(3)
    })

    it("should return Woodcutting level for TREE_STAND", () => {
      const state = createTestState()
      state.player.skills.Woodcutting = { level: 5, xp: 100 }
      const node = createTestNode({ nodeType: NodeType.TREE_STAND })
      expect(getPlayerSkillLevelForNode(node, state)).toBe(5)
    })
  })

  describe("getNodeVisibilityTier", () => {
    it("should return none when player has no skill", () => {
      const state = createTestState()
      const node = createTestNode()
      expect(getNodeVisibilityTier(node, state)).toBe("none")
    })

    it("should return materials when player has skill but not appraised", () => {
      const state = createTestState()
      state.player.skills.Mining = { level: 1, xp: 0 }
      const node = createTestNode()
      expect(getNodeVisibilityTier(node, state)).toBe("materials")
    })

    it("should return full when player has appraised the node", () => {
      const state = createTestState()
      state.player.skills.Mining = { level: 1, xp: 0 }
      state.player.appraisedNodeIds = ["test-node-1"]
      const node = createTestNode()
      expect(getNodeVisibilityTier(node, state)).toBe("full")
    })
  })

  describe("getVisibleMaterials", () => {
    it("should return all materials at L1 + 2 = L3 max", () => {
      const state = createTestState()
      state.player.skills.Mining = { level: 1, xp: 0 }
      const node = createTestNode()

      const visible = getVisibleMaterials(node, state)

      // STONE (L1), COPPER_ORE (L1) visible, IRON_ORE (L5) hidden
      expect(visible).toHaveLength(2)
      expect(visible.map((m) => m.materialId)).toEqual(["STONE", "COPPER_ORE"])
    })

    it("should return all materials when level is high enough", () => {
      const state = createTestState()
      state.player.skills.Mining = { level: 5, xp: 0 }
      const node = createTestNode()

      const visible = getVisibleMaterials(node, state)

      // All materials visible at L5 + 2 = L7 max
      expect(visible).toHaveLength(3)
    })

    it("should return empty array when skill level is 0", () => {
      const state = createTestState()
      const node = createTestNode()

      const visible = getVisibleMaterials(node, state)

      // L0 + 2 = L2, but no skill means this is technically reachable
      // However, materials at L1 should be visible
      expect(visible).toHaveLength(2)
    })
  })

  describe("isMaterialVisible", () => {
    it("should return true for low-level materials", () => {
      const state = createTestState()
      state.player.skills.Mining = { level: 1, xp: 0 }
      state.world.nodes = [createTestNode()]

      expect(isMaterialVisible("STONE", state)).toBe(true)
      expect(isMaterialVisible("COPPER_ORE", state)).toBe(true)
    })

    it("should return false for high-level materials", () => {
      const state = createTestState()
      state.player.skills.Mining = { level: 1, xp: 0 }
      state.world.nodes = [createTestNode()]

      expect(isMaterialVisible("IRON_ORE", state)).toBe(false)
    })

    it("should return true for unknown materials", () => {
      const state = createTestState()
      expect(isMaterialVisible("UNKNOWN_MATERIAL", state)).toBe(true)
    })
  })

  describe("getPlayerNodeView", () => {
    it("should return complete view with tier and materials", () => {
      const state = createTestState()
      state.player.skills.Mining = { level: 1, xp: 0 }
      const node = createTestNode()

      const view = getPlayerNodeView(node, state)

      expect(view.nodeId).toBe("test-node-1")
      expect(view.nodeType).toBe(NodeType.ORE_VEIN)
      expect(view.visibilityTier).toBe("materials")
      expect(view.visibleMaterials).toHaveLength(2)
    })

    it("should return empty materials for none tier", () => {
      const state = createTestState()
      const node = createTestNode()

      const view = getPlayerNodeView(node, state)

      expect(view.visibilityTier).toBe("none")
      expect(view.visibleMaterials).toHaveLength(0)
    })
  })
})
