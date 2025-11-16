# commit
Run entire tests suite and resolve any errors as necessary. Proceed to analyze all uncommitted files for security vulnerabilities and patch as necessary. 

**IMPORTANT**: Before committing, ensure all changes are staged:
1. Run `git add -A` to stage all changes (including any made during security analysis)
2. Verify staged changes with `git status` to ensure nothing is missed
3. If any files were modified after the initial `git add`, run `git add -A` again right before committing

Then proceed to git commit with commit message that represents their functional changes, and push to origin. Generate the most detailed, multi-line commit message possible given changes and constraints.

After committing, verify no unstaged changes remain with `git status`. If any files were missed, amend the commit with `git add <file> && git commit --amend --no-edit`.