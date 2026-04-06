# Developer Release Targeting

Release-scoped targeting, activation risks, and status tracking for the developer release. This document is temporal — it will evolve or be replaced as the product moves past the developer release phase.

**Parent doc:** [`primary_icp.md`](./primary_icp.md) (durable ICP definition)
**Exit criteria:** [`general_release_criteria.md`](./general_release_criteria.md) (readiness gates for transitioning to general release)

---

## First Five Adopters

The immediate developer release target is a subsegment of the primary ICP archetype: technically fluent operators who feel the pain of ad-hoc agent memory but lack the appetite or capacity to build their own state infrastructure.

### Key characteristics

- **Technically fluent but not infra-oriented.** Comfortable with APIs, CLIs, and agent workflows. Would install an npm package and configure an MCP server; would not write one from scratch. Energy goes toward the thing they're building, not the tooling underneath it. Typical roles: product-minded solo founders, indie hackers, AI-native consultants/freelancers, senior ICs.

- **Already feeling the pain but patching around it.** Managing state across markdown files, a growing CLAUDE.md, maybe a Notion database they know is a dead end. Absorbing the tax through re-prompting, manual context management, and tolerating drift. Haven't hit the breaking point of building custom infra — they're living with the mess.

- **Moving toward autonomy but not there yet.** Want to give agents more latitude — longer sessions, less supervision, maybe a second agent — but don't fully trust the setup. The trust gap isn't about LLM capability; it's about not having a reliable record of what the agent did and what state it left behind.

- **Values transparency and control over magic.** Allergic to opaque native memory. Their alternative isn't "I'll build my own" — it's "I need something I can inspect and own." Open source matters. Local-first or self-hosted matters.

### Sharpest filter

Would they describe "setting up Neotoma" as a worthwhile Saturday project, but "building their own state layer" as a distraction from real work?

### Activation moments (in order of motivational force)

1. **Corrupted state (strongest):** Agent made a bad decision based on wrong, stale, or hallucinated state, and the user didn't catch it until real damage occurred. Fear of silent failure is a much stronger motivator than convenience for adopting infrastructure with integrity guarantees.

2. **Missing context (most common):** User tries to do something cross-session or cross-agent and realizes context is gone. Annoying and wasteful but survivable.

The first five may not be the most frustrated people — they may be the ones who've been **burned**. A concrete loss event is a conversion event, not a gradual migration.

### Who they are NOT

- **Not capable DIY builders:** Power users who build their own MCP + Postgres stack. These are later adopters — once Neotoma is proven enough that DIY feels like wasted effort. (See D12 in primary ICP disqualification criteria.)
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

**GTM line:** Start with personal agentic OS builders/operators; expand to toolchain integrators and B2B-by-vertical as personal adoption creates team demand; defer knowledge workers and small teams until post-dev release.

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

1. All developer release decisions must serve the first-five adopter subsegment
2. First-five targeting distinguishes capable DIY builders (later adopters) from off-the-shelf adopters (immediate target)
3. Activation materials must address all four risk classes, with priority on cognitive cold-start and prior bad experience
4. Messaging connects chronic tax (convenience) to acute crisis (corrupted state)
5. Non-goals are respected — do not expand targeting beyond the developer release scope
