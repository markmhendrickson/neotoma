---
title: "Secondary ICPs (Adjacent / Later in Dev Release)"
summary: Internal, market-derived secondary ICPs. See icp_from_functionality.md for the functional view and icp_reconciliation.md for the mapping.
category: use_cases
subcategory: icp
audience: developer
visibility: internal
---

# Secondary ICPs (Adjacent / Later in Dev Release)

> Reconciliation: the functional audit once recommended naming a security-conscious multi-agent fleet operator as a first-class secondary ICP here, since the code invests heavily in attested agent identity, grants, and provenance. **That recommendation was withdrawn on 2026-09-16 (O3) and must not be executed.** The attestation and capability-grants surface is infrastructure serving the product's own guarantees, not a feature a segment buys; the nearest named party is disqualified at [`primary_icp.md`](./primary_icp.md) D3. See [ICP reconciliation](icp_reconciliation.md#o3-the-attestation-and-capability-grants-surface-is-infrastructure) and [ICP from functionality](icp_from_functionality.md).

## Scope

Secondary ICPs that are adjacent to the developer release but require more API stability or adoption signal before full engagement. For the primary ICP, see [`primary_icp.md`](./primary_icp.md).

> **Read this document as mostly, but not entirely, forward-looking.** Every entry below except one describes a segment Neotoma expects to engage *later*. The exception is **Infrastructure Builders**, added 2026-09-16, who are **current adopters** — the people actually running Neotoma today. They are placed here because they are no longer the target, not because they are a future segment. The distinction is load-bearing and is restated in that section.

---

## Infrastructure Builders (Candidate A) — **current adopters, not a future segment**

*Added 2026-09-16, following the durable-ICP decision of 2026-09-15.*

> **Read this entry differently from every other entry in this document.** The rest of this file describes segments Neotoma expects to engage *later*. This one describes the people using Neotoma **today**. They moved here because they stopped being the target, not because they are ahead of us on a timeline. Nothing here should be read as "when we get to them" — we are already there, and they are already here.

- **Summary:** The technically strong individual who builds their own infrastructure. Reads Python, mints keypairs, adapts daemons, and would be entirely capable of assembling a state layer of their own — and in many cases already has, in the form of a custom MCP plus Postgres, homegrown validation, or a maintained pile of structured files.
- **Who they are:** The archetype `primary_icp.md` was written around before 2026-09-15: at home in terminals, config files, and environment variables; comfortable reading source to answer a question the docs do not.
- **Current pain:** The same pain the durable ICP has — ad-hoc agent state, drift, unreproducible decisions — with the crucial difference that they have the capacity to build around it, and often do.
- **Why they are not the target:** The sharpest filter, first written in [`developer_release_targeting.md`](./developer_release_targeting.md), asks whether someone would describe *setting up Neotoma* as a worthwhile Saturday project but *building their own state layer* as a distraction from real work. This cohort fails the second half. The alternative they weigh Neotoma against is their own weekend, which is why appetite to build is the single trait most predictive of non-adoption — recorded as soft disqualifier **D12** in [`primary_icp.md`](./primary_icp.md).
- **Why they are nonetheless who is here now:** The shipped install path — npm plus the CLI — rewards precisely their skills. They are over-represented among current adopters because the delivery mechanism selects for them, not because the product is for them. Field evidence sharpens the point: `general_release_criteria.md` records 0 of 3 round-2 fresh-install attempts clearing the install-path gate, all by evaluators who wanted the product.

### How to read evidence from this cohort

This is the part that matters operationally, and it is easy to get wrong in both directions.

- **Strong evidence about architecture and correctness.** They independently arrive at the same conclusions the design did — schema constraints, deterministic validation, multi-agent review hooks. That convergence is the most useful thing they give us and is worth soliciting deliberately. Listen to them closely on whether the guarantees hold.
- **Weak evidence about the market.** Their adoption does not validate the ICP, their enthusiasm does not size a segment, and their tolerance for install friction says nothing about whether the durable ICP will tolerate it. **Do not read adoption by this cohort as ICP validation.**
- **Retention reads in a specific way.** One who churns is telling you about maintenance burden. One who stays is *not* telling you the ICP is right.
- **They must not pull the roadmap.** Targeting, onboarding, and roadmap decisions do not optimize for this cohort. Narrowing toward whoever survives the install path is the anti-pattern — it selects for exactly this group and calls the result product-market fit.

### Why here rather than in `primary_icp.md`

`primary_icp.md` is about **one buyer**, and keeping it that way is the point of the durable-ICP decision. This cohort is real, present, and worth serving well — but they are not that buyer, and describing them at length in the primary document would re-blur the line the decision drew. [`primary_icp.md`](./primary_icp.md) retains the short boundary statement that names them and points here; the full treatment lives in this file.

### Relationship to primary ICP

They are the durable ICP's *neighbour*, not its predecessor — the same pain, a different answer to it. The durable ICP patches around the problem and will not build the fix; this cohort builds the fix. That single difference is what separates a buyer from a validator, and it is why the two cannot be collapsed into one profile.

---

## Toolchain Integrators

- **Summary:** Framework and devtool authors who would add Neotoma as a recommended or default memory backend for downstream builders.
- **Who they are:** Maintainers of agent frameworks, orchestration libraries, editor plugins, deployment platforms
- **What they build:** Developer tools, SDKs, and frameworks consumed by Agent System Builders and AI Infrastructure Engineers
- **Where they sit in the stack:** Middleware / framework layer — between infrastructure and application builders
- **Current pain:** Existing memory adapters lack state guarantees; downstream builders report drift and inconsistency; no standard for deterministic agent state
- **Adoption trigger:** Need to provide deterministic state as a built-in or recommended dependency for their user base
- **Why Neotoma:** Open-source, MIT-licensed, well-defined API surface. Deterministic guarantees can be documented and passed through to downstream builders.
- **Comparison set:** Memory adapters, plugin ecosystems, state layer abstractions, built-in memory modules in competing frameworks
- **How to reach them:** Direct outreach to framework maintainers; GitHub issues and PRs on agent frameworks; integration guides and examples; conference talks on state integrity
- **Success signals:** Evaluate API stability; request integration docs; list Neotoma as a supported memory backend; co-author integration guides

### Why secondary

- Framework authors need more API stability than the developer release initially provides
- Adoption depends on primary ICP builders validating the API surface first
- High leverage once adopted (one integration reaches many downstream builders) but slower activation cycle

### Relationship to primary ICP

Toolchain adoption is a downstream effect of primary ICP validation. When personal agentic OS builders standardize on Neotoma and reference its guarantees, framework maintainers see adoption signal. The primary ICP's recommendation creates the toolchain integrator's evaluation context.

---

## Internal-Tools Engineer at Agentic-Native Model Lab

<!-- Backed by ent_9c8c955b2fd4afbdad398d0c -->

- **Summary:** Internal-tools / business-tech engineer at a model-lab or agentic-native company, building bespoke agentic tooling for internal functions (legal, recruiting, account executives, exec teams) using pre-release internal models.
- **Who they are:** Engineers embedded in business-technology or internal-tools organizations at frontier model labs and agentic-native companies; operate 6-12 months ahead of public tooling availability
- **What they build:** Bespoke internal agents and workflows that span multiple internal systems and user populations; treat agents as production substrate rather than experiments
- **Where they sit in the stack:** Application / internal-product layer atop privileged access to unreleased models and tools
- **Current pain:** Multi-tool state problem at organizational scale; agents-as-builders increase build-vs-buy pressure on internal infra; durable state and provenance become bottlenecks as agentic-native tooling lands across departments
- **Adoption trigger:** Need to ship deterministic state substrate across internal agentic tools without waiting for public memory-vendor maturity; cultural cover to deploy internal infra fast
- **Why Neotoma:** Same Tier 1 builder archetype as the primary ICP, but the entry vector is organizational rather than personal. Open-source posture and deterministic guarantees compose with pre-release internal models; team-plan ACV from day one.
- **Representative signal:** ent_9c8c955b2fd4afbdad398d0c
- **Comparison set:** Internal-only memory layers built by adjacent teams; ad-hoc vector stores; bespoke per-tool state; build-vs-buy decisions on internal infra
- **How to reach them:** Direct outreach to business-tech / internal-tools engineering at model labs and agentic-native companies; reference architectures for internal multi-agent state; build-vs-buy framing in technical content
- **Success signals:** Pilot in one internal function; expand across adjacent internal tools; convert to team plan; reference architecture published or shared internally

### Why secondary

- Organizational entry requires team-plan packaging, SSO posture, and procurement signals beyond the developer release
- Pre-release model dependency means the surrounding tool stack is in flux; integration targets shift faster than the public toolchain
- High-ACV variant of the Tier 1 archetype but slower activation cycle due to internal-procurement and cross-team coordination

### Relationship to primary ICP

Same builder archetype as the primary ICP. The entry vector differs: instead of a personal agentic OS builder adopting Neotoma for their own toolchain, an internal-tools engineer adopts Neotoma as the durable-state substrate for tools that serve their organization. Validation from this archetype produces team-plan revenue earlier than the personal-builder path and supplies organizational case studies that accelerate primary-ICP conversion.

---

## Identity-Vendor Person-Server Builders (Partnership Target)

<!-- Backed by ent_3f183584ebe4b89081cf9f75 -->

- **Summary:** Capable peer builders shipping per-user / per-agent identity and durable-state primitives (e.g. Hellō, plausible alumni of Okta / Auth0 / Clerk / Stytch). Treated as partnership and integration targets, not as conversion targets.
- **Who they are:** Identity-protocol authors and person-server builders shipping auth and per-agent identity primitives alongside durable-user-state surfaces
- **What they build:** Person servers, per-agent identity protocols (AAuth-style, OIDC extensions), durable user-state surfaces that overlap Neotoma's substrate
- **Where they sit in the stack:** Identity / per-user state layer beneath agentic application builders
- **Why partnership not conversion:** They have built or are building their own durable-user-state surface as part of their identity primitive. Converting them is structurally hard and not the leverage point; composing under their identity primitives is.
- **Representative signal:** ent_3f183584ebe4b89081cf9f75
- **Adoption trigger:** Need to compose Neotoma's deterministic state substrate beneath their identity / person-server primitives without forcing customers to choose between the two
- **How to reach them:** Protocol-level coordination on per-agent identity (AAuth, OIDC); reference integrations; co-published guidance on identity-plus-state composition
- **Success signals:** Joint reference architecture; co-authored integration spec; their customers adopting Neotoma as the state substrate beneath their identity layer

### Why secondary

- Partnership targets sit outside the developer-release conversion funnel
- Coordination occurs at protocol and architecture level rather than at install / activation level
- Long activation cycle; high leverage when achieved

### Relationship to primary ICP

Identity-vendor person-server builders are infrastructure peers, not ICP conversions. Their customers — application builders consuming their identity primitives — are downstream conversion candidates for Neotoma when both layers compose cleanly. The composition story strengthens Neotoma's positioning as the State Layer beneath identity and orchestration primitives rather than as a competitor to them.

---

## AI-for-Management-Work Users (Not Pursued)

<!-- Backed by ent_81f79780f1fbe679af99da90 -->

- **Summary:** ChatGPT / Claude Projects heavy users whose pain is voice and output consistency across long-running chats, not deterministic state across agents and tools. Adjacent demand, not Neotoma's lane.
- **Who they are:** Management, consulting, and knowledge-work users who run extended conversations with hosted assistants for drafting, planning, and decision support
- **What they build:** Not building software systems; producing documents, decisions, and management artifacts through assistant conversations
- **Where they sit in the stack:** End-user of hosted chat assistants; no agent-orchestration layer beneath them
- **Current pain:** Voice drift, output inconsistency, repeated re-priming of context across long-running chats — perceived as a quality and consistency problem, not as a state-integrity problem
- **Representative signal:** ent_81f79780f1fbe679af99da90
- **Why not pursued:** Pain shape does not match Neotoma's substrate. They lack the agent-fleet / multi-tool surface where Neotoma's determinism and provenance produce leverage. Solving voice consistency in hosted chat is a different product.

### Why secondary

- Adjacent demand cluster surfaced by primary-ICP signal sources, worth naming so it is not mistaken for ICP
- Conversion path would require a product surface Neotoma does not ship and should not ship in the developer release
- Reactivation possible only if these users transition into agent-builder or agent-operator roles

### Relationship to primary ICP

Surfaces in evaluator conversations because primary-ICP candidates frequently know or work alongside heavy hosted-chat users. Naming this cohort explicitly prevents pain-confidence inflation from mis-coded signals where voice-drift complaints get aggregated with state-drift complaints.

---

## Agent Instructions

### When to Load This Document

Load when:
- Evaluating toolchain integration opportunities
- Planning framework partnerships or integration guides
- Assessing API stability requirements for third-party adoption
- Evaluating internal-tools / business-tech engineering archetypes at model labs and agentic-native companies
- Coordinating with identity-vendor / person-server peers on composition rather than conversion
- Classifying adjacent demand clusters (e.g. AI-for-management-work) that should not be mistaken for ICP

### Required Co-Loaded Documents

- `docs/icp/primary_icp.md` (for primary ICP context)
- `docs/NEOTOMA_MANIFEST.md` (always)

### Constraints

1. Toolchain integrator features require API stability milestones beyond initial developer release
2. Do not prioritize toolchain integrator needs over primary ICP needs
3. Toolchain adoption is a downstream signal, not a primary acquisition target
