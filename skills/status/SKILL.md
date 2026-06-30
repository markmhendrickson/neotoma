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

Give the user a quick, readable read-out of the session so far: what's been accomplished and what's still outstanding. This is a **stock-taking** skill, not a closing skill. It is the lightweight counterpart to `/end`.

This skill is **user-level** (`~/.claude/skills/status/`), so it is available in every repo automatically.

## How it differs from `/end`

- **`/status` is read-only.** It does NOT store entities, file tasks, write memory, invoke `store-neotoma`, or render the `🧠 Neotoma` turn report. It just reports. (Read-only retrieval of an existing plan is allowed — see Project-aware mode — but it never writes.)
- **`/end` is the closing audit** — it files and persists. Reach for `/end` at the natural close of a session; reach for `/status` any time mid-session to check in.

## Whole-session coverage (read the transcript when context is partial)

`/status` must report on the **whole session**, not just the portion currently in context. Long sessions get compacted: the active context window may hold only a recent slice (a pre-compaction summary plus the last few turns), so reporting from context alone silently under-represents earlier work.

Before composing the report, decide whether context is whole-session or partial. Treat it as **partial** whenever any of these hold:

- A compaction/summary boundary is present in context (a "This session is being continued…" summary block, or an injected session-summary).
- The session spans multiple days or many turns.
- The user signals the read-out missed earlier work.

When partial, reconstruct the full arc from the transcript **before** reporting:

1. **Locate the transcript JSONL — by identity, not recency.** Resolve the path in this strict order, stopping at the first that yields exactly one file:
   1. The exact path named in the compaction/summary block in context (it almost always states it verbatim) — use it directly.
   2. The harness-provided session id (e.g. a `<session-id>` / transcript path in environment context) → `~/.claude/projects/<project-slug>/<session-id>.jsonl`.
   3. Only if neither is available: list `~/.claude/projects/<project-slug>/*.jsonl`. If exactly one exists, use it. **Do not** silently pick "the most recently modified" when several exist — a concurrent or prior-day session in the same project would make recency select the wrong file. If multiple remain and none can be disambiguated by the session id, treat it as *transcript unresolved* (see the not-found handling below) rather than guessing.
2. **Do not read the whole file into context** — it can be multiple MB. Extract a skeleton deterministically: parse the JSONL line by line; keep entries where `type`/`role` is `user` **and** the text does **not** match `^\s*<(system-reminder|command-name|command-message|local-command)`; drop `tool_result` content entirely; drop standalone "Continue from where you left off." lines; optionally keep short assistant summary lines. The "filter out tool_result" rule targets the `tool_result` *content type*, not user-pasted log/test output inside a genuine user message — keep the latter. This yields the session's request arc in a few hundred chars.
3. **Compose Achieved / Remaining from that whole-session skeleton**, not just the in-context tail.

If the transcript can't be resolved or read (not found, ambiguous, parse error, or zero user messages after filtering), do not present a partial read-out as complete. Lead the report with one explicit, prefixed caveat line naming the reason and that coverage is tail-only, e.g.:

> ⚠️ Whole-session transcript unavailable (<reason: not found / multiple candidates / parse error>) — coverage is tail-only; earlier work may be under-reported. Re-run with the session id if you have it.

Then report from context. When context is already whole-session (short, no compaction boundary), skip the transcript read.

## Modes

`/status` has one default behavior and two optional modifiers, which compose:

- **`/status`** — the default: a quick, session-only read-out (the lightweight version below).
- **`/status verbose`** (also `--full`, `full`, `detailed`) — a longer read-out with more detail per item. See *Verbose variant*.
- **`/status project`** (also `plan`) — fold in the active plan's remaining work. See *Project-aware mode*. This is also applied automatically when an active plan is obvious from context (see that section), unless the user passed `session` / `--session-only`.

Modifiers stack: `/status verbose project` gives the detailed, plan-aware read-out.

## What to report

Scan the conversation so far and produce a tight report with two parts.

### Achieved this session

A short qualitative summary of what's actually been completed and verified — framed in plain outcomes, not a tool-by-tool log. Lead with a one- or two-sentence prose overview of the session's arc, then a bullet list of concrete wins. Each bullet is one outcome in plain language (e.g. "Made `/end` a user-level skill available in every repo"), with at most a light technical anchor (a file path, entity ID, or PR number) where it genuinely helps the user locate the work. Only count things that are done — not things attempted or in flight.

### Remaining

What's still open, as the user would think about it — not an exhaustive TODO dump. Bullet list, each item phrased as the outstanding outcome, optionally tagged with where it stands:

- **In progress** — started but not finished this session.
- **Next up** — agreed/obvious next steps not yet begun.
- **Blocked / waiting** — anything depending on CI, a remote agent, a scheduled task, the operator, or a third party (name the blocker in a few words).

If something was explicitly dropped or deferred, note it in one line so the user knows it wasn't forgotten.

## Format and tone rules

- **Succinct.** Aim for something scannable in well under a minute. Prefer fewer, higher-signal bullets over completeness.
- **Qualitative prose and/or bullets.** A short lead paragraph per section is welcome; long nested checklists are not.
- **Light technical detail only.** Include a file path, entity ID, or PR number only when it helps the user *find* the work — never raw tool output, diffs, command logs, or schema chatter.
- **Outcomes, not mechanics.** Describe what changed for the user, not which tools were called to do it.
- **No new work.** Do not start tasks, store data, or propose a long plan; if the user wants to close out and persist, point them at `/end`.

## Suggested shape

```
**Session so far**

<1–2 sentence overview of what this session has been about.>

Achieved
- <outcome> (<optional light anchor>)
- <outcome>

Remaining
- <outcome> — in progress
- <outcome> — next up
- <outcome> — blocked on <thing>
```

Adapt freely: if the session has achieved a lot and has little remaining (or vice versa), let the sections breathe accordingly. If almost nothing has happened yet, say so in a sentence rather than padding.

## Project-aware mode

When the session is tied to a tracked plan, `/status` can cross-reference it so "Remaining" reflects not just this session but where the broader project stands.

**When to engage it:**

- The user passed `project` / `plan`, OR
- An active plan is obvious from context — e.g. CLAUDE.md names a plan entity (the Ateles plan is `ent_99ace4dd6673aa36ed08b1fe`), or the session has been working against one. When obvious, engage it by default; skip if the user passed `session` / `--session-only`.

**How (read-only):**

1. Retrieve the plan entity via `retrieve_entity_by_identifier` / `retrieve_entity_snapshot` (Neotoma prod). Read its `todos`, `next_steps`, `decisions`, and `body`. **Never correct or write the plan** — that's `/update-plan`'s job; `/status` only reads.
2. In **Achieved**, mark any session outcomes that close a plan todo, e.g. "Made `/end` user-level — closes plan todo *distribute end skill*."
3. In **Remaining**, add a short **Plan** sub-group: the plan's still-open todos and `next_steps` not touched this session, each one line. Surface current `next_steps` blockers verbatim-ish but trimmed.
4. Keep it light: summarize the plan's open items, don't dump the whole todo array. If the plan has many open todos, show the top few by priority and note the count of the rest (e.g. "+6 more open todos").

If no plan is found, silently fall back to the session-only report — do not announce the absence unless the user explicitly asked for `project` mode.

## Verbose variant

`/status verbose` produces a fuller read-out while keeping the same structure and the same read-only, outcomes-first discipline. Relative to the default:

- Each **Achieved** bullet may carry a second clause of context — *why* it mattered or what it unblocks — and may include the navigation anchor inline.
- **Remaining** items may note the dependency or the reason they're still open, not just the tag.
- Add a brief **Decisions made this session** sub-section (one line each) when the session settled anything worth recording — so the user can eyeball what might warrant `/end` persistence.
- Still no raw logs, diffs, or tool-by-tool narration. "Verbose" means more *context*, not more *mechanics*. Target a comfortable read in a couple of minutes, not an exhaustive audit.

## Constraints

- MUST report on the whole session: when context is partial (a compaction boundary is present, the session is multi-day / many-turn, or the user flags missed work), reconstruct the full arc from the transcript JSONL *before* reporting; never present a tail-only read-out as complete. If the transcript is unreadable, report from context with an explicit coverage caveat.
- MUST be read-only: no `store`, no task filing, no memory writes, no `store-neotoma`, no `🧠 Neotoma` turn report. Project-aware mode may *read* a plan but MUST NOT correct or write it (that's `/update-plan`). Reading the transcript JSONL is a read and is allowed.
- MUST keep technical detail light — anchors for navigation only, never logs or diffs — in both default and verbose modes.
- MUST separate genuinely-completed work from outstanding/in-progress work; do not report attempts as achievements.
- Default `/status` MUST stay succinct; resist turning the report into a full audit (that's `/end`). `verbose` adds context, never mechanics.
- Project-aware mode MUST summarize the plan's open items, not dump the full todo array.
