# Branch Strategy

## Overview

This document defines the branch naming conventions and branching model for the project.

## Branch Types

### Protected Branches

1. **Main Branch** (default: `main`)
   - Production-ready code
   - Protected: requires PR with approval
   - Direct commits forbidden
   - All changes via PR from integration branch

2. **Integration Branch** (default: `dev`)
   - Active development integration point
   - Protected: requires PR with approval
   - Direct commits forbidden
   - All features merge here first

### Working Branches

3. **Feature Branches**
   - Pattern: `{feature_prefix}/{id}-{description}` or `{feature_prefix}/{description}`
   - Branch from: integration branch
   - Merge to: integration branch
   - Lifespan: duration of feature development
   - Deleted after merge

4. **Bugfix Branches**
   - Pattern: `{bugfix_prefix}/{id}-{description}`
   - Branch from: integration branch (or main for production bugs)
   - Merge to: same branch branched from
   - Lifespan: duration of bug fix
   - Deleted after merge

5. **Hotfix Branches**
   - Pattern: `{hotfix_prefix}/{description}`
   - Branch from: main
   - Merge to: both main AND integration branch
   - Lifespan: until critical fix is deployed
   - Use sparingly (production emergencies only)

6. **Release Branches** (optional)
   - Pattern: `release/{version}`
   - Branch from: integration branch
   - Merge to: main (and back to integration)
   - Lifespan: duration of release preparation
   - Only bug fixes allowed

## Naming Conventions

### Default Prefixes

- Feature: `feature/`
- Bugfix: `bugfix/`
- Hotfix: `hotfix/`
- Release: `release/`

### Naming Patterns

**With ID:**
```
{prefix}/{id}-{description}
```
Examples:
- `feature/123-user-authentication`
- `bugfix/456-fix-memory-leak`
- `hotfix/critical-security-patch`

**Without ID:**
```
{prefix}/{description}
```
Examples:
- `feature/user-authentication`
- `bugfix/memory-leak`

### Description Guidelines

- Use lowercase
- Use hyphens to separate words
- Be descriptive but concise
- Avoid special characters

## Branching Workflows

### Feature Development

```bash
# 1. Start from latest integration branch
git checkout dev
git pull origin dev

# 2. Create feature branch
git checkout -b feature/123-new-feature

# 3. Develop, commit, push
git push -u origin feature/123-new-feature

# 4. Create PR to integration branch
gh pr create --base dev

# 5. After merge, delete branch
git branch -d feature/123-new-feature
```

### Bug Fix

```bash
# 1. Start from appropriate branch (integration or main)
git checkout dev  # or main for production bugs
git pull origin dev

# 2. Create bugfix branch
git checkout -b bugfix/456-fix-issue

# 3. Fix, test, commit, push
git push -u origin bugfix/456-fix-issue

# 4. Create PR
gh pr create --base dev  # or main

# 5. After merge, delete branch
git branch -d bugfix/456-fix-issue
```

### Hotfix (Production Emergency)

```bash
# 1. Start from main
git checkout main
git pull origin main

# 2. Create hotfix branch
git checkout -b hotfix/critical-fix

# 3. Fix, test, commit, push
git push -u origin hotfix/critical-fix

# 4. Create PR to main
gh pr create --base main

# 5. After merge to main, also merge to integration
git checkout dev
git merge main

# 6. Delete branch
git branch -d hotfix/critical-fix
```

## Configuration

Configure branch strategy in `foundation-config.yaml`:

```yaml
development:
  branch_strategy:
    # Branch names
    main_branches:
      - "main"
      - "dev"
    
    # Prefixes
    feature_prefix: "feature"
    bugfix_prefix: "bugfix"
    hotfix_prefix: "hotfix"
    release_prefix: "release"
    
    # Naming pattern
    # {prefix}/{id}-{description} or {prefix}/{description}
    naming_pattern: "{prefix}/{id}-{description}"
    require_id: true  # whether ID is required
    
    # Protection rules
    protected_branches:
      - "main"
      - "dev"
    
    # Merge strategy
    merge_strategy: "squash"  # or "merge", "rebase"
```

## Best Practices

1. **Keep branches short-lived**: Merge feature branches within days, not weeks
2. **One purpose per branch**: Don't mix features, bugs, or refactorings
3. **Update frequently**: Regularly rebase or merge from integration branch
4. **Clean up after merge**: Delete branches promptly after merging
5. **Use descriptive names**: Make branch purpose clear from name
6. **Follow naming conventions**: Consistency aids automation and clarity
7. **Protect important branches**: Use branch protection rules on main/integration

## Common Patterns to Avoid

❌ **Don't:**
- Branch from feature branches
- Keep long-lived feature branches
- Mix unrelated changes in one branch
- Use generic names like "fix" or "update"
- Commit directly to protected branches
- Force push to shared branches

✅ **Do:**
- Branch from integration branch
- Keep feature branches focused and short
- Use descriptive branch names
- Create PR for all changes to protected branches
- Use `--force-with-lease` if force push is necessary (feature branches only)

