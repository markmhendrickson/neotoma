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
**Storage:** Local: sqlite-vec `entity_embeddings_vec` (vec0 virtual table) with `entity_embedding_rows` lookup.

Embeddings require `OPENAI_API_KEY`. When unset, semantic search returns empty; keyword fallback remains available.

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
Entity semantic search uses sqlite-vec. Structural filters (`user_id`, `entity_type`, `merged`) are **always applied**. Used by `retrieve_entities` (when `search` param provided) and `retrieve_entity_by_identifier` (semantic fallback when keyword returns 0).

### Local Mode (sqlite-vec)
When `storageBackend === "local"` and `OPENAI_API_KEY` is set:
- **vec0 table:** `entity_embeddings_vec` (virtual table, `embedding float[1536]`)
- **Lookup table:** `entity_embedding_rows` (rowid, entity_id, user_id, entity_type, merged) maps vec rowids to entity metadata for filtering
- Embeddings stored at upsert via `storeLocalEntityEmbedding`; queried via `searchLocalEntityEmbeddings` (KNN over vec0)
- sqlite-vec is loaded lazily on first embedding write or search; load failure disables local semantic search (keyword fallback still works)

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
