# merge
Merge current branch into dev branch, push dev to origin, then switch back to current branch. Uses merge (not rebase) for safety with shared branches. Handles error cases including merge conflicts, uncommitted changes, and missing dev branch.

**WORKTREE COMPATIBILITY:** If working in a Git worktree (created via branch command), the merge script automatically handles worktree scenarios:
- Detects if we're in a worktree
- If `dev` is checked out in another worktree, creates a temporary worktree for the merge operation
- After merging, cleans up the temporary worktree and switches back to the original branch
- All commits are shared across worktrees since they use the same .git directory

