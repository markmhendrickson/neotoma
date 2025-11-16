# merge
Merge current branch into dev branch, push dev to origin, then switch back to current branch. Uses merge (not rebase) for safety with shared branches. Handles error cases including merge conflicts, uncommitted changes, and missing dev branch.

