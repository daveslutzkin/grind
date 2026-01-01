import type { WorldState } from './types.js';
import { createRng } from './rng.js';

export function createToyWorld(seed: string): WorldState {
  return {
    time: {
      currentTick: 0,
      sessionRemainingTicks: 20,
    },

    player: {
      location: 'TOWN',
      inventory: [],
      inventoryCapacity: 10,
      storage: [],
      skills: {
        Travel: 0,
        Gathering: 0,
        Combat: 0,
        Crafting: 0,
        Logistics: 0,
      },
      guildReputation: 0,
      activeContracts: [],
    },

    world: {
      locations: ['TOWN', 'MINE', 'FOREST'],
      travelCosts: {
        'TOWN->MINE': 2,
        'MINE->TOWN': 2,
        'TOWN->FOREST': 3,
        'FOREST->TOWN': 3,
        'MINE->FOREST': 4,
        'FOREST->MINE': 4,
      },
      resourceNodes: [
        {
          id: 'iron-node',
          location: 'MINE',
          itemId: 'IRON_ORE',
          gatherTime: 2,
          successProbability: 0.8,
          requiredSkillLevel: 0,
        },
        {
          id: 'wood-node',
          location: 'FOREST',
          itemId: 'WOOD_LOG',
          gatherTime: 2,
          successProbability: 0.9,
          requiredSkillLevel: 0,
        },
      ],
      enemies: [
        {
          id: 'cave-rat',
          location: 'MINE',
          fightTime: 3,
          successProbability: 0.7,
          requiredSkillLevel: 0,
          loot: [{ itemId: 'IRON_ORE', quantity: 1 }],
          failureRelocation: 'TOWN',
        },
      ],
      recipes: [
        {
          id: 'iron-bar-recipe',
          inputs: [{ itemId: 'IRON_ORE', quantity: 2 }],
          output: { itemId: 'IRON_BAR', quantity: 1 },
          craftTime: 3,
          requiredLocation: 'TOWN',
          requiredSkillLevel: 0,
        },
      ],
      contracts: [
        {
          id: 'miners-guild-1',
          guildLocation: 'TOWN',
          requirements: [{ itemId: 'IRON_BAR', quantity: 2 }],
          rewards: [{ itemId: 'IRON_ORE', quantity: 5 }],
          reputationReward: 10,
        },
      ],
      storageLocation: 'TOWN',
      storageRequiredSkillLevel: 1,
    },

    rng: createRng(seed),
  };
}
