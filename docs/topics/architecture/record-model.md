# The record model

Neotoma separates a thing's stable identity from observations about it and the current view computed from those observations.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## Four useful objects

A **source** is recorded material, such as a file or an explicitly supplied piece of structured data. An **observation** states one or more fields about a target. An **entity** is the stable target: a person, company, task, document, or another declared type. A **snapshot** is the current field view computed for that entity. These objects have different jobs. A new observation may change a snapshot without changing the entity's identity or rewriting the source.

The common path for a file is source to interpretation to observation to entity snapshot. A structured write can also record an observation without a separately stored source file. Do not assume every observation has raw document bytes behind it; inspect the provenance on the row in question.

## Why identity and state are separate

An entity ID identifies the logical target so observations from different submissions can refer to the same thing. The current name or status is an observed value and may change. Keeping the target separate from its current fields lets readers compare past and present assertions without treating each edit as a new thing.

Entity resolution and merges have their own rules. A field value resembling a person or company name does not guarantee that a new related entity or relationship was created. Inspect the resulting entity and graph rather than inferring those links from the input shape.

## Read the current view

The reducer uses the declared entity schema and its per-field merge policies to choose current fields. That makes the snapshot a useful read surface, but the observations remain the durable evidence. A snapshot field should lead back to the observation that supplied it. If a field did not appear after a write, check the active schema and the stored observation before assuming the write changed the snapshot.

Read [Observations](https://neotoma.io/observations/) for the evidence layer and [Current snapshots](https://neotoma.io/current-snapshot/) for the derived view. The longer [entity reference](../../subsystems/entities.md) and [snapshot reference](../../subsystems/entity_snapshots.md) describe their stored forms.
