## Release v2.2.0 — Execution Schedule
### Purpose
This document defines the batch execution plan for v2.2.0 Feature Units, including dependencies, sequencing, and checkpoints.
### Execution Strategy
**Principles:**
1. **Sequential Execution**: Database changes (RPC function, index migration) must be sequential
2. **Dependency Respect**: Application code depends on RPC function; documentation depends on all implementation
3. **Checkpoint Reviews**: Review after each major phase (RPC, index, code)
4. **Risk Mitigation**: High-risk operations (index migration) run alone, not in parallel
**Constraints:**
- **Max Parallel FUs**: 2 (database changes require careful sequencing)
- **Max High-Risk in Parallel**: 1 (index migration is high-risk)
### Batch Execution Plan
#### Batch 0: RPC Function Creation
**Feature Units:**
- `FU-930`: Vector Search RPC Function
**Dependencies:**
- None (foundation for subsequent batches)
**Tasks:**
1. Create migration file: `supabase/migrations/[timestamp]_add_vector_search_rpc.sql`
2. Implement RPC function `search_records_by_embedding` with:
   - Parameter validation
   - Native vector operators (`<=>`)
   - Type filtering support
   - Similarity threshold support
3. Add function comment documenting usage
4. Test RPC function:
   - Query with various embeddings
   - Verify results ordered by similarity
   - Test type filtering
   - Test similarity threshold
**Verification:**
```sql
-- Test RPC function
SELECT id, type, similarity
FROM search_records_by_embedding(
  ARRAY[0.1, 0.2, ...], -- test embedding
  'transaction', -- type filter
  10, -- limit
  0.7 -- similarity threshold
)
LIMIT 5;
```
**Estimated Duration**: 2-4 hours
**Checkpoint 1**: Review RPC function implementation and test results before proceeding to Batch 1.
#### Batch 1: HNSW Index Migration
**Feature Units:**
- `FU-931`: HNSW Index Migration
**Dependencies:**
- `FU-930` (RPC function must exist before index migration)
**Tasks:**
1. Check pgvector version:
   - Verify pgvector 0.5.0+ installed
   - Document version for rollback reference
2. Create migration file: `supabase/migrations/[timestamp]_migrate_vector_index_to_hnsw.sql`
3. Implement migration:
   - Version check logic
   - Drop IVFFlat index
   - Create HNSW index with parameters (m=16, ef_construction=64)
   - Add index comment
4. Run migration during low-traffic window:
   - Monitor index build time
   - Monitor memory usage
   - Verify no performance degradation during build
5. Verify index usage:
   - Run `EXPLAIN ANALYZE` on RPC function
   - Confirm index scan (not sequential scan)
   - Measure query latency
**Verification:**
```sql
-- Verify HNSW index exists
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'records' AND indexname LIKE '%embedding%';
-- Verify index usage
EXPLAIN ANALYZE
SELECT * FROM search_records_by_embedding(
  ARRAY[0.1, 0.2, ...],
  NULL,
  10,
  0.0
);
-- Should show "Index Scan using idx_records_embedding_hnsw"
```
**Estimated Duration**: 4-8 hours (includes index build time)
**Checkpoint 2**: Review index migration, verify index usage, measure performance before proceeding to Batch 2.
#### Batch 2: Application Code Updates
**Feature Units:**
- `FU-932`: Application Code Update
**Dependencies:**
- `FU-930` (RPC function must exist)
**Tasks:**
1. Update `src/actions.ts`:
   - Locate `executeRetrieveRecords` function (around line 2540)
   - Replace candidate fetching and similarity calculation with RPC call
   - Update error handling for RPC errors
   - Preserve result formatting and logging
2. Update `src/server.ts`:
   - Locate `retrieveRecords` method (around line 982)
   - Apply same replacement pattern as actions.ts
   - Update error handling
3. Test application code:
   - Unit tests for RPC integration
   - Integration tests for vector search
   - Verify backward compatibility (same result structure)
   - Performance benchmarks (latency, network transfer)
4. Update error messages and logging
5. Code review and validation
**Code Changes Summary:**
**Before** (lines 2548-2606 in actions.ts):
```typescript
const { data: candidates, error: fetchError } =
  await embeddingQuery.limit(finalLimit * 10);
const scoredCandidates = candidates
  .map((rec: any) => {
    // ... JavaScript similarity calculation ...
  })
  .filter((rec: any) => rec !== null)
  .sort((a: any, b: any) => b.similarity - a.similarity);
```
**After**:
```typescript
const { data: semanticMatches, error: rpcError } = await supabase.rpc(
  'search_records_by_embedding',
  {
    query_embedding: query_embedding,
    match_type: normalizedType || null,
    match_limit: finalLimit,
    similarity_threshold: similarity_threshold
  }
);
```
**Verification:**
- Run integration tests: `npm test -- tests/integration/vector_search.spec.ts`
- Verify performance: Query latency P95 < 50ms
- Verify network transfer: < 100KB per query
- Verify backward compatibility: Same result structure
**Estimated Duration**: 6-8 hours
**Checkpoint 3**: Review code changes, verify tests passing, measure performance before proceeding to Batch 3.
#### Batch 3: Documentation Updates
**Feature Units:**
- `FU-933`: Documentation Update
**Dependencies:**
- `FU-931` (index migration must be complete)
- `FU-932` (code updates must be complete)
**Tasks:**
1. Update `docs/subsystems/vector_ops.md`:
   - Replace IVFFlat references with HNSW
   - Update index creation SQL
   - Update similarity search code examples (RPC function)
   - Document HNSW parameters and trade-offs
   - Update scalability characteristics (100k-10M records)
   - Update performance expectations
2. Verify documentation accuracy:
   - Test code examples
   - Verify index parameters match implementation
   - Cross-reference with release_plan.md
3. Review and finalize
**Documentation Updates:**
- Vector Index section: IVFFlat → HNSW with parameters
- Similarity Search section: Direct query → RPC function
- Performance section: Updated benchmarks and scalability
- Consistency tier: No change (bounded eventual)
**Verification:**
- Documentation review
- Code examples tested and verified
- Cross-references accurate
**Estimated Duration**: 2-4 hours
**Final Checkpoint**: Review all changes, verify documentation accuracy, confirm all acceptance criteria met.
### Checkpoints
#### Checkpoint 1: After Batch 0 (RPC Function)
**Review:**
- RPC function implementation correct
- Test results satisfactory
- No performance issues
**Go/No-Go Decision:**
- **GO**: Proceed to Batch 1 (index migration)
- **NO-GO**: Fix RPC function issues before proceeding
#### Checkpoint 2: After Batch 1 (HNSW Index)
**Review:**
- Index migration successful
- Index usage verified via EXPLAIN ANALYZE
- Performance meets expectations (P95 < 50ms)
- No memory issues
**Go/No-Go Decision:**
- **GO**: Proceed to Batch 2 (code updates)
- **NO-GO**: Rollback to IVFFlat, investigate issues
#### Checkpoint 3: After Batch 2 (Code Updates)
**Review:**
- Code changes correct and tested
- Integration tests passing
- Performance benchmarks met
- Backward compatibility verified
**Go/No-Go Decision:**
- **GO**: Proceed to Batch 3 (documentation)
- **NO-GO**: Fix code issues before proceeding
#### Final Checkpoint: After Batch 3 (Documentation)
**Review:**
- All Feature Units complete
- All acceptance criteria met
- Documentation accurate and complete
- Ready for deployment
**Go/No-Go Decision:**
- **GO**: Deploy to production
- **NO-GO**: Address remaining issues before deployment
### Execution Timeline
**Assumption**: All timeline estimates assume careful implementation with testing and verification.
**Total Estimated Duration**: 14-24 hours (2-3 days with testing and reviews)
| Batch | Feature Units | Duration | Dependencies |
|-------|---------------|----------|--------------|
| 0 | FU-930 (RPC Function) | 2-4 hours | None |
| 1 | FU-931 (HNSW Index) | 4-8 hours | FU-930 |
| 2 | FU-932 (Code Updates) | 6-8 hours | FU-930 |
| 3 | FU-933 (Documentation) | 2-4 hours | FU-931, FU-932 |
**Critical Path**: Batch 0 → Batch 1 → Batch 2 → Batch 3
**Parallelization**: Batch 2 (code updates) can potentially start after Batch 0 (RPC function), parallel with Batch 1 (index migration), but safer to run sequentially.
### Risk Mitigation
**High-Risk Operations:**
1. **Index Migration** (Batch 1):
   - Run during low-traffic window
   - Monitor memory usage
   - Have rollback plan ready (recreate IVFFlat)
2. **Code Updates** (Batch 2):
   - Thorough testing before deployment
   - Feature flag for gradual rollout (optional)
   - Monitor error rates after deployment
**Rollback Triggers:**
- Performance regression beyond 10% of baseline
- Memory usage exceeds available capacity
- Error rate increase > 1%
- Index build fails or times out
### Success Criteria
**Execution is Complete When:**
1. ✅ All 4 batches executed successfully
2. ✅ All checkpoints passed (Go decision at each checkpoint)
3. ✅ All acceptance criteria met (performance, technical, business)
4. ✅ Documentation updated and reviewed
5. ✅ Production deployment successful
6. ✅ Post-deployment monitoring shows expected improvements
### Post-Execution Monitoring
**Metrics to Monitor:**
- Query latency P95 (target: < 50ms)
- Network transfer per query (target: < 100KB)
- Database memory usage (HNSW uses ~4x more than IVFFlat)
- Error rate (should remain stable)
- Index usage (confirm via EXPLAIN ANALYZE samples)
**Monitoring Duration**: 7 days post-deployment
**Escalation**: If performance regression or memory issues, execute rollback plan.




