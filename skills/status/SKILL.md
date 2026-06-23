---
name: status
description: Mid-session status report. Summarizes what's been achieved so far this session and what work remains, in succinct qualitative prose and bullets with only light technical detail. Read-only — stores nothing, files nothing. Invoke any time to take stock without closing the session.
triggers:
  - /status
  - session status
  - where are we
  - what's done so far
  - status report
user_invocable: true
supported_harnesses:
  - claude-code
  - cursor
---

# status

## Purpose

Give the user a quick, readable read-out of the session so far: what's been accomplished and what's still outstanding. A stock-taking skill, not a closing skill — the lightweight counterpart to `/end`. User-level (`~/.claude/skills/status/`), available in every repo.

## How it differs from /end

`/status` is READ-ONLY: it does NOT store entities, file tasks, write memory, invoke store-neotoma, or render the 🧠 Neotoma turn report. It just reports. (Read-only retrieval of an existing plan is allowed in project mode, but it never writes.) `/end` is the closing audit that files and persists. Use /status any time mid-session; use /end at the natural close.

## Whole-session coverage (read the transcript when context is partial)

`/status` must report on the WHOLE session, not just the portion currently in context. Long sessions get compacted: the active context window may hold only a recent slice (e.g. a pre-compaction summary plus the last few turns), so reporting from context alone silently under-represents earlier work.

Before composing the report, decide whether context is whole-session or partial. Treat it as PARTIAL whenever any of these hold: a compaction/summary boundary is present in context (a "This session is being continued…" summary block, or an injected session-summary), the session spans multiple days or many turns, or the user signals the read-out missed earlier work. When partial, reconstruct the full arc from the transcript BEFORE reporting:

1. Locate the session transcript JSONL. It lives under `~/.claude/projects/<project-slug>/<session-id>.jsonl` (the compaction summary names the exact path; otherwise pick the most recently modified `.jsonl` in that project dir).
2. Do NOT read the whole file into context — it can be multiple MB. Instead extract a skeleton with a small script: pull genuine user messages (filter out tool_result payloads, `<system-reminder>`/`<command-*>`/`<local-command-*>` blocks, and "Continue from where you left off."), and optionally the assistant's short summary lines. This yields the session's request arc cheaply.
3. Compose Achieved/Remaining from that whole-session skeleton, not just the in-context tail.

If the transcript can't be found or read, say so in one line and report from context with an explicit caveat that coverage may be tail-only — don't present a partial read-out as complete. When context is already whole-session (short, no compaction boundary), skip the transcript read.

## Modes (compose)

- `/status` — default: quick read-out (whole-session per above).
- `/status verbose` (also `--full`, `full`, `detailed`) — longer read-out with more context per item. See Verbose variant.
- `/status project` (also `plan`) — fold in the active plan's remaining work (read-only). Also applied automatically when an active plan is obvious from context, unless the user passed `session` / `--session-only`.
- Modifiers stack: `/status verbose project`.

## What to report

Two parts. ACHIEVED THIS SESSION: a short qualitative summary of what's actually completed and verified, framed as plain outcomes not a tool-by-tool log. Lead with a 1–2 sentence overview, then outcome bullets — one win each in plain language, with at most a light technical anchor (file path, entity ID, PR number) where it helps locate the work. Only count things that are done. REMAINING: what's still open as the user would think about it (not an exhaustive TODO dump). Bullets tagged where they stand: in progress / next up / blocked-or-waiting (name the blocker). Note anything explicitly dropped in one line.

## Format and tone rules

- Succinct: scannable in well under a minute; fewer high-signal bullets over completeness.
- Qualitative prose and/or bullets; short lead paragraph per section welcome, long nested checklists not.
- Light technical detail only — anchors for navigation only, never raw tool output, diffs, command logs, or schema chatter.
- Outcomes, not mechanics.
- No new work: don't start tasks, store data, or propose a long plan; point at /end to close out and persist.

## Project-aware mode

When the session is tied to a tracked plan, cross-reference it so Remaining reflects where the broader project stands, not just this session. Engage when the user passed `project`/`plan`, OR an active plan is obvious from context (e.g. CLAUDE.md names a plan entity — the Ateles plan is ent_99ace4dd6673aa36ed08b1fe); skip if the user passed `session`/`--session-only`. How (read-only): (1) retrieve the plan via retrieve_entity_by_identifier / retrieve_entity_snapshot (Neotoma prod); read todos, next_steps, decisions, body — NEVER correct or write it (that's /update-plan). (2) In Achieved, mark session outcomes that close a plan todo. (3) In Remaining, add a short Plan sub-group: still-open todos and next_steps not touched this session, one line each. (4) Keep it light — summarize open items, show top few by priority and note the count of the rest; don't dump the whole array. If no plan is found, silently fall back to session-only unless the user explicitly asked for project mode.

## Verbose variant

`/status verbose` is a fuller read-out, same structure and same read-only outcomes-first discipline. Each Achieved bullet may carry a second clause of context (why it mattered / what it unblocks) and an inline anchor; Remaining items may note the dependency or reason they're open; add a brief 'Decisions made this session' sub-section (one line each) when the session settled anything worth recording. Still no raw logs, diffs, or tool-by-tool narration — verbose means more context, not more mechanics. Target a couple-minute read, not an audit.

## Constraints

- MUST report on the whole session: when context is partial (compaction boundary present, multi-day/many-turn session, or the user flags missed work), reconstruct the full arc from the transcript JSONL before reporting; never present a tail-only read-out as complete. If the transcript is unreadable, report from context with an explicit coverage caveat.
- MUST be read-only: no store, no task filing, no memory writes, no store-neotoma, no 🧠 Neotoma turn report. Project-aware mode may read a plan but MUST NOT write it (that's /update-plan). Reading the transcript JSONL is a read and is allowed.
- MUST keep technical detail light — navigation anchors only, never logs or diffs — in both default and verbose modes.
- MUST separate genuinely-completed work from outstanding/in-progress work; do not report attempts as achievements.
- Default /status MUST stay succinct; resist turning into a full audit (that's /end). verbose adds context, never mechanics.
- Project-aware mode MUST summarize the plan's open items, not dump the full todo array.
