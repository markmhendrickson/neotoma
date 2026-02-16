#!/bin/bash
# Check if .claude/rules is out of sync with sources
# Called by Claude Code SessionStart hook (optional)

set -e

# Check if sources are newer than .claude/CLAUDE.md
if [ ! -f ".claude/CLAUDE.md" ]; then
    echo "⚠️  .claude/ not initialized. Run: ./scripts/setup_claude_instructions.sh"
    exit 0
fi

# Find newest source file
NEWEST_SOURCE=""
NEWEST_TIME=0

for source in docs/**/*_rules.{md,mdc} foundation/agent_instructions/cursor_rules/*.mdc foundation/agent_instructions/cursor_commands/*.md; do
    if [ -f "$source" ]; then
        source_time=$(stat -f %m "$source" 2>/dev/null || stat -c %Y "$source" 2>/dev/null || echo 0)
        if [ "$source_time" -gt "$NEWEST_TIME" ]; then
            NEWEST_TIME=$source_time
            NEWEST_SOURCE=$source
        fi
    fi
done

# Check .claude/CLAUDE.md timestamp
CLAUDE_TIME=$(stat -f %m ".claude/CLAUDE.md" 2>/dev/null || stat -c %Y ".claude/CLAUDE.md" 2>/dev/null || echo 0)

if [ "$NEWEST_TIME" -gt "$CLAUDE_TIME" ]; then
    echo "⚠️  .claude/ is out of sync (source modified: $NEWEST_SOURCE)"
    echo "Run: ./scripts/setup_claude_instructions.sh"
fi

exit 0
