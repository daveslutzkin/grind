/**
 * Response format instructions for the agent
 */
export const RESPONSE_FORMAT = `
Respond using this exact format:

REASONING: [Explain your thought process - what you understand about the game state, what you're trying to achieve, and why you're choosing this action]

ACTION: [The action to take - see action formats below]

LEARNING: [What you learned from the previous action result, if any. Note any new discoveries about game mechanics, costs, probabilities, or effects]

NOTES: [Optional - Your persistent memory. Update this to remember important discoveries you want to recall later. This replaces your previous notes entirely, so include everything you want to remember. Keep it concise but comprehensive.]

CONTINUE_IF: [Optional - condition for repeating the action, e.g., "inventory not full and node not depleted"]

Action formats:
- go <area name>
- go <location in current area>
- fartravel <far away area name>
- leave
- explore
- survey
- enrol
- accept <contract_id>
- mine <focus | careful_all | appraise> [material_id]
- chop <focus | careful_all | appraise> [material_id]
- fight
- craft <recipe_id>
- store <quantity> <item_id>
- drop <quantity> <item_id>
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

AVAILABLE ACTIONS:
- The state always shows "Available actions:" listing valid actions for your current situation
- Each action shows its time cost in ticks (t)
- Actions marked "~Nt, varies" have RNG-dependent duration (exploration actions)
- Actions with success probability shown (e.g., "70% success") may fail
- Only attempt actions from this list
- Arguments shown as <placeholder> must be filled with valid values from the state

YOUR MEMORY SYSTEM:
- You only see what's visible at your current location
- When you leave a location, you won't see its details anymore
- Use the NOTES section to remember important discoveries
- Your notes persist between turns and are shown to you each turn
- Update your notes when you discover something worth remembering
- Examples of things worth noting:
  - Contracts you've seen (requirements, rewards, where to accept)
  - Recipes you've discovered at guild halls
  - Travel times between areas
  - Resource locations and what materials they have
  - Game mechanics you've figured out

DISCOVERY APPROACH:
- You start knowing nothing about the game world
- Explore to discover what exists
- When you visit somewhere new, observe what's available
- Write important discoveries in your NOTES so you remember them
- Learn from successes and failures

The game state will show you what's visible RIGHT NOW at your current location. Your NOTES (if any) will be shown separately.

${RESPONSE_FORMAT}

Remember:
- Think before acting - consider what you know and don't know
- You only see your current location - use NOTES to remember other places
- Failed actions still cost time - learn from failures
- Document learnings, but put facts to remember in NOTES
- Your inventory has limited space - manage it wisely

EXAMPLE OF GOOD NOTES FORMAT:
"Areas visited: [list]. Travel times: [A→B: Xt].
Skills: [name] L[n] ([x]/[y] XP). Current plan: [goal]."

EXAMPLE OF GOOD REASONING:
"I see [observation]. My notes say [relevant fact].
I should [action] because [reason]. If it fails, I'll try [backup]."

NOTE-TAKING STRATEGY:
- Use consistent shorthand (L2 = level 2, t = ticks)
- Group related facts (all travel times together)
- Update incrementally - don't rewrite everything each turn
- Prioritize: contracts > resources > travel > misc
`
}
