---
name: design_issues
description: Work through needs-design issues depth-first until the design question is resolved and the issue is ready to execute
---

# Design Issues

Use this skill to resolve the design questions blocking `needs-design` issues, one issue at a time, until each is ready to hand off to `/process_issues` for execution.

## Invocation

```
/design_issues          # list all needs-design issues, then work the oldest/most-referenced
/design_issues <number> # jump directly to a specific issue by GitHub number
```

## Workflow

### Step 1: Discover needs-design issues

1. Run `gh issue list --label needs-design --state open --json number,title,body,createdAt,url` to fetch all deferred issues.
2. For each issue, retrieve the linked Neotoma `plan` entity (matched by issue number or title) and load the stored design question(s) from the plan body.
3. Also retrieve any existing Neotoma plans linked via `REFERS_TO` from the issue entity — these are candidate prior plans that may already answer or constrain the design question.
4. Rank issues for default selection:
   - Issues with the most `REFERS_TO` links to existing plans (most context available) rank first.
   - Among ties, oldest `createdAt` ranks first.

### Step 2: Present and select

If no issue number was given:

1. Print a numbered list of all needs-design issues with: GitHub number, title, open design question (from plan), and any linked existing plan titles.
2. Default selection is the top-ranked issue. State: "Working issue #N — `<title>`. Press enter to confirm or type a different number."
3. In `proactive` mode, proceed with the top-ranked issue without prompting.

### Step 3: Load full context for selected issue

1. Load the full issue body and comment thread via `gh issue view <number> --comments`.
2. Load the linked `plan` entity snapshot from Neotoma, including the design question and any prior notes.
3. Load all plans linked via `REFERS_TO` from the issue entity — read their full snapshots, including any mirrored `docs/plans/` files.
4. Load relevant codebase context: files, modules, or subsystems named in the issue or plan. Read enough to give an informed recommendation.
5. Load any related issues or PRs referenced in the issue body or plan.

### Step 4: Analyze and attempt autonomous resolution

Before engaging the user, attempt to resolve the design question from loaded context alone:

- Has a prior plan already decided this question? If yes, the answer is to adopt that decision — state it explicitly.
- Does the codebase already implement a pattern that makes one approach clearly correct? If yes, state the pattern and the answer.
- Are all design options clearly inferior except one given current architecture and constraints? If yes, recommend that option with rationale.

If autonomous resolution is confident (one clearly correct answer, no architectural ambiguity), proceed directly to Step 6 with that answer. State the answer and reasoning before acting.

### Step 5: Interactive resolution (when autonomous resolution is not confident)

Present the design question with full context:

1. State the question precisely as recorded in the plan.
2. Summarize relevant context: codebase patterns, related plans, constraints, prior decisions.
3. Present 2–4 concrete options, each with:
   - What it entails technically
   - Trade-offs (complexity, coupling, consistency model, future flexibility)
   - Compatibility with existing architecture and State Layer constraints
4. Give a recommendation with rationale.
5. Ask the user to confirm the recommendation or choose an alternative.

Iterate until the user confirms a direction. Each turn should narrow the question further — do not re-open settled sub-questions.

### Step 6: Record the resolution

Once a design direction is confirmed:

1. Update the linked `plan` entity in Neotoma:
   - Add the resolved design decision to the plan body.
   - Change `status` from `needs_design` to `ready` (or `awaiting_execution` if the plan uses that value).
   - Record who decided (user confirmation vs autonomous) and the rationale.
2. If a prior linked plan was the source of the answer, add a `REFERS_TO` relationship from the updated plan to that prior plan if not already present.
3. Update the plan's linked `docs/plans/` file if one is mirrored, to reflect the resolved decision.
4. Post `add_issue_message` on the GitHub issue summarizing the design decision reached and stating that the issue is now ready for implementation.
5. Remove the `needs-design` label: `gh issue edit <number> --remove-label needs-design`.
6. Optionally add an `implementation-ready` label: `gh issue edit <number> --add-label implementation-ready` (skip if the repo does not use this label — check with `gh label list` first).

### Step 7: Offer to continue

After resolving the current issue:

1. Report: "Issue #N resolved. Design decision recorded. `needs-design` label removed."
2. If other needs-design issues remain, list them and ask: "Work the next issue (#M — `<title>`)? (yes/no)"
3. In `proactive` mode, proceed to the next issue automatically.

## Storage Requirements

- Update the `plan` entity status and body when a design decision is reached.
- Record the design decision as a new observation on the plan entity (do not mutate the original design-question observation — add a new one per immutability rules).
- Create `REFERS_TO` from the resolved plan to any prior plan whose decision was adopted.
- Store `conversation_message` rows for each substantive design turn and link them to the plan with `REFERS_TO`.
- Reference every materially cited or updated plan entity in the closing assistant store for this skill invocation.

## Output Requirements

- Always state the design question being worked before asking the user anything.
- Always show trade-offs for each option — do not present options without trade-offs.
- Always give a recommendation; do not present options without a preferred direction.
- After resolution, always post the `add_issue_message` and remove the label before reporting completion.
- End each invocation with the list of remaining needs-design issues (count and titles), even if zero.

## Constraints

- Never remove `needs-design` without a confirmed design decision recorded in the plan entity.
- Never execute code changes within this skill — resolution only; hand off to `/process_issues` for implementation.
- Never re-open a design question that was settled in a prior turn within the same session.
- Never present more than 4 options for a single design question — consolidate or eliminate dominated options first.
- Always respect the State Layer boundary: design decisions that would place strategy or execution logic inside Neotoma are not valid options.
- Always check `gh label list` before adding `implementation-ready` — only add it if the label exists in the repo.
