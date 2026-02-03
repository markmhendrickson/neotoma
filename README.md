# Neotoma: Truth Layer for AI Memory

Neotoma is a deterministic truth layer that transforms fragmented personal data into structured, queryable knowledge for AI agents.

## What It Does

Neotoma builds persistent structured memory for AI agents through **dual-path storing**: upload documents (PDFs, images, receipts, contracts) that get automatically structured, or provide structured data during agent conversations that gets stored and integrated into your memory graph. As you interact with ChatGPT, Claude, or Cursor, agents can read your accumulated memory, write new structured data, correct mistakes, and trigger reinterpretation. This creates an incremental knowledge base that grows more accurate and comprehensive over time.

The system transforms fragmented personal data into a unified memory graph. The graph connects people, companies, events, and relationships across all your data. Every fact traces back to its source. Dates automatically create timelines. Entities are unified across all source, so "Acme Corp" in one invoice matches "Acme Corp" in agent-created data, regardless of when you created them.

All memory is exposed to AI tools via Model Context Protocol (MCP). This ensures agents have structured, validated access to your truth layer. Agents can maintain context across sessions, answer questions about your personal data, and build on previous interactions. This turns fragmented personal data into a persistent, queryable memory that scales with your agent usage.

## Neotoma's Structured Personal Data Memory

Neotoma provides persistent, structured memory built on three architectural foundations:

**1. Privacy-First Architecture**

- User-controlled memory with end-to-end encryption and row-level security
- Your data remains yours. You own it completely with full export and deletion control
- Never used for training or provider access

**2. Deterministic Extraction**

- Schema-first field extraction with reproducible, explainable results
- Same input always produces same output. No hallucinations or probabilistic behavior.
- Full provenance: every field traces to its source
- Hash-based entity IDs ensure deterministic, tamper-evident records

**3. Cross-Platform Access**

- Works seamlessly with ChatGPT, Claude, Cursor, and Claude Code via MCP
- One memory system across all your AI tools. No platform lock-in.
- **Localhost Agent Compatible:** Aligns with localhost agent architectures (Claude Code) that run on your computer with private environment, data, and context, as [Karpathy describes](https://x.com/karpathy/status/2002118205729562949). Neotoma serves as the private data substrate that localhost agents depend on.

**These foundations enable:**

- **Immutable audit trail**: Every change is permanently recorded with full provenance. Time-travel queries let you see entity state at any point in time, showing how entities evolved as new observations arrived.
- **Cryptographic integrity**: Hash-based entity IDs and event chaining ensure deterministic, tamper-evident records
- **Event-sourced history**: Complete event log enables historical replay and audit trail of all modifications
- **Deterministic guarantees**: Same input always produces same output. No probabilistic behavior or hallucinations.
- **Dual-path storing**: Documents (PDFs, images, receipts) AND agent-created structured source
- **Entity resolution**: Deterministic hash-based canonical IDs unify entities across invoices, contracts, and agent interactions automatically
- **Timeline generation**: Automatic chronological ordering from date fields across all personal data
- **No context window limits**: Persistent storage means no truncation. All data remains accessible with consistent performance at scale
- **Persistent across sessions**: Memory persists indefinitely across all conversations and sessions

This enables agents to reason across all your data: documents, agent-created source, and conversations. This creates a unified memory graph that grows more valuable with each interaction.

## Problems Solved

| Problem                                                                                          | How Neotoma Solves It                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Personal data is fragmented**                                                                  | Dual-path storing from file uploads (PDFs, images, email attachments) and agent interactions, creating a single source of truth                                                         |
| **Provider memory is conversation-only**                                                         | Structured personal data memory. Entity resolution and timelines work across documents AND agent-created data                                                                           |
| **AI has no memory across sessions**                                                             | Persistent structured memory via MCP. Agents can read accumulated memory and write new structured data, maintaining continuity across sessions                                          |
| **No cross-data reasoning**                                                                      | Memory graph connects source, entities, and events with typed relationships, enabling agents to reason across all personal data                                                |
| **Repetitive context-setting**                                                                   | Agents query existing structured memory instead of requiring manual context re-entry; incremental memory growth reduces need for repeated explanations                                  |
| **Lost institutional knowledge**                                                                 | All insights and contextual data persist in structured, queryable format with full provenance                                                                                           |
| **Entity fragmentation**                                                                         | Hash-based canonical IDs unify entities across all personal data. "Acme Corp" in documents matches "Acme Corp" in agent-created data                                                    |
| **No temporal reasoning**                                                                        | Automatic timeline generation from date fields creates chronological event sequences across all personal data                                                                           |
| **No provenance or trust**                                                                       | Every fact traces to its source (document or agent interaction). Full audit trail for all data                                                                                          |
| **Platform lock-in**                                                                             | Cross-platform via MCP. Works with ChatGPT, Claude, and Cursor. Not locked to single provider or OS.                                                                                    |
| **LLM inconsistency ([jagged intelligence](https://x.com/karpathy/status/2002118205729562949))** | Deterministic substrate provides reliable truth layer agents can depend on. Creates verifiable domain for personal data with consistent, reproducible results despite LLM inconsistency |

## Who Neotoma Is For

Neotoma serves **AI-native individuals and small teams** who rely heavily on AI tools and need persistent memory that scales with their usage:

**AI-Native Individual Operators**

- Heavy ChatGPT, Claude, Cursor, or Raycast users who experience the frustration of starting every conversation from zero
- Need agents to remember context, preferences, and facts across sessions
- Willing to pay for persistent memory that eliminates repetitive context-setting

**High-Context Knowledge Workers**

- Researchers, analysts, consultants, lawyers who work with large volumes of personal data
- Require cross-data reasoning and entity unification across contracts, invoices, research papers, and agent-created data
- Need structured extraction from PDFs, images, and agent interactions with full provenance

**AI-Native Founders & Small Teams (2-20 people)**

- Teams where individual members adopt first, then expand to shared team memory
- Need multi-user support with row-level security for collaborative truth layer
- Bridge B2C individual adoption to B2B team expansion through bottom-up demand

**Why These Users Choose Neotoma:**

- Unified structured memory across all personal data: email, downloads, screenshots, cloud drives, and conversations
- Agents remember context, preferences, and facts across sessions without repetitive re-explanation
- Structured extraction from documents (PDFs, images) AND agent-created data, not just conversation history
- Cross-data reasoning with entity unification and timeline generation across all personal data
- One memory system that works across ChatGPT, Claude, and Cursor. No platform lock-in.
- Privacy-first architecture with user-controlled memory and encryption

Neotoma transforms fragmented personal data into persistent, queryable structured memory that grows more valuable with each interaction and data input.

## Comparison with Provider Memory

ChatGPT, Claude, and Gemini offer conversation-only memory. Neotoma provides structured personal data memory that works across platforms:

**What Neotoma Provides:**

- **Structured extraction**: Deterministic field extraction from documents (invoices, receipts, contracts) with full provenance
- **Cross-platform access**: One memory system works with ChatGPT, Claude, and Cursor via MCP
- **Privacy-first architecture**: User-controlled memory with encryption. Neotoma never uses your stored data for training
- **Deterministic storage**: Reproducible, explainable memory vs. ML-based probabilistic approaches
- **Entity resolution**: Hash-based canonical IDs unify entities across all your data automatically with cryptographic integrity
- **Timeline generation**: Automatic chronological ordering from date fields across all personal data
- **Immutable audit trail**: Every change permanently recorded with full provenance. Time-travel queries enable viewing entity state at any point in time
- **Event-sourced history**: Complete event log enables historical replay and audit trail of all modifications
- **No context window limits**: Persistent storage with consistent performance at scale. All data remains accessible without truncation.
- **Dual-path storing**: File uploads (PDFs, images, receipts) + agent-created structured source during interactions

## Current Status

**Version:** v0.2.15  
**Status:** Implemented (pending database migration application)

**Developer preview**: Planned during dogfooding once core invariants are stable. Discovery will be scheduled only if preview validation is insufficient.

Neotoma is in active development with a clear roadmap toward v1.0.0 MVP. The system currently supports:

- ✅ Sources-first storing architecture with content-addressed storage
- ✅ Dual-path storing (file uploads + agent interactions)
- ✅ Entity resolution with hash-based canonical IDs
- ✅ Timeline generation from date fields
- ✅ MCP tool integration for ChatGPT, Claude, and Cursor
- ✅ Full provenance and audit trail
- ✅ Row-level security for multi-user support
- ⏳ Database migrations ready for application

See [release documentation](docs/releases/) for detailed status and roadmap.

## Release Roadmap

Neotoma follows an incremental release model with clear milestones:

- **v0.2.0**: Minimal Storing + Correction Loop (`deployed`). Sources-first storing, interpretations, entity resolution, MCP tools (store, reinterpret, correct, merge_entities). See [`docs/releases/v0.2.0/`](docs/releases/v0.2.0/)
- **v0.2.1**: Entity Resolution Enhancement (`released`). Enhanced entity resolution with merge tracking and provenance. See [`docs/releases/v0.2.1/`](docs/releases/v0.2.1/)
- **v0.2.2**: Development Foundations (`released`). Developer experience improvements, testing infrastructure, documentation standards. See [`docs/releases/v0.2.2/`](docs/releases/v0.2.2/)
- **v0.2.15**: Vocabulary Alignment + API Simplification (`implemented`). Unified vocabulary, API simplification, source graph tables. See [`docs/releases/v0.2.15/`](docs/releases/v0.2.15/)
- **v0.3.0**: Operational Hardening (`planning`). Operational resilience and quota enforcement (async upload retry, stale interpretation cleanup, strict quota enforcement). See [`docs/releases/v0.3.0/`](docs/releases/v0.3.0/)
- **v0.4.0**: Intelligence + Housekeeping (`planning`). Intelligent features (duplicate detection, schema discovery) and housekeeping (archival). See [`docs/releases/v0.4.0/`](docs/releases/v0.4.0/)
- **v0.5.0**: Agent Cryptographic Signing (`planning`). Cryptographic attribution and permissioning for agent interactions. See [`docs/releases/v0.5.0/`](docs/releases/v0.5.0/)
- **v0.6.0**: Complete Architecture Migration (`planning`). Migrate entirely to sources-first/payload-based architecture. Breaking change requiring data migration. See [`docs/releases/v0.6.0/`](docs/releases/v0.6.0/)
- **v0.9.0**: MCP Support System (`planning`). MCP-based support inquiry system with RAG agent. See [`docs/releases/v0.9.0/`](docs/releases/v0.9.0/)
- **v1.0.0**: MVP (`planning`). First production-capable release with structured personal data memory, dual-path storing, entity resolution, timelines, cross-platform MCP access, and minimal UI. Target: 2026-01-23. See [`docs/releases/v1.0.0/`](docs/releases/v1.0.0/)
- **v2.0.0**: End-to-End Encryption (`planning`). E2EE implementation for privacy-first architecture. See [`docs/releases/v2.0.0/`](docs/releases/v2.0.0/)
- **v2.1.0**: GDPR & US State Privacy Compliance (`planning`). Compliance features for GDPR and US state privacy laws. See [`docs/releases/v2.1.0/`](docs/releases/v2.1.0/)

See [`docs/releases/`](docs/releases/) for complete release documentation.

## Quick Links

**Getting Started:**

- **[Getting Started Guide](docs/developer/getting_started.md)**: Development setup
- **[CLI setup](docs/developer/getting_started.md#cli-setup)**: CLI install and auth
- **[CLI overview](docs/developer/cli_overview.md)**: CLI workflows and usage
- **[MCP overview](docs/developer/mcp_overview.md)**: MCP entry points and setup links
- **[MVP Overview](docs/specs/MVP_OVERVIEW.md)**: Product specification
- **[Architecture](docs/architecture/architecture.md)**: System design

**Documentation:**

- **[Specifications](docs/specs/)**: Requirements, MCP spec, feature units
- **[Architecture](docs/architecture/)**: System design, decisions, consistency
- **[Schema](docs/subsystems/schema.md)**: Database schema, JSONB structures, migrations
- **[Subsystems](docs/subsystems/)**: Storing, extraction, search, schema, etc.
- **[Foundation](docs/foundation/)**: Core identity, philosophy, principles
- **[Feature Units](docs/feature_units/)**: Completed and in-progress features
- **[Releases](docs/releases/)**: Release plans and status

**Development:**

- **[Development Workflow](docs/developer/development_workflow.md)**: Git, branches, PRs
- **[Automated test catalog](docs/testing/automated_test_catalog.md)**: File level test inventory and suite commands
- **[Testing Standard](docs/testing/testing_standard.md)**: Test types and coverage

## Interactive Prototype

Complete demonstration of all MVP feature units with static fixtures:

```bash
npm run dev:prototype
```

See [`docs/prototypes/`](docs/prototypes/) for full documentation.

## Development

**Prerequisites:**

- Node.js v18.x or v20.x (LTS)
- npm v9.x+
- Supabase account (free tier)

**Setup:**

```bash
# Install dependencies
npm install

# Configure environment (see docs/developer/getting_started.md)
# Create .env with Supabase credentials

# Run database migrations
npm run migrate

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

# Auto-rebuild MCP server for Cursor (watch mode)
npm run dev:mcp

# Run WebSocket MCP bridge
npm run dev:ws
```

**Testing:**

```bash
# Run all tests
npm test

# Run integration tests
npm run test:integration

# Run E2E tests (Playwright)
npm run test:e2e

# Type checking
npm run type-check

# Linting
npm run lint
```

## Using with AI Tools

Neotoma provides MCP (Model Context Protocol) integration for AI tools, enabling agents to access and modify your structured memory.

**Authentication:** OAuth 2.0 with PKCE (recommended) provides secure, long-lived connections with automatic token refresh. Session tokens are deprecated.

**Setup Guides:**

- **[Cursor MCP Setup](docs/developer/mcp_cursor_setup.md)**: Configure Neotoma MCP server for Cursor (stdio-based, OAuth)
- **[Claude Code MCP Setup](docs/developer/mcp_claude_code_setup.md)**: Configure Neotoma MCP server for Claude Code localhost agent (stdio-based, OAuth)
- **[ChatGPT Custom GPT Setup](docs/developer/mcp_chatgpt_setup.md)**: Configure Neotoma HTTP Actions for ChatGPT Custom GPTs (OpenAPI-based)
- **[OAuth Implementation](docs/developer/mcp_oauth_implementation.md)**: OAuth flow details and migration guide

**Available Actions:**

- **Storing:** `store` (unified storing for structured and unstructured source)
- **Interpretation:** `reinterpret` (re-run interpretation on existing source with new config)
- **Correction:** `correct` (create high-priority correction observations)
- **Entity Operations:** `retrieve_entities`, `retrieve_entity_by_identifier`, `retrieve_entity_snapshot`, `merge_entities`, `list_entity_types`
- **Observation Operations:** `list_observations`, `retrieve_field_provenance`
- **Relationship Operations:** `create_relationship`, `list_relationships`, `get_relationship_snapshot`, `retrieve_related_entities`
- **Timeline Operations:** `list_timeline_events`
- **Graph Operations:** `retrieve_graph_neighborhood` (complete graph context around any node)
- **File Operations:** `retrieve_file_url` (retrieve signed URL for stored source)
- **Schema Management:** `analyze_schema_candidates`, `get_schema_recommendations`, `update_schema_incremental`, `register_schema`

## Using Neotoma MCP in Another Workspace

To use the Neotoma MCP server from a different workspace/repository, see the detailed instructions in the [Cursor MCP Setup guide](docs/developer/mcp_cursor_setup.md).

## Documentation Structure

**Core Documentation:**

- **Foundation** (`docs/foundation/`): Core identity, philosophy, principles, data models, problem statement, product positioning
- **Specifications** (`docs/specs/`): MVP overview, requirements, MCP spec, feature units, ICP profiles, data models
- **Architecture** (`docs/architecture/`): System design, layered architecture, architectural decisions, determinism, consistency
- **Subsystems** (`docs/subsystems/`): Storing, extraction, search, schema registry, relationships, auth, events, errors, privacy
- **Feature Units** (`docs/feature_units/`): Completed features, standards, workflows, templates
- **Releases** (`docs/releases/`): Release plans, status, reports, execution schedules

**Developer Resources:**

- **Developer** (`docs/developer/`): Getting started, development workflow, MCP setup, troubleshooting
- **Testing** (`docs/testing/`): Automated test catalog, testing standards, fixtures, coverage requirements
- **Infrastructure** (`docs/infrastructure/`): Deployment guides, hosting configuration
- **Operations** (`docs/operations/`): Troubleshooting guides, operational procedures
- **Observability** (`docs/observability/`): Logging, metrics, tracing standards
- **API** (`docs/api/`): REST API documentation
- **Reference** (`docs/reference/`): Error codes, canonical terms, vocabulary

**Design & UI:**

- **UI** (`docs/ui/`): Design system, patterns, component specs, DSL specification, style guides
- **Prototypes** (`docs/prototypes/`): Interactive prototype documentation, quickstart guides

**Additional Resources:**

- **Conventions** (`docs/conventions/`): Documentation standards, README generation framework, native browser debugging rule
- **Proposals** (`docs/proposals/`): Future work proposals migrated from plans
- **Legal** (`docs/legal/`): Compliance, privacy policy, terms of service, changelogs
- **Migration** (`docs/migration/`): Migration guides, breaking changes
- **Templates** (`docs/templates/`): Issue templates, PR templates
- **Vocabulary** (`docs/vocabulary/`): Canonical terminology and definitions

**Primary Entry Point:** Foundation rules in `.cursor/rules/` provide agent instructions and documentation loading order

## Core Principles

1. **Deterministic (Creates Verifiable Domain)**: Same input → same output, always. No randomness, no LLM extraction in MVP. By making extraction deterministic and verifiable, Neotoma creates a verifiable domain for personal data. This provides objective, non-gameable results that enable reliable, consistent outcomes LLMs can depend on.
2. **Schema-first**: Type-driven extraction, not freeform notes or conversation-only memory
3. **Explainable**: Every field traces to source (document or agent interaction)
4. **Entity-unified**: Canonical IDs across all personal data (hash-based)
5. **Timeline-aware**: Automatic chronological ordering from date fields across all personal data
6. **Cross-platform**: MCP-exposed structured memory for ChatGPT, Claude, Cursor. Not platform-locked.
7. **Privacy-first**: User-controlled memory with encryption and row-level security
8. **Immutable**: Truth never changes once stored. Immutable audit trail with cryptographic integrity.
9. **Provenance**: Full audit trail for all source (documents and agent interactions). Every change permanently recorded.
10. **Event-sourced**: Domain Events → Reducers → State updates. Complete event log enables historical replay and time-travel queries.
11. **Cryptographic integrity**: Hash-based entity IDs and event chaining ensure deterministic, tamper-evident records
12. **Dual-path storing**: File uploads + agent interactions via MCP
13. **Four-layer model**: Source → Observation → Entity → Entity Snapshot

## Testing

Neotoma uses comprehensive testing across multiple layers:

- **Unit Tests**: Pure functions, deterministic logic (>85% coverage for domain)
- **Integration Tests**: Service interactions, database operations
- **E2E Tests**: Full user flows via Playwright
- **Property-Based Tests**: Invariant verification

See [`docs/testing/automated_test_catalog.md`](docs/testing/automated_test_catalog.md) for the full test inventory. See [`docs/testing/testing_standard.md`](docs/testing/testing_standard.md) for complete testing requirements.

## Contributing

Neotoma is currently in private development. For questions or collaboration inquiries, please contact the maintainers.

## License

MIT
