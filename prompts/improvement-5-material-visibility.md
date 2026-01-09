# Improvement Prompt: Show Gatherable Materials with Skill Levels

## Objective

Enhance the gathering display to show what materials are available at each node and what skill level is required, helping users plan their gathering strategy.

## Current State

```
Gathering: Ore vein (area-d1-i1-node-0)
```

User doesn't know what materials are in the vein or what level they need.

## Desired State

```
Gathering: Ore vein (area-d1-i1-node-0)
  Materials: STONE (L1), COPPER_ORE (L2), TIN_ORE (L3)
  Your Mining: L2 — can gather STONE, COPPER_ORE
```

Or more compact:
```
Gathering: Ore vein (area-d1-i1-node-0): STONE✓, COPPER_ORE✓, TIN_ORE(L3)
```

## Implementation

### Visibility System Check

First understand the existing visibility system in `src/visibility.ts`:

- `getPlayerNodeView(node, state)` - Returns what player can see about a node
- `getMaxVisibleMaterialLevel(skillLevel)` - What level materials are visible
- `isMaterialVisible(material, skillLevel)` - Can player see this material

### Tier System

The game has visibility tiers based on skill level:
- Tier "none": Can't see anything about node
- Tier "exists": Know node exists but not contents
- Tier "materials": Can see materials at or below skill level
- Tier "quantities": Can see exact quantities (higher skill)

### Formatter Enhancement

In `src/agent/formatters.ts`, enhance the Gathering section:

```typescript
if (nodesHere && nodesHere.length > 0) {
  lines.push("Gathering:")

  for (const node of nodesHere) {
    const view = getPlayerNodeView(node, state)
    const typeName = getNodeTypeName(view.nodeType)
    const skillName = getSkillForNodeType(view.nodeType)
    const playerSkillLevel = state.player.skills[skillName] ?? 0

    // Node header
    lines.push(`  ${typeName} (${node.nodeId})`)

    // Show materials based on visibility tier
    if (view.visibilityTier === "materials" || view.visibilityTier === "quantities") {
      const materialDescriptions = view.visibleMaterials.map((mat) => {
        const canGather = mat.requiredLevel <= playerSkillLevel
        if (canGather) {
          return `${mat.materialId}✓`
        } else {
          return `${mat.materialId}(L${mat.requiredLevel})`
        }
      })
      lines.push(`    Materials: ${materialDescriptions.join(", ")}`)
    } else if (view.visibilityTier === "exists") {
      lines.push(`    Materials: [need ${skillName} to see]`)
    }
  }
}
```

### Consider APPRAISE Mode

The game has an APPRAISE gather mode that reveals more info. Consider:
- Show basic material list always
- APPRAISE reveals quantities and exact details
- Balance information vs gameplay discovery

## Output Format Options

### Option A: Detailed Multi-line
```
Gathering:
  Ore vein (area-d1-i1-node-0)
    Materials: STONE✓, COPPER_ORE✓, TIN_ORE(L3)
    Your Mining: L2
```

### Option B: Compact Single-line
```
Gathering: Ore vein (area-d1-i1-node-0) [STONE✓ COPPER_ORE✓ TIN_ORE:L3]
```

### Option C: Only Show Gatherable
```
Gathering: Ore vein (area-d1-i1-node-0)
  Can gather: STONE, COPPER_ORE
  Need L3 for: TIN_ORE
```

## Visibility Tier Behavior

| Tier | What to Show |
|------|--------------|
| none | Node not shown at all |
| exists | "Ore vein (?)" - know it exists |
| materials | Show material names + required levels |
| quantities | Show materials + quantities remaining |

## Test Cases

```typescript
describe("material visibility in gathering display", () => {
  it("should show materials player can gather with checkmark", () => {
    // Mining L2, node has STONE(L1), COPPER(L2), TIN(L3)
    const formatted = formatWorldState(state)
    expect(formatted).toContain("STONE✓")
    expect(formatted).toContain("COPPER_ORE✓")
  })

  it("should show required level for materials player cannot gather", () => {
    const formatted = formatWorldState(state)
    expect(formatted).toContain("TIN_ORE(L3)")
  })

  it("should respect visibility tiers", () => {
    // With low skill, should show limited info
    state.player.skills.Mining = 0
    const formatted = formatWorldState(state)
    expect(formatted).toContain("[need Mining to see]")
  })

  it("should show quantities when APPRAISE tier reached", () => {
    // With high skill or after appraise
    // Should show "STONE: 4 remaining"
  })
})
```

## Files to Modify

1. `src/agent/formatters.ts` - Gathering section enhancement
2. `src/agent/formatters.test.ts` - New visibility tests
3. Possibly `src/visibility.ts` - If new helper functions needed

## Integration with APPRAISE

The APPRAISE gather mode exists to reveal node contents. Consider:
- Basic view: Just material names
- After APPRAISE: Quantities and details

This preserves the value of the APPRAISE action while still giving useful information.

## Acceptance Criteria

1. Gathering display shows available materials
2. Clear indication of which materials player can gather
3. Required level shown for ungatherable materials
4. Respects existing visibility tier system
5. All tests pass
6. Manual test: see materials, know what to focus on
