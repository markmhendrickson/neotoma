---
name: commit
description: Commit submodules and/or main repo with structured messages; supports /commit repo, /commit <submodule>.
triggers:
  - commit
  - commit repo
  - commit foundation
  - submodule commit
  - /commit
---

# commit

**CRITICAL REQUIREMENT:** All submodule commits MUST use the same comprehensive change analysis and detailed commit message format as the main repository. Generic commit messages like "Update submodule changes" are FORBIDDEN. Each submodule commit must analyze changes, categorize by type/area, and generate structured commit messages with detailed sections.

**PARAMETER MODES:**

1. **No parameter** (default): Commit ALL submodules first, then the main repository
2. **"repo" parameter** (e.g., `/commit repo`): Commit ONLY the main repository, skip all submodules
3. **Submodule name parameter** (e.g., `/commit foundation`): Commit ONLY that specific submodule, skip main repository

**PUSH RECONCILIATION:** Whenever a push is rejected because the remote has commits you do not have, always: (1) pull to reconcile: `git pull --rebase origin <branch>` or `git pull origin <branch> --no-rebase --no-edit`, (2) resolve any merge/rebase conflicts, (3) push again: `git push origin HEAD`. Do not report push failure without attempting reconciliation.

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

5. **Generate comprehensive commit message** - **CRITICAL: MUST follow same detailed analysis as main repo:**
   
   **MANDATORY:** Analyze changes using the same comprehensive workflow as main repository:
   
   a. **Categorize changes by type:**
      - Run `git diff --cached --name-status` to get all changed files with status (A/M/D)
      - Group files by status: Added (A), Modified (M), Deleted (D)
      - Count files in each category
   
   b. **Categorize changes by functional area:**
      - Group files by directory/domain (documentation, source code, tests, configuration, etc.)
      - Identify major functional areas affected
   
   c. **Analyze change magnitude:**
      - Run `git diff --cached --stat` to get line counts
      - Identify files with significant changes (>100 lines)
      - Note new vs. modified vs. deleted files
   
   d. **Extract key themes:**
      - Review file names and paths to identify common themes
      - Look for patterns: new features, refactoring, documentation, bug fixes, tests
      - Identify if changes span multiple areas
   
   e. **Generate structured commit message:**
      - **Summary line** (50-72 chars): High-level description of PRIMARY change
      - **Detailed sections** organized by priority:
        - **New Features** (if new functionality added)
        - **Testing Infrastructure** (if tests/coverage added)
        - **Code Improvements** (if code refactored/enhanced)
        - **Documentation** (if docs updated)
        - **Configuration** (if config files modified)
        - **Bug Fixes** (if bugs fixed)
        - **Other Changes** (miscellaneous)
      - **For each section**, list:
        - Files added/modified/deleted
        - Key changes or new capabilities
        - Rationale if significant architectural changes
   
   f. **Validation:**
      - Ensure commit message covers ALL staged files
      - If any file category missing, add it
      - Message must be as detailed as main repository commits

6. **Commit and push submodule:**
   ```bash
   echo "💾 Committing submodule..."
   git commit -m "$COMMIT_MSG"

   if git remote | grep -q .; then
     echo "📤 Pushing submodule to remote..."
     git push origin HEAD || {
       echo "📥 Push rejected: reconciling with remote..."
       BRANCH=$(git branch --show-current)
       git pull --rebase origin "$BRANCH"  # resolve conflicts if any, then:
       git push origin HEAD
     }
   fi
   ```
   **Push reconciliation:** If push is rejected (remote has commits you do not have), always: (1) pull to reconcile: `git pull --rebase origin <branch>` or `git pull origin <branch> --no-rebase --no-edit`, (2) resolve any conflicts, (3) push again. Do not report push failure without attempting reconciliation.

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
         
         # Generate comprehensive commit message - CRITICAL: MUST follow same detailed analysis as main repo
         echo "  📝 Generating commit message..."
         # MANDATORY: Follow the same comprehensive change analysis workflow as main repository:
         # 1. Categorize changes by type (A/M/D) and count files
         # 2. Categorize by functional area (docs, code, tests, config, etc.)
         # 3. Analyze change magnitude (git diff --cached --stat)
         # 4. Extract key themes (features, refactoring, tests, etc.)
         # 5. Generate structured commit message with:
         #    - Summary line (50-72 chars) describing PRIMARY change
         #    - Detailed sections (New Features, Testing, Code Improvements, Documentation, etc.)
         #    - List files and key changes for each section
         # 6. Validate message covers ALL staged files
         # Commit message MUST be as detailed as main repository commits - no generic messages allowed
         
         # Commit submodule
         echo "  💾 Committing changes..."
         git commit -m "$COMMIT_MSG" || {
           echo "  ❌ Failed to commit submodule: $submodule"
           cd "$ORIGINAL_DIR"
           exit 1
         }

         # Push submodule (if remote exists); reconcile and retry if rejected
         if git remote | grep -q .; then
           echo "  📤 Pushing to remote..."
           git push origin HEAD || {
             echo "  📥 Push rejected: reconciling with remote..."
             BRANCH=$(git branch --show-current)
             git pull --rebase origin "$BRANCH"
             git push origin HEAD || echo "  ⚠️  Warning: Failed to push submodule: $submodule"
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

Execute security audit from `foundation/agent_instructions/cursor_rules/security.md` (or `.cursor/rules/foundation_security.md` if installed) before staging ANY files:

1. **Run security audit script:**
   ```bash
   # Use foundation security audit script if available
   if [ -f "foundation/security/pre-commit-audit.sh" ]; then
     ./foundation/security/pre-commit-audit.sh
   elif [ -f ".cursor/rules/foundation_security.md" ]; then
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

           # Push nested repo (if remote exists); reconcile and retry if rejected
           if git remote | grep -q .; then
             echo "  📤 Pushing to remote..."
             git push || {
               echo "  📥 Push rejected: reconciling with remote..."
               BRANCH=$(git branch --show-current)
               git pull --rebase origin "$BRANCH"
               git push || {
                 echo "  ⚠️  Warning: Failed to push nested repository: $repo_path"
                 echo "  Continuing with main repository commit..."
               }
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

**CRITICAL: File Status Categorization (Perform First - REQUIRED):**

**MANDATORY:** Before analyzing content, categorize files by git status to ensure accurate commit message verbs:

1. **Get file status codes:**
   ```bash
   # Get staged changes with status codes (A/M/D/R/C)
   git diff --cached --name-status > /tmp/staged_status.txt

   # Get all changes (staged + unstaged) with status codes
   git diff HEAD --name-status > /tmp/all_status.txt

   # Extract files by status
   ADDED_FILES=$(grep "^A" /tmp/staged_status.txt /tmp/all_status.txt 2>/dev/null | cut -f2 | sort -u)
   MODIFIED_FILES=$(grep "^M" /tmp/staged_status.txt /tmp/all_status.txt 2>/dev/null | cut -f2 | sort -u)
   DELETED_FILES=$(grep "^D" /tmp/staged_status.txt /tmp/all_status.txt 2>/dev/null | cut -f2 | sort -u)
   RENAMED_FILES=$(grep "^R" /tmp/staged_status.txt /tmp/all_status.txt 2>/dev/null | cut -f2 | sort -u)
   ```

2. **Map status codes to commit message verbs:**
   - **Added (A)**: New files → use "Add", "Implement", "Create", "Introduce"
   - **Modified (M)**: Existing files → use "Refactor", "Modify", "Update", "Improve", "Enhance"
   - **Deleted (D)**: Removed files → use "Remove", "Delete", "Drop"
   - **Renamed (R)**: Moved files → use "Move", "Rename", "Reorganize"

3. **CRITICAL VALIDATION RULES:**
   - **NEVER say "Add X" for files with status M (Modified)**
   - **NEVER say "Refactor X" for files with status A (Added)**
   - **NEVER say "Remove X" for files with status M (Modified)**
   - **Match commit message verbs to actual git status codes**

4. **Verify feature claims against file status:**
   ```bash
   # Example: If analyzing WhatsApp MCP server changes
   WHATSAPP_FILES=$(echo "$ADDED_FILES $MODIFIED_FILES" | grep -i whatsapp || true)
   if [ -n "$WHATSAPP_FILES" ]; then
     # Check status of WhatsApp files
     WHATSAPP_STATUS=$(git diff --cached --name-status | grep -i whatsapp | cut -f1 | head -1)
     if [ "$WHATSAPP_STATUS" = "M" ]; then
       # Files are modified → use "Refactor" or "Modify", NOT "Add"
       FEATURE_VERB="Refactor"
     elif [ "$WHATSAPP_STATUS" = "A" ]; then
       # Files are added → use "Add" or "Implement"
       FEATURE_VERB="Add"
     fi
   fi
   ```

**CRITICAL: Release-Aware Analysis (Perform After Status Categorization):**

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

**Standard Change Analysis (After Release Context and Status Categorization):**

1. **Categorize Changes by Type (Using Status Codes):**
   - Use the status codes already extracted in "File Status Categorization" step
   - Group files by status: Added (A), Modified (M), Deleted (D), Renamed (R)
   - Count files in each category
   - **Reference the ADDED_FILES, MODIFIED_FILES, DELETED_FILES variables from status categorization**

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

   **CRITICAL: Use correct verbs based on file status:**
   - For files with status **A (Added)**: Use "Add", "Implement", "Create", "Introduce"
   - For files with status **M (Modified)**: Use "Refactor", "Modify", "Update", "Improve", "Enhance"
   - For files with status **D (Deleted)**: Use "Remove", "Delete", "Drop"
   - For files with status **R (Renamed)**: Use "Move", "Rename", "Reorganize"

   **Default structure** (if no custom format configured):
   - **Summary line** (50-72 chars): High-level description of the PRIMARY change
     - **If release execution detected**: "Execute v{version}: {Release Name}"
     - **If release status changed to ready_for_deployment**: Lead with release execution
     - **Otherwise**: Describe the most impactful change (implementation > documentation)
     - **MUST use correct verb based on file status** (see above)
   - **Detailed sections** organized by priority:
     - **Release Execution** (if release status changed or release work detected):
       - Release version and name
       - Feature units completed
       - Migrations added
       - Services/tools implemented
       - Test results
       - Status: ready_for_deployment, deployed, etc.
     - **Database Schema Changes** (if migrations present):
       - Migration files added/modified (use correct verb based on status)
       - Schema changes (tables, columns, RLS policies)
       - Impact on existing data
     - **Implementation Changes** (if source code modified):
       - Services created/modified (use correct verb: "Add" for A, "Refactor" for M)
       - MCP tools added/modified (use correct verb based on status)
       - API changes
       - Core functionality changes
     - **Documentation Changes** (secondary):
       - Release documentation added/updated (use correct verb based on status)
       - Guides updated
       - API documentation
     - **Configuration Changes** (if config files modified)
     - **Bug Fixes** (if bug fixes detected)
     - **Other Changes** (miscellaneous)
   - **For each section**, list:
     - Files added/modified/deleted (with correct status indicators)
     - Key changes or new capabilities
     - Rationale if significant architectural changes

6. **Validation (REQUIRED):**
   - **File Status Validation**: Verify commit message verbs match actual git status codes
     ```bash
     # Validate message accuracy
     if echo "$COMMIT_MSG" | grep -qi "add.*server\|new.*server\|implement.*server"; then
       # Check if files are actually added (status A)
       if ! echo "$ADDED_FILES" | grep -qi "server"; then
         echo "⚠️  WARNING: Commit message claims 'add server' but files show status M (modified)"
         echo "   Correct to: 'Refactor server' or 'Modify server'"
         # If validation_strictness is "error", abort here
       fi
     fi
     ```
   - Ensure commit message covers ALL staged files (verify with `git diff --cached --name-only`)
   - If any file category is missing from the message, add it
   - If message seems incomplete, analyze diffs more deeply using `git diff --cached --stat` and `git diff --cached <file>` for key files
   - **Cross-check**: For each feature/component mentioned, verify the verb matches the file status

**COMMIT MESSAGE GENERATION PROCESS:**

1. **Categorize files by git status FIRST (REQUIRED):**
   ```bash
   # Get file status codes (A/M/D/R)
   git diff --cached --name-status > /tmp/staged_status.txt
   git diff HEAD --name-status > /tmp/all_status.txt

   # Extract files by status
   ADDED_FILES=$(grep "^A" /tmp/staged_status.txt /tmp/all_status.txt 2>/dev/null | cut -f2 | sort -u)
   MODIFIED_FILES=$(grep "^M" /tmp/staged_status.txt /tmp/all_status.txt 2>/dev/null | cut -f2 | sort -u)
   DELETED_FILES=$(grep "^D" /tmp/staged_status.txt /tmp/all_status.txt 2>/dev/null | cut -f2 | sort -u)
   ```
   - **This step is MANDATORY** - commit message verbs must match file status

2. **Check for release status changes:**
   ```bash
   git diff --cached --name-only | grep -E "docs/releases/.*/status\.md"
   ```
   - If found, read the status file(s) to understand what release is being executed
   - This determines the PRIMARY focus of the commit

3. **Analyze migrations and schema changes:**
   ```bash
   git diff --cached --name-status | grep -E "migrations|schema\.sql"
   ```
   - Check status of migration files (A = new migration, M = modified migration)
   - Migrations indicate release execution or major schema work
   - Read migration files to understand what's being built

4. Run `git diff --cached --stat` to get change statistics
5. **Determine primary vs secondary work:**
   - Primary: Release execution, major features, schema changes, core services
   - Secondary: Documentation, configuration updates, minor fixes
6. **Generate commit message with proper prioritization:**
   - Lead with the most impactful work (release execution > implementation > documentation)
   - Group related changes together
   - Ensure release work is prominently featured if present
   - **Use correct verbs based on file status** (Add for A, Refactor/Modify for M, Remove for D)
7. **Validate message accuracy:**
   - Cross-check each feature/component claim against actual file status
   - Verify verbs match status codes (never say "Add" for status M files)
8. Verify all files are represented in the message
9. Proceed with commit

**FINAL PRE-COMMIT SECURITY CHECK**: Immediately before executing `git commit`, run one final security audit:

```bash
# Final check on staged files for private/sensitive files
# Use foundation security audit script or rules
if [ -f "foundation/security/pre-commit-audit.sh" ]; then
  ./foundation/security/pre-commit-audit.sh
elif [ -f ".cursor/rules/foundation_security.md" ]; then
  # Follow security rule checks
fi

# Final check for nested repository files (if nested repo handling enabled)
# (Same check as above if nested repos are configured)
```

If final security check passes, proceed to git commit with the comprehensive commit message and push to origin. **If push is rejected** (remote has new commits): run `git pull --rebase origin <current_branch>` (or `git pull origin <current_branch> --no-rebase --no-edit`), resolve any conflicts, then `git push origin HEAD` again. Always reconcile and retry before reporting push failure.

**WORKTREE DETECTION:** Follow the Worktree Rule (`.cursor/rules/foundation_worktree_env.md` or `foundation/agent_instructions/cursor_rules/worktree_env.md`) to restrict all commit activity to the current worktree.

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
    validate_message_accuracy: true  # Validate commit message verbs match git status codes
    require_status_verification: true  # Require explicit status check before making claims
    validation_strictness: "warn"  # "warn" (show warning) or "error" (block commit if invalid)
  commit_format:
    require_id: false
    pattern: "{description}"  # or "{id}: {description}"
```

## Summary of Commit Modes

1. **`/commit`** - Default: Commits all submodules first, then main repository
2. **`/commit repo`** - Commits only main repository, skips all submodules
3. **`/commit <submodule-name>`** - Commits only the specified submodule, skips main repository

All modes follow the same security audit, change analysis, and commit message generation workflows appropriate to their scope.

**MANDATORY:** Submodule commits MUST use the same comprehensive analysis and detailed commit message format as main repository commits. Generic messages like "Update submodule changes" are FORBIDDEN.


