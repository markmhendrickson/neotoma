---
name: review-homepage
description: >-
  Audits a marketing homepage or primary landing page using a scored rubric
  (clarity, ICP, CTAs, proof, IA, visuals, developer surface, a11y/SEO/perf).
  Produces a markdown report with evidence, scores, foundation-doc alignment,
  and a prioritized backlog. Use when the user asks to review, audit, or
  analyze a site homepage, landing page, marketing home, hero, or conversion
  copy; or mentions homepage best practices, bounce, or message clarity.
triggers:
  - review homepage
  - homepage audit
  - landing page review
  - audit homepage
  - review site home
---

# Review Site Homepage

Execute a structured homepage audit. The **canonical rubric and criterion tables** live in `foundation/strategy/homepage_landing_analysis_framework.md` — read that file at the start of a full review so scoring stays aligned with the foundation submodule.

## When to Apply

- Full audit: user wants scores, evidence, and recommendations.
- Quick pass: user wants a fast take — use only **Quick heuristics** (from the framework) plus top gaps; skip 1–5 scoring unless asked.

## Inputs

Clarify if missing:

| Mode | What to use |
|------|----------------|
| **Live URL** | Given URL (production or staging). Browser navigate + snapshot; desktop and mobile widths. |
| **This repo** | Resolve the app’s home route and hero copy from source (`MainApp`, routes, `site_data`, i18n packs, SEO metadata). Optionally run the dev server and verify in browser. |

Default **traffic assumption** to `general organic` if the user does not specify (campaign vs branded).

## Prerequisites

**Foundation docs (for Phase 3 alignment), when present in the workspace:**

- `docs/foundation/core_identity.md`
- `docs/foundation/product_positioning.md`
- `docs/foundation/problem_statement.md`

**Optional:** Lighthouse / Web Vitals, axe or keyboard spot-check for dimension H.

## Execution

### 1. Load rubric

Read `foundation/strategy/homepage_landing_analysis_framework.md` for:

- Dimensions **A–H** and criteria **A1–H4** (evidence to capture per row).
- **Output template** (copy structure for the deliverable).

If that path is missing (submodule not checked out), use the **Quick heuristics** and still produce: executive summary, key copy quotes, top gaps, recommendations — note that full rubric was unavailable.

### 2. Phase 1 — Capture (neutral)

1. View homepage **desktop** and **mobile** (browser or source-derived layout notes).
2. Record **exact** headline, subhead, primary and secondary CTAs, and primary nav labels.
3. Build a **section map** (major blocks / H2s).
4. Note **traffic context** (user-supplied or `general organic`).
5. For live URL: prefer **above-the-fold** observation from snapshot; capture or describe hero visual vs claim.

### 3. Phase 2 — Score

1. Score each dimension **A–H** on **1–5** (or Pass / Partial / Fail if the user asked for a light pass).
2. For any dimension **≤2**, add **symptom** + **user impact** (one line each).
3. Cite **evidence** (quoted copy, component/file paths for in-repo reviews, or snapshot notes).

### 4. Phase 3 — Align to strategy

1. Read foundation docs listed in Prerequisites when they exist.
2. List **matches** and **drift** (page vs `product_positioning` / `core_identity` / `problem_statement`).
3. Tag issues **must-fix** vs **nice-to-have** using impact × effort.

### 5. Phase 4 — Recommendations

For each gap:

- **Change type:** copy | layout | IA | proof | performance | a11y
- **Concrete next step** (specific, implementable)
- **Success signal** (metric or qualitative check)

Order backlog: **high impact, low effort** first.

## Deliverable

Write the report using the template from `homepage_landing_analysis_framework.md`.

**Default output path (adjust if repo uses another private-docs convention):**

`docs/private/marketing/homepage_analysis_YYYY-MM-DD.md`

If `docs/private/marketing/` does not exist, create it or use the closest existing `docs/private/...` path and state the path in the reply.

Include:

- Context (URL or “local / route X”)
- Executive summary (top wins, top gaps, priority order)
- Evidence (copy quotes; file paths for in-repo assets)
- Score table A–H
- Detailed findings A–H
- Foundation alignment
- Recommendation backlog table

## In-Repo Homepage (Neotoma / similar SPAs)

1. Find the **default landing route** and the components that render the **hero** (e.g. main app router, `SitePage`, localized strings).
2. Pull **headline and subhead** from the authoritative source (often `site_data`, `static_packs`, or page-specific components) — not only hardcoded guesses.
3. Cross-check **SEO title/description** (`seo_metadata` or equivalent) against the hero promise (dimension **H1**).
4. When possible, confirm **visual hierarchy** and CTAs in browser at typical viewports.

## Quick Pass (User Requests “Fast” or “5-Minute”)

Run only the five checks from the framework’s **Quick Heuristics** section:

1. Stranger test (what / for whom in one sentence after ~5s)
2. CTA test (one obvious next step on mobile)
3. Proof test (specific credibility, not adjectives)
4. Product test (see product / flow, not only metaphor)
5. Drift test (vs positioning doc)

Output: short markdown or bullet list; no full score grid unless requested.

## References

External links and related foundation files are listed at the bottom of `foundation/strategy/homepage_landing_analysis_framework.md`.

## Related

- `foundation/strategy/project_assessment_framework.md` — assess *other* products; this skill audits *your* homepage.
- `foundation/strategy/competitive_analysis_template.md` — compare competitor homepages.
