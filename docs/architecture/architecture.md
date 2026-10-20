# Neotoma architecture

Neotoma is the system of record for AI agents: it keeps observations with their sources, computes the current value of each field, and serves both to connected agents over MCP, REST, and the CLI.

Applies to v0.25.0 and main. Where main differs from v0.25.0, the text says so.

Terms on this page follow the [canonical vocabulary](../vocabulary/canonical_terms.md).

## Scope

This page covers:

- What Neotoma does and what it leaves to the systems built on it
- The data model: sources, observations, entities, snapshots, and relationships
- How a write becomes a current value, and how reads, corrections, and deletions work
- The interfaces, storage, outbound signals, and security boundaries

It does not cover:

- Field-level schemas (see [`docs/subsystems/schema.md`](../subsystems/schema.md))
- Reducer internals (see [`docs/subsystems/reducer.md`](../subsystems/reducer.md))
- Deployment and hosting (see `docs/infrastructure/`)

## A record, not recall

Neotoma does not try to remember on an agent's behalf or rank what to retrieve. It records what was observed, where each observation came from, and which observation currently sets each field. Agents, pipelines, and applications read that record, reason and act outside Neotoma, and write their results back as new observations.

Neotoma does not decide, plan, or take actions. The systems above it do. Plans, decisions, and action logs those systems produce can be stored in Neotoma as entities like any other data.

```text
Agents, pipelines, and applications
  read current values and provenance; reason, decide, and act;
  write results back as observations
        |                         ^
        | store, correct          | retrieve, subscribe
        v                         |
Neotoma (the system of record)
  sources -> observations -> entity snapshots
  relationships, timeline events, schema registry
```

## Data model

### Sources

A source is the input a write arrived with: a file, raw text, or a structured payload. File sources are stored by content hash (SHA-256), and the hash is unique per user, so uploading the same file twice reuses one source.

### Interpretations

An interpretation records one extraction over a stored source: the entities a client extracted from it and the extraction configuration the client reports (provider, model, temperature, and a prompt hash). Neotoma stores files as they arrive and does not run an extraction model over them; the agent or client extracts the fields and passes them with an `interpretation` block on `store`, or through `create_interpretation`. A new interpretation of the same source adds new observations and leaves the earlier ones in place.

### Observations

An observation is a set of field values about one entity, written at one time. Observations from a store or an interpretation are linked to their source. A correction observation has no source. Observation ids are not portable across instances. An observation id is a hash of its source id, its interpretation, its entity id, and its fields (`generateObservationId` in `src/services/observation_identity.ts`), and a source id is a hash of the user id and the content hash (`generateDeterministicSourceId` in `src/services/source_identity.ts`). Both therefore depend on the user and on the interpretation run: through the CLI each install can have its own install-fingerprinted local user (`ensureLocalSandboxUser` in `src/services/local_auth.ts`), so storing the same data on another install can produce different source and observation ids, and each interpretation run gets a new id, so its observations get new ids too. Entity ids, described below, agree across instances. Do not rely on source or observation ids matching across instances.

Fields that the entity's schema does not declare are kept as raw fragments rather than dropped.

### Entities

An entity is one person, company, task, invoice, or other thing that observations are about. Its id is a hash of the entity type and its identity fields (for most types, the normalized canonical name), so the same identity resolves to the same id. In sandbox mode, or when `NEOTOMA_TENANT_SCOPED_ENTITY_IDS` is set, the user id is folded into the hash so two users can hold same-named entities separately.

### Entity snapshots

A snapshot is the current value of each field, computed by the reducer from the entity's observations using the merge policy declared in the schema for each field. The policies are `last_write` (the default), `highest_priority`, `most_specific`, and `merge_array`; main also adds `merge_array_by_key` (not in v0.25.0). Each field in a snapshot names the observation that set it. Given the same observations and the same merge policies, the reducer produces the same snapshot.

Under the default policy a later store changes only the fields it sets; the other fields keep their current values.

### Relationships

A relationship is a typed connection between two entities, such as `PART_OF` or `REFERS_TO`. The type vocabulary is a runtime registry. Relationships are stored as relationship observations and reduced to relationship snapshots, the same way entities are. Deleting a relationship adds an observation that marks it deleted, and `restore_relationship` restores it.

### Timeline events

Timeline events are derived from date fields on a snapshot. When a schema declares `temporal_fields`, only those fields produce events; otherwise a date-field heuristic applies. Event ids are hashes of the source, entity, field, and timestamp.

### Schema registry

Entity schemas (fields, types, merge policies, and identity rules) live in a registry that can be extended at runtime. Type checks on write are uneven today. A plain store keeps a value of the wrong type for a declared field out of the snapshot and stores it as an unknown field (a raw fragment). A `date` field accepts any string, and `correct()` does not check types, so both can put a wrong-type value into the snapshot (issues [#2219](https://github.com/markmhendrickson/neotoma/issues/2219) and [#2699](https://github.com/markmhendrickson/neotoma/issues/2699); `docs/known_limitations.md`, added by #2697, lists these limits).

## How a write becomes a current value

1. A client calls `store` (MCP tool, `POST /store`, or `neotoma store`).
2. Neotoma records the source, resolves each entity to its id, and writes one observation per entity. Undeclared fields go to raw fragments.
3. The reducer recomputes the snapshot of each affected entity, and timeline events are derived from its date fields.
4. Neotoma emits a substrate event describing the completed write (see [Outbound signals](#outbound-signals)).

A file is stored as a source as it arrives. Its fields enter the record only when a client sends extracted entities for it, which then follow the same steps.

## Reads

- `retrieve_entities` and `retrieve_entity_by_identifier` return entities with their current snapshots.
- `retrieve_entity_snapshot` returns one entity's snapshot with per-field provenance. It also answers an as-of question for that one entity: `at` limits the observations it uses by when they were observed, and `at_ingested` by when Neotoma received them.
- `list_observations` and `retrieve_field_provenance` show which observations exist for an entity and which one set each field.

There is no as-of query across the whole record: point-in-time reads work one entity at a time. The export commands (`neotoma entities export`, `neotoma snapshots export`, and `neotoma memory-export`) carry current values only, not observation history.

## Corrections and deletions

A correction adds a new observation with source priority 1000 and no source. The earlier value is not edited and stays listed among the entity's observations. A correction does not always stay in effect: under the default `last_write` policy a later write to the same field can replace it (tracked in [issue #2033](https://github.com/markmhendrickson/neotoma/issues/2033)).

Who made a correction is recorded only for writes over MCP, and only as the client name that the MCP client reports about itself.

Deleting an entity records the deletion and hides the entity from snapshots and queries; its observations are not removed. `restore_entity` reverses it. The separate GDPR deletion path in `src/services/gdpr_deletion.ts` handles erasure requests.

## Interfaces

| Interface | Where it is defined | Notes |
| --- | --- | --- |
| MCP | `src/server.ts`, `src/tool_definitions.ts` | stdio, and HTTP at `/mcp` |
| REST | [`openapi.yaml`](../../openapi.yaml) | 112 paths on main, 109 in v0.25.0 |
| CLI | `src/cli/` | `neotoma <command>`; see the [CLI reference](../developer/cli_reference.md) |

On main, the MCP WebSocket bridge (`src/mcp_ws_bridge.ts`) binds to loopback by default and `NEOTOMA_WS_HOST` widens it; in v0.25.0 it binds to all interfaces. The Inspector is a web UI served by the same HTTP server.

## Storage

- **Database.** SQLite by default (`better-sqlite3` or `node:sqlite`). Set `NEOTOMA_DB_BACKEND=libsql` to use the libSQL driver, which runs statements off the Node event loop for local files and can connect to a remote sqld or Turso server through `NEOTOMA_DB_URL`. There is no PostgreSQL backend.
- **Files.** Source files are stored at `sources/<user_id>/<content_hash>` in the configured file storage.
- **Embeddings.** Semantic search over entities is optional. When `OPENAI_API_KEY` is set, Neotoma requests embeddings from OpenAI (`text-embedding-3-small`) and stores them in SQLite through `sqlite-vec`. Without the key, search uses structured filters only.

## Network use

Outbound requests Neotoma can make include the following. The list is not exhaustive; check the code before relying on the absence of a request.

- **Update checks.** The CLI checks the npm registry for a newer release about once a day (off with `--no-update-check` or `NO_UPDATE_NOTIFIER=1`). The stdio MCP server checks when a session starts and about every 6 hours after that (off with `NO_UPDATE_NOTIFIER=1`). The request carries only the package name, and the registry sees ordinary connection metadata.
- **OpenAI**, only when `OPENAI_API_KEY` is set: embeddings for semantic search, and model calls for schema recommendations and schema icons.
- **Webhooks** to the URLs that subscribers register (see [Outbound signals](#outbound-signals)).
- **Peer sync** to the peers an operator configures.
- **GitHub**, when issue sync is configured (`neotoma issues sync` with the server's `NEOTOMA_ISSUES_GITHUB_TOKEN`), and the GitHub API for release notes when `npm_check_update` runs with `include_release_notes`.
- **Issue reports.** `submit_issue` forwards reports to the instance named by `NEOTOMA_ISSUES_TARGET_URL`; when the variable is unset, that is the maintainer's instance (`DEFAULT_ISSUES_TARGET_URL` in `src/services/issues/types.ts`). Set it to an empty string to keep reports local.
- **Repo discovery.** Resolving which repository an issue is about can fetch that repository's `.well-known/neotoma.json` from `raw.githubusercontent.com` (`src/services/issues/repo_discovery_resolver.ts`).
- **The `npm_check_update` tool** queries the npm registry when an agent calls it.
- **Google sign-in**, when configured: Google's authorization endpoint and signing keys (`src/services/google_oidc.ts`).
- **Apple App Attest revocation**, when an AAuth attestation is verified: a request to Apple's revoked-list endpoint, or to `NEOTOMA_AAUTH_APPLE_REVOCATION_URL` (`src/services/aauth_attestation_revocation.ts`).
- **Tunnels**, when started with `--tunnel`: ngrok or cloudflared connect to their provider.
- **Google Fonts** in the browser: the server-rendered OAuth pages load fonts from `fonts.googleapis.com` and `fonts.gstatic.com` (`renderOauthPage` in `src/actions.ts`).

## Code layout

| Path | Role |
| --- | --- |
| `src/server.ts` | MCP server and tool handlers |
| `src/actions.ts` | HTTP API routes |
| `src/cli/` | The `neotoma` command |
| `src/services/` | Store, correction, resolution, query, and subscription logic |
| `src/reducers/` | Entity and relationship reducers |
| `src/repositories/` | Database drivers and connection lifecycle |

## Outbound signals

After a successful write, Neotoma emits a substrate event that reports what changed. It does not decide which changes matter or act on its own events.

- **SSE.** Subscribers on the event stream receive events from an in-memory buffer. Events are also written to the `substrate_events` table so a client can resume after a restart; that log keeps events for `NEOTOMA_EVENT_RETENTION_DAYS` (default 7).
- **Webhooks.** Delivery is best effort. Each event is retried in process after 1 s, 5 s, 30 s, and 5 min; nothing persists a retry queue. A subscription is deactivated after its failure limit (default 10) and rate-limited to 60 deliveries a minute.

Ordering and exactly-once delivery are not guaranteed. Consumers that need them build them on their side. See [`docs/subsystems/subscriptions.md`](../subsystems/subscriptions.md) and [`docs/subsystems/substrate_events.md`](../subsystems/substrate_events.md).

## Security boundaries

### Tenant isolation

Each user's data is isolated in the application layer. User-scoped queries filter on `user_id` (`src/services/entity_queries.ts`), and `getAuthenticatedUserId` in `src/actions.ts` rejects a caller-supplied user id that does not match the authenticated one. The exception is the local development user: on a local install, a request from the same machine with no credential acts as that user, and it may pass any `user_id`. Graph and relationship reads are covered as well as flat lists; `tests/security/tenant_isolation_matrix.test.ts` is the regression test. The database does not enforce row-level security. See [`docs/subsystems/auth.md`](../subsystems/auth.md#authorization).

### Encryption at rest

When `NEOTOMA_ENCRYPTION_ENABLED=true` with a key file (`NEOTOMA_KEY_FILE_PATH`) or a mnemonic (`NEOTOMA_MNEMONIC`), the SQLite adapter encrypts these columns with AES-256-GCM on write and decrypts them on read: observation fields, entity and relationship snapshots and their provenance, raw fragment values, schema recommendations, and the auto-enhancement queue payload. The `substrate_events` payload is encrypted with the same key. `neotoma db migrate-encryption` encrypts rows written before encryption was enabled.

Everything else stays in plaintext, and Neotoma has no file-level encryption:

- Source files on disk at `sources/<user_id>/<content_hash>`
- The markdown mirror, when enabled
- Metadata columns: entity ids, types, canonical names, and aliases; source filenames, MIME types, and provenance; timeline events; observation provenance; relationship observation metadata; interpretation configuration; and IDs, timestamps, and hashes everywhere
- Embedding tables and auth tables
- Log files. A `NEOTOMA_LOG_ENCRYPTION_ENABLED` setting and `neotoma logs tail --decrypt` exist, but no code path writes encrypted log lines, in v0.25.0 or on main.

Where any of that matters, put the data directory on an encrypted volume (for example LUKS, FileVault, or a cloud provider's volume encryption).

### In transit and in logs

Put HTTPS (a reverse proxy or tunnel) in front of the HTTP API and `/mcp` whenever they are reachable beyond localhost. Logs must not contain personal data (see [`docs/subsystems/privacy.md`](../subsystems/privacy.md)).

## What Neotoma does not do

- Act as an agent, plan, or execute side effects
- Infer facts that no observation states
- Rank or prioritize changes for consumers
- Guarantee ordered or exactly-once delivery of signals
- Answer as-of queries across the whole record, or export history

## Related documents

- [`docs/subsystems/observation_architecture.md`](../subsystems/observation_architecture.md)
- [`docs/subsystems/reducer.md`](../subsystems/reducer.md)
- [`docs/subsystems/relationships.md`](../subsystems/relationships.md)
- [`docs/architecture/determinism.md`](determinism.md)
- [`docs/architecture/consistency.md`](consistency.md)
- [`docs/foundation/core_identity.md`](https://github.com/markmhendrickson/neotoma/blob/main/docs/foundation/core_identity.md) (opens on GitHub)

## Agent Instructions

### When to load this document

Load it before a structural or cross-module change, when adding an MCP tool or REST route, when changing how writes reach snapshots, or when reviewing a pull request for those changes.

### Required co-loaded documents

- `docs/vocabulary/canonical_terms.md`
- `docs/conventions/documentation_standards.md`
- `docs/architecture/determinism.md`
- `docs/architecture/consistency.md`

### Constraints agents must enforce

1. Writes reach snapshots only through observations and the reducer; no code path edits a snapshot directly.
2. Reducers stay deterministic: the same observations and merge policies produce the same snapshot.
3. Every snapshot field names the observation that set it.
4. A correction adds an observation; it never edits an earlier one.
5. User-scoped reads and writes filter on the authenticated `user_id`.
6. Neotoma emits signals about completed writes; it does not act on them.
7. Statements in this document describe shipped behaviour; anything planned goes in an issue or a plan, not here.

### Forbidden patterns

- Editing or deleting an observation to change a current value
- Snapshot writes that bypass the reducer
- Strategy, planning, or execution logic inside Neotoma
- Personal data in logs
- Describing Neotoma as a memory layer or a state layer (see the canonical vocabulary)

### Validation checklist

- The change keeps writes flowing through observations and the reducer
- Reducer output stays deterministic for the same inputs
- Provenance is kept for every new or changed field
- Tenant isolation holds for new reads, including graph reads
- This document is updated when the described behaviour changes
