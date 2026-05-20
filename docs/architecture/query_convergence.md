# Query Convergence — Reducing Query Formulation Nondeterminism

**Reference:** [`docs/architecture/determinism.md`](./determinism.md) — Section 11.3 on query formulation stochasticity

## Scope

This document covers:
- Query formulation stochasticity and why it differs from write-path nondeterminism
- Architectural improvements that narrow query formulation variance
- Prioritized improvement roadmap with effort estimates
- Integration with write-path convergence improvements

This document does NOT cover:
- Write-path nondeterminism (see [`bounded_convergence.md`](./bounded_convergence.md))
- Interpretation-layer idempotence (see [`idempotence_pattern.md`](./idempotence_pattern.md))
- Retrieval mechanism determinism (see [`determinism.md`](./determinism.md) Section 11.2 — retrieval is already fully deterministic)

## 1. The Query Formulation Problem

Neotoma's retrieval mechanism is deterministic: same query + same DB state → same results, same order. But agents construct queries stochastically — choosing which MCP tool to call, which entity type to filter by, which fields to include, and how to structure parameters.

The same user question may produce different agent queries:

- Different tool selection (`retrieve_entities` vs `retrieve_entity_by_identifier` vs `list_timeline_events`)
- Different entity type targeting (`task` vs `todo` vs `action_item`)
- Different filter parameters (field-level filter vs text search vs no filter)
- Different scope (broad retrieval vs narrow identifier lookup)

Unlike vector retrieval, these failures are:
- **Discrete** — the agent picks from a finite set of tools and parameters
- **Detectable** — wrong queries return zero results, errors, or visibly wrong data
- **Schema-bounded** — MCP tool definitions constrain valid parameter combinations

But they still produce variance. This document defines improvements to narrow that variance.

## 2. Query Convergence Improvements

### 2.1 Query-Time Entity Type Normalization

**Impact: High | Effort: Low**

**Problem:** Write-path entity type normalization (bounded_convergence.md 2.2) ensures stored entities use canonical types. But if the agent queries using a non-canonical type alias, the query misses results stored under the canonical type.

**Solution:** Apply the same entity type alias resolution on the read path. When a retrieval request includes a non-canonical entity type, normalize to the canonical type before executing the query.

**Behavior:**
- On retrieval, if `entity_type` matches an alias in the schema registry, rewrite to canonical type
- Execute the query against the canonical type
- Include the normalization in the response metadata: `"normalized_from": "purchase"` → `"entity_type": "transaction"`
- The agent learns the canonical type for future queries

**Integration points:**
- `src/server.ts` — retrieval endpoint entity_type normalization
- `src/services/schema_registry.ts` — alias lookup (shared with write-path normalization)
- MCP response metadata — `normalized_from` field

**Dependency:** Requires write-path entity type normalization (2.2 in bounded_convergence.md) to be implemented first, since both share the alias registry.

### 2.2 Query Parameter Validation

**Impact: Medium | Effort: Low**

**Problem:** Agents may query with field names that don't exist in the schema, or use filter operators incorrectly. These produce zero results with no explanation, leaving the agent without guidance to self-correct.

**Solution:** Before executing a retrieval query, validate parameters against the schema registry. If invalid parameters are detected, return the results (possibly empty) alongside validation diagnostics.

**Behavior:**
- On retrieval, validate `entity_type` exists (or resolves via alias)
- Validate filter field names against the entity type schema
- If a filter field doesn't exist, include a diagnostic: `"unknown_field": "full_name"`, `"suggestion": "name"`
- If the entity type doesn't exist, include: `"unknown_type": "purchase"`, `"suggestion": "transaction"`
- Validation never blocks the query — diagnostics are advisory

**Integration points:**
- `src/server.ts` — pre-query validation pass
- `src/services/schema_registry.ts` — field name lookup, field alias resolution
- MCP response — `query_diagnostics` field

### 2.3 Retrieval Templates

**Impact: Medium | Effort: Low**

**Problem:** The agent constructs retrieval queries from its understanding of the schema, which may be incomplete or stale. The write path has structured action templates (bounded_convergence.md 2.6); the read path has no equivalent.

**Solution:** Expose a `get_retrieval_template(entity_type)` MCP action that returns the queryable schema for an entity type — field names, types, valid filter operators, available relationship types.

**Behavior:**
- New MCP action: `get_retrieval_template(entity_type)` returns:
  - All queryable fields with types and descriptions
  - Valid filter operators per field (`equals`, `contains`, `greater_than`, `less_than`)
  - Available relationship types for traversal
  - Example queries for the entity type
- Agent can call this before constructing a retrieval query to constrain its formulation
- Templates are auto-generated from the schema registry
- Complements write-path `get_store_template` (bounded_convergence.md 2.6)

**Integration points:**
- `src/server.ts` — new retrieval template endpoint
- `src/services/schema_registry.ts` — template generation (extend write template logic)
- MCP action catalog — new `get_retrieval_template` action

### 2.4 Query Result Diagnostics

**Impact: High | Effort: Moderate**

**Problem:** When a query returns zero results, the agent has no signal about whether: (a) no matching data exists, (b) the query was malformed, or (c) the data exists under a different type or field name. The agent may abandon retrieval or retry blindly.

**Solution:** When a query returns zero or suspiciously few results, the system runs diagnostic checks and includes suggestions in the response.

**Diagnostic checks:**
- **Type mismatch:** "0 results for type 'purchase'; 12 entities exist under canonical type 'transaction'"
- **Field mismatch:** "Filter on 'full_name' matched nothing; field 'name' has 8 matches"
- **Near-miss identifier:** "No exact match for 'Sarah'; 2 entities match partial: 'Sarah Chen', 'Sarah B.'"
- **Scope suggestion:** "0 results with current filters; 5 results without the 'status' filter"

**Behavior:**
- Diagnostics trigger when result count is 0 or below an entity-type-specific threshold
- Diagnostics are bounded (max 3 suggestions per query) to avoid noise
- Returned in a `query_diagnostics` array in the retrieval response
- Agent can reformulate the query in the same turn based on suggestions

**Integration points:**
- `src/server.ts` — post-query diagnostic pass
- `src/services/schema_registry.ts` — alias and field lookups for suggestions
- MCP response schema — `query_diagnostics` field (shared format with store diagnostics)

### 2.5 Query Replay and Variance Testing

**Impact: Medium | Effort: Moderate**

**Problem:** There is no way to measure query formulation variance separately from write-path variance. Without measurement, query-side improvements cannot be prioritized or quantified.

**Solution:** Extend the convergence replay harness (bounded_convergence.md 2.7) to measure query formulation divergence across N replays of the same retrieval intent.

**Metrics:**
- **Tool selection variance:** Do runs use the same MCP action for the same retrieval intent?
- **Entity type variance:** Do runs query the same entity type?
- **Parameter variance:** Do runs use the same filter fields and values?
- **Result set equivalence:** Despite different formulations, do runs retrieve the same entity set?
- **Missed retrieval rate:** How often does a run skip retrieval entirely when it should have retrieved?

**Behavior:**
- Replay harness sends identical user messages with retrieval intent N times
- Log every MCP retrieval action call with full parameters
- After all runs, compute formulation divergence metrics
- Report convergence score: % of runs that retrieved equivalent result sets

**Integration points:**
- `scripts/convergence_replay.ts` — extend with query-side metrics (builds on bounded_convergence.md 2.7)
- MCP action logging — capture retrieval calls alongside store calls
- New report section: query convergence scores alongside write convergence scores

**Dependency:** Builds on the convergence replay harness from bounded_convergence.md 2.7.

### 2.6 Natural Language Query Decomposition

**Impact: Medium | Effort: Higher**

**Problem:** When a user asks "what tasks did I assign to Sarah last month?", the agent must decompose this into: retrieve entities of type `task`, filter by relationship to entity `Sarah`, filter by date range. This decomposition is entirely stochastic — the agent may query differently each time.

**Solution:** A structured query decomposition layer that parses natural language retrieval intent into a canonical query plan before execution.

**Behavior:**
- Agent calls `decompose_query(natural_language)` which returns a structured query plan:
  ```
  {
    "entity_type": "task",
    "filters": [{"field": "assigned_to", "op": "equals", "value": "Sarah"}],
    "date_range": {"field": "created_at", "start": "2026-04-01", "end": "2026-04-30"},
    "relationships": [{"type": "REFERS_TO", "target_type": "contact", "target_name": "Sarah"}]
  }
  ```
- Agent reviews and optionally adjusts the plan before execution
- The decomposition is deterministic for the same input (rule-based, not LLM-based)
- Falls back to the agent's own formulation when the decomposer cannot parse the intent

**Integration points:**
- New service: `src/services/query_decomposer.ts`
- New MCP action: `decompose_query`
- Schema registry — entity type and field metadata for decomposition rules
- Query plan schema — structured representation of retrieval intent

**Note:** This is the highest-effort improvement and may not be warranted until query variance data from 2.5 demonstrates the need.

## 3. Implementation Roadmap

### Phase 1 — Symmetric with write-path normalization (low effort)

| Improvement | Effort | Impact | Dependencies |
|-------------|--------|--------|--------------|
| 2.1 Query-time entity type normalization | Low | High | Write-path type normalization (BC 2.2) |
| 2.2 Query parameter validation | Low | Medium | Schema registry field metadata |
| 2.3 Retrieval templates | Low | Medium | Schema registry template generation (BC 2.6) |

These mirror write-path Phase 1 improvements and share implementation infrastructure.

### Phase 2 — Feedback and measurement (moderate effort)

| Improvement | Effort | Impact | Dependencies |
|-------------|--------|--------|--------------|
| 2.4 Query result diagnostics | Moderate | High | Schema registry aliases, field lookups |
| 2.5 Query replay and variance testing | Moderate | Medium | Convergence replay harness (BC 2.7) |

These provide measurement and agent-facing feedback for query formulation.

### Phase 3 — Structural decomposition (higher effort, data-dependent)

| Improvement | Effort | Impact | Dependencies |
|-------------|--------|--------|--------------|
| 2.6 Natural language query decomposition | Higher | Medium | Schema metadata, query plan schema |

Warranted only if Phase 2 measurement shows significant query formulation variance.

## 4. Design Principles

1. **Symmetric with write-path convergence.** Where possible, query-side improvements mirror write-side improvements. Entity type normalization, field aliases, templates, and diagnostics work the same way on both paths. This reduces implementation cost and cognitive overhead.

2. **Normalization on read mirrors normalization on write.** If `purchase` normalizes to `transaction` on store, it must also normalize on retrieval. Asymmetric normalization creates unreachable data.

3. **Diagnostics are advisory, not blocking.** Query diagnostics never prevent a query from executing. They augment the response with suggestions for the agent to self-correct.

4. **Measure before decomposing.** Natural language query decomposition (2.6) is high-effort. Query replay testing (2.5) should run first to determine whether query formulation variance is a significant source of retrieval failure in practice.

5. **Prefer schema-driven solutions.** All improvements derive their behavior from the schema registry. No hardcoded entity types, field names, or query patterns.

## 5. Relationship to Write-Path Convergence

Query convergence and write-path convergence ([`bounded_convergence.md`](./bounded_convergence.md)) are complementary:

| Aspect | Write-path convergence | Query convergence |
|--------|------------------------|-------------------|
| **Target** | What the agent stores | What the agent retrieves |
| **Nondeterminism source** | Agent tool selection, LLM extraction | Agent tool selection, query formulation |
| **Normalization** | Entity types, field names at write time | Entity types, field names at query time |
| **Templates** | `get_store_template` | `get_retrieval_template` |
| **Diagnostics** | Post-store convergence feedback | Post-query result feedback |
| **Testing** | Write convergence replay | Query convergence replay |

Write-path improvements reduce the variance of what enters the graph. Query improvements reduce the variance of what the agent asks for. Both narrow the overall nondeterminism in the agent-memory interaction.

**Implementation dependency:** Query-side normalization (2.1) depends on write-side normalization (BC 2.2) being implemented first, since both share the entity type alias registry. Query replay testing (2.5) extends the write-side convergence replay harness (BC 2.7).

## Agent Instructions

### When to Load This Document

Load `docs/architecture/query_convergence.md` when:
- Designing or implementing query-side convergence improvements
- Evaluating retrieval failures caused by query formulation variance
- Implementing MCP retrieval action enhancements
- Extending the convergence replay harness for query metrics
- Working on natural language query decomposition

### Required Co-Loaded Documents
- [`docs/architecture/determinism.md`](./determinism.md) — Determinism doctrine (Section 11)
- [`docs/architecture/bounded_convergence.md`](./bounded_convergence.md) — Write-path convergence improvements
- [`docs/subsystems/schema_registry.md`](../subsystems/schema_registry.md) — Schema registry patterns
- [`docs/specs/MCP_SPEC.md`](../specs/MCP_SPEC.md) — MCP action catalog

### Constraints Agents Must Enforce

1. **Normalize symmetrically** — if a type normalizes on write, it must normalize on read
2. **Diagnostics are advisory** — never block a query on validation feedback
3. **Schema-driven** — all normalization, validation, and templates derive from the schema registry
4. **Measure before building** — query replay testing should precede complex improvements like decomposition
5. **Preserve determinism** — query-side improvements must not introduce nondeterminism into the retrieval mechanism

### Related Documents
- [`docs/architecture/determinism.md`](./determinism.md) — Determinism requirements (Section 11)
- [`docs/architecture/bounded_convergence.md`](./bounded_convergence.md) — Write-path convergence
- [`docs/architecture/idempotence_pattern.md`](./idempotence_pattern.md) — Idempotence pattern
- [`docs/subsystems/schema_registry.md`](../subsystems/schema_registry.md) — Schema registry
- [`docs/specs/MCP_SPEC.md`](../specs/MCP_SPEC.md) — MCP action catalog
