# Neotoma Functional Requirements
**Note:** This is a **high-level summary** document for stakeholders and quick reference. For implementation details, see:
- [`docs/subsystems/ingestion/ingestion.md`](../subsystems/ingestion/ingestion.md) — Complete ingestion pipeline, extraction rules, schema detection
- [`docs/subsystems/record_types.md`](../subsystems/record_types.md) — Complete type catalog, field mappings, extraction patterns
- [`docs/subsystems/schema.md`](../subsystems/schema.md) — Database schema, JSONB structures, schema evolution
- [`docs/subsystems/search/search.md`](../subsystems/search/search.md) — Search query models, ranking, filtering
- [`docs/architecture/architecture.md`](../architecture/architecture.md) — System architecture, data flows, layer boundaries
- [`docs/specs/MCP_SPEC.md`](./MCP_SPEC.md) — Complete MCP action specifications
**In case of conflict, detailed subsystem docs are authoritative.**
## Purpose
Consolidates functional requirements from all Neotoma subsystems into a single reference document for stakeholders and planning.
## 1. Ingestion Requirements
**Dual-Path Ingestion:**
1. **File Upload Path:** Accept PDF, JPG, PNG files (max 50MB), extract text, detect schema, extract fields
2. **Agent Interaction Path:** Accept structured data via MCP `store_record`, direct property assignment
**File Upload MUST:**
- Accept PDF, JPG, PNG files (max 50MB)
- Extract text via pdf-parse or Tesseract OCR
- Detect schema type via rule-based matching
- Extract fields deterministically
- Generate content hash for deduplication
- Process files in <10s (P95)
**Agent Interaction MUST:**
- Accept structured data via MCP `store_record`
- Validate schema type and properties
- Create records with user-provided properties
- Support entity resolution and timeline generation across agent-created data
**MUST NOT:**
- Accept files >50MB
- Use LLM for extraction (MVP)
- Automatically ingest without user action
See [`docs/subsystems/ingestion/ingestion.md`](../subsystems/ingestion/ingestion.md)
## 2. Schema Requirements
**Note:** Neotoma uses a **two-tier type system**:
- **Application types** (this list): Used in code, database, and MCP actions
- **Schema families** (`Financial`, `Productivity`, etc.): Used for documentation only
See [`docs/subsystems/record_types.md`](../subsystems/record_types.md) for complete type catalog and [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) section 14 for two-tier system explanation.
**MVP Application Types (Tier 1 ICP-aligned):**
**Finance:**
- `invoice` — Invoices (money owed to/from vendors)
- `receipt` — Proof-of-purchase documents
- `transaction` — Individual debits/credits (from uploads, not Plaid)
- `statement` — Periodic statements (bank, credit, utilities)
- `account` — Financial account snapshots
**Productivity:**
- `note` — Free-form text, journals, markdown files
- `document` — Structured files, specs, PDFs, knowledge assets (generic fallback)
- `message` — Emails, DMs, chat transcripts (from Gmail integration)
- `task` — Action items with status
- `project` — Multi-step initiatives
- `event` — Meetings, appointments, calendar events
**Knowledge:**
- `contact` — People and organization records
- `dataset` — Tabular datasets (CSV, spreadsheet uploads)
**Legal/Compliance:**
- `contract` — Contracts and legal documents (critical for knowledge workers and founders)
**Travel:**
- `travel_document` — Flight itineraries, hotel bookings, boarding passes
**Identity:**
- `identity_document` — Passports, IDs, licenses
**MUST:**
- Assign application type deterministically (multi-pattern matching)
- Extract fields per type-specific rules (see `record_types.md`)
- Version JSONB schemas (`schema_version` field required)
- Support additive evolution (no breaking changes)
- Fallback to `document` if no type matches 2+ patterns
**MUST NOT:**
- Use schema family names (`Financial`, `Productivity`) as database types
- Mix application types and families in code
**Rationale:** These application types directly support Tier 1 ICP workflows:
- **AI-Native Individual Operators:** Research synthesis (document, note), contract analysis (contract), travel planning (travel_document), invoice management (invoice, receipt)
- **High-Context Knowledge Workers:** Due diligence (contract, document, contact), legal research (contract, document), market research (document, note), client work (message, contact, note)
- **AI-Native Founders & Small Teams:** Team knowledge base (document, note, message), investor relations (document, invoice), product planning (document, note), hiring (contact, document)
See [`docs/subsystems/schema.md`](../subsystems/schema.md), [`docs/subsystems/record_types.md`](../subsystems/record_types.md), and [`src/config/record_types.ts`](../../src/config/record_types.ts)
## 3. Entity Resolution Requirements
**MUST:**
- Generate hash-based entity IDs
- Normalize entity names (lowercase, trim, remove suffixes)
- Deduplicate entities globally
- Link records to entities via graph edges
**Example:**
- "Acme Corp" → `ent_abc123...`
- "ACME CORP" → `ent_abc123...` (same ID)
See [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) section 15
## 4. Event Generation Requirements
**MUST:**
- Extract events from date fields only
- Generate deterministic event IDs
- Link events to source records and fields
- Sort timeline chronologically
See [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) section 16
## 5. Search Requirements
**MUST:**
- Support structured filters (type, date range, properties)
- Support full-text search over raw_text
- Rank results deterministically (tiebreakers required)
- Return results in <500ms (P95)
**MUST NOT:**
- Use semantic search for ranking (MVP)
- Return nondeterministic order
See [`docs/subsystems/search/search.md`](../subsystems/search/search.md)
## 6. Graph Requirements
**MUST:**
- Insert records, entities, events transactionally
- Create typed edges (record→entity, record→event, event→entity)
- Maintain zero orphan nodes
- Prevent cycles
See [`docs/architecture/architecture.md`](../architecture/architecture.md)
## 7. MCP Requirements
**MUST:**
- Provide 8 MVP actions (store, update, retrieve, delete, upload, providers)
- Plaid actions (4) moved to post-MVP (Tier 3+ use case)
- Validate all inputs
- Return structured JSON
- Use ErrorEnvelope for errors
See [`docs/specs/MCP_SPEC.md`](./MCP_SPEC.md)
## 8. UI Requirements
**MUST:**
- Provide list, detail, timeline, dashboard views
- Support keyboard navigation
- Include ARIA labels
- Localize UI text (preserve content language)
See [`docs/specs/UI_SPEC.md`](./UI_SPEC.md)
## Detailed Documentation References
- [`docs/subsystems/ingestion/ingestion.md`](../subsystems/ingestion/ingestion.md)
- [`docs/subsystems/schema.md`](../subsystems/schema.md)
- [`docs/subsystems/search/search.md`](../subsystems/search/search.md)
- [`docs/architecture/architecture.md`](../architecture/architecture.md)
## Agent Instructions
### When to Load This Document
Load `docs/specs/FUNCTIONAL_REQUIREMENTS.md` when:
- Planning feature scope and requirements
- Understanding MVP functional boundaries
- Validating feature against requirements
- Quick reference for subsystem requirements
### Required Co-Loaded Documents
- `docs/NEOTOMA_MANIFEST.md` (always)
- `docs/subsystems/record_types.md` (for schema type requirements)
- Detailed subsystem docs for implementation (ingestion.md, schema.md, search.md, etc.)
### Constraints Agents Must Enforce
1. **Use application types:** Code must use granular types (`invoice`, `receipt`) from `record_types.md`, NOT schema families
2. **Rule-based extraction only:** No LLM extraction in MVP (section 1)
3. **Multi-pattern matching:** Schema detection must use 2+ patterns (section 2)
4. **Deterministic ranking:** Search must use tiebreakers (section 5)
5. **MCP action catalog:** Only 8 MVP actions allowed (section 7)
6. **Defer to detailed docs:** This is a summary; detailed subsystem docs are authoritative
### Forbidden Patterns
- Using LLM for extraction in MVP
- Using schema family names as database types
- Implementing semantic search in MVP (section 5)
- Adding non-MVP MCP actions (Plaid is post-MVP)
- Violating consistency models per subsystem
### Validation Checklist
- [ ] Feature requirements match detailed subsystem docs
- [ ] Uses application types (not schema families)
- [ ] No LLM extraction in MVP
- [ ] Schema detection uses multi-pattern matching
- [ ] Search ranking is deterministic
- [ ] Only MVP MCP actions used
- [ ] Cross-checked against NEOTOMA_MANIFEST.md invariants
