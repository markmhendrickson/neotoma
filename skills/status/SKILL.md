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

- MUST be read-only: no `store`, no task filing, no memory writes, no `store-neotoma`, no `🧠 Neotoma` turn report. Project-aware mode may *read* a plan but MUST NOT correct or write it (that's `/update-plan`).
- MUST keep technical detail light — anchors for navigation only, never logs or diffs — in both default and verbose modes.
- MUST separate genuinely-completed work from outstanding/in-progress work; do not report attempts as achievements.
- Default `/status` MUST stay succinct; resist turning the report into a full audit (that's `/end`). `verbose` adds context, never mechanics.
- Project-aware mode MUST summarize the plan's open items, not dump the full todo array.
