# Why Neotoma Exists: The Problem

_(The Problem Neotoma Solves)_

---

## Purpose

This document explains the fundamental problems Neotoma addresses in the AI-native personal computing landscape.

---

## 6.1 Personal Data is Fragmented

Users store critical personal data across:

- Email attachments (Gmail, Outlook)
- Downloads folders (PDFs, images)
- WhatsApp/iMessage screenshots
- Cloud drives (Dropbox, Google Drive)
- Desktop files, phone photos
- App exports (bank statements, receipts)
- Scanner outputs
- AI conversations (ChatGPT, Claude, Cursor)

**No system unifies this into durable, structured memory with entity resolution and timelines.**

Provider memory (ChatGPT Memory, Claude Memory, Gemini Personal Context) offers conversation-only memory—it can't structure documents, resolve entities, or build timelines across all personal data.

---

## 6.2 AI Has Limited Structured Memory

LLMs have conversation-only memory (ChatGPT Memory, Claude Memory, Gemini Personal Context) but cannot reason across structured personal data:

- Structured extraction (can't extract fields from documents)
- Entity resolution (doesn't know "Acme Corp" = "ACME CORP" across documents and agent-created data)
- Timeline generation (can't build chronological sequences across all personal data)
- Cross-data relationships (can't link entities across documents and conversations)
- Cross-platform memory (locked to specific provider or OS)

**Provider memory is conversation-only. Neotoma provides structured personal data memory.**

---

## 6.3 Neotoma Provides the Missing Substrate

Neotoma gives AI structured personal data memory built on three defensible architectural choices that provider memory cannot offer:

**Defensible Architectural Choices (Competitors Cannot Pursue):**

1. **Privacy-First Architecture** — User-controlled memory, no provider access, never used for training (vs. provider-controlled memory with provider access)

   - **Why Defensible:** Providers/startups won't pursue due to business model conflicts (data collection, training use)

2. **Deterministic Extraction** — Same input → same output, always; reproducible, explainable, no hallucinations (vs. ML-based probabilistic)

   - **Why Defensible:** Providers/startups won't pursue due to ML-first organizational identity and speed-to-market constraints

3. **Cross-Platform Access** — Works with ChatGPT, Claude, Cursor via MCP, not platform-locked (vs. platform-specific memory)
   - **Why Defensible:** Providers won't pursue due to platform lock-in business models; startups won't pursue due to separate consumer app positioning

**Feature Capabilities (Enabled by Defensible Differentiators):**

- Dual-path ingestion (file uploads + agent interactions)
- Entity resolution (deterministic hash-based canonical IDs across all personal data)
- Timeline generation (deterministic chronological ordering across all personal data)
- Structured extraction (schema-first from documents and agent-created data)
- Stable record IDs (persistent references)
- Explicit provenance (trust and auditability)

**Strategic Positioning:** Provider memory (ChatGPT, Claude, Gemini) and startups (Supermemory.ai) are developing similar feature capabilities (structured memory, entity resolution, timelines), but cannot pursue Neotoma's defensible architectural choices due to structural constraints. See [`docs/private/competitive/defensible_differentiation_framework.md`](../private/competitive/defensible_differentiation_framework.md).

**Neotoma is the "RAM + HDD" for AI-native personal computing.**

---

## Related Documents

- [`docs/context/index.md`](../context/index.md) — Documentation navigation guide
- [`docs/foundation/product_positioning.md`](./product_positioning.md) — Product positioning and differentiation
