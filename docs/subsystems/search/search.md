# Neotoma Search — Query Models and Ranking
*(Structured Search with Deterministic Ranking)*

---

## Purpose

Defines search query models, ranking algorithms, and filtering semantics for Neotoma's Truth Layer search.

---

## Scope

MVP: Structured search only (no semantic/embedding search)
- Full-text search over `raw_text` and `properties`
- Structured filters (type, date range, entities)
- Deterministic ranking with tiebreakers

---

## Query Model

```typescript
interface SearchQuery {
  q?: string;                    // Full-text query
  type?: string[];               // Filter by schema type
  date_from?: string;            // ISO 8601
  date_to?: string;
  entity_id?: string;
  limit?: number;                // Default 20
  offset?: number;               // Pagination
}
```

## Ranking Algorithm

```typescript
function rankResults(results: Record[], query: string): Record[] {
  return results
    .map(r => ({ record: r, score: calculateScore(r, query) }))
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
  const regex = new RegExp(query, 'gi');
  
  // Exact match in type
  if (record.type.toLowerCase() === query.toLowerCase()) score += 10;
  
  // Match count in raw_text
  const matches = record.raw_text?.match(regex);
  score += (matches?.length || 0);
  
  return score;
}
```

**Determinism:** Same query + same DB state → same order

## Consistency

Search index is **bounded eventual** (max 5s delay after ingestion).

See `docs/architecture/consistency.md` for UI handling.

---

## Agent Instructions

Load when implementing search features, query logic, or ranking algorithms.

Required co-loaded: `docs/architecture/determinism.md`, `docs/architecture/consistency.md`

Constraints:
- MUST use deterministic ranking with tiebreakers
- MUST NOT use semantic search in MVP
- MUST document ranking changes











