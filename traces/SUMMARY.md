# Adaptive Trace Analysis Summary

## Objective
Optimize total levels gained in a 25-tick session.

## Results Summary

| Trace | Strategy | Levels | XP | Skills Leveled | Key Insight |
|-------|----------|--------|-----|----------------|-------------|
| 1 | Pure Mining | 2 | 8 | Mining 0→2 | Baseline single-skill strategy |
| 2 | Pure Combat | 1 | 3 | Combat 0→1 | Combat failure relocates player, wastes ticks |
| 3 | Mining + Smithing | **3** | 6 | Mining 0→2, Smithing 0→1 | **Best result** - 2 skills synergize well |
| 4 | Woodcutting | 2 | 9 | Woodcutting 0→2 | Higher success rate (90%) but longer travel |
| 5 | Contract-focused | **3** | 8 | Mining 0→2, Smithing 0→1 | Contract gives +2 bonus Mining XP |
| 6 | Multi-skill (3) | 3 | 4 | Mining/Combat/Smithing all 0→1 | 3 enrols = 9 ticks overhead, poor XP/tick |
| 7 | Max Gather | 2 | 7 | Mining 0→2 | Same as trace 1, RNG variance |
| 8 | Craft Focus | 3 | 6 | Mining 0→2, Smithing 0→1 | Ran out of time for 2nd craft |
| 9 | Smithing Focus | 3 | 6 | Mining 0→2, Smithing 0→1 | Similar to trace 3 |
| 10 | Optimal Wood | 2 | 9 | Woodcutting 0→2 | Highest XP but only 2 levels |

## Key Learnings

### 1. Enrolment Cost is Significant
- Each enrol costs 3 ticks (12% of session)
- Single enrol: leaves 22 ticks for XP activities
- Two enrols: leaves 19 ticks (optimal for 2-skill combos)
- Three enrols: leaves 16 ticks (poor efficiency)

### 2. Synergistic Skills Beat Pure Focus
- **Mining + Smithing combo achieves 3 levels** vs 2 for pure mining
- Mining produces ore → Smithing consumes ore for XP
- Both skills level from the same resource pipeline

### 3. Combat is Inefficient
- 70% success rate (vs 80% mining, 90% woodcutting)
- **Combat failure relocates player to TOWN** - huge time penalty
- Each failed fight wastes 3 ticks + 2 ticks to return = 5 ticks lost
- Requires defensive move planning which wastes more ticks

### 4. Level Thresholds Limit Max Levels
- Level 1→2: 4 XP
- Level 2→3: 8 XP (12 total)
- With 25 ticks, max theoretical XP is ~10-11 for single skill
- **Impossible to reach level 3 in any skill in one session**

### 5. Contracts Provide Bonus XP
- Miners Guild contract gives +2 Mining XP as reward
- Contract acceptance is free (0 ticks)
- Worth accepting if you're already doing the required activities

### 6. Travel Optimization Matters
- TOWN↔MINE: 2 ticks
- TOWN↔FOREST: 3 ticks
- MINE↔FOREST: 4 ticks
- Mining has better travel efficiency than Woodcutting

### 7. RNG Variance is Moderate
- Expected vs actual XP typically within ±1
- Gather success: 80-90% reduces volatility
- Combat's 70% + relocation makes it high-risk

## Optimal Strategy for Level Maximization

**Best approach: Mining + Smithing Combo (Trace 3/5)**
```
1. enrol mining     (3t)
2. enrol smithing   (3t)
3. move mine        (2t)
4-7. gather x4      (8t) → expect 3.2 ore
8. move town        (2t)
9-10. craft x2      (6t) → use 4 ore, get 2 XP
                    ----
                    24t used, 1t remaining
```

Result: 3 levels (Mining 0→2, Smithing 0→1)

## Future Considerations

1. **Longer sessions** would allow reaching level 3
2. **More contracts** could provide additional XP bonuses
3. **Equipment/buffs** could improve success rates
4. **Multiple resource types** for Smithing could add variety
