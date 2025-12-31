# Neotoma Core Philosophy and Principles

## 5.1 Determinism Above All
A given input MUST always produce identical output:
- Same raw_text → same extracted_fields
- Same entity name → same entity_id
- Same date field → same event_id
- Same query + same DB state → same search order
- Same file uploaded twice → same record (deduplicated)
**No randomness. No nondeterminism. No LLM extraction (MVP).**

## 5.2 Explicit User Control
- Neotoma ingests **only what the user explicitly provides**
- No automatic ingestion, no background scanning
- No reading email bodies or cloud drives without user action
- User controls all data entry

## 5.3 Strong Boundaries
The Truth Layer MUST contain **no**:
- Inference or prediction
- Heuristics beyond allowed extraction rules
- Semantic search (MVP constraint)
- LLM-based field extraction (MVP)
- Strategy or execution logic

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
**Only deterministic, rule-based processing.**

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
1. **No LLM extraction** (MVP constraint; rule-based only)
2. **No semantic search** (MVP; structured search only)
3. **No automatic ingestion** (explicit user action required)
4. **No nondeterminism** (no random IDs, no Date.now() in logic)
5. **No schema mutation** (once assigned, schema_type never changes)
6. **No raw_text modification** (immutable after ingestion)
7. **No inferred entities** (only extract what's explicitly present)
8. **No strategy logic** (that's Strategy Layer, e.g., Agentic Portfolio)
9. **No execution logic** (that's Execution Layer, e.g., Agentic Wallet)
10. **No agent behavior** (Neotoma is not an agent)
11. **No predictive features** (no forecasting, no recommendations)
12. **No synthetic data** (no guessing, no hallucination)
13. **No upward layer dependencies** (Domain never calls Application)
14. **No PII in logs** (record IDs only, not extracted fields)
15. **No breaking schema changes** (additive evolution only)
