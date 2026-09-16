---
title: "Developer Release Targeting"
summary: Internal release-scoped ICP targeting, activation risks, and status tracking.
category: use_cases
subcategory: icp
audience: developer
visibility: internal
---

# Developer Release Targeting

Release-scoped targeting, activation risks, and status tracking for the developer release. This document is temporal — it will evolve or be replaced as the product moves past the developer release phase.

**Parent doc:** [`primary_icp.md`](./primary_icp.md) (durable ICP definition)
**Exit criteria:** [`general_release_criteria.md`](./general_release_criteria.md) (readiness gates for transitioning to general release)

> **O1 decision, 2026-09-15 — this document's buyer became the durable ICP.** The "First Five Adopters" description below was written as a narrower wedge inside `primary_icp.md`'s broader archetype. The operator has ruled the opposite way: **this buyer is the durable ICP**, and the infrastructure-oriented archetype `primary_icp.md` previously described is an early-adopter cohort, not the target.
>
> **The parent/child relation is unchanged in direction but changed in substance, and only one document is durable.** `primary_icp.md` remains the parent and remains the single durable ICP definition — the operator's ruling moved the *content* of this section up into it, not the authority. This document did not become durable; it stayed temporal and stopped describing a different person. What it now holds is the **release-scoped** view of that one buyer: who the first five are, what blocks them, and the status of each mitigation. Nothing here defines the ICP. Where this document and `primary_icp.md` describe the buyer, `primary_icp.md` governs.
>
> The characteristics below are preserved rather than rewritten, because they are the source the durable definition was derived from. Read them as evidence for `primary_icp.md`, not as a competing definition.

---

## First Five Adopters

The immediate developer release target is a subsegment of the primary ICP archetype: technically fluent operators who feel the pain of ad-hoc agent memory but lack the appetite or capacity to build their own state infrastructure.

### Key characteristics

- **Technically fluent but not infra-oriented.** Comfortable with APIs, CLIs, and agent workflows. Would install an npm package and configure an MCP server; would not write one from scratch. Energy goes toward the thing they're building, not the tooling underneath it. Typical roles: product-minded solo founders, indie hackers, AI-native consultants/freelancers, senior ICs.

- **Already feeling the pain but patching around it.** Managing state across markdown files, a growing CLAUDE.md, maybe a Notion database they know is a dead end. Absorbing the tax through re-prompting, manual context management, and tolerating drift. Haven't hit the breaking point of building custom infra — they're living with the mess.

- **Moving toward autonomy but not there yet.** Want to give agents more latitude — longer sessions, less supervision, maybe a second agent — but don't fully trust the setup. The trust gap isn't about LLM capability; it's about not having a reliable record of what the agent did and what state it left behind.

- **Values transparency and control over magic.** Allergic to opaque native memory. Their alternative isn't "I'll build my own" — it's "I need something I can inspect and own." Open source matters. Local-first or self-hosted matters.

- **Owns a privacy-compatible LLM access path.** Precondition: Claude Code direct, Cursor, ChatGPT non-enterprise, OR a local LLM with MCP. Enterprise-egress restrictions, cloud-LLM skepticism, and privacy-gating each kill activation independently of Neotoma's own quality. <!-- Backed by ent_81f79780f1fbe679af99da90 (ChatGPT enterprise egress), ent_727fee4a94cfaea86880a0f1 (cloud-LLM skepticism), ent_4f0db2d7f2c349900e4dac2c (local-LLM precondition). -->

### Sharpest filter

Would they describe "setting up Neotoma" as a worthwhile Saturday project, but "building their own state layer" as a distraction from real work?

This filter is now the durable ICP's own test, quoted in [`primary_icp.md`](./primary_icp.md). It was the reasoning the operator accepted in ruling O1: it admits the buyer described here and excludes the infrastructure builder, which is the whole of the distinction.

### Activation moments (in order of motivational force)

1. **Corrupted state (strongest):** Agent made a bad decision based on wrong, stale, or hallucinated state, and the user didn't catch it until real damage occurred. Fear of silent failure is a much stronger motivator than convenience for adopting infrastructure with integrity guarantees.

2. **Missing context (most common):** User tries to do something cross-session or cross-agent and realizes context is gone. Annoying and wasteful but survivable.

3. **Local-LLM compatibility unblocked (privacy-gated cohort):** A privacy-first subsegment gates activation on running Neotoma alongside Ollama, LM Studio, or comparable local LLMs. Until a local-LLM topology and a Neotoma-CLI-without-MCP path are documented, this cohort is structurally blocked from activation regardless of motivational force. Promote local-LLM support from edge case to first-class activation precondition for them. <!-- Backed by ent_4f0db2d7f2c349900e4dac2c, ent_727fee4a94cfaea86880a0f1, ent_81f79780f1fbe679af99da90. -->

The first five may not be the most frustrated people — they may be the ones who've been **burned**. A concrete loss event is a conversion event, not a gradual migration.

### Activation milestones

A first-five activation must clear all of the following, in order:

1. **Install completed on the evaluator's actual machine, unaided, by the intended path.** The milestone is that the evaluator ends with a working, discoverable Neotoma on their own hardware — not that they successfully operated a package manager. The operator has prioritized a **guided installation with branded UI** as that intended path, which changes what this milestone measures.

   - **Intended path (guided install — not shipped as of 2026-09-15).** The evaluator completes installation through a guided flow that makes the decisions it can and surfaces the ones it cannot, and ends knowing where their data lives and which tools can reach it. Success is measured end-to-end, not at the package-manager step, because under the guided path there is no package-manager step the evaluator sees.
   - **Current path (npm and CLI — what is true today).** The prior criteria still apply and still gate today's evaluations: respects their version manager, no global-NPM permission failures, MCP server location is discoverable. <!-- Backed by ent_727fee4a94cfaea86880a0f1, ent_81f79780f1fbe679af99da90, ent_4f0db2d7f2c349900e4dac2c. -->
   - **Both paths.** No enterprise-egress block. Guided install does not remove that constraint, and it is not a Neotoma defect.

   **Guided is not zero-install.** The evaluator still installs software on their own machine and still decides where their data lives; local-first is the architecture, not a delivery detail. Do not describe either path as zero-install.

   A failure at this milestone is a defect in Neotoma's delivery, not a disqualification of the evaluator — see the D4 note in [`primary_icp.md`](./primary_icp.md). The 0/3 round-2 fresh-install result recorded in [`general_release_criteria.md`](./general_release_criteria.md) is the clearest evidence for the guided-install decision, and is why this milestone was rewritten rather than re-measured.
2. **First sustained-write session within 7 days post-install** — agent or user produces a coherent observation batch, not just a smoke-test write.
3. **First unassisted retrieval observation** — the harness surfaces what observations the agent just read, without the evaluator having to inspect storage directly. Read-side opacity is a distinct failure mode from cognitive cold-start and from write-side friction. <!-- Backed by ent_727fee4a94cfaea86880a0f1 (installed-and-bounced on read-side opacity). -->
4. **No synchronous help between install and first sustained write.**

### Who they are NOT

- **Not capable DIY builders:** People who build their own MCP + Postgres stack. Under the O1 decision these are an **early-adopter cohort** — some arrive early because today's install path rewards their skills — but they are not the target, and their adoption is not ICP validation. (See D12 and "Capable DIY builders" in [`primary_icp.md`](./primary_icp.md).)
- **Not autonomous-loop builders on raw provider SDKs:** Builders running fully custom agentic harnesses on raw OpenAI / Anthropic SDKs with self-managed in-loop dedup agents. They engineer around state drift by construction — structured data, in-loop quality control, raw markdown + structured logs — and refuse external substrates on supply-chain grounds. Anti-adopters, not slow adopters. <!-- Backed by ent_75b7d691cd12fb1524ef8b63 (Emil Erkkola). -->
- **Not adjacent platform builders (partnership, not conversion):** Identity vendors, agent-framework maintainers, and auth-protocol authors treat durable user state as part of their own primitive. They are partnership and integration targets — Neotoma should compose under their primitives, not compete with their roadmaps. (Extension of D3.) <!-- Backed by ent_3f183584ebe4b89081cf9f75 (Dick Hardt / Hellō). -->
- **Not "normals":** Not casual ChatGPT users who'd be fine with native memory.
- **Not enterprise buyers:** They find Neotoma, try it on a weekend, and either adopt it or don't.

### How they describe the problem

- "My agent keeps forgetting things"
- "I waste 10 minutes every session re-establishing context"
- "I don't trust my agent to work unsupervised"
- "My system for tracking things is a mess"
- "My agent made a decision based on something that wasn't true anymore"
- "I can't tell if what the agent 'remembers' is real or hallucinated"

The convenience symptoms open the door; the integrity symptoms close the sale.

---

## Activation Risks

Four blocker classes identified from field evidence:

### 1. Cognitive cold-start

"What should I remember?" The agent does not proactively store, and the user does not know what is worth storing.

| Mitigation | Status |
|---|---|
| Agent rules making proactive storage the default | **Done** |
| Priority 1 data stores automatically from day one | **Done** |
| Before/after examples in "what to store" guide | **Pending** |
| Onboarding discovery flow for high-value local files | **Done** |

### 2. UX friction

The product works but the path to working is rough.

| Friction point | Status |
|---|---|
| MCP requires restart after install | **Mitigated** — documented; host-tool limitation |
| Generic error messages | **Pending** |
| No feedback on successful storage | **Pending** |
| Stale data from snapshot inconsistency | **Patched** |
| Duplicate entities from name variations | **Partially addressed** — edge cases remain |

### 3. Trust barrier

Supply chain and dependency security concerns block installation entirely.

| Mitigation | Status |
|---|---|
| Dependency tree audit and CVE patching | **Done** |
| Publish SBOM or dependency audit | **Pending** |
| Surface supply chain posture in install docs | **Pending** |

### 4. Prior bad experience with memory systems

Users who tried fuzzy or native memory and got burned by corrupted state. Their blocker is not onboarding friction — it's generalized distrust of memory systems. They've been told "the agent remembers" before, and the result was silent failures, hallucinated facts, or lossy compression.

| Mitigation | Status |
|---|---|
| Lead messaging with integrity guarantees rather than "memory" framing | **Partially done** — manifest and site use integrity language; onboarding doesn't yet address prior bad experience |
| Guided provenance trace demo in onboarding | **Pending** |
| User-facing comparison: fuzzy memory vs. Neotoma guarantees | **Pending** |
| Language acknowledging the category: "You're right to distrust 'AI memory.' Neotoma is not that." | **Pending** |

### Evidence across risk classes

- **Cognitive cold-start:** Evaluators installed successfully but immediately asked "what counts as a fact worth remembering?" — universal first-session problem.
- **UX friction:** MCP restart requirement discovered during onboarding; stale data and duplicate entities at low capability utilization.
- **Trust barrier:** Evaluator blocked by supply chain security concerns before installing, despite demonstrated need.
- **Prior bad experience:** Evaluator independently building alternative because native memory failed trust test — allergic to opacity and single-tool lock-in.
- **Abandon pattern:** Evaluators who never finished setup; interest reversed only when agent proactively backfilled data.

---

## Non-goals for the Developer Release

- **Casual prompt users** — no memory pain
- **Note-taking / PKM users** — Obsidian/Notion/Roam is the right category
- **Broad productivity audiences** — seeking "AI memory tool" rather than deterministic state layer

---

## Developer Release GTM Summary

**Target:** First five adopters — technically fluent operators who feel the pain but won't build their own state infra.

**Strongest conversion trigger:** Corrupted state (been burned), not just missing context (annoyed).

**GTM line:** Start with personal agentic OS builders/operators; expand to toolchain integrators and B2B-by-use-case as personal adoption creates team demand; defer knowledge workers and small teams until post-dev release.

---

## Agent Instructions

### When to Load

- Planning developer release GTM execution
- Evaluating activation risk mitigations
- Assessing whether a specific user is a first-five candidate
- Tracking release-scoped status items

### Required Co-Loaded Documents

- `docs/icp/primary_icp.md` (always — for durable ICP definition)
- `docs/NEOTOMA_MANIFEST.md` (always)

### Constraints

1. All developer release decisions must serve the first-five adopters, who are the durable ICP scoped to this release — not a subsegment of a different, broader archetype
2. First-five targeting distinguishes capable DIY builders (an early-adopter cohort, not the target) from off-the-shelf adopters (the buyer)
3. This document does not define the ICP. Where it and `primary_icp.md` both describe the buyer, `primary_icp.md` governs
4. Activation materials must address all four risk classes, with priority on cognitive cold-start and prior bad experience
5. Messaging connects chronic tax (convenience) to acute crisis (corrupted state)
6. Non-goals are respected — do not expand targeting beyond the developer release scope
