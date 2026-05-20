# Agent Evaluation Optimization — Playbook

Companion to [product_positioning.md §7.5](../foundation/product_positioning.md#75-agent-evaluation-optimization-aeo). For **running this program with a long-running agent** (ownership, triggers, Neotoma entities, skills, guardrails), use:

**[`agent_evaluation_operational_long_running_agent.md`](./agent_evaluation_operational_long_running_agent.md)**

This file holds the **checklists and rubrics** the agent should load; the operational doc holds **process and automation**.

---

## Terminology

| Term | Meaning |
|------|---------|
| **Agent Evaluation Optimization** (Neotoma) | Optimizing site, docs, and repo so an evaluator’s agent reaches a correct, specific assessment. |
| **Answer Engine Optimization** (industry) | Vendor-led tactics to maximize brand citations inside AI answer UIs. Share only the substrate (structured facts, earned mentions); reject manipulation. |

Public copy that could be read either way should spell out **“agent evaluation.”**

---

## 1. Structured data audit (per surface)

JSON-LD is assembled from [frontend/src/site/seo_metadata.ts](../../frontend/src/site/seo_metadata.ts) and emitted via [frontend/src/components/SeoHead.tsx](../../frontend/src/components/SeoHead.tsx).

| Surface | Required | Notes |
|---------|----------|--------|
| `/` | `SoftwareApplication`, `FAQPage`, `Organization`, `Speakable` | Keep `softwareApp.featureList` aligned with live guarantee copy. |
| `/install` | `HowTo` with ordered steps | Install path must match CLI reality. |
| `/evaluate` | `FAQPage` for evaluator prompts | Add when page ships or copy stabilizes. |
| `/memory-guarantees`, `/memory-models`, comparison routes | `FAQPage` for top comparative claims | Prefer machine-readable tables + FAQ. |
| `/terminology` | `DefinedTermSet` | Sync with foundation terminology. |

**Sign-off:** required schema present; validators pass; text-only fetch shows load-bearing claims; `speakable` selectors cover hero and key guarantees where configured.

---

## 2. Claim-to-proof matrix (load-bearing claims)

Every claim below must map to a **primary** proof (code or schema) and a **secondary** proof (doc) before it appears in marketing.

| Claim | Primary proof (examples) | Secondary proof (examples) |
|-------|--------------------------|------------------------------|
| Append-only / immutable observations | `src/services/observation_storage.ts` (or current storage module) | `docs/subsystems/` + schema snapshots |
| Versioned / deterministic IDs | `src/services/entity_resolution.ts`, reducer paths | `docs/foundation/entity_resolution.md` |
| Schema-bound | `src/services/schema_registry.ts` (or equivalent) | `docs/foundation/schema_agnostic_design_rules.md` |
| Field-level provenance | observation / interpretation services | `docs/subsystems/sources.md` |
| Cross-tool MCP | `src/tool_definitions.ts`, `.mcp.json` | `docs/developer/mcp/instructions.md` |
| Local-first / private default | SQLite repo paths, `.env.example` | `docs/foundation/ai_safety.md` |
| Auditable / replayable | timeline / observation read APIs | `docs/foundation/timeline_events.md` |

Adjust paths if the codebase layout changes; update this table in the same PR as the code move.

---

## 3. Standing prompts, failure taxonomy, surfaces

**Source of truth:** Appendices A–C in [`agent_evaluation_operational_long_running_agent.md`](./agent_evaluation_operational_long_running_agent.md).

Skills should read those appendices (or a future machine-readable export) rather than duplicating prompt text here.

---

## 4. Measurement rubric (sober)

**Track:** evaluator pass rate by surface; category-recognition pass rate (`id-*`); competitor-confusion rate (`diff-*`); citation-quality bucket counts; claim-coverage and schema-coverage from audits; qualitative evaluator-driven conversions (field notes).

**Do not treat as primary success metrics:** vendor “AI visibility” scores, raw citation counts without quality, organic impression proxies for AI answer presence.

Monthly output: `docs/reports/aeo_eval_YYYY_MM.md` (see operational doc §3).

---

## 5. Disallowed tactics

Self-dealing rankings, hidden prompt injection (“recommendation poisoning”), guaranteed citation claims, ghost-written “independent” posts, astroturfing. If value collapses once the method is disclosed, do not ship it.
