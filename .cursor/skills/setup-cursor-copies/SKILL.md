---
name: setup-cursor-copies
description: Setup foundation cursor rules and commands in .cursor/ (run setup script).
triggers:
  - setup cursor copies
  - sync cursor files
  - /setup_cursor_copies
  - setup-cursor-copies
---

# Setup Foundation Cursor Copies

Sets up foundation cursor rules and commands in `.cursor/`. **When foundation is a git submodule**, creates **symlinks** (stays in sync with `git submodule update`). Otherwise creates **independent copies**.

## Command

```
setup_cursor_copies
```

or

```
setup cursor copies
```

## Purpose

This command runs the foundation setup script (`foundation/scripts/setup_cursor_copies.sh`) which:

1. **If foundation is a git submodule:** Delegates to `setup_cursor_rules.sh` and creates **symlinks** from foundation to `.cursor/` (single source of truth; updates apply with `git submodule update`).
2. **Otherwise:** Creates **independent copies** of foundation rules/commands in `.cursor/`.
3. Uses original filenames (no prefix).
4. Removes existing foundation files before creating new ones.
5. Preserves any non-foundation files (custom rules/commands).

**When run from the foundation repository itself**, it also automatically runs the setup script in peer repositories (located at `../*`) that include this foundation repo via symlink.

## When to Use

- **Submodule:** Run after `git submodule update` (or any setup); symlinks keep `.cursor/` in sync automatically.
- **Copy mode (foundation not a submodule):** When you want independent copies, need to customize rules, symlinks are not suitable, or you version-control your own copies. Re-run after foundation updates to refresh.

## Submodule vs copy behavior

**When foundation is a git submodule** (this command delegates to `setup_cursor_rules`):
- Creates symlinks to foundation (single source of truth)
- Updates automatically when foundation changes (`git submodule update`)
- Cannot customize foundation rules without breaking the link

**When foundation is a symlink or copy** (this command uses copy mode):
- Creates independent file copies
- Uses original filenames (no prefix)
- Does NOT update automatically when foundation changes
- Can be customized per repository
- Must re-run script to get foundation updates

## Execution Instructions

### Step 1: Verify Foundation Directory

**Check if foundation exists:**

- Look for `foundation/` directory in repo root
- If not found, check `../foundation/` (parent directory)
- If still not found, error: "Foundation directory not found. Please ensure foundation is installed."

### Step 2: Run Copy Script in Current Repository

**Execute the script:**

```bash
./foundation/scripts/setup_cursor_copies.sh
```

**Or if foundation is in parent directory:**

```bash
../foundation/scripts/setup_cursor_copies.sh
```

### Step 3: Run Copy Script in Peer Repositories (If in Foundation Repo)

**If running from the foundation repository itself** (detected by presence of `agent_instructions/cursor_skills/` directory):

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
         # Run copy script in peer repo using absolute path
         (cd "$peer_repo" && "$CURRENT_REPO/scripts/setup_cursor_copies.sh" || echo "Failed to run in $(basename "$peer_repo")")
       fi
     fi
   done
   ```

**Behavior:**
- Only runs in peer repos if executing from foundation repo itself
- Detects peer repos by checking `../*` directories
- Verifies each peer repo has `foundation/` symlink pointing to current repo
- Runs copy script in each matching peer repo
- Continues even if one peer repo fails

**Expected output (when peer repos found):**
```
[INFO] ✅ Cursor rules setup complete!
...
[INFO] Detected foundation repository - checking for peer repos...
[INFO] Found peer repo with foundation symlink: my-project
[INFO] Running copy setup script in my-project...
[INFO] Foundation is a git submodule; using symlinks (setup_cursor_rules)...  (or copy mode)
...
[INFO] ✅ Cursor rules setup complete!
[INFO] ✓ Successfully updated my-project

[INFO] Updated 1 peer repo(s)
```

### Step 4: Verify Results

**Check output:**

- **Submodule:** Script reports "Foundation is a git submodule; using symlinks", then rules **linked**. Check `.cursor/rules/` for symlinks; `.cursor/skills/` is populated from foundation skills.
- **Copy mode:** Script reports rules and skills **copied**. Check `.cursor/rules/` and `.cursor/skills/` for regular files (not symlinks).

**Expected output (submodule):**

```
[INFO] Foundation is a git submodule; using symlinks (setup_cursor_rules)...
[INFO] Setting up cursor rules and commands...
[INFO] Creating symlinks for generic cursor rules...
  ✓ Linked security.mdc -> security.mdc
  ...
[INFO] ✅ Cursor rules setup complete!
[INFO]   Foundation rules linked: X
[INFO]   Foundation commands linked: Y
```

**Expected output (copy mode):**

```
[INFO] Setting up cursor rules and commands (copy mode)...
[INFO] Copying generic cursor rules...
  ✓ Copied security.mdc
  ...
[INFO] ✅ Cursor rules setup complete!
[INFO]   Rules copied: X
[INFO]   Commands copied: Y
```

## What Gets Created

**When foundation is a submodule (symlinks):**
- `.cursor/rules/` contains **symlinks** to `foundation/agent_instructions/cursor_rules/`. `.cursor/skills/` is populated from `foundation/agent_instructions/cursor_skills/` (skills replace legacy commands). Updates to foundation apply when you re-run setup.

**When foundation is not a submodule (copies):**
- `.cursor/rules/` and `.cursor/skills/` contain **independent copies** of foundation rules and skills (e.g. `security.mdc`, `worktree_env.mdc`, and full skill workflows). Re-run to refresh after foundation updates.

**Note:** Repository rules from `docs/` are handled per `setup_cursor_rules` (symlinks when submodule) or copied in copy mode. Source files in `docs/` remain the source of truth.

## Behavior

**Filenames:**
- Foundation rules/commands use original filenames (no prefix), e.g. `security.mdc` remains `security.mdc`.

**Submodule (symlinks):** Removes existing foundation files (symlinks or copies), then creates symlinks. Repo rules from `docs/` are symlinked; any existing file at the target path (symlink or regular file) is removed and replaced with the symlink to the source.

**Copy mode:** Removes existing foundation files, then creates copies. Repo rules from `docs/` are copied.

**Existing Files:** If a target already exists (symlink or regular file), it is removed and replaced with the symlink (or copy in copy mode). Source in `docs/` or foundation is the single source of truth.

**Existing Foundation Files:** Removed first (prefixed and unprefixed), then new symlinks or copies created. Ensures output matches current foundation.

**Copy mode only:** Files are independent; foundation changes do not apply until you re-run. You can customize copies.

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

### Cursor Skills Directory (optional)

Foundation workflows are in `foundation/agent_instructions/cursor_skills/`. If present, setup copies them to `.cursor/skills/`. If the directory is missing, setup still succeeds (rules only).

## Related Documents

- `foundation/scripts/setup_cursor_copies.sh` - Entry script (delegates to symlink or copy logic)
- `foundation/scripts/setup_cursor_rules.sh` - Symlink implementation (used when foundation is submodule)
- `foundation/agent_instructions/README.md` - Cursor rules and commands documentation
- `foundation/README.md` - Foundation overview and installation

## Notes

- **Submodule → symlinks**: Foundation as git submodule yields symlinks; updates apply with `git submodule update`.
- **Otherwise → copies**: Symlink or copy foundation yields independent copies; re-run to refresh.
- **Original filenames**: Foundation rules/commands use original filenames (no prefix).
- **Repository rules**: From `docs/`; symlinked or copied per mode. Source in `docs/` remains source of truth.
- **When run from foundation repo**: Propagates to peer repos in `../*` that have `foundation/` symlink to this repo.
