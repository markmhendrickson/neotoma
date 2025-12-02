# Neotoma Manifest — Canonical Foundation and Context

_(Unified Root-of-Truth for All Project Work)_

---

# 1. Purpose of This Document

This document consolidates the **foundational architectural principles** and **product/market context** required for all Neotoma development. It serves as the single **root-of-truth** for:

- System architecture and invariants
- Product vision and positioning
- Philosophical constraints
- Domain vocabulary
- Data model expectations
- Target users and workflows
- Development constraints

**Every other document, specification, Feature Unit, test, and implementation MUST inherit from, remain consistent with, and never contradict this manifest.**

This file exists so that any developer or AI assistant (Cursor, ChatGPT, Claude, IDE agents) can understand Neotoma **without needing external context** such as conversation history or project notes.

---

# 2. What Neotoma Is

Neotoma is a **Truth Layer** — a durable, structured, deterministic personal-data substrate designed for AI-native workflows.

It is:

- The **lowest-level, canonical source of truth** for a user's personal and professional documents
- A **substrate** for AI-native personal computing
- A **memory system** that transforms fragmented files and facts into structured, queryable truth
- The **foundation layer** beneath agent-driven layers (e.g., Agentic Portfolio for strategy, Agentic Wallet for execution)

## 2.1 Core Responsibilities

Neotoma focuses exclusively on:

1. **Ingestion** — User-provided file upload (explicit, never automatic)
2. **Normalization** — Format conversion, text extraction, OCR
3. **Extraction** — Deterministic field extraction via rule-based parsing
4. **Schema Assignment** — Type detection (FinancialRecord, IdentityDocument, etc.)
5. **Entity Resolution** — Canonical ID generation for people, companies, locations
6. **Event Creation** — Timeline events from extracted date fields
7. **Memory Graph Construction** — Records → Entities → Events with typed edges
8. **Deterministic Retrieval** — Structured search and queries
9. **AI-Safe Access** — Truth exposure via MCP tools

---

# 3. What Neotoma Is NOT

Neotoma is **not**:

- An LLM agent or autonomous system
- A productivity tool, task manager, or workflow engine
- A note-taking system or PKM app
- A writing assistant or browser integration
- A calendar client or financial planner
- A crypto wallet or semantic search platform
- A strategy layer (e.g., [Agentic Portfolio](../architecture/agentic_portfolio_overview.md) for financial strategy)
- An execution layer (e.g., [Agentic Wallet](../architecture/agentic_wallet_overview.md) for financial execution)

**Any attempt to generate features outside this scope MUST be rejected.**

---

# 4. The Layered Architecture

Neotoma is designed as a **Truth Layer** that can support multiple upper layers implementing agent-driven data processing and action execution.

## 4.1 Example: Financial System Architecture

One important example is a financial system built on Neotoma:

```
┌───────────────────────────────────────────────┐
│          Agentic Wallet (Execution)           │
│   On-chain actions, DeFi, automation          │
└───────────────────────────────▲──────────────┘
                                │ Reads Only
                                ▼
┌───────────────────────────────────────────────┐
│         Agentic Portfolio (Strategy)          │
│ Multi-asset modeling, tax, projections        │
└───────────────────────────────▲──────────────┘
                                │ Reads Only
                                ▼
┌───────────────────────────────────────────────┐
│               Neotoma (Truth Layer)           │
│ Ingestion → Schema → Extraction → Memory      │
└───────────────────────────────────────────────┘
```

**Note:** Agentic Portfolio and Agentic Wallet are two important examples of layers that can be built on Neotoma, but many other agent-driven layers are possible. Neotoma is a general-purpose Truth Layer substrate, not limited to financial use cases.

## 4.2 Layer Boundaries (Critical Invariant)

**Truth Layer (Neotoma):**

- Ingests, extracts, structures, stores
- Provides deterministic truth
- MUST NOT implement strategy or execution logic

**Upper Layers (Examples: Agentic Portfolio, Agentic Wallet, or any agent-driven layer):**

- Consume Neotoma truth (read-only)
- Implement domain-specific strategy, reasoning, or execution logic
- MUST NOT modify Neotoma truth

**Upper layers MAY read from Neotoma but MUST NEVER write or modify truth.**

Any layer built on Neotoma must respect this boundary: it can read truth, but cannot mutate it.

---

# 5. Core Philosophy and Principles

These principles are **mandatory** for all designs and implementations.

## 5.1 Determinism Above All

A given input MUST always produce identical output:

- Same raw_text → same extracted_fields
- Same entity name → same entity_id
- Same date field → same event_id
- Same query + same DB state → same search order
- Same file uploaded twice → same record (deduplicated)

**No randomness. No nondeterminism. No LLM extraction (MVP).**

## 5.2 Explicit User Control

- Neotoma ingests **only what the user explicitly provides**
- No automatic ingestion, no background scanning
- No reading email bodies or cloud drives without user action
- User controls all data entry

## 5.3 Strong Boundaries

The Truth Layer MUST contain **no**:

- Inference or prediction
- Heuristics beyond allowed extraction rules
- Semantic search (MVP constraint)
- LLM-based field extraction (MVP)
- Strategy or execution logic

## 5.4 Truth is Immutable

Once stored, these MUST NOT change:

- `raw_text` (original extracted text)
- `schema_type` (assigned document type)
- `extracted_fields` (deterministic output)
- Entity IDs (hash-based, stable)
- Event timestamps (from source fields)

Metadata (`created_at`, `updated_at`) is mutable for auditing.

## 5.5 Schema-First Processing

All extraction, linking, and event creation derive from:
**schema_type → extraction rules → extracted_fields → entities + events**

## 5.6 No Synthetic Data

Neotoma never:

- Guesses missing information
- Infers relationships beyond explicit extraction
- Predicts future states
- Hallucinates data

**Only deterministic, rule-based processing.**

## 5.7 Full Explainability

Every output MUST trace to:

- Source file (provenance)
- Extraction rule (which regex/parser)
- Source field (for events: which date field?)
- Entity derivation (which text → which normalized value → which hash)

**Nothing is hidden or magical.**

---

# 6. Why Neotoma Exists: The Problem

## 6.1 Personal Data is Fragmented

Users store critical documents across:

- Email attachments (Gmail, Outlook)
- Downloads folders (PDFs, images)
- WhatsApp/iMessage screenshots
- Cloud drives (Dropbox, Google Drive)
- Desktop files, phone photos
- App exports (bank statements, receipts)
- Scanner outputs

**No system unifies this into durable, structured memory.**

## 6.2 AI Has No Memory

LLMs cannot reason across:

- Multi-session memory (forgets after chat ends)
- Long-horizon life context (no continuity)
- Cross-document relationships (can't link entities)
- Identity continuity (doesn't know "Acme Corp" = "ACME CORP")
- Events over time (can't build timelines)

**Every AI interaction starts from zero.**

## 6.3 Neotoma Provides the Missing Substrate

Neotoma gives AI:

- Stable record IDs (persistent references)
- Stable entity IDs (canonical representations)
- Stable event/timeline structures (temporal reasoning)
- Correct retrieval (deterministic search)
- Explicit provenance (trust and auditability)

**Neotoma is the "RAM + HDD" for AI-native personal computing.**

---

# 7. Product Positioning and Differentiation

## 7.1 Positioning

Neotoma is **not a PKM or app**. Neotoma is:

- A **substrate** for AI tools
- A **memory system** for personal/professional data
- A **data foundation** beneath all AI interactions
- The **Rosetta Stone** of a user's life data
- The **one layer beneath all AI tooling**

**Marketing positioning:**

- "Your structured AI memory"
- "Deterministic personal knowledge substrate"
- "The truth engine behind your AI tools"
- "The foundation for agent-native personal computing"

## 7.2 Differentiation

Neotoma is **not competing** with Notion, Evernote, Google Docs, or PKM systems.

**Those tools store files. Neotoma understands files.**

### Unique Differentiators:

- **Schema-first:** Type-driven extraction (not freeform notes)
- **Deterministic:** Reproducible outputs (not ML-based guessing)
- **Explainable:** Every field traces to source
- **Multi-modal ingestion:** PDFs, images, OCR
- **Entity & event unification:** Canonical IDs across documents
- **Timeline generation:** Automatic chronological ordering
- **AI-ready:** MCP-exposed structured memory
- **Agentic Portfolio/Wallet compatible:** Designed to support layered architectures (financial system is one example)
- **Long-horizon correctness:** Truth persists forever
- **Provenance:** Full audit trail
- **Immutability:** Truth never changes
- **Type-stable graph:** No orphans, no cycles, typed edges

**This is a new category: Deterministic Personal Memory Engine (DPME).**

---

# 8. Target Users (ICP)

Neotoma's target users are organized into priority tiers based on addressability, revenue potential, and early GTM fit. See [`docs/specs/ICP_PRIORITY_TIERS.md`](./specs/ICP_PRIORITY_TIERS.md) for the complete tiered ICP strategy.

## 8.1 MVP Target Users (Tier 1)

The Neotoma MVP MUST directly serve these ICPs:

**AI-Native Individual Operators**

- Heavy ChatGPT/Claude/Raycast/Cursor users
- Strongest personal pain from fragmented truth
- Immediate activation and highest willingness to pay early

**High-Context Knowledge Workers**

- Analysts, researchers, consultants, lawyers
- High document load; rely on cross-document reasoning
- Need structured memory for agents

**AI-Native Founders & Small Teams (2–20 people)**

- Initially adopt individually, then expand into team usage organically
- Bridge B2C → B2B expansion
- Become bottom-up champions for B2B adoption

**Why Tier 1:**

- Lowest activation friction
- Highest willingness to pay early
- Strongest retention and daily use
- They validate ingestion, schema, events, and MCP

## 8.2 Future Expansion Tiers

**Tier 2 — Early B2B Expansion:** Hybrid product teams, ops teams, developer integrators, AI tool integrators

**Tier 3 — B2C Power Users:** Cross-border solopreneurs, multi-system information workers, high-entropy households

**Tier 4 — Strategy-Layer (Agentic Portfolio):** HNW individuals, multi-jurisdiction residents, crypto-native power users

**Tier 5 — Execution-Layer (Agentic Wallet):** High-frequency on-chain actors, agent-compatible crypto users

**Tier 6 — Enterprise Deployments:** Mid-market and enterprise teams requiring org-wide agent orchestration

See [`docs/specs/ICP_PRIORITY_TIERS.md`](./specs/ICP_PRIORITY_TIERS.md) for complete tier definitions and GTM strategy.

---

# 9. Key User Workflows (MVP)

## Workflow 1: Upload Documents → See Structured Memory

User uploads invoices, receipts, contracts, travel docs.

They see:

- Extracted fields (invoice_number, amount, vendor)
- Entities (companies, people automatically identified)
- Events (timeline of dates from documents)
- Graph relationships (which entities in which records)

## Workflow 2: Connect Gmail → Import Attachments

User selects labels (Receipts, Travel, Finance).

System ingests attachments only (never email bodies).

## Workflow 3: Ask AI Questions

- "Summarize this contract"
- "Show me all documents involving Acme Corp"
- "What are all my travel events next month?"
- "What expires soon?"

**AI MUST use MCP and the graph, not guess.**

## Workflow 4: Explore the Timeline

Chronological view of events:

- Flights (departure/arrival)
- Contract effective dates
- Invoice issued/due dates
- Passport expiry

**AI and UI MUST show the same events (single source of truth).**

---

# 10. Product Principles

These MUST be reflected in every file, UI, and feature.

## 10.1 Truth Before Experience

Correctness > convenience. Never sacrifice accuracy for UX.

## 10.2 Explicit Over Implicit

Users control ingestion. No automatic background processing.

## 10.3 Minimal Over Magical

UI is an inspection window, not an AI showpiece. Show truth, don't embellish.

## 10.4 Schema Over Semantics

LLMs cannot determine truth; schemas do. Type-driven, not inference-driven.

## 10.5 Structure Over Interpretation

Store structured facts, not meaning. Extract fields, don't interpret intent.

## 10.6 Determinism Over Heuristics

If a rule can be misinterpreted, formalize it. No ambiguity.

## 10.7 Privacy Over Automation

- No background ingestion
- No message body ingestion
- No auto-scanning of cloud drives
- User explicitly provides all data

---

# 11. Architectural Invariants (MUST/MUST NOT)

## MUST

1. **Determinism:** Same input → same output, always
2. **Immutability:** Once stored, truth never changes (except metadata)
3. **Provenance:** All records trace to source file + timestamp + user
4. **Schema-first:** All extraction derives from schema type
5. **Entity IDs:** Hash-based, globally unique, deterministic
6. **Event IDs:** Hash-based, deterministic from record + field + date
7. **Graph integrity:** No orphan nodes, no cycles, typed edges only
8. **Transactional writes:** All graph inserts in single transaction
9. **User isolation:** RLS enforced (future: per-user data access)
10. **MCP-only mutations:** All writes via validated MCP actions
11. **Strong consistency:** Core records, entities, events immediately visible
12. **Explainability:** Every output traces to input + rule
13. **Privacy:** No PII in logs, RLS for data protection
14. **Explicit control:** User approves all ingestion
15. **Truth Layer boundaries:** No strategy or execution logic

## MUST NOT

1. **No LLM extraction** (MVP constraint; rule-based only)
2. **No semantic search** (MVP; structured search only)
3. **No automatic ingestion** (explicit user action required)
4. **No nondeterminism** (no random IDs, no Date.now() in logic)
5. **No schema mutation** (once assigned, schema_type never changes)
6. **No raw_text modification** (immutable after ingestion)
7. **No inferred entities** (only extract what's explicitly present)
8. **No strategy logic** (that's Agentic Portfolio)
9. **No execution logic** (that's Agentic Wallet)
10. **No agent behavior** (Neotoma is not an agent)
11. **No predictive features** (no forecasting, no recommendations)
12. **No synthetic data** (no guessing, no hallucination)
13. **No upward layer dependencies** (Domain never calls Application)
14. **No PII in logs** (record IDs only, not extracted fields)
15. **No breaking schema changes** (additive evolution only)

---

# 12. Data Models: Global Commitments

## 12.1 Core Entities

**Record:**

- `id` (UUID, deterministic from content hash + user + timestamp)
- `type` (schema_type: FinancialRecord, IdentityDocument, etc.)
- `properties` (JSONB: schema-specific extracted fields)
- `raw_text` (original extracted text, immutable)
- `provenance` (source_file, ingestion_timestamp, user_id)

**Entity:**

- `id` (hash-based: `ent_{sha256(type:normalized_name)}`)
- `entity_type` (person, company, location)
- `canonical_name` (normalized, lowercase, deduplicated)
- `aliases` (array of alternate names)

**Event:**

- `id` (hash-based: `evt_{sha256(record_id:field:date)}`)
- `event_type` (InvoiceIssued, FlightDeparture, PassportExpiry)
- `event_timestamp` (ISO 8601 from source field)
- `source_record_id` (which record?)
- `source_field` (which field? e.g., 'date_issued')

**Graph Edges:**

- Record → Entity (which entities mentioned in record)
- Record → Event (which events derived from record)
- Event → Entity (which entities involved in event)

## 12.2 Schema Expectations

- JSON-schema-definable
- Backward compatible
- Versioned (`schema_version` in JSONB)
- Deterministic extraction rules
- Minimal (no bloat)
- Extendable via additive evolution
- Immutable once persisted

---

# 13. Ingestion Doctrine

## 13.1 What Neotoma Ingests (MVP)

- **File uploads:** User-initiated, explicit
- **Gmail attachments:** User selects labels, explicit trigger

## 13.2 What Neotoma MUST NOT Ingest (MVP)

- Email bodies (privacy, scope)
- Entire inboxes (automatic scanning)
- Cloud drives (Dropbox, Google Drive)
- WhatsApp/iMessage exports (automatic)
- Browser history (privacy)

## 13.3 Ingestion Pipeline (Mandatory Order)

1. **Upload** → File received
2. **Store** → File stored to S3/filesystem
3. **Normalize** → Convert to common format (PDF)
4. **Extract Raw Text** → pdf-parse or OCR (Tesseract)
5. **Detect Schema** → Rule-based type detection
6. **Extract Fields** → Schema-specific deterministic extraction
7. **Resolve Entities** → Generate canonical entity IDs
8. **Generate Events** → Extract dates → create timeline events
9. **Insert Graph** → Transactional insert (record + entities + events + edges)
10. **Emit Events** → Observability events for monitoring

**OCR MUST be deterministic and consistent (same image → same text).**

---

# 14. Schema Doctrine

## 14.1 Two-Tier Type System

Neotoma uses a **two-tier system** for record types:

**Tier 1: Application-Level Types** (used in code, database, MCP actions)

- Fine-grained types: `invoice`, `receipt`, `transaction`, `note`, `document`, `message`, `contract`, `travel_document`, `identity_document`, etc.
- Purpose: Precise type detection, field extraction, entity/event mapping
- Defined in: `src/config/record_types.ts`

**Tier 2: Schema Families** (used in documentation, high-level categorization)

- High-level groupings: `Financial`, `Productivity`, `Knowledge`, `Legal`, `Travel`, `Identity`
- Purpose: Organize types conceptually without losing implementation precision
- Defined in: `docs/subsystems/record_types.md`

## 14.2 MVP Application Types

**Financial:**

- `invoice` — Invoices (money owed to/from vendors)
- `receipt` — Proof-of-purchase documents
- `transaction` — Individual debits/credits (from uploads)
- `statement` — Periodic statements (bank, credit, utilities)
- `account` — Financial account snapshots

**Productivity:**

- `note` — Free-form text, journals, markdown files
- `document` — Structured files, specs, PDFs (generic fallback)
- `message` — Emails, DMs, chat transcripts
- `task` — Action items with status
- `project` — Multi-step initiatives
- `event` — Meetings, appointments, calendar events

**Knowledge:**

- `contact` — People and organization records
- `dataset` — Tabular datasets (CSV, spreadsheet uploads)

**Legal:**

- `contract` — Contracts and legal documents

**Travel:**

- `travel_document` — Flight itineraries, hotel bookings, boarding passes

**Identity:**

- `identity_document` — Passports, IDs, licenses

**Fallback:**

- `document` — Generic fallback for unrecognized types (replaces PDFDocument)

**Note:** These types directly support Tier 1 ICP workflows (AI-Native Operators, Knowledge Workers, Founders). See [`docs/subsystems/record_types.md`](./subsystems/record_types.md) for complete field mappings, extraction rules, and entity/event generation rules.

## 14.3 Schema Families (Documentation Only)

- **Financial:** `['invoice', 'receipt', 'transaction', 'statement', 'account']`
- **Productivity:** `['note', 'document', 'message', 'task', 'project', 'event']`
- **Knowledge:** `['contact', 'dataset']`
- **Legal:** `['contract']`
- **Travel:** `['travel_document']`
- **Identity:** `['identity_document']`

**Important:** Schema families are for **documentation and user-facing categorization only**. Code MUST use application-level types.

## 14.4 Schema Rules

- Application types MUST be canonical and versioned
- Application types MUST be explicit (no implicit types)
- Application types MUST be stable (no breaking changes)
- Application types MUST be minimal (no unnecessary fields)
- Unrecognized documents → `document` fallback (generic)
- Application type MUST NOT change once assigned
- Schema evolution MUST be additive
- Code MUST use application types (`invoice`), NOT schema families (`Financial`)

**Reference:** See [`docs/subsystems/record_types.md`](./subsystems/record_types.md) for complete type catalog.

---

# 15. Entity Resolution Doctrine

## 15.1 Entity ID Generation (Deterministic)

```typescript
function generateEntityId(entityType: string, canonicalName: string): string {
  const normalized = normalizeEntityValue(entityType, canonicalName);
  const hash = sha256(`${entityType}:${normalized}`);
  return `ent_${hash.substring(0, 24)}`;
}

function normalizeEntityValue(entityType: string, raw: string): string {
  let normalized = raw.trim().toLowerCase();

  if (entityType === "company") {
    // Remove common suffixes deterministically
    normalized = normalized.replace(
      /\s+(inc|llc|ltd|corp|corporation)\.?$/i,
      ""
    );
  }

  return normalized;
}
```

**Same name → same ID, globally. No duplicates.**

## 15.2 Entity Rules

Entity IDs MUST be:

- Canonical (globally unique representation)
- Stable (never change once created)
- Deduplicated (same name → same entity)
- Rule-based (deterministic normalization)
- Traced to observed text (not inferred)

Entities MUST NOT:

- Be inferred (only extracted from fields)
- Be LLM-generated
- Be renamed post-creation
- Mutate types (person → company forbidden)

**Entities survive across documents and sessions.**

---

# 16. Timeline and Event Doctrine

## 16.1 Event Generation Rules

Events MUST:

- Derive from extracted date fields (never inferred)
- Reflect actual dates in documents
- Be timestamp-normalized (ISO 8601)
- Be source-field-linked (traceability)
- Have deterministic IDs (hash-based)

Events MUST NOT:

- Be inferred or predicted
- Be created without source date
- Mutate after creation

## 16.2 Timeline Requirements

Timeline MUST be:

- Chronological (sorted by `event_timestamp`)
- Deterministic (same events → same order)
- Stable (events never removed without user action)
- Source-linked (every event → source record + field)

**AI MUST rely on timeline for temporal reasoning, not guess.**

---

# 17. MCP: The Truth API

## 17.1 MCP Actions (Allowed)

- `upload_file` — Ingest and process file
- `list_records` — Query records with filters
- `fetch_record` — Get single record by ID
- `search` — Structured search (no semantic in MVP)
- `create_entity` — Manually create entity
- `link` — Create graph edge
- `update_record` — Update metadata only (not extracted_fields)

## 17.2 MCP Rules

MCP MUST:

- Return full structured truth (no summaries without source)
- Never modify truth without validation
- Validate all input (schema validation)
- Provide deterministic JSON responses
- Reject destructive operations (no delete in MVP)

MCP MUST NOT:

- Allow modification of `raw_text`
- Allow modification of `schema_type`
- Allow modification of `extracted_fields` (except metadata)
- Allow deletion (MVP; future: user-triggered only)
- Ingest implicitly (always explicit user action)

---

# 18. AI Safety Doctrine

AI tools (ChatGPT, Claude, Cursor) MUST:

- Access truth **only via MCP** (no direct DB access)
- Reference `record_id` in answers (provenance)
- Never invent entities (only use existing)
- Never invent fields (only use extracted)
- Never reference nonexistent truth
- Default to conservative outputs ("I don't see that field")

**Any spec allowing LLM guessing without MCP grounding is invalid.**

---

# 19. Consistency Models

Understanding consistency is critical for correct implementation.

## 19.1 Strong Consistency (Immediate)

**Subsystems:**

- Core records (metadata, properties)
- Graph edges (record→entity, record→event)
- Entities (creation, canonical IDs)
- Timeline events (from date fields)
- Provenance metadata
- Auth permissions

**Guarantee:** Read-after-write consistency. After write completes, all reads immediately reflect the write.

**UI Behavior:** Display immediately, no "loading..." needed.

## 19.2 Bounded Eventual Consistency (Delayed)

**Subsystems:**

- Full-text search index (max 5s delay)
- Vector embeddings (max 10s delay)
- Cross-entity search (max 5s delay)

**Guarantee:** Reads become consistent within known time window.

**UI Behavior:** Show "Indexing..." message, auto-refresh after delay, provide manual refresh button.

---

# 20. Testing and Quality Requirements

## 20.1 Test Types (All Required)

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

## 20.2 Coverage Targets

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

---

# 21. Observability Requirements

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

---

# 22. Privacy and Security Commitments

## 22.1 Privacy (PII Handling)

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

## 22.2 Security

**Authentication:**

- Supabase Auth (email/password, OAuth)
- JWT tokens validated on every request

**Authorization:**

- Row-Level Security (RLS) in PostgreSQL
- MVP: All authenticated users see all records (single-user)
- Future: Per-user isolation via `user_id` column + RLS policies

**Data Protection:**

- Database encryption at rest (Supabase default)
- HTTPS for all API calls
- WSS (WebSocket Secure) for MCP connections

---

# 23. Repository-Wide Agent Instructions

Every AI assistant (Cursor, ChatGPT, Claude) working on Neotoma MUST follow:

## 23.1 Mandatory Loading Order

1. **Load this manifest FIRST** (before any other work)
2. Load `docs/context/index.md` (navigation guide)
3. Load task-specific docs as indicated by context index
4. Load `docs/conventions/documentation_standards.md` if creating/editing docs

## 23.2 Absolute Constraints

1. **Never violate Truth Layer boundaries** (no strategy/execution logic)
2. **Never introduce nondeterminism** (no random IDs, no LLM extraction in MVP)
3. **Never generate features outside MVP scope** (no semantic search, no agents)
4. **Always follow schema-first principles** (type-driven, not inference-driven)
5. **Enforce immutability** (raw_text, schema_type, extracted_fields)
6. **Enforce safety and explicit control** (user approves all ingestion)
7. **Always output deterministic, validated artifacts** (code, specs, docs)

## 23.3 Document Generation Rules

When generating docs, specs, or Feature Units:

1. **Treat this manifest as root context** (resolve ambiguities here)
2. **Reject scope creep** (stay within Truth Layer)
3. **Validate against invariants** (MUST/MUST NOT lists)
4. **Apply constraints to all artifacts** (specs, code, tests)
5. **Treat forbidden patterns as errors** (halt and report)

## 23.4 Code Generation Rules

When writing code:

1. **Extraction MUST be rule-based** (regex, parsing; no LLM)
2. **IDs MUST be hash-based** (entities, events, records)
3. **All collections MUST be sorted** (deterministic iteration)
4. **Graph writes MUST be transactional** (all-or-nothing)
5. **Errors MUST use ErrorEnvelope** (structured, trace_id)
6. **No PII in logs** (record IDs only)

---

# 24. Risk Classification and Hold Points

## 24.1 When Agents MUST Stop

AI assistants MUST stop and request human approval for:

1. **Schema changes** (table structure, breaking JSONB changes)
2. **High-risk changes** (see `docs/private/governance/risk_classification.md`)
3. **Manifest changes** (this file)
4. **Security changes** (auth, RLS, encryption)
5. **Violating documented constraints** (even if user requests)

## 24.2 Risk Levels

**Low Risk:**

- Documentation updates
- UI text changes
- Unit test additions

**Medium Risk:**

- New Feature Units
- API endpoint additions
- Extraction logic changes

**High Risk:**

- Schema migrations
- Auth changes
- Breaking API changes

---

# 25. Final Invariants and Success Criteria

Neotoma MUST:

- **Preserve truth** (immutable, provenance-tracked)
- **Maintain determinism** (reproducible outputs)
- **Maintain stability** (no breaking changes)
- **Never infer meaning** (extract, don't interpret)
- **Never hallucinate** (no synthetic data)
- **Never mutate truth** (except metadata)
- **Never exceed its layer** (Truth only, no strategy/execution)

Neotoma MUST remain forever compatible with:

- **Agent-driven upper layers** (e.g., Agentic Portfolio for strategy, Agentic Wallet for execution)
- **AI-native operating environments** (MCP, agents)
- **Deterministic computational reasoning** (reproducible, testable)

Any layer built on Neotoma must respect the read-only boundary: it can consume truth but cannot mutate it.

---

# 26. How to Use This Manifest

## 26.1 For AI Assistants

**Every session:**

1. Load this manifest first
2. Reference it to resolve ambiguities
3. Validate all outputs against invariants
4. Stop at hold points for human approval

**When uncertain:**

- Default to conservative interpretation
- Prioritize determinism over convenience
- Prioritize correctness over feature richness
- Ask for clarification rather than guess

## 26.2 For Human Developers

**Before starting work:**

1. Read this manifest
2. Read relevant subsystem docs from `docs/context/index.md`
3. Understand which layer you're working in (Truth only)
4. Verify feature fits within Neotoma's scope

**During implementation:**

- Follow schema-first approach
- Write deterministic code
- Test for reproducibility
- Document all assumptions

**Before committing:**

- Verify alignment with manifest
- Check MUST/MUST NOT lists
- Run full test suite
- Update docs if patterns changed

---

# 27. Versioning and Evolution

## 27.1 Manifest Versioning

**Version:** 1.0.0
**Last Updated:** 2024-12-01
**Status:** Canonical

## 27.2 Change Process

Changes to this manifest require:

1. Proposal with rationale
2. Tech lead approval
3. Architecture review
4. Update all dependent docs
5. Regression test suite
6. Announcement to team

**This manifest is the foundation. Changes are rare and high-risk.**

---

# 28. Cross-References

This manifest replaces:

- `docs/01_NEOTOMA_FOUNDATION.md` (architectural principles)
- `docs/02_NEOTOMA_PRODUCT_CONTEXT.md` (product context)

All other documentation MUST reference:

- **This file only** (`docs/NEOTOMA_MANIFEST.md`)

Update references in:

- `docs/context/index.md`
- All subsystem docs
- All Feature Unit specs
- All governance docs
- All testing docs

---

## Agent Instructions

### When to Load This Document

Load `docs/NEOTOMA_MANIFEST.md` **FIRST in every agent session**, regardless of task type.

This is the **root of truth** for all Neotoma work. Every feature, spec, code change, and documentation update MUST align with this manifest.

### Required Co-Loaded Documents

After loading this manifest, immediately load:

1. `docs/context/index.md` — Navigation guide and reading strategies (load SECOND)
2. Task-specific docs as indicated by context index reading strategies

### Constraints Agents Must Enforce

1. **Truth Layer boundaries:** MUST NOT implement strategy, execution, or agent logic in Neotoma code
2. **Determinism:** MUST NOT introduce randomness, LLM extraction (MVP), or nondeterministic logic (no `Date.now()` in business logic, no random IDs, no unstable sorting)
3. **Immutability:** MUST NOT modify `raw_text`, `schema_type`, or `extracted_fields` after storage (only metadata mutable)
4. **Schema-first:** MUST use application types from `docs/subsystems/record_types.md` (e.g., `invoice`, `receipt`), NOT schema families (e.g., `Financial`, `Productivity`)
5. **Explicit control:** MUST NOT implement automatic ingestion, background scanning, or implicit data collection
6. **Provenance:** MUST trace all outputs to source file + extraction rule + timestamp
7. **Graph integrity:** MUST maintain zero orphans, no cycles, typed edges only, transactional writes
8. **Privacy:** MUST NOT log PII from `properties` (record IDs only, not extracted fields)
9. **Multi-pattern matching:** MUST use 2+ patterns for schema detection (see `record_types.md`)
10. **Consistency models:** MUST apply correct consistency tier per subsystem (strong vs bounded eventual)

### Forbidden Patterns

- Violating Truth Layer boundaries (implementing strategy, execution, or autonomous agent behavior in Neotoma)
- Introducing nondeterminism (random IDs, LLM extraction in MVP, unstable sorting, `Date.now()` in logic)
- Generating features outside MVP scope (semantic search, real-time collaboration, predictive analytics)
- Breaking immutability (modifying raw_text, schema_type, extracted_fields after initial storage)
- Inferring beyond extraction (creating entities not present in fields, inferring relationships)
- Using schema families as database types (code must use application types: `invoice` not `Financial`)
- Schema mutations (changing assigned schema_type after creation)
- Synthetic data (guessing missing information, hallucinating fields)
- Upward dependencies (Domain layer calling Application or Presentation layers)
- Non-transactional graph writes (all record+entity+event inserts must be atomic)

### Validation Checklist

- [ ] Change respects Truth Layer boundaries (no strategy/execution logic)
- [ ] No nondeterministic logic introduced (no randomness, no LLM in MVP, no unstable sorts)
- [ ] Immutability preserved (raw_text, schema_type, extracted_fields immutable)
- [ ] Schema changes are additive only (no breaking changes, no column removal)
- [ ] Uses application types from `record_types.md` (not schema families)
- [ ] Multi-pattern matching for schema detection (2+ patterns required)
- [ ] Graph integrity maintained (no orphans, no cycles, transactional writes)
- [ ] Privacy preserved (no PII in logs, only record IDs)
- [ ] Provenance maintained (all outputs trace to source + rule)
- [ ] Consistency model correct (strong vs bounded eventual per subsystem)
- [ ] Tests cover all new paths (unit, integration, E2E as appropriate)
- [ ] Documentation updated to reflect changes
- [ ] Feature fits within Neotoma scope (Truth Layer only)
- [ ] No violations of MUST/MUST NOT lists (sections 11, 12)

---

**END OF MANIFEST**
