Neotoma v0.29.1 is a patch release. It runs one background timer per server process instead of one per MCP session, caches schema lookups, and makes corrections on long-lived entities faster. The CLI authenticates by signature alone when an AAuth key is configured, guest issue submits create only new issues, and guest observation and relationship reads answer a merged entity as absent.

## Highlights

- **The server no longer starts a new background timer for every MCP session.** One process-wide auto-enhancement timer does the work for every session.
- **Schema lookups are cached in memory and the schema registry is indexed.** Repeated schema resolution on the store and correction paths is served from memory.
- **Applying a correction updates the snapshot without re-reading the entity's whole history.** The time a correction holds the write gate no longer grows with the entity's history.
- **With an AAuth key configured, the CLI authenticates by signature only; `--with-bearer` adds the token.** See Breaking changes for the upgrade note.
- **Guest issue submit refuses an issue identifier that is already in use.** The refusal is `400 ERR_ISSUE_IDENTITY_IN_USE`, and nothing is written.
- **Guest observation and relationship reads answer a merged entity as absent.** All four guest entity routes now agree.

## What changed for npm package users

### Background timer (#2837)

- The auto-enhancement processor runs as one process-wide timer. `startAutoEnhancementProcessor` is idempotent and returns the same stop function on every call, and a new `stopAutoEnhancementProcessor` stops it at shutdown. The timer keeps running when no MCP session is open, because REST stores also add to its queue.
- A long-lived HTTP server now polls the queue once every 30 s, however many MCP sessions it has served.

### Schema lookups (#2838)

- Active-schema lookups (`loadUserSpecificSchema`, `loadGlobalSchema`, and so `loadActiveSchema`, and `listActiveSchemas`) read through an in-memory cache, one per database handle. Keys carry the scope and, for a user-scoped lookup, the user id, so one user's schema never answers another user's lookup. Values are copied in and out.
- A schema change made through the server is visible to the next lookup at once. Lookups go to the database while a `schema_registry` write is in progress, and inside a transaction that wrote `schema_registry` until it commits or rolls back. A change made by another process on the same database file, such as `neotoma access set` from the CLI, is visible within 250 ms by default.
- New settings: `NEOTOMA_SCHEMA_REGISTRY_CACHE` (default on; `off`, `0` or `false` turns the cache off) and `NEOTOMA_SCHEMA_REGISTRY_CACHE_CHECK_MS` (default `250`; `0` re-checks on every lookup; values above 60000 are capped). Both are documented in `docs/operations/configuration.md` and the schema registry subsystem doc.
- On first start after upgrade, `ensureSchema` creates the index `idx_schema_registry_resolve` on `schema_registry(entity_type, scope, active, user_id)`, a one-row table `schema_registry_change_counter` and three triggers that advance it on every insert, update and delete. A database without the counter table is read without the cache.
- `neotoma storage merge-db` no longer copies `schema_registry_change_counter` from the source file; the target keeps its own counter, which its triggers advance as merged rows land.

### Corrections and snapshots (#2839)

- A correction now updates the stored snapshot from the corrected field alone when the stored snapshot is known to be current: this process computed it, under the same schema content, and the entity's observation count and latest `observed_at` still match it, and the correction is strictly newer than every stored observation. Otherwise the snapshot is rebuilt in full, as before.
- Fields under `merge_array_by_key`, the lifecycle marker and other reserved underscore fields always take the full rebuild.
- The correction's observation insert no longer builds a snapshot that the same transaction then replaces.
- Measured locally on 2 KB rows, the write-gate hold per correction was 2 ms at 50 observations, 38 ms at 2,000 and 267 ms at 8,000 before this release, and is about 0.9 ms at 50, 500 and 2,000 observations and 1.9 ms at 8,000 after it.
- The stored snapshot is the same one a full rebuild produces. Cryptographic erasure clears the user's in-process snapshot records, so the next corrections after an erasure rebuild in full.

### CLI credentials with an AAuth key (#2840)

- With an AAuth key configured (`NEOTOMA_AAUTH_PRIVATE_JWK_PATH`, or `~/.neotoma/aauth/private.jwk`), every CLI HTTP request is signed and carries the signature as its only credential. The bearer token (`NEOTOMA_BEARER_TOKEN` or the stored login) is added only when the new global `--with-bearer` flag is passed. When a configured key cannot be used, the unsigned request also goes without the bearer.
- The rule covers the API client and the commands that send their own requests: `edit` (the `batch_correct` write), `request --operation eventsStream`, `auth status`, the `auth login` already-signed-in check, `watch`, `watch --env all`, session start and stats, `init` and the API-start probes. It also covers the local API the CLI starts on 127.0.0.1 for data commands run without `--api-only`; that child now binds 127.0.0.1 and checks signatures against `127.0.0.1:<port>`.
- With `NEOTOMA_CLI_AAUTH_DISABLE=1` or `NEOTOMA_CLI_AAUTH_ENABLE=0` set while a key is configured, the CLI refuses to send the request and names the variable, unless `--with-bearer` is passed. The issues client honours both variables.
- `request --guest-access-token` sends the guest token as the request's only credential, unsigned.
- Under `NODE_ENV=test`, only a key named by `NEOTOMA_AAUTH_PRIVATE_JWK_PATH` counts as configured; a key at the default path does not change what a test sends.
- With no key configured, bearer handling is unchanged.

### Guest issue submit (#2841)

- `POST /issues/submit` on the guest path (a guest principal, or a request carrying `github_number`, `github_url`, `author`, `local_issue_id` or `submission_timestamp`, which includes submits forwarded by another instance's `submit_issue`) resolves the identity of the issue and of its thread before writing. When either already identifies a stored entity, the submit returns `400 ERR_ISSUE_IDENTITY_IN_USE`, writes nothing and returns no guest access token. `details.extra.identity_field` is `github_number` or `local_issue_id`; `details.extra.entity_type` is `issue` or `conversation`.
- Neotoma's own `submit_issue` flow (MCP, CLI and the owner path of `POST /issues/submit`) derives a new `local_issue_id` on every call and never sends `github_number`, so it is not affected.

### Guest reads of merged entities (#2842)

- `GET /entities/{id}/observations` and `GET /entities/{id}/relationships` answer `404` for a merged requested entity for every guest caller, by the rule the entity detail and HTML routes already use. When the caller's token names the entity, the merge is reported before the type policy; otherwise it is reported after access is granted. The merge target is never served in its place.

## API surface & contracts

- `openapi.yaml` describes the guest-submit rule on `POST /issues/submit` and declares `ERR_ISSUE_IDENTITY_IN_USE` in its `400` response; `src/shared/openapi_types.ts` is regenerated. No path, operation, MCP tool or CLI command was added or removed. See [issues subsystem § Guest submits](https://github.com/markmhendrickson/neotoma/blob/main/docs/subsystems/issues.md#guest-submits) and the [compatibility record](https://github.com/markmhendrickson/neotoma/blob/main/tests/contract/legacy_payloads/CHANGES.md).
- The CLI adds one global flag, `--with-bearer`, documented in `docs/developer/cli_reference.md`.
- The README states 67 MCP tools and 113 REST paths for this version, unchanged from v0.29.0.

## Behavior changes

- With an AAuth key configured, CLI requests no longer carry the bearer token unless `--with-bearer` is passed, and a disable variable set beside a key makes the CLI refuse the request.
- A guest issue submit whose `github_number` or `local_issue_id` is already in use returns `400 ERR_ISSUE_IDENTITY_IN_USE`.
- A guest request for the observations or relationships of a merged entity returns `404`.
- One auto-enhancement timer runs per server process.
- Schema changes made by another process on the same database file reach a running server's lookups within 250 ms by default.
- On the first start after upgrade, `ensureSchema` creates one index, one table and three triggers on `schema_registry`.

## Agent-facing instruction changes

- The CLI agent instructions (`docs/developer/cli_agent_instructions.md`) state that with a key configured every CLI request is signed and carries no bearer, to rerun with `--with-bearer` when an instance answers `401` to the signature, and what to do when a disable variable is set beside a key.

## Plugin / hooks / SDK changes

- No plugin, hook or SDK package change in this range.

## Security hardening

This range changes guest read and guest submit behavior on the REST routes and the credentials the CLI sends. The release-prep review ran the classifier, static rules, protected-routes manifest check and auth topology matrix on the release code head; see the [security review](https://github.com/markmhendrickson/neotoma/blob/release/v0.29.1/docs/releases/in_progress/v0.29.1/security_review.md).

- With an AAuth key configured, the CLI authenticates by signature only; `--with-bearer` adds the token (#2840).
- Guest issue submit refuses an issue identifier that is already in use (#2841).
- Guest observation and relationship reads answer a merged entity as absent (#2842).

## Docs site & CI / tooling

- The issue-reporting site page and `docs/subsystems/issues.md` describe guest submits and `ERR_ISSUE_IDENTITY_IN_USE`. `docs/operations/configuration.md` and `docs/subsystems/schema_registry.md` document the schema lookup cache. `docs/developer/cli_reference.md` documents `--with-bearer`.
- The automated test catalog is regenerated on the release branch to list the new test files.

## Internal changes

- New `src/services/snapshot_incremental.ts`; `persistComputedSnapshot` is extracted in `snapshot_computation.ts`, and `insertObservationRow` takes a `materializeSnapshot` option.
- New `src/repositories/db/schema_registry_cache.ts`; `TransactionGate` gains `deferUntilCurrentTransactionSettles`, which runs an effect once the caller's transaction commits or rolls back.
- New `decideCliCredentials` and `resolveCliRequestAuth` in `src/shared/api_client.ts`; every CLI request goes through them.

## Tests and validation

- New and extended tests: `tests/unit/auto_enhancement_processor_single_timer.test.ts`; `tests/unit/schema_registry_cache.test.ts`, `tests/unit/db_sqlite_gate_order.test.ts`, `tests/cli/cli_infra_commands.test.ts`; `tests/unit/snapshot_incremental_correction.test.ts`, `tests/integration/correction_incremental_snapshot_lifecycle_cutover.test.ts`; `tests/unit/api_client_aauth_bearer.test.ts`, `tests/cli/cli_aauth_bearer.test.ts`, `tests/cli/cli_aauth_local_transport.test.ts`, `tests/cli/cli_aauth_raw_fetch.test.ts`; `tests/security/guest_issue_submit_token_scope.test.ts`, `tests/security/guest_issue_submit_attribution.test.ts`; `tests/security/guest_relationship_expansion.test.ts`, `tests/security/guest_token_signed_identity.test.ts`.
- Release prep ran type-check, lint, the test catalog check, the security lane, the contract tests and the tests above locally; results and gaps are in the [test coverage review](https://github.com/markmhendrickson/neotoma/blob/release/v0.29.1/docs/releases/in_progress/v0.29.1/test_coverage_review.md). CI on the release-candidate head is reported by the PR's own checks.

## Breaking changes

**CLI with an AAuth key configured sends only the signature.** If you have a key file and a bearer token, the CLI now sends only the signature. A server that accepts only the token answers `401`. Rerun the command with `--with-bearer`, or remove the key. With `NEOTOMA_CLI_AAUTH_DISABLE=1` or `NEOTOMA_CLI_AAUTH_ENABLE=0` set beside a key, the CLI refuses to send; unset the variable, or pass `--with-bearer`.

**A guest submit retried with the same identifier now gets 400.** Before this release, a second guest submit carrying a `github_number` or `local_issue_id` that already identified a stored issue was accepted. It now returns `400 ERR_ISSUE_IDENTITY_IN_USE` with a structured `details.hint`. Client note (the hint's text): nothing was written. If you are retrying a submit whose response was lost, the first submit may already have created the issue: check it with `get_issue_status` and that issue's guest access token, or, without the token, submit again with a new `local_issue_id` (or with neither `local_issue_id` nor `submission_timestamp`, so the server assigns one) and accept that this may create a second issue. `github_number` takes precedence over `local_issue_id`, so when you pass `github_number` for an issue synced from GitHub a new `local_issue_id` does not change the identity: post to that issue with `add_issue_message` and its guest access token instead.

**OpenAPI diff.** `npm run openapi:bc-diff -- --base v0.29.0 --head HEAD` reports no breaking changes; the two entries above are behavior changes the diff tool does not detect.

This is a patch release from v0.29.0 under the project's 0.x validation-tightening policy. No additional version change is proposed by these notes.
