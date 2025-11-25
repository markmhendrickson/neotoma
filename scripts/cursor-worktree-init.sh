#!/bin/bash
# Cursor worktree initialization script
# This can be run automatically when Cursor creates a new worktree
# or manually via: npm run setup:worktree

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR/..")"

echo "Setting up Cursor worktree..."

# Copy env file
if [ -f "$SCRIPT_DIR/copy-env-to-worktree.js" ]; then
  echo "Copying environment file..."
  node "$SCRIPT_DIR/copy-env-to-worktree.js" || {
    echo "Warning: Failed to copy env file. You may need to run 'npm run copy:env' manually."
  }
fi

echo "✓ Worktree setup complete"
echo ""
echo "If the dev server fails to start, ensure you have a .env.development file:"
echo "  npm run copy:env"
