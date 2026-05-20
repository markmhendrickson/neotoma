---
name: process-issues
description: Triage open Neotoma issues in parallel; store per-issue plans, request missing context, and when safe either open a PR or create a local worktree.
triggers:
  - process issues
  - /process-issues
  - triage issues
  - triage open issues
  - process open issues
  - work through the issue queue
---

# Process Issues

Use this skill to work the Neotoma issue queue end-to-end.

For each open issue, the skill should create or update one or more `plan` entities, then do one of three things:

- Open a PR for a public-release reproduction.
- Create a local worktree for a local commit or branch reproduction.
- Post an `add_issue_message` asking for missing context when the reproduction environment is unclear.
- Close any clearly test-only issues that the queue surfaces.
- Open a related GitHub security advisory when the issue is a security issue.

## Workflow

1. **Discover open issues** with `neotoma issues list --state open` (or the current CLI equivalent when the flag shape differs).
2. **Honor reporting mode** before any execution:
   - `off` -> generate and store plans only
   - `consent` -> ask before executing a per-issue plan
   - `proactive` -> execute safe plans autonomously
3. **Filter queue artifacts before reproduction work**:
   - Exclude open PRs or PR URLs accidentally surfaced by the queue command; do not route them through the issue workflow.
   - Identify clearly test-only issues using queue context such as labels like `test`, `test-flow`, `test-cleanup`, or `live-issues-tooling`, and titles/descriptions that indicate sample/live/public test issues rather than product bugs.
   - For each test-only issue, create or update a cleanup `plan` entity, then honor reporting mode:
     - `off` -> store the cleanup plan only
     - `consent` -> ask before closing
     - `proactive` -> close the issue immediately with a brief cleanup comment
   - Report closed test issues in the final aggregate output.
4. **Spawn parallel subagents** with a default concurrency cap of 4, one non-test issue per subagent.
5. **Per issue**:
   - Load the issue snapshot, conversation thread, and any reporter environment fields.
   - Classify the reproduction environment as `public_release`, `local_commit`, `local_branch`, or `unknown`.
   - Classify whether the issue is a security issue based on labels, title/body, affected surface, or prior issue/advisory context.
   - If the environment is missing, conflicting, or still unreproducible, call `add_issue_message` with a structured request for the missing detail and mark the plan `awaiting_input`.
   - Otherwise, synthesize and store a `plan` entity linked to the source `issue` and relevant `conversation_message` rows.
   - If the issue is a security issue, create a related GitHub security advisory before publishing other public artifacts:
     - Reuse an existing related advisory when one already exists.
     - Otherwise open a new draft advisory with a minimal, redacted summary, affected versions/surfaces, reproduction notes, and mitigation status.
     - Record the advisory URL or identifier in the plan and include it in the final aggregate report.
   - If the plan touches schema, security, foundation docs, or an ambiguous architectural boundary, stop and ask instead of executing.
   - If execution is safe and allowed by reporting mode:
     - `public_release` -> branch from `main`, implement and test the change, then open a PR. Public issues may include `Fixes #<github_number>`; private issues must use neutral wording with no private identifiers.
     - `local_commit` or `local_branch` -> create a detached git worktree, initialize it, implement and test the change there, then report the `worktree_path`.
6. **Aggregate** subagent outcomes and report created plans, closed test issues, advisories, worktrees, PRs, and outstanding information requests.
7. **Summarize comprehensively for the user** after each `/process-issues` run:
   - Include the set of issues reviewed in the run.
   - For each issue, state the current status, classification, and the concrete action taken so far.
   - For security issues, state whether a related advisory was created, reused, or is still blocked.
   - Call out any blocker, missing context, or user decision needed to make more forward progress.
   - Separate "completed / no further action needed now" issues from "still active / blocked" issues.
   - End with a concise "What I need from you" section when any issue requires user input, branch guidance, reproduction detail, environment confirmation, or prioritization.

## Output Requirements

- `/process-issues` replies must include a comprehensive human-readable summary, not just a launch/update note.
- The summary should cover:
  - issues processed in the current run
  - action taken for each issue
  - tests run or verification performed when applicable
  - PR URLs, advisory URLs, worktree paths, or issue-thread updates when applicable
  - blockers and the specific help or decisions needed from the user to move further
- If no user input is needed, state that clearly.

## Storage Requirements

- Store each issue-resolution plan as a `plan` entity via the existing `store` surface.
- Link the plan to the source issue with `REFERS_TO`.
- Link the prompting or relevant `conversation_message` rows to the plan with `REFERS_TO`.
- When a security advisory is created or reused, store the advisory reference on the plan or a linked entity so the workflow can resume from it later.
- When the skill replies in chat, reference every materially cited or produced plan in the closing assistant store.

## Constraints

- Never push to `main`.
- Never use `--no-verify`.
- Never amend a pushed commit.
- Always run the redaction leak guard before creating any public artifact derived from a private issue.
- Never include private issue identifiers, reporter details, or issue-body excerpts in a public PR or comment derived from a private issue.
- Never disclose sensitive exploit detail, private reporter context, or advisory-only content in public issue comments or PR text before the advisory workflow is ready.
- Never close a substantive bug or feature issue as "test" unless queue metadata makes it clearly test-only.
