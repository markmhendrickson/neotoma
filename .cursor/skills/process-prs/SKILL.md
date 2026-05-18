<!-- Source: .cursor/skills/process-prs/SKILL.md -->

# Process PRs

Use this skill to work the open PR queue end-to-end: assess merge readiness, run security gates, selectively request Claude Opus review on substantial PRs, merge eligible PRs, and hand off release PRs to `/release`.

## When to Use

When you want to triage and advance open PRs on the repository — checking CI status, running security checks, merging what is ready, and surfacing what is blocked.

Trigger with `/process_prs`, or naturally ("work the PR queue", "triage open PRs").

## Workflow

### Step 1: Discover Open PRs

```bash
gh pr list --state open --json number,title,headRefName,baseRefName,isDraft,reviewDecision,statusCheckRollup,labels,mergeable,author
```

Exclude draft PRs from automated merge actions. Include them in the summary report.

### Step 1b: Gate Substantial PRs for Opus Review

Before classifying for merge, check whether each PR needs (or needs another) automated Opus review. The `claude_pr_review.yml` workflow runs on `synchronize` events but deliberately skips `claude/*` branches to avoid runaway agent loops. This step compensates by explicitly posting `@claude review` on PRs that are worth a holistic look.

**Skip review-requesting for:**

- Draft PRs
- Release PRs (dev→main with version bump)
- PRs whose head branch starts with `claude/` — the workflow already runs on `opened` for these

**For newly opened PRs (state was just opened, no review comment yet):**

```bash
gh pr diff <number> --stat
```

Parse the stat output to get: files changed, insertions, deletions. Also check whether the diff touches both `src/` and `openapi.yaml` simultaneously:

```bash
gh pr diff <number> --name-only
```

Post `@claude review` if **any** of the following are true:

- Files changed > 5
- Total lines changed (insertions + deletions) > 150
- Diff touches both `src/` and `openapi.yaml` (contract surface change)
- PR is security-adjacent (per the criteria in Step 2)

```bash
gh pr comment <number> --body "@claude review"
```

**For PRs with new commits since last review was requested:**

Find the most recent `@claude review` comment:

```bash
gh pr view <number> --json comments --jq '[.comments[] | select(.body | contains("@claude review"))] | last | .createdAt // empty'
```

If a prior review comment exists, count commits that landed after that timestamp:

```bash
gh api repos/{owner}/{repo}/pulls/<number>/commits --jq '[.[] | select(.commit.committer.date > "<last_review_iso_timestamp>")] | length'
```

Post another `@claude review` if new commits since last review ≥ 3.

**Never post `@claude review` more than once per batch run on the same PR.** If you already posted in this run, do not post again.

### Step 1c: Audit Existing Review Findings (Merge Blocker)

Reviews posted asynchronously by the Opus review job can land _after_ the author pushed the final commit. The agent that merges later must not assume "review happened, so review was addressed." This step blocks merge on unaddressed substantive findings.

For each PR, fetch the most recent review comment from `github-actions[bot]`:

```bash
gh api repos/{owner}/{repo}/issues/<number>/comments \
  --jq '[.[] | select(.user.login == "github-actions[bot]" and (.body | test("PR Review|Recommended|Blocker|Blocking|MUST|Findings"; "i")) and (.body | length > 300))] | last | {created_at, body}'
```

Detect and skip **placeholder reviews** that never completed:

- Body contains only the line `I'll analyze this and get back to you.` (no substantive content)
- `usage.output_tokens` was 0 (the action timed out or errored)

If the most recent review is a placeholder, treat the PR as "review requested but not delivered" and re-post `@claude review` (subject to the once-per-batch cap in Step 1b).

For substantive reviews, classify findings by scanning the body for:

- **Blocking**: lines containing `Blocker`, `Blocking`, `MUST`, `must fix`, `Required:`, `request changes`, `Verdict: request changes`
- **Substantive non-blocking**: numbered findings (`**1.**`, `### 1.`, `1. **`) that are not in a "Resolved" or "Verified" section
- **Informational**: lines in an `## Approve`, `Verdict: approve`, `Resolved`, or `Non-blocking` section

If the review has any **Blocking** items, the PR is **review-blocked** until either:

1. A commit lands after the review timestamp whose **commit message** explicitly references the finding (by quoting the reviewer's text, the finding number, or a referenced filename and line number), or
2. The author posts a comment containing the literal phrase `Waiver: <reason>` on a per-finding basis acknowledging the deferral, or
3. A fresh `@claude review` is requested and the new review's verdict is `approve` / `approve in substance`.

**Detecting "housekeeping commits" that do not count as addressing findings:**

A commit is housekeeping (and **does not** clear a Blocking finding) if its message matches any of:

- `^chore: regenerate test catalog`
- `^chore: regenerate openapi types`
- `^chore: apply prettier formatting`
- `^chore: fix prettier formatting`
- `^Merge branch 'main'` / `^Merge pull request`
- `^chore: rebase onto main`

Counting these as "post-review work" is the exact pattern that caused PRs #152, #222, #223, #224, #178, #233, #232, #151 to merge with unaddressed findings on 2026-05-18.

Use this check to compute `pending_review_blockers` for each PR:

```bash
# Count substantive (non-housekeeping) commits after the latest substantive review
last_review_iso=$(gh api repos/{owner}/{repo}/issues/<number>/comments \
  --jq '[.[] | select(.user.login == "github-actions[bot]" and (.body | length > 300) and (.body | test("PR Review|Recommended|Blocker|MUST|Findings"; "i")))] | last | .created_at // empty')

if [ -n "$last_review_iso" ]; then
  gh api repos/{owner}/{repo}/pulls/<number>/commits \
    --jq "[.[] | select(.commit.committer.date > \"$last_review_iso\") | select(.commit.message | test(\"^chore: (regenerate|apply|fix) prettier|^chore: regenerate test catalog|^chore: regenerate openapi types|^Merge branch|^Merge pull request|^chore: rebase\"; \"\") | not) | .sha[:8]]"
fi
```

If the review had Blocking items and zero substantive (non-housekeeping) commits landed after it, **the PR is review-blocked**. Post a summary comment listing the unaddressed findings and request fixes; do not merge.

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
   - **No unaddressed review blockers from Step 1c.** A PR with Blocking findings from the most recent substantive `github-actions[bot]` review and no substantive (non-housekeeping) commits or `Waiver:` comments since is **review-blocked** and must not be merged.

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
- **Review-blocked (Step 1c)**: Post a comment listing the unaddressed Blocking findings from the most recent review, quoting the relevant lines and naming the file paths. Request that the author either land substantive fix commits, post `Waiver: <reason>` comments per finding, or re-request `@claude review` after the fixes. Do not merge.
- **Awaiting review**: Note in the summary report. Do not post a comment unless explicitly requested.
- **Merge conflicts**: Post a comment asking the author to rebase.
- **Draft**: Skip. Report in summary.
- **Release PR**: Report in summary, instruct user to run `/release`.

### Step 6: Report

Produce a comprehensive summary covering:

- Total PRs reviewed
- For each PR: title, number, classification (release / security-adjacent / standard), CI status, security gate results, and action taken (merged / blocked / handed off / skipped / review requested)
- PRs where `@claude review` was posted and why (new substantial PR, or N new commits since last review)
- Any security gate errors found, with PR numbers
- Release PRs identified, with a clear "run `/release` to ship these" callout
- Outstanding blockers that require author or user action
- A "What I need from you" section if any PR requires a decision

## Security Gate Reference

| Gate               | Command                             | When to run | Blocks merge?   |
| ------------------ | ----------------------------------- | ----------- | --------------- |
| G2 static lint     | `npm run security:lint`             | All PRs     | Yes, on errors  |
| G3a manifest check | `npm run security:manifest:check`   | All PRs     | Yes, on failure |
| G3b auth matrix    | `npm run test:security:auth-matrix` | All PRs     | Yes, on failure |

Gates **not** run here (release-only):

| Gate                        | Reason                                                |
| --------------------------- | ----------------------------------------------------- |
| G1 `security:classify-diff` | Requires `--base <last-tag>`; release-scoped semantic |
| G4 `security:ai-review`     | Requires tag, writes to release supplement path       |
| G5 deployed probes          | Requires live deployed environment                    |

The `/release` Step 3.5 re-runs G2 and G3 against the exact release commit as a hard gate. The duplication is intentional: PRs merged to `dev` weeks before release may be followed by commits that break the gates.

## Constraints

- Never push to `main` directly. Merges to `main` only happen via `/release`.
- Never merge a release PR (dev→main with version bump). Hand off to `/release`.
- Never use `--no-verify`.
- Never amend a pushed commit.
- Never merge if CI is failing or pending unless the user explicitly instructs.
- Never merge if G2 or G3 produce errors on a security-adjacent PR.
- **Never merge a PR that is review-blocked per Step 1c.** A substantive `github-actions[bot]` review with Blocking findings followed only by housekeeping commits is **not** a green light. The author must either (a) land non-housekeeping fix commits, (b) post `Waiver: <reason>` comments per deferred finding, or (c) trigger a re-review whose verdict is `approve`.
- Always run G2 and G3 before merging a security-adjacent PR.
- Always report security gate results in the summary, even when advisory.
- Always run Step 1c (Audit Existing Review Findings) for every non-draft PR before classification in Step 2.
- Never post `@claude review` on a `claude/*` branch PR — the workflow already runs on `opened` for those.
- Never post `@claude review` more than once per batch run on the same PR.
- Do not post `@claude review` on trivially small PRs (≤5 files, ≤150 lines, no contract surface changes, not security-adjacent).
- Treat placeholder review bodies (`I'll analyze this and get back to you.` with 0 tokens) as "review not delivered," not "review approved." Re-trigger once per batch.

## Forbidden Patterns

- Merging a release PR instead of handing off to `/release`
- Skipping security gates on security-adjacent PRs
- Treating CI warnings as failures (only errors block)
- Treating G2/G3 warnings as blocking (only errors block)
- Posting noisy comments on PRs that merely need a reviewer
- Force-pushing or rebasing shared branches
- Spamming `@claude review` on every push — only request when the diff genuinely warrants a holistic re-review (≥3 new commits since last request)
- **Merging on the strength of a review timestamp alone.** A review was _posted_ does not mean its findings were _addressed_. Verify via Step 1c.
- **Counting `chore: regenerate test catalog` / `prettier` / rebase-merge commits as "post-review fixes."** They are housekeeping and do not clear review blockers.
- **Treating placeholder review comments (`I'll analyze this and get back to you.` with 0 output tokens) as completed reviews.** Re-trigger and wait for a substantive review.
