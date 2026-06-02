# Adopter Dependency Commitments

## Scope

This document states the **stability, governance, and operability commitments**
an application building on Neotoma can hold us to — the conditions that determine
whether it is safe to depend on the substrate and trust that the ground will not
move under you. It exists so that "when is this safe to depend on, and who
decides?" has a public, checkable answer rather than resting on a version number
or a verbal assurance.

These commitments are deliberately **not technical feature checklists** and **not
go-to-market readiness gates** — the substrate's capabilities already exist and
are documented elsewhere, and adoption readiness is tracked separately. They are
the maturity properties an _adopter_ cares about: that schemas and contracts do
not shift under you, that you can always leave with your data, and that the
governance commitments are real and enforced.

### How this differs from general-release readiness

Neotoma has two distinct "is it ready?" lenses, and they are intentionally
separate documents:

- **`docs/icp/general_release_criteria.md`** — _go-to-market_ readiness: whether
  Neotoma can sustain unassisted discovery, adoption, and retention at scale
  (adoption evidence, activation, feedback signal). That is the team's lens for
  deciding when to broaden distribution.
- **This document** — _dependency-safety_: whether an external product can build
  on the substrate without the ground shifting. That is the adopter's lens for
  deciding whether to depend.

The two are orthogonal. A version can be safe to depend on (this document)
before it is broadly market-ready (the ICP document), or vice versa. This
document is the one an evaluator deciding whether to build on Neotoma should
read.

These commitments are **criteria-gated, not date-gated.** They are satisfied
when the conditions below are met — not on a calendar date, not at an arbitrary
version bump. When all are met with documented evidence, Neotoma is dependency-
stable (and `1.0` is tagged); we will not declare it to hit a date, nor hold it
back once met.

Related:

- `docs/foundation/redlines.md` — the constitutional governance commitments
  (R1–R16) that the governance commitments below reference.
- `docs/foundation/substrate_and_applications.md` — the substrate/application
  boundary that defines what these commitments do and do not cover.
- `docs/developer/developer_preview_launch_checklist.md` — what the current
  developer-preview stage committed to (the backward-looking checklist).
- `docs/icp/general_release_criteria.md` — the orthogonal go-to-market readiness
  gates (see above).

## Current stage

Neotoma is a **developer preview** (v0.x). The preview guarantees and their
explicit "not yet" disclaimers are documented in the README and the developer-
preview checklist. The "not yet" list — stable schemas, deterministic extraction
across versions, long-term replay compatibility, backward compatibility — is, in
effect, the dependency-stability agenda. This document names those items as
commitments and adds the governance and operability conditions that a version
label alone cannot express.

## The commitments

Dependency-stability requires **all** of the following. Each is checkable, and
each links to where its evidence lives or will live.

### Stability

1. **Schema stability and versioned evolution.** Registered entity-type schemas
   evolve under a documented compatibility policy: additive changes are safe,
   breaking changes are versioned and migrated, and a schema in use does not
   change shape under a consumer without an explicit version bump and migration
   path.
2. **Contract stability.** The HTTP/MCP/CLI contract surface is governed by the
   OpenAPI-first flow and the breaking-change discipline already in place
   (breaking changes named in release supplements, legacy-payload corpus, BC
   diff gate). At this bar, the contract carries a stated deprecation policy: how
   long a deprecated field or endpoint is supported before removal.
3. **Backward compatibility and replay.** Data written by an earlier version
   remains readable and reducible by a later version within a stated support
   window. Observations and source remain immutable; reinterpretation across
   versions is additive, never destructive.
4. **Deterministic extraction across versions.** The canonicalization that bounds
   LLM stochasticity (content-derived IDs, stable ordering, deterministic
   reducers) is stable across releases, so the same inputs continue to produce the
   same stored truth.

### Governance

5. **The redline commitments hold and are demonstrated, not just stated.**
   `docs/foundation/redlines.md` (R1–R16) is in force, and this bar requires
   evidence that the load-bearing ones are real: open-source core under MIT (R6),
   no hosted-only features that compromise local-first (R5), no unilateral
   capture or quiet license/policy drift (R12), no category drift into the
   vertical applications built on the substrate (R13).
6. **Portability and exit are proven.** Export, deletion, and rebuild-from-source-
   of-record are documented and tested end-to-end, so an adopter can leave with
   their data at any time. Dependence on Neotoma is reversible by construction,
   not by promise.
7. **Change governance is published.** How breaking changes are decided,
   announced, and supported — including the deprecation window above — is written
   down, so an adopter can predict the cost of staying current.

### Operability

8. **A supported multi-tenant deployment story.** At least one documented,
   tested production deployment topology (see
   `docs/infrastructure/multi_tenant_deployment_topology.md`) with its concurrency
   envelope, backup/restore, and isolation guarantees stated — not just
   "runs on a laptop."
9. **Security review cadence.** The pre-release security gates run on every
   sensitive release, and this bar requires a stated ongoing cadence (review on
   sensitive change, advisory disclosure process, a documented response path for
   reported issues) rather than a one-time audit.
10. **Observability and operational documentation.** The logging, metrics, and
    event surfaces an operator needs to run Neotoma in production are documented,
    with no PII in any observable surface.
11. **A stated support posture.** What support, SLAs (if any), and version-support
    windows an adopter can expect are written down — even if the answer for some
    tiers is "self-hosted, community-supported." The point is that the posture is
    explicit, not that it is maximal.

## What this bar does not mean

- **Not feature-completeness.** This is a stability and trust bar, not a claim
  that every planned capability has shipped. New capabilities continue to land
  under the same compatibility discipline.
- **Not the end of the substrate/application boundary.** Reaching it does not
  change what the substrate owns versus what the application owns
  (`docs/foundation/substrate_and_applications.md`). Neotoma at 1.0 is still the
  State Layer and still does not move up into vertical applications (R13).
- **Not a managed-service commitment.** This is about the substrate's maturity,
  not about a hosted offering. The self-hosted path is the supported path; any
  managed offering is a separate decision.
- **Not go-to-market readiness.** Whether Neotoma can sustain unassisted adoption
  at scale is a separate question, tracked in `docs/icp/general_release_criteria.md`.

## How to use this document

- An adopter evaluating whether to depend on Neotoma can read this as the bar we
  hold ourselves to, and hold us to it.
- A contributor proposing a change toward dependency-stability can check it
  against these commitments and cite the one it advances.
- When every commitment has documented, checkable evidence, the bar is met and
  `1.0` is tagged — at that point, not before, and not delayed past it.
