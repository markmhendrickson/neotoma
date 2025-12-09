## Release v0.1.0 — Cross-FU Integration Tests

_(End-to-end flows spanning multiple Feature Units, MCP-only validation)_

---

### 1. Purpose

Define the **integration test suite** for Release `v0.1.0` (Internal MCP Release). These tests:

- Span multiple Feature Units.
- Validate the full Truth Layer pipeline via MCP (ingestion → extraction → entities → events → graph → search).
- Are required to pass before release approval.
- Validate determinism and graph integrity.

---

### 2. Test Matrix (High-Level)

| ID     | Name                              | Batches Covered | FUs Involved                                    |
| ------ | --------------------------------- | --------------- | ----------------------------------------------- |
| IT-001 | File Upload → Extraction → Query  | 1, 2, 3, 4, 6   | FU-100, FU-101, FU-102, FU-103, FU-105, FU-205 |
| IT-002 | Entity Resolution Validation      | 1, 2, 3, 6      | FU-100, FU-101, FU-103, FU-205                  |
| IT-003 | Timeline Event Validation         | 1, 2, 3, 6      | FU-100, FU-102, FU-103, FU-205                  |
| IT-004 | Graph Integrity Validation       | 3, 6            | FU-103, FU-205                                  |
| IT-005 | Determinism Validation           | 1, 2, 3, 4, 6   | FU-100, FU-101, FU-102, FU-103, FU-105, FU-205 |
| IT-006 | MCP Action Validation            | 5, 6            | FU-200, FU-201, FU-202, FU-203, FU-204, FU-206 |
| IT-007 | Event-Sourcing Validation        | 0.5, 0.6, 5     | FU-050, FU-051, FU-052, FU-053, FU-054, FU-201, FU-203, FU-204 |

---

### 3. Test Definitions

#### IT-001: File Upload → Extraction → Query Flow

**Goal:** Verify that file upload via MCP triggers full pipeline (extraction → entities → events → graph → search).

**Preconditions:**
- System running with all Batch 1-6 FUs deployed.
- MCP server accessible from test client.
- Test files available (PDF invoice, receipt, statement).

**Steps:**
1. Call MCP `upload_file` action with PDF file path.
2. Wait for ingestion to complete.
3. Call MCP `retrieve_records` with filters (type, properties).
4. Inspect response:
   - Extracted fields present and correct.
   - Entities resolved and linked.
   - Events generated with correct timestamps.
5. Call `retrieve_records` with search terms.
6. Verify deterministic ranking (same query → same order).

**Expected Results:**
- Correct schema type assigned.
- Fields extracted deterministically.
- Entities and events created and linked in graph.
- Search results deterministic and correct.

**Machine-Checkable:**
- `upload_file` returns record with `id`, `type`, `properties`.
- `retrieve_records` returns records with deterministic ordering.
- Graph integrity queries return 0 orphans.

---

#### IT-002: Entity Resolution Validation

**Goal:** Verify that entity resolution produces canonical IDs across multiple documents.

**Preconditions:**
- System running with FU-100, FU-101, FU-103, FU-205 deployed.
- Test files with entity name variations (e.g., "Acme Corp" and "ACME CORP").

**Steps:**
1. Upload document 1 containing "Acme Corp" via `upload_file`.
2. Upload document 2 containing "ACME CORP" via `upload_file`.
3. Query both records via `retrieve_records`.
4. Extract entity IDs from both records.
5. Verify both records link to same entity_id.

**Expected Results:**
- Same entity name (normalized) → same entity_id.
- Both records link to same entity in graph.
- Entity ID is deterministic hash-based.

**Machine-Checkable:**
- Query: `SELECT entity_id FROM record_entities WHERE record_id IN (...) GROUP BY entity_id HAVING COUNT(*) > 1` returns expected entity.
- Entity ID format: `ent_{sha256(type:normalized_name)}`.

---

#### IT-003: Timeline Event Validation

**Goal:** Verify that date fields in documents generate timeline events correctly.

**Preconditions:**
- System running with FU-100, FU-102, FU-103, FU-205 deployed.
- Test file with date fields (e.g., invoice with `date_issued`, `date_due`).

**Steps:**
1. Upload document with date fields via `upload_file`.
2. Query events via graph (or retrieve record and inspect events).
3. Verify:
   - Events generated for each date field.
   - Event timestamps correct (ISO 8601).
   - Events linked to source record.
   - Events ordered chronologically.

**Expected Results:**
- Date fields → events generated.
- Event IDs deterministic (hash-based).
- Timeline ordering correct.

**Machine-Checkable:**
- Query: `SELECT COUNT(*) FROM events WHERE source_record_id = '{record_id}'` returns expected count.
- Events sorted by `event_timestamp` ASC.

---

#### IT-004: Graph Integrity Validation

**Goal:** Verify that graph insertion maintains integrity (no orphans, no cycles).

**Preconditions:**
- System running with FU-103, FU-205 deployed.
- Multiple test files for upload.

**Steps:**
1. Upload multiple documents via `upload_file`.
2. Query graph integrity:
   - Count orphan events (events without source_record).
   - Count orphan entities (entities without records).
   - Detect cycles in graph.
3. Verify all inserts were transactional (all-or-nothing).

**Expected Results:**
- 0 orphan nodes.
- 0 cycles.
- All inserts transactional.

**Machine-Checkable:**
- Query: `SELECT COUNT(*) FROM events WHERE record_id NOT IN (SELECT id FROM records)` = 0
- Query: `SELECT COUNT(*) FROM record_entities WHERE entity_id NOT IN (SELECT id FROM entities)` = 0
- Cycle detection query returns empty.

---

#### IT-005: Determinism Validation

**Goal:** Verify that same input produces identical output (100% deterministic).

**Preconditions:**
- System running with all FUs deployed.
- Test file for repeated uploads.

**Steps:**
1. Upload same file 100 times via `upload_file`.
2. For each upload, record:
   - Record ID (should be same due to deduplication or different due to timestamps)
   - Schema type (must be identical)
   - Extracted fields (must be identical)
   - Entity IDs (must be identical)
   - Event IDs (must be identical)
3. Run same query 100 times via `retrieve_records`.
4. Verify query results identical (same order, same records).

**Expected Results:**
- Same file → same extraction (100% deterministic).
- Same query → same order (100% deterministic).
- Entity IDs stable across uploads.

**Machine-Checkable:**
- Property-based test: 100 runs, assert all outputs identical (modulo timestamps/IDs).
- Query determinism test: 100 runs, assert same order.

---

#### IT-006: MCP Action Validation

**Goal:** Verify that all 6 core MCP actions function correctly.

**Preconditions:**
- System running with all MCP FUs deployed.
- MCP server accessible from test client.

**Steps:**
1. **store_record**: Create record via `store_record`, verify response.
2. **retrieve_records**: Query records via `retrieve_records`, verify filters work.
3. **update_record**: Update record via `update_record`, verify changes.
4. **delete_record**: Delete record via `delete_record`, verify deletion.
5. **upload_file**: Upload file via `upload_file`, verify record created.
6. **get_file_url**: Get signed URL via `get_file_url`, verify URL accessible.

**Expected Results:**
- All 6 actions return structured responses.
- Error handling works (invalid input → error envelope).
- Actions behave deterministically.

**Machine-Checkable:**
- Each action has unit and integration tests.
- Error cases tested (validation errors, not found, etc.).

---

#### IT-007: Event-Sourcing Validation

**Goal:** Verify that event-sourcing foundation is operational (events emitted, reducers applied, historical replay functional).

**Preconditions:**
- System running with FU-050, FU-051, FU-052, FU-053, FU-054, FU-201, FU-203, FU-204 deployed.
- MCP server accessible from test client.

**Steps:**
1. Create record via `store_record` MCP action.
2. Verify event emitted to `state_events` table with correct schema (event_type, payload, timestamp, record_id, reducer_version).
3. Verify state reconstructed via reducer matches direct DB state in `records` table.
4. Update record via `update_record` MCP action.
5. Verify `RecordUpdated` event emitted with correct payload.
6. Verify state reconstructed via reducer matches updated DB state.
7. Delete record via `delete_record` MCP action.
8. Verify `RecordDeleted` event emitted.
9. Test historical replay: get record state at timestamp before update.
10. Verify reducer versioning: check reducer_version field in events.
11. Verify cryptographic fields (if implemented): check signer_public_key, signature fields.
12. Verify hash chaining (if implemented): check previous_event_hash, event_hash fields.

**Expected Results:**
- All state changes emit events to `state_events` table.
- Reducers reconstruct state correctly (matches direct DB state).
- Historical replay functional (can view record state at any timestamp).
- Event schema includes all required fields (reducer_version, crypto/hash fields if implemented).

**Machine-Checkable:**
- Query: `SELECT COUNT(*) FROM state_events WHERE record_id = '{record_id}'` returns expected count.
- Query: `SELECT * FROM state_events WHERE record_id = '{record_id}' ORDER BY timestamp` returns chronological events.
- Reducer test: Apply reducers to events, verify reconstructed state matches `records` table.
- Historical replay test: Get record state at timestamp T, verify matches expected state.

---

### 4. Execution per Batch

**After Batch 0.6:** Event-sourcing foundation tests (IT-007 partial: events emitted, reducers applied)

**After Batch 1:** Smoke tests (MCP server starts, basic file upload works)

**After Batch 4:** Graph integrity tests (IT-004), search determinism tests (partial IT-005)

**After Batch 5:** Event-sourcing MCP action tests (IT-007 complete: store_record, update_record, delete_record emit events)

**After Batch 6:** Full integration test suite (IT-001 through IT-007)

**Before Release:** Complete integration test suite must pass

---

### 5. Manual Validation Requirements

**Cursor Integration:**
- Connect Cursor to MCP server.
- Test `upload_file` and `retrieve_records` via Cursor.
- Verify responses match expected structure.

**ChatGPT Integration:**
- Connect ChatGPT to MCP server.
- Test `store_record` and `retrieve_records` via ChatGPT.
- Verify responses match expected structure.

---

### 6. Test Automation

All tests should be automated where possible:
- Unit tests for each FU.
- Integration tests for cross-FU flows.
- Property-based tests for determinism.
- E2E tests via MCP client.

Manual validation required only for Cursor/ChatGPT integration (external tools).

---

