---
name: end
description: Session-end audit. Files remaining work as task entities and lists them as bullets, verifies all data intended for Neotoma storage from this session is actually stored, and persists what's missing. Invoke at the natural close of a working session, before context is lost.
triggers:
  - /end
  - end session
  - wrap up session
  - close out session
  - finish session
user_invocable: true
supported_harnesses:
  - claude-code
  - cursor
entity_id: ent_af748d985b7bfa4f636eea70
---

# end

## Purpose

Run a session-close audit so nothing intended for follow-up or for Neotoma storage falls through the cracks. Distinct from `store-data` (single per-record persistence) and `store-neotoma` (full chat-transcript persistence): `/end` is the meta-step that decides which of those to invoke, files trackable work as task entities, and verifies storage.

This skill is **user-level** (`~/.claude/skills/end/`), so it is available in every repo automatically.

## Scope

Applies once per session, at user request. Does not modify code. Files Neotoma entities (tasks, sources, plan updates), persists missing entities, and delegates to `store-neotoma` for chat persistence.

## Execution policy (no confirmation gate)

`/end` runs end-to-end without asking for approval:

- It **files task entities first**, stores missing entities, and invokes `store-neotoma` as needed — **then** reports what it did.
- It does **not** request confirmation before filing tasks, storing entities, or invoking `store-neotoma`.
- The only thing it never auto-executes is `do-now` code work unless the user explicitly asked for it in-session; those are filed as tasks like any other `track` item.
- PII MUST still be stripped from any filed issues per the `feedback_issue_pii` memory, and standing constraints (Neotoma prod, never mark yoga/therapy done, etc.) still apply.

## Phase 1: Remaining-work audit

Scan the current conversation and identify every follow-up under these headings:

1. **Open work** — TODOs the assistant introduced, partial implementations, files modified but not verified, tests not run, lint/type-check skipped, PRs/commits not made.
2. **Decisions or proposals not acted on** — recommendations the user accepted that have not been executed; designs sketched but not implemented.
3. **Trackable follow-ups** — bugs noticed in passing, refactors deferred, documentation drift spotted, dependencies needing updates.
4. **External obligations** — anything waiting on CI, a remote agent, a scheduled task, or a third party.
5. **User feedback or preferences expressed this session** — candidates for memory (`feedback`/`user`/`project`/`reference`).

For each item, classify: `do-now` (trivially finishable inline only if the user asked), `track` (file as a task entity), or `drop` (acknowledged, no action — give a one-line reason).

## Phase 2: Neotoma storage audit

Determine what should be in Neotoma from this session and what already is.

1. **Per-turn lifecycle compliance** — confirm each turn this session followed the Neotoma turn lifecycle (user message + assistant message stored, PART_OF + REFERS_TO edges). If any turn was skipped (which is forbidden), note it for repair.
2. **Substantive entities surfaced** — list every concrete entity discussed or produced this session: plans, decisions, skills, rules, bugs, contacts, transactions, events, code artifacts, etc. For each, check via `retrieve_entity_by_identifier` or `retrieve_entities` whether it is already stored.
3. **Files or attachments** — any files the user pasted, screenshots, transcripts, or external URLs fetched. Check whether each has a corresponding `source_id` / content-addressed source row.
4. **Memory-worthy facts** — items that should be written to the auto-memory directory (`~/.claude/projects/.../memory/`) per the auto-memory protocol.

## Phase 3: Execute (file tasks first, then everything else)

Run in this order, without confirmation:

1. **File `task` entities for every `track` item from Phase 1.** Create them via the `store` MCP tool (Neotoma prod) with `REFERS_TO` edges to the relevant entities, and `PART_OF` the active plan when one applies (e.g. the Ateles plan `ent_99ace4dd6673aa36ed08b1fe`). Follow the `update-tasks` skill for field values and priority mapping. Capture the returned task entity IDs.
2. **Store missing entities or sources flagged in Phase 2** via the `store` MCP tool.
3. **If the conversation itself has not been persisted** as a `conversation` + dual `conversation_message` shape end-to-end, invoke `store-neotoma` to do the full transcript sweep — **without confirmation** (pass through the no-confirm intent).
4. **Write any memory files** per the auto-memory protocol and update the `MEMORY.md` index.
5. **Repair any skipped-turn lifecycle gaps** found in Phase 2.1.

## Phase 4: Final report (bullets reflect what was actually stored)

Because tasks are filed **before** reporting, the bulleted list reflects committed state, not intentions.

Render two sections:

### Remaining work (now tracked)

A bullet list of every `track` item, each as: `- <one-line description> — task [<entity_id>](<origin>/inspector/entities/<entity_id>)`. Then a short `do-now` list (done inline or filed) and a `dropped` list with one-line reasons.

### Storage

- Entities/sources stored this turn (with entity IDs).
- Memory files written.
- Whether `store-neotoma` was invoked, and its affected-records summary.

Then render the mandatory `🧠 Neotoma` turn report covering all entities created across Phases 3–4 (Created / Updated / Retrieved groups with linked entity IDs).

## Affected-records output (shared with store-neotoma)

Both `/end` and `store-neotoma` MUST emit a **succinct affected-records list** in the Neotoma-MCP turn-report style — the same Created (N) / Updated (N) / Retrieved (N) grouping the live-chat instructions dictate for per-turn operations. One bullet per record: emoji + label + linked `entity_type` text pointing to `<origin>/inspector/entities/<entity_id>`. Do not dump full snapshots; a one-line labeled link per record is the contract.

## Relationship to other skills

- **`store-data`** — per-entity/per-file store primitive. `/end` calls the underlying `store` MCP tool for each gap in Phase 2.
- **`store-neotoma`** — full chat-transcript persistence. `/end` delegates to it when the conversation is not yet fully persisted, and (per user preference) invokes it **without a confirmation gate**, expecting it to emit the succinct affected-records list above.
- **`update-tasks`** — field/priority guidance for the task entities `/end` files in Phase 3.1.

## Constraints

- MUST file `track` items as task entities **before** rendering the remaining-work bullets, so the bullets reflect stored state.
- MUST NOT request confirmation before filing tasks, storing entities, or invoking `store-neotoma`.
- MUST NOT skip the storage audit even if the user only asks about remaining work, and vice versa.
- MUST classify every surfaced item; no unclassified entries.
- MUST check existing Neotoma state via retrieval before declaring an item "not stored."
- MUST defer chat-transcript storage to `store-neotoma`, not re-implement it.
- MUST strip PII from any filed issues per the `feedback_issue_pii` memory; use `visibility: private` for session-derived issues.
- MUST use Neotoma prod, never the dev instance.
