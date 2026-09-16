---
title: ICP Reconciliation
summary: How the first-principles functional ICP relates to the existing market-derived ICP materials, with agreements, gaps, and the canonical/visibility decisions applied.
category: use_cases
subcategory: icp
audience: developer
visibility: public
order: 6
tags: [icp, reconciliation, positioning]
---

# ICP Reconciliation

This document reconciles two independently-derived views of who Neotoma is for:

- **[ICP from functionality](icp_from_functionality.md)** (functional view): derived only from a first-principles audit of what the code does.
- **The existing ICP materials** (market view): `primary_icp.md`, `secondary_icps.md`, `future_icps.md`, `profiles.md`, `developer_release_targeting.md`, `general_release_criteria.md`, `prioritized_pain_points_and_failure_modes.md`, `qualification_survey.md`. These are derived from market research, topology analysis, and go-to-market strategy (TAM, channels, business model). Most are now marked `visibility: internal` (see "Visibility decision" below).

> **Update, 2026-09-15 — the O1 durable-ICP decision, reconciled against this document rather than re-deciding it.** The canonical roles assigned below still stand and are not reopened: `icp_from_functionality.md` remains the public statement, the market docs remain internal, and this document remains the bridge. What the O1 decision changed is a claim *inside* the agreement table, not the role assignment.
>
> The table's "Disposition" row recorded both views as agreeing on *"comfortable with infrastructure-level abstractions."* The operator has ruled that the durable ICP is the person who feels the pain of ad-hoc agent state and **will not build their own state infrastructure**; the infrastructure builder is an early-adopter cohort. That row is corrected below, and it is the only row affected.
>
> **This does not weaken the reconciliation's central finding.** The two views were derived from different inputs and still name the same buyer. The disposition row was the one place where both views had inherited the same wrong inference — that because the install path was infrastructural, the user must be too. That is an inference about the delivery mechanism, not about the person, and the functional audit could not have distinguished the two: code can show that install is CLI-driven, but it cannot show whether that is the intended audience or an unfixed defect. Correcting it in both views simultaneously is a reconciliation, not a new divergence.

The two views were produced from different inputs and they agree on the core. That agreement is a useful signal: the audience the market research targets is the same audience the code actually serves.

> **This document reconciles the functional and market views. It does not reconcile the market documents against each other** — which is where the remaining contradictions live, and which [`README.md`](README.md), the internal ICP index, does. Start there for the per-surface noun table, the retired and mapped informal buyer synonyms, and the open disagreements that need an operator decision. The conclusions below stand unchanged.

## Agreement on the primary ICP

Both views name the same primary archetype, the person who builds and operates agents:

| Aspect | Functional view | Market view (`primary_icp.md`) |
| --- | --- | --- |
| Who | Developers building and operating AI agents who need a shared, deterministic, auditable memory layer (at personal scale, one individual) | "Personal Agentic OS Builders/Operators" constructing an OS for their own agents across life and work |
| Modes | Operator, builder, and debugger are modes of one person | "Three modes, not separate personas": infrastructure engineering, building agent systems, operating across tools |
| Tools | Claude Code, Cursor, ChatGPT, Codex, and others, wired together | Same multi-agent stack |
| Core pain | Memory does not carry over; facts conflict; corrections do not stick; no audit trail | Chronic "sync tax" plus acute "agent acted on bad state" |
| Disposition | Technically fluent about state; wants to own the data, not the plumbing | Same — "technically fluent without being infrastructure-oriented" (revised 2026-09-15 per O1; previously "comfortable with infrastructure-level abstractions" in both columns) |

The functional audit independently confirms the market archetype. No contradiction exists on the primary ICP.

## Agreement on secondary ICPs and exclusions

- **Developers building on a state layer** (functional secondary) maps to **Toolchain Integrators** and the **Internal-Tools Engineer at a model lab** (market secondaries): both are downstream of primary-ICP validation and build on Neotoma's API surface and guarantees.
- **Exclusions match.** The functional view's "not for casual note-taking / PKM / hosted-chat users" matches the market view's explicitly "Not Pursued" AI-for-Management-Work cohort and the "Not for" list in the README.
- **One exclusion was wrong in every view and has been corrected in all of them (2026-09-15).** All three surfaces — `icp_from_functionality.md`, `primary_icp.md` (D4), and the README — excluded people who "need zero-install onboarding." Under O1 that line disqualified the actual buyer. Each now excludes only the durable boundary: a prospect who requires that nothing run on their own machine. The agreement between the views is preserved because the correction was applied to all of them in one pass; a partial fix would have created a real contradiction where none existed.

## Net-new from the functional audit

The functional audit surfaces two audiences the market materials under-name. Both are recommendations to fold back into the market view.

1. **Security-conscious operator of a multi-agent fleet.** The code invests heavily in attested agent identity (Apple Secure Enclave, TPM 2.0, WebAuthn, YubiKey, Windows TBS), agent grants and capabilities, trust tiers, attestation revocation, and a per-write provenance chain. This is disproportionate unless an intended user runs untrusted or third-party agents and must constrain and audit them. The market materials treat this only obliquely (the "Identity-Vendor Person-Server Builders" partnership target, and "enterprise buyers demanding audit trails" as an expansion signal). Recommendation: name the security-operator as a first-class secondary ICP in `secondary_icps.md`, since the product already builds for it.

2. **Federated multi-device / small-group sharing.** Peers, conflict resolution, subscriptions, and the canonical mirror support sharing memory across instances and devices. The market materials do not name this. Recommendation: track as an emergent tertiary ICP.

## Differences in kind (not conflicts)

- The market materials carry strategy the code cannot reveal: TAM and topology-stage sizing, channel priorities, business-model and pricing mechanics, and B2B pull-through. The functional ICP deliberately omits these because they are not derivable from functionality. The two are complementary layers, not competing claims.
- The functional view frames the privacy-focused individual as a distinct secondary; the market view folds that motivation into the primary "personal OS builder." This is an emphasis difference, not a conflict.

## Canonical roles

- **Public, functionally-grounded statement of who Neotoma is for:** [`icp_from_functionality.md`](icp_from_functionality.md). This is what the README links to and what belongs in the public "Use Cases > Ideal Customer Profiles" surface.
- **Internal market and go-to-market depth:** `primary_icp.md`, `secondary_icps.md`, `profiles.md`, and the rest. These remain the source of truth for strategy, sizing, and channels, and are kept internal.
- **This document** is the bridge between the two and the record of the reconciliation.

## Visibility decision applied

The existing ICP strategy docs previously carried no `visibility` frontmatter, so they defaulted to `public` and rendered in the in-app `/docs` browser (including a ~180KB `profiles.md` of detailed personas and a `business_model` link). That exposed internal go-to-market strategy publicly. As part of this reconciliation, the following are now marked `visibility: internal`:

- `primary_icp.md`, `secondary_icps.md`, `future_icps.md`, `profiles.md`, `developer_release_targeting.md`, `general_release_criteria.md`, `prioritized_pain_points_and_failure_modes.md`, `qualification_survey.md`.

`icp_from_functionality.md` and this reconciliation doc remain `public` so the "Use Cases > Ideal Customer Profiles" surface still has a clean, public ICP. The change is metadata-only and reversible per file; revert any file by removing or flipping its `visibility` frontmatter.

## Recommended follow-ups for the market materials

0. **(New, 2026-09-15)** `profiles.md` (~2,500 lines) has not been audited against the O1 decision. Its persona narratives, pricing tiers, and buyer nominations were written when the archetype was infrastructure-oriented, and some of them almost certainly still describe that person as the buyer. It was left unmodified in this pass deliberately: rewriting persona narratives is a market-research judgement, not a mechanical propagation of a ruling. Treat it as the largest known unreconciled surface.

1. Add the security-operator secondary ICP to `secondary_icps.md`, grounded in the attestation/grants/provenance functionality.
2. Note the federated multi-device/small-group tertiary in `future_icps.md`.
3. Keep `icp_from_functionality.md` in sync when major capabilities ship that shift who the product serves.
