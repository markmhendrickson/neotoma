---
description: "Prevent accidental commits of private, sensitive, or confidential data; run pre-commit security audit. Load when staging or committing, or when editing protected paths."
alwaysApply: false
---

<!-- Source: foundation/.cursor/rules/security.mdc -->

# Security Rule

Prevents accidental commits of private, sensitive, or confidential documentation and data.

Configuration: This rule uses protected paths configured in `foundation-config.yaml` under `security.pre_commit_audit.protected_paths`.

## Pre-Commit Security Audit

Before staging or committing ANY changes, agents MUST perform the following checks:

### 1. Protected Paths Check

Check for any files in protected paths (configured in `foundation-config.yaml`):

```bash
# Load protected paths from config (example paths shown)
PROTECTED_PATHS=("docs/private/" "data/")  # Configured per repository

# Check unstaged changes
for path in "${PROTECTED_PATHS[@]}"; do
  if git status --porcelain | grep -E "^[AM]|^\?\?" | grep -qE "$path"; then
    echo "❌ SECURITY VIOLATION: Files in $path detected!"
    git status --porcelain | grep -E "^[AM]|^\?\?" | grep "$path"
    exit 1
  fi
done

# Check staged changes (if any exist)
for path in "${PROTECTED_PATHS[@]}"; do
  if git diff --cached --name-only 2>/dev/null | grep -qE "$path"; then
    echo "❌ SECURITY VIOLATION: Files in $path already staged!"
    git diff --cached --name-only | grep "$path"
    exit 1
  fi
done
```

If any files match protected paths, ABORT the commit immediately and alert the user.

### 2. Environment Files Check

Check for any `.env*` files (should be in `.gitignore` but verify):

```bash
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
```

If any `.env*` files are detected, ABORT the commit.

Configuration: Enable/disable via `security.pre_commit_audit.check_env_files` in `foundation-config.yaml`.

### 3. Sensitive File Pattern Check

Check for files with sensitive naming patterns:

```bash
# Check for files with "secret" or "private" in path (excluding legitimate code)
git status --porcelain | grep -vE "(test|spec|property_keys)" | grep -iE "(secret|private)" | grep -vE "$(IFS='|'; echo "${PROTECTED_PATHS[*]}")" && echo "WARNING: Suspicious file patterns detected" && exit 1
```

**Note**: This check excludes test files and legitimate code files. Protected paths are also excluded.

### 4. Data Directory Check

Check for files in `data/` directory (should be in `.gitignore`):

```bash
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
```

**Configuration**: Enable/disable via `security.pre_commit_audit.check_data_directory` in `foundation-config.yaml`.

### 5. Hardcoded Credentials Scan

Scan staged and unstaged files for common credential patterns:

```bash
# Only scan text files, exclude binary files
git diff --cached --name-only | xargs -I {} sh -c 'file {} | grep -q "text" && grep -lE "(api[_-]?key|password|secret|token)\s*[:=]\s*['\''\"][^'\''\"]{10,}" {}' && echo "WARNING: Potential hardcoded credentials detected" && exit 1
```

If potential credentials are found, review manually before proceeding.

## Security Audit Execution

The security audit must be executed BEFORE running `git add -A` or staging any files.

### Agent Responsibilities

Agents MUST:
- Perform security audit checks before staging or committing files
- Load protected paths from `foundation-config.yaml` if available
- Abort commit immediately if any violations are detected
- Alert user clearly about security violations

Agents MUST NOT:
- Bypass or skip security checks
- Commit files in protected paths
- Suggest workarounds to security checks
- Use `--no-verify` flag to skip hooks (if hooks are configured)

## Enforcement

This security audit must be run:
1. Before any `git add` command
2. Before any `git commit` command
3. As part of the commit command workflow

## Failure Behavior

If the security audit fails:
1. STOP all git operations immediately
2. Do NOT stage or commit any files
3. Display clear error message to user
4. List the specific files that triggered the violation
5. Wait for user to resolve the issue before proceeding

## Configuration

Configure protected paths and audit checks in `foundation-config.yaml`:

```yaml
security:
  pre_commit_audit:
    protected_paths:
      - "docs/private/"  # Example: repository-specific protected paths
      - "data/"          # Example: data directory
    check_env_files: true
    check_data_directory: true
```

## Exceptions

No exceptions. Private documentation must never be committed to public repositories.
