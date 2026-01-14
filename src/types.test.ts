import type { WorldState, Action, ActionLog } from "./types.js"

describe("Types", () => {
  it("should allow creating a valid WorldState", () => {
    const state: WorldState = {
      time: {
        currentTick: 0,
      },
      player: {
        inventory: [],
        inventoryCapacity: 10,
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
        gatheringLuckDelta: 0,
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
          visitedLocationIds: [],
          totalLuckDelta: 0,
          currentStreak: 0,
        },
      },
      rng: {
        seed: "test-seed",
        counter: 0,
      },
    }

    expect(state.time.currentTick).toBe(0)
    expect(state.exploration.playerState.currentAreaId).toBe("TOWN")
  })

  it("should allow creating valid actions", () => {
    const moveAction: Action = { type: "Move", destination: "MINE" }
    const gatherAction: Action = { type: "Gather", nodeId: "iron-node-1" }
    const dropAction: Action = { type: "Drop", itemId: "IRON_ORE", quantity: 1 }

    expect(moveAction.type).toBe("Move")
    expect(gatherAction.type).toBe("Gather")
    expect(dropAction.type).toBe("Drop")
  })

  it("should allow creating valid ActionLog", () => {
    const log: ActionLog = {
      tickBefore: 0,
      actionType: "Gather",
      parameters: { nodeId: "iron-node" },
      success: true,
      timeConsumed: 2,
      skillGained: { skill: "Mining", amount: 1 },
      rngRolls: [],
      stateDeltaSummary: "Gathered 1 IRON_ORE from iron-node",
    }

    expect(log.success).toBe(true)
    expect(log.skillGained?.skill).toBe("Mining")
  })
})
