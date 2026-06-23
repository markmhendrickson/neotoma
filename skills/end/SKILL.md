---
name: end
description: Session-end audit. Files remaining work as task entities and lists them as bullets, verifies all data intended for Neotoma storage from this session is actually stored, persists what's missing without a confirmation gate, and reviews the whole session (transcript JSONL when context is partial) for human-in-the-loop work that could be automated — filing automation proposals as tasks with autonomy-readiness classification. User-level skill (~/.claude/skills/end/), available in every repo.
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

Run a session-close audit so nothing intended for follow-up or for Neotoma storage falls through the cracks. Distinct from `store-data` (single per-record persistence) and `store-neotoma` (full chat-transcript persistence): `/end` is the meta-step that decides which of those to invoke, files trackable work as task entities, and verifies storage. It also closes the automation loop: every session is reviewed for work conducted with a human in the loop (HITL) that agents could execute autonomously next time, and those opportunities are filed as automation-proposal tasks (Phase 3). When writing was crafted in the session, it additionally closes the **voice loop** — generalizing the operator's own edits to agent drafts into a durable voice/style guide so future generation needs less HITL editing, and routing rendered-page design/structure edits back into the page-drafting skill (Phase 3b).

This skill is **user-level** (`~/.claude/skills/end/`), so it is available in every repo automatically.

## Scope

Applies once per session, at user request. Does not modify code. Files Neotoma entities (tasks, sources, plan updates), persists missing entities, and delegates to `store-neotoma` for chat persistence. Automation proposals are filed as tasks — `/end` does not itself create skills, hooks, daemons, or execution policies. The one durable artifact `/end` MAY write directly is the voice/style guide entity (Phase 3b), because it is the operator's own corrections captured verbatim, not a generated automation.

## Execution policy (no confirmation gate)

`/end` runs end-to-end without asking for approval:

- It **files task entities first**, stores missing entities, and invokes `store-neotoma` as needed — **then** reports what it did.
- It does **not** request confirmation before filing tasks, storing entities, or invoking `store-neotoma`.
- The only thing it never auto-executes is `do-now` code work unless the user explicitly asked for it in-session; those are filed as tasks like any other `track` item.
- PII MUST still be stripped from any filed issues per the `feedback_issue_pii` memory, and standing constraints (Neotoma prod, never mark yoga/therapy done, etc.) still apply.

## Phase 0: Whole-session coverage (read the transcript when context is partial)

`/end` must audit the **whole session**, not just the portion currently in context. This matters more here than for `/status`: a partial scan silently *fails to file* trackable work, *misses storage gaps*, and *misses HITL patterns* from the earlier session, defeating the skill's purpose.

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

## Phase 4: Execute (file tasks first, then everything else)

Run in this order, without confirmation:

1. **File `task` entities for every `track` item from Phase 1 and every automation/voice/page-craft proposal from Phases 3 and 3b.** Create them via the `store` MCP tool (Neotoma prod) with `REFERS_TO` edges to the relevant entities (for page-craft tasks: the `draft-rendered-page` skill `ent_20d1e8a0419632311ac3c88d` and the edited `rendered_page`), and `PART_OF` the active plan when one applies (e.g. the Ateles plan ent_99ace4dd6673aa36ed08b1fe). Follow the `update-tasks` skill for field values and priority mapping. Capture the returned task entity IDs.
2. **Store missing entities or sources flagged in Phase 2** via the `store` MCP tool.
3. **Write/extend the voice/style guide from Phase 3b** — `correct`/extend (or create) the `style_guide` entity and write the per-rule memory files. Do this even though it is not a "task": it is the operator's own corrections, captured verbatim. (Page-craft deltas are NOT written here — they go to the `/learn` task filed in step 1, since `/end` does not author skills inline.)
4. **If the conversation itself has not been persisted** as a `conversation` + dual `conversation_message` shape end-to-end, invoke `store-neotoma` to do the full transcript sweep — **without confirmation** (pass through the no-confirm intent).
5. **Write any memory files** per the auto-memory protocol and update the `MEMORY.md` index.
6. **Repair any skipped-turn lifecycle gaps** found in Phase 2.1.

## Phase 5: Final report (bullets reflect what was actually stored)

Because tasks are filed **before** reporting, the bulleted list reflects committed state, not intentions.

Render these sections:

### Remaining work (now tracked)

A bullet list of every `track` item, each as: `- <one-line description> — task [<entity_id>](<origin>/inspector/entities/<entity_id>)`. Then a short `do-now` list (done inline or filed) and a `dropped` list with one-line reasons.

### Automation opportunities (proposed)

A bullet per proposal: `- <HITL pattern> → <proposed mechanism> (<autonomy readiness>) — task [<entity_id>](<origin>/inspector/entities/<entity_id>)`. Then dropped one-offs with one-line reasons. If no HITL patterns met the repeatability threshold, say so in one line.

### Voice & page-craft learnings (guidance updated)

Only when writing or a page was crafted this session. Two subsections:
- **Voice** (style guide updated directly): a bullet per durable voice rule captured: `- <principle> (<channel>) — e.g. "<before>" → "<after>"`, linking the updated `style_guide` entity and any memory file.
- **Page-craft** (routed to draft-rendered-page via /learn): a bullet per durable page-craft rule: `- <principle> — e.g. "<before>" → "<after>" — task [<id>](<origin>/inspector/entities/<id>) (→ draft-rendered-page)`.
Note any rule already covered by existing guidance (a process gap, not new guidance), and any verbatim-send confirmations. If an artifact was crafted but produced no generalizable delta, say so in one line.

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

## Constraints

- MUST audit the whole session: when context is partial (a compaction boundary is present, the session is multi-day / many-turn, or the user flags missed work), reconstruct the full arc from the transcript JSONL (Phase 0) before Phases 1–3b, so trackable work, storage gaps, HITL patterns, and writing/page edits from before the boundary are not missed. If the transcript is unreadable, proceed but state in the final report that coverage may be tail-only.
- MUST file `track` items and automation proposals as task entities **before** rendering the report bullets, so the bullets reflect stored state.
- MUST NOT request confirmation before filing tasks, storing entities, writing the voice/style guide, or invoking `store-neotoma`.
- MUST NOT skip the storage audit even if the user only asks about remaining work, and vice versa.
- MUST run the automation-opportunity audit (Phase 3) on every invocation, classify each proposal's autonomy readiness, and apply the repeatability threshold; one-offs are dropped with a reason, not silently omitted.
- MUST run the voice-loop audit (Phase 3b) whenever writing OR a rendered page was crafted in the session: detect operator edits, classify each delta as VOICE or PAGE-CRAFT, generalize past the instance, and route — voice rules written to the `style_guide` entity + auto-memory directly in the same `/end` pass; page-craft rules filed as a `/learn` task to fold into the `draft-rendered-page` skill. When nothing was crafted, state so and skip. MUST cross-check existing voice memories AND the `draft-rendered-page` skill's content to extend rather than duplicate; an edit already covered is a process gap (the rule wasn't applied), not new guidance.
- MUST keep recipient-specific or one-off content choices (a name, a scenario, a recipient's brand palette) OUT of both the voice guide and the page-craft rules; only universal/channel-level voice, tone, structure, design, and accessibility rules are durable guidance.
- MUST NOT author the `draft-rendered-page` skill edit inside `/end`: page-craft lessons are filed as `/learn` tasks, never folded into the skill by `/end` directly. The `style_guide` entity + voice memory files remain the sole durable artifacts `/end` writes directly, because they are the operator's own corrections captured verbatim.
- MUST file automation proposals (and any drafting-skill voice/page-craft wiring) as task entities only; MUST NOT create skills, hooks, daemons, scheduled tasks, or execution policies inside `/end` unless the user explicitly asked in-session.
- MUST classify every surfaced item; no unclassified entries.
- MUST check existing Neotoma state via retrieval before declaring an item "not stored" or before creating a new `style_guide` entity (extend the operator's existing one if present).
- MUST defer chat-transcript storage to `store-neotoma`, not re-implement it.
- MUST strip PII from any filed issues per the `feedback_issue_pii` memory; use `visibility: private` for session-derived issues.
- MUST use Neotoma prod, never the dev instance.
