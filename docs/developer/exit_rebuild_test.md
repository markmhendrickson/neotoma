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

The export side has more than one candidate and **the protocol must confirm
which produces import-compatible JSONL** rather than assume it (see Known gaps):

- `neotoma entities list` (with `--type`, `--limit`, `--offset`) — enumerates
  entities; the run must confirm its output is, or can be trivially shaped into,
  the JSONL `entities import` consumes.
- `neotoma snapshots export` — fleet-neutral snapshot JSON with per-field
  provenance; a different shape than the import format, useful for verification
  rather than as a direct import source.
- For the rebuild-from-source-of-record case, the JSONL is generated from the
  adopter's own Postgres export, not from Neotoma at all — this is the primary
  path the posture above describes.

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

## Known gaps to confirm during the run

These are open questions the first execution should resolve and record, rather
than assume away:

- **Export → import format pairing.** Confirm which export command emits JSONL
  that `entities import` consumes directly, or document the (deterministic)
  shaping step between them. If no single command round-trips today, that is a
  finding, and closing it is part of flipping #6.
- **Relationships and observations.** Confirm whether `entities import` rebuilds
  relationships and full observation history, or only current-entity snapshots —
  and if the latter, what additional step restores edges and provenance.
- **Idempotency across a full dataset.** Confirm the per-chunk idempotency holds
  for the entire realistic dataset on the "rebuild again" pass, not just a small
  sample.
- **Idempotency prefix across a teardown.** The "rebuild again" step (7) reuses
  the same `--idempotency-prefix` as the first build, but against a _fresh_
  instance whose idempotency ledger was destroyed at teardown (step 6). Confirm
  whether the prefix's no-op safety is per-instance (so a post-teardown rebuild
  re-writes from scratch as intended) or whether any cross-instance state would
  cause the second build to skip writes it should perform. Record which.
- **Snapshot-equivalence semantics.** "Equivalent to the source" (steps 5, 8)
  needs a stated definition before the run, not after. Decide what equivalence
  means: exact `snapshots export` byte-equality, equality modulo timestamps and
  instance-local ids, or equality of the reduced field values per entity. Record
  the chosen definition and the comparison method, since a too-strict definition
  fails on benign id/timestamp differences and a too-loose one misses real
  rebuild gaps.

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
