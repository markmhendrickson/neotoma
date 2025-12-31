# Neotoma Consistency Models — System-Wide Consistency Guarantees
## Scope
This document covers:
- Consistency model definitions (strong, bounded eventual, eventual)
- Consistency tier for each Neotoma subsystem
- UI handling rules for each tier
- Testing requirements for consistency-aware code
This document does NOT cover:
- Implementation details of indexes (see subsystem docs)
- Transaction isolation levels (database-specific)
- Distributed consensus (single-instance MVP)
## 1. Consistency Model Definitions
### 1.1 Strong Consistency
**Definition:**
After a write completes, all subsequent reads immediately reflect that write.
**Guarantees:**
- Read-after-write consistency (within same transaction or session)
- Linearizability: operations appear to occur atomically in a single global order
**Use When:**
- Critical correctness requirements (e.g., graph integrity)
- User expects immediate visibility (e.g., record metadata)
- Transactional semantics required
**Cost:**
- Higher latency (synchronous writes)
- Lower throughput (no batching)
### 1.2 Bounded Eventual Consistency
**Definition:**
After a write completes, subsequent reads MAY return stale data, but staleness is bounded by a **maximum delay** (e.g., 5 seconds).
**Guarantees:**
- Reads become consistent within a known time window
- No data loss (all writes eventually applied)
- Monotonic reads (no time travel)
**Use When:**
- Acceptable to show stale data briefly (e.g., search results)
- Performance critical (e.g., high-throughput indexing)
- Bounded delay is acceptable to users
**Cost:**
- Must communicate delay to user ("Indexing... results may be incomplete")
- More complex testing (must verify eventual convergence)
### 1.3 Eventual Consistency
**Definition:**
After a write completes, subsequent reads MAY return stale data for an **unbounded duration**, but all replicas will eventually converge.
**Guarantees:**
- No data loss (writes preserved)
- Eventually consistent (no time bound)
**Use When:**
- Non-critical data (e.g., analytics, caches)
- Very high throughput required
- Delay is not user-visible
**Cost:**
- Hardest to reason about
- Complex conflict resolution if applicable
**MVP Constraint:**
Neotoma MVP uses **bounded eventual consistency** where needed, never unbounded eventual consistency.
## 2. Consistency Tiers by Subsystem
### 2.1 Consistency Mapping Table
| Subsystem                                                    | Consistency Model | Max Delay | UI Handling                |
| ------------------------------------------------------------ | ----------------- | --------- | -------------------------- |
| **Core Records** (metadata)                                  | Strong            | 0s        | Immediate display          |
| **Observations** (creation, storage)                         | Strong            | 0s        | Immediate display          |
| **Entity Snapshots** (reducer output)                        | Strong            | 0s        | Immediate display          |
| **Snapshot Recomputation** (on new observation)              | Strong            | 0s        | Immediate display          |
| **Graph Edges** (record→entity, record→event, relationships) | Strong            | 0s        | Immediate display          |
| **Entities** (creation, linking)                             | Strong            | 0s        | Immediate display          |
| **Timeline Events**                                          | Strong            | 0s        | Immediate display          |
| **Full-Text Search Index**                                   | Bounded Eventual  | 5s        | "Indexing..." message      |
| **Vector Embeddings Index**                                  | Bounded Eventual  | 10s       | "Generating embeddings..." |
| **Cross-Entity Search**                                      | Bounded Eventual  | 5s        | "Indexing..." message      |
| **Provenance Metadata**                                      | Strong            | 0s        | Immediate display          |
| **Auth Permissions**                                         | Strong            | 0s        | Block on permission change |
### 2.2 Subsystem Details
#### 2.2.1 Core Records (Strong Consistency)
**What:**
- Record metadata: `id`, `schema_type`, `user_id`, `created_at`, `raw_text`, `extracted_fields`
**Consistency Guarantee:**
- After `upload_file` returns, subsequent `fetch_record(id)` MUST return the complete record immediately.
**Implementation:**
- Transactional INSERT into `records` table
- Commit before returning success to client
**UI Behavior:**
- Show record details immediately after upload
- No "loading..." state needed
**Testing:**
```typescript
test("record is immediately readable after upload", async () => {
  const recordId = await uploadFile(file);
  const record = await fetchRecord(recordId);
  expect(record).toBeDefined();
  expect(record.schema_type).toBe("FinancialRecord");
});
```
#### 2.2.2 Graph Edges (Strong Consistency)
**What:**
- Edges: `record → entity`, `record → event`, `event → entity`
**Consistency Guarantee:**
- After `upload_file` returns, graph queries MUST reflect all edges immediately.
**Implementation:**
- All edge inserts in same transaction as record insert
- COMMIT atomically
**UI Behavior:**
- Entity list and timeline show immediately after upload
- No "building graph..." message
**Testing:**
```typescript
test("graph edges exist immediately after record creation", async () => {
  const recordId = await uploadFile(file);
  const entities = await getRecordEntities(recordId);
  expect(entities.length).toBeGreaterThan(0);
});
```
#### 2.2.3 Entities (Strong Consistency)
**What:**
- Entity creation and canonical ID assignment
**Consistency Guarantee:**
- After entity resolution, subsequent queries for that entity MUST return it immediately.
**Implementation:**
- Entity INSERT in same transaction as record
- Unique constraint on `entity_id` ensures no duplicates
**UI Behavior:**
- Entity appears in entity list immediately
- Clicking entity shows all linked records immediately
**Testing:**
```typescript
test("entity is immediately queryable after creation", async () => {
  const recordId = await uploadFile(fileWithEntity);
  const entities = await getRecordEntities(recordId);
  const entityId = entities[0].id;
  const entity = await fetchEntity(entityId);
  expect(entity).toBeDefined();
});
```
#### 2.2.4 Timeline Events (Strong Consistency)
**What:**
- Events extracted from date fields
**Consistency Guarantee:**
- After `upload_file` returns, timeline queries MUST include new events immediately.
**Implementation:**
- Event INSERT in same transaction as record
- Timeline query sorted by `event_timestamp`
**UI Behavior:**
- Timeline view shows new events immediately after upload
- No "generating timeline..." delay
**Testing:**
```typescript
test("events appear in timeline immediately", async () => {
  const recordId = await uploadFile(invoiceFile);
  const events = await getTimelineEvents(userId);
  const invoiceEvent = events.find((e) => e.source_record_id === recordId);
  expect(invoiceEvent).toBeDefined();
  expect(invoiceEvent.event_type).toBe("InvoiceIssued");
});
```
#### 2.2.5 Full-Text Search Index (Bounded Eventual Consistency)
**What:**
- Text search over `raw_text` and `extracted_fields`
**Consistency Guarantee:**
- After `upload_file` returns, search MAY NOT return the record for up to **5 seconds**.
- After 5 seconds, search MUST return the record if query matches.
**Implementation:**
- Asynchronous indexing (background worker or pg_trgm index rebuild)
- Indexing job triggered on record insert
**UI Behavior:**
- Show "Indexing new records..." banner if recent upload
- After 5s delay, automatically refresh search results
- Do NOT block user on indexing
**Testing:**
```typescript
test("search returns record within 5 seconds", async () => {
  const recordId = await uploadFile(file);
  // Immediately after upload, MAY NOT be in search results
  const immediateResults = await search("invoice");
  // No assertion here (allowed to be absent)
  // Wait 5 seconds (bounded delay)
  await sleep(5000);
  // MUST be in results now
  const delayedResults = await search("invoice");
  expect(delayedResults.some((r) => r.id === recordId)).toBe(true);
});
```
**UI Message:**
```typescript
{
  isIndexing && (
    <Banner type="info">
      Indexing new records... search results may be incomplete.
      <RefreshButton onClick={retrySearch} />
    </Banner>
  );
}
```
#### 2.2.6 Vector Embeddings Index (Bounded Eventual Consistency)
**What:**
- Embeddings for hybrid search (future feature)
**Consistency Guarantee:**
- After `upload_file` returns, embeddings MAY NOT exist for up to **10 seconds**.
- After 10 seconds, embeddings MUST be available.
**Implementation:**
- Asynchronous embedding generation (background worker calls OpenAI)
- Batching for efficiency
**UI Behavior:**
- Show "Generating embeddings..." message
- Hybrid search results may exclude recent records temporarily
- Automatically refresh after 10s
**Testing:**
```typescript
test("embeddings generated within 10 seconds", async () => {
  const recordId = await uploadFile(file);
  await sleep(10000); // Max delay
  const record = await fetchRecord(recordId);
  expect(record.embedding).toBeDefined();
  expect(record.embedding.length).toBe(1536); // OpenAI ada-002 dimension
});
```
#### 2.2.7 Cross-Entity Search (Bounded Eventual Consistency)
**What:**
- Search across entity names (e.g., "Find all records mentioning Acme Corp")
**Consistency Guarantee:**
- After entity creation, entity search MAY NOT return it for up to **5 seconds**.
**Implementation:**
- Entity name indexed asynchronously (same as full-text search)
**UI Behavior:**
- Same as full-text search ("Indexing...")
**Testing:**
```typescript
test("entity search returns entity within 5 seconds", async () => {
  const recordId = await uploadFileWithEntity("Acme Corp");
  await sleep(5000);
  const results = await searchEntities("Acme");
  expect(results.some((e) => e.canonical_name === "Acme Corp")).toBe(true);
});
```
#### 2.2.8 Provenance Metadata (Strong Consistency)
**What:**
- `source_file`, `ingestion_timestamp`, `user_id`, etc.
**Consistency Guarantee:**
- Provenance MUST be immediately available after record creation.
**Implementation:**
- Stored in `records` table alongside core metadata
- Same transaction as record insert
**UI Behavior:**
- Show provenance immediately in record detail view
#### 2.2.9 Observations (Strong Consistency)
**What:**
- Observation records: `id`, `entity_id`, `entity_type`, `schema_version`, `source_record_id`, `observed_at`, `fields`, `specificity_score`, `source_priority`
**Consistency Guarantee:**
- After observation creation, subsequent queries for observations MUST return the observation immediately.
- Observations are immutable once created.
**Implementation:**
- Transactional INSERT into `observations` table
- Commit before returning success
- Observations linked to source_record_id atomically
**UI Behavior:**
- Observations available immediately after creation
- Provenance queries return observations immediately
**Testing:**
```typescript
test("observation is immediately readable after creation", async () => {
  const observation = await createObservation(observationData);
  const fetched = await fetchObservation(observation.id);
  expect(fetched).toBeDefined();
  expect(fetched.entity_id).toBe(observationData.entity_id);
});
```
#### 2.2.10 Entity Snapshots (Strong Consistency)
**What:**
- Entity snapshot records: `entity_id`, `entity_type`, `schema_version`, `snapshot`, `provenance`, `computed_at`, `observation_count`
**Consistency Guarantee:**
- After snapshot computation, subsequent queries for snapshots MUST return the snapshot immediately.
- Snapshots are recomputed synchronously when new observations arrive.
**Implementation:**
- Reducer computes snapshot from observations
- Transactional UPSERT into `entity_snapshots` table
- Commit before returning success
- Snapshot computation is synchronous (not async)
**UI Behavior:**
- Snapshots available immediately after computation
- Entity detail views show snapshots immediately
- Provenance panel shows snapshot provenance immediately
**Testing:**
```typescript
test("snapshot is immediately readable after computation", async () => {
  await createObservation(observationData);
  const snapshot = await fetchSnapshot(entityId);
  expect(snapshot).toBeDefined();
  expect(snapshot.observation_count).toBeGreaterThan(0);
  expect(snapshot.provenance).toBeDefined();
});
```
**Snapshot Recomputation:**
- Snapshots are recomputed synchronously when new observations arrive
- No eventual consistency delay for snapshot updates
- Reducer execution is part of observation creation transaction
#### 2.2.11 Auth Permissions (Strong Consistency)
**What:**
- User permissions, workspace access, RLS policies
**Consistency Guarantee:**
- After permission change, subsequent API calls MUST enforce new permissions immediately.
**Implementation:**
- Row-level security (RLS) evaluated per query
- No caching of permissions
**UI Behavior:**
- Block user immediately if permission revoked
- Grant access immediately if permission added
**Testing:**
```typescript
test("permission change takes effect immediately", async () => {
  await revokeAccess(userId, recordId);
  await expect(fetchRecord(recordId, userId)).rejects.toThrow("Forbidden");
});
```
## 3. UI Handling Rules by Consistency Tier
### 3.1 Strong Consistency (No Special Handling)
**Rules:**
- Display data immediately after write
- No "loading..." or "indexing..." messages
- User expects instant feedback
**Example:**
```typescript
const handleUpload = async (file: File) => {
  const record = await uploadFile(file); // Blocks until committed
  navigate(`/records/${record.id}`); // Show immediately
};
```
### 3.2 Bounded Eventual Consistency (Show Delay Message)
**Rules:**
- Inform user of indexing delay
- Provide refresh mechanism
- Auto-refresh after max delay
- Show stale results with warning
**Example:**
```typescript
const SearchResults = () => {
  const [isIndexing, setIsIndexing] = useState(false);
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (recentUpload && Date.now() - recentUpload.timestamp < 5000) {
      setIsIndexing(true);
      setTimeout(() => {
        setIsIndexing(false);
        refetchResults();
      }, 5000);
    }
  }, [recentUpload]);
  return (
    <>
      {isIndexing && (
        <Banner type="info">
          Indexing new records... results may be incomplete.
          <RefreshButton onClick={refetchResults} />
        </Banner>
      )}
      <ResultsList results={results} />
    </>
  );
};
```
### 3.3 UI Message Templates
| Scenario               | Message                                                  | Action                 |
| ---------------------- | -------------------------------------------------------- | ---------------------- |
| Search during indexing | "Indexing new records... results may be incomplete."     | Show refresh button    |
| Embedding generation   | "Generating embeddings for hybrid search... (up to 10s)" | Auto-refresh after 10s |
| No delay               | None                                                     | Display immediately    |
## 4. Consistency and Determinism
### 4.1 Determinism Within Consistency Tiers
**Critical Distinction:**
- **Determinism:** Same input → same output (always)
- **Consistency:** When output becomes visible
**Both strong and eventual subsystems MUST be deterministic:**
**Example (Bounded Eventual, but Deterministic):**
```typescript
// Search indexing is eventual, but ranking is deterministic
const results1 = await search("invoice"); // After indexing
const results2 = await search("invoice"); // Same query, same time
// results1 === results2 (same order, same records)
```
**Forbidden (Non-Deterministic):**
```typescript
// ❌ Random ranking
const results = await search("invoice").sort(() => Math.random() - 0.5);
```
### 4.2 Testing Determinism in Eventual Systems
**Pattern:**
1. Wait for consistency window (e.g., 5s)
2. Issue same query multiple times
3. Verify results are identical
```typescript
test("search is deterministic after indexing", async () => {
  const recordId = await uploadFile(file);
  await sleep(5000); // Wait for indexing
  const results1 = await search("invoice");
  const results2 = await search("invoice");
  expect(results1).toEqual(results2); // Deterministic order
});
```
## 5. Consistency and MCP Actions
### 5.1 MCP Action Consistency Guarantees
| MCP Action      | Consistency      | Notes                                    |
| --------------- | ---------------- | ---------------------------------------- |
| `upload_file`   | Strong           | Returns only after full commit           |
| `fetch_record`  | Strong           | Always returns latest committed state    |
| `list_records`  | Strong           | Metadata list is strongly consistent     |
| `search`        | Bounded Eventual | May not include records uploaded <5s ago |
| `create_entity` | Strong           | Returns only after entity committed      |
| `link`          | Strong           | Edge creation is transactional           |
### 5.2 MCP Response Metadata
MCP actions on eventual subsystems SHOULD include consistency metadata:
```json
{
  "results": [
    /* records */
  ],
  "consistency": {
    "indexed_up_to": "2024-01-15T10:30:00Z",
    "delay_seconds": 2.5,
    "complete": false
  }
}
```
AI agents can use this to:
- Inform user of potential staleness
- Retry query after delay
- Adjust confidence in results
## 6. Testing Consistency-Sensitive Code
### 6.1 Test Categories
**Strong Consistency Tests (Unit + Integration):**
- Verify immediate read-after-write
- No sleep() or retry logic needed
**Bounded Eventual Tests (Integration + E2E):**
- Test immediate read (MAY fail, allowed)
- Wait for max delay (MUST succeed)
- Verify deterministic results after convergence
**Consistency Violation Tests:**
- Verify system never violates consistency guarantees
- E.g., search never returns data older than 5s after indexing completes
### 6.2 Example Test Suite
```typescript
describe("Consistency guarantees", () => {
  describe("Strong consistency (records)", () => {
    it("returns record immediately after upload", async () => {
      const recordId = await uploadFile(file);
      const record = await fetchRecord(recordId);
      expect(record).toBeDefined();
    });
  });
  describe("Bounded eventual (search)", () => {
    it("returns record within 5 seconds in search", async () => {
      const recordId = await uploadFile(file);
      // Optional: check immediate results (may or may not include record)
      const immediate = await search("invoice");
      // Wait for max delay
      await sleep(5000);
      // MUST include record now
      const delayed = await search("invoice");
      expect(delayed.some((r) => r.id === recordId)).toBe(true);
    });
    it("search results are deterministic after indexing", async () => {
      await sleep(5000); // Ensure indexing complete
      const results1 = await search("invoice");
      const results2 = await search("invoice");
      expect(results1).toEqual(results2);
    });
  });
});
```
## 7. Consistency Invariants (MUST/MUST NOT)
### MUST
1. **Core records MUST be strongly consistent** (immediate read-after-write)
2. **Graph edges MUST be strongly consistent** (transactional with records)
3. **Timeline events MUST be strongly consistent**
4. **Auth permissions MUST be strongly consistent** (immediate enforcement)
5. **Eventual subsystems MUST bound their delay** (no unbounded eventual)
6. **UI MUST inform user of indexing delays** (bounded eventual only)
7. **MCP MUST document consistency tier** per action
8. **Tests MUST verify consistency guarantees** (especially bounded eventual)
9. **All subsystems MUST be deterministic** within their tier
10. **All writes MUST be durable** (no data loss)
### MUST NOT
1. **Core records MUST NOT be eventually consistent** (always strong)
2. **UI MUST NOT hide indexing delays** (must inform user)
3. **Tests MUST NOT assume eventual is immediate** (must wait for max delay)
4. **Ranking MUST NOT be nondeterministic** (no random ordering)
5. **Strong subsystems MUST NOT use async indexing** (defeats guarantee)
6. **Eventual subsystems MUST NOT lose writes** (durability required)
7. **MCP MUST NOT return inconsistent data** without metadata warning
8. **Permissions MUST NOT be eventually consistent** (security risk)
## 8. Future Consistency Considerations
### 8.1 Multi-Region Consistency (Future)
If Neotoma scales to multi-region:
- **Core records:** Use distributed consensus (Raft, Paxos)
- **Search indexes:** Regional replicas with bounded cross-region delay
- **Embeddings:** Regional generation with eventual global consistency
### 8.2 Offline-First Clients (Future)
If supporting offline clients:
- **Conflict resolution:** CRDTs for offline writes
- **Sync guarantees:** Eventual consistency with conflict detection
### 8.3 Real-Time Collaboration (Future)
If multiple users edit same workspace:
- **Optimistic UI:** Show local writes immediately, reconcile on conflict
- **Operational transforms:** For collaborative editing
**MVP Constraint:** Single-user, online-only, no real-time collaboration.
## Agent Instructions
### When to Load This Document
Load `docs/architecture/consistency.md` when:
- Implementing search or indexing logic
- Working with async operations (background workers, queues)
- Building UI for data that may be stale
- Writing tests for eventual consistency
- Designing new subsystems (determine consistency tier)
- Debugging consistency-related bugs
### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md` (determinism requirements)
- `docs/architecture/architecture.md` (layer boundaries)
- `docs/architecture/determinism.md` (deterministic ranking)
- `docs/subsystems/search/search.md` (search indexing)
- `docs/subsystems/events.md` (event emission)
### Constraints Agents Must Enforce
1. **Core records, graph, timeline, auth MUST be strong consistency**
2. **Search and embeddings MUST be bounded eventual (not unbounded)**
3. **Max delays: search 5s, embeddings 10s** (document in code)
4. **UI MUST show "indexing..." message for bounded eventual**
5. **All subsystems MUST be deterministic** (no random ordering)
6. **Tests MUST wait for max delay** in bounded eventual tests
7. **MCP responses MUST include consistency metadata** for eventual actions
### Forbidden Patterns
- Making core records eventually consistent
- Hiding indexing delays from users
- Nondeterministic ranking or ordering
- Unbounded eventual consistency (MVP)
- Testing eventual systems without sleep()
- Caching auth permissions (must be fresh)
### Validation Checklist
- [ ] Consistency tier documented for new subsystems
- [ ] Strong consistency uses transactions
- [ ] Bounded eventual has documented max delay
- [ ] UI shows indexing messages for eventual subsystems
- [ ] Tests wait for max delay in eventual tests
- [ ] MCP actions document consistency guarantees
- [ ] Determinism preserved in all ranking logic
- [ ] No data loss in any consistency tier
