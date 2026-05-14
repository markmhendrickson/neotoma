#!/usr/bin/env bash
# Copy foundation Cursor skills (and rules/commands if present) into .cursor/
# so Cursor loads them. Run when foundation submodule is updated.
# Does not depend on foundation's setup_cursor_copies.sh (which may not exist).

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
FOUNDATION="${FOUNDATION:-$REPO_ROOT/foundation}"

if [ ! -d "$FOUNDATION" ]; then
  echo "[setup_cursor_from_foundation] No foundation directory at $FOUNDATION, skipping."
  exit 0
fi

# Skills: copy foundation/.cursor/skills/* to .cursor/skills/ and .claude/skills/
if [ -d "$FOUNDATION/.cursor/skills" ]; then
  SKILLS_DST="$REPO_ROOT/.cursor/skills"
  CLAUDE_SKILLS_DST="$REPO_ROOT/.claude/skills"
  mkdir -p "$SKILLS_DST" "$CLAUDE_SKILLS_DST"
  count=0
  for skill in "$FOUNDATION/.cursor/skills"/*; do
    [ -d "$skill" ] || continue
    name=$(basename "$skill")
    rm -rf "$SKILLS_DST/$name"
    cp -R "$skill" "$SKILLS_DST/$name"
    rm -rf "$CLAUDE_SKILLS_DST/$name"
    cp -R "$skill" "$CLAUDE_SKILLS_DST/$name"
    count=$((count + 1))
  done
  echo "[setup_cursor_from_foundation] Installed $count skill(s) to .cursor/skills/ and .claude/skills/"
fi

# Rules: if foundation has cursor_rules, symlink or copy into .cursor/rules/
if [ -d "$FOUNDATION/agent_instructions/cursor_rules" ]; then
  RULES_DST="$REPO_ROOT/.cursor/rules"
  mkdir -p "$RULES_DST"
  count=0
  for rule in "$FOUNDATION/agent_instructions/cursor_rules"/*; do
    [ -f "$rule" ] || continue
    name=$(basename "$rule")
    target="$(cd "$(dirname "$rule")" && pwd)/$name"
    rm -f "$RULES_DST/$name"
    ln -sf "$target" "$RULES_DST/$name" 2>/dev/null || cp "$rule" "$RULES_DST/$name"
    count=$((count + 1))
  done
  echo "[setup_cursor_from_foundation] Installed $count rule(s) to .cursor/rules/"
fi

# Commands: if foundation has cursor_commands, symlink or copy into .cursor/commands/
if [ -d "$FOUNDATION/agent_instructions/cursor_commands" ]; then
  CMDS_DST="$REPO_ROOT/.cursor/commands"
  mkdir -p "$CMDS_DST"
  count=0
  for cmd in "$FOUNDATION/agent_instructions/cursor_commands"/*; do
    [ -f "$cmd" ] || continue
    name=$(basename "$cmd")
    target="$(cd "$(dirname "$cmd")" && pwd)/$name"
    rm -f "$CMDS_DST/$name"
    ln -sf "$target" "$CMDS_DST/$name" 2>/dev/null || cp "$cmd" "$CMDS_DST/$name"
    count=$((count + 1))
  done
  echo "[setup_cursor_from_foundation] Installed $count command(s) to .cursor/commands/"
fi

exit 0
