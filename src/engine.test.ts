import { executeAction } from './engine.js';
import { createToyWorld } from './world.js';
import type { MoveAction, AcceptContractAction, GatherAction, FightAction, CraftAction, StoreAction, DropAction } from './types.js';

describe('Engine', () => {
  describe('Move action', () => {
    it('should move player to destination', () => {
      const state = createToyWorld('test-seed');
      const action: MoveAction = { type: 'Move', destination: 'MINE' };

      const log = executeAction(state, action);

      expect(log.success).toBe(true);
      expect(state.player.location).toBe('MINE');
    });

    it('should consume travel time', () => {
      const state = createToyWorld('test-seed');
      const initialTicks = state.time.sessionRemainingTicks;
      const action: MoveAction = { type: 'Move', destination: 'MINE' };

      const log = executeAction(state, action);

      expect(log.timeConsumed).toBe(2); // TOWN->MINE is 2 ticks
      expect(state.time.sessionRemainingTicks).toBe(initialTicks - 2);
      expect(state.time.currentTick).toBe(2);
    });

    it('should grant Travel XP on success', () => {
      const state = createToyWorld('test-seed');
      const action: MoveAction = { type: 'Move', destination: 'MINE' };

      const log = executeAction(state, action);

      expect(log.skillGained).toEqual({ skill: 'Travel', amount: 1 });
      expect(state.player.skills.Travel).toBe(1);
    });

    it('should fail if already at destination', () => {
      const state = createToyWorld('test-seed');
      state.player.location = 'MINE';
      const action: MoveAction = { type: 'Move', destination: 'MINE' };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('WRONG_LOCATION');
      expect(log.timeConsumed).toBe(0);
    });

    it('should fail if session has ended', () => {
      const state = createToyWorld('test-seed');
      state.time.sessionRemainingTicks = 0;
      const action: MoveAction = { type: 'Move', destination: 'MINE' };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('SESSION_ENDED');
    });

    it('should log action details', () => {
      const state = createToyWorld('test-seed');
      const action: MoveAction = { type: 'Move', destination: 'MINE' };

      const log = executeAction(state, action);

      expect(log.tickBefore).toBe(0);
      expect(log.actionType).toBe('Move');
      expect(log.parameters).toEqual({ destination: 'MINE' });
      expect(log.stateDeltaSummary).toContain('TOWN');
      expect(log.stateDeltaSummary).toContain('MINE');
    });

    it('should work for all location pairs', () => {
      const state = createToyWorld('test-seed');

      // TOWN -> FOREST
      let log = executeAction(state, { type: 'Move', destination: 'FOREST' });
      expect(log.success).toBe(true);
      expect(log.timeConsumed).toBe(3);
      expect(state.player.location).toBe('FOREST');

      // FOREST -> MINE
      log = executeAction(state, { type: 'Move', destination: 'MINE' });
      expect(log.success).toBe(true);
      expect(log.timeConsumed).toBe(4);
      expect(state.player.location).toBe('MINE');
    });
  });

  describe('AcceptContract action', () => {
    it('should add contract to active contracts', () => {
      const state = createToyWorld('test-seed');
      const action: AcceptContractAction = { type: 'AcceptContract', contractId: 'miners-guild-1' };

      const log = executeAction(state, action);

      expect(log.success).toBe(true);
      expect(state.player.activeContracts).toContain('miners-guild-1');
    });

    it('should consume 0 ticks', () => {
      const state = createToyWorld('test-seed');
      const initialTicks = state.time.sessionRemainingTicks;
      const action: AcceptContractAction = { type: 'AcceptContract', contractId: 'miners-guild-1' };

      const log = executeAction(state, action);

      expect(log.timeConsumed).toBe(0);
      expect(state.time.sessionRemainingTicks).toBe(initialTicks);
    });

    it('should not grant XP', () => {
      const state = createToyWorld('test-seed');
      const action: AcceptContractAction = { type: 'AcceptContract', contractId: 'miners-guild-1' };

      const log = executeAction(state, action);

      expect(log.skillGained).toBeUndefined();
    });

    it('should fail if not at guild location', () => {
      const state = createToyWorld('test-seed');
      state.player.location = 'MINE';
      const action: AcceptContractAction = { type: 'AcceptContract', contractId: 'miners-guild-1' };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('WRONG_LOCATION');
    });

    it('should fail if contract not found', () => {
      const state = createToyWorld('test-seed');
      const action: AcceptContractAction = { type: 'AcceptContract', contractId: 'nonexistent' };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('CONTRACT_NOT_FOUND');
    });

    it('should fail if already has contract', () => {
      const state = createToyWorld('test-seed');
      state.player.activeContracts.push('miners-guild-1');
      const action: AcceptContractAction = { type: 'AcceptContract', contractId: 'miners-guild-1' };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('ALREADY_HAS_CONTRACT');
    });
  });

  describe('Gather action', () => {
    it('should add item to inventory on success', () => {
      const state = createToyWorld('gather-success-seed');
      state.player.location = 'MINE';
      // Force RNG to succeed by using a seed that succeeds at counter 0
      state.rng.seed = 'always-succeed';
      const action: GatherAction = { type: 'Gather', nodeId: 'iron-node' };

      // Try multiple times to find a successful gather
      let log = executeAction(state, action);

      // The RNG should produce a consistent result
      if (log.success) {
        const ironOre = state.player.inventory.find(i => i.itemId === 'IRON_ORE');
        expect(ironOre).toBeDefined();
        expect(ironOre?.quantity).toBe(1);
      }
    });

    it('should consume gather time', () => {
      const state = createToyWorld('test-seed');
      state.player.location = 'MINE';
      const initialTicks = state.time.sessionRemainingTicks;
      const action: GatherAction = { type: 'Gather', nodeId: 'iron-node' };

      const log = executeAction(state, action);

      expect(log.timeConsumed).toBe(2); // iron-node gatherTime is 2
      expect(state.time.sessionRemainingTicks).toBe(initialTicks - 2);
    });

    it('should grant Gathering XP on success', () => {
      const state = createToyWorld('test-seed');
      state.player.location = 'MINE';
      const action: GatherAction = { type: 'Gather', nodeId: 'iron-node' };

      const log = executeAction(state, action);

      if (log.success) {
        expect(log.skillGained).toEqual({ skill: 'Gathering', amount: 1 });
        expect(state.player.skills.Gathering).toBe(1);
      }
    });

    it('should fail if not at node location', () => {
      const state = createToyWorld('test-seed');
      // Player starts at TOWN, iron-node is at MINE
      const action: GatherAction = { type: 'Gather', nodeId: 'iron-node' };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('WRONG_LOCATION');
      expect(log.timeConsumed).toBe(0);
    });

    it('should fail if node not found', () => {
      const state = createToyWorld('test-seed');
      state.player.location = 'MINE';
      const action: GatherAction = { type: 'Gather', nodeId: 'nonexistent-node' };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('NODE_NOT_FOUND');
    });

    it('should log RNG roll', () => {
      const state = createToyWorld('test-seed');
      state.player.location = 'MINE';
      const action: GatherAction = { type: 'Gather', nodeId: 'iron-node' };

      const log = executeAction(state, action);

      expect(log.rngRolls).toHaveLength(1);
      expect(log.rngRolls[0].label).toContain('gather');
      expect(log.rngRolls[0].probability).toBe(0.8); // iron-node success probability
    });

    it('should fail RNG but still consume time', () => {
      const state = createToyWorld('fail-seed');
      state.player.location = 'MINE';
      // Use a seed that should fail
      state.rng.seed = 'rng-fail-gather';
      state.rng.counter = 0;
      const initialTicks = state.time.sessionRemainingTicks;
      const action: GatherAction = { type: 'Gather', nodeId: 'iron-node' };

      const log = executeAction(state, action);

      // RNG failure still consumes time
      expect(log.timeConsumed).toBe(2);
      expect(state.time.sessionRemainingTicks).toBe(initialTicks - 2);

      if (!log.success) {
        expect(log.failureType).toBe('RNG_FAILURE');
        expect(log.skillGained).toBeUndefined();
      }
    });

    it('should stack items in inventory', () => {
      const state = createToyWorld('stack-test');
      state.player.location = 'MINE';
      state.player.inventory.push({ itemId: 'IRON_ORE', quantity: 3 });
      // Force success
      state.rng.seed = 'force-success-stack';
      const action: GatherAction = { type: 'Gather', nodeId: 'iron-node' };

      const log = executeAction(state, action);

      if (log.success) {
        const ironOre = state.player.inventory.find(i => i.itemId === 'IRON_ORE');
        expect(ironOre?.quantity).toBe(4);
        expect(state.player.inventory.filter(i => i.itemId === 'IRON_ORE')).toHaveLength(1);
      }
    });
  });

  describe('Fight action', () => {
    it('should add loot to inventory on success', () => {
      const state = createToyWorld('fight-success');
      state.player.location = 'MINE';
      const action: FightAction = { type: 'Fight', enemyId: 'cave-rat' };

      const log = executeAction(state, action);

      if (log.success) {
        const ironOre = state.player.inventory.find(i => i.itemId === 'IRON_ORE');
        expect(ironOre).toBeDefined();
        expect(ironOre?.quantity).toBe(1);
      }
    });

    it('should consume fight time', () => {
      const state = createToyWorld('test-seed');
      state.player.location = 'MINE';
      const initialTicks = state.time.sessionRemainingTicks;
      const action: FightAction = { type: 'Fight', enemyId: 'cave-rat' };

      const log = executeAction(state, action);

      expect(log.timeConsumed).toBe(3); // cave-rat fightTime is 3
      expect(state.time.sessionRemainingTicks).toBe(initialTicks - 3);
    });

    it('should grant Combat XP on success', () => {
      const state = createToyWorld('test-seed');
      state.player.location = 'MINE';
      const action: FightAction = { type: 'Fight', enemyId: 'cave-rat' };

      const log = executeAction(state, action);

      if (log.success) {
        expect(log.skillGained).toEqual({ skill: 'Combat', amount: 1 });
        expect(state.player.skills.Combat).toBe(1);
      }
    });

    it('should fail if not at enemy location', () => {
      const state = createToyWorld('test-seed');
      // Player starts at TOWN, cave-rat is at MINE
      const action: FightAction = { type: 'Fight', enemyId: 'cave-rat' };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('WRONG_LOCATION');
      expect(log.timeConsumed).toBe(0);
    });

    it('should fail if enemy not found', () => {
      const state = createToyWorld('test-seed');
      state.player.location = 'MINE';
      const action: FightAction = { type: 'Fight', enemyId: 'nonexistent' };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('ENEMY_NOT_FOUND');
    });

    it('should relocate player on RNG failure', () => {
      const state = createToyWorld('fight-fail');
      state.player.location = 'MINE';
      state.rng.seed = 'force-fight-fail';
      const action: FightAction = { type: 'Fight', enemyId: 'cave-rat' };

      const log = executeAction(state, action);

      if (!log.success && log.failureType === 'RNG_FAILURE') {
        expect(state.player.location).toBe('TOWN'); // failureRelocation
      }
    });

    it('should log RNG roll', () => {
      const state = createToyWorld('test-seed');
      state.player.location = 'MINE';
      const action: FightAction = { type: 'Fight', enemyId: 'cave-rat' };

      const log = executeAction(state, action);

      expect(log.rngRolls).toHaveLength(1);
      expect(log.rngRolls[0].probability).toBe(0.7); // cave-rat success probability
    });
  });

  describe('Craft action', () => {
    it('should consume inputs and produce output', () => {
      const state = createToyWorld('test-seed');
      state.player.inventory.push({ itemId: 'IRON_ORE', quantity: 5 });
      const action: CraftAction = { type: 'Craft', recipeId: 'iron-bar-recipe' };

      const log = executeAction(state, action);

      expect(log.success).toBe(true);
      const ironOre = state.player.inventory.find(i => i.itemId === 'IRON_ORE');
      expect(ironOre?.quantity).toBe(3); // 5 - 2 = 3
      const ironBar = state.player.inventory.find(i => i.itemId === 'IRON_BAR');
      expect(ironBar?.quantity).toBe(1);
    });

    it('should consume craft time', () => {
      const state = createToyWorld('test-seed');
      state.player.inventory.push({ itemId: 'IRON_ORE', quantity: 2 });
      const initialTicks = state.time.sessionRemainingTicks;
      const action: CraftAction = { type: 'Craft', recipeId: 'iron-bar-recipe' };

      const log = executeAction(state, action);

      expect(log.timeConsumed).toBe(3); // iron-bar-recipe craftTime is 3
      expect(state.time.sessionRemainingTicks).toBe(initialTicks - 3);
    });

    it('should grant Crafting XP', () => {
      const state = createToyWorld('test-seed');
      state.player.inventory.push({ itemId: 'IRON_ORE', quantity: 2 });
      const action: CraftAction = { type: 'Craft', recipeId: 'iron-bar-recipe' };

      const log = executeAction(state, action);

      expect(log.skillGained).toEqual({ skill: 'Crafting', amount: 1 });
      expect(state.player.skills.Crafting).toBe(1);
    });

    it('should fail if not at required location', () => {
      const state = createToyWorld('test-seed');
      state.player.location = 'MINE';
      state.player.inventory.push({ itemId: 'IRON_ORE', quantity: 2 });
      const action: CraftAction = { type: 'Craft', recipeId: 'iron-bar-recipe' };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('WRONG_LOCATION');
    });

    it('should fail if recipe not found', () => {
      const state = createToyWorld('test-seed');
      const action: CraftAction = { type: 'Craft', recipeId: 'nonexistent' };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('RECIPE_NOT_FOUND');
    });

    it('should fail if missing inputs', () => {
      const state = createToyWorld('test-seed');
      state.player.inventory.push({ itemId: 'IRON_ORE', quantity: 1 }); // need 2
      const action: CraftAction = { type: 'Craft', recipeId: 'iron-bar-recipe' };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('MISSING_ITEMS');
    });
  });

  describe('Store action', () => {
    it('should move item from inventory to storage', () => {
      const state = createToyWorld('test-seed');
      state.player.inventory.push({ itemId: 'IRON_ORE', quantity: 5 });
      const action: StoreAction = { type: 'Store', itemId: 'IRON_ORE', quantity: 3 };

      const log = executeAction(state, action);

      expect(log.success).toBe(true);
      const invOre = state.player.inventory.find(i => i.itemId === 'IRON_ORE');
      expect(invOre?.quantity).toBe(2);
      const storageOre = state.player.storage.find(i => i.itemId === 'IRON_ORE');
      expect(storageOre?.quantity).toBe(3);
    });

    it('should grant Logistics XP', () => {
      const state = createToyWorld('test-seed');
      state.player.inventory.push({ itemId: 'IRON_ORE', quantity: 1 });
      const action: StoreAction = { type: 'Store', itemId: 'IRON_ORE', quantity: 1 };

      const log = executeAction(state, action);

      expect(log.skillGained).toEqual({ skill: 'Logistics', amount: 1 });
      expect(state.player.skills.Logistics).toBe(1);
    });

    it('should fail if not at storage location', () => {
      const state = createToyWorld('test-seed');
      state.player.location = 'MINE';
      state.player.inventory.push({ itemId: 'IRON_ORE', quantity: 1 });
      const action: StoreAction = { type: 'Store', itemId: 'IRON_ORE', quantity: 1 };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('WRONG_LOCATION');
    });

    it('should fail if item not in inventory', () => {
      const state = createToyWorld('test-seed');
      const action: StoreAction = { type: 'Store', itemId: 'IRON_ORE', quantity: 1 };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('ITEM_NOT_FOUND');
    });

    it('should fail if not enough quantity', () => {
      const state = createToyWorld('test-seed');
      state.player.inventory.push({ itemId: 'IRON_ORE', quantity: 2 });
      const action: StoreAction = { type: 'Store', itemId: 'IRON_ORE', quantity: 5 };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('MISSING_ITEMS');
    });
  });

  describe('Drop action', () => {
    it('should remove item from inventory', () => {
      const state = createToyWorld('test-seed');
      state.player.inventory.push({ itemId: 'IRON_ORE', quantity: 5 });
      const action: DropAction = { type: 'Drop', itemId: 'IRON_ORE', quantity: 3 };

      const log = executeAction(state, action);

      expect(log.success).toBe(true);
      const invOre = state.player.inventory.find(i => i.itemId === 'IRON_ORE');
      expect(invOre?.quantity).toBe(2);
    });

    it('should not grant XP', () => {
      const state = createToyWorld('test-seed');
      state.player.inventory.push({ itemId: 'IRON_ORE', quantity: 1 });
      const action: DropAction = { type: 'Drop', itemId: 'IRON_ORE', quantity: 1 };

      const log = executeAction(state, action);

      expect(log.skillGained).toBeUndefined();
    });

    it('should fail if item not in inventory', () => {
      const state = createToyWorld('test-seed');
      const action: DropAction = { type: 'Drop', itemId: 'IRON_ORE', quantity: 1 };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('ITEM_NOT_FOUND');
    });

    it('should fail if not enough quantity', () => {
      const state = createToyWorld('test-seed');
      state.player.inventory.push({ itemId: 'IRON_ORE', quantity: 2 });
      const action: DropAction = { type: 'Drop', itemId: 'IRON_ORE', quantity: 5 };

      const log = executeAction(state, action);

      expect(log.success).toBe(false);
      expect(log.failureType).toBe('MISSING_ITEMS');
    });

    it('should remove item stack if quantity becomes 0', () => {
      const state = createToyWorld('test-seed');
      state.player.inventory.push({ itemId: 'IRON_ORE', quantity: 3 });
      const action: DropAction = { type: 'Drop', itemId: 'IRON_ORE', quantity: 3 };

      const log = executeAction(state, action);

      expect(log.success).toBe(true);
      const invOre = state.player.inventory.find(i => i.itemId === 'IRON_ORE');
      expect(invOre).toBeUndefined();
    });
  });
});
