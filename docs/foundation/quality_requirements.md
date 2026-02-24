# Neotoma Quality Requirements
## 20. Testing and Quality Requirements
### 20.1 Test Types (All Required)
**Unit Tests:**
- Pure functions (extraction, ID generation)
- Deterministic (run 100 times → 100 same results)
- Fast (<10ms per test)
**Integration Tests:**
- Service interactions with test DB
- Full ingestion pipeline
- Graph insertion with transactions
**E2E Tests (Playwright):**
- Upload file → see record details
- Search → click result → view detail
- Timeline view → filter by date
**Property-Based Tests:**
- Invariant verification (e.g., entity ID always same length)
- Determinism proofs
### 20.2 Coverage Targets
| Code Type         | Lines | Branches | Critical Paths |
| ----------------- | ----- | -------- | -------------- |
| Domain Logic      | >85%  | >85%     | 100%           |
| Application Layer | >80%  | >80%     | 100%           |
| UI Components     | >75%  | >75%     | N/A            |
**Critical paths (100% required):**
- Ingestion pipeline
- Entity resolution
- Graph insertion
- Search ranking
## 21. Observability Requirements
All operations MUST emit:
**Metrics:**
- Counters (e.g., `neotoma_record_upload_total{status="success"}`)
- Histograms (e.g., `neotoma_record_upload_duration_ms`)
**Logs:**
- Structured JSON logs
- NO PII (record IDs only, not extracted fields)
- Include `trace_id` for distributed tracing
**Events:**
- State changes (e.g., `record.created`, `ingestion.failed`)
- Payload: metadata only, no PII
**Traces:**
- Distributed tracing spans (e.g., `ingestion.ingest_file`)
- Propagate `trace_id` through all layers
## 22. Privacy and Security Commitments
### 22.1 Privacy (PII Handling)
**MUST NOT:**
- Log PII from `properties` (names, SSN, addresses, phone)
- Log full `raw_text` (may contain PII)
- Log auth tokens or credentials
- Store PII unencrypted (use RLS, future: encryption)
**MAY Log:**
- Record IDs (UUIDs)
- Schema types
- Error codes
- Performance metrics (file size, duration)
### 22.2 Security
**Authentication:**
- Local auth (dev stub or key-based when encryption enabled)
- OAuth for MCP client connections
**Authorization:**
- Row-Level Security (RLS) when applicable
- MVP: All authenticated users see all records (single-user)
- Future: Per-user isolation via `user_id` column + RLS policies
**Data Protection:**
- Database encryption at rest (optional, key file or mnemonic)
- HTTPS for all API calls
- WSS (WebSocket Secure) for MCP connections
