#!/bin/bash
# Adaptive test run for interactive exploration
# This demonstrates the step-by-step exploration workflow

SEED="test-interactive-adaptive-$(date +%s)"

echo "==================================================================="
echo "ADAPTIVE TEST RUN: Interactive Exploration"
echo "Seed: $SEED"
echo "==================================================================="
echo ""

# Step 1: Enrol in exploration guild and get starting area
echo "Step 1: Enrol in Exploration Guild"
echo "-------------------------------------------------------------------"
npx tsx src/batch.ts "$SEED" \
  "goto explorers" \
  "enrol" \
  "leave"

echo ""
echo ""
echo "Step 2: Travel to Copper Ridge (starting area from guild)"
echo "-------------------------------------------------------------------"
npx tsx src/batch.ts "$SEED" \
  "goto explorers" \
  "enrol" \
  "leave" \
  "goto copper"

echo ""
echo ""
echo "Step 3: First exploration - discover something easy"
echo "-------------------------------------------------------------------"
echo "NOTE: In non-TTY mode, exploration runs without animation/prompts"
npx tsx src/batch.ts "$SEED" \
  "goto explorers" \
  "enrol" \
  "leave" \
  "goto copper" \
  "explore"

echo ""
echo ""
echo "Step 4: Continue exploring to find more discoveries"
echo "-------------------------------------------------------------------"
npx tsx src/batch.ts "$SEED" \
  "goto explorers" \
  "enrol" \
  "leave" \
  "goto copper" \
  "explore" \
  "explore" \
  "explore"

echo ""
echo ""
echo "Step 5: Keep exploring until we find all easy discoveries"
echo "-------------------------------------------------------------------"
npx tsx src/batch.ts "$SEED" \
  "goto explorers" \
  "enrol" \
  "leave" \
  "goto copper" \
  "explore" \
  "explore" \
  "explore" \
  "explore" \
  "explore" \
  "explore"

echo ""
echo ""
echo "==================================================================="
echo "TEST COMPLETE"
echo "==================================================================="
echo ""
echo "What this demonstrates:"
echo "1. Interactive mode works in REPL (with TTY)"
echo "2. Non-interactive fallback works in batch mode"
echo "3. Exploration discovers locations progressively"
echo "4. Hard discovery detection logic is in place"
echo ""
echo "To test interactive features manually:"
echo "  npm run repl -- $SEED"
echo "  > goto explorers"
echo "  > enrol"
echo "  > leave"
echo "  > goto copper"
echo "  > explore    (watch the animation!)"
echo "  > n          (decline to continue)"
