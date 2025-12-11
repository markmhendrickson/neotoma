## Neotoma — Truth Layer for AI Memory

Neotoma is a deterministic truth layer that transforms fragmented personal data into structured, queryable knowledge for AI agents.

### What It Does

Neotoma builds persistent structured memory for AI agents through **dual-path ingestion**: upload documents (PDFs, images, receipts, contracts) that get automatically structured, or provide contextual information during agent conversations that gets remembered for future sessions. As you interact with ChatGPT, Claude, or Cursor, agents can both read your accumulated memory and write new structured data, creating an incremental knowledge base that grows more accurate and comprehensive over time.

The system transforms fragmented personal data into a unified memory graph—connecting people, companies, events, and relationships across all your data. Every fact traces back to its source, dates automatically create timelines, and entities are unified across all records so "Acme Corp" in one invoice matches "Acme Corp" in agent-created data, regardless of when you created them.

All memory is exposed to AI tools via Model Context Protocol (MCP), ensuring agents have structured, validated access to your truth layer. This enables agents to maintain context across sessions, answer questions about your personal data, and build on previous interactions—turning fragmented personal data into a persistent, queryable memory that scales with your agent usage.

### Neotoma's Structured Personal Data Memory

Neotoma provides persistent, structured memory built on three architectural foundations:

**1. Privacy-First Architecture**

- User-controlled memory with end-to-end encryption and row-level security
- Your data remains yours—you own it completely with full export and deletion control
- Never used for training or provider access

**2. Deterministic Extraction**

- Schema-first field extraction with reproducible, explainable results
- Same input always produces same output—no hallucinations or probabilistic behavior
- Full provenance: every field traces to its source

**3. Cross-Platform Access**

- Works seamlessly with ChatGPT, Claude, and Cursor via MCP
- One memory system across all your AI tools—no platform lock-in

**These foundations enable:**

- **Dual-path ingestion** — Documents (PDFs, images, receipts) AND agent-created structured data
- **Entity resolution** — Deterministic hash-based canonical IDs unify entities across invoices, contracts, and agent interactions automatically
- **Timeline generation** — Automatic chronological ordering from date fields across all personal data
- **No context window limits** — Persistent storage means no truncation; all data remains accessible with consistent performance at scale
- **Persistent across sessions** — Memory persists indefinitely across all conversations and sessions

This enables agents to reason across **all your data**—documents, agent-created records, and conversations—creating a unified memory graph that grows more valuable with each interaction.

### Problems Solved

| Problem                                  | How Neotoma Solves It                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Personal data is fragmented**          | Dual-path ingestion from file uploads (PDFs, images, email attachments) and agent interactions, creating a single source of truth                      |
| **Provider memory is conversation-only** | Structured personal data memory—entity resolution and timelines work across documents AND agent-created data                                           |
| **AI has no memory across sessions**     | Persistent structured memory via MCP—agents can read accumulated memory and write new structured data, maintaining continuity across sessions          |
| **No cross-data reasoning**              | Memory graph connects records, entities, and events with typed relationships, enabling agents to reason across all personal data                       |
| **Repetitive context-setting**           | Agents query existing structured memory instead of requiring manual context re-entry; incremental memory growth reduces need for repeated explanations |
| **Lost institutional knowledge**         | All insights and contextual data persist in structured, queryable format with full provenance                                                          |
| **Entity fragmentation**                 | Hash-based canonical IDs unify entities across all personal data—"Acme Corp" in documents matches "Acme Corp" in agent-created data                    |
| **No temporal reasoning**                | Automatic timeline generation from date fields creates chronological event sequences across all personal data                                          |
| **No provenance or trust**               | Every fact traces to its source (document or agent interaction); full audit trail for all data                                                         |
| **Platform lock-in**                     | Cross-platform via MCP—works with ChatGPT, Claude, Cursor (not locked to single provider or OS)                                                        |

### Who Neotoma Is For

Neotoma serves **AI-native individuals and small teams** who rely heavily on AI tools and need persistent memory that scales with their usage:

**AI-Native Individual Operators**

- Heavy ChatGPT, Claude, Cursor, or Raycast users who experience the frustration of starting every conversation from zero
- Need agents to remember context, preferences, and facts across sessions
- Willing to pay for persistent memory that eliminates repetitive context-setting

**High-Context Knowledge Workers**

- Researchers, analysts, consultants, lawyers who work with large volumes of personal data
- Require cross-data reasoning and entity unification across contracts, invoices, research papers, and agent-created data
- Need structured extraction from PDFs, images, and agent interactions with full provenance

**AI-Native Founders & Small Teams (2–20 people)**

- Teams where individual members adopt first, then expand to shared team memory
- Need multi-user support with row-level security for collaborative truth layer
- Bridge B2C individual adoption to B2B team expansion through bottom-up demand

**Why These Users Choose Neotoma:**

- Unified structured memory across all personal data—email, downloads, screenshots, cloud drives, and conversations
- Agents remember context, preferences, and facts across sessions without repetitive re-explanation
- Structured extraction from documents (PDFs, images) AND agent-created data—not just conversation history
- Cross-data reasoning with entity unification and timeline generation across all personal data
- One memory system that works across ChatGPT, Claude, and Cursor—no platform lock-in
- Privacy-first architecture with user-controlled memory and encryption

Neotoma transforms fragmented personal data into persistent, queryable structured memory that grows more valuable with each interaction and data input.

### Comparison with Provider Memory

ChatGPT, Claude, and Gemini offer conversation-only memory. Neotoma provides structured personal data memory that works across platforms:

**What Neotoma Provides:**

- **Structured extraction** — Deterministic field extraction from documents (invoices, receipts, contracts) with full provenance
- **Cross-platform access** — One memory system works with ChatGPT, Claude, and Cursor via MCP
- **Privacy-first architecture** — User-controlled memory with encryption; your data never used for training
- **Deterministic storage** — Reproducible, explainable memory vs. ML-based probabilistic approaches
- **Entity resolution** — Canonical IDs unify entities across all your data automatically
- **Timeline generation** — Automatic chronological ordering from date fields across all personal data
- **No context window limits** — Persistent storage with consistent performance at scale
- **Dual-path ingestion** — Documents AND agent-created structured data, not just chat history

**Provider Memory Context:**

Provider memory is conversation-only with contextual limitations. While providers will improve context windows and cross-session memory, their memory remains unstructured conversation text, platform-locked, provider-controlled, and ML-based probabilistic. Neotoma provides structured personal data memory without these constraints.

### Core Workflow

1. **Ingestion** — Dual-path: user uploads PDFs, images (JPG, PNG) with OCR support, or agents store contextual data via MCP `store_record` during conversations
2. **Extraction** — Deterministic field extraction via regex/parsing (file uploads) or direct property assignment (agent interactions); no LLM inference in MVP
3. **Schema Assignment** — Type detection (invoice, receipt, contract, document, etc.)
4. **Entity Resolution** — Canonical ID generation for people, companies, locations across all personal data
5. **Observation Creation** — Granular, source-specific facts extracted from documents or provided via agent interactions
6. **Reducer Execution** — Deterministic computation of entity snapshots from observations
7. **Event Generation** — Timeline events from date fields across all personal data
8. **Memory Graph** — Records → Entities → Events with typed edges and relationships
9. **AI Access** — Structured memory exposed via MCP for ChatGPT, Claude, Cursor; agents can read existing memory and write new structured data, enabling incremental memory growth

### Architecture

Neotoma implements a **five-layer architecture**:

- **External Layer** — MCP clients, Gmail API, Supabase, file storage
- **Infrastructure Layer** — Database clients, file I/O, network utilities, crypto
- **Domain Layer** — Ingestion, extraction, entity resolution, graph builder, search
- **Application Layer** — MCP actions, workflows, orchestration
- **Presentation Layer** — React frontend, HTTP API

Neotoma serves as the **Truth Layer** in a layered architecture, supporting Strategy Layer (e.g., Agentic Portfolio) and Execution Layer (e.g., Agentic Wallet) above it. See [`docs/architecture/architecture.md`](docs/architecture/architecture.md) for complete architecture.

### Releases

**Current Releases:**

- **v0.1.0** — Internal MCP Release (`ready_for_deployment`) — MCP-focused validation release with deterministic ingestion, extraction, entity resolution, and graph construction. See [`docs/releases/in_progress/v0.1.0/`](docs/releases/in_progress/v0.1.0/)
- **v0.1.1** — Documentation & Support System (`planning`) — Documentation improvements and support infrastructure. See [`docs/releases/in_progress/v0.1.1/`](docs/releases/in_progress/v0.1.1/)
- **v0.2.0** — Chat Transcript Extraction Tool (`planning`) — CLI tool for extracting structured data from chat transcripts. See [`docs/releases/in_progress/v0.2.0/`](docs/releases/in_progress/v0.2.0/)
- **v1.0.0** — MVP (`planning`) — First production-capable release with structured personal data memory, dual-path ingestion, entity resolution, timelines, cross-platform MCP access, and minimal UI. Target: 2026-02-24. See [`docs/releases/in_progress/v1.0.0/`](docs/releases/in_progress/v1.0.0/)
- **v2.0.0** — End-to-End Encryption (`planning`) — E2EE implementation for privacy-first architecture. See [`docs/releases/in_progress/v2.0.0/`](docs/releases/in_progress/v2.0.0/)
- **v2.1.0** — GDPR & US State Privacy Compliance (`planning`) — Compliance features for GDPR and US state privacy laws. See [`docs/releases/in_progress/v2.1.0/`](docs/releases/in_progress/v2.1.0/)

See [`docs/releases/`](docs/releases/) for complete release documentation.

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

- **Foundation** (`docs/foundation/`) — Core identity, philosophy, principles, data models, problem statement, product positioning
- **Specifications** (`docs/specs/`) — MVP overview, requirements, MCP spec, feature units, ICP profiles, data models
- **Architecture** (`docs/architecture/`) — System design, layered architecture, architectural decisions, determinism, consistency
- **Subsystems** (`docs/subsystems/`) — Ingestion, extraction, search, schema registry, relationships, auth, events, errors, privacy
- **Feature Units** (`docs/feature_units/`) — Completed features, standards, workflows, templates
- **Releases** (`docs/releases/`) — Release plans, status, reports, execution schedules

**Developer Resources:**

- **Developer** (`docs/developer/`) — Getting started, development workflow, MCP setup, troubleshooting
- **Testing** (`docs/testing/`) — Testing standards, fixtures, coverage requirements
- **Integrations** (`docs/integrations/`) — External provider setup (Gmail, Plaid), provider configuration
- **Infrastructure** (`docs/infrastructure/`) — Deployment guides, hosting configuration
- **Operations** (`docs/operations/`) — Troubleshooting guides, operational procedures
- **Observability** (`docs/observability/`) — Logging, metrics, tracing standards
- **API** (`docs/api/`) — REST API documentation
- **Reference** (`docs/reference/`) — Error codes, canonical terms, vocabulary

**Design & UI:**

- **UI** (`docs/ui/`) — Design system, patterns, component specs, DSL specification, style guides
- **Prototypes** (`docs/prototypes/`) — Interactive prototype documentation, quickstart guides

**Additional Resources:**

- **Context** (`docs/context/`) — Documentation navigation guide, reading order
- **Conventions** (`docs/conventions/`) — Documentation standards, README generation framework
- **Legal** (`docs/legal/`) — Compliance, privacy policy, terms of service, changelogs
- **Migration** (`docs/migration/`) — Migration guides, breaking changes
- **Templates** (`docs/templates/`) — Issue templates, PR templates
- **Vocabulary** (`docs/vocabulary/`) — Canonical terminology and definitions

**Primary Entry Point:** [`docs/context/index.md`](docs/context/index.md) — Complete documentation navigation guide

### Core Principles

1. **Deterministic** — Same input → same output, always (no randomness, no LLM extraction in MVP)
2. **Schema-first** — Type-driven extraction, not freeform notes or conversation-only memory
3. **Explainable** — Every field traces to source (document or agent interaction)
4. **Entity-unified** — Canonical IDs across all personal data (hash-based)
5. **Timeline-aware** — Automatic chronological ordering from date fields across all personal data
6. **Cross-platform** — MCP-exposed structured memory for ChatGPT, Claude, Cursor (not platform-locked)
7. **Privacy-first** — User-controlled memory with encryption and row-level security
8. **Immutable** — Truth never changes once stored
9. **Provenance** — Full audit trail for all data (documents and agent interactions)
10. **Dual-path ingestion** — File uploads + agent interactions via MCP
11. **Four-layer model** — Record → Entity → Observation → Snapshot
12. **Event-sourced** — Domain Events → Reducers → State updates

### Testing

Neotoma uses comprehensive testing across multiple layers:

- **Unit Tests** — Pure functions, deterministic logic (>85% coverage for domain)
- **Integration Tests** — Service interactions, database operations
- **E2E Tests** — Full user flows via Playwright
- **Property-Based Tests** — Invariant verification

See [`docs/testing/testing_standard.md`](docs/testing/testing_standard.md) for complete testing requirements.

### License

MIT
