# commit

Run entire tests suite and resolve any errors as necessary. Proceed to analyze all uncommitted files for security vulnerabilities and patch as necessary.

**SENSITIVE DATA AUDIT**: Follow the Security Rule (`.cursor/rules/security.md`) before staging or committing anything. Only continue once the audit passes.

**UI TESTING**: If any frontend files were modified (`frontend/src/**`), automatically follow the Testing Rule (`.cursor/rules/testing.md`) to verify user-facing changes work correctly in the browser before committing. After completing the browser run, rerun the sensitive data audit in case new assets or logs were created.

**IMPORTANT**: Before committing, ensure all changes are staged:

1. Run `git add -A` to stage all changes (including any made during security analysis)
2. Verify staged changes with `git status` to ensure nothing is missed
3. If any files were modified after the initial `git add`, run `git add -A` again right before committing

**BRANCH RENAMING**: Follow the Branch Naming Rule (`.cursor/rules/branch-naming.md`) to automatically rename chat-\* branches before committing.

**COMPREHENSIVE CHANGE ANALYSIS**: Before generating the commit message, perform comprehensive analysis of all staged changes:

1. **Categorize Changes by Type:**

   - Run `git diff --cached --name-status` to get all changed files with their status (A/M/D)
   - Group files by status: Added (A), Modified (M), Deleted (D)
   - Count files in each category

2. **Categorize Changes by Functional Area:**

   - Group files by directory/domain:
     - Documentation (`docs/**`) - further categorize by subdirectory (foundation/, architecture/, subsystems/, releases/, specs/)
     - Source code (`src/**`, `frontend/src/**`)
     - Scripts (`scripts/**`)
     - Configuration (`*.json`, `*.yaml`, `*.toml`, `*.config.*`)
     - Tests (`**/*.test.*`, `**/*.spec.*`, `playwright/**`)
     - Build/deployment (`Dockerfile`, `*.sh`, `fly.toml`)
   - Identify major functional areas affected (e.g., "Release Management", "Architecture Documentation", "Timeline Estimates", "Subsystem Implementation")

3. **Analyze Change Magnitude:**

   - Run `git diff --cached --stat` to get line counts (insertions/deletions)
   - Identify files with significant changes (>100 lines added/removed)
   - Note files that are new vs. heavily modified vs. deleted

4. **Extract Key Themes:**

   - Review file names and paths to identify common themes
   - Look for patterns: new features, refactoring, documentation updates, bug fixes, configuration changes
   - Identify if changes span multiple areas (cross-cutting concerns)

5. **Generate Structured Commit Message:**
   The commit message MUST include:

   - **Summary line** (50-72 chars): High-level description of the primary change
   - **Detailed sections** organized by functional area:
     - Documentation Architecture Changes (if docs restructured)
     - New Features/Components (if new files added)
     - Architecture/Design Changes (if architecture docs modified)
     - Subsystem Updates (if subsystem docs modified)
     - Release Management (if release docs modified)
     - Specification Updates (if spec docs modified)
     - Timeline/Planning Updates (if planning docs modified)
     - Code Changes (if source code modified)
     - Configuration Changes (if config files modified)
     - Bug Fixes (if bug fixes detected)
     - Other Changes (miscellaneous)
   - **For each section**, list:
     - Files added/modified/deleted
     - Key changes or new capabilities
     - Rationale if significant architectural changes

6. **Validation:**
   - Ensure commit message covers ALL staged files (verify with `git diff --cached --name-only`)
   - If any file category is missing from the message, add it
   - If message seems incomplete, analyze diffs more deeply using `git diff --cached --stat` and `git diff --cached <file>` for key files

**COMMIT MESSAGE GENERATION PROCESS:**

1. Run `git diff --cached --name-status` to get all changes
2. Run `git diff --cached --stat` to get change statistics
3. Analyze patterns and group changes logically
4. Generate comprehensive multi-section commit message
5. Verify all files are represented in the message
6. Proceed with commit

Then proceed to git commit with the comprehensive commit message and push to origin.

**WORKTREE DETECTION:** Follow the Worktree Rule (`.cursor/rules/worktree.md`) to restrict all commit activity to the current worktree.

**COMMIT MESSAGE DISPLAY**: After successfully committing and pushing, always display the full commit message to the user by running `git log -1 --pretty=format:"%B"` and showing the output. This allows the user to review what was committed.

**WORKTREE COMPATIBILITY:** Per the Worktree Rule, commits made within this worktree remain visible to the shared `.git` directory.

After committing, verify no unstaged changes remain with `git status`. If any files were missed, amend the commit with `git add <file> && git commit --amend --no-edit`.

**POST-COMMIT VALIDATION**: After displaying the commit message, verify it comprehensively covers all changes by:

1. Running `git show --stat HEAD` to see what was committed
2. Comparing the commit message sections to the actual files changed
3. If significant changes are missing from the message, immediately amend with `git commit --amend` to add missing sections

