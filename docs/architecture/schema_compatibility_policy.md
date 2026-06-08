# Schema Compatibility Policy

## Scope

This document is the **stated compatibility guarantee** for registered
entity-type schemas: what kinds of schema change are safe for an adopter
building on Neotoma, what counts as breaking, and how a breaking change is
versioned and migrated so a schema in use never changes shape under a consumer
without an explicit version bump and a migration path.

It is the policy half of schema stability. The _mechanism_ it relies on —
`schema_version`, additive expansion, the registry, deterministic reducers —
is documented in [`schema_expansion.md`](schema_expansion.md),
[`schema_registry.md`](schema_registry.md), and
[`schema_handling.md`](schema_handling.md). This document states the guarantee
those mechanisms back; it does not restate the mechanism.

It satisfies commitment **#1 (Schema stability and versioned evolution)** in
[`../foundation/adopter_dependency_commitments.md`](../foundation/adopter_dependency_commitments.md)
and is the policy referenced by tracking issue #1520.

## The guarantee, in one sentence

A registered schema that an adopter depends on will not change shape under them:
**additive changes are always safe, breaking changes require an explicit
`schema_version` bump and a migration path, and a schema in active use is never
silently mutated.**

## What is a safe (additive, non-breaking) change

These changes preserve compatibility and do **not** require a version bump.
Existing observations remain valid and readable; existing consumers keep working
unchanged.

- **Adding a new optional field** to a schema.
- **Adding a new entity type** to the registry.
- **Adding a new converter** for an existing field that does not change already
  stored values.
- **Adding `aliases`** to an entity type (duplicate-type equivalence hints).
- **Widening a field's accepted input** (e.g. accepting an additional
  representation that canonicalizes to the same stored value).
- **Relaxing a constraint** (making a previously required field optional).
- **Adding `temporal_fields`, `reference_fields`, or `canonical_name_fields`
  declarations** that derive from data already present, where the derivation is
  deterministic and does not retroactively change existing snapshots' identity.

Schema expansion (the automatic detection of recurring `unknown_fields`) only
ever produces additive changes, and only under explicit user opt-in — see
[`schema_expansion.md`](schema_expansion.md).

## What is a breaking change

These changes can invalidate or reshape data an adopter already relies on. Each
**requires an explicit `schema_version` bump and a stated migration path**; none
may be applied silently to a schema in use.

- **Removing or renaming a field.**
- **Changing a field's type** in a way that is not a pure widening (e.g.
  `string` → `number`, or narrowing an enum by removing a value).
- **Adding a new required field** without a default (existing observations would
  fail validation).
- **Changing `canonical_name_fields`** in a way that alters how existing entities
  resolve to identity (this can re-bucket already-stored entities and is treated
  as the most sensitive breaking change).
- **Changing a field's declared `merge_policy`** in a way that changes the
  reduced snapshot for existing observations.
- **Removing an entity type, alias, or converter** that stored data depends on.

## How a breaking change is handled

When a breaking change is genuinely required, the obligations are:

1. **Version bump.** The new schema is registered under an incremented
   `schema_version`. The prior version is not mutated; existing observations stay
   bound to the version they were written under.
2. **Migration path.** A documented, deterministic migration describes how data
   under the old version is reinterpreted under the new one. Per the immutability
   invariant, migration creates **new** observations (reinterpretations); it does
   not edit existing observations or source in place
   ([`../subsystems/observation_architecture.md`](../subsystems/observation_architecture.md)).
3. **Coexistence.** Old-version and new-version observations coexist; the reducer
   resolves each under its own version. An adopter is never forced to migrate
   instantaneously.
4. **Announcement.** The breaking change is named in the release supplement's
   "Breaking changes" section, consistent with the contract-stability discipline
   (see [`openapi_contract_flow.md`](openapi_contract_flow.md) and commitment #2).

## What an adopter can rely on

- A schema you build against today will not start rejecting or reshaping your
  existing data because of a Neotoma upgrade, unless that upgrade carries an
  explicit `schema_version` bump for that type and a migration path you can read.
- Additive evolution (new fields, new types) will not break your existing reads
  or writes.
- Identity stability: an entity's `canonical_name`/`entity_id` derivation will
  not change under you without a versioned, migrated, announced change — because
  identity churn is the most disruptive thing a substrate can do to an adopter.
- You can pin to a `schema_version` and know its shape is frozen.

## Relationship to the support window

How _long_ a prior `schema_version` remains readable and reducible after a newer
version ships is governed by the **backward-compatibility support window**
(commitment #3,
[`../foundation/adopter_dependency_commitments.md`](../foundation/adopter_dependency_commitments.md),
tracking #1522). This document states _what_ compatibility means; the support
window states _for how long_ old versions are guaranteed. The two are
complementary: this policy guarantees old-version data is never silently
reshaped, and the support window guarantees how long it stays first-class.

## Related documents

- [`schema_expansion.md`](schema_expansion.md) — the additive auto-expansion mechanism.
- [`schema_registry.md`](schema_registry.md) — how schemas and versions are stored.
- [`schema_handling.md`](schema_handling.md) — runtime schema resolution.
- [`../subsystems/observation_architecture.md`](../subsystems/observation_architecture.md) — immutability; reinterpretation creates new observations.
- [`determinism.md`](determinism.md) — deterministic extraction across versions (commitment #4).
- [`../foundation/adopter_dependency_commitments.md`](../foundation/adopter_dependency_commitments.md) — the dependency-stability scorecard this policy satisfies (#1).
