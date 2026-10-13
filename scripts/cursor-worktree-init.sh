#!/bin/bash
# Cursor worktree initialization script
# This can be run automatically when Cursor creates a new worktree
# or manually via: npm run setup:worktree

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR/..")"

echo "Setting up Cursor worktree..."

# Automatic bootstrap uses the shared no-write default.
if [ ! -f "$SCRIPT_DIR/copy-env-to-worktree.js" ]; then
  echo "Error: worktree setup failed: bootstrap script not found." >&2
  echo "Fix the checkout, then run: npm run copy:env" >&2
  exit 1
fi
echo "Checking worktree environment (no file written by default)..."
if ! node "$SCRIPT_DIR/copy-env-to-worktree.js"; then
  echo "Error: worktree setup failed: bootstrap check failed." >&2
  echo "Retry with: npm run copy:env" >&2
  exit 1
fi

echo "✓ Worktree setup complete"
echo ""
echo "To create a keys-only template: npm run copy:env -- --template"
echo "To copy a local env deliberately: npm run copy:env -- --live"
echo "For non-secret dev defaults: npm run setup:worktree-env"
