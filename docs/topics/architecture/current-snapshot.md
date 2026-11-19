# Current snapshots

An entity snapshot is the current field view computed from observations under an active schema and its merge policies.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## A view with a derivation

The snapshot is not an independent assertion. The reducer computes it from observations about one entity. Each current field has provenance pointing to the observation that supplied the selected value. A reader can follow that pointer to see whether the value came from a file, a structured write, or a correction.

Because fields are selected separately, one snapshot can combine values from different observations. A source that supports the current name need not be the source that supports the current status. Inspect the provenance for the field at issue, rather than attaching one blanket source citation to the whole entity.

The same observation set, schema and reducer configuration are intended to produce the same current fields. The computation timestamp can differ across runs. A change to the schema or merge policy can change the resulting view even when the source observations have not been rewritten, so the schema version belongs in a careful explanation of a current value.

## Read after a write

The structured read path is designed for immediate read-after-write visibility. Retrieve by a stable entity identifier or an appropriate typed filter and verify the field you just wrote. If a query unexpectedly returns nothing, prove the query works on a known positive case before reporting absence. Search ranking is not the boundary for checking whether a structured write landed.

## History is narrower than a universal replay claim

Neotoma has a per-entity as-of read path for historical inspection. Do not infer from that a whole-record snapshot at an arbitrary time across every entity. Likewise, a current snapshot export is not automatically a complete backup of sources, observations, configuration and history. Use the documented backup path when the goal is recovery.

The [snapshot reference](../../subsystems/entity_snapshots.md) describes fields and provenance. [Consistency](../../architecture/consistency.md) describes the structured read contract. [Sources and provenance](https://neotoma.io/provenance/) shows where to begin an investigation.
