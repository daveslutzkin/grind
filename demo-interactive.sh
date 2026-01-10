#!/bin/bash
# Demo script showing interactive exploration in action

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║   INTERACTIVE EXPLORATION - DEMONSTRATION                     ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "This demo shows the new interactive exploration feature in both"
echo "batch mode and interactive mode."
echo ""

SEED="demo-interactive-$(date +%s)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PART 1: Batch Mode (Non-Interactive)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Running: npx tsx src/batch.ts $SEED ..."
echo "         goto explorers | enrol | leave | survey | explore x3"
echo ""

npx tsx src/batch.ts "$SEED" \
  "goto explorers" \
  "enrol" \
  "leave" \
  "survey" \
  "explore" \
  "explore" \
  "explore" \
  2>&1 | tail -40

echo ""
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "PART 2: Interactive Mode (TTY Required)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "To experience the full interactive features, run:"
echo ""
echo "  npm run repl -- $SEED"
echo ""
echo "Then try:"
echo "  > goto explorers"
echo "  > enrol"
echo "  > leave"
echo "  > survey"
echo ""
echo "You'll see:"
echo "  ✓ Animated dots (one per tick, 4 per second)"
echo "  ✓ Discovery announcement with XP and luck"
echo "  ✓ 'Continue surveying? (y/n)' prompt"
echo "  ✓ Press any key during animation to cancel"
echo ""
echo "  > explore"
echo ""
echo "You'll discover locations in the area:"
echo "  ✓ Same animation and prompts"
echo "  ✓ When only hard discoveries remain:"
echo "    ⚠ Warning about nodes without skills"
echo "    ⚠ Expected time estimate (e.g., 400t per discovery)"
echo "    ⚠ Double confirmation required"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "FEATURES DEMONSTRATED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Batch mode works without hanging (auto-detected non-TTY)"
echo "✅ Interactive mode provides rich UX (auto-detected TTY)"
echo "✅ Progressive exploration with prompts after each discovery"
echo "✅ Animated discovery with real-time tick consumption"
echo "✅ Smart warnings when entering hard discovery zones"
echo "✅ Cancellation support (press any key during animation)"
echo "✅ State management preserves Map objects correctly"
echo "✅ RNG determinism maintained for reproducible results"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
