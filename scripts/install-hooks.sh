#!/bin/bash

# Install git hooks from scripts/hooks/ to .git/hooks/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_SOURCE="$SCRIPT_DIR/hooks"
HOOKS_DEST="$(git rev-parse --git-dir)/hooks"

if [ ! -d "$HOOKS_SOURCE" ]; then
    echo "Error: hooks source directory not found: $HOOKS_SOURCE"
    exit 1
fi

echo "Installing git hooks..."

for hook in "$HOOKS_SOURCE"/*; do
    if [ -f "$hook" ]; then
        hook_name=$(basename "$hook")
        cp "$hook" "$HOOKS_DEST/$hook_name"
        chmod +x "$HOOKS_DEST/$hook_name"
        echo "  Installed: $hook_name"
    fi
done

echo "Done!"
