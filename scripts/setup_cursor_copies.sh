#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

print_info() {
  echo "[INFO] $1"
}

# Compute a relative path from $2 (a directory) to $1 (a file/dir).
# Uses Python for portability (macOS lacks GNU realpath --relative-to).
_rel_path() {
  python3 -c "import os.path; print(os.path.relpath('$1', '$2'))"
}

sync_repo_sources() {
  local mode="$1"
  local destination_dir="$2"
  local label="$3"
  local count=0

  mkdir -p "$destination_dir"

  while IFS= read -r -d '' source_file; do
    local base_name
    local target
    local rel_target
    base_name="$(basename "$source_file")"
    target="$destination_dir/$base_name"
    rel_target="$(_rel_path "$source_file" "$destination_dir")"
    rm -f "$target"
    ln -sf "$rel_target" "$target" 2>/dev/null || cp "$source_file" "$target"
    count=$((count + 1))
  done < <(
    if [ "$mode" = "rules" ]; then
      find "$REPO_ROOT/docs" -type f \( -name '*_rules.mdc' -o -name '*_rules.md' \) -print0 | sort -z
    else
      find "$REPO_ROOT/docs" -type f -name '*_command.md' -print0 | sort -z
    fi
  )

  print_info "$label synced: $count"
}

print_info "Setting up Cursor rules and commands..."

if [ -x "$REPO_ROOT/scripts/setup_cursor_from_foundation.sh" ]; then
  "$REPO_ROOT/scripts/setup_cursor_from_foundation.sh"
fi

sync_repo_sources "rules" "$REPO_ROOT/.cursor/rules" "Repository rules"
sync_repo_sources "commands" "$REPO_ROOT/.cursor/commands" "Repository commands"

print_info "✅ Cursor rules setup complete!"
