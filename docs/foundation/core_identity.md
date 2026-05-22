# Neotoma Core Identity

## What Neotoma Is
Neotoma is a **state layer** — a privacy-first, idempotent, cross-platform data substrate that stores, serves, and signals structured state for AI-native workflows.
It is:
- The **lowest-level, canonical source of truth** for any data that benefits from deterministic state evolution — personal records, professional context, project metadata, external facts, and third-party data the user chooses to track (see [`what_to_store.md`](what_to_store.md))
- A **substrate** for AI-native computing
- A **privacy-first structured memory system** that transforms fragmented data into structured, queryable truth via dual-path ingestion
- The **state layer** beneath any operational layer — agents, pipelines, orchestration systems, and custom applications that read truth from Neotoma and write results back as observations
**Core Architectural Choices (Defensible Differentiators):**
1. **Privacy-First:** User-controlled memory, no provider access, never used for training
2. **Idempotent/Verifiable Domain (Creates Verifiable Domain for Personal Data):** Same operation → same final state, always (reproducible, explainable, no hallucinations, no duplicates). Hash-based entity IDs ensure deterministic, tamper-evident records.

   **For LLM interpretation**: Model outputs vary (stochastic), but system enforces idempotence through:
   - Canonicalization (normalize, sort, round)
   - Hashing (create identity)
   - Deduplication (prevent duplicates)

   By making operations idempotent and verifiable, Neotoma creates objective (non-gameable) results—a verifiable domain for personal data that enables reliable, consistent results LLMs can depend on.
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
8. **Entity Resolution** — Canonical ID generation for people, companies, locations across all stored data
9. **Event Creation** — Timeline events from date fields across all stored data
10. **Memory Graph Construction** — Records → Entities → Events with typed edges, relationships
11. **Deterministic Retrieval** — Structured search and queries; optional semantic similarity for entity retrieval when text query provided
12. **AI-Safe Access** — Truth exposure via MCP tools, enabling agents to both read and write structured memory (cross-platform: ChatGPT, Claude, Cursor)
13. **State Change Signaling** — After every successful write, emit structured events describing what changed, enabling consuming layers to react to state transitions without polling. See "Substrate Signaling" subsection below.

### Substrate Signaling

Neotoma signals state changes to registered consumers (agents, daemons, peer instances) via structured events. This is a substrate-level primitive analogous to a database's write-ahead log or LISTEN/NOTIFY mechanism — it reports what changed, not what to do about it.

The boundary between the substrate and its consumers:
- **Substrate:** emits events, delivers to registered endpoints (best-effort, fire-and-forget)
- **Consumers:** filter, prioritize, reason, act

The substrate does not subscribe to its own events, does not run decision loops, and does not orchestrate. Agents that process events (e.g., an issue-processing daemon) are operational-layer consumers, not part of the substrate.

Delivery is best-effort, not guaranteed. The substrate does not promise at-least-once, exactly-once, or in-order delivery; consumers are responsible for catch-up via state queries (`list_recent_changes`, snapshot reads). See `philosophy.md` §5.9 (Signal Without Strategy) for the full architectural invariant and `scope_decisions.md` SD-002 for the scope boundary against strategy-layer notifications.

## What Neotoma Is NOT
Neotoma is **not**:
- An LLM agent or autonomous system
- A productivity tool, task manager, or workflow engine (Neotoma signals state changes but does not decide what to do about them — that is the consuming layer's responsibility; see `philosophy.md` §5.9)
- A note-taking system or PKM app
- A writing assistant or browser integration
- A calendar client or financial planner
- A crypto wallet or general semantic search platform over arbitrary unstructured content (structured retrieval is primary; entity semantic search is an optional retrieval mode over the structured store)
- A decision engine, strategy planner, or execution agent (Neotoma stores the artifacts of strategy and execution as versioned state; it does not decide or act). [Agentic Portfolio](../architecture/agentic_portfolio_overview.md) and [Agentic Wallet](../architecture/agentic_wallet_overview.md) are examples of *operational systems* built on Neotoma — not architectural layers Neotoma extends into.
**Any attempt to generate features outside this scope MUST be rejected.**
