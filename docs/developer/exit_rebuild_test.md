# Exit / Rebuild Test Protocol

## Purpose

This is the protocol for the **leave-and-rebuild test** that proves an adopter's
dependence on Neotoma is reversible in practice, not just by promise. It is the
documented, repeatable procedure behind commitment **#6 (Portability and exit
proven)** in
[`../foundation/adopter_dependency_commitments.md`](../foundation/adopter_dependency_commitments.md)
(tracking #1524).

The test answers one question with a number: **starting from a realistic dataset
held in an external system of record, how long does it take to stand up a fresh
Neotoma instance, populate it, tear it down, and stand it up again — end to
end?** The pass bar is **"weeks, not migration"** — i.e., the rebuild is an
operational task measured in hours-to-a-day of wall-clock work, not a
multi-week data-migration project.

Commitment #6 flips from _Partial_ to _In place_ when this protocol has been
**executed against a realistic dataset and the result recorded** — not when this
document merely exists. The document is the procedure; the recorded run is the
evidence.

## The posture this validates

The portability guarantee rests on a specific architecture: the adopter keeps
their **own** system of record (e.g. Postgres), and Neotoma is a **rebuildable
derived layer** populated from it. A breaking Neotoma change, or a decision to
leave entirely, costs an index rebuild — not customer data. This test measures
the real cost of that rebuild so the "reversible by construction" claim is
backed by a timed, reproducible run rather than an assertion.

## What the test exercises

1. **Export** — getting a complete, structured snapshot of the data out of
   Neotoma (or, for the rebuild-from-source-of-record case, having it available
   in the adopter's own store).
2. **Rebuild** — populating a fresh Neotoma instance from that data via the
   bulk-import path.
3. **Teardown** — destroying the instance.
4. **Rebuild again** — repeating the populate step to confirm it is repeatable
   and idempotent, not a one-time success.
5. **Verification** — confirming the rebuilt instance is equivalent to the
   original (entity counts, snapshot equivalence, relationship integrity).

## Commands

The bulk-import path is the load-bearing mechanism and is already shipped:

- **`neotoma entities import <file>`** — bulk-import entities from a JSONL file
  (one entity JSON object per line), chunked into batched transactional
  `POST /store` calls. Idempotent per chunk via `--idempotency-prefix`, so a
  re-run with the same prefix and file is a safe no-op — which is what makes the
  "rebuild again" step cheap and replay-safe. Runs in dry-run/plan mode without
  `--commit`. See [`cli_reference.md`](cli_reference.md).

The paired export side is **`neotoma entities export`** — the inverse of
`entities import`, added so a Neotoma instance can be exported and rebuilt with
one matched pair of commands:

- **`neotoma entities export [--type <t>] [--out <file>] [--with-relationships]`** —
  pages through all entities and emits **import-compatible JSONL** (one object
  per line, `entity_type` plus the snapshot's fields at the top level — exactly
  the shape `entities import` consumes). With `--with-relationships` it also
  writes a companion `<out>.relationships.json` that `relationships create
  --file` re-imports, for a full entities-plus-edges round-trip. See
  [`cli_reference.md`](cli_reference.md).

Other read paths exist but are **not** the import inverse, and should be used for
verification rather than as a rebuild source:

- `neotoma snapshots export` — fleet-neutral snapshot JSON with per-field
  provenance. A different shape (fields nested under `snapshot`, plus
  `entity_id`/provenance); useful to diff two instances for equivalence, not to
  feed `entities import`.
- For the rebuild-from-source-of-record case, the JSONL is generated from the
  adopter's own Postgres export, not from Neotoma at all — this is the primary
  path the posture above describes, and `entities export` is the format
  reference for what that JSONL should look like.

## Procedure

Run against a **realistic dataset** — representative entity counts, relationship
fan-out, and entity-type mix for the adopter's workload. A toy dataset does not
exercise the cost that matters.

1. **Prepare the source dataset.** Either (a) a Postgres export shaped into
   import JSONL (the source-of-record path), or (b) an export from an existing
   Neotoma instance. Record dataset size: entity count, relationship count,
   entity-type histogram.
2. **Stand up a fresh instance.** `neotoma init` a clean data directory. Record
   wall-clock from here.
3. **Dry-run the import.** `neotoma entities import <file>` (no `--commit`) and
   confirm the plan matches the dataset (no resolution errors).
4. **Commit the import.** `neotoma entities import <file> --commit
--idempotency-prefix <prefix>`. Record wall-clock and any errors.
5. **Verify equivalence.** Compare against the source: entity count
   (`neotoma stats`), spot-check snapshots (`neotoma snapshots export` diff
   against the original where applicable), confirm relationships resolved
   (`neotoma relationships list <id>` on a sample). Record discrepancies.
6. **Tear down.** Destroy the instance / data directory.
7. **Rebuild again.** Repeat steps 2–5 with the **same** file and
   `--idempotency-prefix`. Confirm the second run is idempotent (same end state,
   no duplicate data) and record wall-clock.
8. **Record the result.** Total wall-clock per rebuild, dataset size, any manual
   steps required, and any gaps hit. This recording is the #6 evidence.

## Pass / fail

- **Pass:** both rebuilds complete, the rebuilt instance is equivalent to the
  source, the second rebuild is idempotent, and total wall-clock is
  "weeks, not migration" (operational, not a project). #6 flips to In place and
  this run is cited as its evidence.
- **Fail / partial:** if a step requires undocumented manual work, the rebuild is
  not equivalent, or the time is migration-scale, the test has done its job — it
  surfaced that reversibility is thinner than advertised **before** anyone
  depended on it. File the specific gap and treat it as blocking for #6.

## Reference run (Neotoma-side, synthetic)

A first Neotoma-side dry run was executed to de-risk the mechanism before any
joint, adopter-data run. It is **not** the gated test — that one rebuilds from an
adopter's Postgres export and is run jointly — but it confirms the substrate side
works and establishes a baseline.

- **Dataset:** 10,000 synthetic `contact` entities (CRM-shaped), isolated dev
  instances, offline in-process transport (no network, no auth server).
- **Import (build):** ~9.9s for 10k. **Export:** ~2.5s. **Rebuild import (fresh
  instance from the export):** ~8.1s. **Idempotent re-run** of the same import:
  ~0.5s with the entity count unchanged (no duplicates).
- **Equivalence:** exporting from the rebuilt instance produced **byte-identical
  content** (order-independent) to the original export — a faithful round-trip at
  the declared-field level.
- **Conclusion:** the chunked transactional import scales fine at this size, the
  `entities export` → `entities import` pair round-trips faithfully, and the
  rebuild is idempotent. The remaining unknowns are dataset shape and the
  relationship/observation dimensions (below), which the joint adopter run
  exercises.

## Known gaps to confirm during the run

Status reflects the reference run above; items it did not exercise remain open
for the joint run.

- **Export → import format pairing — CLOSED.** `neotoma entities export` now
  emits exactly the JSONL `entities import` consumes; the reference run confirmed
  a faithful round-trip. (Previously there was no paired export command.)
- **Idempotency across a full dataset — CONFIRMED** at 10k: re-running the import
  is a fast no-op and does not duplicate entities.
- **Idempotency prefix across a teardown — CONFIRMED:** the per-chunk keys live
  in the target instance, so a rebuild into a fresh instance writes from scratch
  as intended; re-running into the _same_ instance is the no-op case.
- **Snapshot-equivalence semantics — DEFINED:** equivalence is measured by
  exporting both instances with `entities export` and diffing the sorted output
  (declared-field equality, order- and instance-id-independent). The reference
  run passed this check.
- **Schema fidelity (NEW finding — must confirm per dataset).** Export reflects
  only what the snapshot captured. Fields the entity's registered schema does not
  declare are not in the snapshot, so they do not survive the round-trip via this
  path. In the reference run the `contact` schema declared only `name` and
  `role`, so other generated fields (`company`, `city`, …) were absent from both
  the export and the rebuild. For a real migration this means: **the adopter's
  schemas must declare every field that matters before the rebuild**, or those
  fields must be carried by a source-of-record import that includes them. Confirm
  the schema coverage of the adopter's dataset as part of the joint run.
- **Relationships and observations — NOT YET EXERCISED.** `entities export
  --with-relationships` exports typed edges to a companion file that
  `relationships create --file` re-imports, but the reference dataset had no
  edges, so the relationship round-trip is implemented-but-unverified. Full
  observation _history_ (vs. current snapshot) is not reproduced by this path.
  The joint run, with a relationship-bearing dataset, must exercise both.
- **Setup reality.** The import runs through the store path; for an isolated run,
  `NEOTOMA_ENV` and `NEOTOMA_DATA_DIR` must be aligned so offline transport
  targets the intended database (a mismatch silently targets the default
  instance). This is a real operational detail, not "just run the command."

## Running it as a joint exercise

For an adopter (e.g. during a Phase 0 evaluation), the highest-value form of this
test is **joint**: the adopter brings a realistic dataset shaped from their own
system of record, and both parties run the protocol together and agree the
success bar up front. That removes "trust us" from the reversibility claim — the
adopter watches the rebuild happen and times it themselves — and the recorded run
becomes the #6 evidence for everyone, not just for that adopter.

## Related documents

- [`../foundation/adopter_dependency_commitments.md`](../foundation/adopter_dependency_commitments.md) — commitment #6 and the dependency-stability scorecard.
- [`cli_reference.md`](cli_reference.md) — `entities import`, `snapshots export`, `entities list`, `stats`.
- [`../architecture/idempotence_pattern.md`](../architecture/idempotence_pattern.md) — why re-import is replay-safe.
- [`../subsystems/observation_architecture.md`](../subsystems/observation_architecture.md) — immutability; what a faithful rebuild must reproduce.
- [`../infrastructure/multi_tenant_deployment_topology.md`](../infrastructure/multi_tenant_deployment_topology.md) — instance-per-tenant, the topology a clean lift-out depends on.
