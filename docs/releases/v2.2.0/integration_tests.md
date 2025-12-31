## Release v2.2.0 — Integration Tests
### Purpose
This document defines integration test specifications for v2.2.0 Feature Units, including functional tests, performance benchmarks, and backward compatibility verification.
### Test Categories
1. **Functional Tests**: Verify correct behavior of RPC function and code updates
2. **Performance Benchmarks**: Measure query latency and network transfer improvements
3. **Index Verification**: Confirm HNSW index usage and performance
4. **Backward Compatibility**: Ensure result structure unchanged
5. **Load Tests**: Verify performance under concurrent load
### 1. Functional Tests
#### Test 1.1: RPC Function Correctness
**Test ID**: `FU-930-INT-001`
**Description**: Verify RPC function returns correct results ordered by similarity
**Test Steps:**
1. Create test records with known embeddings
2. Call `search_records_by_embedding` with test query embedding
3. Verify results ordered by similarity (descending)
4. Verify similarity scores correct (cosine similarity)
**Test Data:**
```typescript
const testRecords = [
  { id: 'rec1', embedding: [1, 0, 0, ...], type: 'test' },
  { id: 'rec2', embedding: [0.9, 0.1, 0, ...], type: 'test' },
  { id: 'rec3', embedding: [0, 1, 0, ...], type: 'test' },
];
const queryEmbedding = [1, 0, 0, ...]; // Should be most similar to rec1
```
**Expected Result:**
```typescript
[
  { id: 'rec1', similarity: 1.0 },
  { id: 'rec2', similarity: 0.9 },
  { id: 'rec3', similarity: 0.0 },
]
```
**Pass Criteria**: Results ordered correctly, similarity scores within 0.01 of expected
#### Test 1.2: Type Filtering
**Test ID**: `FU-930-INT-002`
**Description**: Verify type filter works correctly
**Test Steps:**
1. Create test records with different types
2. Call RPC function with type filter
3. Verify only matching type returned
**Test Data:**
```typescript
const testRecords = [
  { id: 'rec1', type: 'transaction', embedding: [1, 0, 0, ...] },
  { id: 'rec2', type: 'email', embedding: [0.9, 0.1, 0, ...] },
  { id: 'rec3', type: 'transaction', embedding: [0.8, 0.2, 0, ...] },
];
const queryEmbedding = [1, 0, 0, ...];
const typeFilter = 'transaction';
```
**Expected Result**: Only `rec1` and `rec3` returned (transaction type)
**Pass Criteria**: No records of other types in results
#### Test 1.3: Similarity Threshold
**Test ID**: `FU-930-INT-003`
**Description**: Verify similarity threshold filters results correctly
**Test Steps:**
1. Create test records with varying similarity
2. Call RPC function with similarity threshold
3. Verify only results above threshold returned
**Test Data:**
```typescript
const queryEmbedding = [1, 0, 0, ...];
const similarityThreshold = 0.7;
// Expected similarities: rec1=1.0, rec2=0.9, rec3=0.5
```
**Expected Result**: Only `rec1` and `rec2` returned (similarity >= 0.7)
**Pass Criteria**: All results have similarity >= threshold
#### Test 1.4: Limit Parameter
**Test ID**: `FU-930-INT-004`
**Description**: Verify limit parameter works correctly
**Test Steps:**
1. Create 20 test records
2. Call RPC function with limit=5
3. Verify exactly 5 results returned
**Expected Result**: 5 results, ordered by similarity
**Pass Criteria**: Result count equals limit parameter
### 2. Performance Benchmarks
#### Test 2.1: Query Latency (Small Dataset)
**Test ID**: `FU-931-PERF-001`
**Description**: Measure query latency with 1k records
**Test Steps:**
1. Create 1,000 records with embeddings
2. Run 100 queries with different embeddings
3. Measure P50, P95, P99 latency
**Expected Results:**
- P50 < 10ms
- P95 < 20ms
- P99 < 30ms
**Pass Criteria**: P95 < 50ms (acceptance criteria)
#### Test 2.2: Query Latency (Medium Dataset)
**Test ID**: `FU-931-PERF-002`
**Description**: Measure query latency with 10k records
**Test Steps:**
1. Create 10,000 records with embeddings
2. Run 100 queries with different embeddings
3. Measure P50, P95, P99 latency
**Expected Results:**
- P50 < 15ms
- P95 < 30ms
- P99 < 50ms
**Pass Criteria**: P95 < 50ms (acceptance criteria)
#### Test 2.3: Query Latency (Large Dataset)
**Test ID**: `FU-931-PERF-003`
**Description**: Measure query latency with 100k records
**Test Steps:**
1. Create 100,000 records with embeddings
2. Run 100 queries with different embeddings
3. Measure P50, P95, P99 latency
**Expected Results:**
- P50 < 20ms
- P95 < 50ms
- P99 < 100ms
**Pass Criteria**: P95 < 50ms (acceptance criteria)
#### Test 2.4: Network Transfer
**Test ID**: `FU-932-PERF-001`
**Description**: Measure network transfer reduction
**Test Steps:**
1. Intercept network traffic for vector search query
2. Measure total bytes transferred (request + response)
3. Compare before (JavaScript similarity) vs after (RPC)
**Expected Results:**
- **Before**: ~1.5MB per query (full records with embeddings)
- **After**: <100KB per query (similarity computed in database)
- **Improvement**: >15x reduction
**Pass Criteria**: Network transfer < 100KB per query
#### Test 2.5: Concurrent Load
**Test ID**: `FU-931-PERF-004`
**Description**: Measure performance under concurrent load
**Test Steps:**
1. Create 100,000 records with embeddings
2. Run 50 concurrent queries
3. Measure average latency and throughput
**Expected Results:**
- Average latency < 100ms
- Throughput > 50 queries/second
- No significant degradation under load
**Pass Criteria**: Average latency < 200ms, no errors
### 3. Index Verification Tests
#### Test 3.1: Index Existence
**Test ID**: `FU-931-IDX-001`
**Description**: Verify HNSW index exists
**Test Steps:**
1. Query `pg_indexes` for `idx_records_embedding_hnsw`
2. Verify index exists and is HNSW type
**SQL Query:**
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'records' 
  AND indexname LIKE '%embedding%';
```
**Expected Result**: `idx_records_embedding_hnsw` with HNSW index type
**Pass Criteria**: Index exists and uses HNSW
#### Test 3.2: Index Usage
**Test ID**: `FU-931-IDX-002`
**Description**: Verify RPC function uses HNSW index
**Test Steps:**
1. Run `EXPLAIN ANALYZE` on RPC function
2. Verify execution plan shows index scan
3. Verify no sequential scan
**SQL Query:**
```sql
EXPLAIN ANALYZE
SELECT * FROM search_records_by_embedding(
  ARRAY[0.1, 0.2, ...],
  NULL,
  10,
  0.0
);
```
**Expected Result**: Execution plan shows "Index Scan using idx_records_embedding_hnsw"
**Pass Criteria**: Index scan used, no sequential scan
#### Test 3.3: Index Performance
**Test ID**: `FU-931-IDX-003`
**Description**: Compare HNSW vs IVFFlat performance
**Test Steps:**
1. Create 100,000 records with embeddings
2. Measure query latency with HNSW index
3. (Optional) Measure query latency with IVFFlat for comparison
**Expected Results:**
- HNSW: P95 < 50ms
- IVFFlat: P95 > 100ms (expected degradation at 100k records)
- **Improvement**: 2x or better
**Pass Criteria**: HNSW meets performance targets
### 4. Backward Compatibility Tests
#### Test 4.1: Result Structure
**Test ID**: `FU-932-COMPAT-001`
**Description**: Verify result structure unchanged
**Test Steps:**
1. Call vector search via `/retrieve_records` endpoint
2. Verify result structure matches previous implementation
3. Verify all fields present (id, type, properties, etc.)
**Expected Result Fields:**
```typescript
{
  id: string;
  type: string;
  properties: Record<string, unknown>;
  file_urls: string[];
  external_source?: string;
  external_id?: string;
  external_hash?: string;
  embedding?: number[];
  summary?: string;
  created_at: string;
  updated_at: string;
  similarity: number; // computed field
}
```
**Pass Criteria**: All fields present, types correct
#### Test 4.2: API Compatibility
**Test ID**: `FU-932-COMPAT-002`
**Description**: Verify `/retrieve_records` API unchanged
**Test Steps:**
1. Call `/retrieve_records` with semantic search
2. Verify request parameters unchanged
3. Verify response format unchanged
**Request Parameters:**
```typescript
{
  search: string[];
  search_mode: "semantic" | "keyword" | "both";
  similarity_threshold: number;
  limit: number;
}
```
**Pass Criteria**: No breaking changes to API
#### Test 4.3: Error Handling
**Test ID**: `FU-932-COMPAT-003`
**Description**: Verify error handling backward compatible
**Test Steps:**
1. Call RPC function with invalid parameters
2. Verify error messages informative
3. Verify no regression in error handling
**Test Cases:**
- Invalid embedding dimension (not 1536)
- Invalid similarity threshold (< 0 or > 1)
- Invalid limit (negative)
**Pass Criteria**: Errors handled gracefully, messages informative
### 5. Load Tests
#### Test 5.1: Sustained Load
**Test ID**: `FU-931-LOAD-001`
**Description**: Measure performance under sustained load
**Test Steps:**
1. Create 100,000 records with embeddings
2. Run 1000 queries over 10 minutes
3. Measure latency over time
4. Verify no degradation
**Expected Results:**
- Consistent latency (no degradation over time)
- P95 < 50ms throughout test
- No memory leaks or errors
**Pass Criteria**: Stable performance, no degradation
#### Test 5.2: Spike Load
**Test ID**: `FU-931-LOAD-002`
**Description**: Measure performance under spike load
**Test Steps:**
1. Create 100,000 records with embeddings
2. Run 200 concurrent queries (spike)
3. Measure latency during spike
4. Measure recovery time
**Expected Results:**
- Average latency < 200ms during spike
- Recovery time < 5 seconds
- No errors or timeouts
**Pass Criteria**: System handles spike gracefully
### 6. Rollback Tests
#### Test 6.1: Index Rollback
**Test ID**: `FU-931-ROLLBACK-001`
**Description**: Verify rollback to IVFFlat works
**Test Steps:**
1. Drop HNSW index
2. Recreate IVFFlat index
3. Verify RPC function still works
4. Measure performance (should be acceptable for <100k records)
**Rollback SQL:**
```sql
DROP INDEX IF EXISTS idx_records_embedding_hnsw;
CREATE INDEX idx_records_embedding 
  ON records USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);
```
**Pass Criteria**: System functional after rollback
#### Test 6.2: Code Rollback
**Test ID**: `FU-932-ROLLBACK-001`
**Description**: Verify code rollback works
**Test Steps:**
1. Revert code changes in `src/actions.ts` and `src/server.ts`
2. Verify JavaScript similarity calculation works
3. Verify results correct (should match RPC results)
**Pass Criteria**: System functional after code rollback
### Test Execution Order
**Phase 1: Functional Tests** (after FU-930 complete)
- Test 1.1 - 1.4: RPC function correctness
**Phase 2: Index Verification** (after FU-931 complete)
- Test 3.1 - 3.3: HNSW index verification
**Phase 3: Performance Benchmarks** (after FU-931 complete)
- Test 2.1 - 2.3: Query latency benchmarks
**Phase 4: Integration Tests** (after FU-932 complete)
- Test 2.4: Network transfer measurement
- Test 4.1 - 4.3: Backward compatibility
**Phase 5: Load Tests** (after FU-932 complete)
- Test 2.5, 5.1 - 5.2: Load and concurrent testing
**Phase 6: Rollback Tests** (before deployment)
- Test 6.1 - 6.2: Rollback verification
### Success Criteria
**All Tests Must Pass:**
1. ✅ Functional tests: 100% pass rate
2. ✅ Performance benchmarks: P95 < 50ms, network transfer < 100KB
3. ✅ Index verification: HNSW index used, no sequential scans
4. ✅ Backward compatibility: No breaking changes
5. ✅ Load tests: Stable performance under load
6. ✅ Rollback tests: Rollback procedures work
**Deployment Blockers:**
- Any functional test failure
- Performance regression > 10% of baseline
- Backward compatibility breaks
- Rollback procedure fails
### Test Automation
**Automated Tests** (run in CI/CD):
- Functional tests (Test 1.1 - 1.4)
- Backward compatibility (Test 4.1 - 4.3)
- Basic performance (Test 2.1 - 2.2)
**Manual Tests** (run before deployment):
- Performance benchmarks at scale (Test 2.3, 2.5)
- Index verification (Test 3.1 - 3.3)
- Load tests (Test 5.1 - 5.2)
- Rollback tests (Test 6.1 - 6.2)
**Test Framework**: Vitest (unit/integration), Playwright (E2E), k6 (load testing)
### Test Data Management
**Test Data Generation:**
```typescript
// Generate test embeddings
function generateTestEmbedding(seed: number): number[] {
  const embedding = new Array(1536);
  for (let i = 0; i < 1536; i++) {
    embedding[i] = Math.sin(seed * i) * 0.5 + 0.5;
  }
  return embedding;
}
// Normalize embedding to unit vector
function normalizeEmbedding(embedding: number[]): number[] {
  const norm = Math.sqrt(
    embedding.reduce((sum, val) => sum + val * val, 0)
  );
  return embedding.map(val => val / norm);
}
```
**Test Data Cleanup:**
- Delete test records after each test
- Use transaction rollback for isolation
- Separate test database for load tests
### Monitoring During Tests
**Metrics to Monitor:**
- Query latency (P50, P95, P99)
- Network transfer (bytes per query)
- Database CPU usage
- Database memory usage
- Error rate
- Index scan vs sequential scan ratio
**Monitoring Tools:**
- Supabase dashboard (query performance)
- PostgreSQL `pg_stat_statements` (query stats)
- Network monitoring (bytes transferred)
- Application logs (errors)
### Test Report Template
**Test Execution Report:**
```markdown
## v2.2.0 Test Execution Report
**Date**: [date]
**Tester**: [name]
**Environment**: [staging/production]
### Summary
- Total Tests: [count]
- Passed: [count]
- Failed: [count]
- Skipped: [count]
### Results by Category
**Functional Tests**: [passed/total]
**Performance Benchmarks**: [passed/total]
**Index Verification**: [passed/total]
**Backward Compatibility**: [passed/total]
**Load Tests**: [passed/total]
**Rollback Tests**: [passed/total]
### Performance Metrics
- Query Latency P95: [value] ms (target: < 50ms)
- Network Transfer: [value] KB (target: < 100KB)
- Latency Improvement: [factor]x
### Issues Found
[List of issues with severity and resolution]
### Recommendation
[ ] PASS - Ready for deployment
[ ] FAIL - Deployment blocked, issues must be resolved
```
