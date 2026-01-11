#!/bin/bash

# Claude Code Stop hook to enforce TDD practices
# Exit code 2 feeds stderr back to Claude for processing

# Files that typically don't require their own test files
EXEMPT_PATTERNS="index\.ts$|\.d\.ts$"

# Get all modified .ts files (staged + unstaged, excluding test files and exempt patterns)
source_files=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.ts$' | grep -vE '\.test\.ts$' | grep -vE "$EXEMPT_PATTERNS")

# Also check staged files not yet committed
staged_source=$(git diff --cached --name-only 2>/dev/null | grep -E '\.ts$' | grep -vE '\.test\.ts$' | grep -vE "$EXEMPT_PATTERNS")

# Combine and dedupe
all_source=$(echo -e "$source_files\n$staged_source" | sort -u | grep -v '^$')

# Exit early if no source files changed
if [ -z "$all_source" ]; then
    exit 0
fi

# Get all modified test files
test_files=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.test\.ts$')
staged_tests=$(git diff --cached --name-only 2>/dev/null | grep -E '\.test\.ts$')
all_tests=$(echo -e "$test_files\n$staged_tests" | sort -u | grep -v '^$')

# Check each source file for corresponding test
missing_tests=()
untouched_tests=()

for file in $all_source; do
    test_file="${file%.ts}.test.ts"

    # Check if this test file was modified
    if echo "$all_tests" | grep -q "^${test_file}$"; then
        continue  # Test was modified, all good
    fi

    # Test wasn't modified - check if it exists
    if [ -f "$test_file" ]; then
        untouched_tests+=("$file -> $test_file exists but wasn't modified")
    else
        missing_tests+=("$file -> NO TEST FILE ($test_file)")
    fi
done

# If we found issues, report them
if [ ${#missing_tests[@]} -gt 0 ] || [ ${#untouched_tests[@]} -gt 0 ]; then
    {
        echo ""
        echo "TDD CHECK FAILED: Source files modified without test coverage"
        echo ""

        if [ ${#missing_tests[@]} -gt 0 ]; then
            echo "Missing test files:"
            for msg in "${missing_tests[@]}"; do
                echo "  $msg"
            done
            echo ""
        fi

        if [ ${#untouched_tests[@]} -gt 0 ]; then
            echo "Tests exist but weren't updated:"
            for msg in "${untouched_tests[@]}"; do
                echo "  $msg"
            done
            echo ""
        fi

        echo "Per CLAUDE.md: 'Test-driven development: Write tests first, then implement'"
        echo ""
        echo "Please add or update tests before committing."
        echo ""
    } >&2

    exit 2  # Exit code 2 feeds stderr back to Claude
fi

exit 0
