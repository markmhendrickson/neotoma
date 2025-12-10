## Neotoma — Truth Layer for AI Memory

Neotoma is a deterministic truth layer that transforms fragmented personal data into structured, queryable knowledge for AI agents.

### What It Does

Neotoma builds persistent memory for AI agents through two paths: upload documents (PDFs, images, receipts, contracts) that get automatically structured, or provide contextual information during agent conversations that gets remembered for future sessions. As you interact with ChatGPT, Claude, or Cursor, agents can both read your accumulated memory and write new contextual data, creating an incremental knowledge base that grows more accurate and comprehensive over time.

The system transforms fragmented documents and conversation context into a unified memory graph—connecting people, companies, events, and relationships across all your data. Every fact traces back to its source, dates automatically create timelines, and entities are unified across documents so "Acme Corp" in one invoice matches "Acme Corp" in another, regardless of when you uploaded them.

All memory is exposed to AI tools via Model Context Protocol (MCP), ensuring agents have structured, validated access to your truth layer. This enables agents to maintain context across sessions, answer questions about your personal data, and build on previous interactions—turning fragmented files and forgotten conversations into a persistent, queryable memory that scales with your agent usage.

### Problems Solved

| Problem                              | How Neotoma Solves It                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Personal data is fragmented**      | Unified ingestion from file uploads (PDFs, images, email attachments) and agent interactions, creating a single source of truth             |
| **AI has no memory across sessions** | Persistent memory via MCP—agents can read accumulated memory and write new contextual data, maintaining continuity across conversations     |
| **No cross-document reasoning**      | Memory graph connects records, entities, and events with typed relationships, enabling agents to reason across all documents                |
| **Repetitive context-setting**       | Agents query existing memory instead of requiring manual context re-entry; incremental memory growth reduces need for repeated explanations |
| **Lost institutional knowledge**     | All document insights and conversation context persist in structured, queryable format with full provenance                                 |
| **Entity fragmentation**             | Hash-based canonical IDs unify entities across documents—"Acme Corp" and "ACME CORP" resolve to the same entity                             |
| **No temporal reasoning**            | Automatic timeline generation from date fields creates chronological event sequences across all documents                                   |
| **No provenance or trust**           | Every fact traces to its source document or conversation; full audit trail for all extracted data                                           |

### Who Neotoma Is For

Neotoma serves **AI-native individuals and small teams** who rely heavily on AI tools and need persistent memory that scales with their usage:

**AI-Native Individual Operators**

- Heavy ChatGPT, Claude, Cursor, or Raycast users who experience the frustration of starting every conversation from zero
- Need agents to remember context, preferences, and facts across sessions
- Willing to pay for persistent memory that eliminates repetitive context-setting

**High-Context Knowledge Workers**

- Researchers, analysts, consultants, lawyers who work with large volumes of documents
- Require cross-document reasoning and entity unification across contracts, invoices, research papers
- Need structured extraction from PDFs and images with full provenance

**AI-Native Founders & Small Teams (2–20 people)**

- Teams where individual members adopt first, then expand to shared team memory
- Need multi-user support with row-level security for collaborative truth layer
- Bridge B2C individual adoption to B2B team expansion through bottom-up demand

**Why These Users Need Neotoma:**

- Documents scattered across email, downloads, screenshots, cloud drives—no unified memory
- Every AI interaction requires re-explaining context, preferences, and background
- Can't reason across multiple documents or build on previous agent interactions
- Entity fragmentation ("Acme Corp" vs "ACME CORP") prevents accurate cross-document analysis
- No temporal reasoning—can't build timelines or understand events chronologically

Neotoma transforms these pain points into persistent, queryable memory that grows more valuable with each interaction and document upload.

**Core Workflow:**

1. **Ingestion** — Dual-path: user uploads PDFs, images (JPG, PNG) with OCR support, or agents store contextual data via MCP `store_record` during conversations
2. **Extraction** — Deterministic field extraction via regex/parsing (file uploads) or direct property assignment (agent interactions); no LLM inference in MVP
3. **Schema Assignment** — Type detection (invoice, receipt, contract, document, etc.)
4. **Entity Resolution** — Canonical ID generation for people, companies, locations
5. **Observation Creation** — Granular, source-specific facts extracted from documents or provided via agent interactions
6. **Reducer Execution** — Deterministic computation of entity snapshots from observations
7. **Event Generation** — Timeline events from extracted date fields
8. **Memory Graph** — Records → Entities → Events with typed edges and relationships
9. **AI Access** — Structured memory exposed via MCP for ChatGPT, Claude, Cursor; agents can read existing memory and write new contextual data, enabling incremental memory growth

### Architecture

Neotoma implements a **five-layer architecture**:

- **External Layer** — MCP clients, Gmail API, Supabase, file storage
- **Infrastructure Layer** — Database clients, file I/O, network utilities, crypto
- **Domain Layer** — Ingestion, extraction, entity resolution, graph builder, search
- **Application Layer** — MCP actions, workflows, orchestration
- **Presentation Layer** — React frontend, HTTP API

Neotoma serves as the **Truth Layer** in a layered architecture, supporting Strategy Layer (e.g., Agentic Portfolio) and Execution Layer (e.g., Agentic Wallet) above it. See [`docs/architecture/architecture.md`](docs/architecture/architecture.md) for complete architecture.

### Key Features

**MVP (v1.0):**

- File upload (PDF, JPG, PNG) — single and bulk with progress tracking
- Rule-based extraction (regex, parsing) — deterministic, no LLM
- Entity resolution — hash-based canonical IDs
- Timeline events — automatic chronological ordering
- Memory graph — records, entities, events with typed relationships
- Structured search — filters, full-text (bounded eventual consistency)
- MCP server — 8 MVP actions for AI access
- Multi-user support — authentication and row-level security (2–20 people)
- External providers — Gmail attachment import
- Billing — Stripe integration for subscriptions
- Local storage — offline mode support

**Post-MVP:**

- LLM-assisted extraction (with deterministic fallback)
- Semantic search (hybrid structured + embeddings)
- Additional providers — X (Twitter), Instagram, Plaid
- Real-time collaboration
- Advanced analytics

### Quick Links

**Getting Started:**

- **[Getting Started Guide](docs/developer/getting_started.md)** — Development setup
- **[MVP Overview](docs/specs/MVP_OVERVIEW.md)** — Product specification
- **[Architecture](docs/architecture/architecture.md)** — System design

**Documentation:**

- **[Specifications](docs/specs/)** — Requirements, MCP spec, feature units
- **[Architecture](docs/architecture/)** — System design, decisions, consistency
- **[Subsystems](docs/subsystems/)** — Ingestion, extraction, search, schema, etc.
- **[Foundation](docs/foundation/)** — Core identity, philosophy, principles
- **[Feature Units](docs/feature_units/)** — Completed and in-progress features
- **[Releases](docs/releases/)** — Release plans and status

**Development:**

- **[Development Workflow](docs/developer/development_workflow.md)** — Git, branches, PRs
- **[Testing Standard](docs/testing/testing_standard.md)** — Test types and coverage
- **[Integration Setup](docs/integrations/)** — Gmail, Plaid configuration

### Interactive Prototype

Complete demonstration of all MVP feature units with static fixtures:

```bash
npm run dev:prototype
```

See [`docs/prototypes/`](docs/prototypes/) for full documentation.

### Development

**Prerequisites:**

- Node.js v18.x or v20.x (LTS)
- npm v9.x+
- Supabase account (free tier)

**Setup:**

```bash
# Install dependencies
npm install

# Configure environment (see docs/developer/getting_started.md)
# Create .env.development with Supabase credentials

# Run database schema
# Execute supabase/schema.sql in Supabase SQL Editor

# Run tests
npm test
```

**Development Servers:**

```bash
# Run development server (main app)
npm run dev:ui

# Run backend server
npm run dev:http

# Run full stack (HTTP + UI)
npm run dev:full

# Run prototype
npm run dev:prototype

# Run MCP server (stdio mode)
npm run dev

# Run WebSocket MCP bridge
npm run dev:ws
```

**Testing:**

```bash
# Run all tests
npm test

# Run E2E tests (Playwright)
npm run test:e2e

# Type checking
npm run type-check

# Linting
npm run lint
```

### Documentation Structure

**Core Documentation:**

- **Specifications** (`docs/specs/`) — MVP overview, requirements, MCP spec, feature units
- **Architecture** (`docs/architecture/`) — System design, layered architecture, decisions
- **Subsystems** (`docs/subsystems/`) — Ingestion, extraction, search, schema registry, relationships
- **Foundation** (`docs/foundation/`) — Core identity, philosophy, principles, data models
- **Feature Units** (`docs/feature_units/`) — Completed features and standards
- **Releases** (`docs/releases/`) — Release plans, status, reports

**Developer Resources:**

- **Developer** (`docs/developer/`) — Getting started, workflow, troubleshooting
- **Testing** (`docs/testing/`) — Testing standards, fixtures
- **Integrations** (`docs/integrations/`) — External provider setup (Gmail, Plaid)
- **Infrastructure** (`docs/infrastructure/`) — Deployment guides
- **Operations** (`docs/operations/`) — Troubleshooting, observability
- **Legal** (`docs/legal/`) — Compliance, privacy policy, terms of service

**Design & UI:**

- **UI** (`docs/ui/`) — Design system, patterns, component specs
- **Prototypes** (`docs/prototypes/`) — Interactive prototype documentation

### Core Principles

1. **Deterministic** — Same input → same output, always (no randomness, no LLM extraction in MVP)
2. **Schema-first** — Type-driven extraction, not freeform notes
3. **Explainable** — Every field traces to source document
4. **Entity-unified** — Canonical IDs across documents (hash-based)
5. **Timeline-aware** — Automatic chronological ordering from date fields
6. **AI-ready** — MCP-exposed structured memory for ChatGPT, Claude, Cursor
7. **Immutable** — Truth never changes once stored
8. **Provenance** — Full audit trail for all extracted data
9. **Four-layer model** — Document → Entity → Observation → Snapshot
10. **Event-sourced** — Domain Events → Reducers → State updates

### Integrations

**MVP:**

- **Gmail** — Attachment import (user-triggered)

**Post-MVP:**

- **X (Twitter)** — Media import
- **Instagram** — Photo import
- **Plaid** — Bank transaction sync (Tier 3+ use case)

See [`docs/integrations/`](docs/integrations/) for setup instructions.

### Testing

Neotoma uses comprehensive testing across multiple layers:

- **Unit Tests** — Pure functions, deterministic logic (>85% coverage for domain)
- **Integration Tests** — Service interactions, database operations
- **E2E Tests** — Full user flows via Playwright
- **Property-Based Tests** — Invariant verification

See [`docs/testing/testing_standard.md`](docs/testing/testing_standard.md) for complete testing requirements.

### Current Status

- **v0.1.0** — In progress (see [`docs/releases/in_progress/v0.1.0/`](docs/releases/in_progress/v0.1.0/))
- **v1.0.0** — MVP planning (see [`docs/releases/in_progress/v1.0.0/`](docs/releases/in_progress/v1.0.0/))
- **v2.0.0** — Post-MVP planning (see [`docs/releases/in_progress/v2.0.0/`](docs/releases/in_progress/v2.0.0/))

### License

MIT
