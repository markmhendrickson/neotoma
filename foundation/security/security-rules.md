# Security Rules

## Purpose

Prevent accidental commits of private, sensitive, or confidential data and enforce security best practices.

## Pre-Commit Security Audit

Before staging or committing ANY changes, perform the following checks:

### 1. Protected Directories Check

**CRITICAL**: Check for any files in protected directories (configured in `foundation-config.yaml`):

```bash
# Check unstaged changes
git status --porcelain | grep -E "^[AM]|^\?\?" | grep -E "docs/private/|data/" && echo "ERROR: Protected directory detected" && exit 1

# Check staged changes (if any exist)
git diff --cached --name-only | grep -E "docs/private/|data/" && echo "ERROR: Protected files already staged" && exit 1
```

**Action**: If any files match protected patterns, **ABORT** the commit immediately and alert the user.

### 2. Environment Files Check

Check for any `.env*` files (should be in `.gitignore` but verify):

```bash
git status --porcelain | grep -E "\.env" && echo "ERROR: Environment files detected" && exit 1
git diff --cached --name-only | grep -E "\.env" && echo "ERROR: Environment files already staged" && exit 1
```

**Action**: If any `.env*` files are detected, **ABORT** the commit.

### 3. Sensitive File Pattern Check

Check for files with sensitive naming patterns:

```bash
# Check for files with "secret" or "private" in path (excluding legitimate code)
git status --porcelain | grep -vE "(test|spec)" | grep -iE "(secret|private)" | grep -vE "docs/private" && echo "ERROR: Suspicious file patterns detected" && exit 1
```

**Note**: This check excludes test files and legitimate code files.

### 4. Hardcoded Credentials Scan

Scan staged and unstaged files for common credential patterns:

```bash
# Only scan text files, exclude binary files
git diff --cached --name-only | xargs -I {} sh -c 'file {} | grep -q "text" && grep -lE "(api[_-]?key|password|secret|token)\s*[:=]\s*['\''"][^'\''\"]{10,}" {}' && echo "WARNING: Potential hardcoded credentials detected" && exit 1
```

**Action**: If potential credentials are found, review manually before proceeding.

## Security Audit Execution

The security audit MUST be executed **BEFORE** running `git add -A` or staging any files.

### Audit Script

```bash
#!/bin/bash
set -e

echo "🔒 Running pre-commit security audit..."

# Check 1: Protected directories
if git status --porcelain | grep -E "^[AM]|^\?\?" | grep -qE "docs/private/|data/"; then
    echo "❌ SECURITY VIOLATION: Files in protected directories detected!"
    echo "Files:"
    git status --porcelain | grep -E "^[AM]|^\?\?" | grep "docs/private/\|data/"
    exit 1
fi

if git diff --cached --name-only 2>/dev/null | grep -qE "docs/private/|data/"; then
    echo "❌ SECURITY VIOLATION: Protected files already staged!"
    echo "Files:"
    git diff --cached --name-only | grep "docs/private/\|data/"
    exit 1
fi

# Check 2: Environment files
if git status --porcelain | grep -qE "\.env"; then
    echo "❌ SECURITY VIOLATION: .env files detected!"
    git status --porcelain | grep "\.env"
    exit 1
fi

if git diff --cached --name-only 2>/dev/null | grep -qE "\.env"; then
    echo "❌ SECURITY VIOLATION: .env files already staged!"
    git diff --cached --name-only | grep "\.env"
    exit 1
fi

echo "✅ Security audit passed"
```

## Enforcement

This security audit MUST be run:

1. **Before** any `git add` command
2. **Before** any `git commit` command
3. As part of the commit command workflow

## Failure Behavior

If the security audit fails:

1. **STOP** all git operations immediately
2. **DO NOT** stage or commit any files
3. Display clear error message to user
4. List the specific files that triggered the violation
5. Wait for user to resolve the issue before proceeding

## Exceptions

No exceptions. Protected files and credentials must never be committed to repositories.

## Configuration

Configure protected paths and patterns in `foundation-config.yaml`:

```yaml
security:
  enabled: true
  pre_commit_audit:
    enabled: true
    protected_paths:
      - "docs/private/"  # Repo-specific
      - "data/"         # Repo-specific
      - ".env*"
    protected_patterns:
      - "\.env"
      - "secrets"
      - "credentials"
      - "password"
  credential_management:
    enabled: true
    require_env_separation: false  # whether to require DEV_*/PROD_* prefixes
```

## Best Practices

1. **Use `.gitignore`** to prevent protected files from being tracked
2. **Store secrets securely** using secrets management tools
3. **Use environment variables** for credentials (never hard-code)
4. **Rotate credentials regularly** if accidentally committed
5. **Use git hooks** to automate security checks
6. **Review changes** before staging to catch issues early

