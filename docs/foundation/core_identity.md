# Neotoma Core Identity

_(What Neotoma Is and Is Not)_

---

## Purpose

This document defines what Neotoma is and what it is not, establishing the fundamental boundaries and scope of the Truth Layer platform.

---

## What Neotoma Is

Neotoma is a **Truth Layer** — a durable, structured, deterministic personal-data substrate designed for AI-native workflows.

It is:

- The **lowest-level, canonical source of truth** for a user's personal and professional documents
- A **substrate** for AI-native personal computing
- A **memory system** that transforms fragmented files and facts into structured, queryable truth
- The **foundation layer** beneath agent-driven layers (e.g., Strategy Layer with Agentic Portfolio as example instance, Execution Layer with Agentic Wallet as part)

### Core Responsibilities

Neotoma focuses exclusively on:

1. **Ingestion** — Dual-path ingestion: user-provided file uploads (explicit, never automatic) and agent interactions where users provide contextual data via MCP `store_record` action, enabling incremental memory growth as agent usage scales
2. **Normalization** — Format conversion, text extraction, OCR (file uploads only)
3. **Extraction** — Deterministic field extraction via rule-based parsing (file uploads) or direct property assignment (agent interactions)
4. **Schema Assignment** — Type detection (FinancialRecord, IdentityDocument, etc.)
5. **Observation Creation** — Granular, source-specific facts extracted from documents or provided via agent interactions
6. **Reducer Execution** — Deterministic computation of entity snapshots from observations
7. **Schema Registry Management** — Config-driven schema evolution and versioning
8. **Entity Resolution** — Canonical ID generation for people, companies, locations
9. **Event Creation** — Timeline events from extracted date fields
10. **Memory Graph Construction** — Records → Entities → Events with typed edges, relationships
11. **Deterministic Retrieval** — Structured search and queries
12. **AI-Safe Access** — Truth exposure via MCP tools, enabling agents to both read and write memory

---

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

---

## Related Documents

- [`docs/context/index.md`](../context/index.md) — Documentation navigation guide
- [`docs/architecture/architecture.md`](../architecture/architecture.md) — System architecture
- [`docs/architecture/architectural_decisions.md`](../architecture/architectural_decisions.md) — Core architectural decisions
- [`docs/foundation/philosophy.md`](./philosophy.md) — Core philosophy and principles
- [`docs/foundation/data_models.md`](./data_models.md) — Data model definitions
