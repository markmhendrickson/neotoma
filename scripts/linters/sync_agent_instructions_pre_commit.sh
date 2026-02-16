#!/bin/bash
# Pre-commit hook: Sync agent instructions (.cursor/ and .claude/) when sources change
# Runs both setup_cursor_copies.sh and setup_claude_instructions.sh if rule/command sources are staged

set -e

# Check if any rule/command source files are staged
STAGED_SOURCES=$(git diff --cached --name-only | grep -E "(docs/.*_rules\.(md|mdc)|foundation/agent_instructions/(cursor_rules|cursor_commands)/)" || true)

if [ -z "$STAGED_SOURCES" ]; then
    # No rule/command sources staged, skip sync
    exit 0
fi

echo "Rule/command sources modified, syncing .cursor/ and .claude/..."

# Run Cursor sync
if [ -f "foundation/scripts/setup_cursor_copies.sh" ]; then
    echo "  Syncing .cursor/..."
    ./foundation/scripts/setup_cursor_copies.sh > /dev/null
    # Stage any changes
    git add .cursor/ 2>/dev/null || true
fi

# Run Claude sync
if [ -f "scripts/setup_claude_instructions.sh" ]; then
    echo "  Syncing .claude/..."
    ./scripts/setup_claude_instructions.sh > /dev/null
    # Stage any changes
    git add .claude/ 2>/dev/null || true
fi

echo "✓ Agent instructions synced"
exit 0
