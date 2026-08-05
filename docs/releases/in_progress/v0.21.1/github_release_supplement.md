This release ships three data-integrity fixes: a silent `metadata` drop during incremental schema updates that broke guest-access policy enforcement, a `backup create` race that produced unopenable, unrestorable backups on a live server, and a stale-port failure in the MCP shim's port discovery that surfaced only as "Could not attach to MCP server."

## Highlights

- **`update_schema_incremental` no longer drops row-level `metadata`.** The incremental-update path registers a new schema version and activates it, but never carried the current active row's `metadata` (`guest_access_policy`, `icon`, etc.) into the new version — so the new active row was written with `metadata: {}`. Since `guest_access_policy` resolves from `SchemaMetadata` on the active row, every incremental field-add or field-removal silently reverted the entity type to the `closed` guest-access default, breaking all token-gated guest reads of that type (the #1977 symptom fixed here; still reproducible pre-fix on a hosted instance). The fix merges the current active row's metadata into the newly registered version, with an optional `metadata` option layered on top so a caller can still override individual keys without restating the rest. Remaining #1977 scope (`register_schema` parity, response-visible `access_policy`/`warnings[]`, effect/cross-surface tests, docs) is tracked in #2069 — not claimed closed by this release.
- **`backup create` snapshots the database atomically instead of copying it live.** The command copied the SQLite database and its `-wal` file as two independent `fs.copyFile` calls, with no checkpoint, no DB handle, and no read lock. Any write committing between the two copies left the WAL's frame checksums invalid against the main file's header — restoring the pair failed with `SQLITE_CORRUPT`, an unopenable file, not merely stale data. On a live server this was the normal case, so the command silently produced unrestorable backups while still reporting `"verified": true` (verification only checked file size > 1KB). The fix uses `VACUUM INTO` to take a single atomic, transaction-consistent snapshot through the engine, then runs `PRAGMA integrity_check` against the result and fails the command unless it returns `ok`. Pre-existing file-copy backups that carry a `-wal` remain restorable; `backup restore` already guards every `contents.wal` access.
- **The MCP shim discovers the live port instead of dying on a stale port file.** When every candidate port file failed its TCP probe, the resolver fell back to a hardcoded port for the profile (3180 for prod, 3080 for dev). If the server was actually bound elsewhere, that fallback was dead too and the shim exited immediately, surfacing only as "Could not attach to MCP server" with no indication the port was wrong. The resolver now probes the canonical ports for the profile before falling back, uses the first reachable one, and rewrites the port file so the next start resolves on the fast path.

## Security hardening

Fixes the `updateSchemaIncremental` metadata-drop symptom reported in #1977 (unrelated field-add/remove no longer silently resets `guest_access_policy`/`metadata` to `{}`). The failure was invisible at write time; the only symptom was a 403 or empty result on a later guest read. The fix is additive/preserve-only. See `docs/releases/in_progress/v0.21.1/security_review.md` for the full adversarial review (sign-off: `yes`). #1977's remaining acceptance criteria — `register_schema` version-activation parity, response-visible `access_policy`/`warnings[]` contract, effect-verified guest/token read test, and cross-surface (MCP/CLI/HTTP) parity tests plus docs — are not shipped in this train; tracked in #2069. Do not treat #1977 as fully closed until #2069 lands.

The backup and MCP-port fixes are CLI-local reliability fixes with no auth, access-control, or network-exposed surface; `security:classify-diff` scoped the release as `sensitive=false` overall (see security review for the schema-registry-specific adversarial pass).

## What changed for npm package users

- **`neotoma backup create`** now snapshots the SQLite database with `VACUUM INTO` instead of a raw file copy, and fails the command (non-zero exit, error message naming the on-disk path) if `PRAGMA integrity_check` does not return `ok`. The backup manifest gains a `db_snapshot_method: "vacuum_into"` field. No CLI flag or output-shape change; existing `backup restore` behavior is unchanged and still supports older file-copy backups that include a `-wal`.
- **The MCP shim (`scripts/lib/neotoma_mcp_resolve_downstream_url.sh`)** self-heals a stale or unreachable port file by probing the canonical dev/prod ports and rewriting the port file on success, instead of falling straight to a hardcoded fallback that may also be wrong. No user-facing CLI or MCP contract change — this only affects how the shim locates an already-running server.
- No other CLI, MCP tool, or API surface changes. The schema-registry fix is internal; callers of `update_schema_incremental` see no request/response shape change.

## API surface & contracts

- No `openapi.yaml` changes. `npm run openapi:bc-diff --base v0.21.0 --head HEAD` reports no schema changes to reconcile.
- No new MCP tools, no new Express routes.

## Behavior changes

- **Operator-visible (schema registry):** entity types with row-level metadata (`guest_access_policy`, `icon`, bundle info) that go through an incremental schema update now keep that metadata by default instead of it being silently reset to `{}`. Restores intended preserve-on-incremental behavior for that path only.
- **Operator-visible (backup):** `neotoma backup create` on a live, actively-written database now always produces a restorable backup; previously it could silently produce a backup that fails to restore. Backup creation may take marginally longer on large databases since `VACUUM INTO` rewrites the database rather than copying bytes directly, but the result is guaranteed consistent.
- **Operator-visible (MCP shim):** a stale port file no longer causes an unrecoverable "Could not attach to MCP server" failure when the actual server is reachable on one of the profile's canonical ports; the shim self-heals the port file and logs the discovery.

## Internal changes

- `src/services/schema_registry.ts`: `updateSchemaIncremental` now merges `currentSchema.metadata` with an optional `options.metadata` override before calling `register()`, instead of omitting `metadata` from that call entirely.
- `src/cli/index.ts`: `backup create` replaces the two-file `fs.copyFile` DB snapshot with a `VACUUM INTO`-based atomic snapshot plus `PRAGMA integrity_check` verification; adds `quoteSqliteStringLiteral` helper for the literal path argument.
- `scripts/lib/neotoma_mcp_resolve_downstream_url.sh`: adds a port-discovery probe step before the hardcoded fallback, with self-healing rewrite of the resolved port file.

## Fixes

- **Incremental schema updates silently reset `guest_access_policy` and other row-level metadata to `{}`** (partial fix for #1977 — remaining scope in #2069). Root cause: `updateSchemaIncremental` preserves `schema_definition` and `reducer_config` across versions but never carried forward the separate `metadata` field. Fixed by merging the prior active row's metadata into the new version by default.
- **`backup create` produced unrestorable backups under concurrent writes, while reporting success** (closes #2075). Root cause: independent, unsynchronized copies of the SQLite main file and its `-wal`, racing against live writes. Fixed by snapshotting with `VACUUM INTO` and verifying with `PRAGMA integrity_check`.
- **MCP shim died with an unhelpful error when its port file was stale** (closes #2087). Root cause: the fallback path used a second hardcoded port with no verification it was actually reachable. Fixed by probing canonical ports before falling back, and self-healing the port file on success.

## Tests and validation

- 4 unit tests in `tests/unit/schema_incremental_metadata_preservation.test.ts`: carries `guest_access_policy` forward on an unrelated field add (the exact #1977 symptom for the incremental path), preserves an unrelated metadata key (`icon`), lets an explicit `metadata` option override one key without dropping others, and confirms an empty-but-defined object (not `undefined`) when the prior row had no metadata.
- New regression test in `tests/cli/backup_verify.test.ts` reproducing the original interleaving: rows committed only to an uncheckpointed WAL, with a writer committing throughout the backup. Fails with `SQLITE_CORRUPT` against the old implementation, passes against the `VACUUM INTO` implementation. Backup suite: 54/54 passing.
- MCP port-discovery fix verified manually: sabotaged `.dev-serve/local_http_port_prod` to an unreachable port and started the shim; it logged `DISCOVERED live port 9180 by probe` and `self-healed ... -> 9180`, then completed an MCP `initialize` handshake with the port file corrected. No dedicated automated test for the shell-script discovery path (shell script, not covered by the vitest suite); see `docs/releases/in_progress/v0.21.1/test_coverage_review.md`.
- `tsc --noEmit`, `prettier --check`, `npm run validate:test-catalog`: clean.
- Full contract suite: 160/160 passing.
- `npm run test:security:auth-matrix`: 18 passed / 1 skipped, unchanged from baseline.

## Breaking changes

None. `npm run openapi:bc-diff --base v0.21.0 --head HEAD` reports zero API changes. All three fixes are additive/preserve-only or internal-reliability fixes: the schema-registry fix only prevents metadata from being silently dropped; the backup fix only changes the on-disk snapshot mechanism (output format and `backup restore` behavior unchanged); the MCP shim fix only adds a discovery step before an existing fallback.
