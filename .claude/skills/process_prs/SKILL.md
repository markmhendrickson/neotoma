---
name: process_prs
description: Process PRs
---

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
   - **Closure comments drafted for every linked issue (Step 4).** A merge that closes issues without a closure narrative loses the resolution trail. The closure comment must be posted before `gh pr merge`.

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

### Step 4: Post issue-closure comments on linked issues (before merge)

For each PR that passes all merge-eligibility criteria, **before** running `gh pr merge`, walk every issue the PR claims to close and post a closure-narrative comment on it. This memorializes the work and forces a final verification that every original ask was addressed.

The auto-close behavior of GitHub (`Closes #N` in PR body) only posts a generic merge-link comment. That is not sufficient: it does not verify that each bullet of the issue body was addressed, does not reconcile review-thread follow-ups, and does not call out explicit deferrals.

**Detect the linked issues:**

```bash
# Issues GitHub auto-tracks (must be in body via "Closes/Fixes/Resolves #N")
gh pr view <number> --json closingIssuesReferences --jq '[.closingIssuesReferences[].number]'

# Also scan the PR body and commit messages for bare references that GitHub did
# not parse (e.g. "fix bugs #168 #170 #171 #172" — only #168 auto-closes).
gh pr view <number> --json body,commits --jq '.body, (.commits[].messageHeadline), (.commits[].messageBody // "")' \
  | grep -oE '(closes|close|fixes|fix|resolves|resolve)\s+#[0-9]+' -i | sort -u

# Any issue listed here that is NOT in closingIssuesReferences will not be
# auto-closed at merge time — flag it for manual `gh issue close` after merge.
```

**Closure comment shape (uniform across PRs):**

```
Resolved by PR #<pr> (merged <yyyy-mm-dd>). Shipping in **v<version>**.

## What the issue asked for

<bullets quoted from the issue's Expected / Proposed fix / Acceptance / Problem section>

## How it was addressed

<concrete description of the fix: bullets from the PR's Summary section,
ideally referencing file:line or commit SHA for each ask. If the PR closes
multiple issues, include only the bullet that pertains to *this* issue.>

<If review-thread follow-ups for this PR landed in a separate cleanup PR,
note that explicitly: "Review-thread follow-ups for PR #X were addressed in
cleanup batch PR #Y.">

## Verification

<bullets from the PR's Verification / Test plan section, with checkboxes
ticked since the PR has merged.>

## Deferred / out of scope (if applicable)

<bullets describing any original-issue ask or review-comment ask that was
NOT addressed by this PR, with a link to the follow-up issue or a written
reason for the deferral.>
```

**Operationally:**

1. For each linked issue, read the issue body (`gh issue view <iss>`) and the PR body (`gh pr view <pr>`).
2. Build the comment per the shape above. Quote the issue's original asks verbatim where possible.
3. Verify that every original ask appears in the "How it was addressed" or "Deferred" section. If any ask is unaccounted for, **do not merge** — push back on the PR author or file a follow-up issue.
4. Post the comment:

   ```bash
   gh issue comment <iss> --body-file <draft.md>
   ```

5. If the issue is in the "auto-close gap" list from the detection step (closure verb in body/commit but not in `closingIssuesReferences`), close it manually after merge:

   ```bash
   gh issue close <iss> --reason completed
   ```

**Skip the closure comment for:**

- Issues that are purely process/governance (e.g. "we should be more rigorous about commit-message scopes") — leave open with a comment explaining why.
- Trivial single-line fixes where the PR title + auto-close comment are obviously sufficient. The judgment call: would a reader landing on this issue six months from now want a narrative, or is the linked PR self-evidently dispositive? Default to writing the comment — narratives age better than diffs.

### Step 4c: Merge Eligible PRs

For each PR that passes all merge-eligibility criteria AND has closure comments posted on every linked issue:

```bash
gh pr merge <number> --merge --delete-branch
```

Use `--merge` (no-ff merge) to preserve PR history. Use `--squash` only if the PR branch has a single logical commit and the repo convention allows it. Do not rebase-merge.

After merging, confirm the merge succeeded and manually close any auto-close-gap issues identified in Step 4:

```bash
gh pr view <number> --json state,mergedAt
# For each issue in the auto-close gap list:
gh issue close <iss> --reason completed
```

### Step 5: Handle Blocked PRs

For each PR that cannot be merged, take the appropriate action:

- **CI failing**: Before posting a failure comment, check whether the failure is purely mechanical (prettier formatting or eslint auto-fixable lint errors). If so, apply the mechanical fix in-place:

  **Mechanical CI auto-fix (prettier / eslint only):**

  ```bash
  # Determine what failed
  gh pr checks <number> --json name,conclusion,detailsUrl \
    | jq '[.[] | select(.conclusion == "failure") | .name]'
  ```

  If and only if **all** failed checks are formatting or lint checks (names containing `prettier`, `format`, `lint`, or `eslint` — and no type-check, test, build, or security failures), apply the fix:

  ```bash
  BRANCH=$(gh pr view <number> --json headRefName --jq '.headRefName')
  git fetch origin "$BRANCH"
  git worktree add ".claude/worktrees/fmt-pr-<number>" "origin/$BRANCH"
  cd ".claude/worktrees/fmt-pr-<number>"

  # Check what scripts are available
  cat package.json | jq '.scripts | keys'

  # Apply formatting and lint fixes
  npm run format 2>/dev/null || npx prettier --write "src/**/*.{ts,tsx}" "tests/**/*.{ts,tsx}"
  npm run lint:fix 2>/dev/null || npx eslint --fix "src/**/*.ts" "tests/**/*.ts"

  # Verify no type errors were introduced
  npm run type-check

  # If type-check passes, commit and push
  git add -A
  git commit -m "chore: apply prettier formatting

  Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
  git push origin "$BRANCH"

  cd /Users/markmhendrickson/repos/neotoma
  git worktree remove ".claude/worktrees/fmt-pr-<number>" --force
  ```

  After pushing, post a comment on the PR:

  ```bash
  gh pr comment <number> --body "Applied automatic prettier/eslint formatting fix. Re-running CI."
  ```

  Do **not** apply the mechanical fix if:
  - Any non-formatting check also failed (type errors, test failures, build failures, security gates)
  - `npm run type-check` fails after applying formatting
  - The diff produced by formatting exceeds 50 lines (indicates something unexpected; surface to user instead)

  If the mechanical fix is not applicable, fall through to the normal CI-failing path:
  Post a comment summarizing which checks failed. Do not merge.

- **Security gate errors (G2/G3)**: Post a comment with the specific `security:lint` errors or manifest/auth-matrix failures. Do not merge.
- **Review-blocked (Step 1c)**: Post a comment listing the unaddressed Blocking findings from the most recent review, quoting the relevant lines and naming the file paths. Request that the author either land substantive fix commits, post `Waiver: <reason>` comments per finding, or re-request `@claude review` after the fixes. Do not merge.
- **Awaiting review**: Note in the summary report. Do not post a comment unless explicitly requested.
- **Merge conflicts**: Post a comment asking the author to rebase.
- **Draft**: Skip. Report in summary.
- **Release PR**: Report in summary, instruct user to run `/release`.

### Step 5b: Suggest `/fix_pr` for Suitable Blocked PRs

After handling each blocked PR, determine whether it is a good candidate for `/fix_pr` and include the suggestion in the report. A PR is a good candidate if it has at least one auto-fixable blocking reason and no hard stops.

**Suggest `/fix_pr <number>` when ALL of the following are true:**

- PR is not a draft
- PR is not a release PR
- At least one blocking reason is in the auto-fixable category:
  - CI failures that are TypeScript type errors, failing unit/integration tests, or non-formatting lint errors
  - Review findings that are rename/style/naming issues (not logic, architecture, or security)
  - Merge conflicts in non-sensitive files (not `openapi.yaml`, lock files, or migration files)

**Do NOT suggest `/fix_pr` when:**

- All CI failures were already handled by the mechanical auto-fix in Step 5 (fix already applied)
- The only blockers are security-adjacent findings (`src/actions.ts`, `src/services/local_auth.ts`, `protected_routes_manifest.json`, `docs/security/`)
- The only blockers are architectural or design-discussion review findings
- Merge conflicts are only in `openapi.yaml`, lock files, or migration files
- The PR is awaiting review with no other blockers (nothing for `/fix_pr` to act on)

Include the suggestion inline in the blocked PR's report entry, e.g.:

```
PR #217 — Add user preference caching [BLOCKED]
  CI: type-check failing (3 errors in src/services/preferences.ts)
  Review: 1 Blocking finding (rename `prefMap` → `preferenceMap`)
  → Run `/fix_pr 217` to address these automatically.
```

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

- The mechanical CI auto-fix in Step 5 is scoped strictly to prettier formatting and eslint `--fix`-able lint errors. Never apply it when other check types also failed, and never skip `npm run type-check` before pushing the fix commit.
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
- Always run Step 4 (Post issue-closure comments) before `gh pr merge` for every PR that closes a linked issue. Auto-close alone does not produce a resolution trail.
- After merge, manually close any issue that the PR resolved but GitHub did not auto-close (the auto-close-gap case: closure verb in body/commit but issue not in `closingIssuesReferences`).
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
- **Merging a PR that closes issues without first posting a closure-narrative comment on each linked issue (Step 4).** The GitHub auto-close link is not a resolution trail.
- **Applying the mechanical CI auto-fix when non-formatting checks also failed.** The fix is scoped to prettier/eslint-only failures. Mixed failures go to the user.
- **Skipping `npm run type-check` after applying prettier/eslint fixes.** A formatting pass that produces type errors must not be pushed.
- **Leaving issues open that the merged PR resolved.** When detection in Step 4 surfaces an auto-close gap (closure verb in body/commit but issue not in `closingIssuesReferences`), close the issue manually after merge with `gh issue close <iss> --reason completed` and a comment linking the resolving PR.
