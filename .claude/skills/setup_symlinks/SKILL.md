---
name: setup_symlinks
description: Setup Foundation Symlinks
---

<!-- Source: foundation/agent_instructions/cursor_commands/setup_symlinks.md -->

# Setup Foundation Symlinks

Sets up symlinks from foundation cursor rules and commands to `.cursor/` directory.

## Command

```
setup_symlinks
```

or

```
setup symlinks
```

## Purpose

This command runs the foundation symlinks script (`foundation/scripts/setup-cursor-rules.sh`) which:

1. Creates symlinks from `foundation/agent_instructions/cursor_rules/` to `.claude/rules/`
2. Creates symlinks from `foundation/agent_instructions/cursor_commands/` to `.claude/skills/`
3. Prefixes all symlink names with `foundation-` to avoid conflicts
4. Removes existing foundation symlinks before creating new ones
5. Preserves any non-symlink files (custom rules/commands)

## When to Use

- After installing foundation for the first time
- After updating foundation submodule (to refresh symlinks)
- When cursor rules/commands are not working (symlinks may be broken)
- When you want to ensure symlinks are up to date

## Execution Instructions

### Step 1: Verify Foundation Directory

**Check if foundation exists:**

- Look for `foundation/` directory in repo root
- If not found, check `../foundation/` (parent directory)
- If still not found, error: "Foundation directory not found. Please ensure foundation is installed."

### Step 2: Run Setup Script

**Execute the script:**

```bash
./foundation/scripts/setup-cursor-rules.sh
```

**Or if foundation is in parent directory:**

```bash
../foundation/scripts/setup-cursor-rules.sh
```

### Step 3: Verify Results

**Check output:**

- Script should report number of rules linked
- Script should report number of commands linked
- Check `.claude/rules/` for `foundation-*.md` symlinks
- Check `.claude/skills/` for `foundation-*.md` symlinks

**Expected output:**

```
[INFO] Setting up cursor rules and commands...
[INFO] Foundation directory: foundation
[INFO] Creating symlinks for generic cursor rules...
  ✓ Linked security.md -> foundation_security.md
  ✓ Linked worktree_env.md -> foundation_worktree_env.md
  ...
[INFO] Creating symlinks for generic cursor commands...
  ✓ Linked commit.md -> foundation-commit.md
  ✓ Linked analyze.md -> foundation-analyze.md
  ...
[INFO] ✅ Cursor rules setup complete!
[INFO]   Rules linked: X
[INFO]   Commands linked: Y
```

## What Gets Created

**Symlinks in `.claude/rules/`:**
- `foundation_security.md` → `foundation/agent_instructions/cursor_rules/security.md`
- `foundation_worktree_env.md` → `foundation/agent_instructions/cursor_rules/worktree_env.md`
- `foundation_readme_maintenance.md` → `foundation/agent_instructions/cursor_rules/readme_maintenance.md`
- ... (all rules from foundation)

**Symlinks in `.claude/skills/`:**
- `foundation_commit.md` → `foundation/agent_instructions/cursor_commands/commit.md`
- `foundation_analyze.md` → `foundation/agent_instructions/cursor_commands/analyze.md`
- ... (all commands from foundation)

## Behavior

**Symlink Prefix:**
- All symlinks are prefixed with `foundation_` to avoid conflicts
- Example: `security.md` becomes `foundation_security.md`

**Existing Files:**
- If a file already exists (not a symlink), it's preserved
- Script skips creating symlink to preserve customizations
- To replace with foundation version, manually remove the file first

**Existing Symlinks:**
- All existing `foundation_*.md` symlinks are removed first
- New symlinks are created fresh
- Ensures symlinks point to current foundation version

## Error Handling

### Foundation Directory Not Found

**Error:**
```
[ERROR] Foundation directory not found. Please run from repository root or ensure foundation is installed.
```

**Solution:**
- Ensure you're in repository root
- Verify foundation is installed (as submodule or symlink)
- Check if foundation is in parent directory

### Cursor Rules Directory Not Found

**Error:**
```
[ERROR] Cursor rules directory not found: foundation/agent_instructions/cursor_rules
```

**Solution:**
- Verify foundation submodule is initialized: `git submodule update --init`
- Check that foundation has cursor rules directory

### Cursor Commands Directory Not Found

**Error:**
```
[ERROR] Cursor commands directory not found: foundation/agent_instructions/cursor_commands
```

**Solution:**
- Verify foundation submodule is initialized: `git submodule update --init`
- Check that foundation has cursor commands directory

## Related Documents

- `foundation/scripts/setup-cursor-rules.sh` - The script that performs the setup
- `foundation/agent_instructions/README.md` - Cursor rules and commands documentation
- `foundation/README.md` - Foundation overview and installation

## Notes

- This command is generic and works for any repo using foundation as submodule
- Symlinks ensure single source of truth (foundation)
- Updates to foundation automatically apply to symlinked rules/commands
- Custom rules/commands (non-symlink files) are preserved
- Symlink prefix prevents conflicts with repository-specific rules/commands

