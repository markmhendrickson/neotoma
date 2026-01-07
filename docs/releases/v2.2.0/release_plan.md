## Release v2.2.0 — Vector Search Scalability
### Purpose
This document provides the overview and coordination framework for v2.2.0, which addresses vector search scalability issues in the current implementation. The release migrates from IVFFlat to HNSW index and replaces JavaScript similarity computation with PostgreSQL native vector operators.
**Release Classification:**
- **All releases deploy to production** at neotoma.io
- **Release types**: "Marketed" (with marketing activities) vs "Not Marketed" (silent deployment)
- **This release**: Not Marketed (performance optimization, silent deployment)
- `execution_schedule.md` — FU execution plan with batches and dependencies
- `manifest.yaml` — FU list, dependencies, schedule, release type
- `integration_tests.md` — Cross-FU integration test specifications
- `status.md` — Live status tracking and decision log
### 1. Release Overview
- **Release ID**: `v2.2.0`
- **Name**: Vector Search Scalability
- **Release Type**: Not Marketed (performance optimization, silent deployment)
- **Goal**: Fix vector search scalability issues to enable scaling beyond 100k records. Replace JavaScript similarity computation with PostgreSQL native operators, migrate from IVFFlat to HNSW index, and achieve 10-100x query latency improvement.
- **Priority**: P1 (performance optimization, not blocking)
- **Target Ship Date**: TBD (after v2.1.0 completion)
- **Discovery Required**: No (performance-driven, not user-driven)
- **Marketing Required**: No (performance optimization)
- **Deployment**: Production (neotoma.io)
- **Owner**: Mark Hendrickson
#### 1.1 Canonical Specs (Authoritative Sources)
- **Manifest**: `docs/NEOTOMA_MANIFEST.md`
- **Vector Operations**: `docs/subsystems/vector_ops.md` — Current vector operations documentation
- **Database Schema**: `docs/subsystems/schema.md` — Database schema and indexes
- **Supabase Advisor Report**: `supabase/ADVISOR_REPORT.md` — Performance optimization recommendations
This release plan implements the vector index optimization recommended in the Supabase Advisor Report.
### 2. Problem Analysis
#### 2.1 Current Implementation Issues
**Issue 1: Vector Index Not Used**
Current code in `src/actions.ts` (lines 2548-2606) and `src/server.ts` (lines 982-1043) fetches candidates via Supabase REST API, then computes similarity in JavaScript:
```typescript
// Current implementation (INEFFICIENT)
const { data: candidates, error: fetchError } =
  await embeddingQuery.limit(finalLimit * 10);
const scoredCandidates = candidates
  .map((rec: any) => {
    const dotProduct = query_embedding.reduce(
      (sum, val, i) => sum + val * recEmbedding[i],
      0
    );
    const similarity = dotProduct / (queryNorm * recNorm);
    return { ...rec, similarity };
  })
  .sort((a: any, b: any) => b.similarity - a.similarity);
```
**Problems:**
- Bypasses vector index entirely (full table scans)
- Network transfer of full records with 1536-dim embeddings (MB per query at scale)
- O(n) similarity calculations in JavaScript
- Fetches random candidates, not nearest neighbors
**Issue 2: IVFFlat Index Limitations**
Fixed `lists=100` configured for ~100k records (`supabase/schema.sql:52`):
```sql
CREATE INDEX idx_records_embedding 
  ON records USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);
```
**Problems:**
- Degrades beyond 100k records (recall drops, query latency increases)
- Lists parameter must scale with data: `lists = rows/1000` for larger datasets
- Requires expensive index rebuilds on data changes
- Poor scalability beyond 1M records
#### 2.2 Performance Impact at Scale
- **Current (100k records)**: ~1000 candidates fetched, ~1.5MB network transfer, ~1000 JS similarity calculations
- **At 1M records**: Would fetch 1000 random candidates (not nearest neighbors), same overhead but wrong results
- **With proper index**: <10ms query time, <100KB transfer, index does the work
#### 2.3 Vector Search Scalability Characteristics
- **IVFFlat**: Good for <100k, acceptable up to 1M with tuning, poor beyond 1M
- **HNSW**: Better recall and latency, scales to 10M+ records without parameter tuning
- **Exact search** (no index): O(n) - only viable for <10k records
### 3. Scope
#### 3.1 Included Feature Units (P0 Critical Path)
**Phase 1: PostgreSQL RPC Function**
- `FU-930`: Vector Search RPC Function — Create PostgreSQL function using native vector operators
**Phase 2: HNSW Index Migration**
- `FU-931`: HNSW Index Migration — Migrate from IVFFlat to HNSW index (requires pgvector 0.5.0+)
**Phase 3: Application Code Updates**
- `FU-932`: Application Code Update — Replace JavaScript similarity computation with RPC calls in `src/actions.ts` and `src/server.ts`
**Phase 4: Documentation Updates**
- `FU-933`: Documentation Update — Update `docs/subsystems/vector_ops.md` to reflect HNSW index and RPC function usage
#### 3.2 Explicitly Excluded
- Changes to embedding generation (existing implementation sufficient)
- Changes to embedding storage format (existing vector(1536) format sufficient)
- Local vector search improvements (v2.0.0 scope)
- Vector search for tables other than `records` (not currently used)
### 4. Implementation Specifications
#### 4.1 FU-930: Vector Search RPC Function
**File**: `supabase/migrations/[timestamp]_add_vector_search_rpc.sql`
Create a PostgreSQL function that uses native vector operators to leverage the vector index:
```sql
CREATE OR REPLACE FUNCTION search_records_by_embedding(
  query_embedding vector(1536),
  match_type TEXT DEFAULT NULL,
  match_limit INTEGER DEFAULT 10,
  similarity_threshold NUMERIC DEFAULT 0.0
)
RETURNS TABLE (
  id UUID,
  type TEXT,
  properties JSONB,
  file_urls JSONB,
  external_source TEXT,
  external_id TEXT,
  external_hash TEXT,
  embedding vector(1536),
  summary TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  similarity NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.type,
    r.properties,
    r.file_urls,
    r.external_source,
    r.external_id,
    r.external_hash,
    r.embedding,
    r.summary,
    r.created_at,
    r.updated_at,
    1 - (r.embedding <=> query_embedding) AS similarity
  FROM records r
  WHERE r.embedding IS NOT NULL
    AND (match_type IS NULL OR r.type = match_type)
    AND (1 - (r.embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;
COMMENT ON FUNCTION search_records_by_embedding IS 
  'Vector similarity search using native pgvector operators. Uses vector index automatically via <=> distance operator. Returns records ordered by similarity (1.0 = identical, 0.0 = orthogonal).';
```
**Benefits:**
- Uses vector index automatically via `<=>` operator
- Computes similarity in PostgreSQL (no network transfer of embeddings)
- Supports type filtering and similarity threshold
- Maintains same result structure as current code (backward compatible)
**Parameters:**
- `query_embedding`: The 1536-dimensional embedding vector to search for
- `match_type`: Optional record type filter (e.g., "transaction", "email")
- `match_limit`: Maximum number of results to return (default 10)
- `similarity_threshold`: Minimum similarity score (0.0-1.0, default 0.0)
**Returns:**
- All record fields plus computed `similarity` score
- Ordered by similarity (descending)
- Limited to `match_limit` results
#### 4.2 FU-931: HNSW Index Migration
**File**: `supabase/migrations/[timestamp]_migrate_vector_index_to_hnsw.sql`
Check pgvector version and create HNSW index:
```sql
-- Migration: Migrate from IVFFlat to HNSW index for vector search scalability
-- Created: [timestamp]
-- Description: Replace IVFFlat index with HNSW index for better scalability (requires pgvector 0.5.0+)
-- Check pgvector version
DO $$
DECLARE
  pgvector_version TEXT;
BEGIN
  -- Get pgvector extension version
  SELECT extversion INTO pgvector_version
  FROM pg_extension
  WHERE extname = 'vector';
  
  -- Log version for verification
  RAISE NOTICE 'pgvector version: %', pgvector_version;
  
  -- Check if version supports HNSW (0.5.0+)
  IF pgvector_version IS NULL THEN
    RAISE EXCEPTION 'pgvector extension not found';
  END IF;
  
  -- Version check: HNSW requires pgvector 0.5.0+
  -- Note: This is a simple check. For production, parse version string properly.
  IF pgvector_version < '0.5.0' THEN
    RAISE WARNING 'pgvector version % does not support HNSW index. Keeping IVFFlat index.', pgvector_version;
  ELSE
    -- Drop old IVFFlat index
    DROP INDEX IF EXISTS idx_records_embedding;
    
    -- Create HNSW index
    CREATE INDEX idx_records_embedding_hnsw 
      ON records USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    
    -- Create index comment documenting parameters
    COMMENT ON INDEX idx_records_embedding_hnsw IS 
      'HNSW vector index for semantic search. Parameters: m=16 (connections per node), ef_construction=64 (search width during build). Optimized for 100k-10M records. Provides better recall and latency than IVFFlat at scale.';
    
    RAISE NOTICE 'Successfully migrated to HNSW index';
  END IF;
END $$;
```
**HNSW Parameters:**
- `m = 16`: Number of connections per node (balance between index size and query speed)
- `ef_construction = 64`: Search width during index build (higher = better recall, slower build)
- `ef_search`: Per-query recall tuning (set via `SET hnsw.ef_search = 100` if needed)
**Why HNSW?**
- Better recall than IVFFlat at all scales
- Faster queries than IVFFlat beyond 100k records
- No parameter tuning required for different dataset sizes
- Scales to 10M+ records without degradation
**Trade-offs:**
- ~4x more memory than IVFFlat (acceptable for modern infrastructure)
- Slower index build (one-time operation, run during low-traffic window)
#### 4.3 FU-932: Application Code Update
**Files**: `src/actions.ts`, `src/server.ts`
Replace JavaScript similarity computation with RPC calls.
**Changes in `src/actions.ts` (executeRetrieveRecords function, around line 2540):**
```typescript
// BEFORE (lines 2548-2606):
if (query_embedding && query_embedding.length === 1536) {
  let embeddingQuery = supabase
    .from("records")
    .select("*")
    .not("embedding", "is", null);
  if (normalizedType) {
    embeddingQuery = embeddingQuery.eq("type", normalizedType);
  }
  const { data: candidates, error: fetchError } =
    await embeddingQuery.limit(finalLimit * 10);
  if (!fetchError && candidates) {
    const queryNorm = Math.sqrt(
      query_embedding.reduce((sum, val) => sum + val * val, 0)
    );
    const scoredCandidates = candidates
      .map((rec: any) => {
        let recEmbedding = rec.embedding;
        if (!recEmbedding) return null;
        // ... similarity calculation ...
        return { ...rec, similarity };
      })
      .filter((rec: any) => rec !== null)
      .sort((a: any, b: any) => b.similarity - a.similarity);
    const semanticMatches = scoredCandidates
      .filter((rec: any) => rec.similarity >= similarity_threshold)
      .slice(0, finalLimit);
    appendResults(semanticMatches);
  }
}
// AFTER (replace above with):
if (query_embedding && query_embedding.length === 1536) {
  const { data: semanticMatches, error: rpcError } = await supabase.rpc(
    'search_records_by_embedding',
    {
      query_embedding: query_embedding,
      match_type: normalizedType || null,
      match_limit: finalLimit,
      similarity_threshold: similarity_threshold
    }
  );
  if (!rpcError && semanticMatches) {
    appendResults(semanticMatches);
  } else if (rpcError) {
    logError("SupabaseError:retrieve_records:semantic:rpc", req, rpcError);
  }
}
```
**Changes in `src/server.ts` (retrieveRecords method, around line 982):**
Apply same pattern as above: replace candidate fetching and similarity calculation with RPC call.
**Key Changes:**
1. Remove: `embeddingQuery.limit(finalLimit * 10)` and all similarity calculation code
2. Add: `supabase.rpc('search_records_by_embedding', { ... })` call
3. Preserve: Existing result formatting, error handling, and logging
4. Maintain: Backward compatibility (same result structure)
#### 4.4 FU-933: Documentation Update
**File**: `docs/subsystems/vector_ops.md`
Update to reflect HNSW index and RPC function usage:
```markdown
## Vector Index
```sql
CREATE INDEX idx_records_embedding_hnsw 
  ON records USING hnsw (embedding vector_cosine_ops) 
  WITH (m = 16, ef_construction = 64);
```
**Index Type**: HNSW (Hierarchical Navigable Small World)
**Parameters**:
- `m = 16`: Connections per node (balance between index size and query speed)
- `ef_construction = 64`: Search width during build (higher = better recall)
**Scalability**: Optimized for 100k-10M records. Better recall and latency than IVFFlat at scale.
## Similarity Search
```typescript
async function similaritySearch(
  queryEmbedding: number[],
  type?: string,
  limit: number = 10,
  similarityThreshold: number = 0.0
): Promise<Record[]> {
  const { data, error } = await supabase.rpc('search_records_by_embedding', {
    query_embedding: queryEmbedding,
    match_type: type || null,
    match_limit: limit,
    similarity_threshold: similarityThreshold
  });
  
  if (error) throw error;
  return data;
}
```
**Implementation**: Uses PostgreSQL RPC function with native vector operators (`<=>`).
**Performance**: Query latency P95 < 50ms for 100k-10M records, network transfer < 100KB per query.
```
### 5. Release-Level Acceptance Criteria
**Product:**
- ✅ Vector search uses indexed queries instead of JavaScript similarity calculation
- ✅ Query performance meets benchmarks at scale (P95 < 50ms)
**Technical:**
- ✅ RPC function uses native vector operators (`<=>`)
- ✅ HNSW index successfully created (pgvector 0.5.0+)
- ✅ Index usage verified via `EXPLAIN ANALYZE`
- ✅ Network transfer reduced to <100KB per query
- ✅ Backward compatibility maintained (same result structure)
- ✅ 10-100x query latency improvement at scale
**Business:**
- ✅ Vector search scales to 10M+ records without performance degradation
- ✅ No manual parameter tuning required for different dataset sizes
- ✅ Operational efficiency: Reduced database load and network transfer
### 6. Performance Expectations
**Query Latency:**
- **Before**: ~1000ms for 100k records (JavaScript similarity calculation)
- **After**: <50ms for 100k records (indexed queries)
- **Improvement**: 20x reduction
**Network Transfer:**
- **Before**: ~1.5MB per query (full records with embeddings)
- **After**: <100KB per query (similarity computed in database)
- **Improvement**: 15x reduction
**Scalability:**
- **Before**: Degrades beyond 100k records (IVFFlat + JavaScript similarity)
- **After**: Scales to 10M+ records without degradation (HNSW + native operators)
- **Improvement**: 100x capacity increase
**Memory Usage:**
- **Trade-off**: HNSW uses ~4x more memory than IVFFlat
- **Mitigation**: Monitor and scale infrastructure if needed (acceptable for modern systems)
### 7. Dependencies
**Required Pre-Release:**
- pgvector 0.5.0+ (for HNSW index support)
- Supabase PostgreSQL 15+ (vector extension compatibility)
**External Dependencies:**
- None (internal performance optimization)
### 8. Risk Assessment
**Medium-Risk Areas:**
- pgvector version compatibility (mitigation: version check in migration)
- HNSW index build time (mitigation: run during low-traffic window)
- Memory increase (mitigation: monitor and scale infrastructure)
**Mitigation:**
- Version check in migration (fallback to IVFFlat if needed)
- Index build during maintenance window
- Memory monitoring and scaling plan
- Backward compatibility testing
### 9. Testing Strategy
**Performance Benchmarks:**
1. Query latency with 1k, 10k, 100k, 1M records
2. Network transfer measurement
3. Index usage verification via `EXPLAIN ANALYZE`
4. Recall comparison (HNSW vs IVFFlat)
**Integration Tests:**
1. RPC function correctness
2. Result structure compatibility
3. Type filtering functionality
4. Similarity threshold filtering
**Load Testing:**
1. Concurrent query performance
2. Index build impact on production
3. Memory usage under load
### 10. Rollback Plan
If issues arise:
1. **RPC Function Issues**: Revert to JavaScript similarity calculation (code rollback)
2. **HNSW Index Issues**: Drop HNSW, recreate IVFFlat index
3. **Performance Regression**: Monitor and investigate (unlikely, HNSW should always be faster)
**Rollback Migration** (if needed):
```sql
-- Rollback to IVFFlat index
DROP INDEX IF EXISTS idx_records_embedding_hnsw;
CREATE INDEX idx_records_embedding 
  ON records USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);
```
### 11. Success Criteria
**v2.2.0 is Complete When:**
1. ✅ RPC function deployed and tested
2. ✅ HNSW index created and verified
3. ✅ Application code updated to use RPC function
4. ✅ Documentation updated
5. ✅ Performance benchmarks meet targets (P95 < 50ms, <100KB transfer)
6. ✅ All integration tests passing
7. ✅ Production deployment successful with no performance regression
### 12. Related Documentation
**For Implementation:**
- `docs/subsystems/vector_ops.md` — Vector operations documentation
- `docs/subsystems/schema.md` — Database schema and indexes
- `supabase/ADVISOR_REPORT.md` — Performance optimization recommendations
**For Reference:**
- pgvector documentation: https://github.com/pgvector/pgvector
- HNSW algorithm: https://arxiv.org/abs/1603.09320




