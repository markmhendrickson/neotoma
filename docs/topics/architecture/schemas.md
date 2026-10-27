# Schemas and field rules

An entity schema declares which fields belong to a type and how observations for each field become a current value.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## Declared fields

The schema registry describes an entity type's fields, their types, optional validation and conversion rules, and its merge policy. That declaration is a practical part of the write contract. If an agent submits a key that has no declared field, a successful store response does not mean that key appears on the entity snapshot. It may be retained among raw fragments instead.

For this reason, a client should inspect the relevant schema before choosing field names. After storing, retrieve the entity and assert the intended field and value. Checking only that the write action returned success leaves a real failure mode undetected.

## Merge policy determines current state

Two observations can disagree without either being deleted. The reducer applies the field's configured policy, such as recency, source priority, specificity, or an array merge. The policy matters more than a general slogan about which writer is authoritative. An automatically discovered schema can use `last_write` by default; a supplied source priority does not take effect for that field until a policy that uses priority is registered.

Omitting a field from a new observation is different from writing a value such as zero or null. A client should choose intentionally according to the field semantics. This is particularly important for counters, statuses and arrays, where a syntactically accepted value can have a surprising effect.

## Changes to a schema

Schemas are versioned. Adding an optional field is a different change from renaming a field or changing its meaning. Review the declared type and any migration before changing a contract that existing observations use. For the full registry format, see the [schema registry reference](../../subsystems/schema_registry.md). For the effective winner rules and examples, read [conflict resolution](../../subsystems/conflict_resolution.md).

The schema also affects what an explanation of a snapshot can honestly claim. The same observations under a different active policy may produce another current view. Record the schema version and policy used when a result must be auditable or compared across deployments. [Current snapshots](https://neotoma.io/current-snapshot/) covers the derived read surface.
