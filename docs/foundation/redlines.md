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

It is public on purpose. A precommitment binds only when it is witnessed:
publishing the commitments that protect Neotoma, including the company-level
ones a founder or board might be tempted to quietly translate, is what makes
them costly to cross.

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

## Company redlines

The product redlines above are verifiable against the code. The company redlines
below protect the conditions under which that code can stay what it is, under
capital, customer, and competitive pressure. They have no architectural
invariant to cite because they are commitments about how the project is funded,
sold, governed, positioned, and exited. They name values and refusals, not
prices, term-sheet positions, or counterparties.

### R10. No funding terms that allow override of architectural decisions

Investor rights, board veto provisions, or governance structures that put
append-only, schema enforcement, hash identity, or provenance up for discussion
at the board level fail the redline test. The architectural commitments are not
negotiable under capital pressure. Term sheets that require them to be must be
refused, regardless of valuation.

### R11. No customer commitments that require violating the substrate

Enterprise asks for "just one mutable table" or "skip schema validation for this
pipeline" in exchange for a contract are refused. Once the substrate has an
exception, it has no integrity. The deal that requires violating Neotoma to win
is the deal that destroys Neotoma's reason to exist.

### R12. No governance structure that allows unilateral capture

The substantive position requires institutional embedding that survives any
single individual, including the founder. Governance where one party can quietly
translate the integrity commitments into something more market-compatible
(through quiet license changes, soft policy drift, or authority concentrated in
one person) is a redline. Foundation structures, multi-party stewardship, or
constitutional governance documents that name the commitments as non-amendable
must exist before the leverage to capture them does.

### R13. No category drift in positioning

When competitors ship something compelling in adjacent frames (retrieval-first,
memory-as-cognition, embeddings-centric), the temptation is to reframe Neotoma in
their terms to compete. This is narrative contamination. The redline is marketing
copy or product positioning that implies Neotoma is "also" a retrieval system,
"also" an embeddings system, or "also" memory-as-cognition. Neotoma is the
state-integrity position. Other positions exist; Neotoma is not them.

### R14. No pricing model that punishes integrity use

If storing more observations (the natural consequence of append-only) costs
customers proportionally more than a mutable competitor, and that pricing
pressure makes them want to delete history, the business model is fighting the
architecture. Any pricing structure that economically incentivizes customers to
violate the integrity commitments the product exists to provide crosses this
redline.

### R15. No claims you cannot cryptographically substantiate

Terms like "provably correct," "tamper-evident," "verifiable," and
"deterministic" have specific technical meaning. Marketing language stronger than
what the implementation backs makes Neotoma a hope system rather than a trust
system. The redline is shipping language stronger than the code, ever.

### R16. No acquisition that dissolves the substantive position

An acquirer that wants Neotoma's brand and team but plans to fold the technology
into a retrieval-first product, close-source the core, or remove the integrity
guarantees as "complexity" is not offering an exit. They are offering capture.
Acquirer money where the explicit or implicit plan is to translate Neotoma into
something its current architecture refuses to be is not on the table, regardless
of multiple.

### R17. No competition with the applications built on the substrate

Neotoma is the State Layer. The applications built on it — CRMs, vertical
relationship products, domain tools — own the layer above: their domain schemas,
ranking and merge policies, behavioral data, and distribution. The redline is
Neotoma moving up into those verticals to compete with the adopters depending on
it: shipping a first-party application that competes with an adopter's product,
or absorbing an adopter's differentiating logic (its ranking methodology, its
behavioral-signal models, its domain-specific workflows) into the substrate and
re-exposing it to that adopter's competitors. Substrate hardening every adopter
needs belongs upstream; an individual adopter's vertical moat is theirs and stays
theirs. An adopter must be able to depend on Neotoma without the substrate
becoming their competitor — that safety is what makes building on an open core
rational rather than reckless. (This is the structural commitment behind the
boundary in [`substrate_and_applications.md`](substrate_and_applications.md); R13
governs the separate, narrower question of marketing-positioning drift.)

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

Per R12, ratification authority must not be concentrated in one party; the
amendment process is itself one of the institutions the redlines exist to
protect.

The substance survives translation only if the institutions that hold it survive
translation. This document, and the process around it, is one of those
institutions.

## Amendment history

Each entry records what changed, when, why, who ratified it, and — honestly —
under what process, including where that process is not yet what R12 ultimately
requires.

### 2026-06-10 — R17 added (clarification)

- **What:** Added **R17, No competition with the applications built on the
  substrate.** Corrected the citation for the no-vertical-competition commitment
  from R13 to R17 in [`substrate_and_applications.md`](substrate_and_applications.md)
  and [`adopter_dependency_commitments.md`](adopter_dependency_commitments.md).
- **Why:** The commitment that Neotoma will not move up into the verticals built
  on it was already operative and asserted in
  [`substrate_and_applications.md`](substrate_and_applications.md), but it was
  cited to R13 — which governs marketing-positioning drift, not structural
  non-competition. R17 states the existing commitment explicitly and puts it in
  the redline set, where adopters verify commitments, rather than leaving it as
  prose in a downstream document.
- **Classification:** **Clarification, not a change to the substantive position.**
  R17 does not weaken or alter any commitment; it names one that already bound
  and files it correctly. The amendment process exists to guard against the
  substantive position being weakened under pressure (capture); recording a
  pre-existing adopter protection in its proper place is the opposite of that.
- **Ratified by:** Mark Hendrickson (founder), under the single-party founder
  approval that is the governance actually operational today.
- **Process caveat (stated, not hidden):** R12 commits to multi-party
  stewardship — ratification authority that is not concentrated in one party —
  and to that institution existing *before* the leverage to capture the
  commitments does. **That multi-party ratification mechanism is not yet
  operational;** today's governance is single-human (founder) approval. This
  amendment is therefore made under the current single-party model. The gap
  between R12's commitment and the present mechanism is a known governance item,
  tracked alongside the other dependency-stability commitments
  ([`adopter_dependency_commitments.md`](adopter_dependency_commitments.md), the
  governance row). When the multi-party process exists, clarifications of this
  kind should route through it; this entry records that it did not, because it
  could not yet.

## Related documents

- [`core_identity.md`](core_identity.md) — what Neotoma is and is not; the
  defensible differentiators each redline protects.
- [`philosophy.md`](philosophy.md) — the architectural invariants (MUST / MUST
  NOT) cited by R1–R9.
- [`product_principles.md`](product_principles.md) — the product-design
  expression of the same commitments.
- [`scope_decisions.md`](scope_decisions.md) — recorded boundary decisions.
