This release fixes a data-integrity bug where updating a schema's fields silently reset its guest-access policy (and any other row-level metadata) to the closed default, breaking token-gated guest reads of the affected entity type.

## Highlights

- **`update_schema_incremental` no longer drops row-level `metadata`.** The incremental-update path registers a new schema version and activates it, but never carried the current active row's `metadata` (`guest_access_policy`, `icon`, etc.) into the new version — so the new active row was written with `metadata: {}`. Since `guest_access_policy` resolves from `SchemaMetadata` on the ACTIVE row, every incremental field-add or field-removal silently reverted the entity type to the `closed` guest-access default, breaking all token-gated guest reads of that type (issue #1977, still reproducible pre-fix on a hosted instance). The fix merges the current active row's metadata into the newly registered version, with an optional `metadata` option layered on top so a caller can still override individual keys without restating the rest.

## Security hardening

- Closes issue #1977: a schema field update could silently revoke guest access to an entity type with no error or warning anywhere in the write path. The failure was invisible at write time; the only symptom was a 403 or empty result on a later guest read. The fix is additive/preserve-only — a caller that never sets `metadata` explicitly now keeps the prior row's metadata by default, instead of silently losing it.

## What changed for npm package users

No CLI, MCP tool, or API surface changes. This is an internal data-integrity fix in the schema-registry service consumed by the existing `update_schema_incremental` action; callers see no change to request/response shape.

## API surface & contracts

- No `openapi.yaml` changes. `npm run openapi:bc-diff --base v0.21.0 --head HEAD` reports no schema changes to reconcile.
- No new MCP tools, no new Express routes.

## Behavior changes

- **Operator-visible:** entity types with row-level metadata (`guest_access_policy`, `icon`, bundle info) that go through an incremental schema update (adding/removing fields, adding converters, changing the identity rule) now keep that metadata by default. Previously, any such update silently reset metadata to `{}`. This closes a real bug and is not a new capability — no additive metadata is introduced, no defaults change for types that were never affected.

## Internal changes

- `src/services/schema_registry.ts`: `updateSchemaIncremental` now merges `currentSchema.metadata` with an optional `options.metadata` override before calling `register()`, instead of omitting `metadata` from that call entirely.

## Fixes

- **Incremental schema updates silently reset `guest_access_policy` and other row-level metadata to `{}` (closes #1977).** Root cause: `updateSchemaIncremental` preserves `schema_definition` and `reducer_config` across versions but never carried forward the separate `metadata` field. Fixed by merging the prior active row's metadata into the new version by default.

## Tests and validation

- 4 new unit tests in `tests/unit/schema_incremental_metadata_preservation.test.ts`: carries `guest_access_policy` forward on an unrelated field add (the exact #1977 symptom), preserves an unrelated metadata key (`icon`), lets an explicit `metadata` option override one key without dropping others, and confirms an empty-but-defined object (not `undefined`) when the prior row had no metadata.
- `tsc --noEmit`, `prettier --check`, and `npm run validate:test-catalog` all clean.
- Full contract suite: 160/160 passing.
- `npm run test:security:auth-matrix`: 18 passed / 1 skipped, unchanged from baseline.

## Breaking changes

None. `npm run openapi:bc-diff --base v0.21.0 --head HEAD` reports zero API changes. The fix is additive/preserve-only: callers who already pass an explicit `metadata` option see identical behavior; callers who don't now keep their prior metadata instead of losing it, which only restores previously-intended (never-shipped-correctly) behavior.
