---
name: publish
description: Publish workflow per foundation publish command.
triggers:
  - publish
  - /publish
---

# publish

Merge dev commits into main, create a release (planned or incremental), and deploy to production.

**PARAMETER MODES:**

1. **No parameter** (default): Publish main repository
2. **Submodule name parameter** (e.g., `/publish foundation`): Publish that specific submodule only

---

## Release Numbering Strategy

**Planned Releases (Milestones)**:
- Use semantic versioning: `vX.Y.0` (major.minor.0)
- Examples: `v1.0.0`, `v1.1.0`, `v2.0.0`
- Created via `/create_release` command with full workflow
- Control major and minor version numbers

**Incremental Releases (Continuous Deployments)**:
- Use semantic versioning as patches: `vX.Y.Z` where Z increments
- Examples: If last planned release is `v1.1.0`, incremental releases are `v1.1.1`, `v1.1.2`
- Auto-generated via `/publish` command
- Only patch version increments (never major or minor)

**Relationship**:
- Independent purposes: Planned releases are milestones, incremental releases are continuous deployments
- Example sequence: `v1.0.0` (planned) → `v1.0.1`, `v1.0.2` (incremental) → `v1.1.0` (planned) → `v1.1.1` (incremental)

---

## Parameter Detection and Routing

**STEP 1: Detect parameter and route to appropriate workflow:**

```bash
# Check if parameter provided
if [ -n "$1" ]; then
  PARAM="$1"
  
  # Submodule mode: publish that submodule only
  echo "📦 SUBMODULE MODE: Publishing submodule '$PARAM'"
  # Verify submodule exists
  if ! git submodule status "$PARAM" >/dev/null 2>&1; then
    echo "❌ Submodule not found: $PARAM"
    exit 1
  fi
  # Proceed to submodule publish workflow
else
  # Main repo mode: publish main repository
  echo "📦 MAIN REPO MODE: Publishing main repository"
  # Proceed to main repository publish workflow
fi
```

---

## Submodule Publish Workflow

**When a specific submodule name is provided** (e.g., `/publish foundation`):

1. **Change to submodule directory:**
   ```bash
   cd "$PARAM" || {
     echo "❌ Failed to change to submodule directory: $PARAM"
     exit 1
   }
   ```

2. **Validate prerequisites:**
   - Check current branch: Must be on `dev` (or configured integration branch)
   - Check for uncommitted changes
   - Run test suite (if submodule has tests)
   - Pull latest dev

3. **Merge dev into main:**
   ```bash
   git checkout main
   git pull origin main
   git merge --no-ff dev -m "Merge dev into main for release"
   ```

4. **Detect planned release and determine version** (see "Planned Release Detection" section)

5. **Bump version in submodule:**
   - If planned release detected: Use planned release version
   - If incremental: Increment patch from last planned release
   - Update version file (package.json or equivalent)

6. **Handle release document:**
   - If planned: Update existing release document status to `deployed`
   - If incremental: Create new incremental release document

7. **Commit and tag:**
   ```bash
   git add package.json docs/releases/$RELEASE_VERSION/
   git commit -m "Release $RELEASE_VERSION: [Planned/Incremental] release"
   git tag -a "$RELEASE_VERSION" -m "Release $RELEASE_VERSION"
   git push origin main
   git push origin "$RELEASE_VERSION"
   ```

8. **Deploy (if configured):**
   - Check if submodule has deployment configuration
   - Run deployment steps if applicable

9. **EXIT** - Do NOT proceed with main repository publish

---

## Main Repository Publish Workflow

**When no parameter is provided** (default):

### Step 1: Validate Prerequisites

Check that we're ready to publish:

```bash
# Check current branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "dev" ]; then
  echo "❌ Error: Must be on dev branch to publish"
  echo "Current branch: $CURRENT_BRANCH"
  exit 1
fi

# Check for uncommitted changes
if git status --porcelain | grep -q .; then
  echo "❌ Error: Uncommitted changes detected. Commit or stash before publishing."
  git status --short
  exit 1
fi

# Pull latest dev
echo "📥 Pulling latest dev..."
git pull origin dev
```

### Step 2: Run Test Suite

```bash
echo "🧪 Running test suite..."
npm run test
if [ $? -ne 0 ]; then
  echo "❌ Error: Tests failed. Fix tests before publishing."
  exit 1
fi
```

### Step 3: Merge Dev into Main

```bash
echo "🔀 Merging dev into main..."
git checkout main
git pull origin main

# Merge with no fast-forward to preserve merge commit
git merge --no-ff dev -m "Merge dev into main for release"

if [ $? -ne 0 ]; then
  echo "❌ Error: Merge conflicts detected. Resolve conflicts manually."
  echo "After resolving: git add . && git merge --continue"
  git merge --abort
  exit 1
fi
```

### Step 4: Detect Planned Release

**Method 1: Check for release status changes**

```bash
# Get commits in the merge (since last main commit)
COMMITS=$(git log main~1..main --oneline)

# Check for release status.md changes
STATUS_CHANGES=$(git diff main~1..main --name-only | grep -E "docs/releases/.*/status\.md")

if [ -n "$STATUS_CHANGES" ]; then
  # Extract release version from path: docs/releases/v1.1.0/status.md -> v1.1.0
  PLANNED_RELEASE=$(echo "$STATUS_CHANGES" | head -1 | sed 's|docs/releases/\(v[0-9]*\.[0-9]*\.[0-9]*\)/status\.md|\1|')
  
  # Check if status changed to 'deployed' or 'ready_for_deployment'
  STATUS_CONTENT=$(git show main:"$STATUS_CHANGES" 2>/dev/null || echo "")
  if echo "$STATUS_CONTENT" | grep -qE "(status:.*deployed|status:.*ready_for_deployment)"; then
    echo "✓ Planned release detected: $PLANNED_RELEASE"
    RELEASE_TYPE="planned"
    RELEASE_VERSION="$PLANNED_RELEASE"
  fi
fi
```

**Method 2: Check for new release directories**

```bash
# Check for release directory creation
NEW_RELEASE_DIRS=$(git diff main~1..main --name-only --diff-filter=A | grep -E "docs/releases/v[0-9]*\.[0-9]*\.[0-9]*/")

if [ -z "$RELEASE_TYPE" ] && [ -n "$NEW_RELEASE_DIRS" ]; then
  # Extract release version from first new directory
  PLANNED_RELEASE=$(echo "$NEW_RELEASE_DIRS" | head -1 | sed 's|docs/releases/\(v[0-9]*\.[0-9]*\.[0-9]*\)/.*|\1|')
  
  # Verify it's a planned release (has manifest.yaml, release_plan.md)
  if git show main:"docs/releases/$PLANNED_RELEASE/manifest.yaml" >/dev/null 2>&1; then
    echo "✓ Planned release detected: $PLANNED_RELEASE"
    RELEASE_TYPE="planned"
    RELEASE_VERSION="$PLANNED_RELEASE"
  fi
fi
```

**Method 3: Check commit messages**

```bash
# Check commit messages for release references
if [ -z "$RELEASE_TYPE" ]; then
  RELEASE_IN_COMMITS=$(echo "$COMMITS" | grep -iE "(release v[0-9]+\.[0-9]+\.[0-9]+|execute v[0-9]+\.[0-9]+\.[0-9]+)")
  
  if [ -n "$RELEASE_IN_COMMITS" ]; then
    # Extract version from commit message
    PLANNED_RELEASE=$(echo "$RELEASE_IN_COMMITS" | head -1 | grep -oE "v[0-9]+\.[0-9]+\.[0-9]+" | head -1)
    
    # Verify release directory exists
    if [ -d "docs/releases/$PLANNED_RELEASE" ]; then
      echo "✓ Planned release detected in commits: $PLANNED_RELEASE"
      RELEASE_TYPE="planned"
      RELEASE_VERSION="$PLANNED_RELEASE"
    fi
  fi
fi
```

**Validation if planned release detected:**

```bash
if [ "$RELEASE_TYPE" = "planned" ]; then
  # Verify version format (should be vX.Y.0)
  if ! echo "$RELEASE_VERSION" | grep -qE "^v[0-9]+\.[0-9]+\.[0-9]+$"; then
    echo "⚠️  Warning: Planned release version format invalid: $RELEASE_VERSION"
    echo "Falling back to incremental release..."
    RELEASE_TYPE="incremental"
  fi
  
  # Verify patch is 0 (planned releases should be vX.Y.0)
  PATCH=$(echo "$RELEASE_VERSION" | sed 's/v[0-9]*\.[0-9]*\.\([0-9]*\)/\1/')
  if [ "$PATCH" != "0" ]; then
    echo "⚠️  Warning: Planned release should have patch=0, but found: $RELEASE_VERSION"
    echo "Falling back to incremental release..."
    RELEASE_TYPE="incremental"
  fi
fi
```

### Step 5: Determine Version (if incremental)

If no planned release detected, determine incremental version:

```bash
if [ "$RELEASE_TYPE" != "planned" ]; then
  RELEASE_TYPE="incremental"
  
  # Find last planned release (vX.Y.0 format)
  LAST_PLANNED_RELEASE=$(git tag -l "v*.*.0" | sort -V | tail -1)
  
  # If no planned release found, start at v0.1.0
  if [ -z "$LAST_PLANNED_RELEASE" ]; then
    LAST_PLANNED_RELEASE="v0.0.0"
    echo "⚠️  No planned release found. Starting from v0.1.0"
  fi
  
  # Extract major.minor from last planned release
  MAJOR=$(echo "$LAST_PLANNED_RELEASE" | sed 's/v\([0-9]*\)\.[0-9]*\.[0-9]*/\1/')
  MINOR=$(echo "$LAST_PLANNED_RELEASE" | sed 's/v[0-9]*\.\([0-9]*\)\.[0-9]*/\1/')
  
  # Find highest patch version for this major.minor
  HIGHEST_PATCH=$(git tag -l "v${MAJOR}.${MINOR}.*" | sed 's/v[0-9]*\.[0-9]*\.\([0-9]*\)/\1/' | sort -n | tail -1)
  
  # If no patch versions exist, start at 1
  if [ -z "$HIGHEST_PATCH" ]; then
    NEW_PATCH=1
  else
    NEW_PATCH=$((HIGHEST_PATCH + 1))
  fi
  
  # New version: v{MAJOR}.{MINOR}.{NEW_PATCH}
  RELEASE_VERSION="v${MAJOR}.${MINOR}.${NEW_PATCH}"
  
  echo "✓ Incremental release version: $RELEASE_VERSION (from planned release $LAST_PLANNED_RELEASE)"
fi
```

### Step 6: Bump package.json Version

```bash
echo "📝 Bumping version to $RELEASE_VERSION..."

# Remove 'v' prefix for npm version
NPM_VERSION=${RELEASE_VERSION#v}

# Set exact version
npm version $NPM_VERSION --no-git-tag

if [ $? -ne 0 ]; then
  echo "❌ Error: Failed to bump version in package.json"
  exit 1
fi
```

### Step 7: Handle Release Document

**If planned release:**

```bash
if [ "$RELEASE_TYPE" = "planned" ]; then
  # Update existing release document status to deployed
  STATUS_FILE="docs/releases/$RELEASE_VERSION/status.md"
  
  if [ -f "$STATUS_FILE" ]; then
    # Update status to deployed
    sed -i.bak 's/status: ready_for_deployment/status: deployed/' "$STATUS_FILE"
    sed -i.bak 's/status: in_testing/status: deployed/' "$STATUS_FILE"
    rm -f "${STATUS_FILE}.bak"
    
    # Add deployment date
    echo "" >> "$STATUS_FILE"
    echo "**Deployment Date:** $(date -Iseconds)" >> "$STATUS_FILE"
    echo "**Deployment Commit:** $(git rev-parse HEAD)" >> "$STATUS_FILE"
  else
    echo "⚠️  Warning: Release status file not found: $STATUS_FILE"
  fi
fi
```

**If incremental release:**

```bash
if [ "$RELEASE_TYPE" = "incremental" ]; then
  # Create new incremental release document
  RELEASE_DIR="docs/releases/$RELEASE_VERSION"
  mkdir -p "$RELEASE_DIR"
  
  # Create release_plan.md
  cat > "$RELEASE_DIR/release_plan.md" << EOF
## Release $RELEASE_VERSION — Incremental Release

### Release Type
- **Type**: Incremental (continuous deployment)
- **Last Planned Release**: v${MAJOR}.${MINOR}.0
- **Purpose**: Continuous deployment of commits from dev branch

### Summary
Incremental release bundling commits from dev branch merge.

### Commits Included
$(git log main~1..main --oneline)

### Feature Units
$(git log main~1..main --oneline | grep -oE "FU-[0-9]{4}-[0-9]{2}-[0-9]{3}" | sort -u)

### Changes
$(git diff main~1..main --name-status | head -20)

EOF

  # Create status.md
  cat > "$RELEASE_DIR/status.md" << EOF
# Release $RELEASE_VERSION Status

**Status**: deployed

**Release Type**: Incremental

**Deployment Date**: $(date -Iseconds)

**Deployment Commit**: $(git rev-parse HEAD)

**Base Planned Release**: v${MAJOR}.${MINOR}.0

EOF
fi
```

### Step 8: Commit and Tag

```bash
echo "💾 Committing release..."

# Stage changes
git add package.json package-lock.json

if [ "$RELEASE_TYPE" = "planned" ]; then
  git add "docs/releases/$RELEASE_VERSION/status.md"
  git commit -m "Deploy planned release $RELEASE_VERSION

- Release: $RELEASE_VERSION (planned release)
- Status: deployed
- Deployment date: $(date -Iseconds)"
else
  git add "docs/releases/$RELEASE_VERSION/"
  COMMIT_COUNT=$(git log main~1..main --oneline | wc -l | tr -d ' ')
  git commit -m "Release $RELEASE_VERSION: Incremental release from dev merge

- Version: $RELEASE_VERSION (incremental, patch increment from v${MAJOR}.${MINOR}.0)
- Commits included: $COMMIT_COUNT
- Deployment date: $(date -Iseconds)"
fi

# Create tag
echo "🏷️  Creating tag $RELEASE_VERSION..."
git tag -a "$RELEASE_VERSION" -m "Release $RELEASE_VERSION"

# Push to origin
echo "📤 Pushing to origin..."
git push origin main
git push origin "$RELEASE_VERSION"
```

### Step 9: Deploy to Production

```bash
echo "🚀 Deploying to production..."

# Check if deployment is enabled
if [ -f "fly.toml" ]; then
  # Deploy to Fly.io
  echo "Deploying to Fly.io..."
  flyctl deploy --remote-only
  
  if [ $? -ne 0 ]; then
    echo "❌ Error: Deployment failed"
    echo "Rolling back..."
    git tag -d "$RELEASE_VERSION"
    git push origin :refs/tags/"$RELEASE_VERSION"
    git reset --hard HEAD~1
    git push origin main --force-with-lease
    exit 1
  fi
else
  echo "⚠️  Warning: No fly.toml found. Skipping deployment."
fi

# Run database migrations
if [ -f "scripts/run_migrations.js" ]; then
  echo "Running database migrations..."
  npm run migrate
  
  if [ $? -ne 0 ]; then
    echo "⚠️  Warning: Database migrations failed"
    # Don't rollback, but warn
  fi
fi

# Run smoke tests
echo "Running smoke tests..."
# Add smoke test commands here if available
```

### Step 10: Update Release Status

```bash
echo "✅ Release $RELEASE_VERSION deployed successfully!"
echo ""
echo "Release Type: $RELEASE_TYPE"
echo "Version: $RELEASE_VERSION"
echo "Commits: $COMMIT_COUNT"
echo ""
echo "Next steps:"
if [ "$RELEASE_TYPE" = "planned" ]; then
  echo "- Verify deployment at production URL"
  echo "- Run manual tests from release_report.md"
  echo "- Monitor metrics for first hour"
else
  echo "- Verify deployment at production URL"
  echo "- Monitor for errors"
fi
```

---

## Configuration

Configure publish behavior in `foundation-config.yaml`:

```yaml
development:
  publish:
    enabled: true
    integration_branch: "dev"
    main_branch: "main"
    create_release_doc: true
    release_type: "not_marketed"
    deployment:
      enabled: true
      provider: "fly"
      run_migrations: true
      smoke_tests: true
      health_check_url: "https://app.neotoma.app/health"
    versioning:
      planned_release_pattern: "v*.*.0"
      incremental_release_patch_only: true
      initial_version: "v0.1.0"
      detection:
        check_status_changes: true
        check_new_directories: true
        check_commit_messages: true
    submodules:
      foundation:
        deployment:
          enabled: false
        version_file: "package.json"
```

---

## Error Handling

**Rollback on Failure**:
- If deployment fails, revert main branch to previous commit
- Delete release tag if created
- If planned release status was updated, revert status change

**Common Issues**:
- Merge conflicts: Resolve manually, then retry
- Test failures: Fix tests, then retry
- Deployment failures: Check logs, rollback if needed
- Version conflicts: Increment further if version exists

---

## Summary

**Publish Modes:**
1. `/publish` - Publish main repository (detect planned vs incremental)
2. `/publish <submodule>` - Publish specific submodule only

**Release Types:**
- **Planned** (vX.Y.0): Detected from commits, uses existing release document
- **Incremental** (vX.Y.Z): Auto-generated, creates new release document

**Workflow:**
Validate → Merge → Detect Release Type → Version → Document → Commit → Tag → Deploy




