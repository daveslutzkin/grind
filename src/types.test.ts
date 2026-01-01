import type { WorldState, Action, ActionLog } from './types.js';

describe('Types', () => {
  it('should allow creating a valid WorldState', () => {
    const state: WorldState = {
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
        resourceNodes: [],
        enemies: [],
        recipes: [],
        contracts: [],
        storageLocation: 'TOWN',
        storageRequiredSkillLevel: 1,
      },
      rng: {
        seed: 'test-seed',
        counter: 0,
      },
    };

    expect(state.time.currentTick).toBe(0);
    expect(state.player.location).toBe('TOWN');
  });

  it('should allow creating valid actions', () => {
    const moveAction: Action = { type: 'Move', destination: 'MINE' };
    const gatherAction: Action = { type: 'Gather', nodeId: 'iron-node-1' };
    const dropAction: Action = { type: 'Drop', itemId: 'IRON_ORE', quantity: 1 };

    expect(moveAction.type).toBe('Move');
    expect(gatherAction.type).toBe('Gather');
    expect(dropAction.type).toBe('Drop');
  });

  it('should allow creating valid ActionLog', () => {
    const log: ActionLog = {
      tickBefore: 0,
      actionType: 'Move',
      parameters: { destination: 'MINE' },
      success: true,
      timeConsumed: 2,
      skillGained: { skill: 'Travel', amount: 1 },
      rngRolls: [],
      stateDeltaSummary: 'Moved from TOWN to MINE',
    };

    expect(log.success).toBe(true);
    expect(log.skillGained?.skill).toBe('Travel');
  });
});
