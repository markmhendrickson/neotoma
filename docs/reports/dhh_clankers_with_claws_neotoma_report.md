---
title: "DHH 'Clankers with claws' — Neotoma Need and Positioning Report"
status: "report"
created_date: "2026-02-06"
sources:
  - "https://world.hey.com/dhh/clankers-with-claws-9f86fa71 (David Heinemeier Hansson, Feb 5 2026)"
  - "docs/private/insights/dhh_clankers_with_claws_relevance_analysis.md"
---

# DHH "Clankers with claws" — Neotoma Need and Positioning Report

## Scope

This report summarizes David Heinemeier Hansson's Hey World post "Clankers with claws," his general thesis that agents can navigate human interfaces and do not need agent-specific ones, and the critical application of that thesis to the need for Neotoma. It does not change code or schema.

## Purpose

Provide a single reference for: (1) what DHH claimed and showed, (2) whether his thesis undermines or supports the need for Neotoma, and (3) how Neotoma should position itself (memory vs. execution, structured cross-source view vs. human UIs).

## Executive Summary

| Question | Answer |
|----------|--------|
| Does DHH's thesis undermine the need for Neotoma? | **No.** His point applies to **execution** interfaces (MCPs/APIs for doing things). Neotoma is a **memory/truth** layer. |
| Do agents need Neotoma if they can "navigate human ones"? | **Yes, for cross-source structured memory.** No single human UI shows "all my entities" or "timeline from every source"; Neotoma provides that view. |
| Positioning implication? | **Sharpen:** Neotoma = canonical, structured memory for the user's data. Separate "memory MCP" from "execution MCP" in all messaging. |

---

## 1. Source Summary

**Source:** David Heinemeier Hansson, "Clankers with claws," Hey World, February 5, 2026.  
**URL:** https://world.hey.com/dhh/clankers-with-claws-9f86fa71

**What he did:** Ran an AI agent ("Kef") on OpenClaw with **zero accommodations**: no skills, no MCPs, no APIs. The agent signed up for HEY, then Fizzy, created a Fizzy board with five idea cards and web-sourced images, joined Basecamp via invite, and completed all steps without corrections. He used Claude Opus 4.5 (later re-ran with Kimi K2.5 via OpenRouter). He ran the agent on a Proxmox VM isolated from his personal data and logins.

**What he argued:** Agent accommodations (MCPs, CLIs, APIs) are a "temporary crutch." The future is agents interacting via "human affordances" (web, email, standard UIs), like self-driving cars that eventually do not need special equipment (e.g. LIDAR). Human interfaces will be "more than adequate."

**General claim:** Agents do not need agent-specific interfaces, because they can navigate human ones sufficiently.

---

## 2. Critical Application: Does This Undermine Neotoma?

### 2.1 Execution vs. memory

- DHH's thesis targets **execution** tooling: browser automation, API wrappers, MCPs that let the agent *do* things (click, submit, call services). Neotoma's MCP is for **memory**: read/write structured records, entities, timelines, ingestion. So "agents don't need agent-specific interfaces" applies to execution; it does **not** apply to an interface for **structured, aggregated memory** that no single human app provides.

### 2.2 No single human interface for cross-source structured truth

- Human interfaces are **per-source**: Gmail, Drive, Notion, local files each have their own UI. There is **no** human interface that shows:
  - "All my entities across all my data"
  - "Timeline of events from every source"
  - "Resolved canonical list of people/companies"
- Those are **aggregated, normalized views** that only a dedicated layer (Neotoma) can provide. The agent's options are: (a) navigate every source each time and infer structure itself (costly, inconsistent, no single source of truth), or (b) read from Neotoma. Neotoma's "interface" is not a substitute for a human UI; it is a substitute for the agent re-crawling and re-deriving structure from dozens of human UIs every time.

### 2.3 What DHH's experiment did not test

- **One agent, one platform.** His demo did not test cross-platform or user-owned memory.
- **Sandbox, not real data.** The agent created new accounts; it did not reason over DHH's existing personal data (invoices, contacts, documents). For "agent reasons over my existing fragmented data," a user-controlled layer (Neotoma) with a bounded interface (MCP) remains the safe, structured option.
- **Structured use cases.** The demo was signup and collaboration. It did not address "reason over my tax documents," "who are all my vendors across my files," or "timeline of my contracts." For those, structured + queryable + provenance (Neotoma) matters.

### 2.4 Where his view strengthens Neotoma

- **Privacy:** He isolated the agent from his data. That aligns with "give the agent a bounded memory layer you control" (Neotoma) instead of full machine access.
- **Multi-tool users:** His experiment was one agent. Users who use multiple agents or tools (Cursor, ChatGPT, Claude, OpenClaw) need one truth layer so "what I know" is not siloed per platform.
- **Structured, auditable memory:** As agents do more, the need for "what does the user know?" in a structured, auditable form grows. Neotoma's deterministic, provenance-backed layer is where that lives.

---

## 3. Summary Table: DHH Claim vs. Effect on Neotoma

| DHH claim / observation | Effect on need for Neotoma | Condition |
|-------------------------|----------------------------|-----------|
| Agents can act without MCP/skills/APIs | Neutral / strengthens | Only if we frame Neotoma as memory layer, not execution. |
| MCPs are a temporary crutch | Weakens if misread | Own the "memory MCP" narrative; separate from execution MCP. |
| Human affordances will be adequate | Weakens for execution; neutral/strengthens for memory | Adequate for *doing* things. For *structured cross-source memory*, a dedicated layer (Neotoma) still required. |
| Isolation and caution | Strengthens | Aligns with bounded, user-controlled memory (Neotoma). |
| One agent, one platform | Does not test Neotoma | Neotoma's need is clearest for multi-platform and structured personal data. |

---

## 4. Recommendations

1. **Positioning:** Add "Truth Layer vs. execution layer" and "memory MCP vs. execution MCP" to `docs/foundation/product_positioning.md` (or equivalent). State explicitly that Neotoma's MCP is the interface to **cross-source structured memory**, not to execution.
2. **Messaging:** Use one clear line in content and talks: "Agents that use human affordances (web, email) still need structured, user-controlled memory for cross-source truth. Neotoma is that layer."
3. **Reference architecture:** Document "agent in isolated environment (e.g. VM) + Neotoma MCP for approved personal data" as a recommended, privacy-aligned pattern.
4. **Monitor narrative:** If "we don't need MCP" spreads, consistently separate memory MCP (Neotoma) from execution MCP so Neotoma is not lumped with "unnecessary tooling."

---

## 5. Conclusion

DHH's general point—agents can navigate human interfaces and may not need agent-specific execution interfaces—**does not undermine** the need for Neotoma when that need is defined as: a user-owned, cross-platform, **structured truth layer** for personal data that agents (and humans) can query and update via a bounded interface. It would undermine Neotoma only if Neotoma were positioned as **execution** infrastructure or as the only way agents can remember anything. Applied critically, his thesis **sharpens** positioning: Neotoma is the **canonical, structured memory** for the user's personal and professional data, regardless of how agents execute. There is no single human interface for that; Neotoma's MCP is the interface to a view only a dedicated truth layer can provide.

---

## Related Documents

- `docs/private/insights/dhh_clankers_with_claws_relevance_analysis.md` — Full relevance analysis and critical application
- `docs/foundation/core_identity.md`
- `docs/foundation/product_positioning.md`
