# Security Rule

## Purpose

Prevent accidental commits of private, sensitive, or confidential documentation and data.

## Pre-Commit Security Audit

Before staging or committing ANY changes, perform the following checks:

### 1. Private Documentation Check

**CRITICAL**: Check for any files in `docs/private/` directory:

```bash
# Check unstaged changes
git status --porcelain | grep -E "^[AM]|^\?\?" | grep -E "docs/private/" && echo "ERROR: Private docs detected" && exit 1

# Check staged changes (if any exist)
git diff --cached --name-only | grep -E "docs/private/" && echo "ERROR: Private docs already staged" && exit 1
```

**Action**: If any files match `docs/private/**`, **ABORT** the commit immediately and alert the user.

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
git status --porcelain | grep -vE "(test|spec|property_keys)" | grep -iE "(secret|private)" | grep -vE "docs/private" && echo "ERROR: Suspicious file patterns detected" && exit 1
```

**Note**: This check excludes test files and legitimate code files like `property_keys.ts`.

### 4. Data Directory Check

Check for files in `data/` directory (should be in `.gitignore`):

```bash
git status --porcelain | grep -E "^[AM]|^\?\?" | grep -E "^data/" && echo "ERROR: Data directory files detected" && exit 1
git diff --cached --name-only | grep -E "^data/" && echo "ERROR: Data directory files already staged" && exit 1
```

### 5. Hardcoded Credentials Scan

Scan staged and unstaged files for common credential patterns:

```bash
# Only scan text files, exclude binary files
git diff --cached --name-only | xargs -I {} sh -c 'file {} | grep -q "text" && grep -lE "(api[_-]?key|password|secret|token)\s*[:=]\s*['\''\"][^'\''\"]{10,}" {}' && echo "WARNING: Potential hardcoded credentials detected" && exit 1
```

**Action**: If potential credentials are found, review manually before proceeding.

## Security Audit Execution

The security audit MUST be executed **BEFORE** running `git add -A` or staging any files.

### Audit Script

```bash
#!/bin/bash
set -e

echo "🔒 Running pre-commit security audit..."

# Check 1: Private docs
if git status --porcelain | grep -E "^[AM]|^\?\?" | grep -qE "docs/private/"; then
    echo "❌ SECURITY VIOLATION: Files in docs/private/ detected!"
    echo "Files:"
    git status --porcelain | grep -E "^[AM]|^\?\?" | grep "docs/private/"
    exit 1
fi

if git diff --cached --name-only 2>/dev/null | grep -qE "docs/private/"; then
    echo "❌ SECURITY VIOLATION: Files in docs/private/ already staged!"
    echo "Files:"
    git diff --cached --name-only | grep "docs/private/"
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

# Check 3: Data directory
if git status --porcelain | grep -E "^[AM]|^\?\?" | grep -qE "^data/"; then
    echo "❌ SECURITY VIOLATION: Files in data/ directory detected!"
    git status --porcelain | grep -E "^[AM]|^\?\?" | grep "^data/"
    exit 1
fi

if git diff --cached --name-only 2>/dev/null | grep -qE "^data/"; then
    echo "❌ SECURITY VIOLATION: Files in data/ directory already staged!"
    git diff --cached --name-only | grep "^data/"
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

No exceptions. Private documentation must never be committed to public repositories.


