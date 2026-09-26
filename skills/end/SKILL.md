---
name: end
description: "Session-end audit. Files remaining work as task entities and lists them as bullets, verifies all data intended for Neotoma storage from this session is actually stored, persists what's missing without a confirmation gate, audits how well that data is modeled against its schema and repairs mechanical defects in place while filing lossy or schema-altering repairs as tasks (Phase 2b), reviews the whole session (transcript JSONL when context is partial) for human-in-the-loop work that could be automated — filing automation proposals as tasks with autonomy-readiness classification — captures operator edits to agent-drafted writing as durable voice guidance (Phase 3b), and refreshes the relationship-hub rendered pages for any contacts touched this session (Phase 3c: body-only re-projection, no reshare). User-level skill (~/.claude/skills/end/), available in every repo."
triggers:
  - /end
  - end session
  - wrap up session
user_invocable: true
supported_harnesses:
  - claude-code
  - cursor
entity_id: ent_af748d985b7bfa4f636eea70
slug: end
---

# end

## Purpose

Run a session-close audit so nothing intended for follow-up or for Neotoma storage falls through the cracks. Distinct from `store-data` (single per-record persistence) and `store-neotoma` (full chat-transcript persistence): `/end` is the meta-step that decides which of those to invoke, files trackable work as task entities, and verifies storage. It also closes the **modeling loop**: every entity the session stored or retrieved is audited for schema quality (Phase 2b) — invented types, undeclared fields, structured data buried in free text, flat blobs where the schema declares sub-structure, orphans, duplicates — with mechanical defects repaired in place and lossy or schema-altering repairs filed as tasks, so stored data stays queryable by every other agent and not just by the session that wrote it. It also closes the automation loop: every session is reviewed for work conducted with a human in the loop (HITL) that agents could execute autonomously next time, and those opportunities are filed as automation-proposal tasks (Phase 3). When writing was crafted in the session, it additionally closes the **voice loop** — generalizing the operator's own edits to agent drafts into a durable voice/style guide so future generation needs less HITL editing, and routing rendered-page design/structure edits back into the page-drafting skill (Phase 3b). Finally, it closes the **relationship-projection loop** — when the session touched any contact the operator has a relationship with, it refreshes that contact's relationship-hub rendered page(s) so the shared/internal projection stays current with the session's new interactions, commitments, and status changes (Phase 3c).

This skill is **user-level** (`~/.claude/skills/end/`), so it is available in every repo automatically.

## Scope

Applies once per session, at user request. Does not modify code. Files Neotoma entities (tasks, sources, plan updates), persists missing entities, and delegates to `store-neotoma` for chat persistence. Automation proposals are filed as tasks — `/end` does not itself create skills, hooks, daemons, or execution policies. Two durable artifacts `/end` MAY write directly: (1) the voice/style guide entity (Phase 3b), because it is the operator's own corrections captured verbatim, not a generated automation; and (2) the **relationship-hub `rendered_page` body** for a session-touched contact (Phase 3c), regenerated in place from the contact's own Neotoma graph — a projection refresh, not new outward-facing content. Phase 3c regenerates the body only; it does NOT mint new share links, reshare, or send anything to the contact (existing guest tokens keep working against the fresher body). Creating a hub page for a contact who has none is out of scope for `/end` — that is a `track` task, since a first hub is a judgment-heavy, outward-facing artifact.

## Execution policy (no confirmation gate)

`/end` runs end-to-end without asking for approval:

- It **files task entities first**, stores missing entities, and invokes `store-neotoma` as needed — **then** reports what it did.
- It does **not** request confirmation before filing tasks, storing entities, or invoking `store-neotoma`.
- The only thing it never auto-executes is `do-now` code work unless the user explicitly asked for it in-session; those are filed as tasks like any other `track` item.
- PII MUST still be stripped from any filed issues per the `feedback_issue_pii` memory, and standing constraints (Neotoma prod, never mark yoga/therapy done, etc.) still apply.

## Phase 0: Whole-session coverage (read the transcript when context is partial)

`/end` must audit the **whole session**, not just the portion currently in context. This matters more here than for `/digest`: a partial scan silently *fails to file* trackable work, *misses storage gaps*, and *misses HITL patterns* from the earlier session, defeating the skill's purpose.

Before Phase 1, decide whether context is whole-session or partial. Treat it as **partial** whenever any of these hold:

- A compaction/summary boundary is present in context (a "This session is being continued…" summary block, or an injected session-summary).
- The session spans multiple days or many turns.
- The user signals earlier work was missed.

When partial, reconstruct the full arc from the transcript **before** auditing:

1. **Locate the transcript JSONL.** It lives under `~/.claude/projects/<project-slug>/<session-id>.jsonl`. The compaction summary names the exact path; otherwise pick the most recently modified `.jsonl` in that project dir.
2. **Do not read the whole file into context** — it can be multiple MB. Extract a skeleton with a small script: pull genuine user messages (filter out `tool_result` payloads, `<system-reminder>` / `<command-*>` / `<local-command-*>` blocks, and "Continue from where you left off."), plus the assistant's short summary lines, any entity IDs / PR numbers mentioned, and markers of HITL moments — operator approvals/confirmations, manual steps the user performed, corrections the user issued (needed by Phase 3), and **operator edits to agent-drafted writing OR rendered pages** — places where the agent produced prose (an email, post, message, doc) or a `rendered_page` and the operator rewrote, retoned, restructured, restyled, or replaced any of it before it shipped (needed by Phase 3b). This recovers the full request arc, the entities surfaced, the HITL pattern set, and the writing/page-edit set, cheaply.
3. **Feed that whole-session skeleton into Phases 1–3b** — the remaining-work audit, the storage audit, the automation-opportunity audit, and the voice-loop audit must all cover the entire session, not just the in-context tail.

If the transcript can't be found or read, proceed from context but state in the final report that coverage may be tail-only, so the user knows earlier work might be unaudited. When context is already whole-session (short, no compaction boundary), skip the transcript read.

## Phase 1: Remaining-work audit

Scan the whole session (per Phase 0 — the transcript skeleton when context is partial, otherwise the in-context conversation) and identify every follow-up under these headings:

1. **Open work** — TODOs the assistant introduced, partial implementations, files modified but not verified, tests not run, lint/type-check skipped, PRs/commits not made.
2. **Decisions or proposals not acted on** — recommendations the user accepted that have not been executed; designs sketched but not implemented.
3. **Trackable follow-ups** — bugs noticed in passing, refactors deferred, documentation drift spotted, dependencies needing updates.
4. **External obligations** — anything waiting on CI, a remote agent, a scheduled task, or a third party.
5. **User feedback or preferences expressed this session** — candidates for memory (`feedback`/`user`/`project`/`reference`).

For each item, classify: `do-now` (trivially finishable inline only if the user asked), `track` (file as a task entity), or `drop` (acknowledged, no action — give a one-line reason).

## Phase 2: Neotoma storage audit

Determine what should be in Neotoma from this session and what already is.

1. **Per-turn lifecycle compliance** — confirm each turn this session followed the Neotoma turn lifecycle (user message + assistant message stored, PART_OF + REFERS_TO edges). Use the Phase 0 transcript skeleton to enumerate turns when context is partial, so turns from before a compaction boundary are checked too. If any turn was skipped (which is forbidden), note it for repair.
2. **Substantive entities surfaced** — list every concrete entity discussed or produced this session: plans, decisions, skills, rules, bugs, contacts, transactions, events, code artifacts, etc. For each, check via `retrieve_entity_by_identifier` or `retrieve_entities` whether it is already stored.
3. **Files or attachments** — any files the user pasted, screenshots, transcripts, or external URLs fetched. Check whether each has a corresponding `source_id` / content-addressed source row.
4. **Memory-worthy facts** — items that should be written to the auto-memory directory (`~/.claude/projects/.../memory/`) per the auto-memory protocol.

## Phase 2b: Schema-quality audit (is stored data well-modeled?)

Phase 2 answers *whether* the session's data reached Neotoma. This phase answers *how well it is modeled* — because data stored under an invented type, dumped into a free-text blob, or left with undeclared fields is retrievable only by the session that wrote it, and is invisible to every daemon and sibling agent that queries by schema. A stored-but-mismodeled entity is a silent memory failure, not a success.

**Scope: entities this session created, corrected, or retrieved.** Do not sweep every entity of a touched type — that turns `/end` into a full-graph scan on common types like `task` or `contact`. Cross-entity drift gets caught when those entities are next touched. Deduplicate to the distinct entity IDs and distinct `entity_type`s the session actually handled.

1. **Undeclared/unknown fields.** For every entity stored this session, check whether the `store` response reported `unknown_fields_count > 0`, and run `audit_undeclared_fragments` for the session's entity IDs to catch fields that landed outside the declared schema. Each hit means data the schema does not know about — retrievable by ID, but invisible to any typed query.
2. **Type choice.** For each `entity_type` the session used, confirm a registered schema exists (`list_entity_types` / `describe_entity_type`). Flag: (a) an **invented type** where a registered one already fits — the session minted `meeting_note` when `meeting_analysis` exists; (b) a **generic type** used where a specific one exists — everything filed as `task` or `note` when `execution_policy`, `feedback`, or `daemon_report` is the right home. Use `analyze_schema_candidates` when a genuinely new type looks warranted.
3. **Field placement.** For each entity, compare what was stored against the type's declared fields (`describe_entity_type` / `get_schema_recommendations`). Flag structured data stuffed into a free-text field (`body`, `notes`, `content`, `description`) when a declared field is its proper home — dates as prose instead of a date field, amounts inside a sentence, a list of people in a paragraph instead of relationships.
4. **Structural fidelity.** Flag flat blobs stored where the schema declares ordered sub-structure — the `gorilla-store-by-exercise-sets` failure shape: a workout stored as one text blob when the schema declares exercises with ordered sets. Generalize: any type whose schema declares an array of sub-objects must not be collapsed into prose. Also check the inverse — a single entity carrying what should be N linked entities.
5. **Graph connectivity.** Flag orphans: entities with no `PART_OF` and no `REFERS_TO` edge (`list_relationships` per entity). An entity reachable only by direct ID lookup is not in the graph. Also flag a missing plan link where the session's work clearly belongs to the bound plan.
6. **Duplication.** Run `list_potential_duplicates` for the session's entities. Flag near-duplicates the session created alongside an existing record — the classic case being a new entity minted because bounded retrieval was skipped.
7. **Provenance.** Flag entities missing source attribution where the data came from an external ingest (email, file, page fetch) and no `source_id` links back to it (overlaps Phase 2.3, but here as a modeling defect rather than a coverage gap).

**Repair posture — auto-fix mechanical, gate the rest.**

Auto-repair in Phase 4, without confirmation, when the fix is mechanical and non-lossy:
- Re-store or `correct` unknown fields onto declared field names (finding 1).
- Move structured data from a free-text field into its declared field, preserving the original text (finding 3).
- Re-store a flat blob as the schema's declared sub-structure, on a schema the session already used (finding 4).
- Create the missing `PART_OF` / `REFERS_TO` edges (finding 5).
- Attach missing `source_id` provenance (finding 7).

**File as a `track` task instead — never execute inside `/end`** — when the repair is lossy, global, or schema-altering:
- `merge_entities` on suspected duplicates (finding 6) — merges are hard to reverse; the task names both IDs and the evidence.
- `register_schema` / `update_schema_incremental` (findings 2 and, when the right field genuinely does not exist, 3) — schema changes are global, and `update_schema_incremental` resets `guest_access_policy` to closed, breaking live share links until re-set (per the `neotoma-schema-extend-drops-guest-policy` memory). Any such task MUST carry that re-set step in its description.
- Re-typing an entity already stored under the wrong type — that is a delete-and-restore, not a correction.
- Backfilling entities from prior sessions that share the same defect.

Before any auto-repair, re-read the current field and MERGE — `correct` replaces the entire field, so preserve every key already present (the same merge discipline the plan-maintenance rules require). If a defect is genuinely ambiguous — two declared fields could both be the right home — file it as a task rather than guessing.

If the session stored nothing and retrieved nothing, state that in one line and skip the phase.

## Phase 3: Automation-opportunity audit (HITL → autonomous)

Review the whole session (per Phase 0) for work conducted with a human in the loop and propose how tasks of the same nature could run with minimal or no HITL in the future.

1. **Identify HITL patterns** — scan for: operator approvals/confirmations mid-flow; manual steps the user performed (running commands, pasting data, clicking through UIs, supplying credentials); repeated tool sequences the assistant executed step-by-step; corrections or preferences the user issued that imply a missing rule or skill; recurring task shapes (triage, syncs, drafting, filing, reporting).
2. **Propose the cheapest adequate mechanism** for each pattern:
   - **Rule or hook** — when the fix is "always do X when Y" (creation delegated to `/learn`).
   - **Skill update or new skill** — when the workflow is multi-step and reusable (creation delegated to `/learn` / `skill-creator`).
   - **Scheduled task, cron, or daemon/agent assignment** — when the work is time- or event-driven and an existing agent owns the domain.
   - **`execution_policy` entity** (swarm governance layer) — when a whole plan's worth of work needs autonomy calibration: permission scopes, quality criteria, blocking checkpoints, and fallback instructions.
3. **Classify autonomy readiness** per proposal: `full-auto` (safe to run unattended), `checkpoint-gated` (autonomous with blocking `checkpoint_brief` reviews), or `hitl-required` (judgment-heavy or irreversible/external-facing; automate only the preparation). Standing constraints (PII stripping, payment rules, Neotoma prod only, never-complete yoga/therapy) carry into every proposal — an automation that would violate them is `hitl-required` by definition.
4. **Apply a repeatability threshold** — propose only for work that recurred this session or is known-recurring across sessions (check Neotoma for prior tasks/conversations of the same shape). Genuine one-offs are dropped with a one-line reason.
5. **File, don't build** — each surviving proposal becomes a `task` entity in Phase 4 (PART_OF the active plan, REFERS_TO the relevant entities/skills/agents), with fields capturing the HITL pattern, proposed mechanism, and autonomy readiness. Creating the actual rule/skill/hook/policy happens later via `/learn` or explicit user request, never inside `/end`.

## Phase 3b: Voice-loop audit (HITL writing/page edits → durable guidance)

Run this phase **only when writing or a rendered page was crafted in the session** — any agent-drafted prose meant for a human audience (emails, messages, social posts, blog/long-form, recaps, docs) or any `rendered_page`. Its goal is to make the operator's own edits self-eliminating: every time the operator rewrites or restyles an agent draft, that delta is generalized into standing guidance so the *next* draft starts right and needs no edit. This is the inverse of Phase 3 — there the human approves a *process*; here the human corrects a *draft*, and the correction is the asset.

1. **Detect agent-drafted artifacts + operator edits.** From the Phase 0 skeleton (or in-context tail), find each piece the agent produced for a human audience — prose AND rendered pages — and whether the operator changed it before it shipped. Signals of an edit: the operator pasted back a revised version, asked for a reword/retone/trim/expansion/restyle/relayout, said "make it more/less X", swapped specific words, phrasings, colors, or sections, cut or moved a block, changed the sign-off, fixed a theming/contrast/mobile issue, or rejected a draft and supplied their own. A draft sent **verbatim** is also signal — it confirms the draft was already right; note what worked so the guidance reinforces it, not just corrects.
2. **Diff draft → final and name the delta — classifying each as VOICE or PAGE-CRAFT.** For each edited artifact, compare what the agent produced against what the operator made it, and split the deltas by type:
   - **Voice deltas** (apply to prose *and* to the copy on a page): *lexical* (words/phrases the operator removes — hype, filler, AI-generic patterns — or substitutes); *tonal/register* (warmer/drier, more/less formal, more direct, less hedged); *structural* (length, paragraphing, where the claim goes, single-post vs thread, links inline vs separate, sign-off form); *content discipline* (what they always cut — meta-commentary, obligating CTAs, unverifiable superlatives — or always require — a worked example, the scheduler link, an author tag).
   - **Page-craft deltas** (rendered pages only — design, layout, accessibility, structure, host-template behavior): theming (light/dark, CSS variables, palette), contrast/WCAG fixes, mobile responsiveness, SVG/diagram handling, container nesting / HTML structure, host-template style overrides (e.g. `pre{}`/`code{}`/`th{}`/`a{}` colors leaking through), section ordering / which sections to include or omit, CTA/hero conventions, the entities-vs-flat-strings modeling preference. These are the design-and-structure lessons the `draft-rendered-page` skill already accumulates.
3. **Generalize past the instance.** Ask: would this edit recur on *other* artifacts of the same kind? Keep universal rules; discard recipient-specific or one-off content choices (a particular name, a particular scenario, this recipient's brand palette) — those are not reusable guidance. Cross-check against existing voice memories and content-rule feedback (e.g. `feedback_no_ai_generic_patterns`, `feedback_oxford_comma`, `feedback_single_post_vs_thread`, `feedback_social_links_inline`, `feedback_family_email_signoff`, `feedback_email_html_formatting`, `feedback_rendered_page_standards`) AND against the rules already in the `draft-rendered-page` skill's `content`, so you extend rather than duplicate — if an edit is already covered, the lesson is that the rule wasn't applied, which is a Phase 3 process gap, not new guidance.
4. **Route each delta to its correct home:**
   - **Voice deltas → the durable voice/style guide** (the one artifact `/end` writes directly — see Scope). Two homes, write to both:
     - **Neotoma**: a canonical `style_guide` entity (retrieve the operator's existing one by identifier first — e.g. `operator-voice-guide` — and `correct`/extend it; create it only if none exists). Organize rules by writing channel (email, social, long-form, page-copy, message) plus a universal section. Each rule carries a one-line principle, a before→after example drawn from this session's edit, and provenance back to the piece it came from.
     - **Auto-memory**: a `feedback`-type memory file per durable rule (or extend an existing one), with the `**Why:**` / `**How to apply:**` lines, so it surfaces in future sessions' context. Update `MEMORY.md`.
   - **Page-craft deltas → the `draft-rendered-page` skill, via a `/learn` task.** That skill already owns a "Learn from revision feedback" loop that folds generalized revisions into its own `content` field — so `/end` does NOT author the skill edit itself (it never authors skills inline). Instead, **file a `track` task** (Phase 4, classified `hitl-required` since it changes outward-facing page design) that names each generalized page-craft rule with its before→after example and provenance, REFERS_TO the `draft-rendered-page` skill (`ent_20d1e8a0419632311ac3c88d`) and the edited `rendered_page` entity, and instructs `/learn` to fold the rule into that skill's `content` via `correct`. This catches page edits made *outside* a formal `draft-rendered-page` invocation (e.g. by an agent, or ad-hoc), which would otherwise never reach the skill's own loop. If the page edit happened *inside* a `draft-rendered-page` run that already folded the lesson in, note it as already-captured and skip the task.
5. **Make voice consumable by the generators.** Drafting skills (`write`, `write-blog-post`, `social`, `draft-rendered-page`, `email-triage` drafts, agent personas like Corvus) should pull the voice guide on the way *in*, not after. Where a generalized voice rule clearly belongs in a specific drafting skill, file a `track` task (Phase 4) proposing the skill/`/learn` update that has it read the `style_guide` entity, classified `hitl-required` if it changes outward-facing voice. Do not rewrite those skills inside `/end`; `/end` captures the voice, `/learn` wires it in.

If no writing or page was crafted this session, state that in one line and skip the phase. If an artifact was crafted but the operator made no edits, record the verbatim-send as positive confirmation (light touch) and note it.

## Phase 3c: Relationship-hub refresh (touched contacts → current projection)

Every relationship hub is a **generated projection** of a contact's Neotoma graph, never a maintained copy (per the relationship-projection system, plan `ent_f778932973238c48763a2909`). When a session adds interactions, commitments, status changes, or new facts about a contact, that contact's hub page goes stale. This phase re-projects it so the shared and internal faces stay in sync with Neotoma — the truth — without any manual per-contact rebuild.

**Scope: contacts touched this session, body-refresh only.** Do not sweep all contacts, and do not reshare.

1. **Identify touched contacts.** From the Phase 0 skeleton (or in-context tail) and the Phase 2 entity list, collect every `contact` (or `person` acting as a contact) the session created, updated, corrected, or referenced with a state change — a new interaction (`email_message`/`meeting`/`message_thread`/`shared_artifact`), a `last_contact_date` bump, a lifecycle/`status` transition, a new commitment/task, or an answered/opened `qa_entry`. A contact merely mentioned in passing with no state change is NOT touched — drop it. Deduplicate alias/duplicate contact records to one canonical entity first (a hub is per canonical contact).
2. **Find each touched contact's hub page.** Query Neotoma for a `rendered_page` whose canonical name matches `<contact> — Relationship Hub` (or is linked to the contact as its hub projection), e.g. `retrieve_entities` with `entity_type: rendered_page` and a search on the contact's name, or follow a hub link from the contact. A contact may have an **internal** and a **shared** hub (twin projections) plus sub-pages — refresh each hub face that exists.
   - **No hub exists yet** → do NOT create one here. File a `track` task (Phase 4) proposing a first hub for that contact via the relationship-hub generator / `intake-relationship`, classified `hitl-required` (first outward-facing artifact). Note it in the report; move on.
3. **Re-project from the graph, delegating render to `draft-rendered-page`.** For each existing hub, rebuild the body from the contact's *current* Neotoma graph (interactions on the uniform spine, commitments/tasks dual-owner ledger, answered/open Q&A, deliverable status resolved LIVE against released-tag-vs-RC — "shipped" only if in the contact's running version, else "merged/in-RC"). Apply the projection's own `visibility` filters: the **internal** page renders all fields; the **shared** page renders only `visibility: shared` entities and `shared_fields[]` (default private, fail-closed). Defer ALL rendering/CSS to the `draft-rendered-page` skill (canonical authority) — theme toggle, light/dark, host-template overrides, WCAG-AA, post-store verification fetch. Preserve the existing page `entity_id` (correct/store onto it in place); never mint a duplicate hub.
4. **Never leak on the shared face.** Do not link secret gists, internal/localhost URLs, or private entities on a shared hub. Verify claims against source before asserting (a deliverable is "shipped" only if verifiably released). This is the same no-secret-links / verify-vs-source discipline the projection system and `feedback_rendered_page_standards` require.
5. **Body-only, no reshare.** Update the page body in place (store/correct on the existing `rendered_page`); existing share tokens keep resolving to the fresher content. Do NOT mint new tokens, do NOT send the link to the contact, do NOT surface a new outbound message — this phase keeps pages current, it does not initiate contact. (Re-sharing or first-send remains an explicit, separately-approved Sturnus motion.)
6. **Verify after store.** Re-fetch each refreshed page (`…/entities/<id>/html`) and confirm it renders (per `draft-rendered-page`'s post-store verification), so a broken projection is caught here, not by the contact.

If the session touched no contacts, state that in one line and skip the phase.

## Phase 4: Execute (file tasks first, then everything else)

Run in this order, without confirmation:

1. **File `task` entities for every `track` item from Phase 1, every gated schema repair from Phase 2b, and every automation/voice/page-craft proposal from Phases 3 and 3b.** Create them via the `store` MCP tool (Neotoma prod) with `REFERS_TO` edges to the relevant entities (for page-craft tasks: the `draft-rendered-page` skill `ent_20d1e8a0419632311ac3c88d` and the edited `rendered_page`), and `PART_OF` the active plan when one applies (e.g. the Ateles plan ent_99ace4dd6673aa36ed08b1fe). Follow the `update-tasks` skill for field values and priority mapping. Capture the returned task entity IDs.
2. **Store missing entities or sources flagged in Phase 2** via the `store` MCP tool.
2b. **Apply the safe schema repairs from Phase 2b** — re-store/`correct` unknown fields onto declared names, move structured data out of free-text into declared fields, re-store flat blobs as declared sub-structure, create missing `PART_OF`/`REFERS_TO` edges, attach missing `source_id` provenance. Re-read each field and MERGE before correcting. Gated repairs (merges, schema registration/extension, re-typing, cross-session backfills) were already filed as `track` tasks in step 1 — do NOT execute them here.
3. **Write/extend the voice/style guide from Phase 3b** — `correct`/extend (or create) the `style_guide` entity and write the per-rule memory files. Do this even though it is not a "task": it is the operator's own corrections, captured verbatim. (Page-craft deltas are NOT written here — they go to the `/learn` task filed in step 1, since `/end` does not author skills inline.)
4. **Refresh the relationship hubs from Phase 3c** — for each touched contact with an existing hub, re-project and store the refreshed body onto the existing `rendered_page` entity (delegating render to `draft-rendered-page`), apply the visibility filters per face, and re-fetch to verify it renders. Body-only, no reshare. For touched contacts with no hub, the first-hub proposal was already filed as a `track` task in step 1.
5. **If the conversation itself has not been persisted** as a `conversation` + dual `conversation_message` shape end-to-end, invoke `store-neotoma` to do the full transcript sweep — **without confirmation** (pass through the no-confirm intent).
6. **Write any memory files** per the auto-memory protocol and update the `MEMORY.md` index.
7. **Repair any skipped-turn lifecycle gaps** found in Phase 2.1.

## Phase 5: Final report (bullets reflect what was actually stored)

Because tasks are filed **before** reporting, the bulleted list reflects committed state, not intentions.

Render these sections:

### Remaining work (now tracked)

A bullet list of every `track` item, each as: `- <one-line description> — task [<entity_id>](<origin>/inspector/entities/<entity_id>)`. Then a short `do-now` list (done inline or filed) and a `dropped` list with one-line reasons.

### Schema quality (data modeling)

Only when the session stored or retrieved entities. A bullet per defect found: `- <entity_type> [<entity_id>](<origin>/inspector/entities/<entity_id>) — <defect> → <repaired inline | task [<id>](<origin>/inspector/entities/<id>)>`. Group repaired-inline first, then gated-as-task. If every entity was well-modeled, say so in one line — a clean audit is a reportable result, not an omission.

### Automation opportunities (proposed)

A bullet per proposal: `- <HITL pattern> → <proposed mechanism> (<autonomy readiness>) — task [<entity_id>](<origin>/inspector/entities/<entity_id>)`. Then dropped one-offs with one-line reasons. If no HITL patterns met the repeatability threshold, say so in one line.

### Voice & page-craft learnings (guidance updated)

Only when writing or a page was crafted this session. Two subsections:
- **Voice** (style guide updated directly): a bullet per durable voice rule captured: `- <principle> (<channel>) — e.g. "<before>" → "<after>"`, linking the updated `style_guide` entity and any memory file.
- **Page-craft** (routed to draft-rendered-page via /learn): a bullet per durable page-craft rule: `- <principle> — e.g. "<before>" → "<after>" — task [<id>](<origin>/inspector/entities/<id>) (→ draft-rendered-page)`.
Note any rule already covered by existing guidance (a process gap, not new guidance), and any verbatim-send confirmations. If an artifact was crafted but produced no generalizable delta, say so in one line.

### Relationship hubs (refreshed)

Only when the session touched contacts. A bullet per touched contact: `- <contact> — hub refreshed [<page_id>](<origin>/inspector/entities/<page_id>) (internal + shared) — <what changed: new interaction / status / commitment>`, linking each refreshed hub `rendered_page`. Then a bullet per touched contact with **no** hub: `- <contact> — no hub yet, first-hub proposal filed as task [<id>](<origin>/inspector/entities/<id>)`. If the session touched no contacts, say so in one line.

### Storage

- Entities/sources stored this turn (with entity IDs).
- Memory files written.
- Whether `store-neotoma` was invoked, and its affected-records summary.

Then render the mandatory `🧠 Neotoma` turn report covering all entities created/updated across Phases 4–5 (Created / Updated / Retrieved groups with linked entity IDs).

## Affected-records output (shared with store-neotoma)

Both `/end` and `store-neotoma` MUST emit a **succinct affected-records list** in the Neotoma-MCP turn-report style — the same Created (N) / Updated (N) / Retrieved (N) grouping the live-chat instructions dictate for per-turn operations. One bullet per record: emoji + label + linked `entity_type` text pointing to `<origin>/inspector/entities/<entity_id>`. Do not dump full snapshots; a one-line labeled link per record is the contract.

## Relationship to other skills

- **`store-data`** — per-entity/per-file store primitive. `/end` calls the underlying `store` MCP tool for each gap in Phase 2.
- **`store-neotoma`** — full chat-transcript persistence. `/end` delegates to it when the conversation is not yet fully persisted, and (per user preference) invokes it **without a confirmation gate**, expecting it to emit the succinct affected-records list above.
- **`update-tasks`** — field/priority guidance for the task entities `/end` files in Phase 4.1.
- **`learn`** — converts accepted automation proposals into durable rules, skills, and hooks. `/end` proposes and files (Phase 3); `/learn` builds. For Phase 3b, `/end` captures voice into the `style_guide` entity + memory directly, and routes page-craft deltas to `/learn` as tasks so `/learn` folds them into the `draft-rendered-page` skill's `content`.
- **`draft-rendered-page`** — the page-drafting skill that already accumulates design/structure/accessibility rules in its own `content` via its "Learn from revision feedback" loop. `/end`'s Phase 3b is the safety net for page edits made *outside* a formal invocation of that skill: it detects the edit, generalizes the page-craft rule, and files a `/learn` task to fold it into `draft-rendered-page` (`ent_20d1e8a0419632311ac3c88d`). The voice/copy on a page still routes to the `style_guide` like any prose.
- **Drafting skills** (`write`, `write-blog-post`, `social`, `draft-rendered-page`, email/recap drafters, agent personas like Corvus) — the consumers of the Phase 3b voice/style guide. They should retrieve the `style_guide` entity before generating so the operator's voice is applied from the first draft, not patched in by HITL afterward.
- **`intake-relationship` / relationship-hub generator** (owned by Sturnus) — builds a contact's first relationship hub from their domain materials. `/end`'s Phase 3c is the *refresh* counterpart: it re-projects existing hubs for touched contacts from the current Neotoma graph, delegating render to `draft-rendered-page`. `/end` does not build a first hub — that is filed as a `hitl-required` task for the generator.

## Constraints

- MUST audit the whole session: when context is partial (a compaction boundary is present, the session is multi-day / many-turn, or the user flags missed work), reconstruct the full arc from the transcript JSONL (Phase 0) before Phases 1–3b, so trackable work, storage gaps, HITL patterns, and writing/page edits from before the boundary are not missed. If the transcript is unreadable, proceed but state in the final report that coverage may be tail-only.
- MUST file `track` items and automation proposals as task entities **before** rendering the report bullets, so the bullets reflect stored state.
- MUST NOT request confirmation before filing tasks, storing entities, writing the voice/style guide, or invoking `store-neotoma`.
- MUST NOT skip the storage audit even if the user only asks about remaining work, and vice versa.
- MUST run the schema-quality audit (Phase 2b) on every invocation that stored or retrieved entities, scoped to the session's own entities — never a full sweep of every entity of a touched type. MUST check all seven defect classes (undeclared fields, type choice, field placement, structural fidelity, graph connectivity, duplication, provenance) and classify each finding as auto-repair or gated.
- MUST auto-repair only mechanical, non-lossy schema defects (unknown fields → declared fields, free-text → declared field, blob → declared sub-structure, missing edges, missing provenance), re-reading and MERGING each field before `correct` so no existing key is dropped. MUST file — never execute inside `/end` — any `merge_entities`, `register_schema`, `update_schema_incremental`, entity re-typing, or cross-session backfill. Any schema-extension task MUST carry the `guest_access_policy` re-set step, since `update_schema_incremental` resets it to closed and breaks live share links.
- MUST file an ambiguous schema defect as a task rather than guessing which declared field is its home.
- MUST run the automation-opportunity audit (Phase 3) on every invocation, classify each proposal's autonomy readiness, and apply the repeatability threshold; one-offs are dropped with a reason, not silently omitted.
- MUST run the voice-loop audit (Phase 3b) whenever writing OR a rendered page was crafted in the session: detect operator edits, classify each delta as VOICE or PAGE-CRAFT, generalize past the instance, and route — voice rules written to the `style_guide` entity + auto-memory directly in the same `/end` pass; page-craft rules filed as a `/learn` task to fold into the `draft-rendered-page` skill. When nothing was crafted, state so and skip. MUST cross-check existing voice memories AND the `draft-rendered-page` skill's content to extend rather than duplicate; an edit already covered is a process gap (the rule wasn't applied), not new guidance.
- MUST keep recipient-specific or one-off content choices (a name, a scenario, a recipient's brand palette) OUT of both the voice guide and the page-craft rules; only universal/channel-level voice, tone, structure, design, and accessibility rules are durable guidance.
- MUST NOT author the `draft-rendered-page` skill edit inside `/end`: page-craft lessons are filed as `/learn` tasks, never folded into the skill by `/end` directly. The `style_guide` entity + voice memory files remain the sole durable artifacts `/end` writes directly, because they are the operator's own corrections captured verbatim.
- MUST file automation proposals (and any drafting-skill voice/page-craft wiring) as task entities only; MUST NOT create skills, hooks, daemons, scheduled tasks, or execution policies inside `/end` unless the user explicitly asked in-session.
- MUST run the relationship-hub refresh (Phase 3c) whenever the session touched any contact with a state change (new interaction, `last_contact_date` bump, status transition, new commitment, answered/opened Q&A). Scope to touched contacts only — never a full-contact sweep. For each touched contact WITH an existing hub, re-project the body from the current Neotoma graph and store it onto the existing `rendered_page` in place, applying per-face visibility filters, delegating render to `draft-rendered-page`, and re-fetching to verify it renders. Body-refresh ONLY: MUST NOT mint new share tokens, reshare, or send anything to the contact. For a touched contact with NO hub, MUST file a `hitl-required` first-hub `track` task and MUST NOT create the hub inside `/end`. When the session touched no contacts, state so and skip.
- MUST NOT leak on a shared hub face: no secret-gist / internal / localhost links, no `visibility: private` entities or non-`shared_fields`; verify a deliverable is "shipped" against its released tag before asserting it (else "merged/in-RC"). Default visibility is private, fail-closed.
- MUST classify every surfaced item; no unclassified entries.
- MUST check existing Neotoma state via retrieval before declaring an item "not stored" or before creating a new `style_guide` entity (extend the operator's existing one if present).
- MUST defer chat-transcript storage to `store-neotoma`, not re-implement it.
- MUST strip PII from any filed issues per the `feedback_issue_pii` memory; use `visibility: private` for session-derived issues.
- MUST use Neotoma prod, never the dev instance.
