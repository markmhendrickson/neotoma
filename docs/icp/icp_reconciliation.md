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

The two views were produced from different inputs and they agree on the core. That agreement is a useful signal: the audience the market research targets is the same audience the code actually serves.

## Agreement on the primary ICP

Both views name the same primary archetype, the person who builds and operates agents:

| Aspect | Functional view | Market view (`primary_icp.md`) |
| --- | --- | --- |
| Who | Developers building and operating AI agents who need a shared, deterministic, auditable memory layer (at personal scale, one individual) | "Personal Agentic OS Builders/Operators" constructing an OS for their own agents across life and work |
| Modes | Operator, builder, and debugger are modes of one person | "Three modes, not separate personas": infrastructure engineering, building agent systems, operating across tools |
| Tools | Claude Code, Cursor, ChatGPT, Codex, and others, wired together | Same multi-agent stack |
| Core pain | Memory does not carry over; facts conflict; corrections do not stick; no audit trail | Chronic "sync tax" plus acute "agent acted on bad state" |
| Disposition | CLI-comfortable, infrastructure-level | "Comfortable with infrastructure-level abstractions" |

The functional audit independently confirms the market archetype. No contradiction exists on the primary ICP.

## Agreement on secondary ICPs and exclusions

- **Developers building on a state layer** (functional secondary) maps to **Toolchain Integrators** and the **Internal-Tools Engineer at a model lab** (market secondaries): both are downstream of primary-ICP validation and build on Neotoma's API surface and guarantees.
- **Exclusions match.** The functional view's "not for casual note-taking / PKM / hosted-chat users" matches the market view's explicitly "Not Pursued" AI-for-Management-Work cohort and the "Not for" list in the README.

## Net-new from the functional audit

The functional audit surfaces two audiences the market materials under-name. Both are recommendations to fold back into the market view.

1. **Security-conscious operator of a multi-agent fleet — RECOMMENDATION WITHDRAWN (O3, 2026-09-16).** The code invests heavily in attested agent identity (Apple Secure Enclave, TPM 2.0, WebAuthn, YubiKey, Windows TBS), agent grants and capabilities, trust tiers, attestation revocation, and a per-write provenance chain. The original recommendation here was to name the security-operator as a first-class secondary ICP in `secondary_icps.md`, on the reasoning that the product already builds for it. **That recommendation is withdrawn and must not be executed.**

   The reasoning was a functional inference, and this is the case where it fails. A functional audit reads investment and infers an intended buyer — but investment can also be infrastructure the product needs in order to keep its own promises, with no buyer behind it at all. The evidence says it is the latter here: the nearest named party is *disqualified* at [`primary_icp.md`](./primary_icp.md) D3 ("building their own state layer as a product"), and the durable-ICP decision sharpens the mismatch rather than resolving it — the buyer who will not build their own state infrastructure is a *less* natural fit for a hardware-attestation surface than the infrastructure builder was. Naming a secondary ICP whose only evidence is a code investment would have manufactured a segment from a build decision.

   **Correct disposition:** the attestation and capability-grants surface is **infrastructure, not a sold feature** — see [O3 — the attestation and capability-grants surface](#o3-the-attestation-and-capability-grants-surface-is-infrastructure) below.

2. **Federated multi-device / small-group sharing.** Peers, conflict resolution, subscriptions, and the canonical mirror support sharing memory across instances and devices. The market materials do not name this. Recommendation: track as an emergent tertiary ICP.

## O3 — the attestation and capability-grants surface is infrastructure

**Resolved 2026-09-16.** The shipped attestation and capability-grants surface — hardware-attested agent identity (Apple Secure Enclave, TPM 2.0, WebAuthn/FIDO2, YubiKey, Windows TBS), trust tiers, attestation revocation, per-agent least-privilege grants, and per-write attribution — **serves the product's own guarantees. It is not a feature to market or sell.**

### What was open

The surface is built and shipped, and no ICP wanted it. The nearest named buyer is *disqualified*: [`primary_icp.md`](./primary_icp.md) D3 rules out those "building their own state layer as a product", which is where identity vendors and auth-protocol authors land — they are partnership and integration targets, not conversion targets. The durable-ICP decision (2026-09-15) **sharpened** this rather than resolving it: a buyer defined by not wanting to own state infrastructure is a less natural fit for a hardware-attestation surface than the infrastructure builder it replaced.

### The resolution

The surface exists because Neotoma's core claims require it, not because a segment asked for it. Authority over agent-generated state means being able to say *who wrote this, under what authority, and what were they permitted to do* — and the attestation and grants machinery is what makes that answerable rather than asserted. It is load-bearing for provenance and attribution, which are guarantees, and guarantees are not features.

**Consequences:**

- **It stops being marketed.** No positioning document, tagline, feature list, or value proposition leads with attestation, hardware keys, or capability grants.
- **It stops being sold.** No pricing tier, plan, or packaging line item is built around it, and no segment is named whose stated reason to adopt is this surface.
- **It stays fully documented.** Developer reference, operator guides, the Inspector surface, and the `/aauth` reference pages are unaffected and should stay thorough. Demoting a feature is not hiding it — an architecture-revealing product documents its machinery.
- **It may be cited as evidence for a guarantee.** Saying "every write is attributed, and here is the mechanism" is a guarantee claim supported by infrastructure. Saying "buy Neotoma for hardware-attested agent identity" is a feature claim with no buyer.

### Why this costs something if left unresolved

Marketing a feature with no buyer is not free. Every surface it appears on spends positioning clarity — the scarce thing — on a claim that converts nobody, and it dilutes the claim that does convert. It also invites the wrong comparison set: a product that leads with attestation is read against identity and auth vendors rather than against the alternatives its actual buyer is weighing. The cost is paid on every surface, every time, which is why the demotion is stated as a rule rather than handled case by case.

### Note on the method

This is the case that marks the limit of inferring an ICP from functionality. A functional audit reads what the code invests in and infers an intended user. That inference is sound when the investment exists *for* someone, and unsound when the investment exists to keep a promise. Where the two are indistinguishable from the code alone, the market evidence decides — and here it decided against a buyer. See the withdrawn recommendation under [Net-new from the functional audit](#net-new-from-the-functional-audit).

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

1. ~~Add the security-operator secondary ICP to `secondary_icps.md`, grounded in the attestation/grants/provenance functionality.~~ **Withdrawn (O3, 2026-09-16)** — see above. Do not add this profile; the surface is infrastructure, not a segment to sell to.
2. Note the federated multi-device/small-group tertiary in `future_icps.md`.
3. Keep `icp_from_functionality.md` in sync when major capabilities ship that shift who the product serves.
