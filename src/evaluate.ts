import type {
  WorldState,
  Action,
  ActionEvaluation,
  PlanEvaluation,
  PlanViolation,
  MoveAction,
  AcceptContractAction,
  GatherAction,
  FightAction,
  CraftAction,
  StoreAction,
  DropAction,
  ItemStack,
} from './types.js';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function hasItems(inventory: ItemStack[], required: ItemStack[]): boolean {
  for (const req of required) {
    const item = inventory.find(i => i.itemId === req.itemId);
    if (!item || item.quantity < req.quantity) {
      return false;
    }
  }
  return true;
}

function evaluateMoveAction(
  state: WorldState,
  action: MoveAction
): ActionEvaluation {
  const fromLocation = state.player.location;
  const destination = action.destination;

  // Check if already at destination
  if (fromLocation === destination) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  const travelKey = `${fromLocation}->${destination}`;
  const travelCost = state.world.travelCosts[travelKey];

  if (travelCost === undefined) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  // Check skill requirement (Travel >= travel cost)
  if (state.player.skills.Travel < travelCost) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  return {
    expectedTime: travelCost,
    expectedXP: 1,
    successProbability: 1,
  };
}

function evaluateAcceptContractAction(
  state: WorldState,
  action: AcceptContractAction
): ActionEvaluation {
  const contract = state.world.contracts.find(c => c.id === action.contractId);

  if (!contract) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  if (state.player.location !== contract.guildLocation) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  if (state.player.activeContracts.includes(action.contractId)) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  return {
    expectedTime: 0,
    expectedXP: 0,
    successProbability: 1,
  };
}

function getInventoryCount(state: WorldState): number {
  return state.player.inventory.reduce((sum, item) => sum + item.quantity, 0);
}

function evaluateGatherAction(
  state: WorldState,
  action: GatherAction
): ActionEvaluation {
  const node = state.world.resourceNodes.find(n => n.id === action.nodeId);

  if (!node) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  if (state.player.location !== node.location) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  // Check skill requirement
  if (state.player.skills.Gathering < node.requiredSkillLevel) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  // Check inventory capacity
  if (getInventoryCount(state) >= state.player.inventoryCapacity) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  return {
    expectedTime: node.gatherTime,
    expectedXP: 1 * node.successProbability,
    successProbability: node.successProbability,
  };
}

function evaluateFightAction(
  state: WorldState,
  action: FightAction
): ActionEvaluation {
  const enemy = state.world.enemies.find(e => e.id === action.enemyId);

  if (!enemy) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  if (state.player.location !== enemy.location) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  // Check skill requirement
  if (state.player.skills.Combat < enemy.requiredSkillLevel) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  return {
    expectedTime: enemy.fightTime,
    expectedXP: 1 * enemy.successProbability,
    successProbability: enemy.successProbability,
  };
}

function evaluateCraftAction(
  state: WorldState,
  action: CraftAction
): ActionEvaluation {
  const recipe = state.world.recipes.find(r => r.id === action.recipeId);

  if (!recipe) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  if (state.player.location !== recipe.requiredLocation) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  // Check skill requirement
  if (state.player.skills.Crafting < recipe.requiredSkillLevel) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  if (!hasItems(state.player.inventory, recipe.inputs)) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  return {
    expectedTime: recipe.craftTime,
    expectedXP: 1,
    successProbability: 1,
  };
}

function evaluateStoreAction(
  state: WorldState,
  action: StoreAction
): ActionEvaluation {
  if (state.player.location !== state.world.storageLocation) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  // Check skill requirement
  if (state.player.skills.Logistics < state.world.storageRequiredSkillLevel) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  const item = state.player.inventory.find(i => i.itemId === action.itemId);
  if (!item || item.quantity < action.quantity) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  return {
    expectedTime: 1,
    expectedXP: 1,
    successProbability: 1,
  };
}

function evaluateDropAction(
  state: WorldState,
  action: DropAction
): ActionEvaluation {
  const item = state.player.inventory.find(i => i.itemId === action.itemId);
  if (!item || item.quantity < action.quantity) {
    return { expectedTime: 0, expectedXP: 0, successProbability: 0 };
  }

  return {
    expectedTime: 1,
    expectedXP: 0,
    successProbability: 1,
  };
}

export function evaluateAction(
  state: WorldState,
  action: Action
): ActionEvaluation {
  switch (action.type) {
    case 'Move':
      return evaluateMoveAction(state, action);
    case 'AcceptContract':
      return evaluateAcceptContractAction(state, action);
    case 'Gather':
      return evaluateGatherAction(state, action);
    case 'Fight':
      return evaluateFightAction(state, action);
    case 'Craft':
      return evaluateCraftAction(state, action);
    case 'Store':
      return evaluateStoreAction(state, action);
    case 'Drop':
      return evaluateDropAction(state, action);
  }
}

// Determine failure reason for an action
function getFailureReason(state: WorldState, action: Action): string {
  switch (action.type) {
    case 'Move': {
      const fromLocation = state.player.location;
      if (fromLocation === action.destination) {
        return 'WRONG_LOCATION';
      }
      const travelKey = `${fromLocation}->${action.destination}`;
      const travelCost = state.world.travelCosts[travelKey];
      if (travelCost === undefined) {
        return 'WRONG_LOCATION';
      }
      if (state.player.skills.Travel < travelCost) {
        return 'INSUFFICIENT_SKILL';
      }
      return 'WRONG_LOCATION';
    }
    case 'AcceptContract': {
      const contract = state.world.contracts.find(c => c.id === action.contractId);
      if (!contract) {
        return 'CONTRACT_NOT_FOUND';
      }
      if (state.player.location !== contract.guildLocation) {
        return 'WRONG_LOCATION';
      }
      if (state.player.activeContracts.includes(action.contractId)) {
        return 'ALREADY_HAS_CONTRACT';
      }
      return 'CONTRACT_NOT_FOUND';
    }
    case 'Gather': {
      const node = state.world.resourceNodes.find(n => n.id === action.nodeId);
      if (!node) {
        return 'NODE_NOT_FOUND';
      }
      if (state.player.location !== node.location) {
        return 'WRONG_LOCATION';
      }
      if (state.player.skills.Gathering < node.requiredSkillLevel) {
        return 'INSUFFICIENT_SKILL';
      }
      const invCount = state.player.inventory.reduce((sum, item) => sum + item.quantity, 0);
      if (invCount >= state.player.inventoryCapacity) {
        return 'INVENTORY_FULL';
      }
      return 'NODE_NOT_FOUND';
    }
    case 'Fight': {
      const enemy = state.world.enemies.find(e => e.id === action.enemyId);
      if (!enemy) {
        return 'ENEMY_NOT_FOUND';
      }
      if (state.player.location !== enemy.location) {
        return 'WRONG_LOCATION';
      }
      if (state.player.skills.Combat < enemy.requiredSkillLevel) {
        return 'INSUFFICIENT_SKILL';
      }
      return 'ENEMY_NOT_FOUND';
    }
    case 'Craft': {
      const recipe = state.world.recipes.find(r => r.id === action.recipeId);
      if (!recipe) {
        return 'RECIPE_NOT_FOUND';
      }
      if (state.player.location !== recipe.requiredLocation) {
        return 'WRONG_LOCATION';
      }
      if (state.player.skills.Crafting < recipe.requiredSkillLevel) {
        return 'INSUFFICIENT_SKILL';
      }
      if (!hasItems(state.player.inventory, recipe.inputs)) {
        return 'MISSING_ITEMS';
      }
      return 'RECIPE_NOT_FOUND';
    }
    case 'Store': {
      if (state.player.location !== state.world.storageLocation) {
        return 'WRONG_LOCATION';
      }
      if (state.player.skills.Logistics < state.world.storageRequiredSkillLevel) {
        return 'INSUFFICIENT_SKILL';
      }
      const item = state.player.inventory.find(i => i.itemId === action.itemId);
      if (!item) {
        return 'ITEM_NOT_FOUND';
      }
      if (item.quantity < action.quantity) {
        return 'MISSING_ITEMS';
      }
      return 'ITEM_NOT_FOUND';
    }
    case 'Drop': {
      const item = state.player.inventory.find(i => i.itemId === action.itemId);
      if (!item) {
        return 'ITEM_NOT_FOUND';
      }
      if (item.quantity < action.quantity) {
        return 'MISSING_ITEMS';
      }
      return 'ITEM_NOT_FOUND';
    }
  }
}

// Simulate applying an action to state (for plan evaluation)
function simulateAction(state: WorldState, action: Action): string | null {
  const eval_ = evaluateAction(state, action);

  if (eval_.successProbability === 0) {
    return getFailureReason(state, action);
  }

  // Check if session has ended or would end before action completes
  if (state.time.sessionRemainingTicks <= 0 || state.time.sessionRemainingTicks < eval_.expectedTime) {
    return 'SESSION_ENDED';
  }

  // Apply the action effects (optimistically assuming success for RNG-based actions)
  state.time.currentTick += eval_.expectedTime;
  state.time.sessionRemainingTicks -= eval_.expectedTime;

  switch (action.type) {
    case 'Move':
      state.player.location = action.destination;
      break;
    case 'AcceptContract':
      state.player.activeContracts.push(action.contractId);
      break;
    case 'Gather': {
      const node = state.world.resourceNodes.find(n => n.id === action.nodeId);
      if (node) {
        const existing = state.player.inventory.find(i => i.itemId === node.itemId);
        if (existing) {
          existing.quantity += 1;
        } else {
          state.player.inventory.push({ itemId: node.itemId, quantity: 1 });
        }
      }
      break;
    }
    case 'Fight': {
      const enemy = state.world.enemies.find(e => e.id === action.enemyId);
      if (enemy) {
        for (const loot of enemy.loot) {
          const existing = state.player.inventory.find(i => i.itemId === loot.itemId);
          if (existing) {
            existing.quantity += loot.quantity;
          } else {
            state.player.inventory.push({ itemId: loot.itemId, quantity: loot.quantity });
          }
        }
      }
      break;
    }
    case 'Craft': {
      const recipe = state.world.recipes.find(r => r.id === action.recipeId);
      if (recipe) {
        // Remove inputs
        for (const input of recipe.inputs) {
          const item = state.player.inventory.find(i => i.itemId === input.itemId);
          if (item) {
            item.quantity -= input.quantity;
            if (item.quantity <= 0) {
              const index = state.player.inventory.indexOf(item);
              state.player.inventory.splice(index, 1);
            }
          }
        }
        // Add output
        const existing = state.player.inventory.find(i => i.itemId === recipe.output.itemId);
        if (existing) {
          existing.quantity += recipe.output.quantity;
        } else {
          state.player.inventory.push({ itemId: recipe.output.itemId, quantity: recipe.output.quantity });
        }
      }
      break;
    }
    case 'Store': {
      const invItem = state.player.inventory.find(i => i.itemId === action.itemId);
      if (invItem) {
        invItem.quantity -= action.quantity;
        if (invItem.quantity <= 0) {
          const index = state.player.inventory.indexOf(invItem);
          state.player.inventory.splice(index, 1);
        }
        const storageItem = state.player.storage.find(i => i.itemId === action.itemId);
        if (storageItem) {
          storageItem.quantity += action.quantity;
        } else {
          state.player.storage.push({ itemId: action.itemId, quantity: action.quantity });
        }
      }
      break;
    }
    case 'Drop': {
      const item = state.player.inventory.find(i => i.itemId === action.itemId);
      if (item) {
        item.quantity -= action.quantity;
        if (item.quantity <= 0) {
          const index = state.player.inventory.indexOf(item);
          state.player.inventory.splice(index, 1);
        }
      }
      break;
    }
  }

  return null;
}

export function evaluatePlan(
  state: WorldState,
  actions: Action[]
): PlanEvaluation {
  // Clone state to avoid mutation
  const simState = deepClone(state);

  let expectedTime = 0;
  let expectedXP = 0;
  const violations: PlanViolation[] = [];

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const eval_ = evaluateAction(simState, action);

    if (eval_.successProbability === 0) {
      const reason = simulateAction(simState, action);
      violations.push({
        actionIndex: i,
        reason: reason || 'Invalid action',
      });
      continue;
    }

    // Check if session has ended or would end before action completes
    if (simState.time.sessionRemainingTicks <= 0 || simState.time.sessionRemainingTicks < eval_.expectedTime) {
      violations.push({
        actionIndex: i,
        reason: 'SESSION_ENDED: Not enough time remaining',
      });
      continue;
    }

    expectedTime += eval_.expectedTime;
    expectedXP += eval_.expectedXP;

    // Simulate the action
    simulateAction(simState, action);
  }

  return {
    expectedTime,
    expectedXP,
    violations,
  };
}
