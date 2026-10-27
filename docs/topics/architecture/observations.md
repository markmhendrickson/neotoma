# Observations

An observation records a claim about an entity at a point in the record's history; a later claim does not edit the earlier one.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## What an observation carries

An observation targets an entity and carries fields, timing, schema context, and provenance. Its source may be a supplied file or another recorded input. A structured agent write or correction can have no separate source file, so the absence of a document link is not by itself evidence that the observation is invalid. The observation's attribution and write context still matter.

Fields are interpreted under a declared entity schema. A submitted key that the schema does not declare may be retained as a raw fragment rather than appearing in the entity's current fields. After a write, retrieve the entity and verify the exact field, not merely the response status.

An omitted field says less than an explicit value. For example, omitting a status from a new observation leaves the previous status claim available for the reducer; submitting a concrete status creates another claim to consider. Null, zero and an empty string also have their own meanings under the schema and should not be used as a generic spelling for "unknown."

## Corrections add evidence

A correction creates another observation. The earlier observation remains inspectable, which lets a reader understand why the current value differs from the first recorded value. Corrections receive a distinct priority in the configured reduction path, but the effective result depends on the field's merge policy. Do not assume the same winner rule for every field.

For a field whose policy is `last_write`, the later observed timestamp decides. For a field configured as `highest_priority`, the source priority and then defined tie breakers decide. Array merge policies have their own contribution rules. Read the policy for the entity type before predicting the winner.

## Reinterpretation and history

Reinterpreting a source creates new observations with its own configuration context; it does not silently alter the older interpretation. AI-assisted extraction may produce a different result on a later run, so inspect the new observation and its configuration. Deterministic snapshot computation begins after the observation set and schema are fixed.

The [observation architecture](../../subsystems/observation_architecture.md) describes the lifecycle. [Conflict resolution](../../subsystems/conflict_resolution.md) defines the field policies. Continue to [Current snapshots](https://neotoma.io/current-snapshot/) to see how a present answer is computed.
