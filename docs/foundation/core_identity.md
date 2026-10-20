# Neotoma Core Identity

## What Neotoma Is

Neotoma is **the system of record for AI agents** — the designated place where a fact about agent-held state is settled, such that any disagreeing copy elsewhere is by definition stale.

The category is an **authority claim**, not a mechanism claim. A bank's ledger does not compete on "providing versioning"; it decides what your balance is, and every other copy reconciles to it. Neotoma's claim is the same in kind: when an agent, a tool, or a person disagrees with Neotoma about what is currently true, Neotoma is right and the other copy is out of date. Everything in [Core Responsibilities](#core-responsibilities) below is *how* that claim is honoured — versioned observations, deterministic reduction, field-level provenance, corrections-win. None of it is *what the claim is*. A system that merely stored versions would be a state layer; a system whose stored version is the one that counts is a system of record.

The authority is exercised through six powers, stated in the vision-phase table in [`README.md`](../../README.md) as **P2 — Authority over state**:

| Power | What it settles |
|---|---|
| **Domain ownership** | Which principal's word governs a given slice of state |
| **Correction rights** | Who may overrule a recorded fact, and whose overrule stands |
| **Supersession** | Which assertion replaced which, so "current" is a determinable fact rather than a guess |
| **Policy ownership** | Who sets the rules by which the previous three are decided |
| **Temporary grants** | Authority lent for a bounded scope and duration, then withdrawn |
| **Disclosure logs** | What was released to whom, so the exercise of authority is itself on the record |

Today the **mechanisms** exist (corrections always win, `SUPERSEDES` relationships, per-operation access controls) while the **semantics** — who may correct what, scoped by domain — are future work. That gap is the honest status of the category claim and is tracked as P2 in the README's vision-phase table; it is not a reason to state the category as something smaller.

### What the authority covers, and what it does not

The claim is bounded, and the boundary is load-bearing:

- **In scope: agent-generated and agent-held state** — observations, inferences, entity resolutions, corrections, decisions, and the contextual records agents read and write across tools and sessions. For these, Neotoma is authoritative.
- **Out of scope: an adopter's operational business data.** An adopter's own Postgres remains the system of record for business data; Neotoma sits between their agents and that database rather than replacing it (see [`../icp/primary_icp.md`](../icp/primary_icp.md), "Integration surface framing"). The **Postgres-authoritative, Neotoma-as-rebuildable-derived-layer** posture is explicitly supported ([`substrate_and_applications.md`](substrate_and_applications.md)), and it does not weaken the claim — the domain over which Neotoma is authoritative is agent state, not every fact an adopter holds.

Reading the noun without that boundary produces a contradiction the foundation does not intend: that Neotoma both is and is not the system of record. It is, for agent state; it is not, for an adopter's business records.

### Relation to the State Layer invariant

"State layer" is **retired as Neotoma's category noun** (decided 2026-08-21; see [`product_positioning.md`](product_positioning.md)). It remains correct and in active use as the name of an **architectural invariant** — the State Layer / Operational Layer boundary in [`layered_architecture.md`](layered_architecture.md), which holds that Neotoma stores and signals but never decides, infers, or acts.

The two are not in tension, and the distinction is worth stating precisely because it is easy to collapse:

- **As a category noun**, "state layer" describes a *mechanism* and invites the buyer to compare storage mechanisms. That is the comparison Neotoma loses by entering, because it concedes that the question is how state is stored rather than whose copy counts.
- **As an invariant**, "state layer" describes a *constraint on Neotoma's own behaviour*. That constraint is what makes the authority claim credible: an arbiter that also reasons and acts on its own behalf is not an arbiter. Neotoma can be authoritative about state precisely because it never decides what state means.

So: retire the noun from every definition that leads with it; keep the invariant wherever it names the boundary.

Subordinate descriptions, each of which explains how the authority is exercised rather than restating the category:

- The **lowest-level, canonical source of truth** for any data that benefits from deterministic state evolution — personal records, professional context, project metadata, external facts, and third-party data the user chooses to track (see [`what_to_store.md`](what_to_store.md))
- A **substrate** for AI-native computing
- A **privacy-first structured memory system** that transforms fragmented data into structured, queryable truth via dual-path ingestion
- The authoritative record **beneath any operational layer** — agents, pipelines, orchestration systems, and custom applications that read truth from Neotoma and write results back as observations, under the State Layer invariant described above

None of these is the category. Led with, each one invites a mechanism comparison — against a database, a cache, or a retrieval-memory vendor — on an axis Neotoma does not need to win.
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

The commitments that protect these choices, and the moves that would cross them, are named in [`redlines.md`](redlines.md).

### Core Responsibilities

These are the mechanisms by which the authority claim above is honoured. They are not the identity: a competitor could implement every one of them and still not be the place where a fact is settled. Neotoma focuses exclusively on:
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
