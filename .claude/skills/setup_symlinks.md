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
3. Uses original filenames (no prefix)
4. Removes existing foundation symlinks before creating new ones
5. Preserves any non-symlink files (custom rules/commands)

**When run from the foundation repository itself**, it also automatically runs the setup script in peer repositories (located at `../*`) that include this foundation repo via symlink.

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

### Step 2: Run Setup Script in Current Repository

**Execute the script:**

```bash
./foundation/scripts/setup-cursor-rules.sh
```

**Or if foundation is in parent directory:**

```bash
../foundation/scripts/setup-cursor-rules.sh
```

### Step 3: Run Setup Script in Peer Repositories (If in Foundation Repo)

**If running from the foundation repository itself** (detected by presence of `agent_instructions/cursor_commands/` directory):

1. **Get current repository absolute path:**
   ```bash
   CURRENT_REPO=$(pwd -P)
   ```

2. **Find peer repositories in parent directory:**
   ```bash
   PARENT_DIR=$(dirname "$CURRENT_REPO")
   for peer_repo in "$PARENT_DIR"/*; do
     # Skip if not a directory or if it's the current repo
     if [ ! -d "$peer_repo" ] || [ "$peer_repo" = "$CURRENT_REPO" ]; then
       continue
     fi
     
     # Check if peer repo has foundation/ symlink pointing to this repo
     if [ -L "$peer_repo/foundation" ]; then
       SYMLINK_TARGET=$(readlink -f "$peer_repo/foundation" 2>/dev/null || readlink "$peer_repo/foundation")
       if [ "$SYMLINK_TARGET" = "$CURRENT_REPO" ]; then
         echo "Found peer repo with foundation symlink: $(basename "$peer_repo")"
         # Run setup script in peer repo using absolute path
         (cd "$peer_repo" && "$CURRENT_REPO/scripts/setup_cursor_rules.sh" || echo "Failed to run in $(basename "$peer_repo")")
       fi
     fi
   done
   ```

**Behavior:**
- Only runs in peer repos if executing from foundation repo itself
- Detects peer repos by checking `../*` directories
- Verifies each peer repo has `foundation/` symlink pointing to current repo
- Runs setup script in each matching peer repo
- Continues even if one peer repo fails

**Expected output (when peer repos found):**
```
[INFO] Setting up cursor rules and commands...
...
[INFO] ✅ Cursor rules setup complete!

[INFO] Detected foundation repository - checking for peer repos...
[INFO] Found peer repo with foundation symlink: my-project
[INFO] Running setup script in my-project...
[INFO] Setting up cursor rules and commands...
...
[INFO] ✅ Cursor rules setup complete!
[INFO] ✓ Successfully updated my-project

[INFO] Updated 1 peer repo(s)
```

### Step 4: Verify Results

**Check output:**

- Script should report number of rules linked
- Script should report number of commands linked
- Check `.claude/rules/` for foundation rule symlinks (using original filenames)
- Check `.claude/skills/` for foundation command symlinks (using original filenames)

**Expected output:**

```
[INFO] Setting up cursor rules and commands...
[INFO] Foundation directory: foundation
[INFO] Creating symlinks for generic cursor rules...
  ✓ Linked security.mdc
  ✓ Linked worktree_env.mdc
  ...
[INFO] Creating symlinks for generic cursor commands...
  ✓ Linked commit.md
  ✓ Linked analyze.md
  ...
[INFO] ✅ Cursor rules setup complete!
[INFO]   Rules linked: X
[INFO]   Commands linked: Y
```

## What Gets Created

**Symlinks in `.claude/rules/`:**
- `security.mdc` → `foundation/agent_instructions/cursor_rules/security.mdc`
- `worktree_env.mdc` → `foundation/agent_instructions/cursor_rules/worktree_env.mdc`
- `readme_maintenance.mdc` → `foundation/agent_instructions/cursor_rules/readme_maintenance.mdc`
- ... (all rules from foundation, using original filenames)

**Symlinks in `.claude/skills/`:**
- `commit.md` → `foundation/agent_instructions/cursor_commands/commit.md`
- `analyze.md` → `foundation/agent_instructions/cursor_commands/analyze.md`
- ... (all commands from foundation, using original filenames)

## Behavior

**Filenames:**
- Symlinks use original filenames from foundation (no prefix)
- Example: `security.mdc` remains `security.mdc`

**Existing Files:**
- If a file already exists (not a symlink), it's preserved
- Script skips creating symlink to preserve customizations
- To replace with foundation version, manually remove the file first

**Existing Symlinks:**
- All existing foundation symlinks (old prefixed and new unprefixed) are removed first
- New symlinks are created fresh with original filenames
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
- Uses original filenames (no prefix) - repository-specific rules use different naming patterns
- **When run from foundation repo**: Automatically propagates to peer repos that symlink to this foundation
- **Peer repo detection**: Only processes repos in `../*` that have `foundation/` symlink pointing to this repo

