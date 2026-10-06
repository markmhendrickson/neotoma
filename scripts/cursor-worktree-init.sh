#!/bin/bash
# Cursor worktree initialization script
# This can be run automatically when Cursor creates a new worktree
# or manually via: npm run setup:worktree

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR/..")"

echo "Setting up Cursor worktree..."

# Write a minimal, non-secret .env.development (credentials are never copied)
if [ -f "$SCRIPT_DIR/write-worktree-dev-env.js" ]; then
  echo "Writing non-secret dev environment file..."
  node "$SCRIPT_DIR/write-worktree-dev-env.js" || {
    echo "Warning: Failed to write dev env file. You may need to run 'npm run setup:worktree-env' manually."
  }
fi

echo "✓ Worktree setup complete"
echo ""
echo "If the dev server fails to start, regenerate the non-secret dev env file:"
echo "  npm run setup:worktree-env"
echo "Credentials are never copied into a worktree; set any you need yourself."
