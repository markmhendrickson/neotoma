# Neotoma Core Identity

## What Neotoma Is
Neotoma is a **Truth Layer** — a privacy-first, deterministic, cross-platform personal-data substrate designed for AI-native workflows.
It is:
- The **lowest-level, canonical source of truth** for a user's personal and professional data (documents + agent-created data)
- A **substrate** for AI-native personal computing
- A **privacy-first structured memory system** that transforms fragmented personal data into structured, queryable truth via dual-path ingestion
- The **foundation layer** beneath agent-driven layers (e.g., Strategy Layer with Agentic Portfolio as example instance, Execution Layer with Agentic Wallet as part)
**Core Architectural Choices (Defensible Differentiators):**
1. **Privacy-First:** User-controlled memory, no provider access, never used for training
2. **Deterministic (Creates Verifiable Domain for Personal Data):** Same input → same output, always (reproducible, explainable, no hallucinations); hash-based entity IDs ensure deterministic, tamper-evident records. By making extraction deterministic and verifiable, Neotoma creates objective (non-gameable) results—a verifiable domain for personal data that enables reliable, consistent results LLMs can depend on.
3. **Cross-Platform:** Works with all AI tools via MCP (ChatGPT, Claude, Cursor), not platform-locked
4. **Immutable Audit Trail:** Every change permanently recorded with full provenance; event-sourced architecture enables historical replay and time-travel queries
5. **Cryptographic Integrity:** Hash-based entity IDs and event chaining ensure deterministic, tamper-evident records
These architectural choices are defensible because competitors (model providers, OS providers, startups) cannot pursue them due to structural constraints (business model conflicts, architectural constraints, platform lock-in revenue models). See [`docs/private/competitive/defensible_differentiation_framework.md`](../private/competitive/defensible_differentiation_framework.md).

### Core Responsibilities
Neotoma focuses exclusively on:
1. **Ingestion** — Dual-path ingestion: user-provided file uploads (explicit, never automatic) and agent interactions where users provide contextual data via MCP `ingest` action, enabling incremental memory growth as agent usage scales
2. **Normalization** — Format conversion, text extraction, OCR (file uploads only)
3. **Extraction** — Deterministic field extraction via rule-based parsing (file uploads) or direct property assignment (agent interactions)
4. **Schema Assignment** — Type detection (FinancialRecord, IdentityDocument, etc.)
5. **Observation Creation** — Granular, source-specific facts extracted from documents or provided via agent interactions
6. **Reducer Execution** — Deterministic computation of entity snapshots from observations
7. **Schema Registry Management** — Config-driven schema evolution and versioning
8. **Entity Resolution** — Canonical ID generation for people, companies, locations across all personal data
9. **Event Creation** — Timeline events from date fields across all personal data
10. **Memory Graph Construction** — Records → Entities → Events with typed edges, relationships
11. **Deterministic Retrieval** — Structured search and queries
12. **AI-Safe Access** — Truth exposure via MCP tools, enabling agents to both read and write structured memory (cross-platform: ChatGPT, Claude, Cursor)

## What Neotoma Is NOT
Neotoma is **not**:
- An LLM agent or autonomous system
- A productivity tool, task manager, or workflow engine
- A note-taking system or PKM app
- A writing assistant or browser integration
- A calendar client or financial planner
- A crypto wallet or semantic search platform
- A strategy layer (e.g., [Agentic Portfolio](../architecture/agentic_portfolio_overview.md) as an example instance for financial strategy)
- An execution layer (e.g., [Agentic Wallet](../architecture/agentic_wallet_overview.md) as part of the execution layer for financial execution)
**Any attempt to generate features outside this scope MUST be rejected.**
