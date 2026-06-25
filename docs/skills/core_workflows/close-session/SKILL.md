---
name: close-session
source: neotoma_bundle:core_workflows
requires_entity_types: [task, observation, interaction, session_close]
description: Archive the working session at the end. Writes a session_close record to the state layer, logs every outbound interaction as a first-class row, writes task entities for follow-ups, and writes a project-level task ledger as a human-readable safety net. Run at the end of every working session to ensure nothing is lost.
---

# close-session

**Specification status:** This file is a specification, not a runnable skill. The `core_workflows` bundle is defined in m1 of the Bundles Strategy (plan `ent_089da2ecebc3bd804d63dcf2`); the runtime path that installs and auto-loads these skills lands in m2 alongside plan `ent_b5a51d1395d206e10945b6b1` (Resolve #205). Until m2, treat this file as the locked spec the implementation MUST match.

Adapted in structure from the reference implementation in `lemon-skills-share` (https://github.com/Lemonbrand/lemon-skills-share). The `interaction` and `session_close` entity types are added by the `core_workflows` bundle to the `core` shared schemas at m2.

## Purpose

End every session with a deterministic write-out. Nothing learned in-session should depend on the agent's working memory after termination. Every decision, every outbound message, every follow-up MUST land in the state layer or in a human-readable ledger.

## When to use

- At the end of every working session.
- When the user says "wrap up", "we're done", "close out", or "save and exit".
- Before any planned context reset.

## Required entity types

`task`, `observation`, `interaction`, `session_close`. The first two come from the default-install `core` bundle; the latter two are contributed by `core_workflows` to the shared schemas.

## Process

### Step 1: Archive locally

Snapshot the session transcript and any work-in-progress artifacts to the agent's local archive location. This is the safety net for everything downstream.

### Step 2: Pull daily activity

Aggregate the entities touched this session (from `start-session` cache plus in-session writes).

### Step 3: Store session_close entity

Write a `session_close` entity with:

- A summary of no more than 8 bullets.
- Each bullet no more than 240 characters.
- Links to the entity IDs touched.
- A timestamp.

### Step 4: Write entity observations

For every entity whose state materially changed this session, write a new `observation` row capturing the change and its source.

### Step 5: Log outbound interactions

Every outbound message, call, or commit produced this session MUST be logged as a standalone `interaction` row with its target entity, content reference, and timestamp.

### Step 6: Write follow-up tasks

For every follow-up surfaced this session (explicit or implicit), write a `task` entity with status `open`, an owner, a due date if known, and a link back to the originating context.

### Step 7: Write project task ledger

Append to the project-level task ledger file (human-readable markdown). This is the safety net for cases where the state layer is unreachable.

### Step 8: Verify

Verify that every entity ID surfaced by `start-session` and every entity written in-session has a corresponding `observation`, `interaction`, or `task` row. Any gap MUST be flagged before the session closes.

### Step 9: Update last session block

Update the "last session" block in the user's session log with the `session_close` entity ID, the bullet summary, and the timestamp.

## Outputs

- A `session_close` entity.
- New `observation`, `interaction`, and `task` rows.
- An updated project task ledger.
- A verification report of any gaps.

## Related

- `docs/skills/core_workflows/start-session/SKILL.md`
- `docs/skills/core_workflows/get-context/SKILL.md`
- `docs/foundation/bundles.md`
