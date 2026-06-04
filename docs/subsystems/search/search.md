# Neotoma Search — Query Models and Ranking

_(Structured Search with Deterministic Ranking)_

## Scope

MVP: Entity semantic search in scope for `retrieve_entities` and `retrieve_entity_by_identifier` when text query provided; structural search remains primary for set queries, relationships, timelines.

- Full-text search over `raw_text` and `properties`
- Structured filters (type, date range, entities)
- Optional entity semantic search (when `search` param or identifier provided; embeddings required)
- Deterministic ranking with tiebreakers

**Constraint:** Semantic search MUST operate over entity snapshots (structured), never raw document chunks.

## Query Model

```typescript
interface SearchQuery {
  q?: string; // Full-text query
  type?: string[]; // Filter by schema type
  date_from?: string; // ISO 8601
  date_to?: string;
  entity_id?: string;
  limit?: number; // Default 20
  offset?: number; // Pagination
}
```

## Ranking Algorithm

```typescript
function rankResults(results: Record[], query: string): Record[] {
  return results
    .map((r) => ({ record: r, score: calculateScore(r, query) }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      // Tiebreaker 1: created_at
      if (a.record.created_at !== b.record.created_at) {
        return b.record.created_at.localeCompare(a.record.created_at);
      }
      // Tiebreaker 2: id
      return a.record.id.localeCompare(b.record.id);
    })
    .map(({ record }) => record);
}
function calculateScore(record: Record, query: string): number {
  let score = 0;
  const regex = new RegExp(query, "gi");

  // Exact match in type
  if (record.type.toLowerCase() === query.toLowerCase()) score += 10;

  // Match count in raw_text
  const matches = record.raw_text?.match(regex);
  score += matches?.length || 0;

  return score;
}
```

**Determinism:** Same query + same DB state → same order

## Retrieval fallback strategies

Lexical/identifier retrieval applies progressively relaxed passes so a free-text query or a natural-language identifier still resolves the intended entity. Each relaxed pass is additive — it only widens which rows a query _can_ surface, never narrows or reorders an already-satisfied strict match — and the pass that produced a result is surfaced to callers so a relaxed hit is distinguishable from an exact one.

**`retrieve_entities` (`/entities/query` with `search`)** — `applied_search_strategies` (response field, array; present only on `search` requests):

- `strict` — every query token matches the row's lexical text (canonical_name + snapshot-derived search text).
- `semantic` — vector-similarity fallback over entity snapshots (embeddings required).
- `partial_overlap` (#1551) — when no row satisfies the strict every-token gate, recover rows that contain at least 50% of the _meaningful_ query tokens (stop tokens such as `and`, `for`, `now`, `try` are ignored; minimum two meaningful tokens, minimum two satisfied), ranked by overlap count.
- `concept_bridge` (#1496) — a query names a concept ("bank account", "savings account") rather than the stored `entity_type` ("financial_account"). The concept phrase → entity_type map is built from each schema's `SchemaDefinition.query_synonyms`, not hardcoded in the search module (see `docs/foundation/schema_agnostic_design_rules.md`). A concept match credits one satisfied token in the partial-overlap pass so the typed concept survives the fallback even when the literal type name is absent. Only compound phrases are declared (e.g. `"bank account"`, never bare `"account"`/`"bank"`) to keep precision high. Types with no `query_synonyms` declaration simply contribute no bridge (safe generic fallback).

**`retrieve_entity_by_identifier`** — `match_mode` (response field, single enum):

- `direct` — canonical_name / alias match, or derived-id lookup.
- `snapshot_field` (#1495) — matched an identity-bearing snapshot field. A generic base set (`name`, `full_name`, `title`, `email`, `domain`, `company`) applies to all types; per-type identity fields (e.g. `institution`, `account_name` for `financial_account`) are declared via `SchemaDefinition.identity_search_fields` and merged in per `entity_type` at runtime, not hardcoded in the handler. Types that declare nothing fall back to the generic base set and log a structured warning keyed by `entity_type` so drift is auditable (`docs/foundation/schema_agnostic_design_rules.md`).
- `semantic` — vector-similarity fallback.
- `none` — no match.

Adding a new domain type with its own concept words or identity-bearing fields requires only a registry/schema-definition edit (`query_synonyms` / `identity_search_fields`), with no change to the generic search or identifier-resolution modules.

## Consistency

Search index is **bounded eventual** (max 5s delay after ingestion).
See `docs/architecture/consistency.md` for UI handling.

## Agent Instructions

Load when implementing search features, query logic, or ranking algorithms.
Required co-loaded: `docs/architecture/determinism.md`, `docs/architecture/consistency.md`
Constraints:

- MUST use deterministic ranking with tiebreakers
- Semantic search MUST operate over entity snapshots (structured), never raw document chunks
- MUST document ranking changes
