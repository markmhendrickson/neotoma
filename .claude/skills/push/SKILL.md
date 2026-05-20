---
name: push
description: Push current branch to origin; supports /push <submodule>.
triggers:
  - push
  - /push
---

# push

Push current branch to origin remote, checking if remote exists first.

**SUBMODULE MODE**: If a submodule name is provided (e.g., `/push foundation`), scope operations to that submodule only, not the main repository.

Configuration is read from `foundation-config.yaml`.

If submodule name provided:
1. Check if submodule exists: `git submodule status <submodule-name>`
2. Change to submodule directory: `cd <submodule-name>`
3. Run push workflow in submodule context
4. Exit after submodule push (do NOT push main repository)

If no submodule name provided, proceed with main repository push workflow below.

## Workflow Overview

1. Check if origin remote exists
2. Verify current branch
3. Check for unpushed commits
4. Push to origin
5. Handle errors appropriately

## Tasks

### Step 1: Determine Scope

If submodule name provided:
1. Verify submodule exists:
   ```bash
   if ! git submodule status <submodule-name> >/dev/null 2>&1; then
     echo "❌ Submodule not found: <submodule-name>"
     exit 1
   fi
   ```

2. Save parent directory and change to submodule directory:
   ```bash
   ORIGINAL_DIR=$(pwd)  # Save parent directory before cd
   cd <submodule-name> || exit 1
   ```

3. Update scope context (all subsequent operations in submodule)

If no submodule name provided, proceed with main repository context.

### Step 2: Check if Origin Remote Exists

```bash
echo "🔍 Checking for origin remote..."

# Check if any remotes exist
if ! git remote | grep -q .; then
  echo "❌ Error: No git remotes configured"
  echo ""
  echo "To add a remote, run:"
  echo "  git remote add origin <remote-url>"
  echo "  git push -u origin <branch-name>"
  exit 1
fi

# Check specifically for origin remote
if ! git remote | grep -q "^origin$"; then
  echo "❌ Error: 'origin' remote not found"
  echo ""
  echo "Available remotes:"
  git remote -v
  echo ""
  echo "To add origin remote, run:"
  echo "  git remote add origin <remote-url>"
  echo "  git push -u origin <branch-name>"
  exit 1
fi

# Display origin URL
ORIGIN_URL=$(git remote get-url origin 2>/dev/null || echo "unknown")
echo "✅ Origin remote found: $ORIGIN_URL"
```

### Step 3: Check Current Branch

```bash
echo "📍 Checking current branch..."

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ -z "$CURRENT_BRANCH" ]; then
  echo "❌ Error: Detached HEAD state - cannot push"
  echo "Current commit: $(git rev-parse HEAD)"
  echo ""
  echo "To push, checkout a branch first:"
  echo "  git checkout -b <branch-name>"
  exit 1
fi

echo "✅ Current branch: $CURRENT_BRANCH"
```

### Step 4: Check for Unpushed Commits

```bash
echo "🔍 Checking for unpushed commits..."

# Fetch latest from origin to compare
git fetch origin --quiet 2>/dev/null || {
  echo "⚠️  Warning: Could not fetch from origin (remote may not exist yet)"
  echo "Will attempt to push anyway..."
}

# Check if branch has upstream set
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "")

if [ -z "$UPSTREAM" ]; then
  echo "ℹ️  No upstream branch set for $CURRENT_BRANCH"
  echo "Will push and set upstream on first push"
  HAS_UPSTREAM=false
else
  echo "✅ Upstream branch: $UPSTREAM"
  HAS_UPSTREAM=true
  
  # Check if local is ahead of remote
  LOCAL=$(git rev-parse @)
  REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "")
  BASE=$(git merge-base @ @{u} 2>/dev/null || echo "")
  
  if [ -n "$REMOTE" ] && [ -n "$BASE" ]; then
    if [ "$LOCAL" = "$REMOTE" ]; then
      echo "✅ Branch is up to date with $UPSTREAM"
      echo "No commits to push"
      exit 0
    elif [ "$LOCAL" = "$BASE" ]; then
      echo "⚠️  Local branch is behind $UPSTREAM"
      echo "Consider pulling first with: git pull origin $CURRENT_BRANCH"
    elif [ "$REMOTE" = "$BASE" ]; then
      COMMITS_AHEAD=$(git rev-list --count @{u}..@)
      echo "⬆️  Local branch is $COMMITS_AHEAD commit(s) ahead of $UPSTREAM"
    else
      echo "🔀 Local and remote branches have diverged"
      echo "Consider pulling and merging first"
    fi
  fi
fi
```

### Step 5: Push to Origin

```bash
echo "📤 Pushing to origin..."

if [ "$HAS_UPSTREAM" = "false" ]; then
  # First push - set upstream
  echo "Setting upstream to origin/$CURRENT_BRANCH..."
  git push -u origin "$CURRENT_BRANCH" || {
    PUSH_EXIT_CODE=$?
    echo "❌ Error: Push failed (exit code: $PUSH_EXIT_CODE)"
    echo ""
    echo "Common issues:"
    echo "  - Remote repository doesn't exist or is inaccessible"
    echo "  - Authentication required (check credentials)"
    echo "  - Branch name conflicts with remote branch"
    echo ""
    echo "To troubleshoot:"
    echo "  git remote -v  # Check remote URL"
    echo "  git status     # Check repository state"
    exit 1
  }
else
  # Subsequent push
  git push origin "$CURRENT_BRANCH" || {
    PUSH_EXIT_CODE=$?
    echo "❌ Error: Push failed (exit code: $PUSH_EXIT_CODE)"
    echo ""
    echo "Common issues:"
    echo "  - Remote has commits you don't have (pull first)"
    echo "  - Authentication required (check credentials)"
    echo "  - Permission denied (check repository access)"
    echo ""
    echo "To troubleshoot:"
    echo "  git pull origin $CURRENT_BRANCH  # Pull latest first"
    echo "  git status                        # Check repository state"
    exit 1
  }
fi

echo "✅ Successfully pushed to origin/$CURRENT_BRANCH"
```

### Step 6: Summary

```bash
echo ""
echo "✅ Push workflow completed"
echo ""
echo "Summary:"
echo "  - Branch: $CURRENT_BRANCH"
echo "  - Remote: origin"
echo "  - Upstream: ${UPSTREAM:-origin/$CURRENT_BRANCH (newly set)}"
echo "  - Latest commit: $(git rev-parse --short HEAD)"
```

### Step 7: Return to Original Directory (if in submodule mode)

If submodule name was provided:

```bash
if [ -n "$ORIGINAL_DIR" ] && [ "$(pwd)" != "$ORIGINAL_DIR" ]; then
  cd "$ORIGINAL_DIR" || exit 1
  echo "✅ Returned to main repository directory"
fi
```

## Configuration

Optional configuration in `foundation-config.yaml`:

```yaml
development:
  push:
    check_remote: true  # Check if origin exists before pushing
    set_upstream: true   # Set upstream on first push
    force_push: false    # Allow force push (use with caution)
    push_tags: false     # Also push tags
```

## Error Handling

- If no remote exists: Exit with error and instructions to add remote
- If origin doesn't exist: Exit with error showing available remotes
- If detached HEAD: Exit with error and instructions
- If push fails: Exit with error and troubleshooting tips
- If local is behind remote: Warn but allow push attempt (may fail)

## Inputs

- `submodule_name` (optional string): Submodule name to scope operations to (e.g., "foundation")

## Examples

```bash
# Push main repository
/push

# Push foundation submodule
/push foundation
```
