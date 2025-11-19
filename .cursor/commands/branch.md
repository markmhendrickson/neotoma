# branch
Create and switch to a worktree for this chat session, allowing parallel work on different branches without affecting other chats.

## Worktree Setup Process

1. **Detect Current Context:**
   - Check if already in a worktree: `git rev-parse --git-dir` and check if path contains `.git/worktrees`
   - If in worktree: extract main repo path using `git rev-parse --git-common-dir` and remove `/\.git$` suffix
   - If in main repo: use `git rev-parse --show-toplevel` to get main repo path
   - Fallback: use current directory if git commands fail

2. **Generate Unique Identifier:**
   - Format: `chat-{YYYYMMDD}-{HHMMSS}-{random6chars}`
   - Use `date +%Y%m%d` and `date +%H%M%S` for timestamp
   - Use `openssl rand -hex 3` or similar for random component
   - Generate branch name with same format: `chat-{timestamp}-{random}`

3. **Check for Existing Worktree:**
   - Run `git worktree list` to see all existing worktrees
   - Check if worktree with same identifier pattern exists
   - If exists and branch matches current needs, use existing worktree
   - If exists but different branch, generate new identifier

4. **Create Worktree:**
   - Determine parent directory: `dirname "$MAIN_REPO"`
   - Set worktree path: `$PARENT_DIR/neotoma-$IDENTIFIER`
   - Create worktree with branch: `git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME"`
   - Handle branch conflicts by trying alternative branch names (append `-1`, `-2`, etc., max 5 retries)
   - Handle path conflicts by appending number suffix to identifier

5. **Copy Environment Files:**
   - After provisioning the worktree directory, copy `.env` (and `.env.dev` if present) from the source repo root into the worktree so dev servers share identical secrets
   - Guard each copy with `test -f` or `[ -f ... ]` before running `cp` to avoid errors when the file is absent

6. **Switch to Worktree:**
   - Change directory to worktree path: `cd "$WORKTREE_PATH"`
   - Verify branch is correct: `git branch --show-current`
   - Confirm worktree is active

7. **Error Handling:**
   - **Branch Conflicts:** If branch already checked out elsewhere, automatically try alternative branch name with numeric suffix (e.g., `-1`, `-2`). Max 5 retries to avoid infinite loops.
   - **Path Conflicts:** If worktree path exists, append number suffix to identifier and retry.
   - **Git Errors:** If worktree creation fails after retries, fallback to simple branch switch in current directory: `git checkout -b "$BRANCH_NAME"`

## Implementation Details

**Worktree Detection:**
```bash
# Check if in worktree
if git rev-parse --git-dir | grep -q "\.git/worktrees"; then
    # In worktree - get main repo
    MAIN_REPO=$(git rev-parse --git-common-dir | sed 's|/\.git$||')
else
    # In main repo
    MAIN_REPO=$(git rev-parse --show-toplevel)
fi
```

**Worktree Creation:**
```bash
# Generate identifier
IDENTIFIER="chat-$(date +%Y%m%d)-$(date +%H%M%S)-$(openssl rand -hex 3)"
BRANCH_NAME="chat-$(date +%Y%m%d)-$(date +%H%M%S)-$(openssl rand -hex 3)"

# Get main repo path
MAIN_REPO=$(git rev-parse --show-toplevel)
PARENT_DIR=$(dirname "$MAIN_REPO")
WORKTREE_PATH="$PARENT_DIR/neotoma-$IDENTIFIER"

# Create worktree with retry logic for branch conflicts
MAX_RETRIES=5
RETRY=0
SUCCESS=false

while [ $RETRY -lt $MAX_RETRIES ] && [ "$SUCCESS" = false ]; do
    if git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME" 2>&1 | grep -q "already checked out"; then
        # Branch conflict - try alternative
        RETRY=$((RETRY + 1))
        BRANCH_NAME="${BRANCH_NAME}-${RETRY}"
    elif [ -d "$WORKTREE_PATH" ]; then
        # Path conflict - try alternative
        RETRY=$((RETRY + 1))
        IDENTIFIER="${IDENTIFIER}-${RETRY}"
        WORKTREE_PATH="$PARENT_DIR/neotoma-$IDENTIFIER"
    else
        SUCCESS=true
    fi
done

if [ "$SUCCESS" = false ]; then
    # Fallback to simple branch switch
    git checkout -b "$BRANCH_NAME"
fi
```

**Environment Sync:**
```bash
if [ -f "$MAIN_REPO/.env" ]; then
    cp "$MAIN_REPO/.env" "$WORKTREE_PATH/.env"
fi
if [ -f "$MAIN_REPO/.env.dev" ]; then
    cp "$MAIN_REPO/.env.dev" "$WORKTREE_PATH/.env.dev"
fi
```

**Branch Name Format:**
- Format: `chat-YYYYMMDD-HHMMSS-{random}` or `chat-{timestamp}-{random}`
- If already on a chat-* branch in the worktree, proceed with current branch
- If on a non-chat branch, create new chat-* branch as needed

## Worktree Management

**Tracking:**
- Rely on `git worktree list` for tracking existing worktrees
- No additional file storage needed

**Cleanup:**
- **Manual cleanup required**: Worktrees are left for user to clean up when done
- List worktrees: `git worktree list`
- Remove worktree: `git worktree remove <path>` or `git worktree remove ../neotoma-{identifier}`
- Prune deleted worktrees: `git worktree prune`
- No automatic cleanup to avoid data loss - user controls when to remove worktrees

## Benefits

- Multiple chats can work on different branches simultaneously
- No need to stash/switch branches between chats
- Isolated file system state per chat
- Can run separate builds/tests in each worktree
- Commits are shared across all worktrees (same .git)

## Troubleshooting

- **Branch already checked out:** The command will automatically try alternative branch names. If all retries fail, it falls back to simple branch switch.
- **Path already exists:** The command will try alternative paths with number suffixes.
- **Worktree not found:** Use `git worktree list` to see all worktrees and their paths.
- **Cleanup:** Remove old worktrees with `git worktree remove <path>` when no longer needed.
