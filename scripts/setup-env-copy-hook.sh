#!/bin/bash
# Setup an opt-in git post-checkout hook for copying env files to worktrees

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="${REPO_ROOT}/.git/hooks"
HOOK_FILE="${HOOKS_DIR}/post-checkout"
COPY_SCRIPT="${SCRIPT_DIR}/copy-env-to-worktree.js"

if [ ! -d "$HOOKS_DIR" ]; then
  mkdir -p "$HOOKS_DIR"
fi

# Create or update the post-checkout hook
cat > "$HOOK_FILE" << 'HOOK_EOF'
#!/bin/bash
# Git post-checkout hook - optionally copy env file to worktrees

# This hook is called after a successful git checkout
# For worktrees, we need to detect the worktree path and copy env files there

# Get the directory of this script
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HOOK_DIR/../.." && pwd)"

# Determine if we're in a worktree and get its path
WORKTREE_PATH=""
if [ -n "$GIT_DIR" ] && [ "$GIT_DIR" != ".git" ]; then
  # We might be in a worktree - check for gitdir file
  if [ -f "$GIT_DIR/gitdir" ]; then
    # Read the worktree path from gitdir
    GITDIR_CONTENT="$(cat "$GIT_DIR/gitdir" 2>/dev/null)"
    if [ -n "$GITDIR_CONTENT" ]; then
      WORKTREE_PATH="$(echo "$GITDIR_CONTENT" | sed 's|/.git$||')"
    fi
  fi
fi

# If we couldn't find worktree path via GIT_DIR, try pwd
if [ -z "$WORKTREE_PATH" ]; then
  CURRENT_DIR="$(pwd)"
  # Check if current directory is a worktree by looking for .git file or .git/worktrees
  if [ -f "$CURRENT_DIR/.git" ] || [ -d "$CURRENT_DIR/.git/worktrees" ]; then
    WORKTREE_PATH="$CURRENT_DIR"
  fi
fi

# If we found a worktree path, copy only with explicit opt-in
if [ -n "$WORKTREE_PATH" ] && [ "$WORKTREE_PATH" != "$REPO_ROOT" ]; then
  if [ "${NEOTOMA_WORKTREE_COPY_ENV:-}" = "1" ]; then
    COPY_SCRIPT="$REPO_ROOT/scripts/copy-env-to-worktree.js"
    if [ -f "$COPY_SCRIPT" ] && command -v node >/dev/null 2>&1; then
      (cd "$WORKTREE_PATH" && node "$COPY_SCRIPT") || true
    fi
  else
    echo "[copy-env] Skipped env copy. Set NEOTOMA_WORKTREE_COPY_ENV=1 to opt in."
  fi
fi

exit 0
HOOK_EOF

chmod +x "$HOOK_FILE"

echo "✓ Git post-checkout hook installed at ${HOOK_FILE}"
echo "  Env copying is disabled unless NEOTOMA_WORKTREE_COPY_ENV=1 is set."
echo ""
echo "To manually copy the env file to the current worktree, run:"
echo "  NEOTOMA_WORKTREE_COPY_ENV=1 node scripts/copy-env-to-worktree.js"
