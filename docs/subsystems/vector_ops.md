# Neotoma Vector Operations — Embeddings and Similarity Search
*(Embedding Lifecycle and Vector Indexes)*

---

## Purpose

Defines embedding generation, storage, and similarity search operations.

---

## Scope

**MVP:** Embeddings generated but not used for core search (bounded eventual).

**Future:** Hybrid search (structured + semantic).

---

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

## Vector Index

```sql
CREATE INDEX idx_records_embedding 
  ON records USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);
```

## Similarity Search

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

---

## Agent Instructions

Load when working with embeddings, vector storage, or similarity search.

Required co-loaded: `docs/architecture/consistency.md`, `docs/subsystems/schema.md`

Constraints:
- Embeddings MUST be asynchronous (bounded eventual)
- Core search MUST NOT depend on embeddings (MVP)
- Vector operations MUST document consistency tier













