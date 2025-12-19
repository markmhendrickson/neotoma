## Neotoma — Truth Layer for AI Memory

Neotoma is a deterministic, privacy-first truth layer that turns fragmented personal data into structured, queryable memory for AI agents. It keeps every fact provable, every entity unified, and every update auditable while remaining accessible from any MCP-capable assistant.

### What It Does

Neotoma builds persistent structured memory through **dual-path ingestion**. Users can upload documents (PDFs, images, statements, contracts) that are deterministically extracted, or allow agents to store structured payloads during conversations. Agents such as ChatGPT, Claude, and Cursor can read the accumulated memory, correct prior facts, trigger reinterpretation, and append new data—resulting in a knowledge base that becomes richer every session.

Fragmented files, notes, and agent interactions are normalized into a single memory graph. Entities (people, companies, accounts) are deduplicated with hash-based IDs, every field traces back to its source, and date fields automatically emit timeline events. Because access happens through the Model Context Protocol, the same structured truth is available across all AI tools without re-ingesting context.

### Neotoma's Structured Personal Data Memory

Neotoma rests on three architectural foundations:

1. **Privacy-First Architecture** – User-controlled storage, encryption, and row-level security. Data never becomes provider training fuel and can be exported or deleted at any time.
2. **Deterministic Extraction** – Schema-first parsing, rule-based detection, and hash-based identifiers guarantee that the same input always yields the same output with full provenance.
3. **Cross-Platform Access** – MCP exposure ensures consistency across ChatGPT, Claude, Cursor, and future tools. The truth layer is not tied to any UI or vendor.

These choices unlock immutable audit logs, cryptographic integrity, event-sourced history, dual-path ingestion, deterministic timelines, and persistent context beyond any model window.

### Problems Solved

| Problem | How Neotoma Solves It |
| --- | --- |
| **Personal data is fragmented** | Dual-path ingestion unifies uploads and agent-created payloads into a single source of truth |
| **Provider memory is conversation-only** | Structured personal data memory with entity resolution and timelines across documents *and* agent interactions |
| **AI has no memory across sessions** | Persistent MCP-backed storage maintains context, letting agents build on previous work |
| **No cross-data reasoning** | Typed relationships connect records, entities, and events so agents can reason across all personal data |
| **Repetitive context-setting** | Agents query existing structured memory instead of relearning facts each session |
| **Lost institutional knowledge** | Immutable observations and reducers preserve every correction with provenance |
| **Entity fragmentation** | Hash-based canonical IDs keep "Acme Corp" consistent everywhere |
| **No temporal reasoning** | Deterministic event generation builds chronological timelines from any date field |
| **No provenance or trust** | Every field links to its source document or payload, enabling audits |
| **Platform lock-in** | MCP access works with any assistant—no proprietary UI lock-in |

### Who Neotoma Is For

- **AI-Native Operators**: Heavy ChatGPT/Claude/Cursor users who need agents to remember context, preferences, and commitments without restating them.
- **High-Context Knowledge Workers**: Researchers, analysts, consultants, and lawyers who must unify contracts, invoices, research, and correspondence with full provenance.
- **AI-Native Founders & Small Teams (2–20 people)**: Teams that adopt individually, then expand to shared truth with row-level security and deterministic audit trails.

These users choose Neotoma for unified structured memory, deterministic extraction, cross-tool accessibility, and privacy guarantees that consumer assistants cannot offer.

### Comparison with Provider Memory

**What Neotoma Provides**
- Structured extraction with rule-based schemas and provenance
- Cross-platform MCP interface (ChatGPT, Claude, Cursor, etc.)
- Privacy-first, user-owned storage with encryption and RLS
- Deterministic storage and graph semantics
- Entity resolution, timeline generation, immutable audit trail, dual-path ingestion

**Provider Memory Context**
- Provider memory remains conversation text, probabilistic, and platform-locked. Even as context windows grow, it lacks structured entities, provenance, and graph semantics. Neotoma supplies those capabilities without constraining users to a single assistant.

### Core Workflow

1. **Ingestion** – Explicit uploads or MCP payload submissions enter the pipeline.
2. **Extraction** – Deterministic text/OCR plus rule-based schema detection.
3. **Schema Assignment** – Application-type schemas (invoice, receipt, contract, etc.) drive downstream behavior.
4. **Entity Resolution** – Canonical IDs unify people, companies, accounts, and locations.
5. **Observation Creation** – Immutable, source-scoped facts with full metadata.
6. **Reducer Execution** – Deterministic reducers compute current snapshots.
7. **Event Generation** – Date fields emit timeline events for chronological reasoning.
8. **Memory Graph** – Records, entities, events, and typed relationships live in one graph.
9. **AI Access** – MCP tools expose search, retrieval, correction, reinterpretation, and graph navigation to any assistant.

### Architecture

Neotoma spans three dimensions:

- **Five-Layer System Architecture**: External (clients/providers) → Infrastructure (DB, storage, crypto) → Domain (ingestion, extraction, entity/event services) → Application (MCP actions, workflows) → Presentation (React UI, HTTP API).
- **Truth Model**: Payload → Observation → Entity → Snapshot, ensuring provenance at every hop.
- **Ecosystem Role**: The Truth Layer underpins future Strategy and Execution layers (e.g., Agentic Portfolio, Agentic Wallet) while remaining deterministic and read-focused itself.

See [`docs/architecture/architecture.md`](docs/architecture/architecture.md) for full design details.

### Schema

Neotoma’s PostgreSQL schema combines normalized tables with JSONB payloads:
- Core tables: `records`, `observations`, `entity_snapshots`, `relationships`, `schema_registry`, `state_events`
- Deterministic JSONB schemas for extracted fields
- Event-sourced audit trail with cryptographic fields
- Hash-based entity IDs and typed edges to keep the graph consistent
- Exportable snapshots via `npm run schema:export`

Reference [`docs/subsystems/schema.md`](docs/subsystems/schema.md) for full definitions and migration rules.

### Releases

- **v0.1.0 – Internal MCP Release** (`ready_for_deployment`): Deterministic ingestion, entity resolution, graph builder, and MCP actions validated via agents. [`docs/releases/v0.1.0/`](docs/releases/v0.1.0/)
- **v0.2.0 – Minimal Ingestion + Correction Loop** (`planning`): Sources-first ingestion, MCP ingest/reinterpret/correct/merge actions, and Batch 0 migrations (sources table, storage infrastructure including `upload_queue` + `storage_usage`). [`docs/releases/v0.2.0/`](docs/releases/v0.2.0/)
- **v0.2.1 – Documentation & Support System** (`planning`): Hardens docs, support flows, and developer onboarding. [`docs/releases/v0.2.1/`](docs/releases/v0.2.1/)
- **v0.3.0 – Operational Hardening** (`planning`): Upload queue processor, stale interpretation cleanup, strict quota enforcement, and metrics. [`docs/releases/v0.3.0/`](docs/releases/v0.3.0/)
- **v0.4.0 – Intelligence + Housekeeping** (`planning`): Duplicate detection, schema discovery, archival jobs. [`docs/releases/v0.4.0/`](docs/releases/v0.4.0/)
- **v1.0.0 – MVP** (`planning`): Multi-user UI, deterministic search, onboarding flow, and full entity/timeline UI. Target 2026‑01‑23. [`docs/releases/v1.0.0/`](docs/releases/v1.0.0/)
- **v2.0.0 – End-to-End Encryption** (`planning`): E2EE data paths and key management. [`docs/releases/v2.0.0/`](docs/releases/v2.0.0/)
- **v2.1.0 – GDPR & US State Privacy Compliance** (`planning`): Compliance automation and legal tooling. [`docs/releases/v2.1.0/`](docs/releases/v2.1.0/)

See [`docs/releases/`](docs/releases/) for complete plans and status.

### Quick Links

**Getting Started**
- [Getting Started Guide](docs/developer/getting_started.md)
- [MVP Overview](docs/specs/MVP_OVERVIEW.md)
- [Architecture Overview](docs/architecture/architecture.md)

**Documentation**
- [Specifications](docs/specs/)
- [Architecture](docs/architecture/)
- [Schema](docs/subsystems/schema.md)
- [Subsystems](docs/subsystems/)
- [Foundation](docs/foundation/)
- [Feature Units](docs/feature_units/)
- [Releases](docs/releases/)

**Development Resources**
- [Development Workflow](docs/developer/development_workflow.md)
- [Testing Standard](docs/testing/testing_standard.md)
- [Integration Setup](docs/integrations/)

### Interactive Prototype

Run the static fixture prototype covering all MVP feature units:

```bash
npm run dev:prototype
```

Documentation lives in [`docs/prototypes/`](docs/prototypes/).

### Development

**Prerequisites**
- Node.js 18.x or 20.x (LTS)
- npm 9.x+
- Supabase project (free tier acceptable)

**Setup**

```bash
npm install                     # dependencies
# Configure .env.development with Supabase credentials
# Apply supabase/schema.sql via Supabase SQL editor
npm test                        # quick sanity run
```

**Development Servers**

```bash
npm run dev:ui                  # Vite UI
npm run dev:http                # HTTP API / MCP actions
npm run dev:full                # UI + HTTP concurrently
npm run dev:prototype           # design prototype
npm run dev                     # MCP stdio server
npm run dev:mcp                 # MCP watch mode
npm run dev:ws                  # MCP WebSocket bridge
```

**Testing & Validation**

```bash
npm test                        # Vitest unit suite
npm run test:integration        # Integration suite
npm run test:e2e                # Playwright end-to-end tests
npm run type-check              # TypeScript
npm run lint                    # ESLint
```

### Using with AI Tools

Neotoma exposes MCP actions so assistants can ingest, query, and correct truth:
- **Cursor MCP Setup**: [`docs/developer/mcp_cursor_setup.md`](docs/developer/mcp_cursor_setup.md)
- **ChatGPT Custom GPT Setup**: [`docs/developer/mcp_chatgpt_setup.md`](docs/developer/mcp_chatgpt_setup.md)

Available actions include payload operations (`submit_payload`, `update_record`, `retrieve_records`, `delete_record`), file operations (`upload_file`, `get_file_url`), entity/timeline/graph navigation (`retrieve_entities`, `get_entity_snapshot`, `list_observations`, `list_timeline_events`, `get_graph_neighborhood`), and relationship management (`create_relationship`, `list_relationships`).

### Using Neotoma MCP in Another Workspace

Follow the Cursor MCP guide to point any workspace at the Neotoma MCP server and reuse the same truth layer across projects. See [`docs/developer/mcp_cursor_setup.md`](docs/developer/mcp_cursor_setup.md).

### Documentation Structure

**Core Documentation**
- Foundation (`docs/foundation/`)
- Specifications (`docs/specs/`)
- Architecture (`docs/architecture/`)
- Subsystems (`docs/subsystems/`)
- Feature Units (`docs/feature_units/`)
- Releases (`docs/releases/`)

**Developer Resources**
- Developer (`docs/developer/`)
- Testing (`docs/testing/`)
- Integrations (`docs/integrations/`)
- Infrastructure (`docs/infrastructure/`)
- Operations (`docs/operations/`)
- Observability (`docs/observability/`)
- API (`docs/api/`)
- Reference (`docs/reference/`)

**Design & UI**
- UI (`docs/ui/`)
- Prototypes (`docs/prototypes/`)

**Additional Resources**
- Context (`docs/context/`)
- Conventions (`docs/conventions/`)
- Legal (`docs/legal/`)
- Migration (`docs/migration/`)
- Templates (`docs/templates/`)
- Vocabulary (`docs/vocabulary/`)

Primary entry point: [`docs/context/index.md`](docs/context/index.md)

### Core Principles

1. Deterministic (no randomness, no LLM extraction in MVP)
2. Schema-first (application types drive extraction)
3. Explainable (every field traces to source)
4. Entity-unified (hash-based canonical IDs)
5. Timeline-aware (automatic chronological events)
6. Cross-platform (MCP exposure, no vendor lock-in)
7. Privacy-first (user-controlled, encrypted, RLS enforced)
8. Immutable truth (events > reducers > state)
9. Provenance (full audit chain)
10. Event-sourced (append-only history with replay)
11. Cryptographic integrity (hash-chained entities/events)
12. Dual-path ingestion (files + agent interactions)
13. Payload → Observation → Entity → Snapshot layering

### Testing

Neotoma adheres to the [Testing Standard](docs/testing/testing_standard.md):
- **Unit Tests** ensure deterministic logic and reducers (>85% coverage on critical services)
- **Integration Tests** cover Supabase interactions, ingestion flows, and MCP tools
- **E2E Tests** (Playwright) validate UI + MCP flows end-to-end
- **Property & Invariant Tests** enforce deduplication, entity hashing, and determinism invariants

### License

MIT
