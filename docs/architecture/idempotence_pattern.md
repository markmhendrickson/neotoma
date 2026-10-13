# Idempotence Pattern for LLM Interpretation

**Reference:** [`docs/architecture/determinism.md`](./determinism.md) — Section 1.4 on idempotence vs determinism

## Core Principle

**Idempotence is enforced by system design, not by making the LLM deterministic.**

This is a **category error** to expect determinism from an LLM. The LLM is a stochastic proposal engine; determinism is enforced downstream through canonicalization, hashing, and deduplication.

**Key Insight**: The LLM proposes candidates (stochastic). The system enforces acceptance criteria (deterministic). Idempotence emerges post-generation, not during it.

## Design Pattern

The idempotence pattern for LLM interpretation follows these steps:

1. **Constrain Outputs**
   - Strict schemas (JSON Schema/Zod)
   - Enums over free text
   - Required fields only

2. **Deterministic Decoding (Optional Aid)**
   - temperature = 0
   - top_p = 1
   - Fixed prompts
   - Reduces variance; does not guarantee identity

3. **Validate → Reject → Retry**
   - Validate against schema
   - Reject invalid outputs
   - Retry with identical inputs until valid

4. **Canonicalize**
   - Sort keys and arrays
   - Normalize whitespace and line endings
   - Round numbers; normalize dates
   - Strip comments/non-semantic text

5. **Hash and Cache**
   - Hash canonical output (e.g., SHA-256)
   - Use hash for replay, caching, and verification

6. **Commit via Protocol**
   - Check for existing observation with same hash
   - Create observation only if not exists
   - Enforce idempotence at database level

## Fixed-Point Guarantee

Accept output only when canonical hash stabilizes:

- Run interpretation → canonicalize → hash
- If hash differs from previous attempt → retry
- Accept only when `hash(n) == hash(n-1)` (convergence)

Idempotence achieved post-generation.

## Example: Neotoma-Style Data Ingestion

**LLM Behavior (Stochastic)**:

- Two runs might produce:
  - Run 1: `{"date":"2026-01-10","amount":1200,"currency":"EUR"}`
  - Run 2: `{"currency":"EUR","amount":1200.00,"date":"2026-01-10"}`

**System Enforcement (Deterministic)**:

- JSON Schema validation
- Key ordering (sorted keys)
- Numeric normalization (1200.00 → 1200)
- ISO date enforcement
- Result: `{"amount":1200,"currency":"EUR","date":"2026-01-10"}`

**Outcome**: Same input → same canonical output → same hash. Idempotence achieved without touching the model.

## Integration with Neotoma Architecture

### Interpretation Pipeline

The idempotence pattern integrates with Neotoma's interpretation pipeline:

1. **LLM Extraction** (`src/services/llm_extraction.ts`)
   - Stochastic model output
   - Temperature = 0.1 (can be reduced to 0 for variance reduction)

2. **Schema Validation** (`src/services/interpretation.ts`)
   - Validate against `schema_registry`
   - Route unknown fields to `raw_fragments`
   - Only schema-valid fields proceed

3. **Canonicalization** (to be implemented)
   - Normalize strings (trim, lowercase where appropriate)
   - Sort arrays by deterministic key
   - Normalize dates (ISO 8601, timezone handling)
   - Round numbers (consistent precision)

4. **Hash-Based Identity** (to be implemented)
   - Generate observation ID from: `source_id + interpretation_id + entity_id + canonical_fields_hash`
   - Check for existing observation before creating

5. **Deduplication** (to be implemented)
   - If observation with same hash exists → no duplicate created
   - Final state is same regardless of LLM variance

### Database Schema

Observations table already supports:

- `source_id` (links to source)
- `interpretation_id` (links to interpretation run)
- `entity_id` (links to entity)
- `fields` (JSONB with validated fields)

**To add:**

- `canonical_hash` column (computed from canonicalized fields)
- Unique constraint on `(source_id, interpretation_id, entity_id, canonical_hash)`

## Store write completion (`/store`, MCP `store`)

The `sources` row that carries a store's `idempotency_key` is created before any
observation exists, and the write loop after it is not one transaction: it
interleaves reads, snapshot recompute, embedding work and event emission, which
a transaction would hold the database's global write gate across. A recorded key
therefore does not by itself mean the write finished (#2144).

Completion is recorded on the source row in `provenance.store_write`:

- `in_progress` is written by the same insert that creates the row.
- `complete` replaces it only after every entity's observation, and the
  request's relationships, have been written.

Replay rules for a keyed store:

| Recorded state | Replay behaviour |
| --- | --- |
| `complete` | Unchanged: `replayed: true`, `entities_created: 0`, the existing observations, no writes. |
| `in_progress` | Not a replay. The write runs again over the same source. Observation ids are deterministic (source, entity, fields), so entities already written resolve to their existing observation and only the missing ones are added; entities left empty by the interruption get their observation and snapshot. |
| none (row written before the marker) | HTTP `/store` counts the observations on the keyed source against the request's distinct entity payloads and resumes when it is short. MCP `store` replays as before. |

A request that carries an `interpretation` cannot be resumed under the same key
(a fresh interpretation run changes every observation id), so it fails with
`ERR_STORE_WRITE_INCOMPLETE` (409) instead of reporting success.

A committing keyed store is not cancelled by the caller's abort signal once it
starts (`detachDbAbortSignal`), and a second call for the same
`(user, idempotency_key)` in the same process waits for the first to settle, so
a client retrying after its own timeout reads the finished write rather than
racing it. Coordination across processes sharing one database file is not
provided; the deterministic ids turn that race into a UNIQUE conflict error, not
a duplicate.

## Benefits

- **Safe for infrastructure**: Idempotent operations can be retried safely
- **Cacheable**: Same inputs → same outputs → cacheable results
- **Replayable**: Can replay interpretation logs instead of re-running model
- **Model-agnostic**: Works with any LLM provider
- **Verifiable**: Hash-based identity enables verification

## Trade-offs

- **Engineering overhead**: Requires canonicalization, hashing, deduplication logic
- **Reduced creative latitude**: Schema constraints limit model flexibility
- **Schema quality is critical**: Poor schemas cause false convergence or missed valid outputs
- **Latency**: Retry loops and fixed-point checks add latency

## Related Documents

- [`docs/architecture/determinism.md`](./determinism.md) — Determinism doctrine and idempotence distinction
- [`docs/architecture/sources_first_ingestion_final.md`](./sources_first_ingestion_final.md) — Sources-first ingestion architecture
- [`docs/subsystems/ingestion/ingestion.md`](../subsystems/ingestion/ingestion.md) — Ingestion pipeline
- [`docs/foundation/philosophy.md`](../foundation/philosophy.md) — Core philosophy (section 5.1 on idempotence)
