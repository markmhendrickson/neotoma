# Known limitations

This page lists specific behaviours of the current build that a developer or an integrating agent will run into. Each entry says what you will observe, any workaround, and the issue that tracks it. An entry is removed from this page when its fix ships.

Applies to the published `neotoma@0.25.0` and to `main` as of 2026-10-20. Every entry has a tracking issue.

- [A later ordinary write can replace a correction](#a-later-ordinary-write-can-replace-a-correction)
- [A correction, or a stored date, is not checked against the declared type](#a-correction-or-a-stored-date-is-not-checked-against-the-declared-type)
- [A stored value of the wrong type is left out of the snapshot and reported as undeclared](#a-stored-value-of-the-wrong-type-is-left-out-of-the-snapshot-and-reported-as-undeclared)
- [As-of reads are per entity](#as-of-reads-are-per-entity)
- [Export carries current state only](#export-carries-current-state-only)
- [Source and observation IDs are not portable across instances](#source-and-observation-ids-are-not-portable-across-instances)
- [Who wrote or corrected a value is the writer's own claim](#who-wrote-or-corrected-a-value-is-the-writers-own-claim)
- [Log encryption does not encrypt log files](#log-encryption-does-not-encrypt-log-files)
- [`neotoma setup --tool` configures five hosts](#neotoma-setup---tool-configures-five-hosts)

## A later ordinary write can replace a correction

**What you will observe.** `correct()` records the new value as an observation with priority 1000, and the snapshot shows it. For a field that uses the `last_write` merge policy, which is the default, the snapshot keeps the value from the observation with the latest observed time and does not compare priorities. A later ordinary write to the same field (a re-ingest, a sync, or an agent storing the record again) therefore replaces the corrected value in the snapshot, with no warning. The correction is still readable as an observation of that entity.

**Workaround.** After a write that may touch a corrected field, read the field's provenance (`retrieve_field_provenance`) and correct the field again if a later observation set it.

**Tracking.** [#2033](https://github.com/markmhendrickson/neotoma/issues/2033)

## A correction, or a stored date, is not checked against the declared type

**What you will observe.** `correct()` writes the value it is given into the snapshot even when the field declares another type: correcting a `number` field to the string `"thirty"` leaves `"thirty"` in the snapshot. On store, a `date` field accepts any string, so a value such as `"not a date"` is kept in the snapshot as the date.

**Workaround.** Check values against the declared types (`describe_entity_type`) in the writing agent before you call `correct()` or store a date.

**Tracking.** [#2699](https://github.com/markmhendrickson/neotoma/issues/2699)

## A stored value of the wrong type is left out of the snapshot and reported as undeclared

**What you will observe.** On store, a value whose type does not match a declared field (a string for a `number` field, or a number for a `string` field) is kept on the observation but left out of the snapshot. The store response lists the field under `unknown_fields`, and its hint describes the field as undeclared, although the schema declares it.

**Workaround.** When a declared field appears in `unknown_fields`, compare the value with the declared type (`describe_entity_type`) and store it again with that type.

**Tracking.** [#2219](https://github.com/markmhendrickson/neotoma/issues/2219) (item 2)

## As-of reads are per entity

**What you will observe.** `retrieve_entity_snapshot` reads one entity as of a past time, with `at` (event time) and `at_ingested` (ingestion time). It is the only MCP tool that takes an as-of time, so there is no as-of query across the whole record: `retrieve_entities` and the other list and search tools return current state only.

**Workaround.** Find the entities you need with a current-state query, then read each one with `retrieve_entity_snapshot` and `at`.

**Tracking.** [#2700](https://github.com/markmhendrickson/neotoma/issues/2700)

## Export carries current state only

**What you will observe.** `neotoma entities export` writes each entity's current fields. `neotoma snapshots export` adds a per-field provenance map (field to the observation ID that set it) and attribution summaries. The Markdown mirror writes entities, relationships, sources, and timeline days. None of them writes the observations themselves, so an export does not carry observation history, and importing it into an empty instance with `neotoma entities import` gives each entity one new observation. Earlier values and per-entity as-of reads do not survive the round trip.

**Workaround.** To move or back up a record with its history, copy the data directory (the SQLite database and the source files) rather than exporting. One entity's full history can be read with `list_observations` or `GET /entities/{id}/observations`.

**Tracking.** [#2250](https://github.com/markmhendrickson/neotoma/issues/2250)

## Source and observation IDs are not portable across instances

**What you will observe.** Entity IDs are derived from the entity type and its identifying fields, so the same record gets the same entity ID in every instance. Source and observation IDs are not portable. A source ID hashes the owning user's ID with the content, and an observation ID hashes the source ID, the interpretation run, the entity, and the fields. Storing the same input in two instances gives the same entity ID, but whether the source and observation IDs differ depends on the write path:

- `neotoma store` from the CLI (offline): different source and observation IDs, because each install has its own local user.
- stdio MCP `store`: the source and observation IDs repeat, because both instances write as the shared default user.
- stdio MCP file `store` followed by `create_interpretation`: the source ID repeats and the observation ID differs, because every interpretation run gets a new ID.

**Workaround.** Match records across instances by entity ID. Do not rely on source or observation IDs matching across instances.

**Tracking.** [#2681](https://github.com/markmhendrickson/neotoma/issues/2681) (item 2)

## Who wrote or corrected a value is the writer's own claim

**What you will observe.** Each observation records the writer in its provenance. Unless the writer signs its requests with an agent identity (AAuth), that record is what the client says about itself: the client name from the MCP `initialize` handshake, or an `X-Client-Name` header over HTTP, stored with the attribution tier `unverified_client`. A write that sends neither, which includes writes from the `neotoma` CLI, records no writer name.

**Workaround.** Where attribution has to be verifiable, give each agent a signed identity and a grant; see the [AAuth reference](subsystems/aauth.md). Treat `unverified_client` attribution as a label, not as proof.

**Tracking.** [#2256](https://github.com/markmhendrickson/neotoma/issues/2256)

## Log encryption does not encrypt log files

**What you will observe.** `NEOTOMA_LOG_ENCRYPTION_ENABLED=true` is read into configuration, but no log writer uses it, so log files are written in plaintext whether or not it is set. `neotoma logs tail --decrypt` therefore finds no encrypted lines to decrypt.

**Workaround.** Keep the log directory on an encrypted volume and restrict who can read it. Do not rely on the flag.

**Tracking.** [#2698](https://github.com/markmhendrickson/neotoma/issues/2698)

## `neotoma setup --tool` configures five hosts

**What you will observe.** `neotoma setup --tool` supports `claude-code`, `cursor`, `codex`, `openclaw`, and `claude-desktop`. `--tool windsurf`, `--tool continue`, and `--tool vscode` are accepted and exit successfully, but they write the MCP entry to `.cursor/mcp.json`, which is Cursor's file, and create no configuration for the host you named. Nothing warns that this happened.

**Workaround.** Configure Windsurf, Continue, and VS Code by hand, using the per-host guides in the [integrations matrix](integrations/matrix.md).

**Tracking.** [#2691](https://github.com/markmhendrickson/neotoma/issues/2691)
