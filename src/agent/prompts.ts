/**
 * Response format instructions for the agent
 */
export const RESPONSE_FORMAT = `
Respond using this exact format:

REASONING: [Explain your thought process - what you understand about the game state, what you're trying to achieve, and why you're choosing this action]

ACTION: [The action to take - see action formats below]

LEARNING: [What you learned from the previous action result, if any. Note any new discoveries about game mechanics, costs, probabilities, or effects]

CONTINUE_IF: [Optional - condition for repeating the action, e.g., "inventory not full and node not depleted"]

Action formats:
- Move to <LOCATION>
- Enrol <SKILL>
- Gather node <NODE_ID> <MODE> [MATERIAL_ID]
  - Modes: FOCUS (requires material ID), CAREFUL_ALL, APPRAISE
- Fight <ENEMY_ID>
- Craft <RECIPE_ID>
- Store <QUANTITY> <ITEM_ID>
- Drop <QUANTITY> <ITEM_ID>
- AcceptContract <CONTRACT_ID>
- TurnInCombatToken
`

/**
 * Create the system prompt for the agent
 */
export function createSystemPrompt(objective: string): string {
  return `You are playing a text-based game. Your goal is to: ${objective}

GAME OVERVIEW:
- This is a resource gathering and progression game
- Time is measured in "ticks" - each action costs some ticks
- Sessions are limited - you have a fixed number of ticks
- You have an inventory with limited slots
- You can learn skills and level them up through practice
- Some actions require specific skills or locations

AVAILABLE ACTION TYPES:
- Move: Travel between locations (costs ticks based on distance)
- Enrol: Learn a new skill at the guild (one-time unlock)
- Gather: Extract resources from nodes (various modes available)
- Fight: Battle enemies (requires Combat skill and a weapon)
- Craft: Combine materials into new items (requires recipes)
- Store: Put items in storage at town (frees inventory space)
- Drop: Discard items (takes time for disposal)
- AcceptContract: Accept a guild contract for rewards
- TurnInCombatToken: Unlock combat contracts

DISCOVERY APPROACH:
- You start with limited knowledge about the game
- Discover mechanics through experimentation
- Learn from successes and failures
- Note patterns in costs, yields, and probabilities
- Build up understanding over time

The game state will be provided to you before each decision. After each action, you'll see the result.

${RESPONSE_FORMAT}

Remember:
- Think before acting - consider what you know and don't know
- Failed actions still cost time - learn from failures
- Document your discoveries in the LEARNING section
- You can use CONTINUE_IF to repeat an action conditionally
- Your inventory has limited space - manage it wisely`
}
