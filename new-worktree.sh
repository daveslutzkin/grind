#!/bin/bash

set -e

if [ -z "$1" ]; then
    echo "Usage: $0 <branch-slug>"
    exit 1
fi

SLUG="$1"
WORKTREE_PATH="../grind-$SLUG"

echo "Creating worktree at $WORKTREE_PATH with branch $SLUG..."
git worktree add -b "$SLUG" "$WORKTREE_PATH"

echo "Switching to worktree..."
cd "$WORKTREE_PATH"

echo "Starting Claude..."
exec claude --dangerously-skip-permissions
