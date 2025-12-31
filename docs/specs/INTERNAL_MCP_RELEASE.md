# Neotoma Internal MCP Release — Specification
## Scope
### Included Capabilities
**1. Core Backend Services (Domain Layer)**
- ✅ **FU-100:** File Analysis Service
  - PDF text extraction (pdf-parse)
  - OCR for images (Tesseract)
  - Schema type detection (rule-based, deterministic)
  - Field extraction per schema type (rule-based regex, no LLM)
  - Content hash for deduplication
- ✅ **FU-101:** Entity Resolution Service
  - Entity extraction from fields
  - Normalization rules (lowercase, trim, suffix removal)
  - Deterministic entity ID generation (hash-based)
  - Deduplication logic
  - Entity-record edge creation
- ✅ **FU-102:** Event Generation Service
  - Date field detection per schema type
  - Event type mapping (date_issued → InvoiceIssued)
  - Deterministic event ID generation (hash-based)
  - Event-record and event-entity edge creation
  - Timeline ordering (chronological)
- ✅ **FU-103:** Graph Builder Service
  - Transactional insert (record + entities + events + edges)
  - Orphan node prevention
  - Cycle detection
  - Edge type validation
- ✅ **FU-105:** Search Service
  - Structured filters (type, properties, date range)
  - Full-text search (GIN indexes)
  - Deterministic ranking with tiebreakers
  - Pagination
  - **Constraint:** Structured search only (no semantic/vector search in this release)
- ⏳ **FU-104:** Embedding Service (Optional)
  - OpenAI embedding generation (ada-002, 1536-dim)
  - Async embedding queue
  - Vector storage in PostgreSQL (pgvector)
  - **Note:** Embeddings not required for MCP validation, but may be useful for future semantic search
**2. MCP Actions (Application Layer)**
- ✅ **FU-200:** MCP Server Core
  - MCP server initialization
  - Tool registration
  - Request validation (Zod schemas)
  - Error envelope handling
  - WebSocket bridge
- ✅ **FU-201:** MCP Action — `store_record`
  - Create new record with properties
  - Input validation
  - Emit `RecordCreated` event via `EventRepository.appendEvent()`
  - Apply reducer (`reduceRecordCreated`) to compute state
  - Refresh materialized view after event emission
  - Response with created record
- ✅ **FU-202:** MCP Action — `retrieve_records`
  - Query records with filters (type, properties, search)
  - Retrieve state via `StateRepository.getState()` (repository abstraction)
  - Search service integration
  - Deterministic result ordering
  - Pagination
- ✅ **FU-203:** MCP Action — `update_record`
  - Update record metadata/properties
  - Emit `RecordUpdated` event via `EventRepository.appendEvent()`
  - Apply reducer (`reduceRecordUpdated`) to compute updated state
  - Refresh materialized view after event emission
  - Property merging
  - Response with updated record
- ✅ **FU-204:** MCP Action — `delete_record`
  - Delete record and associated files
  - Emit `RecordDeleted` event via `EventRepository.appendEvent()`
  - Apply reducer (`reduceRecordDeleted`) to mark record as deleted
  - Refresh materialized view after event emission
  - Cascade delete (edges, files)
  - Response with confirmation
- ✅ **FU-205:** MCP Action — `upload_file`
  - Upload file from local path
  - Upload to storage (Supabase Storage or S3)
  - Trigger file analysis pipeline
  - Create record with extracted fields (uses `store_record` internally, inherits event-sourcing)
  - Use `StateRepository` and `EventRepository` when creating records
  - Response with record + file URL
- ✅ **FU-206:** MCP Action — `get_file_url`
  - Get signed URL for file access
  - Expiration handling
- ⏳ **FU-208:** MCP Provider Integrations (Optional)
  - `list_provider_catalog` — List available providers
  - `sync_provider_imports` — Trigger provider import sync
  - **Note:** Provider integrations not required for core validation, but may be useful for Gmail attachment testing
**3. Infrastructure**
- ✅ **FU-000:** Database Schema v1.0
  - `records`, `record_relationships` tables
  - Indexes (GIN, B-tree)
  - Migration scripts
  - **Note:** RLS policies not required (single-user release)
- ✅ **FU-002:** Configuration Management
  - Environment variable loading
  - Canonical type mappings
  - Configuration validation
## Explicitly Excluded
**1. UI Components (All Phase 3 UI Feature Units)**
- ❌ FU-300: Design System Implementation
- ❌ FU-301: Records List View
- ❌ FU-302: Record Detail View
- ❌ FU-303: Timeline View
- ❌ FU-304: File Upload UI
- ❌ FU-305: Dashboard View
- ❌ FU-306: Settings UI
- ❌ FU-307: Chat/AI Panel
**2. Multi-User Infrastructure**
- ❌ FU-700: Authentication UI (Supabase Auth)
- ❌ FU-701: Row-Level Security (RLS)
- ❌ FU-702: Billing and Subscription Management
- ❌ FU-703: Local Storage / Offline Mode (optional)
**3. Onboarding Flow**
- ❌ FU-400-403: Onboarding Feature Units (welcome modal, upload flow, etc.)
**4. Post-MVP Features**
- ❌ FU-207: Plaid Integration (post-MVP)
- ❌ Semantic/vector search (structured search only)
- ❌ LLM-based extraction (rule-based only)
## MCP Actions Available
This release provides **6 core MCP actions** (plus 2 optional provider actions):
| Action | Purpose | Status |
|--------|---------|--------|
| `store_record` | Create new record | ✅ Required |
| `retrieve_records` | Query records with filters | ✅ Required |
| `update_record` | Update record metadata | ✅ Required |
| `delete_record` | Delete record | ✅ Required |
| `upload_file` | Upload file and create record | ✅ Required |
| `get_file_url` | Get signed URL for file | ✅ Required |
| `list_provider_catalog` | List available providers | ⏳ Optional |
| `sync_provider_imports` | Trigger provider sync | ⏳ Optional |
## Validation Workflows
**1. File Upload → Extraction → Query**
```
Cursor/ChatGPT → upload_file("invoice.pdf")
  → File analyzed, fields extracted
  → Entities resolved, events generated
  → Graph inserted
  → retrieve_records(type="invoice")
  → Verify extracted fields, entities, events
```
**2. Manual Record Creation → Query**
```
Cursor/ChatGPT → store_record({
  type: "invoice",
  properties: { invoice_number: "INV-001", amount: 1000 }
})
  → retrieve_records(type="invoice")
  → Verify record stored correctly
```
**3. Entity Resolution Validation**
```
Cursor/ChatGPT → upload_file("invoice1.pdf") // Contains "Acme Corp"
  → upload_file("invoice2.pdf") // Contains "ACME CORP"
  → retrieve_records(type="invoice")
  → Verify both records link to same entity ID
```
**4. Timeline Event Validation**
```
Cursor/ChatGPT → upload_file("invoice.pdf") // Contains date_issued: "2024-01-15"
  → retrieve_records(type="invoice")
  → Verify event generated with correct timestamp
  → Query events chronologically
```
**5. Search and Filtering**
```
Cursor/ChatGPT → retrieve_records({
  type: "invoice",
  properties: { vendor: "Acme Corp" },
  search: ["invoice"],
  limit: 10
})
  → Verify deterministic ordering
  → Verify filters applied correctly
```
## Technical Requirements
### Database
- Single-user database (no RLS policies required)
- All tables from FU-000 schema
- Indexes for search performance
### Storage
- File storage (Supabase Storage or S3)
- Signed URL generation for file access
### MCP Server
- MCP protocol compliance
- WebSocket bridge for Cursor/ChatGPT integration
- Error envelope handling
- Request validation (Zod schemas)
### Determinism Requirements
- Same file → same record_id, entities, events (100% deterministic)
- Same query + same DB state → same result order
- Same entity name → same entity_id (globally)
## Testing Strategy
**1. Unit Tests**
- Schema detection rules (determinism)
- Field extraction regex (determinism)
- Entity ID generation (determinism)
- Event ID generation (determinism)
- Search ranking (determinism)
**2. Integration Tests**
- Full ingestion pipeline (upload → extraction → graph)
- MCP action validation
- Graph integrity (no orphans, no cycles)
- Transaction rollback on error
**3. E2E Tests (MCP Client)**
- Cursor integration (upload_file → retrieve_records)
- ChatGPT integration (store_record → retrieve_records)
- Entity resolution across multiple uploads
- Timeline event generation and ordering
**4. Property-Based Tests**
- Determinism proofs (same input → same output, 100 runs)
- Graph integrity invariants (no orphans, no cycles)
## Acceptance Criteria
**Functional**
- ✅ Upload PDF → extract fields → create record (95% success rate)
- ✅ Upload image → OCR → extract fields → create record (90% success rate)
- ✅ Same file uploaded twice → same record_id (deduplication)
- ✅ Entity resolution: "Acme Corp" and "ACME CORP" → same entity_id
- ✅ Event generation: date fields → timeline events
- ✅ Graph integrity: 0 orphan nodes, 0 cycles
- ✅ Search: deterministic ordering (same query → same order)
**Performance**
- ✅ Upload latency: <5s P95 for 10MB PDF
- ✅ Search latency: <500ms P95 for structured queries
- ✅ Graph insertion: <1s P95 (transactional)
**Determinism**
- ✅ Same file → same extraction (100% deterministic, 100 runs)
- ✅ Same query → same order (100% deterministic, 100 runs)
- ✅ Same entity name → same entity_id (100% deterministic)
## Dependencies
**Required Feature Units (Execution Order)**
1. **Phase 0: Foundation**
   - FU-000: Database Schema ✅
   - FU-002: Configuration ✅
2. **Phase 1: Core Services**
   - FU-100: File Analysis Service 🔨
   - FU-101: Entity Resolution Service 🔨
   - FU-102: Event Generation Service 🔨
   - FU-103: Graph Builder Service 🔨
   - FU-105: Search Service 🔨
   - FU-104: Embedding Service (Optional) ⏳
3. **Phase 2: MCP Layer**
   - FU-200: MCP Server Core ✅
   - FU-201: store_record ✅
   - FU-202: retrieve_records ✅
   - FU-203: update_record ✅
   - FU-204: delete_record ✅
   - FU-205: upload_file ✅
   - FU-206: get_file_url ✅
   - FU-208: Provider Integrations (Optional) ⏳
**Status Legend:**
- ✅ Complete
- 🔨 Partial / Needs Work
- ⏳ Not Started
- ❌ Excluded
## Differences from Full MVP
| Feature | Internal MCP Release | Full MVP |
|---------|---------------------|----------|
| **UI** | ❌ None | ✅ 7 views (Dashboard, Records, Timeline, Entities, Upload, Settings, Chat) |
| **Multi-User** | ❌ Single-user only | ✅ Auth + RLS (2–20 people) |
| **Billing** | ❌ None | ✅ Stripe integration |
| **Onboarding** | ❌ None | ✅ Welcome modal, upload flow |
| **Provider Integrations** | ⏳ Optional | ✅ Gmail (required) |
| **Local Storage** | ❌ None | ✅ Offline mode |
| **Semantic Search** | ❌ Structured only | ❌ Structured only (post-MVP) |
| **LLM Extraction** | ❌ Rule-based only | ❌ Rule-based only |
## Success Criteria
**Internal Release is Complete When:**
1. ✅ All 6 core MCP actions functional
2. ✅ File upload → extraction → graph insertion working end-to-end
3. ✅ Entity resolution validated (canonical IDs)
4. ✅ Event generation validated (timeline events)
5. ✅ Graph integrity validated (0 orphans, 0 cycles)
6. ✅ Search deterministic (same query → same order)
7. ✅ Cursor integration tested (upload_file, retrieve_records)
8. ✅ ChatGPT integration tested (store_record, retrieve_records)
9. ✅ All critical path tests passing (100% coverage)
10. ✅ Determinism validated (100 runs, same input → same output)
## Next Steps After Internal Release
Once internal MCP release is validated:
1. **Add UI Layer** (Phase 3 Feature Units)
   - Design system
   - Records list, detail, timeline views
   - Upload UI
   - Dashboard, settings, chat panel
2. **Add Multi-User Support** (Phase 7 Feature Units)
   - Authentication (Supabase Auth)
   - Row-Level Security (RLS)
   - Billing (Stripe)
3. **Add Onboarding Flow** (Phase 4 Feature Units)
   - Welcome modal
   - Upload flow guidance
4. **Add Provider Integrations** (Phase 5 Feature Units)
   - Gmail attachment import
## Documentation References
- [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) — Foundational principles
- [`docs/specs/MCP_SPEC.md`](./MCP_SPEC.md) — MCP action specifications
- [`docs/specs/MVP_FEATURE_UNITS.md`](./MVP_FEATURE_UNITS.md) — Complete Feature Unit inventory
- [`docs/architecture/architecture.md`](../architecture/architecture.md) — System architecture
- [`docs/subsystems/ingestion/ingestion.md`](../subsystems/ingestion/ingestion.md) — Ingestion pipeline
**Status:** 📋 Specification Complete
**Last Updated:** 2024-12-02
