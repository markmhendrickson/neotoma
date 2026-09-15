---
title: ICP Index and Consolidation
summary: Canonical ICP statement, the map of every ICP document and what each is for, the retired and mapped informal synonyms, and the open disagreements that need an operator decision.
category: use_cases
subcategory: icp
audience: developer
visibility: internal
order: 0
tags: [icp, consolidation, positioning]
---

# ICP Index and Consolidation

This is the entry point for `docs/icp/`. It exists because the directory holds **ten** documents naming buyers, and a writer had no way to tell which one to use. Measured across `docs/` before this document was written: **"indie hacker" 25 mentions, "power user" 23, "personal agentic OS builder/operator" 7** — the supposedly canonical term was outranked 3:1 and 7:1 by two informal ones.

It does **not** re-decide what [`icp_reconciliation.md`](icp_reconciliation.md) already settled. That document assigned canonical roles (public vs. internal) and established that the functional and market views agree on the primary ICP. Both conclusions stand. What it did *not* do — and what this document does — is reconcile the internal market documents **against each other**, which is where the actual contradictions live.

## 1. The one primary ICP

The canonical public statement is unchanged, quoted verbatim from [`icp_from_functionality.md`](icp_from_functionality.md):

> **Developers building and operating AI agents who need a persistent, deterministic, auditable memory layer shared across the tools they run.**

At personal scale this developer-operator is one individual who is at once the operator who runs the service, the subject whose data it holds, and the builder who wires it into tools.

**Which noun phrase to use where** — the question that previously had no answer:

| Surface | Use | Source |
|---|---|---|
| Public — README, website, docs, any external copy | "Developers building and operating AI agents…" | [`icp_from_functionality.md`](icp_from_functionality.md) |
| Internal — strategy, sizing, channels, GTM | "personal agentic OS builder/operator" | [`primary_icp.md`](primary_icp.md) |

These are **two names for one buyer**, not two buyers. This is by design per `icp_reconciliation.md`; the defect was that nothing told a writer which to reach for. Never introduce a third.

## 2. Informal synonyms: retired or mapped

### "Power user" — RETIRED. Do not use.

The term is unusable as written. It currently denotes five incompatible things in live documents:

| Current usage | Where | Means |
|---|---|---|
| The core ICP population (200K–600K TAM) | `profiles.md:102` | The primary ICP |
| An explicit **non-target** | `developer_release_targeting.md:60` | The opposite of the primary ICP |
| A validation anti-pattern | `general_release_criteria.md:191` | A sampling warning |
| A 150–300M-person B2C mass market | `profiles.md:63`, `:1143` | A future/deferred segment |
| A premium price tier above individual | `profiles.md:1677`, `:1958` | A packaging tier |

A term that names both the core ICP and an explicit non-target carries no information. **Replace each occurrence with what is actually meant** — the primary ICP, a capable DIY builder (non-target), a heavy individual user, a B2C segment, or a price tier — rather than globally rewriting it.

### "Indie hacker" — MAPPED, with a caveat that matters

Not a synonym for the primary ICP. It is a **narrower subsegment**: `developer_release_targeting.md:25` lists indie hackers under "**Technically fluent but not infra-oriented**… would install an npm package and configure an MCP server; would not write one from scratch."

That trait *negates* the primary ICP's own qualifier Q10 (`primary_icp.md:259`, "Comfortable with infrastructure-level tooling") and its characteristic at `primary_icp.md:44` ("Comfortable with infrastructure-level abstractions").

**Mapping:** "indie hacker" = the not-infra-oriented subsegment of the primary ICP that `developer_release_targeting.md` nominates as the developer-release first-five target. Acceptable in that temporal, scoped sense. **Not** acceptable as a synonym for the primary ICP, and not acceptable in public copy. Elsewhere it appears legitimately as a *channel* name ("Indie Hacker forums", `primary_icp.md:142`, `:340`) — that usage is fine and is not a buyer claim.

See **Open question O1** below: whether that subsegment should be the primary ICP is an operator decision, not a documentation fix.

## 3. Document map — what each of the ten is for

| Document | Role | Visibility |
|---|---|---|
| [`icp_from_functionality.md`](icp_from_functionality.md) | **Canonical public ICP statement.** Derived from shipped functionality, not from marketing copy | public |
| [`icp_reconciliation.md`](icp_reconciliation.md) | Bridge between functional and market views; assigns canonical roles | public |
| **`README.md`** (this file) | Index, synonym policy, open disagreements | internal |
| [`primary_icp.md`](primary_icp.md) | Internal market-derived view: conversion model, qualifiers, channels | internal |
| [`profiles.md`](profiles.md) | Persona detail, 2,563 lines, 22 numbered profiles — see the warning below | internal |
| [`secondary_icps.md`](secondary_icps.md) | Adjacent segments, incl. explicitly not-pursued ones | internal |
| [`future_icps.md`](future_icps.md) | Deferred segments | internal |
| [`developer_release_targeting.md`](developer_release_targeting.md) | **Temporal**, scoped to the developer release; narrower than the durable ICP | internal |
| [`prioritized_pain_points_and_failure_modes.md`](prioritized_pain_points_and_failure_modes.md) | Pain mapping; defers to `primary_icp.md` for ICP definition | internal |
| [`general_release_criteria.md`](general_release_criteria.md) | Release gates; names no buyer | internal |
| [`qualification_survey.md`](qualification_survey.md) | Survey instrument | internal |

**Warning on `profiles.md`.** It devotes roughly 240 lines to the Tier-1 archetype and roughly 2,200 lines to other segments, most of them **not developers at all** — knowledge workers, family document managers (a 100–200M-person segment with acquisition via parenting subreddits), high-net-worth individuals, crypto holders. Its own agent instructions (`profiles.md:2541`) tell agents to load it for "Creating user personas", "Designing features for specific ICPs", and "Writing marketing or sales materials", with only a tier-boundary constraint as a guard. Treat everything below Tier 1 as deferred or non-target material and do not source product or marketing decisions from it without checking the tier.

## 4. What this consolidation does NOT claim to have fixed

Stated plainly rather than smoothed over. Each item below is a genuine disagreement between documents, not a wording inconsistency, and several need an operator decision.

### The "one archetype, three modes" claim is contradicted by every operational table

`primary_icp.md:28` claims the three Tier-1 personas (AI Infrastructure Engineers, Agent System Builders, AI-native Operators) "describe moments in this person's workflow, not separate personas". Six documents repeat it.

It holds in narrative prose and fails wherever a document must make an operational decision:

- **Pricing** — `profiles.md:279–285` prices the modes **5–6× apart on the individual plan** ($10–30/mo operating vs. $50–200/mo infrastructure; the team column spreads wider still, $50–200 vs. $500–5000). The doc concedes the tension at L285 and resolves it by *nominating one mode as the buyer*: "Pricing should target the mode they're in when they adopt — likely operating mode".
- **Decision maker** — `profiles.md:275` assigns infrastructure mode a "Tech/infra lead" and operating mode an "Individual". Those are different humans.
- **Survey routing** — `qualification_survey.md:29`/`:40` asks a **single-select** "Which best describes your primary work?" and routes to mutually exclusive branches with disjoint pain sets. A person genuinely in all three modes cannot answer it.
- **`profiles.md` is on both sides within one file** — it asserts one archetype at L40 and L98, then at L2552 instructs agents that features "MUST serve Tier 1 **ICPs**" (plural, named), and at L48 computes "~40-50%" overlap *between* two of them. Overlap between populations is not a coherent operation on moods of one person.

### Open questions for the operator

These are business decisions. Each is stated with the options and what each implies; none has been decided here.

**O1 — Is the durable primary ICP infra-oriented or explicitly not?**
The two documents disagree on the defining trait, and it is not a wording gap.
- `primary_icp.md:44`, `:259` — "Comfortable with infrastructure-level abstractions", reads API docs.
- `developer_release_targeting.md:25` — "Technically fluent but **not infra-oriented**… would not write one from scratch."

*Implications:* the first calls for evaluation-grade guarantee documentation and API surface (`profiles.md:318`); the second calls for one-line install and zero-config (`profiles.md:317`). Different install path, different docs investment, and per `profiles.md:270` different activation friction. `developer_release_targeting.md` self-scopes as temporal, so one reading is "this is the first-five wedge, not the durable ICP" — but nothing in either document says that, and it is the document driving actual GTM execution.

*Recommendation:* treat the not-infra-oriented person as the **developer-release wedge** and the infra-comfortable person as the **durable ICP**, and state that explicitly in both documents. Not applied here because it changes GTM targeting, which is the operator's call.

**O2 — Does the revenue model depend on a buyer the targeting doc excludes?**
- `primary_icp.md:160`, `:176` — team plans at €500–€2,500/mo "drive majority of revenue by M12"; the individual plan is the activation channel.
- `developer_release_targeting.md:64` — "**Not enterprise buyers:** They find Neotoma, try it on a weekend, and either adopt it or don't."
- `secondary_icps.md:63` — organizational entry "requires team-plan packaging, SSO posture, and procurement signals beyond the developer release."

*Implications:* if team revenue is the plan, SSO and procurement are on the roadmap and are not in the Tier-1 requirement set (`profiles.md:329–337` lists none). If they are not, the M12 revenue model needs restating.

**O3 — The shipped attestation and grants surface has no buyer in the market ICP.**
`icp_from_functionality.md:69` observes that hardware-attested agent identity, trust tiers, agent grants, and per-write attribution are "disproportionate investments unless the intended operator runs untrusted or third-party agents". `icp_reconciliation.md:44` notes the market materials treat this "only obliquely" — and the nearest named party, identity vendors, is *disqualified for conversion* at `primary_icp.md:279` (D3).

*Implications:* a substantial shipped surface either serves a secondary ICP nobody has written down, or it was overbuilt for the stated ICP. `icp_reconciliation.md:69` already recommended adding this secondary; the follow-up was never implemented (`secondary_icps.md:12` still carries only the recommendation, with no such section among its four).

**O4 — Hosted vs. zero-install is stated inconsistently in currently-live public docs.**
- `README.md:200` — not aimed at "users who need a zero-install hosted product"; `icp_from_functionality.md:85–86` — excludes "Teams wanting a managed multi-tenant SaaS today".
- `README.md:190` — hosted multi-user mode ships today, with Docker and Fly deploy targets.

Both are defensible (self-hosted multi-user is not managed SaaS), but read side by side they look contradictory in the two most public documents.

### Unimplemented follow-ups inherited from `icp_reconciliation.md`

Recorded here so they are not lost a second time:

1. Add the security-operator secondary ICP to `secondary_icps.md` — **not done**; only a recommendation blockquote at `secondary_icps.md:12`. (Same as O3.)
2. Note the federated multi-device/small-group tertiary in `future_icps.md` — **not done**; zero matches in that file.

### Referential defects found while auditing

- `primary_icp.md:591–597` lists "Required Co-Loaded Documents" and **omits `icp_from_functionality.md` and `icp_reconciliation.md`** — so an agent following its own load instructions never loads the document declared canonical.
- Neither `docs/foundation/product_positioning.md` nor `docs/foundation/problem_statement.md` referenced `icp_from_functionality.md`; `product_positioning.md` now points here.
- `profiles.md:693` references "Agent System Builders (profile #2 above)", a numbering scheme that no longer exists after the one-archetype rewrite.
