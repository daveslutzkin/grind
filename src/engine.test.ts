import { executeAction } from './engine.js';
import { createToyWorld } from './world.js';
import type { MoveAction } from './types.js';

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
});
