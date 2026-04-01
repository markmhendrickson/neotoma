# Bounded Convergence — Reducing Agent-Layer Nondeterminism

**Reference:** [`docs/architecture/determinism.md`](./determinism.md) — Section 1.6 on agent-layer nondeterminism

## Scope

This document covers:
- The bounded convergence property and why it matters
- Architectural improvements that narrow agent-layer variance
- Prioritized improvement roadmap with effort estimates
- Integration points with existing subsystems

This document does NOT cover:
- Interpretation-layer idempotence (see [`idempotence_pattern.md`](./idempotence_pattern.md))
- Reducer determinism (see [`determinism.md`](./determinism.md) Section 3.5)
- Schema registry internals (see [`../subsystems/schema_registry.md`](../subsystems/schema_registry.md))

## 1. The Convergence Problem

Neotoma's determinism guarantee applies to the data layer: same observations + same merge rules → same snapshot. But observations are created by agents (LLMs) whose tool-selection behavior is stochastic. The same user utterance may produce:

- Different entity types (`purchase` vs `transaction`)
- Different field sets (`{name: "Sarah"}` vs `{full_name: "Sarah Chen"}`)
- Different relationship structures (REFERS_TO created or skipped)
- Different entity counts (3 entities extracted or 5)

Each divergent decision creates observations that the deterministic core faithfully processes — producing different entity graphs from the same semantic input.

**Bounded convergence** is the property that, despite agent-layer nondeterminism, the entity graph converges toward a consistent representation of reality over time. The deterministic core ensures this convergence is monotonic: new observations refine truth; they never corrupt it.

## 2. Convergence Improvements

### 2.1 Write-Time Entity Suggestion

**Impact: High | Effort: Moderate**

**Problem:** When an agent stores a new entity, it may create a duplicate because it didn't retrieve (or didn't find) an existing match.

**Solution:** When `store_structured` receives a new entity, the MCP server performs a fuzzy match against existing entities of the same type before committing. If high-confidence matches exist, the response includes them as candidates.

**Behavior:**
- On store, compute similarity between incoming entity and existing entities of the same `entity_type`
- Use `canonical_name` normalization + Levenshtein distance or token overlap
- If similarity exceeds threshold (e.g., 0.85), include candidates in the store response under a `similar_entities` field
- The agent can then choose to link (create relationship) or merge rather than duplicate
- The system never auto-merges — it surfaces candidates for the agent or user to act on

**Integration points:**
- `src/server.ts` — store endpoint response shape
- `src/services/entity_resolution.ts` — similarity computation
- MCP response schema — new `similar_entities` field

### 2.2 Entity Type Normalization via Taxonomy

**Impact: High | Effort: Low**

**Problem:** Agents may use variant entity type names for the same concept: `purchase`, `transaction`, `payment`, `expense`. Each becomes a separate entity type with its own schema.

**Solution:** The schema registry maintains an alias mapping. When an agent stores with an aliased type, the system normalizes to the canonical type before processing.

**Behavior:**
- Schema registry defines `aliases` per entity type (e.g., `transaction` has aliases `["purchase", "payment", "expense"]`)
- On store, if `entity_type` matches an alias, rewrite to canonical type
- Log the normalization in the interpretation audit trail
- Return the canonical type in the response so the agent learns the preference

**Integration points:**
- `src/services/schema_registry.ts` — alias lookup table
- `src/actions.ts` — normalize entity_type before schema validation
- Schema definitions — new `aliases` field per entity type

### 2.3 Field Alias Mapping in Schemas

**Impact: Medium | Effort: Low**

**Problem:** Agents may use variant field names for the same property: `name` vs `full_name`, `amount` vs `total`, `date` vs `event_date`.

**Solution:** Schema field definitions include an `aliases` array. During observation creation, aliased field names are rewritten to the canonical field name.

**Behavior:**
- Each field in the schema registry can declare aliases: `{ name: "full_name", aliases: ["name", "display_name"] }`
- On observation creation, if a field name matches an alias, rewrite to canonical name
- Unknown fields still route to `raw_fragments` as before
- Aliased and canonical field values produce the same observation hash after canonicalization

**Integration points:**
- `src/services/schema_registry.ts` — field alias lookup
- `src/services/interpretation.ts` — field name normalization during observation creation
- Schema definitions — new `aliases` property per field

### 2.4 Retrieval-Augmented Storing

**Impact: High | Effort: Low**

**Problem:** Agent instructions say "retrieve before storing" but compliance is probabilistic. When the agent skips retrieval, it's more likely to create duplicates or misname entities.

**Solution:** When `store_structured` receives entities, the MCP server automatically performs a bounded retrieval for related existing entities and includes them in the response context.

**Behavior:**
- On store, for each entity in the request, query existing entities of the same type with similar `canonical_name`
- Include up to N (e.g., 5) related existing entities in the response under `context_entities`
- This augments the agent's context for the next turn without requiring the agent to explicitly retrieve
- No behavior change if no matches exist

**Integration points:**
- `src/server.ts` — post-store retrieval pass
- MCP response schema — new `context_entities` field
- Performance: bounded to top-N matches per stored entity to avoid latency

### 2.5 Post-Store Convergence Diagnostics

**Impact: Medium | Effort: Moderate**

**Problem:** The agent has no feedback on whether its store operation created convergent or divergent state. It may create duplicates, use wrong types, or miss relationships without knowing.

**Solution:** After a store operation, the system runs lightweight convergence checks and returns diagnostics in the response.

**Diagnostic checks:**
- **Duplicate detection:** "Entity 'Sarah' has 87% similarity to existing 'Sarah Chen' (ent_abc123)"
- **Type suggestion:** "Entity type 'purchase' is not in the taxonomy — nearest canonical type: 'transaction'"
- **Schema mismatch:** "Field 'amount' was stored as string; schema expects number"
- **Orphaned entity:** "Entity has no relationships — consider linking to conversation or related entities"

**Behavior:**
- Diagnostics are advisory; they do not block the store
- Returned in a `diagnostics` array in the store response
- Agent can act on diagnostics in the same turn (merge, re-store, create relationship)

**Integration points:**
- `src/server.ts` — post-store diagnostic pass
- MCP response schema — new `diagnostics` field
- Diagnostic rules — configurable per entity type

### 2.6 Structured Action Templates

**Impact: Medium | Effort: Moderate**

**Problem:** The LLM generates freeform JSON payloads for store operations. The variance space is large: any combination of field names, types, and values the LLM can imagine.

**Solution:** The MCP server exposes entity type schemas as fill-in-the-blank templates. The agent can request a template before storing, constraining its output to defined fields.

**Behavior:**
- New MCP action: `get_store_template(entity_type)` returns the schema with field names, types, required/optional markers, and example values
- Agent fills the template rather than generating freeform JSON
- Reduces field name variance, type mismatches, and missing required fields
- Templates are auto-generated from the schema registry

**Integration points:**
- `src/server.ts` — new template endpoint
- `src/services/schema_registry.ts` — template generation from schema definitions
- MCP action catalog — new `get_store_template` action

### 2.7 Agent Action Replay and Convergence Testing

**Impact: Medium | Effort: Moderate**

**Problem:** There is no way to measure how much agent-layer nondeterminism affects the entity graph. Without measurement, improvements cannot be quantified.

**Solution:** A test harness that replays the same conversation through the agent layer N times and measures entity graph divergence.

**Metrics:**
- **Entity count variance:** How many entities does each run create?
- **Entity type variance:** Do runs use the same entity types?
- **Field coverage variance:** Do runs extract the same fields?
- **Relationship variance:** Do runs create the same relationship structure?
- **Snapshot divergence:** After reducer computation, how different are the snapshots?

**Behavior:**
- Replay harness sends identical user messages to the MCP server N times
- Each run uses a separate namespace (user_id or prefix) to avoid cross-contamination
- After all runs complete, compute divergence metrics across the N entity graphs
- Report per-entity-type convergence scores

**Integration points:**
- New test utility: `scripts/convergence_replay.ts`
- Uses existing MCP actions (no server changes)
- Runs against local or test database

### 2.8 Observation Confidence Scoring

**Impact: Lower | Effort: Higher**

**Problem:** All observations are treated equally by reducers. A high-confidence observation from a structured import and a low-confidence observation from a casual chat mention contribute equally to the snapshot.

**Solution:** Observations carry a `confidence` score. Reducers use confidence as a factor in merge policies.

**Behavior:**
- Observations include an optional `confidence` field (0.0–1.0)
- Sources assign confidence based on extraction method:
  - Structured import (CSV, API): confidence = 1.0
  - Schema-validated LLM extraction: confidence = 0.8
  - Casual chat mention: confidence = 0.5
- Reducers can use `highest_confidence` as a merge strategy alongside existing strategies
- Provenance records confidence alongside source_id

**Integration points:**
- Observation schema — new `confidence` field
- `src/reducers/observation_reducer.ts` — confidence-aware merge strategy
- `src/services/interpretation.ts` — confidence assignment during extraction

### 2.9 Fixed-Point Convergence for Critical Stores

**Impact: Niche | Effort: Moderate**

**Problem:** For high-stakes entity types (financial, legal), even small LLM extraction variance can matter. The idempotence pattern describes a fixed-point guarantee but it is not yet implemented.

**Solution:** For entity types marked as `critical` in the schema registry, run the canonicalization + hashing loop at store time: extract, canonicalize, hash, re-extract, canonicalize, hash, accept only when two consecutive hashes match.

**Behavior:**
- Schema registry marks entity types as `convergence: "strict"` or `convergence: "standard"` (default)
- For `strict` types, the store operation runs the fixed-point loop (max 3 iterations)
- If convergence is not achieved, the store proceeds with the last result but logs a convergence warning
- Adds latency proportional to iteration count

**Integration points:**
- Schema registry — new `convergence` property per entity type
- `src/services/interpretation.ts` — fixed-point loop for strict types
- `src/actions.ts` — convergence warning in response

## 3. Implementation Roadmap

### Phase 1 — Quick wins (low effort, high impact)

| Improvement | Effort | Impact | Dependencies |
|-------------|--------|--------|--------------|
| 2.2 Entity type normalization | Low | High | Schema registry alias field |
| 2.3 Field alias mapping | Low | Medium | Schema registry field aliases |
| 2.4 Retrieval-augmented storing | Low | High | Post-store retrieval query |

These three changes share an implementation pattern (normalization at write time) and can be shipped together.

### Phase 2 — Feedback loops (moderate effort, high compound value)

| Improvement | Effort | Impact | Dependencies |
|-------------|--------|--------|--------------|
| 2.1 Write-time entity suggestion | Moderate | High | Similarity computation |
| 2.5 Post-store convergence diagnostics | Moderate | Medium | Diagnostic rule engine |

These build on Phase 1 normalization and add agent-facing feedback.

### Phase 3 — Structural constraints and measurement

| Improvement | Effort | Impact | Dependencies |
|-------------|--------|--------|--------------|
| 2.6 Structured action templates | Moderate | Medium | Template generation from schemas |
| 2.7 Convergence testing | Moderate | Medium | Test harness + metrics |

These provide measurement infrastructure and tighter payload constraints.

### Phase 4 — Advanced (higher effort, niche value)

| Improvement | Effort | Impact | Dependencies |
|-------------|--------|--------|--------------|
| 2.8 Observation confidence scoring | Higher | Lower | Observation schema change, reducer update |
| 2.9 Fixed-point convergence | Moderate | Niche | Interpretation loop, schema flag |

These are warranted when specific entity types require stricter convergence.

## 4. Design Principles

1. **Never auto-merge.** The system surfaces candidates; humans or agents decide. Silent auto-merge would violate the immutability and explainability guarantees.

2. **Normalization before storage, not after.** Canonicalize entity types, field names, and values at write time. Post-hoc normalization requires backfill; write-time normalization prevents divergence.

3. **Diagnostics are advisory, not blocking.** Convergence feedback never rejects a valid store. The system is permissive on write and diagnostic on response.

4. **Measure before optimizing.** Convergence testing (2.7) should run against real agent sessions before tuning thresholds for similarity matching, confidence scoring, or fixed-point iteration.

5. **Composable improvements.** Each improvement is independent and can be shipped alone. They compose well: type normalization + field aliases + retrieval-augmented storing compound into significantly tighter convergence.

## Agent Instructions

### When to Load This Document

Load `docs/architecture/bounded_convergence.md` when:
- Designing or implementing convergence improvements
- Evaluating agent-layer variance in entity graphs
- Adding new entity types and considering convergence properties
- Working on entity resolution or deduplication
- Implementing MCP response enhancements

### Required Co-Loaded Documents
- [`docs/architecture/determinism.md`](./determinism.md) — Determinism doctrine (Section 1.6)
- [`docs/architecture/idempotence_pattern.md`](./idempotence_pattern.md) — Idempotence pattern for interpretation
- [`docs/subsystems/schema_registry.md`](../subsystems/schema_registry.md) — Schema registry patterns
- [`docs/specs/MCP_SPEC.md`](../specs/MCP_SPEC.md) — MCP action catalog

### Constraints Agents Must Enforce

1. **Never auto-merge entities** — surface candidates, don't silently merge
2. **Normalize at write time** — entity types, field names, values before observation creation
3. **Diagnostics are advisory** — never block a valid store on convergence feedback
4. **Preserve immutability** — convergence improvements must not modify existing observations
5. **Log normalizations** — all type/field rewrites must appear in the audit trail

### Related Documents
- [`docs/architecture/determinism.md`](./determinism.md) — Determinism requirements
- [`docs/architecture/idempotence_pattern.md`](./idempotence_pattern.md) — Idempotence pattern
- [`docs/architecture/architectural_decisions.md`](./architectural_decisions.md) — Architectural decisions
- [`docs/subsystems/schema_registry.md`](../subsystems/schema_registry.md) — Schema registry
- [`docs/subsystems/entity_resolution.md`](../subsystems/entity_resolution.md) — Entity resolution
