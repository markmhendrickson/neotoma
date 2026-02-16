# Neotoma Vector Operations — Embeddings and Similarity Search
*(Embedding Lifecycle and Vector Indexes)*
## Scope
**MVP:** Entity semantic search in scope; embeddings on `entity_snapshots`; consistency bounded eventual. Structural retrieval remains primary; semantic search is an optional path when text query provided.
**Future:** Hybrid search over records (structured + semantic).
## Embedding Generation
```typescript
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text,
  });
  
  return response.data[0].embedding; // 1536 dimensions
}
```
**Consistency:** Embeddings are **bounded eventual** (max 10s delay).
## Entity Embeddings
Entity semantic search embeds **structured output** (entity snapshots), not raw document chunks. Structure drives what is searchable.

**Searchable text format:** `entity_type` + `canonical_name` + snapshot JSON stringified
**When generated:** At `entity_snapshots` upsert (interpretation, schema registry, health check, store, correct)
**Storage:** `entity_snapshots.embedding` (nullable `vector(1536)`)

Embeddings are skipped when `config.storageBackend === "local"` (SQLite has no pgvector).

## Vector Index
```sql
CREATE INDEX idx_entity_snapshots_embedding
  ON entity_snapshots USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL;
```

```sql
CREATE INDEX idx_records_embedding 
  ON records USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);
```
## Entity Similarity Search
Entity semantic search uses pgvector over `entity_snapshots`. Structural filters (`user_id`, `entity_type`, `merged`) are **always applied** with semantic search. Used by `retrieve_entities` (when `search` param provided) and `retrieve_entity_by_identifier` (semantic fallback when keyword returns 0).

```sql
-- RPC: search_entity_snapshots_by_embedding
SELECT entity_id, 1 - (embedding <=> query_embedding) AS similarity
FROM entity_snapshots
WHERE embedding IS NOT NULL
  AND user_id = p_user_id
  AND (p_entity_type IS NULL OR entity_type = p_entity_type)
  AND (p_include_merged OR merged_to_entity_id IS NULL)
ORDER BY embedding <=> query_embedding
LIMIT p_limit OFFSET p_offset;
```

## Similarity Search (Records — Future)
```typescript
async function similaritySearch(
  queryEmbedding: number[],
  limit: number = 10
): Promise<Record[]> {
  return await db.query(`
    SELECT *, 1 - (embedding <=> $1) AS similarity
    FROM records
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> $1
    LIMIT $2
  `, [queryEmbedding, limit]);
}
```
## Agent Instructions
Load when working with embeddings, vector storage, or similarity search.
Required co-loaded: `docs/architecture/consistency.md`, `docs/subsystems/schema.md`, `docs/foundation/philosophy.md`
Constraints:
- Embeddings MUST be asynchronous (bounded eventual)
- Entity embeddings MUST use structured output (entity snapshots); never embed raw document chunks
- Structural filters (user_id, entity_type, merged) MUST be applied with semantic search
- Vector operations MUST document consistency tier
