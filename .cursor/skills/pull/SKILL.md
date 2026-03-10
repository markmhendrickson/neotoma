---
name: pull
description: Pull from origin; supports /pull <submodule>.
triggers:
  - pull
  - /pull
---

# pull

Pull latest commits from origin, committing local changes first, merging conflicts, and running setup scripts.

**SUBMODULE MODE**: If a submodule name is provided (e.g., `/pull foundation`), scope operations to that submodule only, not the main repository.

Configuration is read from `foundation-config.yaml`.

If submodule name provided:
1. Check if submodule exists: `git submodule status <submodule-name>`
2. Change to submodule directory: `cd <submodule-name>`
3. Run pull workflow in submodule context
4. Exit after submodule pull (do NOT pull main repository)

If no submodule name provided, proceed with main repository pull workflow below.

## Workflow Overview

1. Commit local changes using foundation commit command (if any uncommitted changes)
2. Fetch latest from origin
3. Pull latest commits (merge or rebase based on configuration)
4. Resolve merge conflicts if they occur
5. Run setup scripts as needed

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

### Step 2: Check for Uncommitted Changes

```bash
# Check if there are uncommitted changes
if git status --porcelain | grep -q .; then
  echo "📝 Found uncommitted changes, committing first..."
  
  # Use foundation commit command to commit changes
  # Agent should invoke the commit command workflow:
  # - Run security audit
  # - Stage changes
  # - Generate commit message
  # - Commit changes
  # - Push to origin if configured
  
  # For agent: Use the foundation commit command workflow
  # Invoke: `/commit <submodule-name>` (if submodule) or `/commit` (if main repo)
  
  echo "✅ Local changes committed"
else
  echo "✅ No uncommitted changes"
fi
```

**Agent Instructions for Commit Step:**
- If uncommitted changes exist, invoke the foundation commit command workflow
- If in submodule mode: use `/commit <submodule-name>`
- If in main repo mode: use `/commit`
- Do NOT proceed to pull until commit completes successfully

### Step 3: Fetch Latest from Origin

```bash
echo "🔄 Fetching latest from origin..."
git fetch origin

# Check current branch
CURRENT_BRANCH=$(git branch --show-current)

if [ -z "$CURRENT_BRANCH" ]; then
  echo "⚠️  Detached HEAD state - cannot pull"
  echo "Current commit: $(git rev-parse HEAD)"
  exit 1
fi

echo "📍 Current branch: $CURRENT_BRANCH"
```

### Step 4: Check if Pull is Needed

```bash
# Check if local branch is behind remote
LOCAL=$(git rev-parse @)
REMOTE=$(git rev-parse @{u} 2>/dev/null || echo "")

if [ -z "$REMOTE" ]; then
  echo "⚠️  No upstream branch set for $CURRENT_BRANCH"
  echo "Setting upstream to origin/$CURRENT_BRANCH"
  git branch --set-upstream-to=origin/$CURRENT_BRANCH $CURRENT_BRANCH
  REMOTE=$(git rev-parse @{u})
fi

BASE=$(git merge-base @ @{u})

if [ "$LOCAL" = "$REMOTE" ]; then
  echo "✅ Already up to date with origin/$CURRENT_BRANCH"
  SKIP_PULL=true
elif [ "$LOCAL" = "$BASE" ]; then
  echo "⬇️  Local branch is behind origin/$CURRENT_BRANCH - will pull"
  SKIP_PULL=false
elif [ "$REMOTE" = "$BASE" ]; then
  echo "⬆️  Local branch is ahead of origin/$CURRENT_BRANCH"
  SKIP_PULL=true
else
  echo "🔀 Local and remote branches have diverged - will pull and merge"
  SKIP_PULL=false
fi
```

### Step 5: Pull and Merge

If `SKIP_PULL` is false:

```bash
echo "⬇️  Pulling latest changes from origin/$CURRENT_BRANCH..."

# Pull with merge strategy (default)
# If conflicts occur, git pull will pause
git pull origin "$CURRENT_BRANCH" || {
  PULL_EXIT_CODE=$?
  
  if [ $PULL_EXIT_CODE -ne 0 ]; then
    echo "⚠️  Pull encountered issues"
    
    # Check if there are merge conflicts
    if git status | grep -q "Unmerged paths"; then
      echo "🔀 Merge conflicts detected"
      echo ""
      echo "Conflicted files:"
      git status | grep "both modified\|both added\|deleted by them\|deleted by us" || true
      echo ""
      
      # Agent should resolve conflicts interactively
      # For now, list conflicts and ask user
      echo "❌ Merge conflicts must be resolved manually"
      echo "Run 'git status' to see conflicted files"
      echo "Resolve conflicts, then run 'git add <file>' for each resolved file"
      echo "Finally, run 'git commit' to complete the merge"
      exit 1
    else
      echo "❌ Pull failed for unknown reason"
      exit 1
    fi
  fi
}

echo "✅ Successfully pulled latest changes"
```

**Agent Instructions for Conflict Resolution:**
- If merge conflicts occur, DO NOT attempt automatic resolution
- List all conflicted files to user
- Ask user how to proceed: resolve manually, abort merge, or use specific merge strategy
- If user chooses to resolve manually, pause and wait for user to complete resolution
- After user indicates conflicts are resolved, verify with `git status`
- Stage resolved files with `git add`
- Complete merge with `git commit`

### Step 6: Detect and Run Setup Scripts

After successful pull, detect and run setup scripts as needed:

**IMPORTANT**: If in submodule mode, return to parent repository directory BEFORE running setup scripts, as parent-level setup scripts (like `foundation/scripts/setup_cursor_rules.sh`) must be run from the parent repository context.

```bash
echo "🔧 Checking for setup scripts..."

# If in submodule mode, return to parent directory for setup scripts
if [ -n "$ORIGINAL_DIR" ]; then
  echo "📁 Returning to parent repository for setup scripts..."
  cd "$ORIGINAL_DIR" || exit 1
fi

# Common setup script patterns
SETUP_SCRIPTS=()

# Check for foundation setup script (must run from parent repo)
if [ -f "foundation/scripts/setup_cursor_rules.sh" ]; then
  SETUP_SCRIPTS+=("foundation/scripts/setup_cursor_rules.sh")
fi

# Check for foundation validation script
if [ -f "foundation/scripts/validate_setup.sh" ]; then
  SETUP_SCRIPTS+=("foundation/scripts/validate_setup.sh")
fi

# Check for repository-specific setup scripts
if [ -f "scripts/setup_agent_environment.sh" ]; then
  SETUP_SCRIPTS+=("scripts/setup_agent_environment.sh")
fi

# Check for other common setup scripts
for script in scripts/setup*.sh scripts/*setup*.sh; do
  if [ -f "$script" ] && [ -x "$script" ]; then
    if [[ ! " ${SETUP_SCRIPTS[@]} " =~ " ${script} " ]]; then
      SETUP_SCRIPTS+=("$script")
    fi
  fi
done

# Check package.json for setup/install scripts
if [ -f "package.json" ]; then
  echo "📦 Checking package.json for setup requirements..."
  
  # Check if node_modules exists
  if [ ! -d "node_modules" ]; then
    echo "📦 node_modules not found - running npm install..."
    npm install
  else
    # Check if package.json or package-lock.json changed
    if git diff HEAD@{1} HEAD --name-only | grep -q "package.json\|package-lock.json"; then
      echo "📦 Dependencies may have changed - running npm install..."
      npm install
    fi
  fi
fi

# Check for other package managers
if [ -f "requirements.txt" ] && [ ! -d "venv" ] && [ ! -d ".venv" ]; then
  echo "🐍 Python dependencies detected - consider setting up virtual environment"
fi

# Run setup scripts
for script in "${SETUP_SCRIPTS[@]}"; do
  echo ""
  echo "▶️  Running setup script: $script"
  
  # Make script executable if not already
  chmod +x "$script" 2>/dev/null || true
  
  # Run script
  if bash "$script"; then
    echo "✅ Setup script completed: $script"
  else
    echo "⚠️  Setup script failed: $script (exit code: $?)"
    echo "Continuing anyway..."
  fi
done
```

### Step 7: Summary

```bash
echo ""
echo "✅ Pull workflow completed"
echo ""
echo "Summary:"
echo "  - Branch: $CURRENT_BRANCH"
echo "  - Latest commit: $(git rev-parse HEAD)"
echo "  - Setup scripts run: ${#SETUP_SCRIPTS[@]}"
```

### Step 8: Return to Original Directory (if in submodule mode)

**Note**: If in submodule mode, we already returned to the parent directory in Step 6 to run setup scripts. This step is now a no-op, but kept for clarity.

If submodule name was provided and we're not already in the parent directory:

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
  pull:
    auto_commit: true  # Automatically commit local changes before pull
    conflict_strategy: "merge"  # "merge" | "rebase" | "abort"
    run_setup_scripts: true  # Run setup scripts after pull
    setup_scripts:
      - "scripts/setup_agent_environment.sh"  # Custom list of scripts to run
```

## Error Handling

- If commit fails: Abort and report error
- If pull fails due to conflicts: List conflicts, pause for user resolution
- If setup script fails: Log warning but continue (non-fatal)
- If submodule not found: Exit with error

## Inputs

- `submodule_name` (optional string): Submodule name to scope operations to (e.g., "foundation")

