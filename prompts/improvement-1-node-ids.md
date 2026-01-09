# Improvement Prompt: Show Node IDs in Gathering Output

## Objective

Enhance the gathering UI to display node IDs alongside human-readable names, enabling users to easily reference nodes in gather commands.

## Current State

```
Location: Unknown in area-d1-i1
Gathering: Ore vein
```

Users must guess node IDs like `area-d1-i1-node-0` to use gather commands.

## Desired State

```
Location: Unknown in area-d1-i1
Gathering: Ore vein (area-d1-i1-node-0)
```

Or for multiple nodes:
```
Gathering: Ore vein (area-d1-i1-node-0), Tree stand (area-d1-i1-node-1)
```

## Implementation Location

### Primary File: `src/agent/formatters.ts`

Find the Gathering section (around lines 180-190):

```typescript
if (nodesHere && nodesHere.length > 0) {
  const nodeNames = nodesHere.map((node) => {
    const view = getPlayerNodeView(node, state)
    return getNodeTypeName(view.nodeType)
  })
  lines.push(`Gathering: ${nodeNames.join(", ")}`)
}
```

### Suggested Change

```typescript
if (nodesHere && nodesHere.length > 0) {
  const nodeDescriptions = nodesHere.map((node) => {
    const view = getPlayerNodeView(node, state)
    const typeName = getNodeTypeName(view.nodeType)
    return `${typeName} (${node.nodeId})`
  })
  lines.push(`Gathering: ${nodeDescriptions.join(", ")}`)
}
```

## Test Updates Required

### File: `src/agent/formatters.test.ts`

Update existing tests that check for "Gathering:" output to expect the new format with node IDs.

Example test:
```typescript
it("should show node IDs in gathering output", () => {
  // Setup state with a known node
  const nodeId = "test-area-node-0"
  // ... setup code ...

  const formatted = formatWorldState(state)
  expect(formatted).toContain(`Gathering: Ore vein (${nodeId})`)
})
```

## Alternative: Short ID Format

If full node IDs are too verbose, consider a shortened format:

```typescript
// Extract just the node index from the full ID
const shortId = node.nodeId.split("-").pop() // "0" from "area-d1-i1-node-0"
return `${typeName} (#${shortId})`
```

Output: `Gathering: Ore vein (#0), Tree stand (#1)`

Then update the gather command parser to accept `#0` as shorthand for the first node in the current area.

## Documentation Updates

Update `MANUAL_RUN.md` to show the new gather command format:
```
gather <node-id> focus <mat>    Focus on one material
  Example: gather area-d1-i1-node-0 focus stone
```

## Acceptance Criteria

1. Node IDs visible in Gathering output
2. All existing tests pass (update expected output as needed)
3. New test verifying node ID display
4. Manual verification: explore area → see node with ID → gather using displayed ID works
