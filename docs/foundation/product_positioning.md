# Neotoma Product Positioning and Differentiation

_(How Neotoma Fits in the Market)_

---

## Purpose

This document defines Neotoma's product positioning and unique differentiators in the market.

---

## 7.1 Positioning

Neotoma is **not a PKM or app**. Neotoma is:

- A **substrate** for AI tools
- A **structured memory system** for personal/professional data (documents + agent-created data)
- A **data foundation** beneath all AI interactions
- The **Rosetta Stone** of a user's life data
- The **one layer beneath all AI tooling**

**Marketing positioning:**

- "Structured personal data memory for AI agents"
- "Cross-platform memory that works with all your AI tools"
- "The truth engine behind your AI tools"
- "The foundation for agent-native personal computing"

**vs. Provider Memory:** ChatGPT, Claude, and Gemini offer conversation-only memory (platform-locked, provider-controlled). Neotoma provides structured personal data memory with entity resolution, timelines, and cross-platform access via MCP.

---

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
   - **Why Defensible:** Providers cannot pursue this due to ML-first organizational identity. Startups cannot pursue this due to speed-to-market constraints.

3. **Cross-Platform Access (MCP Integration)**
   - Works with ChatGPT, Claude, Cursor via MCP (not platform-locked)
   - Memory persists across all AI tools, not just one platform
   - **Why Defensible:** Providers cannot pursue this due to platform lock-in business models. Startups cannot pursue this due to separate consumer app positioning.

**Feature Capabilities (Enabled by Defensible Differentiators):**

These features are valuable but not defensible alone (competitors are developing similar capabilities):

- **Dual-path ingestion:** File uploads + agent interactions via MCP (not conversation-only)
- **Entity resolution:** Deterministic hash-based canonical IDs across all personal data
- **Timeline generation:** Deterministic automatic chronological ordering across all personal data
- **Multi-modal ingestion:** PDFs, images, OCR, agent interactions
- **Full provenance:** Every field traces to source (document or agent interaction)
- **Immutability:** Truth never changes
- **Type-stable graph:** No orphans, no cycles, typed edges

**Strategic Positioning:** Neotoma combines defensible differentiators (privacy-first, deterministic, cross-platform) with feature capabilities (entity resolution, timelines, dual-path ingestion). Competitors can replicate features but cannot pursue the same architectural choices due to structural constraints.

**This is a new category: Deterministic Personal Memory Engine (DPME).**

---

## Related Documents

- [`docs/context/index.md`](../context/index.md) — Documentation navigation guide
- [`docs/foundation/problem_statement.md`](./problem_statement.md) — Why Neotoma exists
- [`docs/specs/ICP_PRIORITY_TIERS.md`](../specs/ICP_PRIORITY_TIERS.md) — Target users
