# commit
Run entire tests suite and resolve any errors as necessary. Proceed to analyze all uncommitted files for security vulnerabilities and patch as necessary.

**UI TESTING**: If any frontend files were modified (`frontend/src/**`), automatically follow the Testing Rule (`.cursor/rules/testing.md`) to verify user-facing changes work correctly in the browser before committing. 

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

**WORKTREE COMPATIBILITY:** If working in a Git worktree (created via branch command), commits work exactly the same way. Commits made in worktrees are automatically visible in all worktrees since they share the same .git directory. Branch renaming logic works the same in worktrees.

After committing, verify no unstaged changes remain with `git status`. If any files were missed, amend the commit with `git add <file> && git commit --amend --no-edit`.