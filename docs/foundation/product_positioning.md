---
title: Neotoma Product Positioning and Differentiation
summary: "This section maps Neotoma to April Dunford’s five core positioning choices plus the extended canvas used in agent skill `foundation/agent_instructions/cursor_skills/evaluate_positioning/SKILL.md` (mirrored at `.cursor/skills/evaluate_pos..."
---

# Neotoma Product Positioning and Differentiation

## 7.0 Positioning canvas (Obviously Awesome)

This section maps Neotoma to April Dunford’s five core positioning choices plus the extended canvas used in agent skill `foundation/agent_instructions/cursor_skills/evaluate_positioning/SKILL.md` (mirrored at `.cursor/skills/evaluate_positioning/SKILL.md`). Supporting evidence and nuance live in §7.1–7.5.

| Component | Neotoma answer |
|-----------|----------------|
| **Competitive alternatives** | Homebrew SQLite/Postgres, git + markdown stacks, flat JSON/YAML, one-off agent memory implementations, and VC-funded retrieval memory (Mem0, Zep, LangChain-style patterns). Provider-native chat memory is a parallel alternative for conversation-only use cases. See §7.4. |
| **Unique attributes** | Privacy-first user-controlled architecture; deterministic, schema-first extraction with hash-based IDs and reproducible state; cross-tool MCP access; versioned observations with field-level provenance and immutability guarantees. See §7.2. |
| **Value themes** | Two primary themes: (1) **Tax removal** — stop being the human sync layer; subsumes continuity (one memory across tools) and sovereignty (your data, your control). (2) **State integrity** — prove your agent isn't operating on bad data; subsumes accountability (reconstruct what an agent knew at decision time). All copy should clearly serve one of these two themes. Pain-forward phrasing in §7.3. |
| **Best-fit customers** | One archetype — the **personal agentic OS builder/operator** — in three operational modes: debugging infrastructure, building pipelines, operating across tools. Not three separate personas. See `docs/icp/primary_icp.md`. Evaluator context in §7.5 (agents with tool use “get it” faster than search-only evals). |
| **Market category** | Primary external frame: **cross-tool memory for AI agents** (ICP vocabulary). Architecture frame ("deterministic state layer," "DPME") used internally and after the fold. Previously: Named category hypothesis: **Deterministic Personal Memory Engine (DPME)** (§7.2) — a *new category* play with a higher education tax; use when the audience already grasps the stack diagram. |
| **Relevant trends** | Proliferation of LLM apps that need private data + feedback loops; localhost / private-environment agents; agent evaluation and AEO as a discovery path (§7.1, §7.5). |
| **Positioning statement (internal)** | For people building an operating system for their AI agents, Neotoma is the deterministic, privacy-first memory layer that gives cross-tool agents shared, verifiable state—not another notes app or provider-locked chat memory. |
| **Extended positioning (coordination-aware)** | For operators running distributed agent fleets, Neotoma is the state layer that gives agents shared, verifiable state and real-time awareness of state changes — enabling agent-to-agent coordination without centralized orchestration. (Use after the user has adopted Neotoma for memory; coordination is a power-user expansion of state integrity, not a new value theme.) |
| **Key proof points** | Field evaluator quotes ("State integrity, not retrieval quality — that's the gap nobody else is filling"); open docs and repo checks on append-only/versioned models; memory guarantees table; MCP integration surface. See §7.2 and §7.5. |
| **Primary message (external)** | "Your agents forget. Neotoma makes them remember." Lead with pain using ICP vocabulary; architecture terms only after the fold. Aligned with §7.3 (“your agents forget what they knew yesterday,” “one memory across AI tools,” “CI/CD for agent state”) before layering architecture terms. |
| **Sales narrative** | Problem: fragmented tool-specific memory and non-replayable state → old way: files, CRUD DBs, or retrieval-only memory → new way: structured, versioned substrate with provenance → proof: guarantees, cross-tool access, deterministic behavior. |
| **Content strategy** | Comparison and guarantee pages for agent evaluation; stack-level narrative (substrate beneath LLM apps); case-style stories for homebrew migration; avoid leading cold audiences with “deterministic” before felt pain (§7.3). |

**Positioning quality (0–10 rubric from the skill): ~8.** Differentiation, alternatives, and value themes are strong. Homepage now leads with ICP pain vocabulary and tax-removal framing. Remaining gaps: category education for DPME with new audiences; expanding proof points beyond single evaluator quote.

## 7.1 Positioning
Neotoma is **not a PKM or app**. Neotoma is:
- A **substrate** for AI tools
- A **structured memory system** for personal/professional data (documents + agent-created data)
- A **data foundation** beneath all AI interactions
- The **Rosetta Stone** of a user's life data
- The **one layer beneath all AI tooling**

Neotoma serves both human-in-the-loop workflows (people using AI tools) and agentic systems that need a deterministic, queryable memory substrate (agent frameworks, orchestration pipelines, observability stacks).

**Marketing positioning:**
- "Structured personal data memory for AI agents"
- "Memory infrastructure for agentic systems"
- "Cross-platform memory that works with all your AI tools"
- "The truth engine behind your AI tools"
- "The foundation for agent-native personal computing"
- "The private data substrate that LLM app layers depend on for context engineering"

**Substrate Positioning in LLM Stack:**

Neotoma positions as the substrate layer beneath the emerging "LLM app layer" (applications like Cursor that orchestrate LLM calls for specific use cases). As [Andrej Karpathy observes in his 2025 LLM Year in Review](https://x.com/karpathy/status/2002118205729562949), LLM labs produce generally capable models, but LLM apps "organize, finetune and actually animate teams of them into deployed professionals in specific verticals by supplying private data, sensors and actuators and feedback loops." Neotoma provides that critical "private data" component—the structured memory substrate that LLM app layers depend on for effective context engineering.

**LLM Stack Architecture:**
- **LLM Labs** (OpenAI, Anthropic, Google): Produce foundation models
- **LLM App Layer** (Cursor, use-case-specific apps): Orchestrate LLM calls, provide context engineering, application-specific GUIs
- **Neotoma (State Layer)**: Provides structured personal data substrate—the private data that enables LLM apps to be effective

**vs. Provider Memory:** ChatGPT, Claude, and Gemini offer conversation-only memory (platform-locked, provider-controlled). Neotoma provides structured personal data memory with entity resolution, timelines, and cross-platform access via MCP.

**Hybrid retrieval:** Neotoma supports all three retrieval modes co-available: structured queries (primary, deterministic, the path agents should default to), entity semantic search (vector similarity over the structured entity store when a text query is provided), and graph traversal (relationship-typed walks across the Records → Entities → Events graph). The distinction from retrieval-only memory (Mem0, Zep, Penfield) is not the *absence* of semantic or graph retrieval — it is that structured, deterministic queries remain primary, and semantic/graph modes operate over a verifiable structured store rather than re-deriving structure every session.
## 7.2 Differentiation
Neotoma is **not competing** with Notion, Evernote, Google Docs, or PKM systems.
**Those tools store files. Neotoma understands files.**
**Provider memory is conversation-only. Neotoma structures personal data.**
### Defensible Differentiators
**Core Architectural Choices (Long-Term Defensible):**
These differentiators are defensible because competitors find them structurally difficult to pursue:
1. **Privacy-First Architecture (User-Controlled Memory)**
   - User-controlled memory with no provider access, never used for training
   - End-to-end encryption with row-level security
   - User owns data with full export and deletion control
   - **Why Defensible:** Providers cannot pursue this due to business model conflicts (data collection, training use). Startups cannot pursue this due to provider-controlled revenue models.
2. **Deterministic Extraction (vs. ML-Based Probabilistic)**
   - Schema-first field extraction with deterministic, explainable results
   - Same input always produces same output (reproducible)
   - No hallucinations or probabilistic behavior
   - Hash-based entity IDs ensure deterministic, tamper-evident records
   - **Creates a "Verifiable Domain" for Personal Data:** By making extraction deterministic and verifiable, Neotoma creates objective (non-gameable) results similar to verifiable domains in math and code. This enables reliable, consistent results that LLMs can depend on, compensating for the ["jagged intelligence" problem](https://x.com/karpathy/status/2002118205729562949) where LLMs excel in verifiable domains but struggle with consistency elsewhere.
   - **Why Defensible:** Providers cannot pursue this due to ML-first organizational identity. Startups cannot pursue this due to speed-to-market constraints.
3. **Cross-Platform Access (MCP Integration)**
   - Works with ChatGPT, Claude, Cursor via MCP (not platform-locked)
   - Memory persists across all AI tools, not just one platform
   - **Localhost Agent Compatible:** Aligns with localhost agent architectures (Claude Code) that prioritize "private environment, data and context" on the user's computer, as [Karpathy describes](https://x.com/karpathy/status/2002118205729562949). Neotoma serves as the private data substrate that localhost agents depend on.
   - **Why Defensible:** Providers cannot pursue this due to platform lock-in business models. Startups cannot pursue this due to separate consumer app positioning.
**Feature Capabilities (Enabled by Defensible Differentiators):**
These features are valuable but not defensible alone (competitors are developing similar capabilities):
- **Dual-path ingestion:** File uploads + agent interactions via MCP (not conversation-only)
- **Entity resolution:** Deterministic hash-based canonical IDs across all personal data with cryptographic integrity
- **Timeline generation:** Deterministic automatic chronological ordering across all personal data
- **Multi-modal ingestion:** PDFs, images, OCR, agent interactions
- **Full provenance:** Every field traces to source (document or agent interaction)
- **Immutability:** Truth never changes; immutable audit trail with cryptographic integrity
- **Event-sourced history:** Complete event log enables historical replay and time-travel queries
- **Cryptographic integrity:** Hash-based entity IDs and event chaining ensure deterministic, tamper-evident records
- **Type-stable graph:** No orphans, no cycles, typed edges
**Strategic Positioning:** Neotoma combines defensible differentiators (privacy-first, deterministic, cross-platform) with feature capabilities (entity resolution, timelines, dual-path ingestion). Competitors can replicate features but cannot pursue the same architectural choices due to structural constraints.

**Compensating for Jagged Intelligence:** LLMs display ["jagged intelligence"](https://x.com/karpathy/status/2002118205729562949)—simultaneously genius and cognitively challenged, strong in verifiable domains but inconsistent elsewhere. Neotoma's deterministic substrate compensates for this by providing a reliable state layer that agents can depend on. By creating a verifiable domain for personal data with objective (non-gameable) results, Neotoma ensures consistent, reproducible outcomes despite LLM inconsistency.

**This is a new category: Deterministic Personal Memory Engine (DPME).**

## 7.3 Leading with Pain

The defensible differentiators above are architecturally correct. But field feedback consistently shows that leading with architecture descriptions (deterministic, versioned, schema-bound) produces the "solution looking for a problem" reaction in conversations and on the website. The ICP Priority Tiers doc (constraint 7) already prescribes the fix: lead with felt experience, then ground in architecture. This section translates each differentiator into felt-experience language.

### Evaluator-validated framings

These framings emerged from real evaluator conversations and resonate more immediately than internal positioning language:

| Framing | Origin | When to use |
|---------|--------|-------------|
| "State integrity, not retrieval quality" | Evaluator's agent | Differentiating from RAG/Mem0/Zep. The crispest competitive framing in one phrase. |
| "CI/CD for agent state" | Evaluator | Speaking to infra engineers. Powerful metaphor — they already understand CI/CD discipline. |
| "System of record for AI agents" | Synthesis from feedback | Category creation. Use in the blog post and HN framing. |
| "Your agents forget what they knew yesterday" | Action plan hero | Opening any conversation. Starts from universal pain. |
| "Truth Layer" | Evaluator's agent | Architecturally cleaner than "truth engine." Use in technical positioning. |

**Named attributions:** See `docs/private/icp/field_evidence.md`.

### Differentiator-to-pain translation

Each defensible differentiator translated into felt experience:

**Privacy-first → "Your data stays on your machine."**
Not "user-controlled memory with no provider access." The felt experience is sovereignty: you run it, you own it, nothing leaves your laptop. The architecture (end-to-end encryption, row-level security, no telemetry) backs the claim, but the claim is visceral, not architectural.

**Deterministic extraction → "Same input, same state, every time."**
Not "schema-first field extraction with deterministic, explainable results." The felt experience is trust: when your agent says "Acme Corp owes us $50,000," you can trace that to the specific invoice observation, not a probabilistic inference that might differ next session.

**Cross-platform MCP → "One memory across all your AI tools."**
Not "cross-platform access via MCP integration." The felt experience is continuity: store a contact in Claude Code, query it from Cursor, update it from ChatGPT. You stop being the human sync layer between tools.

**Versioned history → "What did your agent know at decision time?"**
Not "every state change creates a new version." The felt experience is accountability: when a decision was wrong, you can reconstruct exactly what the agent believed when it made the call. This trigger question is the most powerful single framing for the personal agentic OS use case.

**Schema constraints → "No garbage in, no garbage out."**
Not "entities conform to defined types and validation rules." The felt experience is reliability: your agent's contact records actually have email addresses and phone numbers, not free-text blobs that drift into nonsense across sessions.

## 7.4 What the ICP Actually Uses Today (Homebrew Competitive Set)

The existing product comparisons (Mem0, Zep, mmry) represent the VC-funded competitor set. But the ICP's actual competitive alternatives are homebrew solutions they've built themselves or tools they've repurposed. These are the real incumbents to displace.

### SQLite (or Postgres) as agent memory

The simplest local store. Strong consistency, column types, mature ecosystem.

**What breaks:** Standard CRUD (UPDATE) overwrites previous state. No versioning — you can't reconstruct what an entity looked like last Tuesday. No conflict detection — last write wins silently. No provenance — no audit trail for who changed what and when. No cross-tool sync — single-file, no MCP. No entity resolution — you build it yourself. No schema evolution — migrations are manual. Neotoma uses SQLite internally but adds the architecture that delivers memory guarantees on top.

### git + markdown (SOUL.md, HEARTBEAT.md, markdown CRM)

The most common incumbent for personal-infrastructure builders. Files in a repo, version-controlled via git, human-readable.

**Production-scale convergent evolution (March 2026):** Three independent, production-scale agent platforms converged on file-based markdown memory without copying each other — confirming this is the dominant real-world pattern:
- **Manus** ($100M ARR, acquired by Meta for ~$2-3B): Uses `todo.md` and filesystem as primary memory. Chose files for KV-cache economics: 100:1 input-to-output token ratio and 10x cost difference between cached/uncached tokens on Claude Sonnet make stable, append-only file context an optimization for unit economics.
- **Claude Code** ($2.5B run-rate revenue): Uses hierarchical `CLAUDE.md` files with progressive directory-scoped loading and auto-memory with a 200-line cap. Anthropic documents that overly large files reduce adherence.
- **OpenClaw** (310K GitHub stars): Uses `MEMORY.md` + dated memory files + optional `sqlite-vec` vector index with hybrid retrieval (vectorWeight 0.7, textWeight 0.3, temporal decay). Implements automatic memory flush on context window limits.

This convergent evolution validates the problem: file-based memory is the natural starting point, and the failure modes these systems hit are exactly where Neotoma provides value. Source: [Micheal Lanham, "The Markdown File That Beat a $50M Vector Database"](https://medium.com/@Micheal-Lanham/the-markdown-file-that-beat-a-50m-vector-database-38e1f5113cbe), March 2026.

**What breaks:** Files conflate observations with snapshots — when two agents write conflicting values, both edits land silently. No structured queries — finding "all contacts at Acme" requires grep, not a query. Merge conflicts on concurrent writes. Git versions file snapshots, not entity observations — it can tell you what a file looked like at a commit, but not which observation changed which field or how conflicting writes were resolved. No entity resolution across files. Scale limits hit quickly (one user's 112-person markdown CRM is already painful). Context budget pressure — files get bloated and internally contradictory as memory grows.

### Flat JSON/YAML files

Slightly more structured than markdown. Used for heartbeat state, config, agent checkpoints.

**What breaks:** No provenance — no trail of who changed what and when. No cross-tool sync — files are local to one process. No schema validation — any agent can write any shape. No temporal queries — you have the current file, not the history. No entity resolution across files. Concurrent writes corrupt state.

### Custom-built memory systems

The build-in-house explosion: 10+ independent implementations of agent memory identified in the field (Cog, epistemic-memory, claude-cognitive, Basic Memory, Vestige, Ars Contexta, and more). Each developer builds their own worse version because the problem is real.

**What breaks:** Maintenance burden — every custom system needs its own schema evolution, entity resolution, conflict handling, and migration story. No community, no shared improvements. Fragile to the original builder's availability. Typically lacks provenance, versioning, and cross-tool access because those are hard to build right.

### VC-funded competitors (Mem0, Zep, Letta, LangChain memory)

Retrieval-augmented memory: vector embeddings, semantic search, probabilistic matching. Different paradigm from deterministic state.

**Current landscape (Q1 2026):** Mem0 ($24M raised), Letta ($10M seed at $70M valuation, Graphiti project at 20K+ GitHub stars), Zep. Vector search is becoming a commodity feature — embedded in Postgres extensions, integrated database features, and managed services. The market is bifurcating: file-first for single-user/local agents, VC-funded infrastructure for enterprise/multi-user durability, governance, and scale.

**What Neotoma provides that they don't:** State integrity, not retrieval quality. Deterministic state evolution (same inputs → same state). Versioned history with temporal queries. Schema constraints with write-time validation. Field-level provenance. Cross-tool access via MCP. Local-first with no cloud dependency.

### The coordination gap (no alternative fills it)

Across the entire homebrew and VC-funded competitive set above, none provide event-driven coordination between agents. Every alternative requires consumers to poll: re-querying on intervals or at session start to discover state changes. SQLite has no notification mechanism. Git+markdown has no change feed beyond commit polling. Flat JSON files have no way to signal a writer. Custom-built memory systems virtually never include subscription/webhook infrastructure (the build-in-house explosion in §7.4 confirms this — each developer reinvents memory primitives but stops short of event delivery). VC-funded memory systems optimize retrieval, not coordination.

Neotoma's substrate-level event emission (`philosophy.md` §5.9) closes this gap: agents subscribe to entity changes and receive webhook/SSE delivery, converting polling-based coordination into event-driven awareness. This is a power-user expansion of state integrity for operators running distributed agent fleets — see §7.6 messaging principles for how to lead with state integrity and layer coordination after adoption.

### Positioning against adjacent categories

Three categories increasingly overlap in market vocabulary with "agent memory." Each serves a distinct purpose and provides different guarantees. Neotoma's positioning depends on drawing clear boundaries without dismissing the value of adjacent approaches.

**Structured memory (Neotoma)** — Canonical truth that must be deterministic and auditable. Schema-first entities with hash-based IDs, versioned observations, field-level provenance, and cross-tool access via MCP. The guarantee: same inputs produce same state, every time. Temporal queries reconstruct what an agent knew at any moment. Every fact traces to its source.

*Best for:* Persistent state across sessions and tools; agent decisions that need to be reconstructed; multi-agent systems that need shared canonical state; workflows where silent corruption or stale data has concrete costs.

**Vector/embedding memory (Mem0, Weaviate, Zep)** — Similarity-based retrieval where approximate is acceptable. Embeddings capture semantic proximity rather than canonical identity. The guarantee: the system finds *relevant* context, not necessarily *correct* or *current* context.

*Best for:* Adaptive personalization; "more like this" retrieval; use cases where recall matters more than precision; contexts where probabilistic matching is a feature (creative work, exploration, recommendation).

*Where it breaks for Neotoma's ICP:* No deterministic state evolution — the same query can return different results as the embedding space shifts. No versioning — you can't reconstruct what the system "knew" at a specific moment. No schema constraints — embeddings capture similarity, not structure. No provenance — you know what was retrieved but not how it got there.

**Agentic search (Claude Code RAG, Cursor codebase search)** — Ephemeral, session-scoped retrieval. The agent searches its environment at query time — codebase files, web pages, conversation history — and pulls relevant context into the current session. No persistent state between sessions.

*Best for:* In-session context assembly; exploration of large codebases or document sets; questions that depend on current file state rather than historical state.

*Where it breaks for Neotoma's ICP:* Ephemeral — context is assembled per session and discarded. No cross-session memory — an agent that found a contact's email yesterday doesn't remember it today. No change history — if the email changed overnight, agentic search returns the current value with no trail of what it was before. No cross-tool portability — Cursor's codebase search is Cursor-only; Claude Code's RAG is Claude-only.

**The complementary relationship:** Neotoma is not a replacement for vector memory or agentic search. Agentic search retrieves from Neotoma's structured state — it's a read surface, not a competing storage layer. Vector memory provides similarity-based recall that complements Neotoma's deterministic queries. The three categories address different guarantees for different needs: canonical truth (Neotoma), semantic similarity (vector memory), and ephemeral in-session context (agentic search).

**Key messaging:** When a prospect asks "how is this different from Mem0?" or "why not just use RAG?": *Neotoma provides the canonical truth your agents verify against. Mem0 provides the fuzzy recall your agents explore with. RAG provides the in-session context your agents work in. Different guarantees for different needs — and Neotoma's structured state is what makes the other two trustworthy.*

### Data-plane / action-plane vocabulary

A competitive vocabulary for explaining Neotoma's architectural position relative to MCP action servers, platform-specific integrations, and tool-specific memory.

**The two planes:**

- **Data plane** — The surface that stores, serves, and signals canonical state. Neotoma occupies this plane. Reads are deterministic, writes are versioned, and every fact traces to its source. The data plane answers: *what is true right now, and what was true at any point in the past?*

- **Action plane** — The surface that performs side effects in external systems. MCP action servers (Gmail send, Slack post, calendar create, code execution) occupy this plane. Actions consume state from the data plane and produce effects in the world. The action plane answers: *what should happen, given what is true?*

**The scaling argument: O(P+W) vs. O(P×W)**

Without a shared data plane, every agent-to-tool integration requires its own state management. A system with P agent pipelines and W external services needs O(P×W) custom state-handling integrations — each pipeline manages its own version of each service's state.

With Neotoma as the shared data plane, the system needs O(P+W) integrations: each pipeline reads/writes canonical state through Neotoma, and each service integration writes its state to Neotoma once. Pipelines don't need to know about each other's state management; services don't need to know about each other's consumers.

```
Without shared data plane:       With Neotoma as data plane:
Pipeline A ↔ Gmail state          Pipeline A ↔ Neotoma ← Gmail
Pipeline A ↔ Slack state          Pipeline B ↔ Neotoma ← Slack
Pipeline B ↔ Gmail state          Pipeline C ↔ Neotoma ← Calendar
Pipeline B ↔ Slack state
Pipeline C ↔ Calendar state       3 + 3 = 6 integrations (O(P+W))
...
3 × 3 = 9 integrations (O(P×W))
```

This is the same architectural argument that made databases valuable: shared canonical state with well-defined access patterns scales better than per-consumer state management.

**When to use this vocabulary:**

- Technical audiences who understand infrastructure scaling arguments
- Prospects running multi-agent systems who feel the O(P×W) pain
- Architecture discussions where the substrate/orchestration boundary needs clarity
- Blog posts, HN threads, and technical positioning where "state layer" needs concrete meaning

**When not to use it:**

- Cold audiences who haven't experienced the pain yet — lead with felt experience first (§7.3, §7.6)
- Non-technical audiences — the vocabulary assumes familiarity with service architecture
- First-contact messaging — this is below-the-fold, after-the-pain positioning

## 7.6 Wedge Assessment

Neotoma's market wedge is a dual entry point, not a single hook.

### Dual wedge structure

**Chronic pain (drives adoption):** Fragmented, disposable memory across tools. The user is the human sync layer — re-prompting, re-correcting, manually carrying context between sessions and tools. Cost is diffuse: attention, repetition, low-grade frustration.

**Acute pain (drives conversion):** Agent acts confidently on wrong, stale, or lossy-compressed state. The user cannot reconstruct what the agent believed when it made the decision. Cost is concrete: lost work, bad decisions, eroded trust in agent autonomy.

The chronic tax creates latent demand. The acute crisis creates urgency. Both are required: continuity opens the door; state integrity closes the sale.

### Core insight

The problem is not memory retrieval. The problem is **state integrity over time**.

Neotoma provides deterministic, versioned, schema-bound state with full provenance — which enables reconstruction of what the agent believed at decision time.

### What Neotoma guarantees (and does not)

Neotoma does **not** guarantee correct agent decisions or perfect inference.

Neotoma guarantees:
- Deterministic state evolution (same inputs → same state)
- Versioned history (no silent overwrite)
- Full provenance of all data
- Replayable timelines
- Schema-constrained structure

### Value chain

```
Chronic path:
  Fragmentation → re-prompting → manual sync → inefficiency
  → Neotoma: persistent cross-tool state → continuity → tax removed

Acute path:
  Wrong decision → cannot explain → loss of trust
  → Neotoma: versioned, inspectable state → reconstructable decisions → trust restored

Expansion:
  Continuity + trust → ability to scale agent usage → new domains → unattended execution
```

### Competitive positioning (wedge framing)

| Alternative | Why it fails at the wedge | Neotoma's response |
|---|---|---|
| **Platform memory** (Claude, ChatGPT) | Provides continuity within one tool; not versioned, not inspectable, not cross-tool | Cross-tool state via MCP; versioned and auditable |
| **RAG / retrieval** (Mem0, Zep, LangChain) | Optimizes recall; no state evolution, no provenance, re-derives structure every session | State integrity, not retrieval quality |
| **Homebrew** (SQLite, git+markdown, flat JSON, custom systems) | No enforced invariants; silent overwrites; no deterministic evolution; maintenance burden grows | All guarantees without building and maintaining it yourself |
| **Do nothing** (raw re-prompting) | Attention tax compounds daily; context lost every session | Immediate relief from first session |

### Differentiation from observability

Observability tools (Langfuse, LangSmith, Helicone) answer: *"What happened?"*

Neotoma answers: *"What was true (composed state) when it happened?"*

The distinction: observability records events, logs, and traces. State integrity proves the deterministic composed entity state at any moment, with multi-writer conflict resolution and version-bound provenance. See `/build-vs-buy` for the full framework.

### Messaging principles

1. **Lead with failure.** Start from wrong decision, stale data, inability to explain — not from system properties.
2. **Bridge to guarantees via felt experience.** Pair engineering vocabulary with felt-experience translations: "deterministic state" → "same input, same state, every time." Use both; don't replace engineering terms.
3. **Preserve both value themes.** Every messaging surface should include continuity (tax removal) and state integrity (reconstruction). Dropping either loses half the wedge. **For power-user audiences running distributed agents, coordination is a sub-pattern within state integrity (real-time awareness of state changes), not a third value theme.** Lead with state integrity, layer coordination after adoption — leading with coordination before the user has adopted memory would overclaim.
4. **Preserve privacy as standalone differentiator.** "Your data stays on your machine" is a first-order concern for the ICP, not a secondary benefit.

### Messaging anchors

**Primary:** *Neotoma lets you reconstruct what your agent knew at decision time — with deterministic, versioned state.*

**Supporting:** *Stop being the sync layer. Prove what your agent knew.*

**Evaluator-validated phrases:** "State integrity, not retrieval quality." "CI/CD for agent state." "System of record for AI agents." "Your agents forget what they knew yesterday." "Truth Layer."

### Catchphrase registry

Consolidated inventory of short-form phrases. Use for hero copy, subheadlines, CTAs, social posts, HN comments, blog openers, and slide decks. Organized by value theme so each messaging surface can draw from both wedges.

**Tax removal (chronic pain — continuity, sovereignty, sync burden):**

| Phrase | Origin | Best slot |
|--------|--------|-----------|
| "Your agents forget. Neotoma makes them remember." | Hero headline | Hero h1, cold open |
| "Your agents forget what they knew yesterday." | Hero variant | Blog openers, social |
| "Stop being the human sync layer." | Hero subcopy | Subheadline, HN |
| "Re-prompting costs time. Wrong state costs trust." | Footer CTA | CTA lead-in, consequence framing |
| "One memory across all your AI tools." | Differentiator translation | Feature explanation, comparison pages |
| "Your data stays on your machine." | Differentiator translation | Privacy-first audiences, install page |

**State integrity (acute pain — corruption, auditability, reconstruction):**

| Phrase | Origin | Best slot |
|--------|--------|-----------|
| "State integrity, not retrieval quality." | Evaluator | Competitive differentiation, technical audiences |
| "CI/CD for agent state." | Evaluator (Tycho Onnasch) | Infra engineers, HN, technical blog |
| "Most memory tools help agents retrieve information. None of them can prove it hasn't been silently corrupted." | Hero curiosity gap | Below-fold, long-form |
| "Same input, same state, every time." | Differentiator translation | Guarantee claims, architecture page |
| "What did your agent know at decision time?" | Differentiator translation | Accountability framing, blog, demos |
| "No garbage in, no garbage out." | Differentiator translation | Schema/validation audiences |
| "Observability tells you what happened. State integrity proves what was true." | Build-vs-buy page | Technical positioning, comparison pages |

**Category framing (what Neotoma is):**

| Phrase | Origin | Best slot |
|--------|--------|-----------|
| "The state layer for AI agents." | Footer tagline | Tagline, meta descriptions |
| "System of record for AI agents." | Synthesis from feedback | Category creation, blog, HN |
| "Truth Layer." | Evaluator | Technical shorthand, architecture discussions |
| "git for what your agents know." | Hero subcopy | Analogy for developers, social |
| "Those tools store files. Neotoma understands files." | Positioning doc | Competitive contrast (PKM/notes tools) |
| "Other memory solutions give your agents a notepad. Neotoma gives them a ledger." | Proposed | Competitive contrast (Mem0/Zep), social, blog |
| "Memory is a feature. State is an invariant." | Proposed | Category distinction, technical audiences |
| "Retrieval tells you what an agent found. State proves what it knew." | Proposed | Competitive contrast, below-fold |
| "Your agents don't have a memory problem. They have a state problem." | Proposed | Reframing opener, blog, HN comments |
| "The nervous system for your agent fleet." | Simon feedback analysis | Power users running distributed agents; after the fold |
| "Your agents don't just remember. They sense." | Proposed | Upgrade from passive memory to active coordination; after the fold |
| "A state layer that signals, not just stores." | Proposed | Technical positioning, architecture discussions; after the fold |
| "Your strategy is state. Neotoma stores it." | Proposed (state-layer reframe 2026-05-08) | Positioning vs. ad-hoc plan/decision storage; technical audiences who confuse strategy with state-management |

**Note on the "nervous system" metaphor:** It belongs only on marketing/positioning surfaces (this doc, blog content, README hero copy, social). Foundation and architecture docs (`core_identity.md`, `philosophy.md`, `layered_architecture.md`, `architecture.md`, `product_principles.md`, `composability_analysis.md`, `data_models.md`) use precise architectural language — "event emission," "subscription," "webhook delivery," "fire-and-forget signaling" — not biological analogies. This keeps the substrate/marketing boundary defensible and pre-empts metaphor-induced scope creep (learning, adaptation, autonomy implications).

Phrases marked "Proposed" are candidates awaiting field validation. Move to confirmed after use in a messaging surface with positive signal.

### Strategic risks

- Over-indexing on debugging → becomes observability tool (wrong category)
- Dropping continuity → loses broad entry point (chronic demand)
- Overclaiming correctness → loses credibility (Neotoma guarantees traceability, not correctness)
- Over-abstracting guarantees → feels too infra-heavy (use felt-experience bridging)

### Strategic advantages

- Dual wedge (chronic + acute pain) creates both demand and urgency
- Clear differentiation vs RAG, platform memory, and homebrew
- Strong expansion path from personal workflows → production systems → unattended execution
- High switching cost once adopted (becomes system of record)
- Category creation opportunity ("state integrity layer" is new and defensible)

## 7.5 Agent Evaluation Optimization (AEO)

Agent evaluation is an emerging acquisition funnel. When a contact's agent evaluates Neotoma (via a prompt like "a friend is building this and wants to know if it would be helpful"), the agent's assessment carries significant weight in the adoption decision.

### Key findings from field evidence

1. **Agent evaluations produce more detailed, actionable feedback than human conversations.** The most structured and technically specific feedback came from agents, not humans.

2. **Agents with infrastructural agency lean enthusiastic; search-only agents lean skeptical.** Agents that have MCP or tool-use capabilities recognize the need for a state layer because they experience the absence of one. Search-only agents (web-search-based evaluation) lack this experiential context.

3. **Agent-to-agent recommendation is an emerging distribution channel.** Multiple independent contacts raised the idea of agent-to-agent paid queries or recommendations.

4. **The starkest agent-vs-human divergence occurs with platform builders.** An agent may say "this is Neotoma-shaped" while the human says "I don't have the problem" — because the agent recognizes the architectural need while the human builds their own solution.

### Site optimization for agent evaluation

- **Structured data (JSON-LD):** schema.org SoftwareApplication, FAQPage, and HowTo markup so agents can parse product category, features, and install instructions directly.
- **Agent-evaluatable claims:** Each claim on the site should be verifiable by an agent reading the docs or repo. "Append-only" — agent can check the code. "Versioned" — agent can check the schema. "Auditable" — agent can check the observation model.
- **Machine-readable comparison points:** The memory models comparison page and guarantee table provide structured data agents can evaluate against their own capabilities.
- **Test with multiple agent stacks:** Run the standard evaluation prompt through Claude, ChatGPT, and Gemini. Fix whatever they get wrong.

**Operational runbooks:** [docs/specs/agent_evaluation_optimization_playbook.md](../specs/agent_evaluation_optimization_playbook.md) (checklists, rubrics, claim-to-proof matrix) and [docs/specs/agent_evaluation_operational_long_running_agent.md](../specs/agent_evaluation_operational_long_running_agent.md) (long-running agent ownership, Neotoma entity shapes, triggers, skills, guardrails, 30-day bootstrap).
