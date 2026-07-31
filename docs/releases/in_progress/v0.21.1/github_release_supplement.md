This release fixes the silent `metadata` drop in `updateSchemaIncremental`: an unrelated field add/remove no longer resets row-level schema metadata (including `guest_access_policy`) to `{}`, which had broken token-gated guest reads for the affected entity type. This is the merge-fix slice of #1977 (shipped in #2063); remaining #1977 acceptance criteria are tracked in #2069.

## Highlights

- **`update_schema_incremental` no longer drops row-level `metadata`.** The incremental-update path registers a new schema version and activates it, but never carried the current active row's `metadata` (`guest_access_policy`, `icon`, etc.) into the new version — so the new active row was written with `metadata: {}`. Since `guest_access_policy` resolves from `SchemaMetadata` on the ACTIVE row, every incremental field-add or field-removal silently reverted the entity type to the `closed` guest-access default, breaking all token-gated guest reads of that type (the #1977 symptom fixed here; still reproducible pre-fix on a hosted instance). The fix merges the current active row's metadata into the newly registered version, with an optional `metadata` option layered on top so a caller can still override individual keys without restating the rest. Remaining #1977 scope (`register_schema` parity, response-visible `access_policy`/`warnings[]`, effect/cross-surface tests, docs) is tracked in #2069 — not claimed closed by this release.

## Security hardening

- Fixes the `updateSchemaIncremental` metadata-drop symptom reported in #1977 (unrelated field-add/remove no longer silently resets `guest_access_policy`/`metadata` to `{}`). The failure was invisible at write time; the only symptom was a 403 or empty result on a later guest read. The fix is additive/preserve-only — a caller that never sets `metadata` explicitly now keeps the prior row's metadata by default, instead of silently losing it. #1977's remaining acceptance criteria — `register_schema` version-activation parity, response-visible `access_policy`/`warnings[]` contract, effect-verified guest/token read test, and cross-surface (MCP/CLI/HTTP) parity tests plus docs — are not shipped in this train; tracked in #2069. Do not treat #1977 as fully closed until #2069 lands.

## What changed for npm package users

No CLI, MCP tool, or API surface changes. This is an internal data-integrity fix in the schema-registry service consumed by the existing `update_schema_incremental` action; callers see no change to request/response shape.

## API surface & contracts

- No `openapi.yaml` changes. `npm run openapi:bc-diff --base v0.21.0 --head HEAD` reports no schema changes to reconcile.
- No new MCP tools, no new Express routes.

## Behavior changes

- **Operator-visible:** entity types with row-level metadata (`guest_access_policy`, `icon`, bundle info) that go through an incremental schema update (adding/removing fields, adding converters, changing the identity rule) now keep that metadata by default. Previously, any such update silently reset metadata to `{}`. This restores the intended preserve-on-incremental behavior for that path only — no additive metadata is introduced, no defaults change for types that were never affected. This does not add the `access_policy`/`warnings[]` response contract, `register_schema` parity, or cross-surface/effect-verified test coverage called for in #1977's full acceptance criteria — see #2069.

## Internal changes

- `src/services/schema_registry.ts`: `updateSchemaIncremental` now merges `currentSchema.metadata` with an optional `options.metadata` override before calling `register()`, instead of omitting `metadata` from that call entirely.

## Fixes

- **Incremental schema updates silently reset `guest_access_policy` and other row-level metadata to `{}` (partial fix for #1977 — remaining scope in #2069).** Root cause: `updateSchemaIncremental` preserves `schema_definition` and `reducer_config` across versions but never carried forward the separate `metadata` field. Fixed by merging the prior active row's metadata into the new version by default. Does not close full #1977 AC; see #2069.

## Tests and validation

- 4 new unit tests in `tests/unit/schema_incremental_metadata_preservation.test.ts`: carries `guest_access_policy` forward on an unrelated field add (the exact #1977 symptom for the incremental path), preserves an unrelated metadata key (`icon`), lets an explicit `metadata` option override one key without dropping others, and confirms an empty-but-defined object (not `undefined`) when the prior row had no metadata. Effect-verified guest/token read coverage and cross-surface parity remain open in #2069.
- `tsc --noEmit`, `prettier --check`, and `npm run validate:test-catalog` all clean.
- Full contract suite: 160/160 passing.
- `npm run test:security:auth-matrix`: 18 passed / 1 skipped, unchanged from baseline.

## Breaking changes

None. `npm run openapi:bc-diff --base v0.21.0 --head HEAD` reports zero API changes. The fix is additive/preserve-only: callers who already pass an explicit `metadata` option see identical behavior; callers who don't now keep their prior metadata instead of losing it, which only restores previously-intended (never-shipped-correctly) behavior for the incremental path.
