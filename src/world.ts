import type { WorldState } from "./types.js"
import { createRng } from "./rng.js"

export function createToyWorld(seed: string): WorldState {
  return {
    time: {
      currentTick: 0,
      sessionRemainingTicks: 200,
    },

    player: {
      location: "TOWN",
      inventory: [],
      inventoryCapacity: 10,
      storage: [],
      skills: {
        Mining: { level: 0, xp: 0 },
        Woodcutting: { level: 0, xp: 0 },
        Combat: { level: 0, xp: 0 },
        Smithing: { level: 0, xp: 0 },
        Woodcrafting: { level: 0, xp: 0 },
      },
      guildReputation: 0,
      activeContracts: [],
      equippedWeapon: null,
      contractKillProgress: {},
    },

    world: {
      locations: ["TOWN", "MINE", "FOREST"],
      travelCosts: {
        "TOWN->MINE": 2,
        "MINE->TOWN": 2,
        "TOWN->FOREST": 3,
        "FOREST->TOWN": 3,
        "MINE->FOREST": 4,
        "FOREST->MINE": 4,
      },
      resourceNodes: [
        {
          id: "iron-node",
          location: "MINE",
          itemId: "IRON_ORE",
          gatherTime: 2,
          successProbability: 0.8,
          requiredSkillLevel: 1,
          skillType: "Mining",
        },
        {
          id: "wood-node",
          location: "FOREST",
          itemId: "WOOD_LOG",
          gatherTime: 2,
          successProbability: 0.9,
          requiredSkillLevel: 1,
          skillType: "Woodcutting",
        },
      ],
      enemies: [
        {
          id: "cave-rat",
          location: "MINE",
          fightTime: 3,
          successProbability: 0.7,
          requiredSkillLevel: 1,
          lootTable: [
            { itemId: "IRON_ORE", quantity: 1, weight: 89 },
            {
              itemId: "IMPROVED_WEAPON",
              quantity: 1,
              weight: 10,
              replacesItem: "CRUDE_WEAPON",
              autoEquip: true,
            },
            { itemId: "COMBAT_GUILD_TOKEN", quantity: 1, weight: 1 },
          ],
          failureRelocation: "TOWN",
        },
      ],
      recipes: [
        {
          id: "iron-bar-recipe",
          inputs: [{ itemId: "IRON_ORE", quantity: 2 }],
          output: { itemId: "IRON_BAR", quantity: 1 },
          craftTime: 3,
          requiredLocation: "TOWN",
          requiredSkillLevel: 1,
        },
      ],
      contracts: [
        {
          id: "miners-guild-1",
          guildLocation: "TOWN",
          requirements: [{ itemId: "IRON_BAR", quantity: 2 }],
          rewards: [{ itemId: "IRON_ORE", quantity: 5 }],
          reputationReward: 10,
          xpReward: { skill: "Mining", amount: 2 },
        },
      ],
      storageLocation: "TOWN",
    },

    rng: createRng(seed),
  }
}
