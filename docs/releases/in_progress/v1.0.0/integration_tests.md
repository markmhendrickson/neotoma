## Release v1.0.0 — Cross-FU Integration Tests

_(End-to-end flows spanning multiple Feature Units)_

---

### 1. Purpose

Define the **integration test suite** for Release `v1.0.0` (MVP). These tests:

- Span multiple Feature Units.
- Validate the full Truth Layer pipeline (ingestion → extraction → entities → events → graph → search → UI → MCP).
- Are required to pass before deployment.

---

### 2. Test Matrix (High-Level)

| ID     | Name                                  | Batches Covered | FUs Involved                                   |
| ------ | ------------------------------------- | --------------- | ---------------------------------------------- |
| IT-001 | Financial Statement Ingestion Flow    | 0, 1, 2, 3      | FU-100, FU-101, FU-102, FU-103, FU-105, FU-300 |
| IT-002 | CSV/Spreadsheet Ingestion Flow        | 0, 1, 2, 3      | FU-100, FU-101, FU-102, FU-103, FU-105, FU-300 |
| IT-003 | Multi-Event Document to Timeline Flow | 0, 1, 2, 3      | FU-100, FU-101, FU-102, FU-103, FU-105, FU-300 |
| IT-004 | Auth + RLS Isolation Flow             | 0, 3            | FU-700, FU-701, FU-300                         |
| IT-005 | MCP AI Access Flow                    | 0, 1, 2, 3      | FU-100–FU-103, FU-105, MCP FUs (200–205, etc.) |

---

### 3. Test Definitions

#### IT-001: Financial Statement Ingestion Flow

**Goal:** Verify that PDF financial statements are ingested, extracted, resolved into entities/events, inserted into graph, and searchable with deterministic behavior.

**Preconditions:**

- System running with all Batch 0–3 FUs deployed.
- Test files available (e.g., sample bank/credit statements from `~/Desktop/imports/` or equivalent fixtures).

**Steps:**

1. Upload a bank statement PDF via UI or MCP.
2. Wait for ingestion to complete.
3. Query records of type `statement` via UI and MCP.
4. Inspect:
   - Extracted fields (dates, amounts, account identifiers).
   - Entities (accounts, counterparties).
   - Events (transactions) and their timestamps.
5. Run same upload 3 times:
   - Assert identical `type`, `properties`, `entities`, and `events` for each run.

**Expected Results:**

- Correct schema type assigned (`statement`).
- Transactions extracted deterministically from statement.
- Entities and events created and linked in graph with no orphans/cycles.
- Search results deterministic for the same query.

---

#### IT-002: CSV/Spreadsheet Ingestion Flow

**Goal:** Verify that CSV/XLSX uploads produce one file-level Record, one row-level Record per row, and integrate correctly with graph and search.

**Preconditions:**

- CSV and XLSX fixture files present (e.g., `capital-one-2025.csv`, `ibercaja-2025.xlsx`).

**Steps:**

1. Upload CSV/XLSX file via UI or MCP.
2. Check:
   - One file-level Record created with correct provenance.
   - One row-level Record per non-header row (type `dataset` or domain-specific type, per config).
3. Validate:
   - Entities and events created where applicable.
   - Links between row-level Records and file-level Record in graph.
4. Repeat upload and compare outputs for determinism.

**Expected Results:**

- Deterministic row-level Record creation.
- Stable entity/event generation.
- Records discoverable via structured search and visible in UI.

---

#### IT-003: Multi-Event Document to Timeline Flow

**Goal:** Verify that multi-event documents (e.g., multi-transaction PDFs, workout logs) yield multiple Events/Records correctly ordered in the timeline.

**Preconditions:**

- Fixture files representing multi-event sources (statements, workout logs, etc.).

**Steps:**

1. Upload a multi-event source document.
2. Confirm:
   - File-level Record exists.
   - Multiple event-derived Records/Events created (one per logical event).
   - Each event-derived Record/Event links back to file-level Record.
3. Open timeline view.
4. Verify events appear in correct chronological order.
5. Re-upload and check determinism of event IDs and ordering.

**Expected Results:**

- File-level Record + event-derived Records/Events present.
- Timeline view chronologically correct and stable across runs.

---

#### IT-004: Auth + RLS Isolation Flow

**Goal:** Verify that authentication and row-level security correctly isolate user data.

**Preconditions:**

- Supabase Auth configured and running.
- RLS policies applied as per schema docs.

**Steps:**

1. Sign up User A and User B via Auth UI.
2. As User A:
   - Upload one or more documents.
3. As User B:
   - Upload different documents.
4. As User A:
   - List/search records and confirm only User A’s records are visible.
5. As User B:
   - List/search records and confirm only User B’s records are visible.

**Expected Results:**

- No cross-tenant data visibility.
- Search and timeline views respect RLS.

---

#### IT-005: MCP AI Access Flow

**Goal:** Verify that AI tools (via MCP) can safely and deterministically interact with Truth Layer.

**Preconditions:**

- MCP server running with all MVP actions enabled.
- Test client available (e.g., ChatGPT/Claude configured with MCP server).

**Steps:**

1. From AI client, call `upload_file` to ingest a document.
2. Call `retrieve_records` with filters to fetch the ingested Record.
3. Call search-related actions (where applicable) to verify deterministic ranking.
4. Repeat calls with same inputs and confirm identical responses.

**Expected Results:**

- MCP actions behave deterministically and reflect the same truth as UI/DB.
- No semantic or LLM-based extraction in Truth Layer paths.

---

### 4. Execution per Batch

These tests are run:

- **After Batch 0**: Smoke tests covering ingestion, basic UI, and auth.
- **After Batch 1**: IT-001/IT-002 partial checks (up to entities/events).
- **After Batch 2**: Graph integrity portions of IT-001/IT-002/IT-003.
- **After Batch 3**: Full IT-001–IT-005 suite before pre-release sign-off.

Detailed timing and automation strategy can be refined during implementation.













