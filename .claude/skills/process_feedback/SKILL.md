---
name: process_feedback
description: Process Feedback
---

<!-- Source: .cursor/skills/process-feedback/SKILL.md -->


# Process Feedback

Work through pending items produced by the agent-feedback pipeline — either surfaced by `neotoma triage --watch` or the local ingest cron — and move each one to a terminal or otherwise-actionable state.

This skill encapsulates the judgment calls (dedup, issue-vs-PR, safety gates). The CLI does the mechanical work (`--list-pending`, `--set-status`, `--resolve`).

## When to Use

- The user asks to triage feedback, process the feedback backlog, or work through pending items.
- A daily / weekly review pass over pending agent submissions.
- After a release, to resolve outstanding items that the new version already fixes.

## Inputs You Need

1. Feedback listing: `neotoma triage --list-pending --json`.
2. Current commit / release state to determine whether a fix has already shipped (consult `docs/subsystems/feedback_upgrade_guidance_map.json`).
3. The Apr-21 Simon fixtures or any historical feedback for dedup reference.

## Workflow

1. **List pending**. Run `neotoma triage --list-pending --json` and read the output. Group by `kind` and by `classification`.
2. **Dedup**. For each item, search recent resolved feedback with similar `tool_name` / `error_class` / free-text overlap. If a match exists:
   - Record the duplicate link via `neotoma triage --set-status duplicate --feedback-id <id> --triage-notes "duplicate of <ref>"`.
3. **Classify**. The ingest cron assigns an initial `classification`. Refine if needed — the decision tree is:
   - `doc_gap` → create a GitHub issue labelled `docs`, link it under `resolution_links.github_issue_urls`.
   - `primitive_ask` → create a GitHub issue labelled `feature`. Do NOT auto-draft a PR at Phase 1.
   - `cli_bug` with clear repro → create issue; if the fix is under `auto_pr_enabled` gating AND under the Phase-1 allowlist (typo, docstring, one-line null guard), consider a draft-only PR via a subagent. Never auto-merge.
   - If the stored record has `prefer_human_draft: true`, skip the auto-draft-PR path even when everything else would qualify — file only an issue and leave the PR for Mark to draft manually.
   - `contract_discrepancy` → issue + docs update; investigate whether the shipped artifact lies about reality.
   - `fix_verification` with `verification_failed` → the server routed this automatically (reopen parent or spawn child). Confirm the routing matches intent.
4. **Already shipped?** Consult `feedback_upgrade_guidance_map.json`. If the behavior is already in `min_version_including_fix`:
   - Use `neotoma triage --resolve <feedback_id> --triage-notes "matched shipped surface: ..."` — the ingest cron will attach full `upgrade_guidance`, or attach it manually via the CLI `--set-status` flags.
5. **Draft issue** (default path) with this template:

```md
**Agent feedback:** `{feedback_id}`
**Kind:** `{kind}`
**Classification:** `{classification}`
**Submitter environment:** `{neotoma_version}` / `{client_name}` / `{os}`

## Symptom
{redacted body}

## Expected behavior
{derived from body}

## Repro
{if present}

closes feedback:{feedback_id}
```

6. **Draft PR** (Phase 2+ only, under the auto-PR gate) via a `best-of-n-runner` subagent. PR body MUST end with `closes feedback:{feedback_id}` so `neotoma triage --resolve` can match the merge.
7. **Update status**. Once issue/PR filed:
   - `neotoma triage --set-status triaged --feedback-id <id> --classification <label> --issue-url <url> --triage-notes "..."`.
8. **On release**. After a release tag that includes the commit(s) closing an item, run `neotoma triage --resolve <feedback_id> --commit-sha <sha> --pr-url <url>`. The cron populates `upgrade_guidance` from the map.
9. **Neotoma mirror state**. Every submission is best-effort forwarded to a native `neotoma_feedback` entity over the Cloudflare tunnel (see `docs/subsystems/feedback_neotoma_forwarder.md`):
   - Check `mirrored_to_neotoma` / `neotoma_entity_id` on the record. When present, any new cross-links (commit, PR, related entity) should REFERS_TO that `neotoma_entity_id` so Inspector queries can follow the chain natively.
   - When `mirrored_to_neotoma=false` lingers (tunnel was down at submit time and the retry worker hasn't caught up), run `neotoma triage --mirror-replay <feedback_id>` to force an immediate forward. If repeated replays fail, `mirror_last_error` tells you whether it's the tunnel (`http_502`, `timeout`), auth (`http_401`/`http_403`), or a payload issue (`bad_response`).
   - Bulk catch-up after a long tunnel outage: `npm run feedback:mirror-backfill` iterates `index:pending` and mirror-replays every record missing `mirrored_to_neotoma=true`.
   - Schema seeding (first-time deploy, or after schema changes): `npm run feedback:seed-schema` ensures the `neotoma_feedback` type has the expected shape before the first mirror lands.

## Safety Rules

- Never amend or force-push anything the feedback pipeline touches without human approval.
- Never post a customer's raw identifier or email back in an issue body — the pipeline redacts before ingest, but confirm.
- Never auto-merge PRs. Draft-only at Phase 2.
- When in doubt, mark the item `wontfix` with a plain-English `triage_notes` explaining why — silence is worse than a clear decline.

## Done criteria

- All pending items are either resolved, duplicate, wontfix, or in_progress with a linked issue/PR.
- `neotoma triage --health` shows a non-zero classification rate and no items older than 24h in `submitted` state.
