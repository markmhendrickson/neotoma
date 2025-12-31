# Development Workflow Guide
## Scope
This document covers:
- Git branch naming and strategy
- Pull request creation and review process
- Code review criteria
- Commit message conventions
- Feature Unit integration workflow
This document does NOT cover:
- Local environment setup (see `docs/developer/getting_started.md`)
- Feature Unit specification (see `docs/feature_units/standards/feature_unit_spec.md`)
- Deployment procedures (see `docs/infrastructure/deployment.md`)
## Branch Strategy
### Main Branches
- **`main`**: Production-ready code (protected, requires PR)
- **`dev`**: Integration branch for MVP development (protected, requires PR)
### Feature Branches
**Naming Convention:**
```
feature/FU-XXX-short-description
```
Examples:
- `feature/FU-101-entity-resolution`
- `feature/FU-400-timeline-view`
- `feature/FU-702-billing-integration`
**Rules:**
- Branch from `dev` (not `main`)
- One Feature Unit per branch (atomic changes)
- Descriptive names matching Feature Unit ID
### Bugfix Branches
**Naming Convention:**
```
bugfix/FU-XXX-issue-description
```
Examples:
- `bugfix/FU-101-deterministic-entity-ids`
- `bugfix/FU-400-timeline-sorting`
### Hotfix Branches
**Naming Convention:**
```
hotfix/critical-issue-description
```
**Rules:**
- Branch from `main` (for production fixes)
- Merge to both `main` and `dev`
- Use sparingly (only for critical production issues)
## Development Workflow
### Step 1: Create Feature Branch (Worktree Recommended)
**Recommended: Use Git Worktrees**
Each Feature Unit should be developed in its own worktree for isolation and parallel development:
```bash
# From main repo root
cd /path/to/neotoma
# Ensure dev is up to date
git fetch origin
git checkout dev
git pull origin dev
# Create worktree for this Feature Unit (creates branch from current branch, which should be dev)
git worktree add ../neotoma-FU-XXX -b feature/FU-XXX-short-description
# Navigate to worktree
cd ../neotoma-FU-XXX
# Verify branch is based on dev
git branch --show-current  # Should show feature/FU-XXX-short-description
git log --oneline -1       # Should show latest dev commit
# Setup worktree environment (copies .env files)
npm run copy:env || node scripts/copy-env-to-worktree.js
# Install dependencies in worktree
npm install
# Push branch to remote
git push -u origin feature/FU-XXX-short-description
```
**Benefits of Worktrees:**
- **Isolation:** Each Feature Unit has its own `node_modules`, `.env`, and build artifacts
- **Parallel Development:** Work on multiple Feature Units simultaneously without conflicts
- **Clean Context Switching:** Each worktree is independent
- **Environment Management:** Automatic `.env` copying via `scripts/copy-env-to-worktree.js`
**Alternative: Traditional Branching (if not using worktrees)**
```bash
# Ensure you're on dev and up to date
git checkout dev
git pull origin dev
# Create feature branch
git checkout -b feature/FU-XXX-short-description
# Push to remote (sets upstream)
git push -u origin feature/FU-XXX-short-description
```
**Note:** See `.cursor/rules/worktree_env.md` for worktree environment setup details.
### Step 2: Implement Feature Unit
1. **Load relevant documentation:**
   - `docs/NEOTOMA_MANIFEST.md`: Foundational principles
   - Foundation rules in `.cursor/rules/`: Agent instructions and documentation loading order
   - Feature Unit spec (if exists in `docs/feature_units/completed/`)
   - Relevant subsystem docs
2. **Write code following:**
   - Architecture layer boundaries (see `docs/architecture/architecture.md`)
   - Determinism rules (see `docs/architecture/determinism.md`)
   - Error handling (see `docs/subsystems/errors.md`)
   - Testing standards (see `docs/testing/testing_standard.md`)
3. **Write tests:**
   - Unit tests for pure functions
   - Integration tests for services
   - E2E tests for UI flows (if applicable)
4. **Verify locally:**
   ```bash
   npm run lint
   npm run type-check
   npm test
   ```
### Step 3: Commit Changes
**Commit Message Format:**
```
FU-XXX: Brief description
- Detailed change 1
- Detailed change 2
References: docs/specs/MVP_FEATURE_UNITS.md
```
**Examples:**
```
FU-101: Implement entity resolution
- Add normalizeEntityValue function
- Add generateEntityId with hash-based IDs
- Add entity resolution service
- Add unit tests for determinism
References: docs/specs/MVP_FEATURE_UNITS.md
```
**Commit Rules:**
- One logical change per commit
- Reference Feature Unit ID in message
- Include "References:" line pointing to relevant docs
- Keep commits atomic (easy to review, revert)
### Step 4: Push and Create Pull Request
```bash
# Push commits
git push
# Create PR via GitHub UI or CLI
gh pr create --base dev --title "FU-XXX: Feature Description" --body "PR body"
```
**PR Title Format:**
```
FU-XXX: Feature Description
```
**PR Body Template:**
```markdown
## Feature Unit
- **ID**: FU-XXX
- **Priority**: P0/P1/P2
- **Spec**: [Link to spec if exists]
## Changes
- Change 1
- Change 2
## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] E2E tests added/updated (if UI)
- [ ] All tests passing locally
## Documentation
- [ ] Code comments added
- [ ] Subsystem docs updated (if patterns changed)
- [ ] Feature Unit spec updated (if Class 1 error found)
## Risk Assessment
- **Risk Level**: Low/Medium/High (see `docs/private/governance/risk_classification.md`)
- **Breaking Changes**: Yes/No
- **Migration Required**: Yes/No
## Checklist
- [ ] Follows architectural layer boundaries
- [ ] Maintains determinism (same input → same output)
- [ ] Error handling uses ErrorEnvelope
- [ ] No PII in logs
- [ ] Respects Truth Layer boundaries (no strategy/execution logic)
```
## Code Review Process
### Review Criteria
**MUST Verify:**
1. **Architectural Compliance:**
   - Respects layer boundaries (no upward dependencies)
   - Follows determinism rules
   - Maintains Truth Layer purity (no strategy/execution logic)
2. **Code Quality:**
   - TypeScript types are correct
   - Error handling is structured (ErrorEnvelope)
   - No PII in logs or error messages
   - Tests cover critical paths
3. **Documentation:**
   - Code is commented where complex
   - Subsystem docs updated if patterns changed
   - Feature Unit spec updated if Class 1 errors found
4. **Testing:**
   - Unit tests for pure functions
   - Integration tests for services
   - E2E tests for UI flows
   - Regression tests for bug fixes
### Review Labels
- **`approved`**: Ready to merge (all criteria met)
- **`changes-requested`**: Needs fixes before merge
- **`needs-docs`**: Code is fine, but documentation needs updates
- **`needs-tests`**: Code is fine, but test coverage insufficient
- **`high-risk`**: Requires additional review (see `docs/private/governance/risk_classification.md`)
### Review Response Time
- **P0 Features**: Review within 4 hours
- **P1 Features**: Review within 24 hours
- **P2 Features**: Review within 48 hours
## Merge Process
### Before Merging
1. **All CI checks pass:**
   - Lint passes
   - Type check passes
   - Tests pass
   - Coverage meets thresholds
2. **Review approved:**
   - At least one approval
   - No "changes-requested" label
   - High-risk PRs require 2 approvals
3. **Branch is up to date:**
   ```bash
   git checkout dev
   git pull origin dev
   git checkout feature/FU-XXX-short-description
   git rebase dev  # or merge dev into feature branch
   ```
### Merge Strategy
**For MVP Development:**
- Use **"Squash and merge"** to keep `dev` history clean
- PR title becomes commit message
- Feature Unit ID preserved in commit message
**After Merge:**
**If using worktree:**
```bash
# From main repo root
git worktree remove ../neotoma-FU-XXX
# Or if worktree still has uncommitted changes:
git worktree remove --force ../neotoma-FU-XXX
# The branch will be automatically deleted from remote after merge
# If you need to delete local branch tracking:
git branch -d feature/FU-XXX-short-description
```
**If using traditional branching:**
```bash
# Delete local branch
git checkout dev
git pull origin dev
git branch -d feature/FU-XXX-short-description
```
## Feature Unit Integration
### When Feature Unit is Complete
1. **Update Feature Unit Status:**
   - Mark as complete in `docs/specs/MVP_FEATURE_UNITS.md`
   - Move spec to `docs/feature_units/completed/FU-XXX/` (if detailed spec exists)
2. **Update Documentation:**
   - Update subsystem docs if patterns changed
   - Add error codes to `docs/reference/error_codes.md` (if new codes added)
   - Update architecture docs if structural changes
3. **Verify Integration:**
   - Run full test suite: `npm test`
   - Verify E2E tests: `npm run test:e2e` (if applicable)
   - Check metrics/observability (if applicable)
## Conflict Resolution
### When Conflicts Occur
1. **Rebase on latest dev:**
   ```bash
   git checkout feature/FU-XXX-short-description
   git fetch origin
   git rebase origin/dev
   ```
2. **Resolve conflicts:**
   - Edit conflicted files
   - Keep changes that align with Feature Unit spec
   - Verify tests still pass after resolution
3. **Continue rebase:**
   ```bash
   git add <resolved-files>
   git rebase --continue
   ```
4. **Force push (if already pushed):**
   ```bash
   git push --force-with-lease
   ```
**Note:** Only force push to feature branches, never to `dev` or `main`.
## Agent Instructions
### When to Load This Document
Load when:
- Creating a new feature branch
- Preparing a pull request
- Reviewing code changes
- Resolving merge conflicts
- Understanding git workflow
### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md`: Foundational principles
- `docs/feature_units/standards/feature_unit_spec.md`: Feature Unit structure
- `docs/private/governance/risk_classification.md`: Risk assessment
### Constraints Agents Must Enforce
1. **Always branch from `dev`**: Never from `main` (except hotfixes)
2. **One Feature Unit per branch**: Keep changes atomic
3. **Use worktrees for isolation**: Each Feature Unit should have its own worktree when possible
4. **Setup worktree environment**: Run `npm run copy:env` or `node scripts/copy-env-to-worktree.js` after creating worktree
5. **Reference Feature Unit ID**: In commit messages and PR titles
6. **Follow commit message format**: Include "References:" line
7. **Verify tests pass**: Before creating PR
8. **Update documentation**: If patterns or architecture change
### Forbidden Patterns
- Committing directly to `dev` or `main`
- Mixing multiple Feature Units in one branch
- Force pushing to `dev` or `main`
- Skipping code review
- Merging without tests passing
- Committing secrets or API keys
