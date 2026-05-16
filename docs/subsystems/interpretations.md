---
title: "Neotoma Interpretations — Versioned Extraction Attempts"
summary: "**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../vocabulary/canonical_terms.md)"
---

# Neotoma Interpretations — Versioned Extraction Attempts

**Authoritative Vocabulary:** [`docs/vocabulary/canonical_terms.md`](../vocabulary/canonical_terms.md)

## Scope

This document covers the `interpretations` record type as a primitive of the Neotoma data model:

- What an [interpretation](../vocabulary/canonical_terms.md#interpretation) is and why it is its own record type
- `interpretations` table schema and field semantics
- The `interpretation_config` JSONB shape (audit, not replay)
- Status state machine (`pending → running → completed | failed`)
- Reinterpretation: how a new interpretation produces new [observations](../vocabulary/canonical_terms.md#observation) without mutating existing ones
- `unknown_field_count` and `extraction_completeness` as quality signals
- Quota, archival, and ownership boundaries

This document does NOT cover:

- The `sources` table or content-addressed storage — see [`docs/subsystems/sources.md`](./sources.md)
- [Observation](../vocabulary/canonical_terms.md#observation) creation, [reducer](../vocabulary/canonical_terms.md#reducer) merging, or [snapshot](../vocabulary/canonical_terms.md#snapshot) computation — see [`docs/subsystems/observation_architecture.md`](./observation_architecture.md)
- [Ingestion](../vocabulary/canonical_terms.md#ingestion) pipeline mechanics (validation, raw fragments, schema routing) — see [`docs/subsystems/ingestion/ingestion.md`](./ingestion/ingestion.md)
- [Timeline event](../vocabulary/canonical_terms.md#event) derivation triggered by completed interpretations — see [`docs/subsystems/timeline_events.md`](./timeline_events.md)

`sources.md` remains the authoritative document for the combined source-and-interpretation lifecycle (ingest, dedupe, reinterpretation MCP tool, quota, agent attribution); this document narrows in on the interpretation record itself.

## 1. What an Interpretation Is

An **interpretation** is a versioned attempt to extract structured information from a single [source](../vocabulary/canonical_terms.md#source). It is the second layer of the three-layer truth model:

```
Source → Interpretation → Observations → Entity Snapshots
```

It exists as a first-class record (rather than a hidden run log) so the system can:

1. **Audit how data was extracted.** Every observation links to the interpretation that produced it; every interpretation logs its model, prompt, and schema version.
2. **Reinterpret without rewriting history.** A new interpretation creates new observations alongside the old; nothing about the prior extraction is mutated.
3. **Track extraction quality over time.** `confidence`, `unknown_field_count`, and `extraction_completeness` make it possible to compare runs on the same source.
4. **Bound non-determinism explicitly.** Neotoma does not promise that two runs of the same model on the same bytes produce identical outputs — it promises that whichever output happened is durably recorded with the config that produced it.

Structured ingestion (**`store`** with an `entities` array) does not require an interpretation by default: the source is already structured, observations are written directly, and the `observations.interpretation_id` is `NULL`. Interpretations are produced only by explicit AI/parser/agent-authored extraction passes. Agents can opt in by supplying `interpretation` on **`store`**, or by calling `create_interpretation` for a post-hoc extraction against an existing source.

## 2. Storage

### 2.1 Schema

```sql
CREATE TABLE interpretations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES sources(id),
  interpretation_config JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  extracted_entities JSONB DEFAULT '[]',
  confidence NUMERIC(3,2),
  unknown_field_count INTEGER NOT NULL DEFAULT 0,
  extraction_completeness TEXT DEFAULT 'unknown',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  user_id UUID NOT NULL
);
```

For the live DDL (and any deferred columns such as `timeout_at` / `heartbeat_at`), see [`docs/subsystems/schema.md`](./schema.md). For the source side of the foreign-key relationship, see [`docs/subsystems/sources.md §3`](./sources.md).

### 2.2 Field Semantics

| Field                      | Purpose                                                                                       |
| -------------------------- | --------------------------------------------------------------------------------------------- |
| `id`                       | Unique interpretation identifier; referenced by `observations.interpretation_id`              |
| `source_id`                | The [source](../vocabulary/canonical_terms.md#source) that was interpreted                    |
| `interpretation_config`    | JSONB block describing model / extractor / prompt version (see §3)                            |
| `status`                   | State machine value (`pending` / `running` / `completed` / `failed`)                          |
| `error_message`            | Set when `status = 'failed'`; null otherwise                                                  |
| `extracted_entities`       | JSONB array summarising what was produced (entity types, counts) — convenience for read paths |
| `confidence`               | Aggregate model self-reported confidence in `[0.00, 1.00]` (advisory, not authoritative)      |
| `unknown_field_count`      | Number of extracted fields routed to `raw_fragments` because they were not in the schema      |
| `extraction_completeness`  | `complete` / `partial` / `unknown` — coverage signal for the source                           |
| `started_at`               | When the interpreter actually began work                                                      |
| `completed_at`             | When the interpreter terminated (success or failure)                                          |
| `created_at`               | When the row was written                                                                      |
| `archived_at`              | When the interpretation was retired in favour of a newer one                                  |
| `user_id`                  | Owner; redundant with `sources.user_id` but indexed directly for read paths                   |

### 2.3 Row-Level Security

Interpretations are user-isolated transitively through `source_id`. Read paths defensively load the authenticated user's `sources.id` set first and filter `interpretations.source_id IN (...)`. The `user_id` column is denormalised for indexing but is not the security boundary.

Writes flow only through authenticated Neotoma surfaces (**`store`** with an explicit `interpretation` block, `create_interpretation`, server-side interpretation jobs, or CLI commands backed by those APIs). Clients never insert interpretation rows directly.

## 3. `interpretation_config`

The `interpretation_config` JSONB field stores everything needed to understand how an interpretation was performed. It is an **audit log, not a replay contract** — Neotoma does not promise that re-running with the same config yields identical output (see §6).

### 3.1 Canonical Shape

```json
{
  "model": "gpt-4o-mini",
  "model_version": "2024-01-15",
  "extractor_type": "rule_based",
  "extractor_version": "1.2.0",
  "prompt_version": "v3",
  "temperature": 0,
  "schema_version": "1.0"
}
```

| Key                  | Purpose                                                                       |
| -------------------- | ----------------------------------------------------------------------------- |
| `model`              | LLM identifier (when AI extraction is involved)                               |
| `model_version`      | Version pin (where the provider exposes one)                                  |
| `extractor_type`     | `ai`, `rule_based`, `parser`, `mixed` — the high-level extraction strategy    |
| `extractor_version`  | Internal extractor version string                                             |
| `prompt_version`     | Prompt or template version used for this run                                  |
| `temperature`        | LLM sampling temperature when applicable                                      |
| `schema_version`     | Active [entity schema](../vocabulary/canonical_terms.md#entity-schema) version at extraction time |

Implementations may add fields; readers MUST treat unknown keys as opaque audit metadata and MUST NOT change behaviour based on them.

### 3.2 Audit, Not Replay

The same config can produce different outputs across runs because:

- LLM providers may change underlying weights even when the model id is stable.
- Network conditions and tokenisation can shift sampling at temperature `> 0`.
- Tools/agents the extractor calls may themselves be non-deterministic.

What Neotoma guarantees is that whichever output happened is permanently linked to the config that produced it, so audits can answer "why was this field set this way?" — not "give me the same result again."

For the broader determinism doctrine see [`docs/subsystems/sources.md §4`](./sources.md) and [`docs/architecture/determinism.md`](../architecture/determinism.md).

## 4. Status State Machine

```
                 ┌──────────────┐
   create ─────► │   pending    │
                 └──────┬───────┘
                        │ start
                        ▼
                 ┌──────────────┐
                 │   running    │
                 └──┬─────────┬─┘
        finish     │           │   fail
                   ▼           ▼
            ┌──────────┐  ┌────────┐
            │ completed │  │ failed │
            └──────────┘  └────────┘
```

| Status      | Meaning                                                                  | Writable Fields                                                                            |
| ----------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `pending`   | Row has been created but the extractor has not started                   | `started_at` (on transition to `running`)                                                  |
| `running`   | Extractor has begun work; observations may not exist yet                 | `completed_at`, terminal `status`, `confidence`, `unknown_field_count`, `extraction_completeness` |
| `completed` | Extractor finished successfully; observations and raw fragments persisted | `archived_at` (when superseded)                                                            |
| `failed`    | Extractor terminated without producing observations; `error_message` set  | `archived_at` (when superseded)                                                            |

Terminal states (`completed`, `failed`) MUST NOT be transitioned back to `pending` or `running`. Reruns create new rows.

## 5. Reinterpretation

### 5.1 Immutability Invariant

Reinterpretation **always** creates a new interpretation and new [observations](../vocabulary/canonical_terms.md#observation). Existing observations remain bound to their original interpretation and are never modified.

```
Source A
  ├─ Interpretation 1 (2024-01-01, gpt-4o-mini)
  │    └─ Observations linked to Entity E
  └─ Interpretation 2 (2024-06-01, claude-3-5-sonnet)
       └─ Observations linked to Entity E (same entity, new observations)
```

The [reducer](../vocabulary/canonical_terms.md#reducer) chooses between competing observations using `source_priority`, `specificity_score`, and `observed_at`; corrections (`source_priority = 1000`) always win. This means a reinterpretation can update a snapshot without retracting prior history — the prior history stays queryable through `list_observations`.

### 5.2 Archival of Prior Interpretations

When a newer interpretation supersedes an older one, the older row's `archived_at` is set. Observations linked to archived interpretations remain queryable:

- Inspector continues to surface them in observation history.
- Reducer continues to consider them unless a downstream rule excludes archived sources.
- Snapshot rebuilds include them by default; per-snapshot policy may filter.

Archival is a labelling concern, not a deletion. Hard delete only happens via explicit user action through the MCP layer (see `delete_source` in [`docs/specs/MCP_SPEC.md`](../specs/MCP_SPEC.md)).

### 5.3 Reinterpretation MCP Tool

The `reinterpret({ source_id, interpretation_config? })` MCP tool is documented in [`docs/subsystems/sources.md §5`](./sources.md). Its preconditions in summary:

- `storage_status = 'uploaded'` on the source (else `STORAGE_PENDING`).
- No concurrent interpretation with `status = 'running'` for the same source (else `INTERPRETATION_IN_PROGRESS`).
- User has not exceeded `interpretation_limit_month` (else `INTERPRETATION_QUOTA_EXCEEDED`).

## 6. Quality Signals

### 6.1 `unknown_field_count`

Increment for every field the extractor produced that was not in the active [entity schema](../vocabulary/canonical_terms.md#entity-schema) and was therefore routed to `raw_fragments`. Used by:

- Schema evolution: a sustained spike on a new source type signals that the schema is missing fields; agents and operators address this through `update_schema_incremental` (see [`docs/specs/MCP_SPEC.md`](../specs/MCP_SPEC.md)).
- Inspector: per-source quality view ranks high `unknown_field_count` for triage.

### 6.2 `extraction_completeness`

| Value      | Meaning                                                                                |
| ---------- | -------------------------------------------------------------------------------------- |
| `complete` | Every required field for the matched entity schema was extracted                       |
| `partial`  | At least one required field is missing                                                 |
| `unknown`  | Default; the extractor did not (or could not) determine completeness                   |

This is set by the extractor at the end of the run; readers MUST treat it as advisory.

### 6.3 `confidence`

Aggregate model self-reported confidence in `[0.00, 1.00]`. Treated as advisory. Reducer merge rules MUST NOT use `confidence` directly; they use `source_priority` and `specificity_score` (see [`docs/subsystems/observation_architecture.md`](./observation_architecture.md)).

## 7. Quota, Limits, and Backpressure

Per the v0.2.0 quota model in [`docs/subsystems/sources.md §6`](./sources.md):

- Interpretation creation is gated by a per-month soft limit. Exceeding it logs but does not block.
- Storage quota is not enforced.

`v0.3.0` operational hardening (`storage_usage`, strict enforcement, `timeout_at` / `heartbeat_at` cleanup) is tracked in [`docs/subsystems/sources.md §7`](./sources.md).

## 8. Lifecycle Walkthrough

A full pipeline pass for an unstructured source:

1. **Source upload.** `ingest({ file_content, mime_type, … })` writes a `sources` row, dedupes per-user.
2. **Interpretation create.** A row is inserted with `status = 'pending'`, `interpretation_config` capturing the active model / prompt / schema version.
3. **Run start.** Extractor sets `status = 'running'`, `started_at = now()`.
4. **Field validation and routing.** Validated fields become observations; unknown fields become raw fragments. Both link back to `interpretation_id` and `source_id` (FK enforced; see [`docs/subsystems/sources.md §9.4`](./sources.md)).
5. **Run finish.** Extractor writes `confidence`, `unknown_field_count`, `extraction_completeness`, `completed_at`, and a terminal `status`.
6. **Snapshot recompute.** The reducer recomputes affected entity snapshots; [timeline events](./timeline_events.md) are derived from any new date fields in the snapshot.
7. **Reinterpretation (optional).** A later `reinterpret()` call repeats steps 2–6 with a fresh interpretation row; the prior interpretation is `archived_at`-marked.

## 9. Constraints and Invariants

Interpretations MUST:

- Carry a non-null `source_id`, `interpretation_config`, and `user_id`.
- Capture model / extractor / prompt / schema version in `interpretation_config` at the moment of run start.
- Be immutable in their identifying fields after the row is written; only status, timing, quality fields, and `archived_at` may be updated post-create.
- Satisfy attribution policy on write (see [`docs/subsystems/agent_attribution_integration.md`](./agent_attribution_integration.md)).

Interpretations MUST NOT:

- Be mutated in a way that retroactively changes which observations a row produced.
- Be deleted (use `archived_at` instead) outside of explicit user-initiated source deletion.
- Be created without a corresponding `sources` row.
- Be assumed deterministic for replay; the only determinism guarantee is the audit-log linkage to `interpretation_config`.

## 10. Related Documents

- [`docs/subsystems/sources.md`](./sources.md) — Combined source + interpretation lifecycle (canonical for ingest, dedupe, reinterpretation tool, quota, agent attribution)
- [`docs/subsystems/observation_architecture.md`](./observation_architecture.md) — Observation creation, three-layer truth model, reducer
- [`docs/subsystems/timeline_events.md`](./timeline_events.md) — Timeline events derived after interpretation completion
- [`docs/subsystems/entities.md`](./entities.md) — Canonical entity row that observations target
- [`docs/subsystems/entity_snapshots.md`](./entity_snapshots.md) — Reducer output composed from observations created during interpretation
- [`docs/subsystems/schema.md`](./schema.md) — Authoritative DDL for `interpretations`
- [`docs/subsystems/ingestion/ingestion.md`](./ingestion/ingestion.md) — Validation contract and unknown-field routing
- [`docs/subsystems/agent_attribution_integration.md`](./agent_attribution_integration.md) — Agent attribution stamped onto interpretation provenance
- [`docs/architecture/determinism.md`](../architecture/determinism.md) — Determinism doctrine
- [`docs/specs/MCP_SPEC.md`](../specs/MCP_SPEC.md) — `reinterpret`, `delete_source`, and related MCP tools
- `src/services/interpretation.ts` — Implementation of interpretation create / status transitions
