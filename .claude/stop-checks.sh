#!/bin/bash

# Claude Code Stop hook to enforce development practices
# Exit code 2 feeds stderr back to Claude for processing
#
# Checks:
# 1. TDD - Source files must have corresponding test updates
# 2. Branch sync - Feature branches should stay up-to-date with main

errors=""

# ============================================================================
# CHECK 1: TDD - Source files modified without test coverage
# ============================================================================

EXEMPT_PATTERNS="index\.ts$|\.d\.ts$"

# Get all modified .ts files (staged + unstaged, excluding test files and exempt patterns)
source_files=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.ts$' | grep -vE '\.test\.ts$' | grep -vE "$EXEMPT_PATTERNS")
staged_source=$(git diff --cached --name-only 2>/dev/null | grep -E '\.ts$' | grep -vE '\.test\.ts$' | grep -vE "$EXEMPT_PATTERNS")
all_source=$(echo -e "$source_files\n$staged_source" | sort -u | grep -v '^$')

if [ -n "$all_source" ]; then
    # Get all modified test files
    test_files=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.test\.ts$')
    staged_tests=$(git diff --cached --name-only 2>/dev/null | grep -E '\.test\.ts$')
    all_tests=$(echo -e "$test_files\n$staged_tests" | sort -u | grep -v '^$')

    missing_tests=()
    untouched_tests=()

    for file in $all_source; do
        test_file="${file%.ts}.test.ts"

        if echo "$all_tests" | grep -q "^${test_file}$"; then
            continue
        fi

        if [ -f "$test_file" ]; then
            untouched_tests+=("$file -> $test_file exists but wasn't modified")
        else
            missing_tests+=("$file -> NO TEST FILE ($test_file)")
        fi
    done

    if [ ${#missing_tests[@]} -gt 0 ] || [ ${#untouched_tests[@]} -gt 0 ]; then
        errors+="
TDD CHECK FAILED: Source files modified without test coverage
"
        if [ ${#missing_tests[@]} -gt 0 ]; then
            errors+="
Missing test files:"
            for msg in "${missing_tests[@]}"; do
                errors+="
  $msg"
            done
        fi

        if [ ${#untouched_tests[@]} -gt 0 ]; then
            errors+="
Tests exist but weren't updated:"
            for msg in "${untouched_tests[@]}"; do
                errors+="
  $msg"
            done
        fi

        errors+="

Per CLAUDE.md: 'Test-driven development: Write tests first, then implement'
Please consider adding or updating tests before committing.
"
    fi
fi

# ============================================================================
# CHECK 2: Branch sync - Feature branch behind main
# ============================================================================

# Skip branch sync check if:
# 1. Agent just asked a question via AskUserQuestion (waiting for user response)
# 2. No changes on this branch (nothing uncommitted and no commits ahead of main)

skip_branch_sync=false

# Skip if Claude just asked a question
if [ "$CLAUDE_STOP_TOOL_NAME" = "AskUserQuestion" ]; then
    skip_branch_sync=true
fi

current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ "$skip_branch_sync" = false ] && [ "$current_branch" != "main" ] && [ "$current_branch" != "master" ]; then
    # Determine which main branch exists
    if git rev-parse --verify origin/main &>/dev/null; then
        main_branch="origin/main"
    elif git rev-parse --verify origin/master &>/dev/null; then
        main_branch="origin/master"
    else
        main_branch=""
    fi

    if [ -n "$main_branch" ]; then
        # Check if there are any changes on this branch
        has_uncommitted=$(git status --porcelain 2>/dev/null)
        commits_ahead=$(git rev-list --count "$main_branch"..HEAD 2>/dev/null || echo "0")

        # Skip if no uncommitted changes AND no commits ahead of main
        if [ -z "$has_uncommitted" ] && [ "$commits_ahead" -eq 0 ]; then
            skip_branch_sync=true
        fi

        if [ "$skip_branch_sync" = false ]; then
            # Fetch main silently (best effort)
            git fetch origin main 2>/dev/null || git fetch origin master 2>/dev/null || true

            behind_count=$(git rev-list --count HEAD.."$main_branch" 2>/dev/null || echo "0")

            if [ "$behind_count" -gt 0 ]; then
                errors+="
BRANCH SYNC WARNING: Your branch '$current_branch' is $behind_count commit(s) behind $main_branch.

Consider rebasing to stay up-to-date:
  git fetch origin main && git rebase origin/main
"
            fi
        fi
    fi
fi

# ============================================================================
# Report any errors
# ============================================================================

if [ -n "$errors" ]; then
    echo "$errors" >&2
    exit 2
fi

exit 0
