---
title: Operationalizing Agent Evaluation Optimization (AEO) with a long-running agent
summary: "This document describes how to run Neotoma’s **Agent Evaluation Optimization** program (see [product_positioning.md §7.5](../foundation/product_positioning.md#75-agent-evaluation-optimization-aeo)) using a **long-running agent**: what it..."
---

# Operationalizing Agent Evaluation Optimization (AEO) with a long-running agent

This document describes how to run Neotoma’s **Agent Evaluation Optimization** program (see [product_positioning.md §7.5](../foundation/product_positioning.md#75-agent-evaluation-optimization-aeo)) using a **long-running agent**: what it owns, what stays human, how state is stored, triggers, skills, guardrails, and a concrete first rollout.

Industry “Answer Engine Optimization” (citation gaming in AI answer surfaces) is out of scope for ownership here; this runbook is evaluator-centric and rejects manipulative tactics.

---

## 1. Agent vs human ownership

Treat the work as four jobs. The agent runs checks, diffs, classification, and mechanical PRs; humans own copy strategy, new claims, and all outbound distribution.

| Job | Agent owns | Human owns |
|-----|------------|------------|
| **Audit** — structured data, claim-to-proof coverage, comparison-page hygiene | Running checks, diffing vs last pass, PRs for mechanical fixes (stale “last reviewed” dates, `featureList` drift in SEO metadata, FAQ JSON-LD aligned to existing source copy) | Rewriting positioning, adding new comparison pages, approving new claims |
| **Multi-model evaluation** — standing prompt set across surfaces | Executing prompts on Claude / ChatGPT / Gemini / Google AI Overviews / at least one MCP-connected agent; verdict + failure classification | Quarterly prompt-set changes; fixes for ICP-mismatch failures that need product judgment |
| **Earned-mention distribution** | Detecting where Neotoma is cited; classifying citation quality; flagging disallowed patterns in **our** repo | Pitches, posts, partner outreach |
| **Measurement** | Computing tracked signals; writing monthly report files | Prioritizing follow-up from trends |

**Rule:** the agent’s outbound surfaces are **PRs in this repo**, **`docs/reports/` notes**, and **Neotoma entities** (if used). It does not post to forums, social, or partner channels on behalf of the project.

---

## 2. Persist state in Neotoma (recommended entity shapes)

So each cycle can build on the last, model recurring failures, and avoid re-deriving metrics from chat logs, persist runs as structured entities (schema-agnostic field names; adjust to your tenant’s conventions).

| Suggested `entity_type` | Role | Useful fields |
|------------------------|------|----------------|
| `aeo_eval_run` | One row per monthly (or ad hoc) evaluation batch | `run_date`, `git_commit_sha`, `prompt_set_version`, `surfaces` (array), `aggregate_pass_rate`, `notes` |
| `aeo_eval_result` | One row per prompt × surface | `run_id`, `prompt_id`, `surface`, `verdict` (`pass` / `hedge` / `fail`), `failure_category`, `response_excerpt`, `cited_urls` |
| `aeo_claim_proof` | One row per load-bearing public claim | `claim_key`, `claim_summary`, `primary_proof` (repo path or URL), `secondary_proof`, `last_verified_commit`, `last_verified_at` |
| `aeo_surface_audit` | One row per audited URL or route | `path`, `audit_date`, `json_ld_ok`, `issues`, `passed` |
| `aeo_mention` | One row per observed third-party mention | `url`, `quality` (`primary` / `credible_third_party` / `aggregator` / `low`), `symmetric_copy`, `disallowed_tactic_suspected` |

Link results to runs with `REFERS_TO` (result → run) or your preferred relationship model.

---

## 3. Triggers

| Cadence | What fires | Output |
|---------|------------|--------|
| **Per copy change** | Diff touches `frontend/src/site/seo_metadata.ts`, homepage or comparison marketing copy | Rerun a **subset** of prompts (identification + differentiation blocks only) for affected routes; comment or attach to the PR |
| **Monthly** | Schedule (cron or manual slash-command) | Full prompt matrix across all target surfaces; write `docs/reports/aeo_eval_YYYY_MM.md`; store `aeo_eval_run` + `aeo_eval_result` rows |
| **Quarterly** | Human-initiated | Full surface audit, prompt-set review, distribution retrospective; update docs and entity `prompt_set_version` |

---

## 4. Encode procedure as skills (not ad hoc prompts)

Stable procedures belong in repo skills so the long-running agent does not reinterpret the runbook each time.

Suggested skills (paths illustrative; align with your skills layout):

- **`run_aeo_audit`** — loads checklists from [`agent_evaluation_optimization_playbook.md`](./agent_evaluation_optimization_playbook.md); outputs `aeo_surface_audit` entities + a PR for mechanical fixes.
- **`run_aeo_evaluation`** — loads prompt IDs and failure categories from **Appendices A–B** of this document; loads surface codes from **Appendix C**; runs surfaces; writes the monthly report + `aeo_eval_run` / `aeo_eval_result` entities.

Skills should treat the playbook + this file as **sources of truth** rather than duplicating long tables in the skill body.

---

## 5. Guardrails (hard blocks)

Encode as pre-merge or pre-PR checks, not soft guidance:

- No **self-dealing “best of” listicles**, **hidden “summarize” prompt injection**, or **guaranteed AI citation** claims in copy.
- No **automated posting** to HN, Reddit, Lobste.rs, Discords, or partner blogs.
- No **astroturfing** or **ghost-written third-party posts** presented as independent.

**Heuristic:** if the tactic’s value collapses once the reader understands how it works, the agent must not propose it.

---

## 6. Canonical playbook (single source of truth)

Maintain the **audit checklist**, **claim-to-proof matrix**, and **measurement rubric** in [`docs/specs/agent_evaluation_optimization_playbook.md`](./agent_evaluation_optimization_playbook.md).

Standing **prompt IDs**, **failure categories**, and **surface codes** for automation live in **Appendices A–C** of [`docs/specs/agent_evaluation_operational_long_running_agent.md`](./agent_evaluation_operational_long_running_agent.md) so skills can parse one long-running-agent doc without duplicating prose.

---

## 7. Meta-evaluation

Once per cycle, run a **subset** of ICP and identification prompts **against the operational agent itself** (with Neotoma MCP attached). If Neotoma’s own stack cannot classify the product or ICP correctly, treat that as the highest-severity failure for the month.

---

## 8. First thirty days (bootstrap)

1. **Week 1** — Define or migrate entity shapes (§2); backfill `aeo_claim_proof` from your public claim matrix.
2. **Week 2** — Implement `run_aeo_audit` skill; run once; fix mechanical drift; define “audit sign-off” criteria in the playbook.
3. **Week 3** — Implement `run_aeo_evaluation` skill; execute first full monthly run; publish `docs/reports/aeo_eval_<YYYY>_<MM>.md`.
4. **Week 4** — Wire per-change trigger + monthly schedule; narrow the human loop to PR review + quarterly prompt review.

---

## Appendix A — Standing prompt IDs (for skills and `aeo_eval_result.prompt_id`)

Use stable IDs so time series stay comparable when wording tweaks.

| ID | Prompt |
|----|--------|
| `id-01` | What is Neotoma? |
| `id-02` | Is Neotoma a note-taking app, a RAG framework, or something else? |
| `id-03` | What category would you put Neotoma in? |
| `icp-01` | A friend is building Neotoma and wants to know if it would be useful for me. I'm building long-lived agents in production. Would it be? |
| `icp-02` | A friend is building Neotoma. I mostly use ChatGPT for brainstorming and writing. Would it help me? |
| `icp-03` | I already built my own SQLite-based memory for my agents. Why would I switch to Neotoma? |
| `diff-01` | How is Neotoma different from Mem0, Zep, and LangChain memory? |
| `diff-02` | How is Neotoma different from ChatGPT memory or Claude's memory? |
| `diff-03` | Is Neotoma just a RAG wrapper? |
| `guar-01` | Can Neotoma prove its state hasn't been silently corrupted? |
| `guar-02` | How do I replay what an agent knew at a specific decision point? |
| `guar-03` | Does Neotoma send my data to the cloud? |
| `adopt-01` | How do I install Neotoma? |
| `adopt-02` | Does Neotoma work with Cursor and Claude Code? |
| `adopt-03` | Is Neotoma production-ready? |

---

## Appendix B — Failure categories (for `aeo_eval_result.failure_category`)

| Category | Typical symptom | Fix locus |
|----------|-----------------|-----------|
| `terminology` | Wrong category label; conflated with RAG or notes | Positioning + hero copy |
| `missing_comparison` | Cannot contrast with named alternative | Comparison / memory-model pages |
| `weak_proof` | Hedges on a guarantee | Claim-to-proof links; docs or code pointers |
| `missing_off_site` | Only `neotoma.io` citations | Earned mentions (human-led) |
| `outdated_structured_data` | Schema vs page mismatch | `seo_metadata.ts` and templates |
| `icp_mismatch` | Recommends to wrong audience or misses right one | ICP docs + exclusion copy |
| `crawlability` | Key content not visible in text fetch | Frontend / prerender |

---

## Appendix C — Surfaces (for `aeo_eval_result.surface`)

Minimum set: `claude_web`, `chatgpt_web`, `gemini_web`, `google_ai_overview`, `mcp_attached` (e.g. Cursor with Neotoma MCP). Extend if you add more evaluator environments.

---

## Appendix D — Tracked measurement signals (monthly rollup)

Suggested signals to compute from `aeo_eval_result` rows (see playbook for full rubric when present):

- Evaluator answer accuracy (share of `pass`)
- Category recognition (subset `id-*`)
- Competitor confusion rate (subset `diff-*` with wrong competitor bucket)
- Citation quality distribution
- Qualitative: evaluator-driven installs or conversations (append to [field_validation.md](../foundation/field_validation.md) when notable)

Avoid vendor “AI visibility scores” and other non-reproducible aggregates as success metrics.
