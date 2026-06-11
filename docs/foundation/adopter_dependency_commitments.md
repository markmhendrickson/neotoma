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

### Status at a glance

This is a v0.x preview, so most commitments are **partially** met: the
_mechanism_ usually exists in the codebase while the _stated policy_ that turns
it into a guarantee an adopter can rely on does not yet. The table is the honest
current state, not a target. Status is one of:

- **In place** — the commitment is satisfied today, with the cited evidence.
- **Partial** — the underlying mechanism exists and is enforced, but a stated
  policy, support window, or end-to-end test still has to be written before it is
  a guarantee.
- **Not yet** — neither the mechanism nor the policy is in place.

Every row that is not yet **In place** has a tracking issue in the **Tracking**
column scoping the exact remaining work to flip it. That is what makes this a
live scorecard rather than a static claim: you can watch each row move, and the
work behind each move is open and itemized.

| #   | Commitment                                 | Status   | What exists / what's missing                                                                                                                         | Tracking                                                         |
| --- | ------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1   | Schema stability + versioned evolution     | In place | `schema_version` and additive expansion exist (`docs/architecture/schema_expansion.md`); the stated compatibility policy is now written (`docs/architecture/schema_compatibility_policy.md`).  | —                                                                |
| 2   | Contract stability                         | Partial  | OpenAPI-first flow, legacy-payload corpus, and BC-diff gate exist; a stated **deprecation window** does not.                                         | [#1521](https://github.com/markmhendrickson/neotoma/issues/1521) |
| 3   | Backward compatibility + replay            | Partial  | Immutability of observations/source is enforced (`docs/subsystems/observation_architecture.md`); a stated **support window** is not yet set.         | [#1522](https://github.com/markmhendrickson/neotoma/issues/1522) |
| 4   | Deterministic extraction across versions   | In place | Content-derived IDs, stable ordering, deterministic reducers are enforced invariants (`docs/architecture/determinism.md`).                           | —                                                                |
| 5   | Redlines demonstrated, not just stated     | Partial  | `redlines.md` is in force; MIT + open core are real and verifiable; a recurring demonstration record is still being built.                           | [#1523](https://github.com/markmhendrickson/neotoma/issues/1523) |
| 6   | Portability + exit proven                  | Partial  | Export (`memory-export`, `snapshots export`), bulk import, and deletion commands exist; the leave-and-rebuild protocol is now written (`docs/developer/exit_rebuild_test.md`), but a recorded run against a realistic dataset is still pending. | [#1524](https://github.com/markmhendrickson/neotoma/issues/1524) |
| 7   | Change governance published                | Partial  | Breaking-change discipline (release supplements, BC gate) exists; the deprecation window and decision process are not yet written down.              | [#1525](https://github.com/markmhendrickson/neotoma/issues/1525) |
| 8   | Supported multi-tenant deployment topology | Partial  | The topology decision aid exists (`docs/infrastructure/multi_tenant_deployment_topology.md`); a _tested_ production topology is not yet established. | [#1526](https://github.com/markmhendrickson/neotoma/issues/1526) |
| 9   | Security review cadence                    | In place | Pre-release security gates (diff classifier, protected-routes manifest, security review) run on sensitive releases.                                  | —                                                                |
| 10  | Observability + operational docs           | In place | Logging, metrics, and privacy (no-PII) surfaces are documented (`docs/observability/`, `docs/subsystems/privacy.md`).                                | —                                                                |
| 11  | Stated support posture                     | Not yet  | No support / SLA / version-support-window document exists yet.                                                                                       | [#1527](https://github.com/markmhendrickson/neotoma/issues/1527) |

The detail for each follows.

### Stability

1. **Schema stability and versioned evolution.** _(In place)_ Registered entity-type schemas
   evolve under a documented compatibility policy: additive changes are safe,
   breaking changes are versioned and migrated, and a schema in use does not
   change shape under a consumer without an explicit version bump and migration
   path. The policy is stated in
   [`../architecture/schema_compatibility_policy.md`](../architecture/schema_compatibility_policy.md);
   the additive-expansion mechanism it relies on is in
   [`../architecture/schema_expansion.md`](../architecture/schema_expansion.md).
2. **Contract stability.** _(Partial)_ The HTTP/MCP/CLI contract surface is governed by the
   OpenAPI-first flow and the breaking-change discipline already in place
   (breaking changes named in release supplements, legacy-payload corpus, BC
   diff gate). At this bar, the contract carries a stated deprecation policy: how
   long a deprecated field or endpoint is supported before removal.
3. **Backward compatibility and replay.** _(Partial)_ Data written by an earlier version
   remains readable and reducible by a later version within a stated support
   window. Observations and source remain immutable; reinterpretation across
   versions is additive, never destructive.
4. **Deterministic extraction across versions.** _(In place)_ The canonicalization that bounds
   LLM stochasticity (content-derived IDs, stable ordering, deterministic
   reducers) is stable across releases, so the same inputs continue to produce the
   same stored truth.

### Governance

5. **The redline commitments hold and are demonstrated, not just stated.** _(Partial)_
   `docs/foundation/redlines.md` (R1–R16) is in force, and this bar requires
   evidence that the load-bearing ones are real: open-source core under MIT (R6),
   no hosted-only features that compromise local-first (R5), no unilateral
   capture or quiet license/policy drift (R12), no category drift into the
   vertical applications built on the substrate (R13).
6. **Portability and exit are proven.** _(Partial)_ Export, deletion, and rebuild-from-source-
   of-record are documented end-to-end, so an adopter can leave with
   their data at any time. Dependence on Neotoma is reversible by construction,
   not by promise. The repeatable leave-and-rebuild **protocol** is now written
   ([`../developer/exit_rebuild_test.md`](../developer/exit_rebuild_test.md)); the
   row flips to In place once that protocol has been **executed against a
   realistic dataset and the timed result recorded** (the recorded run is the
   evidence, not the protocol's existence).
7. **Change governance is published.** _(Partial)_ How breaking changes are decided,
   announced, and supported — including the deprecation window above — is written
   down, so an adopter can predict the cost of staying current.

### Operability

8. **A supported multi-tenant deployment story.** _(Partial)_ At least one documented,
   tested production deployment topology (see
   `docs/infrastructure/multi_tenant_deployment_topology.md`) with its concurrency
   envelope, backup/restore, and isolation guarantees stated — not just
   "runs on a laptop."
9. **Security review cadence.** _(In place)_ The pre-release security gates run on every
   sensitive release, and this bar requires a stated ongoing cadence (review on
   sensitive change, advisory disclosure process, a documented response path for
   reported issues) rather than a one-time audit.
10. **Observability and operational documentation.** _(In place)_ The logging, metrics, and
    event surfaces an operator needs to run Neotoma in production are documented,
    with no PII in any observable surface.
11. **A stated support posture.** _(Not yet)_ What support, SLAs (if any), and version-support
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
