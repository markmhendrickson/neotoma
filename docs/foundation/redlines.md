# Neotoma Redlines

This document names the commitments that define Neotoma. Crossing any of them
would mean Neotoma has become something other than what it exists to be, even
if the name, repository, and team remain.

Redlines exist to be reasoned about in advance, not under pressure. The moments
when they matter most (funding negotiations, large customer asks, competitive
launches, acquisition offers) are precisely the moments when clarity is hardest
to recover if it was not already established.

This document is constitutional. Amending it requires the deliberate process in
[Amendment](#amendment), not ordinary product or business decisions.

**Scope:** This document covers the product redlines (R1–R9) that any reader of
the open-source repository can verify against the code. Company-level redlines
(funding, customer commitments, governance, positioning, pricing, marketing
claims, acquisition) are maintained as internal governance and are not part of
the public repository. The amendment process in this document governs both.

## The substantive position

Neotoma exists to provide a deterministic state layer for AI agent memory,
built on write integrity rather than retrieval performance. The architectural
commitments named in [`core_identity.md`](core_identity.md) and
[`philosophy.md`](philosophy.md) (append-only observations, hash-based entity
identity, schema-bound writes, pipeline provenance, replayable timelines,
local-first operation, MIT-licensed open source, MCP-based cross-harness
portability, entirely user-controlled) are the form this commitment takes in
code.

Every redline below protects some aspect of this position. The redlines are not
a wishlist; they are the set of moves that, if made, would mean Neotoma has
become a different project sharing the old name.

## The four failure modes Neotoma exists to refuse

The product surface commits to refusing four failure modes (the same modes
catalogued in
[`docs/developer/agent_memory_failure_modes.md`](../developer/agent_memory_failure_modes.md)
and [`docs/icp/prioritized_pain_points_and_failure_modes.md`](../icp/prioritized_pain_points_and_failure_modes.md),
stated here as commitments rather than as pain points):

1. Sessions that start from zero, where nothing the agent learns carries over.
2. Facts that conflict across tools, where two agents store different versions
   of the same entity.
3. Decisions that execute without a reproducible trail, with no way to trace why
   an agent acted as it did.
4. Corrections that do not stick, where a fix in one harness is silently lost in
   another.

Any product decision that causes any of these four failure modes to recur is, by
definition, crossing a redline. They are the positive form of the commitments
below.

## Product redlines

Each redline names the commitment, cites the canonical invariant it protects,
and states the move that would cross it. The mechanics of each invariant live in
the cited document; this section does not restate them.

### R1. No mutable writes anywhere in the substrate

Protects immutability ([`philosophy.md`](philosophy.md) §5.4, MUST NOT #6). The
moment Neotoma ships an interface allowing in-place updates to observations or
entities, including as a "convenience mode," "fast path," or "developer
ergonomic," append-only stops being a guarantee and becomes a preference.
Corrections MUST be expressed as new observations that override prior ones with
full provenance, never as overwrites. Customer requests for mutability for
performance reasons are refused without exception.

### R2. No entity identity that is not content-derived

Protects hash-based identity ([`philosophy.md`](philosophy.md) MUST #5).
Auto-incrementing IDs, UUIDs, or any externally-assigned identifier as the
primary identity mechanism would dissolve the convergence property that allows
multi-agent agreement without coordination. External identifiers MAY exist as
secondary attributes; they MUST NOT replace hash-based identity.

### R3. No schema bypass at write time

Protects schema-first processing ([`philosophy.md`](philosophy.md) §5.5, MUST #4,
MUST NOT #5). Not every entity needs a schema, but once a schema exists for an
entity type, writes that violate it MUST fail. Soft validation, warn-but-accept,
and log-and-continue modes are redline crossings: they make schemas advisory,
which makes them non-constraints, which permits drift, which makes the integrity
claim fraudulent.

### R4. No silent pipeline transformations

Protects full explainability ([`philosophy.md`](philosophy.md) §5.7). Every
derivation MUST trace to its inputs and the pipeline that produced it. No feature
may introduce state without provenance attached, including AI-driven
derivations, "smart" deduplication, and background optimization passes that
reweight or merge entities. Invisible mutation is exactly what Neotoma exists to
refuse.

### R5. No hosted-only features that compromise local-first

Extends the privacy-first, user-controlled commitment in
[`core_identity.md`](core_identity.md). If Neotoma adds capabilities that work
only against a hosted backend, and those capabilities become load-bearing for the
value proposition, local-first has been demoted from architectural commitment to
marketing decoration. Hosted services MAY exist as a layer on top, but every core
integrity guarantee MUST remain verifiable from a self-hosted deployment.

### R6. No closed-source extensions to core integrity primitives

States the licensing commitment behind the integrity claims. Auxiliary tooling
MAY be commercial. The integrity substrate (append-only semantics, hash-based
identity, schema constraint enforcement, provenance generation) remains open and
inspectable under MIT license. A closed-source integrity primitive is a
contradiction in terms: integrity claims require independent verifiability.

### R7. No vector-similarity or embedding-based features positioned as core

Protects structural retrieval as primary ([`philosophy.md`](philosophy.md) MUST
NOT #1). Embeddings MAY exist as an optional retrieval helper over structured
state. The moment marketing, roadmap, or product surface treats them as central,
Neotoma has slid into the retrieval-first category it was built to refuse. The
write-integrity frame is the wedge; surrendering it surrenders the project.

### R8. No erosion of cross-harness portability

Protects cross-platform operation ([`core_identity.md`](core_identity.md)).
Neotoma works across Claude, Cursor, ChatGPT, and other agent surfaces via MCP.
Any feature whose value depends on lock-in to a specific agent surface, model
provider, or MCP variant, including features that subtly "work best with X,"
quietly demotes this commitment. Portability is a guarantee, not a marketing
claim.

### R9. No surrender of user control over user data

Protects explicit user control ([`philosophy.md`](philosophy.md) §5.2). The
redline is any decision that takes any degree of control away from the user over
their own state: telemetry collected without explicit opt-in, hosted-only
features that fragment user data, mandatory account requirements, or terms that
claim rights over user observations. Sovereignty is the deepest commitment; every
other commitment serves it.

## The meta-redline

Underneath all of the above is the same test, applied at the project level:

**Any decision the founding articulation of Neotoma would not recognize as
Neotoma.**

The substantive position is write integrity as the primary commitment, from
which everything else follows. Any redline crossing is, at root, an inversion of
that priority: letting something else (growth, simplicity, market pressure,
investor pressure, customer pressure, competitive pressure) become the primary
commitment, with integrity demoted to a feature.

## Amendment

This document is amendable, but not casually. Amendments require:

1. A written rationale explaining why the substantive position has changed, not
   merely why the redline is inconvenient.
2. A period of reflection between proposal and ratification sufficient to ensure
   the change is not being made under acute pressure.
3. Recording the amendment with full provenance (what changed, when, why, and who
   ratified it) in the repository history.

The substance survives translation only if the institutions that hold it survive
translation. This document, and the process around it, is one of those
institutions.

## Related documents

- [`core_identity.md`](core_identity.md) — what Neotoma is and is not; the
  defensible differentiators each redline protects.
- [`philosophy.md`](philosophy.md) — the architectural invariants (MUST / MUST
  NOT) cited by R1–R9.
- [`product_principles.md`](product_principles.md) — the product-design
  expression of the same commitments.
- [`scope_decisions.md`](scope_decisions.md) — recorded boundary decisions.
