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
Neotoma's current subsystems are all **strongly consistent** (see §2.1); no subsystem is bounded-eventual today. The bounded-eventual model is defined here as forward-looking guidance: if a future subsystem ever needs it, it MUST be bounded, never unbounded eventual.
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
| **Full-Text Search Index**                                   | Strong            | 0s        | Immediate display          |
| **Vector Embeddings Index**                                  | Strong¹           | 0s        | Immediate display          |
| **Cross-Entity Search**                                      | Strong¹           | 0s        | Immediate display          |
| **Provenance Metadata**                                      | Strong            | 0s        | Immediate display          |
| **Auth Permissions**                                         | Strong            | 0s        | Block on permission change |

¹ **Embeddings are generated synchronously during snapshot upsert**, not on a deferred/async lag. `prepareEntitySnapshotWithEmbedding` (`src/services/entity_snapshot_embedding.ts`) awaits `generateEmbedding` inline, and every caller (`src/server.ts`, `src/actions.ts`, `src/services/interpretation.ts`) awaits it before the `entity_snapshots` upsert. The embedding is committed in the same store path as the snapshot, so an entity is semantically searchable as soon as its store call returns — provided an embedding provider is configured (`OPENAI_API_KEY`). When no provider is configured, embedding is skipped and semantic search degrades to keyword/lexical matching (still strongly consistent, just not vector-ranked). This is a change from an earlier design that treated embeddings as bounded-eventual (~10s); the synchronous behavior is the current contract.

### 2.1.1 Read-after-write contract (for interactive callers)

For callers issuing a query immediately after a store in the same turn (e.g. an interactive chat assistant), the guarantee is:

- **Structured retrieval is strongly consistent.** `retrieve_entities` (by id, by canonical name, by filter), `retrieve_entity_snapshot`, `retrieve_related_entities`, and `retrieve_graph_neighborhood` reflect a just-completed store with no lag. A fact stored in this turn is readable in this turn.
- **Semantic search is strongly consistent with respect to the write when an embedding provider is configured**, because the embedding is written in the same synchronous path (¹ above). With no provider configured, `search` falls back to keyword matching.
- **Practical guidance:** for read-after-write correctness in an interactive path, query the *structured* surface (id / canonical-name / filter), which is always strongly consistent. Treat semantic ranking as a best-effort relevance layer on top, not as the consistency boundary. No freshness token or "block until indexed" call is required — the structured read already reflects the write.

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
#### 2.2.5 Full-Text Search Index (Strong Consistency)
**What:**
- Lexical/substring search over entity canonical names (and, where present, content fields).
**Consistency Guarantee:**
- After a store returns, lexical search reflects the record immediately. There is **no** indexing delay and no "eventually" window.
**Implementation:**
- Search runs at request time against the committed rows; there is **no asynchronous indexer or background worker**. (A historical design treated this as bounded-eventual with a ~5s indexing lag and an "Indexing…" banner; that design was never the shipped behavior and the contract is now Strong — see footnote ¹ on the mapping table.)
**UI Behavior:**
- Results are immediate; no "Indexing new records…" banner is required.
**Testing:**
```typescript
test("a just-stored record is searchable immediately", async () => {
  const id = await store(record);
  const results = await search("invoice");
  expect(results.some((r) => r.id === id)).toBe(true); // no sleep needed
});
```
#### 2.2.6 Vector Embeddings Index (Strong Consistency¹)
**What:**
- Embeddings backing semantic/similarity search.
**Consistency Guarantee:**
- When an embedding provider is configured, the embedding is written **synchronously in the same store path** as the snapshot (see footnote ¹), so an entity is semantically searchable as soon as its store call returns — no deferred/async lag. With no provider configured, semantic ranking is skipped and search degrades to lexical matching (still strongly consistent, just not vector-ranked).
**Implementation:**
- `prepareEntitySnapshotWithEmbedding` awaits `generateEmbedding` inline; every caller awaits it before the `entity_snapshots` upsert. There is **no asynchronous embedding worker**. (A historical design treated embeddings as bounded-eventual ~10s; the synchronous behavior is the current contract.)
**UI Behavior:**
- No "Generating embeddings…" delay state; semantic results are available immediately when a provider is configured.
**Testing:**
```typescript
test("a just-stored entity is semantically searchable immediately", async () => {
  const id = await store(entity); // provider configured
  const results = await semanticSearch("acme corp");
  expect(results.some((e) => e.id === id)).toBe(true); // no sleep needed
});
```
#### 2.2.7 Cross-Entity Search (Strong Consistency)
**What:**
- Search across entity names (e.g., "find all entities mentioning Acme Corp").
**Consistency Guarantee:**
- After entity creation, entity search reflects it immediately; there is no indexing window.
**Implementation:**
- Same request-time evaluation as full-text search above; no asynchronous entity-name indexer.
**Testing:**
```typescript
test("a just-created entity is returned by entity search immediately", async () => {
  await storeEntity("Acme Corp");
  const results = await searchEntities("Acme");
  expect(results.some((e) => e.canonical_name === "Acme Corp")).toBe(true); // no sleep
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
- User permissions, workspace access, per-owner data isolation
**Consistency Guarantee:**
- After permission change, subsequent API calls MUST enforce new permissions immediately.
**Implementation:**
- Application-layer enforcement: every query resolves the caller via `getAuthenticatedUserId` and scopes by `user_id` (`.eq("user_id", userId)`) on each request. Database-level row-level security (RLS) is a possible future defense-in-depth layer, not the current mechanism — see [`docs/subsystems/auth.md`](../subsystems/auth.md#authorization).
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

_Forward-looking: no current subsystem is bounded-eventual (see §3.3). This pattern applies only if one is introduced later._

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

> **Note:** No Neotoma subsystem is currently bounded-eventual. Search, vector embeddings, and cross-entity search are all strongly consistent (synchronous; see §2.2.5–§2.2.7). The template below is forward-looking guidance for any bounded-eventual subsystem that may be introduced later — not a description of current behavior. Do not show an "indexing" delay banner for search today.

| Scenario                      | Message                                              | Action              |
| ----------------------------- | ---------------------------------------------------- | ------------------- |
| (Hypothetical) async indexing | "Indexing new records... results may be incomplete." | Show refresh button |
| No delay (current behavior)   | None                                                 | Display immediately |
## 4. Consistency and Determinism
### 4.1 Determinism Within Consistency Tiers
**Critical Distinction:**
- **Determinism:** Same input → same output (always)
- **Consistency:** When output becomes visible
**Both strong and eventual subsystems MUST be deterministic:**
**Example (Deterministic ranking — note: search itself is Strong, not eventual):**
```typescript
// Ranking is deterministic: the same query at the same state returns the
// same order. (Search is strongly consistent — this illustrates determinism,
// not an indexing delay.)
const results1 = await search("invoice");
const results2 = await search("invoice"); // same query, same state
// results1 === results2 (same order, same records)
```
**Forbidden (Non-Deterministic):**
```typescript
// ❌ Random ranking
const results = await search("invoice").sort(() => Math.random() - 0.5);
```
### 4.2 Testing Determinism in Eventual Systems

This pattern applies only if a bounded-eventual subsystem is introduced (none exists today; search is strongly consistent and needs no wait — see §6.2).

**Pattern (for a hypothetical bounded-eventual subsystem):**
1. Wait for the consistency window (e.g., 5s)
2. Issue the same query multiple times
3. Verify results are identical
```typescript
test("eventual subsystem is deterministic after convergence", async () => {
  await mutateEventualSubsystem(input);
  await sleep(CONSISTENCY_WINDOW_MS); // Wait for convergence
  const results1 = await queryEventualSubsystem(input);
  const results2 = await queryEventualSubsystem(input);
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
| `search`        | Strong           | Reflects a just-stored record immediately (no indexing lag); semantic ranking requires a configured embedding provider, else lexical |
| `create_entity` | Strong           | Returns only after entity committed      |
| `link`          | Strong           | Edge creation is transactional           |
### 5.2 MCP Response Metadata

> **Note:** All MCP actions in §5.1 are strongly consistent, so none emit this envelope today. The shape below is reserved for any bounded-eventual action introduced later — it is forward-looking guidance, not a description of a current response.

If a bounded-eventual MCP action is ever added, it SHOULD include consistency metadata:
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
AI agents could use such metadata to:
- Inform the user of potential staleness
- Retry the query after the delay
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
- E.g., a strong subsystem never returns stale data after a committed write; a bounded-eventual subsystem (none today) never exceeds its declared delay bound
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
  describe("Strong consistency (search)", () => {
    it("includes a just-stored record immediately (no indexing wait)", async () => {
      const recordId = await uploadFile(file);
      // Search is synchronous: the record is searchable on the next query.
      const results = await search("invoice");
      expect(results.some((r) => r.id === recordId)).toBe(true);
    });
    it("search results are deterministic at a fixed state", async () => {
      const results1 = await search("invoice");
      const results2 = await search("invoice");
      expect(results1).toEqual(results2);
    });
  });
  // If a bounded-eventual subsystem is ever introduced, add a
  // describe("Bounded eventual (...)") block here that waits for the declared
  // delay bound before asserting inclusion. None exists today.
});
```
## 7. Consistency Invariants (MUST/MUST NOT)
### MUST
1. **Core records MUST be strongly consistent** (immediate read-after-write)
2. **Graph edges MUST be strongly consistent** (transactional with records)
3. **Timeline events MUST be strongly consistent**
4. **Auth permissions MUST be strongly consistent** (immediate enforcement)
5. **Any bounded-eventual subsystem MUST bound its delay** (no unbounded eventual) — conditional; none exists today
6. **UI MUST inform the user of indexing delays** — only if a bounded-eventual subsystem exists; there is none today, so no "indexing…" banner is shown for search
7. **MCP MUST document consistency tier** per action
8. **Tests MUST verify consistency guarantees** (and, for any future bounded-eventual subsystem, its convergence)
9. **All subsystems MUST be deterministic** within their tier
10. **All writes MUST be durable** (no data loss)
### MUST NOT
1. **Core records MUST NOT be eventually consistent** (always strong)
2. **UI MUST NOT hide a real indexing delay** — applies only to a bounded-eventual subsystem (none today); do not invent an indexing banner for the strongly-consistent search
3. **Tests MUST NOT assume a bounded-eventual subsystem is immediate** — for today's strongly-consistent subsystems (including search) tests MUST NOT add `sleep()`/indexing waits
4. **Ranking MUST NOT be nondeterministic** (no random ordering)
5. **Strong subsystems MUST NOT use async indexing** (defeats guarantee) — search and embeddings are strong and therefore synchronous
6. **Any bounded-eventual subsystem MUST NOT lose writes** (durability required)
7. **MCP MUST NOT return inconsistent data** without a metadata warning
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
2. **Search and embeddings ARE strongly consistent (synchronous)** — search runs at request time against committed rows; embeddings are written inline in the same store path (see §2.2.5–§2.2.7 and footnote ¹). Do NOT reintroduce async indexing or a bounded-eventual tier for them.
3. **No current subsystem is bounded-eventual** — the bounded-eventual model in §1.2/§3/§6 is forward-looking guidance only. If a future subsystem adopts it, it MUST declare a bounded max delay in code and docs.
4. **UI MUST NOT show an "indexing…" message for search** — results are immediate. An indexing banner is reserved for a future bounded-eventual subsystem, should one be introduced.
5. **All subsystems MUST be deterministic** (no random ordering)
6. **Read-after-write tests for strong subsystems (including search) MUST NOT add `sleep()`/indexing waits**; wait-for-convergence is only for a future bounded-eventual subsystem.
7. **MCP responses for today's actions MUST NOT emit a consistency-delay envelope** (all §5.1 actions are Strong); that envelope is reserved for a future bounded-eventual action.
### Forbidden Patterns
- Making core records eventually consistent
- Reintroducing async indexing or an "indexing…" delay for search or embeddings (both are strong/synchronous)
- Nondeterministic ranking or ordering
- Unbounded eventual consistency (MVP)
- Adding `sleep()` to a read-after-write test for a strongly-consistent subsystem
- Caching auth permissions (must be fresh)
### Validation Checklist
- [ ] Consistency tier documented for new subsystems
- [ ] Strong consistency uses transactions
- [ ] Any new bounded-eventual subsystem (none today) has a documented max delay
- [ ] No "indexing…" message added for strongly-consistent subsystems (search, embeddings)
- [ ] Read-after-write tests for strong subsystems use no `sleep()`/indexing wait
- [ ] MCP actions document consistency guarantees
- [ ] Determinism preserved in all ranking logic
- [ ] No data loss in any consistency tier
