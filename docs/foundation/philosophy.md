---
title: Neotoma Core Philosophy and Principles
summary: "A given operation MUST always produce the same final state: - Same file uploaded twice → same record (deduplicated via content_hash) - Same source + same interpretation config → same observations (idempotent, no duplicates) - Same entity..."
---

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
The state layer MUST contain **no**:
- Inference or prediction
- Heuristics beyond allowed extraction rules
- Semantic-only retrieval (MVP: structural retrieval primary; entity semantic search allowed as optional path over structured state when text query provided)
- Strategy or execution logic

**Note:** Entity semantic search embeds structured output (entity snapshots), not raw chunks; structure drives what is searchable.

**Note:** AI interpretation for unstructured files is permitted with:
- Config logging (model, temperature, prompt_hash)
- Canonicalization and hashing for idempotence
- No claims of replay determinism

**Permitted substrate behavior (added 2026-05-07):**
- Event emission after writes (reporting state transitions, not deciding on them)
- Webhook/SSE delivery to registered consumers (infrastructure plumbing, not strategy)
- Subscription management (registration of interest, not prioritization of action)

These are substrate primitives (analogous to database triggers, WAL replication, or LISTEN/NOTIFY) and do not constitute strategy or execution logic. Full invariant in §5.9 Signal Without Strategy.

**Inbound vs. outbound disambiguation:** Outbound state-change signals (this section, §5.9) are derived REPORTS of completed writes. They flow OUT of the substrate, do not pass through reducers, and do not themselves cause state changes. Inbound Domain Events (MUST #16) are CAUSES of state changes that flow INTO the substrate from operational layers and are processed by reducers. The two are not the same thing.

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

## 5.8 Composability (State Layer / Operational Layer)
Neotoma is designed as a **composable substrate** that any operational system can build on top of:
- **Read-only boundaries:** Operational layers can read truth but cannot mutate it directly
- **Domain Event → Reducer pattern:** All inbound truth updates flow through reducers processing Domain Events
- **Protocol-based interfaces:** MCP exposes structured, validated access points
- **Clear boundary:** operational layers are architecturally distinct from the state layer; the state layer never decides, infers, or acts
- **Event-driven signaling:** After writes, the substrate emits structured events that consuming layers can subscribe to (see §5.9)

**Two-tier composition:**
- **State Layer (Neotoma):** Processes Domain Events through reducers to update state; emits state-change signals to registered consumers. Stores the artifacts of strategy and execution (plans, decisions, rules, preferences, action logs) as versioned entities.
- **Operational Layers:** Any agent, pipeline, orchestrator, or custom application that reads truth and writes results back as observations. May reason, plan, decide, and execute side effects. Neotoma does not prescribe how operational layers are structured.

**Why Composability:**
- Enables ecosystem building (others can build on Neotoma)
- Creates network effects and platform value
- Distinguishes Neotoma from monolithic systems
- Supports future protocol-first, decentralized evolution

See `composability_analysis.md` for the full analysis and rationale.

## 5.9 Signal Without Strategy
The state layer MAY signal state transitions to registered consumers. It MUST NOT:
- Subscribe to its own signals
- Decide which signals are important
- Take action based on signals
- Filter signals based on strategy-layer logic

**Delivery semantics (best-effort, not guaranteed):**
Signaling is best-effort delivery. The substrate does not promise at-least-once, exactly-once, or in-order delivery. Consumers are responsible for catch-up via state queries (snapshot reads, `list_recent_changes`, `list_observations`). The substrate MUST NOT add: retry queues, dead-letter queues, delivery acknowledgment tracking, ordered delivery guarantees, or exactly-once semantics — those are strategy-layer concerns. If a consumer is unavailable, the substrate logs the delivery failure but does not retry with escalation, does not fall back to alternative actions, and does not alter its own behavior.

**Inbound vs. outbound:** Outbound state-change signals are derived REPORTS of completed writes. They flow OUT of the substrate, do not pass through reducers, and do not themselves cause state changes. Inbound Domain Events (MUST #16) are CAUSES of state changes that flow INTO the substrate from operational layers.

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
15. **State layer boundaries:** No strategy, execution, or inference logic in Neotoma
16. **Event-sourced updates:** All state changes via Domain Events → Reducers
### MUST NOT
1. **No semantic-only retrieval** (structural retrieval remains primary; entity semantic search permitted as supplemental path; set queries, relationship traversal, timelines remain structural)
2. **No automatic ingestion** (explicit user action required)
3. **No replay-deterministic claims for AI interpretation** (auditable but not replay-deterministic; see `docs/architecture/determinism.md`)
4. **No nondeterminism in core components** (no random IDs for entities/events, no Date.now() in entity ID generation)
5. **No schema mutation** (once assigned, schema_type never changes)
6. **No observation modification** (immutable after creation; reinterpretation creates NEW observations)
7. **No inferred entities beyond extraction** (only extract what's present in source)
8. **No strategy or decision logic** (operational concerns live above the state layer; Agentic Portfolio is an example operational system that reasons over state)
9. **No execution or side-effect logic** (operational concerns live above the state layer; Agentic Wallet is an example operational system that performs effects and writes results back as observations)
10. **No agent behavior** (Neotoma is not an agent — it signals state changes to agents but does not itself subscribe to events, reason about them, or take autonomous action; see §5.9)
11. **No predictive features** (no forecasting, no recommendations)
12. **No synthetic data** (no guessing, no hallucination beyond interpretation)
13. **No upward layer dependencies** (Domain never calls Application)
14. **No PII in logs** (record IDs only, not extracted fields)
15. **No breaking schema changes** (additive evolution only)
