---
name: commit
description: commit
---

<!-- Source: foundation/agent_instructions/cursor_commands/commit.md -->

# commit

**PARAMETER MODES:**

1. **No parameter** (default): Commit ALL submodules first, then the main repository
2. **"repo" parameter** (e.g., `/commit repo`): Commit ONLY the main repository, skip all submodules
3. **Submodule name parameter** (e.g., `/commit foundation`): Commit ONLY that specific submodule, skip main repository

---

## Parameter Detection and Routing

**STEP 1: Detect parameter and route to appropriate workflow:**

```bash
# Check if parameter provided
if [ -n "$1" ]; then
  PARAM="$1"
  
  # Case 1: "repo" parameter - commit main repository only
  if [ "$PARAM" = "repo" ]; then
    echo "📦 REPO-ONLY MODE: Committing main repository only (skipping submodules)"
    # Proceed to main repository commit workflow (skip to line after submodule processing)
  
  # Case 2: Submodule name parameter - commit that submodule only
  else
    echo "📦 SUBMODULE MODE: Checking for submodule '$PARAM'"
    # Verify submodule exists
    if ! git submodule status "$PARAM" >/dev/null 2>&1; then
      echo "❌ Submodule not found: $PARAM"
      exit 1
    fi
    # Proceed to single submodule commit workflow (see "Single Submodule Commit" section)
  fi
else
  # Case 3: No parameter - commit all submodules then main repository
  echo "📦 ALL MODE: Committing all submodules and main repository"
  # Proceed to all submodules commit workflow (see "All Submodules Commit" section)
fi
```

---

## Single Submodule Commit Workflow

**When a specific submodule name is provided** (e.g., `/commit foundation`):

1. **Change to submodule directory:**
   ```bash
   cd "$PARAM" || {
     echo "❌ Failed to change to submodule directory: $PARAM"
     exit 1
   }
   ```

2. **Run security audit in submodule:**
   ```bash
   echo "🔒 Running security audit in submodule..."
   if [ -f "foundation/security/pre-commit-audit.sh" ]; then
     ./foundation/security/pre-commit-audit.sh
   elif [ -f "../foundation/security/pre-commit-audit.sh" ]; then
     ../foundation/security/pre-commit-audit.sh
   fi
   ```

3. **Check if there are changes:**
   ```bash
   if ! git status --porcelain | grep -q .; then
     echo "✓ No changes in submodule $PARAM"
     exit 0
   fi
   ```

4. **Stage all changes in submodule:**
   ```bash
   echo "📝 Staging changes in submodule..."
   git add -A
   ```

5. **Generate commit message** (analyze changes in submodule context - follow same comprehensive analysis as main repo)

6. **Commit and push submodule:**
   ```bash
   echo "💾 Committing submodule..."
   git commit -m "$COMMIT_MSG"
   
   if git remote | grep -q .; then
     echo "📤 Pushing submodule to remote..."
     git push origin HEAD
   fi
   ```

7. **Display commit message:**
   ```bash
   git log -1 --pretty=format:"%B"
   ```

8. **EXIT** - Do NOT proceed with main repository commit

---

## All Submodules Commit Workflow

**When no parameter is provided** - commit all submodules first, then main repository:

1. **Initialize and update submodules:**
   ```bash
   echo "📦 Initializing submodules..."
   git submodule update --init --recursive
   ```

2. **Get list of all submodules:**
   ```bash
   SUBMODULES=$(git config --file .gitmodules --get-regexp path | awk '{ print $2 }')
   
   if [ -z "$SUBMODULES" ]; then
     echo "ℹ️  No submodules found"
   else
     echo "📦 Found submodules:"
     echo "$SUBMODULES" | while IFS= read -r submodule; do
       echo "  - $submodule"
     done
   fi
   ```

3. **For each submodule, commit changes:**
   ```bash
   echo "$SUBMODULES" | while IFS= read -r submodule; do
     if [ -n "$submodule" ] && [ -d "$submodule/.git" ]; then
       echo ""
       echo "🔄 Processing submodule: $submodule"
       
       # Save current directory
       ORIGINAL_DIR=$(pwd)
       
       # Change to submodule directory
       cd "$submodule" || {
         echo "  ❌ Failed to change to directory: $submodule"
         exit 1
       }
       
       # Check if there are changes
       if git status --porcelain | grep -q .; then
         echo "  📝 Found changes, committing..."
         
         # Run security audit
         echo "  🔒 Running security audit..."
         if [ -f "foundation/security/pre-commit-audit.sh" ]; then
           ./foundation/security/pre-commit-audit.sh
         elif [ -f "../foundation/security/pre-commit-audit.sh" ]; then
           ../foundation/security/pre-commit-audit.sh
         fi
         
         # Stage all changes
         echo "  📝 Staging changes..."
         git add -A
         
         # Generate commit message (analyze changes in submodule context)
         echo "  📝 Generating commit message..."
         # (Follow comprehensive change analysis workflow)
         
         # Commit submodule
         echo "  💾 Committing changes..."
         git commit -m "$COMMIT_MSG" || {
           echo "  ❌ Failed to commit submodule: $submodule"
           cd "$ORIGINAL_DIR"
           exit 1
         }
         
         # Push submodule (if remote exists)
         if git remote | grep -q .; then
           echo "  📤 Pushing to remote..."
           git push origin HEAD || {
             echo "  ⚠️  Warning: Failed to push submodule: $submodule"
           }
         fi
         
         echo "  ✓ Successfully committed submodule: $submodule"
       else
         echo "  ✓ No changes in $submodule"
       fi
       
       # Return to original directory
       cd "$ORIGINAL_DIR" || exit 1
     fi
   done
   ```

4. **Update submodule references in main repository:**
   ```bash
   echo ""
   echo "📝 Updating submodule references in main repository..."
   git add .gitmodules
   echo "$SUBMODULES" | while IFS= read -r submodule; do
     if [ -n "$submodule" ]; then
       git add "$submodule" 2>/dev/null || true
     fi
   done
   ```

5. **After all submodules committed, proceed to main repository commit workflow below**

---

## Main Repository Commit Workflow

**Run when:**
- No parameter provided (after committing all submodules)
- "repo" parameter provided (skip submodules)

**Ensure in root directory:**
```bash
cd "$(git rev-parse --show-toplevel)"
```

Run entire test suite and resolve any errors as necessary. Proceed to analyze all uncommitted files for security vulnerabilities and patch as necessary.

**CRITICAL: PRE-COMMIT SECURITY AUDIT** - MUST RUN BEFORE STAGING:

Execute security audit from `foundation/agent_instructions/cursor_rules/security.md` (or `.claude/rules/foundation_security.md` if installed) before staging ANY files:

1. **Run security audit script:**
   ```bash
   # Use foundation security audit script if available
   if [ -f "foundation/security/pre-commit-audit.sh" ]; then
     ./foundation/security/pre-commit-audit.sh
   elif [ -f ".claude/rules/foundation_security.md" ]; then
     # Follow security rule checks
     # (Implementation depends on how security rules are executed)
   fi
   ```

2. **If any check fails, ABORT immediately and alert the user. DO NOT proceed with staging or commit.**

After security audit passes, proceed with:

**NESTED GIT REPOSITORY DETECTION AND COMMIT** (Optional, configurable):

**Configuration:** Enable/disable nested repo handling in `foundation-config.yaml`:
```yaml
development:
  commit:
    handle_nested_repos: false  # Set to true to enable nested repo handling
```

**If enabled**, before committing the main repository, detect and commit any nested git repositories:

Nested repositories must be committed BEFORE the main repository to maintain consistency.

1. **Detect nested git repositories:**
   ```bash
   # Find all nested .git directories (excluding the root .git and submodules)
   # Store in a temporary file to avoid subshell issues
   NESTED_REPOS_FILE=$(mktemp)
   find . -name ".git" -type d -not -path "./.git" -not -path "./.git/*" 2>/dev/null | sed 's|/.git$||' | sort > "$NESTED_REPOS_FILE"

   if [ -s "$NESTED_REPOS_FILE" ]; then
     echo "📦 Found nested git repositories:"
     while IFS= read -r repo_path; do
       echo "  - $repo_path"
     done < "$NESTED_REPOS_FILE"
     echo ""
   fi
   ```

2. **For each nested repository, commit changes:**
   ```bash
   # Process each nested repo
   if [ -s "$NESTED_REPOS_FILE" ]; then
     while IFS= read -r repo_path; do
       if [ -n "$repo_path" ] && [ -d "$repo_path/.git" ]; then
         echo "🔄 Processing nested repository: $repo_path"

         # Save current directory
         ORIGINAL_DIR=$(pwd)

         # Change to nested repo directory
         cd "$repo_path" || {
           echo "  ❌ Failed to change to directory: $repo_path"
           rm -f "$NESTED_REPOS_FILE"
           exit 1
         }

         # Check if there are any changes
         if git status --porcelain | grep -q .; then
           echo "  📝 Found changes, committing..."

           # Run security audit for nested repo (same checks as main repo)
           echo "  🔒 Running security audit..."
           # (Run same security audit as main repo)

           # Stage all changes
           echo "  📝 Staging changes..."
           git add -A

           # Generate commit message for nested repo
           echo "  📝 Generating commit message..."
           # (Use configured commit message format)

           # Commit nested repo
           echo "  💾 Committing changes..."
           git commit -m "$COMMIT_MSG" || {
             echo "  ❌ Failed to commit nested repository: $repo_path"
             cd "$ORIGINAL_DIR"
             rm -f "$NESTED_REPOS_FILE"
             exit 1
           }

           # Push nested repo (if remote exists and configured)
           if git remote | grep -q .; then
             echo "  📤 Pushing to remote..."
             git push || {
               echo "  ⚠️  Warning: Failed to push nested repository: $repo_path"
               echo "  Continuing with main repository commit..."
             }
           else
             echo "  ℹ️  No remote configured, skipping push"
           fi

           echo "  ✓ Successfully committed nested repository: $repo_path"
         else
           echo "  ✓ No changes in $repo_path"
         fi

         # Return to original directory
         cd "$ORIGINAL_DIR" || {
           rm -f "$NESTED_REPOS_FILE"
           exit 1
         }
         echo ""
       fi
     done < "$NESTED_REPOS_FILE"

     # Clean up temp file
     rm -f "$NESTED_REPOS_FILE"
   fi
   ```

3. **If any nested repo commit fails, ABORT the entire commit process and return to root directory.**

4. **After all nested repos are successfully committed, proceed with main repository commit.**

**UI TESTING** (Optional, configurable):

**Configuration:** Enable/disable UI testing in `foundation-config.yaml`:
```yaml
development:
  commit:
    ui_testing:
      enabled: false
      frontend_paths: ["frontend/src/**"]  # Paths to check for frontend changes
```

**If enabled**, if any frontend files were modified, automatically verify user-facing changes work correctly in the browser before committing. After completing the browser run, rerun the security audit in case new assets or logs were created.

Before committing, ensure all changes are staged:

**CRITICAL: Exclude nested repositories from main repo staging** (if nested repo handling enabled):

1. **Detect nested repos and build exclusion patterns:**
   ```bash
   # Detect nested repos first (before staging main repo)
   NESTED_REPOS_STAGING_FILE=$(mktemp)
   find . -name ".git" -type d -not -path "./.git" -not -path "./.git/*" 2>/dev/null | sed 's|/.git$||' | sort > "$NESTED_REPOS_STAGING_FILE"

   # Build exclusion patterns for git add
   EXCLUDE_PATTERNS=""
   if [ -s "$NESTED_REPOS_STAGING_FILE" ]; then
     echo "📦 Excluding nested repositories from main repo staging:"
     while IFS= read -r repo_path; do
       if [ -n "$repo_path" ]; then
         echo "  - Excluding $repo_path"
         # Escape special characters and add to exclusion
         ESCAPED_PATH=$(echo "$repo_path" | sed 's/[[\.*^$()+?{|]/\\&/g')
         if [ -z "$EXCLUDE_PATTERNS" ]; then
           EXCLUDE_PATTERNS=":!/$ESCAPED_PATH"
         else
           EXCLUDE_PATTERNS="$EXCLUDE_PATTERNS :!/$ESCAPED_PATH"
         fi
       fi
     done < "$NESTED_REPOS_STAGING_FILE"
   fi
   ```

2. **Stage changes while excluding nested repositories:**
   ```bash
   # Stage all changes except nested repos
   if [ -n "$EXCLUDE_PATTERNS" ]; then
     git add -A $EXCLUDE_PATTERNS
   else
     git add -A
   fi
   ```

3. **Re-run security audit on staged files** to ensure nothing private or from nested repos was accidentally staged.

4. Verify staged changes with `git status` to ensure nothing is missed
5. If any files were modified after the initial `git add`, run `git add -A` again with exclusions right before committing, then re-run the security audit

**BRANCH RENAMING** (Optional, configurable):

**Configuration:** Enable/disable branch renaming in `foundation-config.yaml`:
```yaml
development:
  commit:
    branch_renaming:
      enabled: false
      patterns: ["chat-*"]  # Patterns to rename
```

**If enabled**, automatically rename branches matching configured patterns before committing.

**COMPREHENSIVE CHANGE ANALYSIS**: Before generating the commit message, perform comprehensive analysis of all staged changes:

**CRITICAL: Release-Aware Analysis (Perform First):**

1. **Check for Release Status Changes:**
   ```bash
   # Check if any release status files were modified
   git diff --cached --name-only | grep -E "docs/releases/.*/status\.md"
   ```
   - If release status files changed, read them to understand what release is being executed
   - Check for status transitions (e.g., `planning` → `ready_for_deployment`, `in_progress` → `deployed`)
   - **Release execution is ALWAYS the primary work** - documentation is secondary

2. **Analyze Release Context:**
   - Read the release status file to understand:
     - What feature units were completed
     - What migrations were added
     - What services/tools were implemented
     - Test results and acceptance criteria
   - **If a release is being executed, the commit message MUST lead with the release execution**
   - Example: "Execute v0.2.0: [Release Name]" not "Add documentation and update code"

3. **Understand Implementation vs Documentation:**
   - Database migrations + source code changes + release status update = **Release execution**
   - Documentation-only changes = **Documentation work**
   - If both exist, **implementation is primary, documentation is supporting context**

**Standard Change Analysis (After Release Context):**

1. **Categorize Changes by Type:**
   - Run `git diff --cached --name-status` to get all changed files with their status (A/M/D)
   - Group files by status: Added (A), Modified (M), Deleted (D)
   - Count files in each category

2. **Categorize Changes by Functional Area:**
   - Group files by directory/domain (customize per repository):
     - Documentation (`docs/**`) - further categorize by subdirectory
     - Source code (`src/**`, `frontend/src/**`, or configured paths)
     - Scripts (`scripts/**`)
     - Configuration (`*.json`, `*.yaml`, `*.toml`, `*.config.*`)
     - Tests (`**/*.test.*`, `**/*.spec.*`, or configured test paths)
     - Build/deployment (`Dockerfile`, `*.sh`, or configured paths)
     - **Database migrations** (`supabase/migrations/**`, `**/migrations/*.sql`) - these indicate release execution
   - Identify major functional areas affected

3. **Analyze Change Magnitude:**
   - Run `git diff --cached --stat` to get line counts (insertions/deletions)
   - Identify files with significant changes (>100 lines added/removed, configurable)
   - Note files that are new vs. heavily modified vs. deleted
   - **Pay attention to migration files** - they indicate schema changes and release work

4. **Extract Key Themes:**
   - Review file names and paths to identify common themes
   - Look for patterns: new features, refactoring, documentation updates, bug fixes, configuration changes
   - **Look for release execution patterns:**
     - Migrations + services + MCP tools + status update = Release execution
     - Multiple migrations = Major schema change (likely release work)
     - New services + updated actions = Feature implementation
   - Identify if changes span multiple areas (cross-cutting concerns)

5. **Generate Structured Commit Message:**
   The commit message MUST follow the configured format from `foundation-config.yaml`:
   ```yaml
   development:
     commit_format:
       require_id: true  # whether ID is required in commit messages
       pattern: "{id}: {description}"  # or custom pattern
   ```

   **Default structure** (if no custom format configured):
   - **Summary line** (50-72 chars): High-level description of the PRIMARY change
     - **If release execution detected**: "Execute v{version}: {Release Name}"
     - **If release status changed to ready_for_deployment**: Lead with release execution
     - **Otherwise**: Describe the most impactful change (implementation > documentation)
   - **Detailed sections** organized by priority:
     - **Release Execution** (if release status changed or release work detected):
       - Release version and name
       - Feature units completed
       - Migrations added
       - Services/tools implemented
       - Test results
       - Status: ready_for_deployment, deployed, etc.
     - **Database Schema Changes** (if migrations present):
       - Migration files added
       - Schema changes (tables, columns, RLS policies)
       - Impact on existing data
     - **Implementation Changes** (if source code modified):
       - Services created/modified
       - MCP tools added
       - API changes
       - Core functionality changes
     - **Documentation Changes** (secondary):
       - Release documentation added
       - Guides updated
       - API documentation
     - **Configuration Changes** (if config files modified)
     - **Bug Fixes** (if bug fixes detected)
     - **Other Changes** (miscellaneous)
   - **For each section**, list:
     - Files added/modified/deleted
     - Key changes or new capabilities
     - Rationale if significant architectural changes

6. **Validation:**
   - Ensure commit message covers ALL staged files (verify with `git diff --cached --name-only`)
   - If any file category is missing from the message, add it
   - If message seems incomplete, analyze diffs more deeply using `git diff --cached --stat` and `git diff --cached <file>` for key files

**COMMIT MESSAGE GENERATION PROCESS:**

1. **Check for release status changes FIRST:**
   ```bash
   git diff --cached --name-only | grep -E "docs/releases/.*/status\.md"
   ```
   - If found, read the status file(s) to understand what release is being executed
   - This determines the PRIMARY focus of the commit

2. **Analyze migrations and schema changes:**
   ```bash
   git diff --cached --name-only | grep -E "migrations|schema\.sql"
   ```
   - Migrations indicate release execution or major schema work
   - Read migration files to understand what's being built

3. Run `git diff --cached --name-status` to get all changes
4. Run `git diff --cached --stat` to get change statistics
5. **Determine primary vs secondary work:**
   - Primary: Release execution, major features, schema changes, core services
   - Secondary: Documentation, configuration updates, minor fixes
6. **Generate commit message with proper prioritization:**
   - Lead with the most impactful work (release execution > implementation > documentation)
   - Group related changes together
   - Ensure release work is prominently featured if present
7. Verify all files are represented in the message
8. Proceed with commit

**FINAL PRE-COMMIT SECURITY CHECK**: Immediately before executing `git commit`, run one final security audit:

```bash
# Final check on staged files for private/sensitive files
# Use foundation security audit script or rules
if [ -f "foundation/security/pre-commit-audit.sh" ]; then
  ./foundation/security/pre-commit-audit.sh
elif [ -f ".claude/rules/foundation_security.md" ]; then
  # Follow security rule checks
fi

# Final check for nested repository files (if nested repo handling enabled)
# (Same check as above if nested repos are configured)
```

If final security check passes, proceed to git commit with the comprehensive commit message and push to origin.

**WORKTREE DETECTION:** Follow the Worktree Rule (`.claude/rules/foundation_worktree_env.md` or `foundation/agent_instructions/cursor_rules/worktree_env.md`) to restrict all commit activity to the current worktree.

**COMMIT MESSAGE DISPLAY**: After successfully committing and pushing, always display the full commit message to the user by running `git log -1 --pretty=format:"%B"` and showing the output. This allows the user to review what was committed.

**WORKTREE COMPATIBILITY:** Per the Worktree Rule, commits made within this worktree remain visible to the shared `.git` directory.

After committing the main repository, verify no unstaged changes remain with `git status`. If any files were missed, amend the commit with `git add <file> && git commit --amend --no-edit`.

**NESTED REPOSITORY SUMMARY** (if nested repo handling enabled): After committing the main repository, display a summary of nested repository commits.

**SUBMODULE SUMMARY** (if submodules were committed in all-mode): After committing the main repository, display a summary of submodule commits made during this commit session.

**POST-COMMIT VALIDATION**: After displaying the commit message, verify it comprehensively covers all changes by:

1. Running `git show --stat HEAD` to see what was committed
2. Comparing the commit message sections to the actual files changed
3. If significant changes are missing from the message, immediately amend with `git commit --amend` to add missing sections

## Configuration

Configure commit behavior in `foundation-config.yaml`:

```yaml
development:
  commit:
    handle_nested_repos: false  # Enable nested repository handling
    ui_testing:
      enabled: false
      frontend_paths: []
    branch_renaming:
      enabled: false
      patterns: []
  commit_format:
    require_id: false
    pattern: "{description}"  # or "{id}: {description}"
```

## Summary of Commit Modes

1. **`/commit`** - Default: Commits all submodules first, then main repository
2. **`/commit repo`** - Commits only main repository, skips all submodules
3. **`/commit <submodule-name>`** - Commits only the specified submodule, skips main repository

All modes follow the same security audit, change analysis, and commit message generation workflows appropriate to their scope.


