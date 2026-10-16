This minor release adds concurrency-safe writes: atomic multi-entity correction transactions, keyed array-row patches with version checks, and conditional create-if-absent stores. Stores can now record where data came from (`data_origin`). An interrupted keyed store now resumes on retry instead of reporting success, and an omitted `observation_source` is recorded as `unspecified` instead of `llm_summary`. It also scopes agent relationship grants on every edge-write path and binds the MCP WebSocket bridge to loopback by default.

**Action needed on upgrade:**

- If an AAuth agent grant has a `create_relationship` entry with no `relationship_types`, that agent can no longer write edges. Add `relationship_types` to the entry.
- If you run the standalone MCP WebSocket bridge and reach it from another host, set `NEOTOMA_WS_HOST` (for example `0.0.0.0`).
- If your own entities carry a field literally named `data_origin`, rename it (for example to `origin_label`).

See "Breaking changes".

## Highlights

- **Atomic correction transactions.** `POST /corrections/transaction`, MCP `correct_transaction` and the generic CLI request operation apply corrections across several entities in one database transaction. Scoped target reads, expected-field and observation-count checks, the corrections and the reducer read-back all commit together or not at all. A replay of the same payload returns the original result; reusing the key with a different payload is a conflict. Events are emitted only after commit (#2397).
- **Keyed array updates without lost rows.** For array fields a schema declares as `merge_array_by_key`, `POST /patch_array_item`, MCP `patch_array_item` and `neotoma array-item patch` change one row by key. Concurrent writers to different rows no longer overwrite each other. `POST /entities/{id}/batch_correct` applies several field corrections at once. `/correct` gains an optional `expected_version` precondition (refused with `409 ERR_FIELD_VERSION_CONFLICT` when stale) and `overwrite`, and snapshots return an opaque `entity_version` to pass back (#2528).
- **Conditional create.** `store` accepts `expected_entity_absent: true`. The request resolves one deterministic identity and creates it only if no such entity exists, checked inside the write transaction. The response carries an `operation_receipt`; an exact retry returns the original receipt alongside the current snapshot (#2614).
- **Where data came from: `data_origin`.** `store` (MCP, `POST /store`, `neotoma store --data-origin '<json>'`) accepts an origin claim: `kind` (`file`, `url`, `email`, `message`, `api`, `manual`, `other`), a `locator`, and optional detail fields. A per-entity value overrides the request value. It is stored on each observation's provenance and shown by `list_observations`, `retrieve_field_provenance` and entity snapshots (`data_origins`). It is a claim, not proof: the server never fetches a locator. Guest-token reads strip it, and request logs keep only its `kind` (#2636).
- **Interrupted stores finish on retry.** A keyed `/store` or MCP `store` with `commit: true` no longer stops when the client hangs up. Completion is recorded on the source, and a retry with the same key finishes any missing observations instead of replaying a partial write as success. A same-key retry waits for the in-flight call. Stores carrying an `interpretation` cannot be resumed and return `409 ERR_STORE_WRITE_INCOMPLETE` with the indexes of the entities still missing (#2651).
- **Omitted `observation_source` is no longer labelled model output.** It is now recorded as the new value `unspecified`, and the response carries one `store_warnings` entry with code `OBSERVATION_SOURCE_OMITTED`. Explicit values are stored as sent. Existing rows are not rewritten (#2635).

## What changed for npm package users

**CLI (`neotoma`)**

- `neotoma store --data-origin '<json>'`, or a `data_origin` key in a `--file` envelope.
- `neotoma store --observation-source unspecified` is accepted.
- `neotoma store --plan` (and `--dry-run`) now writes nothing. Before, it persisted a `sources` row and uploaded the raw content on every call, for both structured and file stores. A malformed `commit` value (`"false"`, `0`, `null`) is rejected instead of coerced into a write (#2471).
- `neotoma corrections create` gains `--expected-version` and `--overwrite`. New command `neotoma array-item patch` applies keyed array-row patches (#2528).

**Runtime / MCP**

- New MCP tools: `correct_transaction`, `patch_array_item`.
- Relationship grants are enforced on every edge write. A `create_relationship` capability entry must cover the relationship type and both endpoint entity types together. The check now runs for REST and MCP `store`, `create_relationship`, `create_relationships`, `restore_relationship`, `delete_relationship`, `create_interpretation` and schema reference-field auto-links, not only REST `/store`. A refused edge returns `403 capability_denied` with a structured `hint` on REST, and is reported per item in batch tools (#2525).
- A delete issued after a restore now takes effect. Same-edge lifecycle writes are serialized and the relationship snapshot is recomputed atomically (#2570).
- MCP `retrieve_field_provenance` no longer fails on corrected fields (no source document) or merged array fields. It returns `source: null` for corrections; a non-null source that does not resolve still errors (#2634).
- Collection reads (`GET /entities`, `POST /entities/query`) return a `read_contract` describing the scope, ordering, limits and uncertainty actually applied. Shared-catalog type metadata no longer exposes another user's private schemas. Active-schema listing now includes the caller's own user-scoped schemas, which a filter-parsing bug on the native adapter had dropped; entity-type listings and interpretation see them again (#2612).
- `get_entity_snapshot` accepts `include_cleared_fields` to return fields deliberately cleared to null with their winning provenance. Ordinary reads still omit nulls (#2620).
- The standalone MCP WebSocket bridge (`src/mcp_ws_bridge.ts`) binds `127.0.0.1` by default. `NEOTOMA_WS_HOST` opts into a wider bind, matching `NEOTOMA_HTTP_HOST`. A listen failure now exits instead of falling back (#2577).
- Agent instructions now require provenance for files the agent reads itself, not only user-attached files. Secret-bearing files (private keys, credential files) are exempt from byte persistence (#1934).
- The observation-insert path is shared by `createObservation`, the MCP inline insert and `createCorrection`. No behaviour change (#2582).

**Shipped artifacts**

- `config/agent_capabilities.default.json` no longer grants `create_relationship` to the `agent-site@neotoma.io` feedback forwarder.
- Docker build contexts exclude root and nested `.env*` files, not only `.env` (#2609).

## API surface & contracts

- `npm run openapi:bc-diff` (base `v0.25.0`) reports 38 non-breaking additions: the three new operations `POST /corrections/transaction`, `POST /patch_array_item` and `POST /entities/{id}/batch_correct`; request fields `expected_entity_absent` and `data_origin` on `/store`, `expected_version` and `overwrite` on `/correct`, `include_cleared_fields` on `/get_entity_snapshot`; the `unspecified` value on `observation_source`; response fields `read_contract`, `entity_version`, `data_origins`, `cleared_fields_included`, `operation_receipt`, `current_snapshot_status`, `postcommit_notifications`; and `AgentCapabilityEntry.relationship_types`.
- It reports six "removed-response-field" entries on `POST /store` 409 and 503. These are a schema reshape, not removed fields: each response is now a `oneOf` of the existing `ErrorEnvelope` (or `StorePolicyUnavailableErrorEnvelope`) and a new `{ error: ConditionalStoreError }` shape. Covered in "Breaking changes".
- New error codes: `ERR_STORE_WRITE_INCOMPLETE` (409, `/store`), `ERR_FIELD_VERSION_CONFLICT` (409, `/correct`). New warning code: `OBSERVATION_SOURCE_OMITTED`.
- `protected_routes_manifest.json` gains the three new routes; all require authentication.

## Behavior changes

- Stores that omit `observation_source` record `unspecified`. In reducer tie-breaks, `unspecified` ranks level with `llm_summary` unless a schema's priority list names it, so recency decides between old and new omitted writes. Schema auto-enhancement does not treat `unspecified` as a trusted source, so types written mostly without `observation_source` get stricter thresholds. Hook packages that store conversation turns without the field now produce `unspecified` rows and a warning.
- A retry of an unfinished keyed store now completes the write instead of returning `replayed: true` with a partial count.
- Every keyed store now records its key mode, and every committing structured store runs a read-only ownership pre-check that resolves each entity before writing.
- Grants created before `relationship_types` existed grant no edge writes until updated.
- MCP `retrieve_entity_snapshot` with `at` or `at_ingested` returns the past snapshot of an entity that is deleted now, matching HTTP. It used to return "Entity not found".
- A merge chain that loops or runs deeper than 32 links now fails the read or write instead of logging a warning.
- Known limitation, unchanged from v0.25.0: deleting an entity, restoring it, then deleting it again reports success but leaves the entity visible. The relationship fix in this release (#2570) does not yet cover entities.

## Docs site & CI / tooling

- `docs/subsystems/agent_capabilities.md` documents the combined-entry rule and migration. `docs/operations/configuration.md` documents `NEOTOMA_WS_HOST`. The MCP spec, CLI agent instructions, onboarding and store-recipes page describe `data_origin` and `observation_source`.
- Required CI runs new native lanes: compiled schema-release effects (#2617), lifecycle effects (#2618) and atomic-correction effects (#2620), plus a Docker-context exclusion check (#2609).
- The operator-instance deploy workflow can now file its failure issue (`issues: write`), and its post-deploy authenticated read probe retries through machine warm-up for up to 420s instead of failing on one 90s attempt (#2660).
- Internal, not exposed as a tool or startup step: an offline lifecycle migration preview and verifier whose `apply` refuses unconditionally (#2621), and server-authored entity lifecycle metadata with an explicit cutover (#2618).

## Fixes

- `store --plan` no longer persists sources or raw content (#2471, #2493).
- Interrupted keyed stores no longer leave entities without observations behind a successful replay (#2651, refs #2144).
- `409 ERR_STORE_WRITE_INCOMPLETE` on HTTP `/store` counts written entities on the interpretation's own source when the request names one, matching MCP. Before this release-branch fix it reported every entity missing, and following its hint would have duplicated observations.
- `retrieve_field_provenance` works on corrected and merged fields (#2026).
- Relationship delete after restore takes effect (#2570).
- Capability refusals on edge writes no longer surface as `500 DB_QUERY_FAILED` (#2524, #2525).
- MCP `create_relationship` no longer fails when two calls land in the same millisecond.
- Entities merged across types (for example by plural-type repair) keep recomputing their snapshot. A release-branch fix to #2618's lifecycle selector restores the earlier behavior before the lifecycle cutover; `tests/integration/cross_type_merge_snapshot.test.ts` covers it and runs in the required lifecycle CI lane.

## Tests and validation

- CI test lanes pass on `fdefe19e3`. The release branch adds #2660 (deploy workflow only) and the two release-branch fixes; the RC PR's CI covers the final head.
- The release review found two blocking defects and fixed them on the release branch with regression tests. The tests fail without the fixes and pass with them: cross-type merge snapshot recompute (#2618) and the `ERR_STORE_WRITE_INCOMPLETE` source count (#2651).
- Release lane: `type-check` clean, `build:server` clean, `test:security:auth-matrix` 18 passed and 1 skipped, `security:manifest:check` in sync (126 routes).
- Code review and per-surface coverage findings are in [`test_coverage_review.md`](test_coverage_review.md).

## Security hardening

`npm run security:classify-diff -- --base v0.25.0 --head HEAD` reports `sensitive=true` (auth middleware in `src/actions.ts`, the protected-routes manifest, and peer sync batching). `security:lint` reports 0 errors and no warnings in the changed range. `security:manifest:check` is in sync and the three added routes are authenticated. Relationship-grant scoping, the WebSocket loopback default and the Docker `.env*` exclusion are hardening changes in this release. Findings and sign-off are in [`docs/releases/in_progress/v0.26.0/security_review.md`](security_review.md). Deployed-probe results will be linked here after Step 5.

## Breaking changes

- **Authorization outcome change for agent grants.** A `create_relationship` capability entry without `relationship_types` (every entry written before this release) now denies edge writes with `capability_denied`. The grant record is still accepted. To restore edge writes, update the grant with an entry that lists the relationship types and both endpoint entity types, for example `{"op": "create_relationship", "entity_types": ["checkpoint_brief", "task"], "relationship_types": ["REFERS_TO"]}`. Use the Inspector grant form, `PATCH /agents/grants/{grant_id}`, or a `correct` on the `agent_grant` entity. Edge writes refused by a grant return `403 capability_denied` on REST `/store` and `/create_relationship`; clients that retried the previous `500` should stop.
- **`data_origin` is a reserved key inside `entities[]`.** On `store`, an entity field literally named `data_origin` is read as the origin claim. A value that is not a valid origin object returns `400 VALIDATION_INVALID_FORMAT` at `entities[i].data_origin` with a `details.hint`. A value that is a valid origin object is moved into provenance without error. On `create_interpretation`, any `data_origin` key inside an entity is refused with the same error. Guest-token reads also hide any such field. Rename such fields (for example to `origin_label`). No built-in schema declares this field.
- **MCP WebSocket bridge binds loopback by default.** Set `NEOTOMA_WS_HOST=0.0.0.0` (or a specific address) to keep remote access through the bridge.
- **`POST /store` 409 and 503 response schemas are now unions.** `openapi:bc-diff` reports `error_code`, `message`, `details`, `trace_id` and `timestamp` removed from the 409 and `error` from the 503. Ordinary stores still return the same `ErrorEnvelope` and `StorePolicyUnavailableErrorEnvelope` bodies. The new `{ error: ConditionalStoreError }` body is returned by stores sent with `expected_entity_absent: true`, and by an ordinary store that reuses an idempotency key already used for a conditional store (`409 STORE_KEY_MODE_CONFLICT`). Typed clients generated from `openapi.yaml` should handle both members of the union.
- **Keyed store replays can now fail.** A retry under the key of an unfinished store that carries an `interpretation` returns `409 ERR_STORE_WRITE_INCOMPLETE` instead of `success: true, replayed: true`. Resend only the entities in `details.missing_entity_indexes` under a new key, and recreate the request's relationships separately.
- **Omitted `observation_source` is stored as `unspecified`, not `llm_summary`.** Callers that relied on the old default to mark model output should send `observation_source: "llm_summary"` explicitly.

Legacy-payload outcome flips are recorded in `tests/contract/legacy_payloads/CHANGES.md` under v0.26.0.
