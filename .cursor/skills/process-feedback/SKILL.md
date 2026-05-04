---
name: process-feedback
description: Triage, review, resolve, and update agent feedback submissions as the Neotoma maintainer. Covers the full lifecycle from pending intake through resolution and verification request.
triggers:
  - process feedback
  - /process-feedback
  - triage feedback
  - review feedback
  - feedback queue
  - pending feedback
  - resolve feedback
  - feedback pipeline
---

# Process Feedback

Review, triage, resolve, and update agent feedback submissions. This skill covers the maintainer side of the feedback pipeline — everything the automated cron leaves for human judgment.

## When to Use

When you need to:
- Review pending/triaged feedback items
- Confirm or override the cron classifier's classification
- Link feedback to GitHub issues, PRs, or commits
- Write upgrade guidance for reporters
- Mark items resolved, duplicate, or wontfix
- Request verification from the reporting agent
- Check pipeline health (classifier accuracy)

## Reference Documents

| Document | Role |
|----------|------|
| `docs/subsystems/agent_feedback_pipeline.md` | Pipeline architecture, data model, flow |
| `docs/subsystems/feedback_upgrade_guidance_map.json` | Keyword/surface → guidance map (updated per release) |
| `docs/subsystems/feedback_auto_pr_config.json` | Phased auto-PR rollout config |
| `src/services/feedback/types.ts` | `FeedbackStatus`, `FeedbackKind`, `UpgradeGuidance`, `ResolutionLinks` types |
| `src/cli/triage.ts` | CLI implementation of all triage subcommands |
| `scripts/cron/ingest_agent_incidents.ts` | Automated classifier and guidance-map resolver |

## Workflow

### Step 1: Review the Queue

List pending and triaged items:

```bash
neotoma triage --list-pending
neotoma triage --list-pending --json   # machine-readable
```

For each item, note:
- `id` (feedback_id)
- `kind` (incident, report, primitive_ask, doc_gap, contract_discrepancy, fix_verification)
- `title` and `body` (redacted)
- `classification` (cron-assigned: cli_bug, report, primitive_ask, doc_gap, contract_discrepancy, fix_verification, duplicate_of_shipped_work)
- `status` (submitted or triaged)
- `metadata.environment` (neotoma_version, client_name, tool_name, error_message)

### Step 2: Triage Each Item

For each pending item, decide on a disposition:

**Status values:** `submitted → triaged → planned → in_progress → resolved | duplicate | wontfix | wait_for_next_release | removed`

1. **Confirm or override classification.** The cron assigns a classification from `KIND_TO_CLASSIFICATION` in `ingest_agent_incidents.ts`. If the cron got it wrong, override with `--classification`.

2. **Check the guidance map.** Read `docs/subsystems/feedback_upgrade_guidance_map.json` — if the reported issue matches a keyword/surface entry, the cron should have auto-resolved it. If it missed, resolve manually with the matching guidance.

3. **Check for duplicates.** Search existing feedback for the same root cause. If duplicate, mark as `duplicate` and set `resolution_links.duplicate_of_feedback_id`.

4. **Set status with triage notes:**

```bash
# Move to triaged with classification override and notes
neotoma triage --set-status triaged \
  --feedback-id <id> \
  --classification cli_bug \
  --triage-notes "Confirmed: null guard missing in store response path"

# Mark as duplicate
neotoma triage --set-status duplicate \
  --feedback-id <id> \
  --triage-notes "Duplicate of fb_abc123"

# Mark as wontfix
neotoma triage --set-status wontfix \
  --feedback-id <id> \
  --triage-notes "Expected behavior per schema-agnostic design"
```

### Step 3: Link to Resolution Artifacts

When a fix exists or is planned, attach resolution links:

```bash
# Link to a GitHub issue
neotoma triage --set-status planned \
  --feedback-id <id> \
  --issue-url "https://github.com/markmhendrickson/neotoma/issues/42"

# Link to a PR
neotoma triage --set-status in_progress \
  --feedback-id <id> \
  --pr-url "https://github.com/markmhendrickson/neotoma/pull/55"

# Resolve with commit SHA and PR
neotoma triage --resolve <id> \
  --commit-sha abc123def \
  --pr-url "https://github.com/markmhendrickson/neotoma/pull/55" \
  --triage-notes "Fixed in v0.5.2: null guard added to store response builder"
```

### Step 4: Write Upgrade Guidance

For resolved items, the reporter's agent polls `get_feedback_status` and acts on `upgrade_guidance`. Two paths:

**A. Guidance map entry (preferred for recurring fixes):**

Add an entry to `docs/subsystems/feedback_upgrade_guidance_map.json`:

```json
{
  "keywords": ["<error keyword>", "<surface name>"],
  "surface_names": ["<cli flag or mcp tool>"],
  "guidance": {
    "target_version": "<version>",
    "min_version_including_fix": "<version>",
    "release_url": "https://github.com/markmhendrickson/neotoma/releases/tag/v<version>",
    "install_commands": {
      "neotoma_cli": "npm i -g neotoma@<version>"
    },
    "restart_required": true,
    "verification_steps": ["<step the agent can run to confirm the fix>"],
    "action_required": "upgrade_and_retry"
  }
}
```

**B. Per-item guidance (one-off fixes):**

Set upgrade guidance fields directly when resolving via the Inspector admin proxy or by editing the local JSON store at `data/feedback/records.json`.

### Step 5: Request Verification

For resolved items where you want the reporter to confirm the fix works:

Set a `verification_request` on the feedback record. The reporter's agent receives this on its next `get_feedback_status` poll and is instructed to submit a `fix_verification` kind feedback with the outcome.

Verification fields:
- `verify_by` — ISO date deadline
- `verification_steps` — concrete steps the agent should run
- `expected_outcome` — what success looks like
- `parent_feedback_id` — links back to the original

After deadline, silence is treated as `unable_to_verify` per `deadline_behavior`.

### Step 6: Health Check

Run periodically to confirm the pipeline is healthy:

```bash
neotoma triage --health
neotoma triage --health --json
```

Check:
- `classification_rate` — should be near 1.0
- `classifier_vs_operator.agreement_rate` — over the last 20 triaged items, must stay above the accuracy floor (0.7 per `feedback_auto_pr_config.json`)
- `by_status` — submitted/triaged backlog should not grow unbounded
- `accuracy_floor.below_floor` — if true, auto-PR phases degrade to phase 1

### Step 7: Release Ritual

After every release tag:

1. Update `docs/subsystems/feedback_upgrade_guidance_map.json` with entries for fixes in the release.
2. For merged PRs carrying `closes feedback:{feedback_id}`, resolve them:
   ```bash
   neotoma triage --resolve <id> --commit-sha <sha> --pr-url <url>
   ```
3. Run `neotoma triage --health` to confirm classification accuracy.

## Phase-Gate Awareness

Read `docs/subsystems/feedback_auto_pr_config.json` before drafting issues or PRs:

- **Phase 1 (current):** Issue-only. Classify, triage, draft GitHub issues manually. No auto-PR.
- **Phase 2:** Draft-only PRs on narrow allowlist (`typo_fix`, `docstring_fix`, `one_line_null_guard`). Gate: 10+ resolved, 90%+ classifier agreement.
- **Phase 3:** Broader auto-PR scope. Gate: 80%+ acceptance rate over last 20 drafts.
- **Kill switch:** `NEOTOMA_FEEDBACK_AUTO_PR_ENABLED=0` disables auto-PR regardless of phase.

Check current phase and gate status before proposing any automation expansion.

## Inspector Admin

The Inspector at `localhost:3080/inspector/feedback` (or configured port) shows feedback items with an admin view when `NEOTOMA_FEEDBACK_ADMIN_MODE` is `local` or `hosted`. Status updates through the Inspector also mirror to the `neotoma_feedback` entity graph.

## Constraints

- MUST NOT auto-merge PRs — `never_auto_merge: true` in all phases
- MUST check the kill switch env var before any auto-PR action
- MUST mirror every status update to the `neotoma_feedback` entity (handled automatically by `neotoma triage` and the admin proxy)
- MUST update `feedback_upgrade_guidance_map.json` as part of every release ritual
- MUST NOT expose `access_token` values in logs, prose, or commit messages
- MUST redact PII before adding triage notes that reference reporter content
