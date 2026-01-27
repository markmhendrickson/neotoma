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
