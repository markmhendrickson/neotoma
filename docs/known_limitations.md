# Known limitations

This page lists specific behaviours of the current build that a developer or an integrating agent will run into. Each entry says what you will observe, any workaround, and the issue that tracks it. An entry is removed from this page when its fix ships.

Applies to the published `neotoma@0.25.0` and to `main` as of 2026-10-21. Every entry has a tracking issue.

- [A later ordinary write can replace a correction](#a-later-ordinary-write-can-replace-a-correction)
- [A correction, or a stored date, is not checked against the declared type](#a-correction-or-a-stored-date-is-not-checked-against-the-declared-type)
- [A stored value of the wrong type is left out of the snapshot and reported as undeclared](#a-stored-value-of-the-wrong-type-is-left-out-of-the-snapshot-and-reported-as-undeclared)
- [As-of reads are per entity](#as-of-reads-are-per-entity)
- [Export carries current state only](#export-carries-current-state-only)
- [Source and observation IDs can differ between instances](#source-and-observation-ids-can-differ-between-instances)
- [Who wrote or corrected a value is the writer's own claim](#who-wrote-or-corrected-a-value-is-the-writers-own-claim)
- [A store that fails partway does not always say what was stored](#a-store-that-fails-partway-does-not-always-say-what-was-stored)
- [Not every read says whether its answer is complete](#not-every-read-says-whether-its-answer-is-complete)
- [MCP, REST and the CLI are separate implementations](#mcp-rest-and-the-cli-are-separate-implementations)
- [Log encryption does not encrypt log files](#log-encryption-does-not-encrypt-log-files)
- [`neotoma setup --tool` configures five hosts](#neotoma-setup---tool-configures-five-hosts)
- [CLI data commands need a token after a plain npm install](#cli-data-commands-need-a-token-after-a-plain-npm-install)
- [`neotoma init` adds a Cursor MCP entry without asking](#neotoma-init-adds-a-cursor-mcp-entry-without-asking)
- [`neotoma init` and `neotoma setup` write different MCP entries on separate databases](#neotoma-init-and-neotoma-setup-write-different-mcp-entries-on-separate-databases)
- [The `npm_check_update` tool ignores `NO_UPDATE_NOTIFIER`](#the-npm_check_update-tool-ignores-no_update_notifier)
- [Claude Code hooks fail quietly when the local API is not running](#claude-code-hooks-fail-quietly-when-the-local-api-is-not-running)

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

## Source and observation IDs can differ between instances

**What you will observe.** Entity IDs are derived from the entity type and its identifying fields, so the same record gets the same entity ID on every install, unless tenant-scoped entity IDs are on (`NEOTOMA_SANDBOX_MODE` or `NEOTOMA_TENANT_SCOPED_ENTITY_IDS`). Source and observation IDs also depend on the user and on the interpretation run. A source ID hashes the owning user's ID with the content, and an observation ID hashes the source ID, the interpretation run, the entity, and the fields. The stdio MCP server writes as the shared local development user, so its source and observation IDs repeat across installs. The HTTP server, and therefore the CLI, runs by default (a loopback bind with no auth, outside production) in `local_sandbox` mode, which gives each install its own fingerprinted local user, so the same data stored on two installs gets different source and observation IDs. Each interpretation run also gets a new observation ID. Probed on 0.25.0 and `main`, with two fresh installs each:

- `neotoma store` from the CLI (`--offline`), whose local server ran in `local_sandbox` mode: same entity ID, different source and observation IDs.
- stdio MCP `store`, under the shared local development user: the entity, source, and observation IDs all repeat.
- stdio MCP file `store` followed by `create_interpretation`: the source ID repeats and the observation ID differs.

**Workaround.** Match records across instances by entity ID. Do not rely on source or observation IDs matching across instances.

**Tracking.** [#2681](https://github.com/markmhendrickson/neotoma/issues/2681) (item 2)

## Who wrote or corrected a value is the writer's own claim

**What you will observe.** Each observation records the writer in its provenance. Unless the writer signs its requests with an agent identity (AAuth), that record is what the client says about itself: the client name from the MCP `initialize` handshake, or an `X-Client-Name` header over the REST API, stored with the attribution tier `unverified_client`. A REST write without that header records no writer. The `neotoma` CLI never sends the header, so CLI writes record no writer.

**Workaround.** Where attribution has to be verifiable, give each agent a signed identity and a grant; see the [AAuth reference](subsystems/aauth.md). Treat `unverified_client` attribution as a label, not as proof.

**Tracking.** [#2256](https://github.com/markmhendrickson/neotoma/issues/2256)

## A store that fails partway does not always say what was stored

**What you will observe.** A `store` call is not one database transaction: it writes entities and observations one after another. If it fails or times out partway, the response does not always say what was stored, and a timeout or 502 error does not say whether the write landed. On the published 0.25.0, a retry with the same idempotency key replays whatever landed and reports success. On `main` (after [PR #2651](https://github.com/markmhendrickson/neotoma/pull/2651)), a same-key retry finishes the missing entities; a request that carries an interpretation returns `ERR_STORE_WRITE_INCOMPLETE` instead. `create_relationships` takes no idempotency key and reports no per-item outcome for a batch that stops partway.

**Workaround.** Retry with the same idempotency key (on `main` this completes the write; on 0.25.0 it does not), then read the record back to confirm what was stored.

**Tracking.** [#2144](https://github.com/markmhendrickson/neotoma/issues/2144) (umbrella), [#2657](https://github.com/markmhendrickson/neotoma/issues/2657), [#2656](https://github.com/markmhendrickson/neotoma/issues/2656)

## Not every read says whether its answer is complete

**What you will observe.** On `main`, entity list and search reads (MCP `retrieve_entities`, REST `POST /entities/query`, and `neotoma entities list`) return a `read_contract` whose coverage state says whether the result is complete, paginated, truncated, partial, or unknown ([PR #2612](https://github.com/markmhendrickson/neotoma/pull/2612)); 0.25.0 has no such field. Other reads carry no completeness statement: identifier lookup, relationships, observations, timeline events, and type counts. `list_timeline_events` filtered by `event_type` turns a database error into an empty result with `total: 0`. `get_entity_type_counts` can disagree with `retrieve_entities` for the same type, and list reads can omit `raw_fragments` for later entities in a large page. An empty or short result is therefore not always proof that nothing is stored.

**Workaround.** Where `read_contract` is present, check its coverage state before treating an empty result as absence. Elsewhere, confirm with a second read, such as an entity list for the type.

**Tracking.** [#2597](https://github.com/markmhendrickson/neotoma/issues/2597), [#2380](https://github.com/markmhendrickson/neotoma/issues/2380), [#2554](https://github.com/markmhendrickson/neotoma/issues/2554)

## MCP, REST and the CLI are separate implementations

**What you will observe.** The MCP `store` handler is a separate implementation from REST `POST /store`, and some checks differ. Guided schema mode rejects a type that no enabled bundle provides over MCP, but REST creates it. A same-key retry of a key stranded before the completion marker existed is resumed over HTTP and replayed as a success over MCP. Attribution differs too (see the attribution entry above). By default, the CLI writes as a per-install local user (the HTTP server's `local_sandbox` mode) and the stdio MCP server writes as the shared local development user, so in one data directory each surface sees only its own records.

**Workaround.** Read through the surface that wrote the data. Do not take a result seen through one surface as proof of the same result through another.

**Tracking.** [#2599](https://github.com/markmhendrickson/neotoma/issues/2599), [#2629](https://github.com/markmhendrickson/neotoma/issues/2629), [#2652](https://github.com/markmhendrickson/neotoma/issues/2652), [#2224](https://github.com/markmhendrickson/neotoma/issues/2224)

## Log encryption does not encrypt log files

**What you will observe.** `NEOTOMA_LOG_ENCRYPTION_ENABLED=true` is read into configuration, but no log writer uses it, so log files are written in plaintext whether or not it is set. `neotoma logs tail --decrypt` therefore finds no encrypted lines to decrypt.

**Workaround.** Keep the log directory on an encrypted volume and restrict who can read it. Do not rely on the flag.

**Tracking.** [#2698](https://github.com/markmhendrickson/neotoma/issues/2698)

## `neotoma setup --tool` configures five hosts

**What you will observe.** `neotoma setup --tool` supports `claude-code`, `cursor`, `codex`, `openclaw`, and `claude-desktop`. `--tool windsurf`, `--tool continue`, and `--tool vscode` are accepted and exit successfully, but they write the MCP entry to `.cursor/mcp.json`, which is Cursor's file, and create no configuration for the host you named. Nothing warns that this happened.

**Workaround.** Configure Windsurf, Continue, and VS Code by hand, using the per-host guides in the [integrations matrix](integrations/matrix.md).

**Tracking.** [#2691](https://github.com/markmhendrickson/neotoma/issues/2691)

## CLI data commands need a token after a plain npm install

**What you will observe.** After `npm install -g neotoma` and `neotoma init`, CLI data commands such as `neotoma store` return `AUTH_REQUIRED: Missing Bearer token`. A plain npm install points the CLI at the production profile, which needs a token.

**Workaround.** Prefix the command with `dev` (for example `neotoma dev store ...`), or set `NEOTOMA_ENV=development`.

**Tracking.** [#1905](https://github.com/markmhendrickson/neotoma/issues/1905)

## `neotoma init` adds a Cursor MCP entry without asking

**What you will observe.** `neotoma init` applies its default plan without prompts unless you pass `--interactive`. It creates a config directory, two local SQLite databases (`neotoma.db` for the development profile and `neotoma.prod.db` for production) and an env file, and it adds one MCP entry, `neotoma` (production profile, `neotoma.prod.db`), to Cursor's MCP config (`~/.cursor/mcp.json`) whether or not Cursor is installed.

**Workaround.** Run `neotoma init --interactive` to choose each step, or remove the entry from `~/.cursor/mcp.json` afterwards.

**Tracking.** [#2703](https://github.com/markmhendrickson/neotoma/issues/2703)

## `neotoma init` and `neotoma setup` write different MCP entries on separate databases

**What you will observe.** `neotoma init` writes one MCP entry, `neotoma`, which runs with the production profile and uses `neotoma.prod.db`. `neotoma setup --yes` writes two: `neotoma-dev`, which uses the development database (`neotoma.db`), and `neotoma`, on `neotoma.prod.db`. An agent connected to one entry does not see what an agent on the other entry stored.

**Workaround.** Connect every agent that should share a record to the same entry, and remove or disable the other one.

**Tracking.** [#2704](https://github.com/markmhendrickson/neotoma/issues/2704)

## The `npm_check_update` tool ignores `NO_UPDATE_NOTIFIER`

**What you will observe.** `NO_UPDATE_NOTIFIER=1` turns off the CLI's daily update check and the stdio MCP server's own checks. The `npm_check_update` MCP tool, whose description asks agents to call it at session start, does not read the variable: when an agent calls it, the server can request the latest version from the npm registry.

**Workaround.** Deny the `npm_check_update` tool in your MCP client's tool permissions if no registry request may be made.

**Tracking.** [#2705](https://github.com/markmhendrickson/neotoma/issues/2705)

## Claude Code hooks fail quietly when the local API is not running

**What you will observe.** The Claude Code plugin's hooks post each turn to `http://127.0.0.1:3080` unless `NEOTOMA_BASE_URL` is set. When nothing is listening there, the hooks catch the error, log it to stderr, and the turn is not captured.

**Workaround.** Start the local API (`neotoma api start --background`) before the session, or point `NEOTOMA_BASE_URL` at an API that is running.

**Tracking.** [#2706](https://github.com/markmhendrickson/neotoma/issues/2706)
