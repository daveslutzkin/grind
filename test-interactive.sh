#!/bin/bash
# Test script for interactive exploration

# Create a test input file
cat > /tmp/test-explore-input.txt <<'TESTEOF'
goto explorers
enrol
leave
goto copper
explore
n
quit
TESTEOF

# Run the REPL with the test input
node dist/repl.js test-interactive-explore < /tmp/test-explore-input.txt

# Cleanup
rm /tmp/test-explore-input.txt
