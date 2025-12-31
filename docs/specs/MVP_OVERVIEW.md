# Neotoma MVP Overview
**Note:** This is a **high-level executive summary** for stakeholders. For implementation details, see:
- [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) — Foundational principles and architectural invariants
- [`docs/architecture/architecture.md`](../architecture/architecture.md) — Complete system architecture
- [`docs/specs/MVP_EXECUTION_PLAN.md`](./MVP_EXECUTION_PLAN.md) — Detailed implementation plan
- [`docs/specs/MVP_FEATURE_UNITS.md`](./MVP_FEATURE_UNITS.md) — Complete Feature Unit inventory
- [`docs/specs/FUNCTIONAL_REQUIREMENTS.md`](./FUNCTIONAL_REQUIREMENTS.md) — Functional requirements
- [`docs/subsystems/`](../subsystems/) — Detailed subsystem documentation
**In case of conflict, detailed subsystem docs are authoritative.**
## 1. What is Neotoma?
Neotoma is a **Truth Layer** — a deterministic, structured memory substrate that transforms fragmented personal data into AI-ready knowledge via dual-path ingestion.
**In One Sentence:**
Neotoma ingests personal data (PDFs, images, agent interactions), extracts structured fields, identifies entities, builds timelines, and exposes everything to AI via MCP.
**vs. Provider Memory:**
ChatGPT, Claude, and Gemini offer conversation-only memory (platform-locked, provider-controlled). Neotoma provides structured personal data memory with entity resolution, timelines, and cross-platform access—enabling agents to reason across all your data, not just recent conversations.
**Not:**
- A productivity app
- A note-taking system
- An AI agent
- A workflow engine
**Is:**
- The structured personal data memory substrate beneath AI tools
- The foundation for Strategy Layer (e.g., Agentic Portfolio) and Execution Layer (e.g., Agentic Wallet)
- A deterministic personal and team memory engine with dual-path ingestion (supports individuals and small teams 2–20 people)
## 2. Layered Architecture
Neotoma is designed as a **Truth Layer** that can support multiple upper layers. One important example is a financial system:
```
┌───────────────────────────────────────────────┐
│      Execution Layer                          │
│  (Agentic Wallet + Domain Agents)            │
│  Commands → Side Effects → Domain Events    │
└────────────▲─────────────────────────────────┘
             │ Reads Only, Receives Commands
┌────────────▼─────────────────────────────────┐
│      Strategy Layer                           │
│  (Agentic Portfolio is example instance)    │
│  State → Evaluates → Decisions + Commands   │
└────────────▲─────────────────────────────────┘
             │ Reads Only
┌────────────▼─────────────────────────────────┐
│    Neotoma (Truth Layer)                     │
│  Event-sourced, Reducer-driven              │
│  Domain Events → Reducers → State           │
└─────────────────────────────────────────────┘
```
Neotoma is the **bottom layer** — event-sourced, reducer-driven truth, no strategy, no execution.
**Note:** Agentic Portfolio is an example instance of the Strategy Layer. Agentic Wallet is part of the Execution Layer alongside domain agents. Many other agent-driven layers are possible. Neotoma is a general-purpose Truth Layer substrate, not limited to financial use cases.
## 3. Core Capabilities (MVP)
### 3.1 Ingestion
- Upload PDFs, JPG, PNG (max 50MB) — single and bulk
- Bulk upload with folder import
- Upload progress tracking and resume on failure
- OCR for images (Tesseract.js)
- Gmail attachment import (user-triggered)
### 3.2 Extraction
- Schema detection (invoice, receipt, contract, document, note, message, travel_document, identity_document, etc.)
- Deterministic field extraction (regex-based from documents, direct property assignment from agent interactions; no LLM)
- Entity resolution (canonical IDs for companies, people, locations across all personal data)
- Event generation (timeline from date fields across all personal data)
- **Tier 1 ICP-aligned:** Schema types support AI-Native Operators (research, contracts, travel), Knowledge Workers (legal docs, research papers, client communications), and Founders (company docs, product docs, investor materials)
### 3.3 Memory Graph
- Records → Entities → Events
- Typed edges with provenance
- No orphans, no cycles
- Transactional inserts
### 3.4 Search
- Structured filters (type, date range, properties)
- Full-text search (bounded eventual, max 5s delay)
- Deterministic ranking
### 3.5 AI Access (MCP)
- 8 MCP actions (store, retrieve, upload, delete, providers)
- Structured JSON responses
- Error codes and retry guidance
## 4. What's In MVP vs Future
### MVP (v1.0)
✅ File upload (PDF, JPG, PNG) — single and bulk
✅ **Rule-based extraction only** (regex, parsing; deterministic per manifest)
✅ Entity resolution (hash-based IDs)
✅ Timeline events
✅ Structured search (no semantic search in MVP)
✅ MCP actions (8 MVP actions)
✅ Basic UI (list, detail, timeline)
✅ External providers (Gmail only)
✅ Multi-user authentication and workspaces
✅ Row-level security (data isolation)
✅ Billing and subscription management (Stripe integration)
✅ Local storage / offline mode
**Critical MVP Constraint:** Extraction uses **only** rule-based methods (regex patterns, deterministic parsing). No LLM extraction per `docs/NEOTOMA_MANIFEST.md` determinism requirements. Same file uploaded 100 times → 100 identical extractions.
### Post-MVP
⏳ LLM-assisted extraction (with deterministic fallback for ambiguous cases)
⏳ Semantic search (hybrid structured + embeddings)
⏳ Real-time collaboration
⏳ Advanced analytics
⏳ Mobile app
⏳ Plaid integration (bank transaction sync — Tier 3+ use case)
⏳ X (Twitter) and Instagram integrations (media/photo import)
## 5. Key Differentiators
**Defensible Architectural Choices (Long-Term Competitive Moats):**
These differentiators are defensible because competitors find them structurally difficult to pursue:
1. **Privacy-First Architecture (User-Controlled Memory)**
   - User-controlled memory with no provider access, never used for training
   - **Why Defensible:** Providers cannot pursue due to data collection/training business models. Startups cannot pursue due to provider-controlled revenue models.
2. **Deterministic Extraction (vs. ML-Based Probabilistic)**
   - Same input → same output, always (reproducible, explainable)
   - **Why Defensible:** Providers cannot pursue due to ML-first organizational identity. Startups cannot pursue due to speed-to-market constraints.
3. **Cross-Platform Access (MCP Integration)**
   - Works with ChatGPT, Claude, Cursor via MCP (not platform-locked)
   - **Why Defensible:** Providers cannot pursue due to platform lock-in business models. Startups cannot pursue due to separate consumer app positioning.
**Feature Capabilities (Enabled by Defensible Differentiators):**
These features are valuable but not defensible alone (competitors are developing similar capabilities):
4. **Dual-path ingestion:** File uploads + agent interactions via MCP (not conversation-only)
5. **Entity resolution:** Deterministic hash-based canonical IDs across all personal data
6. **Timeline generation:** Deterministic automatic chronological ordering across all personal data
7. **Structured personal data:** Schema-first extraction from documents AND agent-created data
8. **Immutable:** Truth never changes
9. **Provenance:** Full audit trail for all data
**vs Notion/Evernote:** They store files. Neotoma understands files.
**vs Provider Memory:** They offer conversation-only memory (platform-locked, provider-controlled, ML-based probabilistic). Neotoma provides structured personal data memory (cross-platform, privacy-first user-controlled, deterministic) with entity resolution and timelines.
**Strategic Positioning:** Neotoma combines defensible architectural choices (privacy-first, deterministic, cross-platform) with feature capabilities (entity resolution, timelines, dual-path ingestion). Competitors can replicate features but cannot pursue the same architectural choices due to structural constraints. See [`docs/private/competitive/defensible_differentiation_framework.md`](../../private/competitive/defensible_differentiation_framework.md) for detailed analysis.
## 6. Target Users
Neotoma's target users are organized into priority tiers. See [`docs/specs/ICP_PRIORITY_TIERS.md`](./ICP_PRIORITY_TIERS.md) for the complete tiered ICP strategy.
**MVP Target Users (Tier 1):**
- **AI-native individual operators** (heavy ChatGPT/Claude users) — single-user, immediate activation
- **High-context knowledge workers** (researchers, analysts, consultants, lawyers) — single-user, high document load
- **AI-native founders & small teams (2–20 people)** — multi-user support required; individual adoption → team expansion
**Pain Point:** Documents scattered across email, downloads, screenshots, cloud drives.
**Neotoma Solution:** Unified, structured, AI-queryable memory with team support for small teams.
**Multi-User Support:** MVP includes authentication and row-level security (RLS) to support Tier 1 small teams. Founders initially adopt individually, then expand to team usage organically. This enables bottom-up B2B expansion.
**Future Expansion:** Tier 2 (B2B teams), Tier 3 (B2C power users), Tier 4 (Agentic Portfolio users), Tier 5 (Agentic Wallet users), Tier 6 (Enterprise deployments). See [`docs/specs/ICP_PRIORITY_TIERS.md`](./ICP_PRIORITY_TIERS.md) for details.
## 7. Success Criteria
### Product
- 60% first-upload activation rate
- 40% day-1 retention
- 50% onboarding completion rate
### Technical
- 95% upload success rate
- <5s P95 upload latency
- 0 orphan nodes in graph
- 100% critical path test coverage
### Business
- 10 DAU (MVP launch)
- 100 total records ingested (first week)
- Revenue alignment: Mid-market ACVs (€3k–€15k/yr or €250–€1,250 MRR) targeting Tier 1 ICPs
See [`docs/specs/METRICS_REQUIREMENTS.md`](./METRICS_REQUIREMENTS.md) for full metrics and [`docs/private/strategy_governance/revenue_timeline.md`](../private/strategy_governance/revenue_timeline.md) for revenue objectives.
## 8. MVP Scope Boundaries
### What Neotoma DOES
- Ingest user-provided files (explicit upload)
- Extract fields via deterministic rules
- Resolve entities via normalization + hashing
- Generate timeline from date fields
- Build memory graph (records + entities + events)
- Expose via MCP for AI access
- Support multi-user teams (2–20 people) with authentication and data isolation
- Collect revenue via billing and subscription management (€3k–€15k/yr ACVs)
### What Neotoma DOES NOT (MVP)
- ❌ LLM-based extraction (rule-based only)
- ❌ Semantic search (structured only)
- ❌ Automatic ingestion (explicit user control)
- ❌ Strategy or planning (that's Strategy Layer, e.g., Agentic Portfolio)
- ❌ Execution or transactions (that's Wallet)
- ❌ Real-time collaboration (async multi-user only)
- ❌ Enterprise features (advanced permissions, org-wide governance) — Tier 6, post-MVP
**Revenue Alignment:** MVP scope enables Tier 1 ICPs (individuals + small teams) to support mid-market ACVs (€3k–€15k/yr). Enterprise features (Tier 6) require post-MVP organizational memory architecture.
## Detailed Documentation References
**For stakeholders:** This document (executive summary)
**For implementers, see:**
- [`docs/NEOTOMA_MANIFEST.md`](../NEOTOMA_MANIFEST.md) — Foundational principles
- [`docs/architecture/architecture.md`](../architecture/architecture.md) — System architecture
- [`docs/specs/FUNCTIONAL_REQUIREMENTS.md`](./FUNCTIONAL_REQUIREMENTS.md) — Functional requirements
- [`docs/specs/NONFUNCTIONAL_REQUIREMENTS.md`](./NONFUNCTIONAL_REQUIREMENTS.md) — Non-functional requirements
- [`docs/specs/MCP_SPEC.md`](./MCP_SPEC.md) — MCP action specifications
## Agent Instructions
### When to Load This Document
Load for high-level planning, stakeholder communication, or understanding MVP scope.
For implementation, load detailed modular docs from foundation rules in `.cursor/rules/`.
### This is a synthesis document
For implementation details, always defer to:
- `docs/NEOTOMA_MANIFEST.md` (foundational truth)
- Detailed subsystem docs (architecture/, subsystems/, etc.)
