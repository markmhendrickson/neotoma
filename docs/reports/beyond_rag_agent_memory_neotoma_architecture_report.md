---
title: "Beyond RAG for Agent Memory: Neotoma Architecture Report"
status: "report"
created_date: "2026-02-04"
sources:
  - "arxiv 2602.02007 (Hu et al., xMemory paper)"
  - "DAIR.AI X / PDF (Beyond RAG for Agent Memory)"
  - "docs/private/insights/xmemory_beyond_rag_agent_memory_paper_relevance_analysis.md"
  - "docs/private/insights/dair_ai_beyond_rag_agent_memory_relevance_analysis.md"
---

# Beyond RAG for Agent Memory: Neotoma Architecture Report

## Scope

This report consolidates analysis of the paper "Beyond RAG for Agent Memory: Retrieval by Decoupling and Aggregation" (Hu et al., arxiv 2602.02007) and related DAIR.AI content, and states implications for Neotoma's architecture, defensibility, and robustness. It does not change code or schema.

## Purpose

Provide a single reference for: (1) whether the paper supports or contradicts Neotoma's architecture, (2) what the paper implies for defensibility of Neotoma's choices, and (3) whether Neotoma remains robust if inference is used only to suggest unbreaking schema changes.

## Executive Summary

| Question | Answer |
|----------|--------|
| Does the paper support or contradict Neotoma? | **Supports.** Same direction: beyond RAG, structure over similarity, intact units. No contradiction. |
| Defensibility implication? | **Strengthens** determinism/schema-first (paper shows LLM-based structure is fragile). **Does not** make "beyond RAG" defensible by itself; defensibility rests on Neotoma's specific choices. |
| Robust if inference suggests schema changes? | **Yes,** provided inference only suggests; application of schema changes and all extraction/reducer execution remain deterministic. |

---

## 1. Paper Summary

**Source:** Hu et al., "Beyond RAG for Agent Memory: Retrieval by Decoupling and Aggregation," arxiv 2602.02007 (preprint Feb 2026). King's College London, Alan Turing Institute.

**Problem:** Standard RAG (embed stored memories, retrieve fixed top-k by similarity, concatenate) is mismatched to agent memory. RAG assumes large, heterogeneous corpora with diverse passages; agent memory is a bounded, coherent stream with highly correlated (often near-duplicate) spans. Consequences: fixed top-k collapses to redundant context; post-hoc pruning fragments temporally linked evidence.

**Proposed approach:** "Decoupling to aggregation." Disentangle memories into semantic components, organise into a hierarchy, use structure to drive retrieval (not similarity ranking over raw spans). Preserve intact units; do not prune inside evidence blocks.

**xMemory:** Four-level hierarchy (messages → episodes → semantics → themes), sparsity-semantics objective for theme split/merge, top-down retrieval: select compact set of themes/semantics, then expand to episodes and raw messages only when it reduces reader uncertainty. Beats Naive RAG, A-Mem, MemoryOS, LightMem, Nemori on LoCoMo and PerLTQA (answer quality and token efficiency). Paper cites A-Mem and MemoryOS as fragile due to LLM-generated structured memory (formatting deviations, failed updates).

---

## 2. Neotoma Alignment: Support vs Contradiction

**Conclusion: The paper supports Neotoma's architecture; it does not contradict it.**

| Paper principle | Neotoma alignment |
|-----------------|-------------------|
| RAG wrong for agent memory | Neotoma avoids RAG/semantic search in MVP. |
| Structure over similarity | Neotoma retrieves by schema, entities, timelines, relationships (MCP tools), not by embedding similarity. |
| Intact units; no pruning inside evidence | Observations and reducer outputs are intact; no ad-hoc pruning inside them. |
| Control redundancy without fragmenting evidence | Deterministic merge and schema-typed structure; no prompt pruning. |

**Difference (additive, not contradictory):** xMemory builds structure with embeddings and LLM-generated summaries. Neotoma builds structure with schema-first, deterministic extraction and reducers. Same high-level direction; different implementation. The paper does not require embeddings or LLMs for "beyond RAG."

---

## 3. Defensibility Implications

Neotoma's defensible differentiators: (1) privacy-first, (2) deterministic/verifiable domain, (3) cross-platform MCP.

| Differentiator | Paper implication |
|----------------|-------------------|
| **Determinism / schema-first** | **Strengthens.** Paper shows LLM-based structure (A-Mem, MemoryOS) is brittle. Supports that deterministic, schema-first structure is a more reliable (and structurally harder for LLM-centric competitors to copy) path. |
| **"Beyond RAG" as category** | **Does not support defensibility.** Paper shows the direction is valid but achievable without Neotoma's choices (e.g. xMemory uses embeddings/LLMs). Defensibility must rest on Neotoma's specific choices, not on the category. |
| **Privacy / MCP** | **Neutral.** Paper's impact statement recommends consent and minimisation but does not implement. No implication for or against Neotoma's privacy-first or cross-platform defensibility. |

**Net:** The paper supports defensibility of the deterministic, schema-first architecture by highlighting fragility of the alternative. It does not imply the overall "beyond RAG" position is defensible by itself.

---

## 4. Robustness When Inference Suggests Unbreaking Schema Changes

**Question:** Is Neotoma's architecture still relatively robust if inference (e.g. LLM) is used to *suggest* unbreaking schema changes?

**Conclusion: Yes, provided inference is strictly in a suggestion role.**

| Condition | Rationale |
|-----------|-----------|
| **Schema changes are applied deterministically** | Migrations or config updates are applied by tooling and/or human approval, not by the model. Same schema + same data → same observations and reducer output. |
| **Extraction and reducer stay deterministic** | No LLM in the path from input to observations or entity snapshots. Intact units and same-input–same-output hold. |
| **Schema remains source of truth** | Canonical schema is defined by config/migrations. Inference only proposes; it does not define or mutate authority. |

**Risk to avoid:** Inference must not creep into execution (e.g. auto-applying every suggestion, or LLM-driven merge/extraction). If "suggest unbreaking schema changes" is implemented as "model proposes; human or deterministic pipeline approves and applies," robustness and defensibility of the deterministic core are preserved. The paper's critique of "LLM-generated structure" applies when the model *drives* structure; it does not apply when the model only *suggests* schema evolution that is then applied deterministically.

---

## 5. Recommendations

1. **Cite arxiv 2602.02007** in architecture and positioning docs when explaining why agent memory retrieval should move beyond RAG and why structure and intact units matter.
2. **Preserve intact-unit invariant:** Do not prune or compress inside an observation boundary; document this as alignment with the paper.
3. **Position determinism explicitly:** In comparisons with xMemory or similar work, state that Neotoma achieves "beyond RAG" with deterministic, schema-first structure rather than LLM/embedding-based hierarchy.
4. **If inference is used for schema suggestions:** Keep it advisory only; require deterministic application and approval; document that the critical path (ingest → extract → reduce → store → retrieve) remains deterministic.

---

## 6. Related Documents

- `docs/private/insights/xmemory_beyond_rag_agent_memory_paper_relevance_analysis.md` — Full paper relevance analysis
- `docs/private/insights/dair_ai_beyond_rag_agent_memory_relevance_analysis.md` — DAIR.AI tweet/PDF relevance analysis
- `docs/foundation/core_identity.md` — Neotoma scope and non-RAG stance
- `docs/foundation/product_positioning.md` — Defensible differentiators
