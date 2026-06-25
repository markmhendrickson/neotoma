---
name: start-session
source: neotoma_bundle:core_workflows
requires_entity_types: [contact, event, task, observation]
description: Open every work session with a deterministic context pull. Verifies the state layer is reachable, surfaces today's calendar, scans recent inbound (email and DMs), lists open tasks, pre-resolves entity context for anyone on today's schedule, and reports a strategic snapshot before waiting for direction.
---

# start-session

**Specification status:** This file is a specification, not a runnable skill. The `core_workflows` bundle is defined in m1 of the Bundles Strategy (plan `ent_089da2ecebc3bd804d63dcf2`); the runtime path that installs and auto-loads these skills lands in m2 alongside plan `ent_b5a51d1395d206e10945b6b1` (Resolve #205). Until m2, treat this file as the locked spec the implementation MUST match.

Adapted in structure from the reference implementation in `lemon-skills-share` (https://github.com/Lemonbrand/lemon-skills-share). Neotoma's version uses the Neotoma MCP and CLI for state-layer access rather than the reference's bespoke knowledge-base API.

## Purpose

Every work session follows the same shape: **get context, do work, close session**. This skill owns the first leg. By the time it finishes, the agent knows what's on the schedule, who matters today, what's still open from prior sessions, and what's new since last close.

The principle: do not start work by reacting to whatever surfaces first. Orient, then act.

## When to use

- The first prompt of every working session.
- Returning after a long gap (more than four hours) when fresh state is needed.
- After any unattended period (overnight, weekend, travel).
- Whenever the user says "let's start", "ok let's go", "what's on the docket", or "where are we".

Skip when:

- The user has already given a concrete task and explicitly says "skip the intro".
- The agent is inside a sub-agent invocation (the parent owns context).

## Required entity types

`contact`, `event`, `task`, `observation`. All are provided by the default-install `core` bundle.

## Process

### Step 1: Health check

Verify the Neotoma state layer is reachable. If it is not, every downstream step degrades to best-effort and the user MUST be told.

### Step 2: Strategic snapshot

Pull the most-recently-touched entities to surface anything needing attention before the user asks. Source: Neotoma `list_recent_changes` over the last 24 hours.

### Step 3: Today's calendar

Retrieve `event` entities scheduled for today. Surface attendees, times, and the linked context for each.

### Step 4: Recent inbound scan

Scan inbound communication (email, DMs, transcripts) since the last `session_close`. Identify items that need a response or a decision.

### Step 5: Open task list

List `task` entities with status `open` or `in_progress`, ordered by priority and last-touched.

### Step 6: Pre-resolve attendee context

For each attendee on today's schedule, fetch the `contact` snapshot and a one-hop graph walk. Cache the result so later in-session calls do not re-fetch.

### Step 7: Draft today's qualifier

Synthesize a one-line orientation: the day's most important meeting, the most overdue task, and any inbound that needs an answer before the next sync.

### Step 8: Report and wait

Deliver the snapshot to the user. Stop. Do not begin substantive work until the user directs.

## Outputs

- A strategic snapshot block in the session log.
- Pre-resolved entity context cached for the session.
- A list of entity IDs surfaced during the pull (for cross-reference at `close-session`).

## Related

- `docs/skills/core_workflows/get-context/SKILL.md`
- `docs/skills/core_workflows/close-session/SKILL.md`
- `docs/foundation/bundles.md`
