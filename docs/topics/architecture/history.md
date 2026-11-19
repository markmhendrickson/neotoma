# Inspect a change

Compare an entity's current field with the observations that led to it before drawing a conclusion about what changed.

Applies to v0.26.0 (`b6ae615`, published October 27th, 2026). The description was originally checked against source `4779784` on October 24th, 2026; that source is included in this release. Use the running instance contract for exact behavior.

## Start from the current field

Retrieve the entity snapshot by ID and identify the field in question. Check the entity type and active schema. The current field is a computed result; it is not a copy of one mutable source document. Field provenance identifies the observation chosen by the applicable merge policy. If there is no field in the snapshot, inspect whether the attempted write became a raw fragment because the field was not declared.

Next list the entity's observations. Compare the candidate values, their recorded times, source kinds, and attribution. A correction contributes another observation. The old observation remains in the normal history path, so you can see both the previous claim and the new one. A source-backed observation may also lead to a source and an interpretation record; a direct structured write can have no separate file to open.

| Question                    | Read                                        |
| --------------------------- | ------------------------------------------- |
| What is current?            | Entity snapshot, including field provenance |
| What claims competed?       | Observations for the entity and field       |
| Why was one selected?       | Active schema and field merge policy        |
| What material was supplied? | Source and interpretation, when present     |

## Explain the transition accurately

Avoid describing every disagreement as a later write replacing an earlier one. Policies can use source priority, recency, specificity, or array behavior. State which policy the active schema uses and which observation it selected. A recorded time and an ingestion time also answer different historical questions; do not silently substitute one for the other.

Provenance makes the recorded path inspectable. It does not certify that a source statement was factually true, nor that an AI interpretation would produce identical wording on another run. [Sources and provenance](https://neotoma.io/provenance/) explains the evidence boundary. [Current snapshots](https://neotoma.io/current-snapshot/) explains the resulting view, while the [observation reference](../../subsystems/observation_architecture.md) holds implementation detail.
