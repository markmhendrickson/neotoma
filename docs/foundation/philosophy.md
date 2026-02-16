# Neotoma Core Philosophy and Principles

## 5.1 Idempotence Above All (System-Level Determinism)

A given operation MUST always produce the same final state:
- Same file uploaded twice → same record (deduplicated via content_hash)
- Same source + same interpretation config → same observations (idempotent, no duplicates)
- Same entity name → same entity_id (hash-based, deterministic)
- Same observations + same merge rules → same snapshot (deterministic reducer)
- Same query + same DB state → same search order

**System-Level Guarantees:**
- **Deterministic components**: Content hashing, deduplication, reducer computation, entity ID generation (must be byte-for-byte deterministic)
- **Idempotent operations**: LLM interpretation (model is stochastic, but system enforces idempotence through canonicalization, hashing, and deduplication)

**No randomness in deterministic components. No duplicate observations from idempotent operations.**

## 5.2 Explicit User Control
- Neotoma ingests **only what the user explicitly provides**
- No automatic ingestion, no background scanning
- No reading email bodies or cloud drives without user action
- User controls all data entry

## 5.3 Strong Boundaries
The Truth Layer MUST contain **no**:
- Inference or prediction
- Heuristics beyond allowed extraction rules
- Semantic-only retrieval (MVP: structural retrieval primary; entity semantic search allowed as optional path over structured state when text query provided)
- Strategy or execution logic

**Note:** Entity semantic search embeds structured output (entity snapshots), not raw chunks; structure drives what is searchable.

**Note:** AI interpretation for unstructured files is permitted with:
- Config logging (model, temperature, prompt_hash)
- Canonicalization and hashing for idempotence
- No claims of replay determinism

## 5.4 Truth is Immutable
Once stored, these MUST NOT change:
- `raw_text` (original extracted text)
- `schema_type` (assigned document type)
- `extracted_fields` (deterministic output)
- Entity IDs (hash-based, stable)
- Event timestamps (from source fields)
Metadata (`created_at`, `updated_at`) is mutable for auditing.

## 5.5 Schema-First Processing
All extraction, linking, and event creation derive from:
**schema_type → extraction rules → extracted_fields → entities + events**

## 5.6 No Synthetic Data
Neotoma never:
- Guesses missing information
- Infers relationships beyond explicit extraction
- Predicts future states
- Hallucinates data

**Processing approach:** AI interpretation is used for unstructured data extraction with audit trail and idempotence guarantees. The LLM extracts fields present in the source document but does not synthesize or infer data.

## 5.7 Full Explainability
Every output MUST trace to:
- Source file (provenance)
- Extraction rule (which regex/parser)
- Source field (for events: which date field?)
- Entity derivation (which text → which normalized value → which hash)
**Nothing is hidden or magical.**

## Architectural Invariants (MUST/MUST NOT)
### MUST
1. **Determinism:** Same input → same output, always
2. **Immutability:** Once stored, truth never changes (except metadata)
3. **Provenance:** All records trace to source file + timestamp + user
4. **Schema-first:** All extraction derives from schema type
5. **Entity IDs:** Hash-based, globally unique, deterministic
6. **Event IDs:** Hash-based, deterministic from record + field + date
7. **Graph integrity:** No orphan nodes, no cycles, typed edges only
8. **Transactional writes:** All graph inserts in single transaction
9. **User isolation:** RLS enforced (future: per-user data access)
10. **MCP-only mutations:** All writes via validated MCP actions
11. **Strong consistency:** Core records, entities, events immediately visible
12. **Explainability:** Every output traces to input + rule
13. **Privacy:** No PII in logs, RLS for data protection
14. **Explicit control:** User approves all ingestion
15. **Truth Layer boundaries:** No strategy or execution logic
16. **Event-sourced updates:** All state changes via Domain Events → Reducers
17. **Pure Strategy:** Strategy Layer has no side effects
18. **Pure Execution:** Execution Layer emits Domain Events, never writes truth directly
### MUST NOT
1. **No semantic-only retrieval** (structural retrieval remains primary; entity semantic search permitted as supplemental path; set queries, relationship traversal, timelines remain structural)
2. **No automatic ingestion** (explicit user action required)
3. **No replay-deterministic claims for AI interpretation** (auditable but not replay-deterministic; see `docs/architecture/determinism.md`)
4. **No nondeterminism in core components** (no random IDs for entities/events, no Date.now() in entity ID generation)
5. **No schema mutation** (once assigned, schema_type never changes)
6. **No observation modification** (immutable after creation; reinterpretation creates NEW observations)
7. **No inferred entities beyond extraction** (only extract what's present in source)
8. **No strategy logic** (that's Strategy Layer, e.g., Agentic Portfolio)
9. **No execution logic** (that's Execution Layer, e.g., Agentic Wallet)
10. **No agent behavior** (Neotoma is not an agent)
11. **No predictive features** (no forecasting, no recommendations)
12. **No synthetic data** (no guessing, no hallucination beyond interpretation)
13. **No upward layer dependencies** (Domain never calls Application)
14. **No PII in logs** (record IDs only, not extracted fields)
15. **No breaking schema changes** (additive evolution only)
