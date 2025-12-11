# commit

Run entire tests suite and resolve any errors as necessary. Proceed to analyze all uncommitted files for security vulnerabilities and patch as necessary.

**CRITICAL: PRE-COMMIT SECURITY AUDIT** - MUST RUN BEFORE STAGING:

Before staging ANY files, execute the security audit from `.cursor/rules/security.md`:

1. **Check for private documentation:**

   ```bash
   # Check unstaged changes
   if git status --porcelain | grep -E "^[AM]|^\?\?" | grep -qE "docs/private/"; then
     echo "❌ SECURITY VIOLATION: Files in docs/private/ detected!"
     git status --porcelain | grep -E "^[AM]|^\?\?" | grep "docs/private/"
     exit 1
   fi

   # Check already staged changes
   if git diff --cached --name-only 2>/dev/null | grep -qE "docs/private/"; then
     echo "❌ SECURITY VIOLATION: Files in docs/private/ already staged!"
     git diff --cached --name-only | grep "docs/private/"
     exit 1
   fi
   ```

2. **Check for environment files:**

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

3. **Check for data directory files:**

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

4. **If any check fails, ABORT immediately and alert the user. DO NOT proceed with staging or commit.**

**ONLY AFTER security audit passes**, proceed with:

**NESTED GIT REPOSITORY DETECTION AND COMMIT**: Before committing the main repository, detect and commit any nested git repositories:

**CRITICAL**: Nested repositories must be committed BEFORE the main repository to maintain consistency.

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

           # Check for private docs, .env files, data directory
           if git status --porcelain | grep -E "^[AM]|^\?\?" | grep -qE "docs/private/|\.env|^data/"; then
             echo "  ❌ SECURITY VIOLATION in nested repo $repo_path!"
             git status --porcelain | grep -E "^[AM]|^\?\?" | grep -E "docs/private/|\.env|^data/"
             cd "$ORIGINAL_DIR"
             rm -f "$NESTED_REPOS_FILE"
             exit 1
           fi

           # Stage all changes
           echo "  📝 Staging changes..."
           git add -A

           # Re-check staged files
           if git diff --cached --name-only 2>/dev/null | grep -qE "docs/private/|\.env|^data/"; then
             echo "  ❌ SECURITY VIOLATION: Private files staged in nested repo!"
             git diff --cached --name-only | grep -E "docs/private/|\.env|^data/"
             git reset HEAD
             cd "$ORIGINAL_DIR"
             rm -f "$NESTED_REPOS_FILE"
             exit 1
           fi

           # Generate commit message for nested repo
           echo "  📝 Generating commit message..."
           CHANGED_FILES=$(git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')
           if [ "$CHANGED_FILES" -gt 0 ]; then
             # Create descriptive commit message
             COMMIT_MSG="Update nested repository: $repo_path"

             # Add file summary
             FILE_LIST=$(git diff --cached --name-only | head -10 | sed 's/^/  - /')
             if [ -n "$FILE_LIST" ]; then
               COMMIT_MSG="$COMMIT_MSG
   ```

Files changed:
$FILE_LIST"
               if [ "$CHANGED_FILES" -gt 10 ]; then
COMMIT_MSG="$COMMIT_MSG
... and $((CHANGED_FILES - 10)) more files"
fi
fi

             # Add stats summary
             STATS=$(git diff --cached --stat | tail -1)
             if [ -n "$STATS" ]; then
               COMMIT_MSG="$COMMIT_MSG

$STATS"
fi

             # Commit nested repo
             echo "  💾 Committing changes..."
             git commit -m "$COMMIT_MSG" || {
               echo "  ❌ Failed to commit nested repository: $repo_path"
               cd "$ORIGINAL_DIR"
               rm -f "$NESTED_REPOS_FILE"
               exit 1
             }

             # Push nested repo (if remote exists)
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
           fi
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

````

3. **If any nested repo commit fails, ABORT the entire commit process and return to root directory.**

4. **After all nested repos are successfully committed, proceed with main repository commit.**

**UI TESTING**: If any frontend files were modified (`frontend/src/**`), automatically follow the Testing Rule (`.cursor/rules/testing.md`) to verify user-facing changes work correctly in the browser before committing. After completing the browser run, rerun the sensitive data audit in case new assets or logs were created.

**IMPORTANT**: Before committing, ensure all changes are staged:

**CRITICAL: Exclude nested repositories from main repo staging:**

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

3. **Re-run security audit on staged files** to ensure nothing private or from nested repos was accidentally staged:
   ```bash
   # Check for private files
   if git diff --cached --name-only | grep -qE "docs/private/|\.env|^data/"; then
     echo "❌ SECURITY VIOLATION: Private files detected in staged changes!"
     git diff --cached --name-only | grep -E "docs/private/|\.env|^data/"
     git reset HEAD
     rm -f "$NESTED_REPOS_STAGING_FILE"
     exit 1
   fi

   # Check for nested repo files (should never be staged in main repo)
   if [ -s "$NESTED_REPOS_STAGING_FILE" ]; then
     while IFS= read -r repo_path; do
       if git diff --cached --name-only | grep -q "^$repo_path/"; then
         echo "❌ CRITICAL: Nested repository files detected in main repo staging!"
         echo "Nested repo: $repo_path"
         echo "Files:"
         git diff --cached --name-only | grep "^$repo_path/"
         echo ""
         echo "Nested repositories must be committed separately. Unstaging these files."
         git reset HEAD $(git diff --cached --name-only | grep "^$repo_path/")
         rm -f "$NESTED_REPOS_STAGING_FILE"
         exit 1
       fi
     done < "$NESTED_REPOS_STAGING_FILE"
   fi

   # Clean up temp file
   rm -f "$NESTED_REPOS_STAGING_FILE"
   ```

4. Verify staged changes with `git status` to ensure nothing is missed
5. If any files were modified after the initial `git add`, run `git add -A` again with exclusions right before committing, then re-run the security audit

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

**FINAL PRE-COMMIT SECURITY CHECK**: Immediately before executing `git commit`, run one final security audit:

```bash
# Final check on staged files for private/sensitive files
if git diff --cached --name-only | grep -qE "docs/private/|\.env|^data/"; then
  echo "❌ CRITICAL: Private/sensitive files detected in staged commit!"
  echo "Staged files:"
  git diff --cached --name-only | grep -E "docs/private/|\.env|^data/"
  echo "Unstaging all files. Review and fix before committing."
  git reset HEAD
  exit 1
fi

# Final check for nested repository files (should never be in main repo commit)
NESTED_REPOS_FINAL_FILE=$(mktemp)
find . -name ".git" -type d -not -path "./.git" -not -path "./.git/*" 2>/dev/null | sed 's|/.git$||' | sort > "$NESTED_REPOS_FINAL_FILE"

if [ -s "$NESTED_REPOS_FINAL_FILE" ]; then
  while IFS= read -r repo_path; do
    if git diff --cached --name-only | grep -q "^$repo_path/"; then
      echo "❌ CRITICAL: Nested repository files detected in main repo commit!"
      echo "Nested repo: $repo_path"
      echo "Files staged in main repo:"
      git diff --cached --name-only | grep "^$repo_path/"
      echo ""
      echo "Nested repositories must be committed separately. Aborting main repo commit."
      git reset HEAD $(git diff --cached --name-only | grep "^$repo_path/")
      rm -f "$NESTED_REPOS_FINAL_FILE"
      exit 1
    fi
  done < "$NESTED_REPOS_FINAL_FILE"
fi
rm -f "$NESTED_REPOS_FINAL_FILE"
```

**ONLY IF final security check passes**, proceed to git commit with the comprehensive commit message and push to origin.

**WORKTREE DETECTION:** Follow the Worktree Rule (`.cursor/rules/worktree.md`) to restrict all commit activity to the current worktree.

**COMMIT MESSAGE DISPLAY**: After successfully committing and pushing, always display the full commit message to the user by running `git log -1 --pretty=format:"%B"` and showing the output. This allows the user to review what was committed.

**WORKTREE COMPATIBILITY:** Per the Worktree Rule, commits made within this worktree remain visible to the shared `.git` directory.

After committing the main repository, verify no unstaged changes remain with `git status`. If any files were missed, amend the commit with `git add <file> && git commit --amend --no-edit`.

**NESTED REPOSITORY SUMMARY**: After committing the main repository, display a summary of nested repository commits:

```bash
# Display summary of nested repo commits (re-detect if needed)
NESTED_REPOS_SUMMARY_FILE=$(mktemp)
find . -name ".git" -type d -not -path "./.git" -not -path "./.git/*" 2>/dev/null | sed 's|/.git$||' | sort > "$NESTED_REPOS_SUMMARY_FILE"

if [ -s "$NESTED_REPOS_SUMMARY_FILE" ]; then
  echo ""
  echo "📦 Nested Repository Commit Summary:"
  ORIGINAL_DIR=$(pwd)
  while IFS= read -r repo_path; do
    if [ -n "$repo_path" ] && [ -d "$repo_path/.git" ]; then
      cd "$repo_path" 2>/dev/null && {
        LATEST_COMMIT=$(git log -1 --pretty=format:"%h - %s" 2>/dev/null)
        if [ -n "$LATEST_COMMIT" ]; then
          echo "  ✓ $repo_path: $LATEST_COMMIT"
        fi
        cd "$ORIGINAL_DIR"
      } || cd "$ORIGINAL_DIR"
    fi
  done < "$NESTED_REPOS_SUMMARY_FILE"
  rm -f "$NESTED_REPOS_SUMMARY_FILE"
fi
```

**POST-COMMIT VALIDATION**: After displaying the commit message, verify it comprehensively covers all changes by:

1. Running `git show --stat HEAD` to see what was committed
2. Comparing the commit message sections to the actual files changed
3. If significant changes are missing from the message, immediately amend with `git commit --amend` to add missing sections
````
