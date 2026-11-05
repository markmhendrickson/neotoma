# Vocabulary

These names separate the recorded input from the current answer an agent reads.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## The path from input to answer

| Term               | Reader meaning                                                                                                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Source**         | Material explicitly supplied to the record, such as a file. A direct structured fact may have no separate file source. |
| **Interpretation** | A recorded pass that reads a source and produces claims, with configuration and provenance when used.                  |
| **Observation**    | A recorded claim about an entity field, with its own context. A later correction creates another observation.          |
| **Entity**         | A stable identity under an entity type and schema. Several observations can concern one entity.                        |
| **Snapshot**       | The current field view computed from eligible observations under the schema's merge policies.                          |
| **Provenance**     | The path from a snapshot field to the observation and, when present, the source and interpretation behind it.          |

These are different objects. Retrieving a snapshot does not return every historical observation; exporting current entity fields does not necessarily preserve the source files or the full change history. [The record model](https://neotoma.io/record-model/) follows the objects in order. [Inspect a change](https://neotoma.io/history/) shows how to use them when values disagree.

## Names that affect operations

An **entity type** chooses a registered schema. The schema declares fields and policies for computing current values. A **raw fragment** can hold a field that was supplied but not declared, so a successful store response need not mean that field appears in the snapshot. A **relationship** is a typed edge between entities; a timeline event records a dated occurrence. Neither is a replacement for an entity's observation history.

The system of record claim applies to agent-held state. An adopter's own business database can remain authoritative for its operational data. Neotoma records the versioned state agents use around that system and lets readers inspect how its current answer was reached. This distinction is architectural; the [full vocabulary](../../vocabulary/canonical_terms.md) gives normative definitions, legacy terms, and naming rules for contributors.
