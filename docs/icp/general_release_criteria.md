---
title: "General Release Readiness Criteria"
summary: Internal readiness criteria tied to ICP adoption milestones.
category: use_cases
subcategory: icp
audience: developer
visibility: internal
---

# General Release Readiness Criteria

Criteria for exiting the developer release and entering general release. The developer release exists to validate architecture, ICP, and activation path. General release means Neotoma can sustain unassisted discovery, adoption, and retention at scale.

**Related docs:** [`primary_icp.md`](./primary_icp.md) (durable ICP definition) · [`developer_release_targeting.md`](./developer_release_targeting.md) (dev release targeting and activation risks) · [`adopter_dependency_commitments.md`](../foundation/adopter_dependency_commitments.md) (the orthogonal _dependency-safety_ lens — stability/governance/exit commitments an adopter holds us to, distinct from the go-to-market readiness gates here)

> **Guided-install decision, 2026-09-15 — what it changes here.** The operator has prioritized a **guided installation with branded UI** as the intended onboarding path, in place of expecting the buyer to install via npm/CLI or to onboard through their own harness. Three things in this document were written around the npm path and are revised below: Gate 3(a) and (c), and the `gate4_install_path_friction` sub-gate. **What does not change:** the gates are outcome gates — they measure whether a person reached sustained usage unaided — and that outcome is path-independent. The thresholds are not lowered because the path got easier; if guided install ships and the gates still fail, the gates were right. **Honest status:** guided install is not shipped as of this revision. Every gate below is still measured against the npm/CLI path today, and the guided-path wording takes effect when that path exists. Guided install is also not zero-install — the user still installs on their own machine — so nothing here should be read as a hosted or no-install claim. See [`developer_release_targeting.md`](./developer_release_targeting.md) activation milestone 1.

> **Two lenses, not one.** This document is the _go-to-market_ readiness gate (can Neotoma sustain unassisted adoption at scale?). It is distinct from [`adopter_dependency_commitments.md`](../foundation/adopter_dependency_commitments.md), the _dependency-safety_ bar (is it safe for an external product to build on the substrate?). A version can satisfy one before the other; they are tracked separately on purpose.

---

## What the Developer Release Validates

Three questions the developer release must answer before general release is warranted:

1. **Does the architecture hold?** The guarantees (append-only, schema-constrained, provenance-traced) work under real usage without integrity failures.
2. **Is the ICP correctly identified?** The people we built for actually adopt, retain, and expand usage.
3. **Is the activation path viable?** People can go from discovery to sustained usage without direct intervention.

General release readiness means sufficient evidence on all three.

---

## Readiness Gates

### Gate 1: Adoption evidence

**Threshold:** 5+ genuinely active users who have reached the expansion stage of the adoption funnel.

**"Active" defined as:**

- Observations being stored weekly
- 3+ entity types in use (beyond default auto-stored types)
- No reversion to workarounds (markdown files, Notion, manual re-prompting for domains Neotoma covers)

**What this proves:** The ICP is real and the product delivers value without the founder compensating for gaps.

**Status:** [ ] Met / [ ] Not met

### Gate 2: Retention evidence

**Threshold:** 3+ of the active users from Gate 1 have sustained usage for 4+ weeks without observation plateau or workaround reversion.

**What this proves:** The value prop is durable, not just a novelty activation. Short-term activation proves onboarding works; sustained retention proves the product earns its place in the user's daily workflow.

**Warning sign:** If everyone activates but churns by week 3, you have an activation success and a retention problem — not ready for general release.

**Status:** [ ] Met / [ ] Not met

### Gate 3: Unassisted activation

**Threshold:** 2+ users have gone from discovery to active usage without direct intervention, where each user satisfies all three of the following:

- **(a) Install completed on the evaluator's actual machine, by whichever path the product offers them** — not a screen-share over the founder's machine, not a pairing session with a human, not a sandbox set up by the team. Under the guided-install decision, completing a guided installer **does** satisfy (a): the product doing the work is the intended design, and is categorically different from a person doing it for them. What (a) excludes is *human* assistance, not *product* assistance.
- **(b) First sustained-write session within 7 days of install** — observation activity that goes beyond a single test write and reflects real workflow usage.
- **(c) No synchronous help from a person between discovery and that first sustained-write** — no personal walkthrough, no DM troubleshooting, no live debugging of the install path or MCP setup. In-product guidance, error messages that guide recovery, and an agent configuring Neotoma on the user's instruction are not "help" in this sense; they are the product working.

Pre-install evaluators (those who have not completed install on their own machine) do not vacuously satisfy this gate. Self-reported intent to install does not count.

**What this proves:** The docs, onboarding flow, error messages, and agent instructions are sufficient for self-service adoption. During the dev release, personal intervention is expected; for general release, it can't scale.

**Evidence to track:**

- Did they install from docs alone, on their own machine?
- Did they hit a blocker that required human help between install and first sustained write?
- Did they discover Priority 2+ data types without being prompted?
- Did they configure MCP in a second tool without guidance?

<!-- Evidence basis: round-1 corpus had 4 of 6 gate3=true rows vacuously true (pre-install evaluators); round-2 fresh-install attempts (ent_727fee4a94cfaea86880a0f1, ent_81f79780f1fbe679af99da90, ent_4f0db2d7f2c349900e4dac2c) failed 0/3 to activate unassisted. See aggregate_round2_2026_05_15_feedback_analysis.md. -->

**Status:** [ ] Met / [ ] Not met

### Gate 4: Activation risk resolution

Each of the activation risk classes from [`developer_release_targeting.md`](./developer_release_targeting.md) needs minimum resolution. The first four rows are the original risk classes; the four rows below are sub-gates promoted to first-class measurement based on the round-2 evaluator corpus.

| Risk class / sub-gate                                                           | Minimum status for general release                                                                                                                                                                                                 | Current status                                             |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Cognitive cold-start** (`gate4_cognitive_coldstart`)                          | ≤25% of evaluators report `friction` or `blocked` on cognitive cold-start; Priority 1 data auto-stores; "what to store" guide has worked examples; agent proactively suggests next entity types                                    | Failing — 7/16 = 44% `friction\|blocked` in current corpus |
| **UX friction**                                                                 | Error messages guide recovery; successful storage is confirmed to user; duplicate entity edge cases resolved or surfaced gracefully                                                                                                | Pending                                                    |
| **Trust barrier**                                                               | SBOM or dependency audit published (if proven to be a real blocker); supply chain posture surfaced in install docs                                                                                                                 | Pending                                                    |
| **Prior bad experience**                                                        | Onboarding surface includes integrity-first framing; at least one user-facing comparison (fuzzy memory vs. Neotoma guarantees) exists                                                                                              | Pending                                                    |
| **Install-path friction** (`gate4_install_path_friction`)                       | Cold install on the evaluator's actual machine completes unaided, in ≤5 minutes, ending in a state the evaluator can verify — Neotoma running, its data location known, and at least one tool connected. **Guided path (intended, not shipped):** measured end-to-end; the evaluator is never asked to resolve a package-manager or PATH problem. **npm/CLI path (current):** ≤2 approval prompts, respects version-managed Node (Mise / asdf / nvm / volta), emits a canonical `installed at <path>` line. | Failing — 0/3 round-2 fresh-install attempts met threshold. **This result is the evidence base for the guided-install decision**: three evaluators who wanted the product did not reach it by the npm path. |
| **Retrieval transparency** (`gate4_retrieval_transparency`)                     | The harness surfaces a visible breadcrumb of which observations the agent just used during a turn (e.g. "read N observations from Neotoma"), enabling the user to verify what informed an agent response                           | Pending                                                    |
| **Privacy / local-LLM compatibility** (`gate4_privacy_local_llm_compatibility`) | A documented `/local-llm` (or equivalent) surface plus a working walkthrough for at least one local-LLM topology (Ollama / LM Studio / Alaris-class), including a Neotoma-CLI-without-MCP path for harnesses that do not speak MCP | Pending                                                    |

<!-- Evidence basis for sub-gates:
  - Cognitive cold-start promotion: 7/16 friction|blocked across N=16 corpus.
  - Install-path friction: ent_4f0db2d7f2c349900e4dac2c, ent_81f79780f1fbe679af99da90, ent_727fee4a94cfaea86880a0f1.
  - Retrieval transparency: ent_727fee4a94cfaea86880a0f1 (bounce reason), ent_8e880b688c1a2299cefac8f9 (recall-layer gap), ent_b75ca95fbfc3317d56ac1fe0 (Inspector ask).
  - Privacy / local-LLM: ent_4f0db2d7f2c349900e4dac2c, ent_727fee4a94cfaea86880a0f1, ent_81f79780f1fbe679af99da90.
  See aggregate_round2_2026_05_15_feedback_analysis.md. -->

**Status:** [ ] All minimum statuses met / [ ] Gaps remain

### Gate 5: Architecture validation

**Threshold:** Zero data integrity failures observed across active users.

**Specifically:**

- No silent overwrites (append-only guarantee held)
- No schema violations that slipped through validation
- No provenance gaps (every stored observation traceable to source)
- No entity resolution failures that caused downstream bad decisions
- No snapshot inconsistencies that served stale state

**What this proves:** The guarantees that differentiate Neotoma from fuzzy memory actually hold in production usage. A single integrity failure that a user can point to is a blocker — it undermines the core value prop.

**Status:** [ ] No integrity failures / [ ] Failures observed (detail below)

### Gate 6: Feedback signal quality

**Threshold:** Enough observed usage data to build a general release roadmap from evidence, not speculation.

**Questions that should be answerable from observed behavior:**

- Which entity types do users actually store first, second, third?
- What does the real (not hypothesized) expansion path look like?
- Which MCP workflows are most common?
- Where do users get stuck after activation?
- What features do active users request most?
- What's the actual time-to-value (discovery to "this saved me real time")?

**What this proves:** The general release roadmap is grounded in observed behavior. If the next phase is still based on speculation about what users want, you're shipping blind.

**Status:** [ ] Roadmap grounded in evidence / [ ] Still speculative

---

## What Changes at General Release

General release is not primarily a feature gate — it's an audience and support model gate.

### What changes

- **Audience surface area:** People discover Neotoma without curation — through search, GitHub trending, a blog post going viral, a peer mention. You can't control who arrives.
- **Support model:** Users must succeed without personal intervention. Docs, error messages, agent instructions, and onboarding flow carry the full weight.
- **Content posture:** Shifts from targeted outreach to first-five candidates toward broader distribution through identified watering holes. Content must work for people who arrive with no prior context.
- **Positioning confidence:** Category contrast, objection handling, and vocabulary bridge are validated by real conversations, not hypothesized.

### What doesn't necessarily change

- **Feature set:** General release doesn't require new features. It requires that existing features work reliably, are well-documented, and deliver value without hand-holding.
- **ICP scope:** The primary ICP remains the same. General release expands the surface area within the same ICP, not the ICP itself. Broadening to knowledge workers, small teams, or enterprise happens post-general-release. Note that under the O1 decision the ICP is the buyer who will not build their own state infrastructure — so a guided install is *within* the current ICP scope, not a broadening of it. Shipping it is not ICP drift; it is removing a barrier that was screening the ICP out.
- **Pricing / packaging:** Can remain unchanged unless adoption evidence suggests a different model.

---

## Readiness Assessment Template

For periodic assessment during the developer release:

```
Date: ___________

Gate 1 (Adoption):    [ ] Met  [ ] Not met  —  Active users: ___/5
Gate 2 (Retention):   [ ] Met  [ ] Not met  —  4+ week users: ___/3
Gate 3 (Unassisted):  [ ] Met  [ ] Not met  —  Self-service activations meeting (a)+(b)+(c): ___/2
Gate 4 (Risk resolution): [ ] Met  [ ] Gaps  —  Remaining gaps: ___
  - Cognitive cold-start:           [ ] Met  [ ] Gap  —  Friction|blocked rate: ___% (target ≤25%)
  - UX friction:                    [ ] Met  [ ] Gap
  - Trust barrier:                  [ ] Met  [ ] Gap
  - Prior bad experience:           [ ] Met  [ ] Gap
  - Install-path friction:          [ ] Met  [ ] Gap  —  Cold-install pass rate: ___/___
  - Retrieval transparency:         [ ] Met  [ ] Gap
  - Privacy / local-LLM compat:     [ ] Met  [ ] Gap
Gate 5 (Architecture):    [ ] Met  [ ] Failures  —  Issues: ___
Gate 6 (Signal quality):  [ ] Met  [ ] Speculative  —  Gaps: ___

Overall: [ ] Ready for general release  [ ] Not ready — blocking gates: ___
```

---

## Anti-patterns

Signs that the developer release is being extended past its useful life:

- **Perpetual "one more feature":** Adding features to avoid the exposure of general release. The dev release should validate, not perfect.
- **Hand-holding as retention:** Active users who only succeed because of personal support. This masks onboarding gaps that will break at scale.
- **ICP drift under pressure:** Broadening the target because the first-five aren't converting. If the first-five don't convert, the answer is to diagnose why — not to find a different audience. **The converse failure is equally real:** treating a delivery defect as an ICP signal. When evaluators who match the ICP fail to install, that is a defect to fix, not evidence that the ICP should be narrowed toward whoever can get past it. Narrowing toward the people who survive the install path selects for the infrastructure builder the O1 decision explicitly de-targeted.
- **Confusing usage with validation:** High observation volume from one or two power users is not the same as validated adoption across five independent users.

---

## Agent Instructions

### When to Load

- Assessing whether to transition from developer release to general release
- Planning what to prioritize to reach general release readiness
- Evaluating whether observed adoption signals are sufficient

### Required Co-Loaded Documents

- `docs/icp/primary_icp.md` (always)
- `docs/icp/developer_release_targeting.md` (for activation risk status)
- `docs/NEOTOMA_MANIFEST.md` (always)

### Constraints

1. All six gates must be met before recommending general release
2. Gates are evidence-based — assertions without observed data do not count
3. Do not recommend expanding ICP scope as a substitute for meeting adoption gates within the current ICP; equally, do not narrow the ICP toward whoever clears the current install path
4. Distinguish between activation success (Gate 1) and retention success (Gate 2) — both are required
5. Architecture validation (Gate 5) is a hard blocker — a single integrity failure undermines the core value prop

---

## Revision history

- **2026-09-15:** Applied the durable-ICP decision (O1) and the guided-install decision. Gate 3(a) and (c) now distinguish *product* assistance (permitted, and the intended design) from *human* assistance (still disqualifying). `gate4_install_path_friction` restated as an outcome threshold with separate guided and npm/CLI criteria; thresholds unchanged. Added the note that a failed install is a delivery defect rather than an ICP signal, and the matching anti-pattern. No gate was added, removed, or loosened.

- **2026-05-15:** Tightened Gate 3 to require install on evaluator's actual machine, first sustained-write within 7 days, and no synchronous help in between — closing the "vacuously true" pre-install loophole. Added Gate 4 sub-gates for `gate4_install_path_friction`, `gate4_retrieval_transparency`, and `gate4_privacy_local_llm_compatibility`. Promoted `gate4_cognitive_coldstart` to a first-class Gate 4 sub-gate with explicit ≤25% `friction|blocked` threshold. Updated Readiness Assessment Template to reflect new sub-gates. Backed by the 16-evaluator feedback corpus (see `docs/private/customer-development/aggregate_round2_2026_05_15_feedback_analysis.md`).
