#!/bin/bash
# Cursor worktree initialization script
# This can be run automatically when Cursor creates a new worktree
# or manually via: npm run setup:worktree

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR/..")"

echo "Setting up Cursor worktree..."

# Copy env file only when explicitly requested
if [ -f "$SCRIPT_DIR/copy-env-to-worktree.js" ]; then
  echo "Checking optional worktree env copy..."
  node "$SCRIPT_DIR/copy-env-to-worktree.js" || {
    echo "Warning: Refused or failed to copy env file."
  }
fi

echo "✓ Worktree setup complete"
echo ""
echo "If the dev server fails to start, ensure you have a .env.development file."
echo "Default: set it up from the example file:"
echo "  cp .env.example .env.development"
echo "Optional: copy a main-repository development env (review it first):"
echo "  NEOTOMA_WORKTREE_COPY_ENV=1 npm run copy:env"
