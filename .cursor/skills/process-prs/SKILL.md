<!-- Source: .cursor/skills/process-prs/SKILL.md -->

# Process PRs

Use this skill to work the open PR queue end-to-end: assess merge readiness, run security gates, merge eligible PRs, and hand off release PRs to `/release`.

## When to Use

When you want to triage and advance open PRs on the repository — checking CI status, running security checks, merging what is ready, and surfacing what is blocked.

Trigger with `/process_prs`, or naturally ("work the PR queue", "triage open PRs").

## Workflow

### Step 1: Discover Open PRs

```bash
gh pr list --state open --json number,title,headRefName,baseRefName,isDraft,reviewDecision,statusCheckRollup,labels,mergeable,author
```

Exclude draft PRs from automated merge actions. Include them in the summary report.

### Step 2: Classify Each PR

For each open PR, determine:

1. **Is it a release PR?** Criteria: base branch is `main`, head branch is `dev` (or configured integration branch), and `package.json` version bump is present in the diff.
   - If yes: do not merge. Report it and instruct the user to run `/release` to handle it. Do not inline release steps.

2. **Is it security-adjacent?** A PR is security-adjacent if its diff touches any of:
   - `src/actions.ts`, `src/services/local_auth.ts`, `src/middleware/`, any route handler
   - Auth, middleware, proxy trust, forwarded-for handling, session, credential, or token logic
   - `protected_routes_manifest.json`, `scripts/security/`, `docs/security/`
   - Any file matching `*auth*`, `*token*`, `*session*`, `*credential*`, `*permission*`

3. **What is the CI status?** Read `statusCheckRollup` from the PR JSON. Classify as: `passed`, `failed`, `pending`, or `missing`.

4. **Is it mergeable?** A PR is merge-eligible when:
   - Not a draft
   - Not a release PR
   - CI status is `passed` (all checks green)
   - `reviewDecision` is `APPROVED` or review is not required by branch protection
   - `mergeable` is `MERGEABLE`
   - Security gates pass (see Step 3)

### Step 3: Run Security Gates

**For security-adjacent PRs — mandatory before merge:**

```bash
npm run security:lint
```
Errors are blocking. Warnings are noted but do not block. If errors are found, report them on the PR and do not merge until resolved.

```bash
npm run security:manifest:check
npm run test:security:auth-matrix
```
Both must pass. If `security:manifest:check` fails due to an out-of-date manifest (not a code error), run:
```bash
npm run security:manifest:write
```
and confirm the manifest change is staged in the PR branch before re-running the check.

**For all other PRs — advisory:**

Run `npm run security:lint` and report results. Do not block merge on warnings, but surface any errors for the PR author.

**Do not run** `security:classify-diff`, `security:ai-review`, or the deployed probes (`deployed_probes.sh`) — those are release-scoped gates that run in `/release` Step 3.5 and Step 5.

### Step 4: Merge Eligible PRs

For each PR that passes all merge-eligibility criteria:

```bash
gh pr merge <number> --merge --delete-branch
```

Use `--merge` (no-ff merge) to preserve PR history. Use `--squash` only if the PR branch has a single logical commit and the repo convention allows it. Do not rebase-merge.

After merging, confirm the merge succeeded:
```bash
gh pr view <number> --json state,mergedAt
```

### Step 5: Handle Blocked PRs

For each PR that cannot be merged, take the appropriate action:

- **CI failing**: Post a comment summarizing which checks failed. Do not merge.
- **Security gate errors (G2/G3)**: Post a comment with the specific `security:lint` errors or manifest/auth-matrix failures. Do not merge.
- **Awaiting review**: Note in the summary report. Do not post a comment unless explicitly requested.
- **Merge conflicts**: Post a comment asking the author to rebase.
- **Draft**: Skip. Report in summary.
- **Release PR**: Report in summary, instruct user to run `/release`.

### Step 6: Report

Produce a comprehensive summary covering:

- Total PRs reviewed
- For each PR: title, number, classification (release / security-adjacent / standard), CI status, security gate results, and action taken (merged / blocked / handed off / skipped)
- Any security gate errors found, with PR numbers
- Release PRs identified, with a clear "run `/release` to ship these" callout
- Outstanding blockers that require author or user action
- A "What I need from you" section if any PR requires a decision

## Security Gate Reference

| Gate | Command | When to run | Blocks merge? |
|------|---------|-------------|---------------|
| G2 static lint | `npm run security:lint` | All PRs | Yes, on errors |
| G3a manifest check | `npm run security:manifest:check` | All PRs | Yes, on failure |
| G3b auth matrix | `npm run test:security:auth-matrix` | All PRs | Yes, on failure |

Gates **not** run here (release-only):

| Gate | Reason |
|------|--------|
| G1 `security:classify-diff` | Requires `--base <last-tag>`; release-scoped semantic |
| G4 `security:ai-review` | Requires tag, writes to release supplement path |
| G5 deployed probes | Requires live deployed environment |

The `/release` Step 3.5 re-runs G2 and G3 against the exact release commit as a hard gate. The duplication is intentional: PRs merged to `dev` weeks before release may be followed by commits that break the gates.

## Constraints

- Never push to `main` directly. Merges to `main` only happen via `/release`.
- Never merge a release PR (dev→main with version bump). Hand off to `/release`.
- Never use `--no-verify`.
- Never amend a pushed commit.
- Never merge if CI is failing or pending unless the user explicitly instructs.
- Never merge if G2 or G3 produce errors on a security-adjacent PR.
- Always run G2 and G3 before merging a security-adjacent PR.
- Always report security gate results in the summary, even when advisory.

## Forbidden Patterns

- Merging a release PR instead of handing off to `/release`
- Skipping security gates on security-adjacent PRs
- Treating CI warnings as failures (only errors block)
- Treating G2/G3 warnings as blocking (only errors block)
- Posting noisy comments on PRs that merely need a reviewer
- Force-pushing or rebasing shared branches
