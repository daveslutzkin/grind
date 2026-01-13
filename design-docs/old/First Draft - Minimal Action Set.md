# Minimal Action Set – v1

This document defines the **smallest possible action set** that allows:
- one agent
- one session
- one loop of planning → acting → observing → learning

The goal is **not realism** and **not completeness**.
The goal is to make it possible to:
- simulate sessions
- detect degeneracy
- exercise inventory, RNG, time, and contracts

If an action does not support those goals, it does not belong in v1.

---

## Design Rules for v1 Actions

All actions:
- Are **atomic**
- Have **binary outcomes** (success or typed failure)
- Consume **discrete time**
- Mutate `WorldState` directly
- Advance **exactly one primary skill** on success
- Are **skill-gated** by minimum required level
- Are fully loggable and replayable

No action:
- Contains sub-actions
- Hides internal randomness
- Makes decisions for the agent

In v1, all actions award a flat +1 XP to their primary skill on success.

---


## Core Action Categories (v1)

The entire v1 engine can be built around **six actions**.

1. Move
2. AcceptContract
3. Gather
4. Fight
5. Craft
6. Store

Everything else is deferred.

---

## 1. Move

### Purpose
- Change player location
- Consume time
- Exercise world geography and routing
- Advance movement-related skill

### Primary Skill
- Travel (or equivalent)

### Action Schema
```ts
MoveAction {
  type: "move"
  actor: PlayerID
  destination: LocationID
}
```

### Preconditions
- Destination exists
- Destination is reachable from current location
- Player Travel skill ≥ required level

### Effects (on success)
- Player location set to destination
- Time reduced by travel cost
- Travel skill XP awarded

### Failure Modes
- INVALID_DESTINATION (no time)
- UNREACHABLE (no time)
- INSUFFICIENT_SKILL (no time)

---


## 2. AcceptContract

### Purpose
- Introduce goals
- Bind player to a task
- Drive session planning

### Primary Skill
- None (administrative action)

### Action Schema
```ts
AcceptContractAction {
  type: "accept_contract"
  actor: PlayerID
  contractId: ContractID
}
```

### Preconditions
- Contract exists
- Contract is offered to the player
- Player is at issuing guild location

### Effects (on success)
- Contract added to player’s active contracts
- No time cost

### Failure Modes
- CONTRACT_NOT_AVAILABLE (no time)
- NOT_AT_LOCATION (no time)

---


## 3. Gather

### Purpose
- Primary resource acquisition
- Exercise inventory limits
- Introduce RNG

### Primary Skill
- Gathering skill (e.g. Mining, Harvesting)

### Action Schema
```ts
GatherAction {
  type: "gather"
  actor: PlayerID
  resourceNodeId: ResourceNodeID
}
```

### Preconditions
- Player is at node location
- Player Gathering skill ≥ required level
- Node is gatherable by player class/profession
- Inventory has space

### Effects (on success)
- Resource item added to inventory
- Time reduced by gather cost
- Gathering skill XP awarded
- RNG draw logged

### Failure Modes
- NOT_AT_LOCATION (no time)
- INSUFFICIENT_SKILL (no time)
- CANNOT_GATHER (no time)
- INVENTORY_FULL (time consumed)
- RNG_FAILURE (time consumed)

---


## 4. Fight

### Purpose
- Combat loop
- Rare item drops
- Risk vs reward

### Primary Skill
- Combat

### Action Schema
```ts
FightAction {
  type: "fight"
  actor: PlayerID
  enemyId: EnemyID
}
```

### Preconditions
- Player is at enemy location
- Player Combat skill ≥ required level
- Enemy is fightable

### Effects (on success)
- Enemy defeated
- Loot roll executed
- Items added to inventory
- Time reduced by fight cost
- Combat skill XP awarded

### Failure Modes
- NOT_AT_LOCATION (no time)
- INSUFFICIENT_SKILL (no time)
- CANNOT_FIGHT (no time)
- COMBAT_FAILURE (time consumed, relocation)

---


## 5. Craft

### Purpose
- Convert resources into items
- Exercise recipes, RNG, and inventory

### Primary Skill
- Crafting skill (e.g. Smithing)

### Action Schema
```ts
CraftAction {
  type: "craft"
  actor: PlayerID
  recipeId: RecipeID
}
```

### Preconditions
- Player knows recipe
- Player Crafting skill ≥ required level
- Required inputs present in inventory
- Player at valid crafting location

### Effects (on success)
- Inputs removed from inventory
- Output item added
- Time reduced by craft cost
- Crafting skill XP awarded
- RNG draw logged (if applicable)

### Failure Modes
- MISSING_INPUTS (no time)
- INSUFFICIENT_SKILL (no time)
- INVALID_LOCATION (no time)
- INVENTORY_FULL (time consumed)
- RNG_FAILURE (time consumed)

---


## 6. Store

### Purpose
- Manage inventory pressure
- Enable logistics loops

### Primary Skill
- Logistics (or equivalent)

### Action Schema
```ts
StoreAction {
  type: "store"
  actor: PlayerID
  itemStackId: ItemStackID
  storageId: StorageID
}
```

### Preconditions
- Player at storage location
- Player Logistics skill ≥ required level
- Storage exists

### Effects (on success)
- Items moved from inventory to storage
- Time reduced by storage cost
- Logistics skill XP awarded

### Failure Modes
- NOT_AT_LOCATION (no time)
- INSUFFICIENT_SKILL (no time)
- STORAGE_FULL (time consumed)

---


## 7. Drop

### Purpose
- Emergency inventory relief
- Make mistakes explicit and costly

### Primary Skill
- None

### Action Schema
```ts
DropAction {
  type: "drop"
  actor: PlayerID
  itemStackId: ItemStackID
}
```

### Preconditions
- Item exists in inventory

### Effects (on success)
- Item permanently destroyed
- Time reduced by drop cost

### Failure Modes
- ITEM_NOT_FOUND (no time)

---

## Explicitly Excluded from v1

The following are **intentionally not actions** in v1:

- Equip / Unequip
- Trade
- Talk / Dialogue
- Use consumables
- Teleport
- Multi-step combat

If something cannot be expressed using the seven actions above, it is out of scope.

---

