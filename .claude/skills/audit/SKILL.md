---
name: audit
description: audit
---

<!-- Source: .cursor/skills/audit/SKILL.md -->


# audit

## Purpose

Run a comprehensive read-only audit of the user's Neotoma database, surfacing graph-health issues by category and severity. Each finding includes a structured remediation pointing at an existing Neotoma tool — this skill never mutates state.

Neotoma has strong write-path discipline (idempotency, schema-first, immutability, deterministic IDs) but no holistic read-path "is my graph healthy?" tool. `/audit` fills that gap.

## Scope

**In scope:** detection of inconsistencies, drift, and quality issues across entities, observations, relationships, schemas, and raw_fragments.

**Out of scope:** mutation of any kind. Repair is performed by delegating to other tools or skills (`merge_entities`, `correct`, `split_entity`, `delete_entity`, `register_schema`, `update_schema_incremental`). The user opts into each repair individually after reviewing findings.

## Modes

- **`/audit`** — Run all deterministic checks. No LLM cost. Default.
- **`/audit --deep`** — Run deterministic + LLM-assisted checks. Requires an LLM API key (read from `NEOTOMA_AUDIT_LLM_KEY` env var or passed via `--key=…`). Models default to a cheap small model; override with `--model=…`.
- **`/audit --scope=<entity_type|relationship|schema|fragments>`** — Restrict checks to one category.
- **`/audit --since=<ISO date>`** — Restrict to entities/observations created or updated since the date.
- **`/audit --user=<user_id>`** — Audit a specific user's records (defaults to authenticated user).
- **`/audit --dup-min-count=<N>`** — Minimum entity count for a type to be auto-scanned for potential duplicates beyond the always-checked `contact`/`person`/`organization` set (default 100).
- **`/audit --format=<table|json|markdown>`** — Output shape; `table` default for interactive, `json` for piping into repair tooling.

## Prerequisites

- Neotoma MCP server connected (prod by default: `mcpsrv_neotoma`).
- For `--deep`: LLM API key configured (`NEOTOMA_AUDIT_LLM_KEY` or `--key=…`).

## Workflow

### Phase 1 — Plan

1. Parse mode flags.
2. Resolve user scope (`get_session_identity` if no `--user` flag).
3. Print a one-line summary of what will be checked: "Running 15 deterministic checks against user X (≈N entities)". Add "+8 LLM-assisted checks" if `--deep`.

### Phase 2 — Deterministic checks

**Test-fixture filter (applies to all checks):** skip any `entity_type` matching `^(test_type_|test_activate_|cross_layer_schema_)` unless `--include-test-fixtures` is passed. These are integration-test scaffolding, not real registry entries.

Run all of the following. Each check produces zero or more `Finding` records. Each `Finding` has:

```
{
  check_id:        "DUP_TYPE_ALIASES",
  severity:        "high" | "medium" | "low" | "info",
  category:        "entity_type" | "entity" | "observation" | "relationship" | "schema" | "fragments" | "naming",
  entity_ids:      ["ent_..."],         // affected entities
  summary:         "Short human-readable summary",
  detail:          "Longer explanation with counts/examples",
  remediation:     {
    tool:          "merge_entities" | "correct" | "register_schema" | …,
    args_hint:     { ... },              // suggested args; user reviews before applying
    description:   "Merge ent_A into ent_B as the canonical record"
  }
}
```

#### Check list

| ID                          | Category      | What it detects                                                                                                   | Remediation tool                              | Severity |
| --------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------- |
| `DUP_ENTITIES_BY_RESOLVER`  | entity        | Entities flagged by `list_potential_duplicates` (server-side resolver matches).                                   | `merge_entities`                              | high     |
| `DUP_TYPE_ALIASES`          | entity_type   | Two registered entity types whose `aliases` arrays overlap or whose canonical names are synonyms (e.g. `vendor` vs `merchant`). | `register_schema` (alias one to the other)    | medium   |
| `PLURAL_TYPE_NAMES`         | entity_type   | Registered `entity_type` is plural and not in the irregular allowlist (per `schema_agnostic_design_rules.md`).    | `register_schema` (rename to singular + alias) | medium   |
| `ORPHAN_ENTITIES`           | entity        | Entities with no `PART_OF`, `REFERS_TO`, or other inbound/outbound relationships, and no observations after the first one. | `delete_entity` or `merge_entities`           | low      |
| `CYCLE_HIERARCHY`           | relationship  | Cycles in hierarchical relationship types (`PART_OF`, `DEPENDS_ON`) — explicitly forbidden by `relationships.md`. | Manual review + `delete_relationship`         | high     |
| `UNTYPED_OR_INVALID_EDGE`   | relationship  | Relationships whose `relationship_type` is not in the registered enum.                                            | `delete_relationship` + recreate with valid type | high     |
| `ZERO_OBSERVATION_ENTITY`   | entity        | Entities with snapshot but `observation_count == 0` (resolver edge case — should not happen post-bootstrap).      | `delete_entity` after manual verification     | medium   |
| `MISSING_SOURCE_PROVENANCE` | observation   | Observations with null `source_id` AND null `interpretation_id` (provenance broken).                              | None (immutable) — investigate ingestion path | high     |
| `UNKNOWN_FIELDS_COUNT_HIGH` | fragments     | Interpretations with `unknown_fields_count > 0` for an `entity_type` that has a registered schema (means schema is missing declared fields). | `update_schema_incremental` to add fields    | medium   |
| `FRAGMENT_DUMP`             | fragments     | Entities where `raw_fragments` count exceeds the 95th percentile *and* the entity has fewer than N declared snapshot fields (signals unstructured dumping). | `register_schema` to declare common fragment_keys | medium   |
| `FRAGMENT_KEY_HIGH_FREQ`    | fragments     | `fragment_key` values whose `frequency_count` exceeds threshold T for a given `entity_type` — strong promotion candidates. | `update_schema_incremental` to promote field  | info     |
| `NON_READABLE_CANONICAL`    | naming        | `canonical_name` matches a UUID pattern, hex hash, empty string, or pure punctuation/whitespace.                  | `correct` (provide identity-bearing field)    | medium   |
| `MISSING_REQUIRED_FIELD`    | schema        | Entity snapshot missing a field declared `required` on its registered schema.                                     | `correct` to add field                        | high     |
| `RELATIONSHIP_DANGLING`     | relationship  | Relationship references entity_id that does not exist or is soft-deleted (`merged_to_entity_id` set).             | `delete_relationship` or update to canonical target | high     |
| `SCHEMA_NO_CANONICAL_FIELDS`| schema        | Registered schema has empty `canonical_name_fields` — every store of that type creates a new row.                 | `register_schema` to declare canonical fields | high     |
| `INTERPRETATION_HEARTBEAT_STALE` | observation | Interpretation rows with `started_at` set, `completed_at` null, and `heartbeat_at` older than threshold.   | Investigate — possibly stuck interpretation  | medium   |
| `ENV_CONTAMINATION`             | entity        | Entity snapshot fields contain values matching known dev/test/staging environment markers (e.g. `localhost`, `127.0.0.1`, `dev.`, `.local`, `test-`, `-dev`, `-staging`, Kubernetes cluster DNS). Signals records imported from a non-production environment into a production database, or vice versa. | `correct` (update field value) or `delete_entity` | varies   |

#### Implementation notes for each check

- **`DUP_ENTITIES_BY_RESOLVER`** — Always run for the high-cardinality entity types where duplicates accumulate fastest: `contact`, `person`, `organization`. Call `list_potential_duplicates` once per type (passing `entity_type`). When `--scope=entity` or `--scope=entity_type` is not set, also include any other registered type whose entity count exceeds the per-run high-cardinality threshold (default 100; override with `--dup-min-count=N`). Skip types with fewer than 2 entities. For each returned pair, emit one `Finding`: `entity_ids` is `[entity_a.id, entity_b.id]`; `summary` names both `canonical_name` values; `detail` includes `score`, `matched_fields`, and `entity_type`; populate `args_hint` with `{ source_entity_id: entity_b.id, target_entity_id: entity_a.id, strategy: "prefer_more_recent" | "prefer_more_observations" }` (merge the lower-ranked pair member *into* the higher-ranked one — `entity_a` ranks first by score). Severity is `high` when `score >= 0.95`, otherwise `medium`. Detection only — never call `merge_entities` from a check.
- **`DUP_TYPE_ALIASES`** — Call `list_entity_types`; build a graph of (canonical_name → aliases). Edges where two distinct canonical names appear in each other's alias sets, OR where alias arrays intersect, become findings. Levenshtein < 2 on short names emits as `low` severity.
- **`PLURAL_TYPE_NAMES`** — `list_entity_types` and apply the same singularization rule used by `validateSchemaDefinition` (load from `NEOTOMA_ALLOWED_PLURAL_TYPES` env var or fall back to a hardcoded allowlist: `news`, `data`, `analytics`, `status`, `series`, `species`). Extend the in-skill allowlist with confirmed **legacy import artifacts** where the plural name is semantically intentional (one entity representing many items imported in bulk): `reads` (IndieWeb URL export, 2017-2018), `sections` (website section config blob), `songs`, `talking_points`, `crypto_transactions`. Emit these as `info` severity with a note that they are legacy import artifacts, not schema violations — do not co-emit `DUP_TYPE_ALIASES` for them. Validated against the live registry on 2026-05-16: surfaces `places`, `plans`, `reads`, `songs`, `sections`, `crypto_transactions`, `talking_points`, `meeting_notes` (before legacy allowlist). After applying legacy allowlist, actionable findings are `places`, `plans`, `meeting_notes` only. Three of those (`places`/`plans`/`meeting_notes`) also have singular siblings already registered — co-emit `DUP_TYPE_ALIASES` for those, ranked as the highest-priority repair candidates since rows are split across both types.
- **`ORPHAN_ENTITIES`** — `retrieve_entities` per entity_type; for each entity, `list_relationships` with the entity as source or target. Empty → orphan.
- **`CYCLE_HIERARCHY`** — `list_relationships` filtered by `PART_OF`/`DEPENDS_ON`; DFS cycle detection over the directed graph.
- **`UNTYPED_OR_INVALID_EDGE`** — `list_relationships`; compare each `relationship_type` against the enum from the relationship schema (`PART_OF`, `CORRECTS`, `REFERS_TO`, `SETTLES`, `DUPLICATE_OF`, `DEPENDS_ON`, `SUPERSEDES`, `EMBEDS`, plus domain-specific types from registry).
- **`ZERO_OBSERVATION_ENTITY`** — `retrieve_entity_snapshot`; check `observation_count == 0`.
- **`MISSING_SOURCE_PROVENANCE`** — `list_observations` per entity (or sample); flag rows where both `source_id` and `interpretation_id` are null. Note: immutable — finding is informational unless ingestion is still actively producing them.
- **`UNKNOWN_FIELDS_COUNT_HIGH`** — Aggregate `unknown_fields_count` from `interpretations` table per `entity_type`. Anything > 0 for a type with a registered schema is a finding; bucket by `fragment_key` frequency.
- **`FRAGMENT_DUMP`** — Compute per-entity_type fragment counts (`raw_fragments` joined to observations). Compare each entity to the per-type 95th percentile. High count + low snapshot density = finding.
- **`FRAGMENT_KEY_HIGH_FREQ`** — Group raw_fragments by `(entity_type, fragment_key)`, sum `frequency_count`. Threshold defaults: keys appearing on >25% of entities of that type.
- **`NON_READABLE_CANONICAL`** — Regex against `canonical_name`: UUID (`^[0-9a-f]{8}-…`), hex (`^[0-9a-f]{16,}$`), empty, whitespace-only, single-character.
- **`MISSING_REQUIRED_FIELD`** — Load schema definitions via `list_entity_types`; for each entity, diff snapshot keys against `required_fields`.
- **`RELATIONSHIP_DANGLING`** — `list_relationships`; for each row, verify `source_entity_id` and `target_entity_id` resolve via `retrieve_entity_snapshot` and are not soft-deleted.
- **`SCHEMA_NO_CANONICAL_FIELDS`** — `list_entity_types`; flag any with empty `canonical_name_fields`.
- **`INTERPRETATION_HEARTBEAT_STALE`** — Query interpretation rows; threshold defaults to 15 minutes.
- **`ENV_CONTAMINATION`** — For each entity, call `retrieve_entity_snapshot` and pass the resulting field map to `scanSnapshotForContamination()` (implemented in `src/services/env_contamination_audit.ts`). The function tests every string-valued field against `ENV_CONTAMINATION_INDICATORS` (loopback IPs, `localhost`, Kubernetes cluster-internal DNS, `.local` mDNS, `dev.`/`staging.` sub-domains, `test_user`/`test-user` patterns, `test-` prefixes, `-dev`/`-staging` suffixes, nil UUID, Docker private IP ranges). Structural metadata fields (`entity_id`, `created_at`, `updated_at`, `observation_count`, `user_id`, `_migration_run_id`) are skipped to avoid false positives. The severity of each finding is the highest severity among matched indicators (`high` > `medium` > `low`). For efficiency, sample up to the 500 most recently updated entities per audit run unless `--scope=entity` is active. Populate `entity_ids` with the IDs of flagged entities and `detail` with per-entity summaries of the matched fields and indicators. `args_hint` for the remediation: `{ entity_id, fields_to_correct: ["<field>", ...] }`.

### Phase 3 — LLM-assisted checks (only when `--deep`)

Run these only if the API key is present. Each check batches entities and asks the LLM for structured JSON output. Key never leaves the local process.

| ID                            | What it detects                                                                                                                       | Remediation tool                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `LLM_CANONICAL_READABILITY`   | `canonical_name` is technically valid (passes deterministic regex) but not human-readable (e.g., `payment-3-2`, `unnamed-vendor-7`).   | `correct` with suggested name                 |
| `LLM_ENTITY_TYPE_MISCLASS`    | Content semantically a `transaction` but stored as `note`/`message`/`raw`. LLM compares snapshot+observations to type registry. | `correct` with `entity_type` change           |
| `LLM_SEMANTICALLY_EQUIVALENT_TYPES` | Two entity_types not alias-linked but semantically equivalent (`vendor` vs `merchant` vs `payee`).                              | `register_schema` (alias)                     |
| `LLM_FRAGMENT_PROMOTION`      | Raw fragments that are stable, structured, and high-value enough to promote to declared schema fields.                                | `update_schema_incremental` with suggested field shape |
| `LLM_RELATIONSHIP_SUGGESTION` | Pairs of entities whose observation text strongly implies a relationship that isn't declared.                                         | `create_relationship` with suggested type     |
| `LLM_DUPLICATE_BY_CONTENT`    | Entities that escaped resolver-based duplicate detection but have semantically equivalent content (different spellings, abbreviations). | `merge_entities`                              |

### Phase 4 — Report

Output sections, in this order:

1. **Summary line** — counts by severity: `Found 47 issues (3 high, 12 medium, 32 low/info)`.
2. **Potential duplicates** — a dedicated section for all `DUP_ENTITIES_BY_RESOLVER` findings, broken out from the generic severity lists because duplicate accumulation is the most common silent graph-health failure. Group by `entity_type`; within each type list the candidate pairs ranked by `score` (truncate to 10 with `(+N more)` unless `--verbose`). Each row shows both `canonical_name` values, the `score`, the `matched_fields`, and the merge hint. End the section with the always-checked types that returned zero candidates so the operator sees the check ran (`contact: no candidates`). If no pairs were found across any type, print `Potential duplicates: none detected`. Remediation is `merge_entities` only — emit the hint, never merge.
3. **High-severity findings** — list each remaining (non-duplicate) high finding with `check_id`, summary, affected entity ids (truncated to 5 with `(+N more)`), and remediation one-liner.
4. **Medium-severity findings** — same format, collapsed by default in interactive mode.
5. **Low/info findings** — collapsed group; show count only unless `--verbose`.
6. **Repair menu** — numbered list of remediation actions the user can authorize: `1. Merge 7 duplicate pairs (merge_entities)`, `2. Rename 2 plural entity types (register_schema)`, etc. The user picks individually; no batch auto-apply.

### Phase 5 — Repair (delegated, opt-in)

For each remediation the user authorizes:

1. Look up the target tool from the finding's `remediation.tool`.
2. Print the exact tool call that will be made, with `args_hint` filled in.
3. Wait for explicit confirmation per finding (or `--yes` to apply all of one category).
4. Invoke the tool. Record the result alongside the finding.
5. After repair, re-run the affected check class to verify the issue is resolved.

**Never auto-apply.** Repair is always per-finding (or per-category with `--yes`), never per-audit-run.

## Constraints

- MUST NOT mutate any Neotoma state in detection phases.
- MUST emit a `Finding` for every issue surfaced; no silent skips.
- MUST include a `remediation.tool` pointing at an existing Neotoma tool (or `null` with rationale if no automated repair is possible).
- MUST NOT call LLM checks unless `--deep` and a key is present.
- MUST batch LLM calls and cap total LLM cost; print an estimate before running deep mode and require confirmation if estimate exceeds `$NEOTOMA_AUDIT_COST_CAP` (default $1).
- MUST respect `--user` scope and refuse to audit other users' data without explicit authorization (`get_session_identity`).
- MUST run deterministic checks before LLM checks; LLM checks may consume deterministic findings as input but never vice versa.
- MUST store the audit run itself as a Neotoma entity (`entity_type: audit_run`, with `findings_count`, `started_at`, `completed_at`, `mode`, `scope`) for historical comparison.

## Forbidden patterns

- Calling `merge_entities`, `correct`, `delete_entity`, etc., without explicit user confirmation per finding.
- Inferring entity types or relationships from deterministic checks (those are LLM-mode only).
- Failing silently on tool errors — surface every error as an `info` finding with the tool response.
- Storing LLM API keys in Neotoma or logs.
- Generating findings from heuristics not declared in this skill (no ad-hoc checks).

## Output examples

### Default `/audit` (deterministic only)

```
Auditing Neotoma database for user mark (≈8,420 entities)
Running 15 deterministic checks…

Summary: 47 findings (3 high, 12 medium, 32 low/info)

Potential duplicates (DUP_ENTITIES_BY_RESOLVER) — 7 candidate pairs
  contact (5 pairs)
    "Jane Doe" ↔ "Jane R. Doe"          score 0.97  [canonical_name, email]
      → merge_entities(source=ent_bbb…, target=ent_aaa…, strategy=prefer_more_observations)
    "Acme, Inc." ↔ "Acme Inc"           score 0.93  [canonical_name]
      → merge_entities(source=ent_ddd…, target=ent_ccc…, strategy=prefer_more_recent)
    … (+3 more, run --verbose)
  organization (2 pairs)
    "Vercel" ↔ "Vercel Inc."            score 0.91  [canonical_name]
      → merge_entities(source=ent_fff…, target=ent_eee…, strategy=prefer_more_recent)
  person: no candidates

HIGH (2)
  [CYCLE_HIERARCHY] 1 cycle detected in PART_OF graph
    → ent_ccc → ent_ddd → ent_eee → ent_ccc
    → Remediation: manual review + delete_relationship

  [SCHEMA_NO_CANONICAL_FIELDS] entity_type "note" has no canonical_name_fields
    → Every store creates a new row; deduplication impossible
    → Remediation: register_schema with canonical fields

MEDIUM (12) — collapsed, run with --verbose

LOW/INFO (32) — collapsed, run with --verbose

Repair menu:
  1. Merge 7 potential duplicate pairs (merge_entities, review each)  [y/n]
  2. Resolve cycle in PART_OF graph (manual)               [skip]
  3. Add canonical_name_fields to "note" schema            [y/n]
  Run --verbose for medium/low remediations.
```

### `/audit --deep --scope=naming`

```
Auditing naming category only (deep mode, model gpt-4o-mini)
Estimated LLM cost: $0.18 — proceed? [y]

Running 1 deterministic check (NON_READABLE_CANONICAL)…
Running 1 LLM check (LLM_CANONICAL_READABILITY)…

Summary: 23 findings (0 high, 18 medium, 5 info)

MEDIUM (18)
  [NON_READABLE_CANONICAL]   12 entities with UUID-shaped canonical_name
  [LLM_CANONICAL_READABILITY] 6 entities with technically-valid but unreadable names
    → ent_fff "payment-3-2" → suggested "Acme Corp - Invoice #3 - Feb 2026"
    → ent_ggg "vendor-unnamed-7" → suggested "Cloudflare"
    → … (4 more)
    → Remediation: correct (with LLM-suggested names)

Repair menu:
  1. Apply 12 deterministic name corrections (correct, manual)   [y/n]
  2. Apply 6 LLM-suggested name corrections (correct, review each) [y/n]
```

## Related

- `docs/foundation/schema_agnostic_design_rules.md` — singular type names, schema-driven behavior.
- `docs/subsystems/observation_architecture.md` — raw_fragments lifecycle.
- `docs/subsystems/relationships.md` — typed edges, cycle prohibition.
- `docs/subsystems/schema.md` — `raw_fragments`, `interpretations` schema.
- `docs/subsystems/entity_merge.md` — merge semantics.
- `docs/foundation/entity_resolution.md` — resolver path and identity rules.

## Promotion path

This skill is the prototype shape. Once the check set stabilizes (≥2 weeks of use, deterministic checks ratified) promote to a first-class CLI command:

- `neotoma audit [--deep] [--scope=…] [--since=…] [--format=…]`
- OpenAPI contract update per `docs/architecture/openapi_contract_flow.md`.
- MCP tool exposure for cross-harness use.
- Feature unit under `docs/feature_units/in_progress/FU-…audit/`.
