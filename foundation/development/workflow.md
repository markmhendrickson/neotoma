# Development Workflow Guide

_(Git Workflow, Branch Strategy, and PR Process)_

---

## Purpose

This document defines the development workflow, including git branch strategy, pull request process, and code review guidelines. It ensures consistent development practices across the project.

---

## Scope

This document covers:

- Git branch naming and strategy
- Pull request creation and review process
- Code review criteria
- Commit message conventions
- Feature integration workflow

This document does NOT cover:

- Local environment setup (see project-specific getting started docs)
- Feature specification (see project-specific feature documentation)
- Deployment procedures (see project-specific deployment docs)

---

## Branch Strategy

### Main Branches

- **`main`**: Production-ready code (protected, requires PR)
- **`dev`**: Integration branch for development (protected, requires PR)

> **Note:** Branch names are configurable via `foundation-config.yaml`. Some projects may use `master`, `develop`, or other naming conventions.

### Feature Branches

**Naming Convention:**

```
{feature_prefix}/{id}-{description}
```

Examples (with default `feature` prefix):

- `feature/101-entity-resolution`
- `feature/400-timeline-view`
- `feature/702-billing-integration`

Examples (with alternate `feat` prefix):

- `feat/user-authentication`
- `feat/payment-integration`

**Rules:**

- Branch from integration branch (default: `dev`)
- One feature per branch (atomic changes)
- Descriptive names with optional ID prefix

### Bugfix Branches

**Naming Convention:**

```
{bugfix_prefix}/{id}-{issue-description}
```

Examples:

- `bugfix/101-fix-deterministic-ids`
- `bugfix/400-timeline-sorting`

### Hotfix Branches

**Naming Convention:**

```
{hotfix_prefix}/{critical-issue-description}
```

**Rules:**

- Branch from `main` (for production fixes)
- Merge to both `main` and integration branch
- Use sparingly (only for critical production issues)

---

## Development Workflow

### Step 1: Create Feature Branch (Worktree Recommended)

**Recommended: Use Git Worktrees**

Each feature should be developed in its own worktree for isolation and parallel development:

```bash
# From main repo root
cd /path/to/repo

# Ensure integration branch is up to date
git fetch origin
git checkout dev  # or your integration branch
git pull origin dev

# Create worktree for this feature (creates branch from current branch)
git worktree add ../repo-{branch-name} -b {feature_prefix}/{id}-{description}

# Navigate to worktree
cd ../repo-{branch-name}

# Verify branch is based on integration branch
git branch --show-current  # Should show feature branch name
git log --oneline -1       # Should show latest integration branch commit

# Setup worktree environment (if using env handler)
npm run copy:env  # or project-specific env copy command

# Install dependencies in worktree
npm install  # or project-specific install command

# Push branch to remote
git push -u origin {feature_prefix}/{id}-{description}
```

**Benefits of Worktrees:**

- **Isolation:** Each feature has its own dependencies, env files, and build artifacts
- **Parallel Development:** Work on multiple features simultaneously without conflicts
- **Clean Context Switching:** Each worktree is independent
- **Environment Management:** Automatic env file copying (if configured)

**Alternative: Traditional Branching (if not using worktrees)**

```bash
# Ensure you're on integration branch and up to date
git checkout dev  # or your integration branch
git pull origin dev

# Create feature branch
git checkout -b {feature_prefix}/{id}-{description}

# Push to remote (sets upstream)
git push -u origin {feature_prefix}/{id}-{description}
```

### Step 2: Implement Feature

1. **Load relevant documentation:**

   - Project-specific foundational principles
   - Feature specification (if exists)
   - Relevant subsystem/module docs

2. **Write code following:**

   - Project architecture guidelines
   - Coding conventions (see `foundation/conventions/code-conventions.md`)
   - Error handling patterns
   - Testing standards (see `foundation/testing/testing-standard.md`)

3. **Write tests:**

   - Unit tests for pure functions
   - Integration tests for services
   - E2E tests for UI flows (if applicable)

4. **Verify locally:**
   ```bash
   npm run lint        # or project-specific lint command
   npm run type-check  # or project-specific type check
   npm test            # or project-specific test command
   ```

### Step 3: Commit Changes

**Commit Message Format:**

```
{id}: Brief description

- Detailed change 1
- Detailed change 2

References: {spec_document_path}
```

**Examples:**

```
101: Implement entity resolution

- Add normalizeEntityValue function
- Add generateEntityId with hash-based IDs
- Add entity resolution service
- Add unit tests for determinism

References: docs/specs/features.md
```

**Commit Rules:**

- One logical change per commit
- Reference feature/task ID in message (if using IDs)
- Include "References:" line pointing to relevant docs (optional but recommended)
- Keep commits atomic (easy to review, revert)

### Step 4: Push and Create Pull Request

```bash
# Push commits
git push

# Create PR via GitHub UI or CLI
gh pr create --base dev --title "{id}: Feature Description" --body "PR body"
```

**PR Title Format:**

```
{id}: Feature Description
```

**PR Body Template:**

```markdown
## Feature/Task

- **ID**: {id}
- **Priority**: P0/P1/P2 (or project-specific priority system)
- **Spec**: [Link to spec if exists]

## Changes

- Change 1
- Change 2

## Testing

- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated (if UI)
- [ ] All tests passing locally

## Documentation

- [ ] Code comments added
- [ ] Module/subsystem docs updated (if patterns changed)
- [ ] Feature spec updated (if errors found)

## Risk Assessment

- **Risk Level**: Low/Medium/High
- **Breaking Changes**: Yes/No
- **Migration Required**: Yes/No

## Checklist

- [ ] Follows project architecture guidelines
- [ ] Error handling follows project patterns
- [ ] No secrets in code or logs
- [ ] Respects project-specific constraints
```

---

## Code Review Process

### Review Criteria

**MUST Verify:**

1. **Architectural Compliance:**

   - Respects project architecture guidelines
   - Follows coding conventions
   - Maintains project-specific principles

2. **Code Quality:**

   - Types are correct (if using typed language)
   - Error handling is structured
   - No secrets in logs or error messages
   - Tests cover critical paths

3. **Documentation:**

   - Code is commented where complex
   - Module/subsystem docs updated if patterns changed
   - Feature spec updated if errors found

4. **Testing:**
   - Unit tests for pure functions
   - Integration tests for services
   - E2E tests for UI flows
   - Regression tests for bug fixes

### Review Labels

- **`approved`**: Ready to merge (all criteria met)
- **`changes-requested`**: Needs fixes before merge
- **`needs-docs`**: Code is fine, but documentation needs updates
- **`needs-tests`**: Code is fine, but test coverage insufficient
- **`high-risk`**: Requires additional review

### Review Response Time

Configure based on project priorities:

- **High Priority**: Review within 4-8 hours
- **Medium Priority**: Review within 24 hours
- **Low Priority**: Review within 48 hours

---

## Merge Process

### Before Merging

1. **All CI checks pass:**

   - Lint passes
   - Type check passes (if applicable)
   - Tests pass
   - Coverage meets thresholds

2. **Review approved:**

   - At least one approval
   - No "changes-requested" label
   - High-risk PRs require 2 approvals

3. **Branch is up to date:**
   ```bash
   git checkout dev  # or your integration branch
   git pull origin dev
   git checkout {feature-branch}
   git rebase dev  # or merge dev into feature branch
   ```

### Merge Strategy

**Recommended for Clean History:**

- Use **"Squash and merge"** to keep integration branch history clean
- PR title becomes commit message
- Feature/task ID preserved in commit message

**After Merge:**

**If using worktree:**

```bash
# From main repo root
git worktree remove ../repo-{branch-name}
# Or if worktree still has uncommitted changes:
git worktree remove --force ../repo-{branch-name}

# The branch will be automatically deleted from remote after merge
# If you need to delete local branch tracking:
git branch -d {feature-branch}
```

**If using traditional branching:**

```bash
# Delete local branch
git checkout dev  # or your integration branch
git pull origin dev
git branch -d {feature-branch}
```

---

## Feature Integration

### When Feature is Complete

1. **Update Feature Status:**

   - Mark as complete in project tracking system
   - Move spec to completed features directory (if applicable)

2. **Update Documentation:**

   - Update module/subsystem docs if patterns changed
   - Add error codes to error reference (if applicable)
   - Update architecture docs if structural changes

3. **Verify Integration:**
   - Run full test suite
   - Verify E2E tests (if applicable)
   - Check metrics/observability (if applicable)

---

## Conflict Resolution

### When Conflicts Occur

1. **Rebase on latest integration branch:**

   ```bash
   git checkout {feature-branch}
   git fetch origin
   git rebase origin/dev  # or your integration branch
   ```

2. **Resolve conflicts:**

   - Edit conflicted files
   - Keep changes that align with feature spec
   - Verify tests still pass after resolution

3. **Continue rebase:**

   ```bash
   git add <resolved-files>
   git rebase --continue
   ```

4. **Force push (if already pushed):**
   ```bash
   git push --force-with-lease
   ```

**Note:** Only force push to feature branches, never to integration or main branches.

---

## Configuration

This workflow is configurable via `foundation-config.yaml`:

```yaml
development:
  branch_strategy:
    main_branches: ["main", "dev"]
    feature_prefix: "feature"  # or "feat", "ft", etc.
    bugfix_prefix: "bugfix"
    hotfix_prefix: "hotfix"
    naming_pattern: "{prefix}/{id}-{description}"  # or "{prefix}/{description}"
  workflow:
    use_worktrees: true
    worktree_base_path: "../{repo}-{branch}"
    env_copy_script: "scripts/copy-env-to-worktree.js"  # optional
  commit_format:
    require_id: true  # whether ID is required in commit messages
    require_references: false  # whether "References:" line is required
```

---

## Agent Instructions

### When to Load This Document

Load when:

- Creating a new feature branch
- Preparing a pull request
- Reviewing code changes
- Resolving merge conflicts
- Understanding git workflow

### Required Co-Loaded Documents

- Project-specific foundational principles
- Feature specification standards
- Project-specific architectural guidelines

### Constraints Agents Must Enforce

1. **Always branch from integration branch**: Never from main (except hotfixes)
2. **One feature per branch**: Keep changes atomic
3. **Use worktrees for isolation**: When configured, each feature should have its own worktree
4. **Setup worktree environment**: Run env copy script after creating worktree (if configured)
5. **Reference feature/task ID**: In commit messages and PR titles (if using IDs)
6. **Follow commit message format**: As specified in project config
7. **Verify tests pass**: Before creating PR
8. **Update documentation**: If patterns or architecture change

### Forbidden Patterns

- Committing directly to protected branches (main, integration branch)
- Mixing multiple features in one branch
- Force pushing to protected branches
- Skipping code review
- Merging without tests passing
- Committing secrets or API keys

