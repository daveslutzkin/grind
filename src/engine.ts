import type {
  WorldState,
  Action,
  ActionLog,
  RngRoll,
  MoveAction,
  FailureType,
} from './types.js';

function createFailureLog(
  state: WorldState,
  action: Action,
  failureType: FailureType,
  timeConsumed: number = 0
): ActionLog {
  return {
    tickBefore: state.time.currentTick,
    actionType: action.type,
    parameters: extractParameters(action),
    success: false,
    failureType,
    timeConsumed,
    rngRolls: [],
    stateDeltaSummary: `Failed: ${failureType}`,
  };
}

function extractParameters(action: Action): Record<string, unknown> {
  const { type, ...params } = action;
  return params;
}

function consumeTime(state: WorldState, ticks: number): void {
  state.time.currentTick += ticks;
  state.time.sessionRemainingTicks -= ticks;
}

function executeMove(state: WorldState, action: MoveAction, rolls: RngRoll[]): ActionLog {
  const tickBefore = state.time.currentTick;
  const fromLocation = state.player.location;
  const destination = action.destination;

  // Check if already at destination
  if (fromLocation === destination) {
    return createFailureLog(state, action, 'WRONG_LOCATION');
  }

  // Get travel cost
  const travelKey = `${fromLocation}->${destination}`;
  const travelCost = state.world.travelCosts[travelKey];

  if (travelCost === undefined) {
    return createFailureLog(state, action, 'WRONG_LOCATION');
  }

  // Move player
  state.player.location = destination;
  consumeTime(state, travelCost);

  // Grant XP
  state.player.skills.Travel += 1;

  return {
    tickBefore,
    actionType: 'Move',
    parameters: { destination },
    success: true,
    timeConsumed: travelCost,
    skillGained: { skill: 'Travel', amount: 1 },
    rngRolls: rolls,
    stateDeltaSummary: `Moved from ${fromLocation} to ${destination}`,
  };
}

export function executeAction(state: WorldState, action: Action): ActionLog {
  const rolls: RngRoll[] = [];

  // Check if session has ended
  if (state.time.sessionRemainingTicks <= 0) {
    return createFailureLog(state, action, 'SESSION_ENDED');
  }

  switch (action.type) {
    case 'Move':
      return executeMove(state, action, rolls);
    default:
      throw new Error(`Action type ${action.type} not implemented`);
  }
}
