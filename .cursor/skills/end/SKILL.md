---
name: end
description: Session-end audit. Surfaces remaining work to complete or track, verifies all data intended for Neotoma storage from this session is actually stored, and offers to file what's missing. Invoke at the natural close of a working session, before context is lost.
triggers:
  - /end
  - end session
  - wrap up session
  - close out session
  - finish session
---

# end

## Purpose

Run a session-close audit so nothing intended for follow-up or for Neotoma storage falls through the cracks. Distinct from `/store-data` (single per-record persistence) and `/store-neotoma` (full chat-transcript persistence): `/end` is the meta-step that decides which of those to invoke, and what remaining tasks need to be tracked.

## Scope

Applies once per session, at user request. Does not modify code. Does file Neotoma entities (tasks, issues, plan updates) and may delegate to `store-neotoma` for chat persistence.

## Phase 1: Remaining-work audit

Scan the current conversation and produce a structured list under these headings. List items only; do not write to disk yet.

1. **Open work** — TODOs the assistant introduced, partial implementations, files modified but not verified, tests not run, lint/type-check skipped, PRs/commits not made.
2. **Decisions or proposals not acted on** — recommendations the user accepted that have not been executed; designs sketched but not implemented.
3. **Trackable follow-ups** — bugs noticed in passing, refactors deferred, documentation drift spotted, dependencies needing updates.
4. **External obligations** — anything waiting on CI, a remote agent, a scheduled task, or a third party.
5. **User feedback or preferences expressed this session** — candidates for memory (`feedback`/`user`/`project`/`reference`).

For each item, classify: `do-now` (small enough to finish in this session), `track` (file as task/issue/plan entry), or `drop` (acknowledged, no action).

## Phase 2: Neotoma storage audit

Determine what should be in Neotoma from this session and what already is.

1. **Per-turn lifecycle compliance** — confirm each turn this session followed the Neotoma turn lifecycle (user message + assistant message stored, PART_OF + REFERS_TO edges). If any turn was skipped (which is forbidden), list it.
2. **Substantive entities surfaced** — list every concrete entity discussed or produced this session: plans, decisions, skills, rules, bugs, contacts, transactions, events, code artifacts, etc. For each, check via `retrieve_entity_by_identifier` or `retrieve_entities` whether it is already stored.
3. **Files or attachments** — any files the user pasted, screenshots, transcripts, or external URLs fetched. Check whether each has a corresponding `source_id` / content-addressed source row.
4. **Memory-worthy facts** — items that should be written to the auto-memory directory per the auto-memory protocol.

Produce a table with columns: `item`, `kind` (entity / source / memory), `stored?` (yes/no/partial), `action` (store via `store-data` / store via `store-neotoma` / write memory file / skip).

## Phase 3: Confirmation and execution

Present Phases 1 and 2 to the user as a single end-of-session report with two sections: "Remaining work" and "Storage gaps." End with:

- A concrete list of proposed actions (e.g., "file 3 tasks, store 2 entities, invoke /store-neotoma, write 1 memory file").
- Request confirmation, or accept revisions.

On confirmation:

1. File `task` entities for each `track` item from Phase 1 via the `store` MCP tool with appropriate REFERS_TO edges to relevant entities.
2. Store missing entities or sources flagged in Phase 2 via the `store` MCP tool.
3. If the conversation itself has not been persisted as a `conversation` + dual `conversation_message` shape end-to-end, invoke `store-neotoma` to do the full transcript sweep.
4. Write any memory files per the auto-memory protocol and update `MEMORY.md` index.
5. If `do-now` items exist and the user requested execution, perform them inline; otherwise file them as tasks.

## Phase 4: Final summary

Report:

- Remaining-work items filed (with task entity IDs).
- Entities/sources stored (with entity IDs).
- Memory files written.
- Anything dropped or deferred, with one-line reason.
- Whether `store-neotoma` was invoked.

Render the mandatory `🧠 Neotoma` turn report covering all entities created in Phases 3–4.

## Relationship to other skills

- **`store-data`** — per-entity/per-file store primitive. `/end` calls `store-data` (or the underlying `store` MCP tool) for each gap identified in Phase 2.
- **`store-neotoma`** — full chat-transcript persistence with preview/confirm. `/end` delegates to it when the conversation as a whole is not yet stored.
- **Redundancy note:** `store-data` and `store-neotoma` are not redundant — `store-data` is per-record and per-call; `store-neotoma` is the bulk session-end transcript sweep with preview. They could be consolidated into one skill with a `mode: per-record | transcript` switch; flagged for a separate consolidation task rather than handled here.

## Constraints

- MUST NOT execute storage or task filing without user confirmation of the Phase 3 plan.
- MUST NOT skip the storage audit even if the user only asks about remaining work, and vice versa.
- MUST classify every surfaced item; no unclassified entries.
- MUST check existing Neotoma state via retrieval before declaring an item "not stored."
- MUST defer chat-transcript storage to `store-neotoma`, not re-implement it.
- MUST strip PII from any filed issues per `feedback_pii_in_issues` memory.
