# Neotoma vs. mmry.io: Marketing Comparison
## Competitive Dynamic Summary
**Overall Assessment: Complementary, Not Competitive**
mmry.io and Neotoma operate in adjacent but distinct market segments with minimal direct competition:
- **Different Data Domains:** mmry indexes web content (social media, videos, bookmarks); Neotoma structures personal data (PDFs, images, receipts, agent-created data)
- **Different User Problems:** mmry solves "I can't find that thing I saw online"; Neotoma solves "AI agents have no memory across sessions"
- **Different Value Propositions:** mmry enables rediscovery of consumed web content; Neotoma enables structured memory for AI agents
- **Different Integration Models:** mmry uses optional local inference (Ollama); Neotoma uses core MCP integration for agent memory
**Competitive Risk: Low**
- No overlap in primary use cases or target users
- Different technical architectures (search engine vs. structured memory substrate)
- Both can coexist in a user's toolset without conflict
- Potential integration opportunity: mmry could index Neotoma's structured records
**Strategic Positioning:**
- Neotoma occupies a new category (Deterministic Personal Memory Engine) that mmry does not address
- mmry focuses on web content recall; Neotoma focuses on document structure for AI
- Clear differentiation enables coexistence without direct competition
- Both products reinforce the broader trend toward privacy-first, user-owned data tools
**Market Context:**
Both products address fragmented personal data but through fundamentally different lenses:
- mmry = horizontal search tool for web content consumption
- Neotoma = vertical memory substrate for AI-native workflows
## Executive Summary
**mmry.io** is a privacy-first personal search engine that indexes content you've already seen online (Twitter, Reddit, YouTube, bookmarks) to enable search across your digital history.
**Neotoma** is a deterministic truth layer that transforms fragmented personal data into structured, queryable knowledge for AI agents via MCP.
Both products address fragmented personal data, but serve fundamentally different use cases: mmry focuses on **searching web content you've consumed**, while Neotoma focuses on **structuring documents and conversation context for AI agents**.
## Core Value Propositions
### mmry.io
- **"Find the memories you've lost"** — Search engine for things you've already seen online
- Privacy-first search across Twitter, Reddit, YouTube, bookmarks, Pocket, Raindrop
- Local-first architecture with optional Ollama integration
- Community-driven plugin ecosystem
- No algorithms, no AI training on your data
### Neotoma
- **"Structured Personal Data Memory for AI Agents"** — Deterministic memory substrate for AI agents
- Dual-path ingestion: file uploads + agent interactions via MCP
- Structured extraction from PDFs, images, receipts, contracts, AND agent-created data
- Entity resolution and timeline generation across all personal data
- MCP-exposed memory for ChatGPT, Claude, Cursor (cross-platform)
- Schema-first, deterministic, explainable architecture
## Feature Comparison
| Feature                 | mmry.io                                                | Neotoma                                                                 |
| ----------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------- |
| **Primary Data Source** | Web content (Twitter, Reddit, YouTube, bookmarks)      | Personal data (PDFs, images, receipts, contracts, agent-created data)   |
| **Ingestion Method**    | Plugin-based imports from web services                 | File uploads + MCP agent interactions                                   |
| **Data Structure**      | Indexed web content (text, links, media)               | Structured records with schema types (invoice, receipt, contract, etc.) |
| **Search Capability**   | Full-text search across indexed content                | Structured search + filters + full-text (bounded eventual consistency)  |
| **Entity Resolution**   | Not applicable                                         | Hash-based canonical IDs unify entities across documents                |
| **Timeline Generation** | Not applicable                                         | Automatic chronological ordering from date fields                       |
| **AI Integration**      | Optional Ollama for local inference                    | MCP server for ChatGPT, Claude, Cursor (read/write memory)              |
| **Privacy Model**       | Local-first, no third-party data sharing               | Encrypted storage, row-level security, full provenance                  |
| **Extensibility**       | Community plugins (Twitter, Pocket, Raindrop, YouTube) | External providers (Gmail, Plaid) + MCP actions                         |
| **Target Use Case**     | "I saw this article/tweet/video but can't find it"     | "AI agents need structured memory of my personal data"                  |
| **Data Ownership**      | Your indexed web history                               | Your structured personal data memory (documents + agent-created data)   |
## Use Case Differentiation
### mmry.io Use Cases
- **"I remember reading something about X on Twitter but can't find it"** — Search indexed tweets
- **"What was that YouTube video I watched last month?"** — Search transcribed video content
- **"I bookmarked this article but forgot where"** — Search across Pocket/Raindrop imports
- **"Find that Reddit thread I commented on"** — Search indexed Reddit content
**Core Problem:** Web content you've consumed is scattered across platforms and hard to rediscover.
### Neotoma Use Cases
- **"AI agent needs to remember my preferences and context across sessions"** — Persistent memory via MCP
- **"Extract structured data from invoices and receipts"** — Schema-first extraction from documents
- **"Store project context during AI conversation"** — Agent creates structured data via MCP `store_record`
- **"Build timeline across documents and agent-created data"** — Automatic chronological ordering across all personal data
- **"Unify 'Acme Corp' across all personal data regardless of source"** — Entity resolution with canonical IDs
- **"AI agent should remember structured data from conversations"** — Structured data (not just conversation) stored via MCP
**Core Problem:** Personal data is fragmented and provider memory is conversation-only, preventing AI agents from building persistent structured memory with entity resolution and timelines.
## Technical Architecture Comparison
### mmry.io
- **Architecture:** Local-first search engine with plugin system
- **Storage:** Local database (not specified)
- **Processing:** Optional Ollama for local inference
- **Extensibility:** Community plugins for data sources
- **Security:** Sandboxed plugins, privacy-first design
### Neotoma
- **Architecture:** Five-layer architecture (External → Infrastructure → Domain → Application → Presentation)
- **Storage:** Supabase (PostgreSQL) with row-level security
- **Processing:** Deterministic extraction (regex/parsing), no LLM in MVP
- **Extensibility:** MCP actions, external providers (Gmail, Plaid)
- **Security:** Encryption, immutable truth layer, full provenance
## Market Positioning
### mmry.io
**Category:** Personal Search Engine / Digital Memory Tool
**Positioning:**
- Privacy-first alternative to traditional search engines
- Community-driven, non-commercial project
- Focus on web content discovery and recall
**Target Users:**
- Heavy web content consumers (Twitter, Reddit, YouTube users)
- Privacy-conscious individuals who want local-first search
- Users frustrated by platform-specific search limitations
### Neotoma
**Category:** Deterministic Personal Memory Engine (DPME) / AI Memory Substrate
**Positioning:**
- Truth layer beneath AI tools
- Structured memory for AI agents
- Foundation for agent-native personal computing
**Target Users:**
- AI-native individuals (heavy ChatGPT, Claude, Cursor users)
- High-context knowledge workers (researchers, analysts, consultants, lawyers)
- AI-native founders and small teams (2–20 people)
## Competitive Advantages
### mmry.io Advantages
- **Web Content Focus:** Specialized in indexing web content you've consumed
- **Community Ecosystem:** Plugin marketplace for extensibility
- **Privacy-First:** Local-first architecture, no third-party data sharing
- **Non-Commercial:** Community-driven project without VC monetization
### Neotoma Advantages
**Defensible Architectural Choices:**
- **Privacy-first:** User-controlled memory, no provider access, never used for training
- **Deterministic:** Reproducible outputs, explainable, full provenance (vs. ML-based probabilistic)
- **Cross-platform:** Works with ChatGPT, Claude, Cursor via MCP (not platform-locked)
**Feature Capabilities (Enabled by Defensible Differentiators):**
- **AI-Native:** Built specifically for AI agent memory via MCP
- **Structured Data:** Schema-first extraction with entity resolution and timelines
- **Cross-Document Reasoning:** Entity unification enables reasoning across documents
- **Multi-Modal:** PDFs, images, OCR support for document ingestion
- **Conversation Context:** Agents can read/write memory during conversations
## Overlap and Distinction
### Where They Overlap
- Both address fragmented personal data
- Both emphasize privacy and data ownership
- Both enable search across previously inaccessible content
- Both are local-first/privacy-first architectures
### Where They Diverge
| Dimension          | mmry.io                                        | Neotoma                                                                |
| ------------------ | ---------------------------------------------- | ---------------------------------------------------------------------- |
| **Data Type**      | Web content (tweets, posts, videos, bookmarks) | Documents (PDFs, images, receipts, contracts) + conversation context   |
| **Primary Use**    | Rediscovering web content you've seen          | Structuring documents for AI agent memory                              |
| **Structure**      | Indexed text/media                             | Schema-first structured records with entities and timelines            |
| **AI Integration** | Optional local inference (Ollama)              | Core MCP integration for agent memory                                  |
| **Target Problem** | "I can't find that thing I saw online"         | "AI agents have no memory across sessions"                             |
| **User Workflow**  | Import web content → Search                    | Upload documents / Agent conversations → Structured memory → AI access |
## Marketing Messaging Differentiation
### mmry.io Messaging
- "Find the memories you've lost"
- "Privacy first search engine for all the things you have already seen"
- "Your memories belong to you"
- Focus on web content discovery and recall
### Neotoma Messaging
**Lead with Defensible Differentiators:**
- "Privacy-first deterministic memory for AI tools"
- "User-controlled, cross-platform via MCP"
- "Truth Layer for AI Memory"
- "Deterministic personal knowledge substrate"
- "The truth engine behind your AI tools"
- "The foundation for agent-native personal computing"
- Focus on structured memory for AI agents
## Strategic Implications
### For Neotoma
**Differentiation Strategy:**
- Emphasize AI-native positioning (MCP integration, agent memory)
- Highlight structured data extraction (schema-first, entity resolution, timelines)
- Position as substrate beneath AI tools, not a search engine
- Target AI-native users who need persistent agent memory
**Competitive Response:**
- mmry.io is not a direct competitor — different use cases and data types
- Both can coexist: mmry for web content search, Neotoma for document memory
- Potential integration opportunity: mmry could index Neotoma's structured records for search
**Market Positioning:**
- Neotoma occupies a new category (DPME) that mmry.io does not address
- mmry.io focuses on web content recall; Neotoma focuses on document structure for AI
- Clear differentiation enables coexistence without direct competition
## Conclusion
**mmry.io** and **Neotoma** serve complementary but distinct use cases:
- **mmry.io** = Search engine for web content you've consumed (Twitter, Reddit, YouTube, bookmarks)
- **Neotoma** = Structured memory substrate for AI agents (documents, conversation context)
Both address fragmented personal data, but through different lenses:
- mmry enables **rediscovery** of web content
- Neotoma enables **structuring** of documents for AI agent memory
**Key Distinction:** mmry helps you find things you've seen online; Neotoma helps AI agents remember and reason about your documents and conversations.
## References
- [mmry.io](https://mmry.io/) — Official website
- [Neotoma README](../../README.md) — Neotoma overview
