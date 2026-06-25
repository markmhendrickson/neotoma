---
name: get-context
source: neotoma_bundle:core_workflows
requires_entity_types: [contact, event, task, observation, conversation, conversation_message]
depth_tiers: [snapshot, standard, full]
description: Pull everything the agent needs to know about a topic (person, company, project, decision) before doing the work. Resolves the target, fetches the entity snapshot, the observation history, linked tasks, recent communication, and walks one hop of the relationship graph. Synthesizes a brief rather than dumping data.
---

# get-context

**Specification status:** This file is a specification, not a runnable skill. The `core_workflows` bundle is defined in m1 of the Bundles Strategy (plan `ent_089da2ecebc3bd804d63dcf2`); the runtime path that installs and auto-loads these skills lands in m2 alongside plan `ent_b5a51d1395d206e10945b6b1` (Resolve #205). Until m2, treat this file as the locked spec the implementation MUST match.

Adapted in structure from the reference implementation in `lemon-skills-share` (https://github.com/Lemonbrand/lemon-skills-share).

## Purpose

Synthesize a context brief about a target entity before substantive work begins. The output is a synthesized brief, not a raw data dump. Depth scales with caller intent via the `depth_tiers` field.

## When to use

- Before drafting any output (email, decision memo, deck, code change) that depends on prior state.
- Before any conversation where the user wants to walk in primed.
- When the user names a person, company, or project and asks "what do we know".

## Required entity types

`contact`, `event`, `task`, `observation`, `conversation`, `conversation_message`. All provided by the default-install `core` bundle.

## Depth tiers

| Tier       | Scope                                                                                                    | When to use                                        |
| ---------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `snapshot` | Current entity snapshot only. No history, no graph walk.                                                 | Quick orientation; agent has most context already. |
| `standard` | Snapshot, recent observations (last 30 days), linked open tasks, last 5 communication touchpoints.       | Default. Covers most pre-work briefs.              |
| `full`     | Standard plus full observation history, all linked tasks, all communication threads, one-hop graph walk. | Decision memos, due diligence, escalations.        |

The caller MUST specify a tier. The skill MUST NOT silently upgrade or downgrade.

## Process

### Step 1: Resolve target

Resolve the user-provided reference (name, identifier, URL) to a canonical Neotoma `entity_id`. If ambiguous, return the candidate set and stop.

### Step 2: Snapshot

Fetch the entity snapshot via Neotoma `retrieve_entity_snapshot`.

### Step 3: Observation history

For `standard` and `full`: fetch the observation history within the tier's window. Order by `observed_at DESC`.

### Step 4: Linked tasks

For `standard` and `full`: fetch `task` entities linked to the target.

### Step 5: Recent communication

Fetch `conversation` and `conversation_message` records referencing the target. Scope by tier.

### Step 6: Recent transcripts

For `full` only: include meeting and call transcript references that mention the target.

### Step 7: One-hop graph walk

For `full` only: walk one hop of the relationship graph (company to people, person to company and collaborators).

### Step 8: Synthesize brief

Produce a brief (not a dump) covering: who or what this is, current state, recent activity, open threads, and any obvious next actions. The brief MUST cite entity IDs so the caller can drill in.

### Step 9: Return entity IDs

Return the list of entity IDs touched, for cross-reference at `close-session`.

## Outputs

- A synthesized brief.
- A list of entity IDs touched.
- The depth tier used (echoed back for audit).

## Related

- `docs/skills/core_workflows/start-session/SKILL.md`
- `docs/skills/core_workflows/close-session/SKILL.md`
- `docs/foundation/bundles.md`
