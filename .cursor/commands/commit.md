# commit
Run entire tests suite and resolve any errors as necessary. Proceed to analyze all uncommitted files for security vulnerabilities and patch as necessary.

**SENSITIVE DATA AUDIT**: Before staging or committing anything, perform a secrets/PII sweep:
1. Run the org-standard automated scanner (e.g., `git secrets --scan`, TruffleHog, or equivalent). The scan must pass cleanly; fix tool errors before proceeding.
2. Manually search staged and unstaged files for obvious patterns such as API keys, bearer tokens, PEM headers, SSNs, email/phone numbers, or other customer data. Example helpers: `rg -n "sk-"`, `rg -n "BEGIN PRIVATE KEY"`, `rg -n "@.*"`, etc.
3. If anything suspicious is found, stop immediately, remove or relocate it into configuration/secret storage, and document the remediation.
4. Document in the final summary which automated/manual scans ran and explicitly confirm that no personal or private information remains hardcoded. If an item was mitigated, describe the fix.
5. Re-run the automated + manual scans after any subsequent code generation (e.g., lint fixes, UI snapshots) to ensure no new sensitive data was introduced.

Only continue once the sensitive data audit passes.

**UI TESTING**: If any frontend files were modified (`frontend/src/**`), automatically follow the Testing Rule (`.cursor/rules/testing.md`) to verify user-facing changes work correctly in the browser before committing. After completing the browser run, rerun the sensitive data audit in case new assets or logs were created.

**IMPORTANT**: Before committing, ensure all changes are staged:
1. Run `git add -A` to stage all changes (including any made during security analysis)
2. Verify staged changes with `git status` to ensure nothing is missed
3. If any files were modified after the initial `git add`, run `git add -A` again right before committing

**BRANCH RENAMING**: Before committing, check if current branch starts with "chat-". If so:
1. Generate the commit message first (as described below)
2. Use the commit message to generate a descriptive branch name using the branch naming logic (sanitize, add prefix like feat/fix/refactor/etc.)
3. Rename the current branch to the new descriptive name using `git branch -m <new-name>`
4. Ensure we're not on main/master before renaming (skip if on protected branch)
5. If the new branch name already exists, append a number suffix or use alternative

Then proceed to git commit with commit message that represents their functional changes, and push to origin. Generate the most detailed, multi-line commit message possible given changes and constraints.

**WORKTREE DETECTION:** Restrict all commit activity to the chat’s current worktree:
1. Determine the current worktree path with `git rev-parse --show-toplevel`
2. Run tests, security analysis, staging, and commits only inside that directory
3. Ignore any other worktrees even if they have pending changes; they are out of scope for this command

**WORKTREE COMPATIBILITY:** Commits made within this worktree remain visible to the shared `.git` directory. Branch renaming logic works the same but must only operate on the branch checked out in the chat’s worktree.

After committing, verify no unstaged changes remain with `git status`. If any files were missed, amend the commit with `git add <file> && git commit --amend --no-edit`.

