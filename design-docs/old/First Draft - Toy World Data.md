# Toy World Data – v1 Vertical Slice

This document defines the **smallest possible concrete world** that can be loaded into the rules engine and exercised by:
- one human tester
- one simulated agent

The goal is not balance or realism. The goal is to:
- make sessions runnable end-to-end
- surface optimisation choices
- allow degeneracy to appear

Everything here is intentionally tiny.

---

## 1. World Map

### Locations

```ts
LocationID = "TOWN" | "MINE" | "FOREST"
```

#### TOWN
- Guild hall
- Storage
- Crafting station

#### MINE
- Ore resource node
- Enemy spawn

#### FOREST
- Wood resource node

### Travel Graph

```ts
TOWN <-> MINE   (cost: 3 ticks)
TOWN <-> FOREST (cost: 2 ticks)
MINE <-> FOREST (cost: 4 ticks)
```

---

## 2. Skills (Initial Set)

```ts
SkillID = "Travel" | "Mining" | "Woodcutting" | "Combat" | "Smithing" | "Logistics"
```

### Initial Skill Levels

- All skills start at level 1

### Skill Gates (v1)

- Level ≥ 1: basic actions
- Level ≥ 3: access to harder actions (future)

(No scaling yet — gates are binary.)

---

## 3. Player Starting State

```ts
PlayerState {
  location: TOWN
  inventory: []
  equipment: none
  skills: all level 1
  guildReputation: 0
}
```

### Inventory

- Base container capacity: 5 slots

---

## 4. Items

### Raw Materials

```ts
IRON_ORE
WOOD_LOG
```

- Stackable
- Stack size: unlimited (v1 simplification)

### Crafted Items

```ts
IRON_BAR
```

---

## 5. Resource Nodes

### Iron Vein (MINE)

- Gathers: IRON_ORE
- Gather time: 2 ticks
- RNG success chance: 80%

### Tree (FOREST)

- Gathers: WOOD_LOG
- Gather time: 1 tick
- RNG success chance: 90%

---

## 6. Enemy

### Cave Rat (MINE)

- Fight time: 3 ticks
- Success chance: 70%
- On success:
  - Drops RAT_PELT (common)
  - 5% chance to drop RARE_TOOTH

---

## 7. Crafting

### Recipe: Iron Bar

```ts
Inputs:
- 2x IRON_ORE

Output:
- 1x IRON_BAR

Time cost: 2 ticks
Success chance: 100%
```

Requires:
- Location: TOWN
- Smithing skill ≥ 1

---

## 8. Guild

### Miner’s Guild (TOWN)

- Issues contracts
- Tracks reputation

### Contract Types

#### Mining Contract
- Objective: Gather 3 IRON_ORE
- Reward:
  - +5 guild reputation
  - +1 bonus Mining XP

#### Combat Contract
- Objective: Defeat 2 Cave Rats
- Reward:
  - +5 guild reputation
  - Loot bonus roll

---

## 9. Session Parameters

- Session length: 20 ticks

This is intentionally tight to force trade-offs.

---

## 10. What This Slice Exercises

This world allows us to test:
- Travel vs action time trade-offs
- Gathering vs combat EV
- Inventory pressure
- Crafting loops
- RNG variance visibility
- Contract choice diversity

If degeneracy exists, it *will* show up here.

---

