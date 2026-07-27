This release adds a safe way to re-key an entity type's identity rule after data already exists, fixes a production-freezing pagination bottleneck on deep entity queries, and moves npm publish and the hosted client-instance deploy off manual operator steps and into CI.

## Highlights

- **Re-key an entity type's identity without a destructive rebuild.** `update_schema_incremental` (MCP, HTTP, and `neotoma schemas update`) now accepts `canonical_name_fields`, so a type whose identity collides (e.g. people deduplicated only by `name`) can move to a unique-field-led rule like `[{composite:["linkedin_url"]},"email","name"]` while its `reducer_config` is preserved automatically.
- **Deep entity listings no longer freeze the server.** `GET/POST /entities` (and `retrieve_entities` / `entities list`) support an opaque `cursor` for keyset pagination — O(page size) at any depth, replacing the O(offset) scan that could block the Node event loop for several seconds on a hosted instance at deep offsets.
- **npm publish no longer depends on one operator's laptop being awake.** Tag pushes now trigger a GitHub Actions workflow that builds, verifies the tag matches `package.json`, and publishes with `--provenance`, producing a signed supply-chain attestation that a local publish cannot produce.
- **The hosted client instance stays fresh automatically.** A new deploy workflow mirrors the sandbox's existing "redeploy + verify on release" behavior for the separately hosted client instance, closing the gap where a stale build could go unnoticed.

## What changed for npm package users

**CLI (`neotoma`, `neotoma api start`, …)**

- `neotoma schemas update` gained `--canonical-name-fields <json>` to re-key a schema's identity rule from the CLI, matching the MCP/HTTP surfaces. A canonical-only call (no `--fields` / `--remove-fields`) is now valid.
- `entities list` gained `--cursor` for keyset pagination; `--offset` is still accepted but deprecated and now bounded — larger values return a structured hint pointing at `cursor`.

**Runtime / data layer**

- New pagination path in `entity_queries.ts` bounds the legacy offset-scan (`MAX_QUERY_OFFSET`) and synchronous snapshot hydration (`MAX_SNAPSHOT_PAGE_SIZE`) on any single page.

**Shipped artifacts**

- `openapi.yaml` and `dist/` include the new `cursor` / `next_cursor` and `canonical_name_fields` fields. No other shipped-artifact changes.

## API surface & contracts

- `GET /entities` and `POST /entities/query`: new optional request field `cursor`, new response field `next_cursor` (both endpoints). `offset` remains accepted but is marked `deprecated: true` in `openapi.yaml` and is now internally bounded.
- `POST /update_schema_incremental`: new optional request fields `canonical_name_fields` (`(string | {composite: string[]})[]`) and `fields_to_remove`; an empty `canonical_name_fields` array clears the rule, omitting the field preserves the existing one. Response now echoes `success`, `entity_type`, `schema_version`, `fields_added`, `fields_removed`, `canonical_name_fields`, `activated`, `migrated_existing`, and `scope` — all additive.
- MCP: `retrieve_entities` gained `cursor`; `update_schema_incremental` gained `canonical_name_fields`, matching the HTTP/CLI surfaces (cross-surface parity test added).
- `npm run openapi:bc-diff --base v0.19.0 --head HEAD` reports **no breaking changes** — 14 additive request/response fields only.

## Behavior changes

- A cursor minted under one `sort_order` is rejected if reused after the sort changes mid-walk, or combined with `search` / a non-default `sort_by` / a non-zero `offset` — callers restart the walk from the first page in that case.
- Setting a type's `canonical_name_fields` via `update_schema_incremental` is a major version bump (identity-rule changes are breaking to existing derivations), consistent with the existing field-removal behavior. It governs new writes only; existing rows keep their stored `canonical_name` until re-derived separately.
- `offset` on entity queries above the bound is now rejected with a structured hint directing the caller to `cursor`, rather than silently scanning further.

## Agent-facing instruction changes (ship to every client)

`docs/developer/mcp/instructions.md` gained rules shipped to every connected MCP client on upgrade:

- **Deep pagination**: use the `next_cursor` returned by `retrieve_entities` instead of growing `offset`; treat the cursor as opaque, stop paging once `next_cursor` is absent, and restart from the first page on an invalid-cursor error rather than retrying the same token.
- **Schema evolution**: `update_schema_incremental` now documents the `canonical_name_fields` re-key path, including the same-name-collision use case, the "new writes only" caveat, and how to verify the result via `describe_entity_type`.

## Security hardening

`security:classify-diff` reports `sensitive=true` for this release (touches `openapi.yaml` and `src/actions.ts`, both on the classifier's file-identity watch list). Full-diff review confirms this is query/pagination/schema plumbing, not an auth-logic change: zero new routes, zero new proxy-trust reads, zero changes to `LOCAL_DEV_USER_ID` / guest-access / AAuth admission. `security:lint` (0 errors, 125 pre-existing warnings), `security:manifest:check` (in sync, 116 routes, no route-count change), and `test:security:auth-matrix` (18/18 passed, 1 pre-existing skip) all pass clean. Sign-off verdict: **yes**. See `docs/releases/in_progress/v0.20.0/security_review.md` for the full adversarial review.

## Docs site & CI / tooling

- New `.github/workflows/npm-publish.yml`: triggers on `v*` tag push, verifies the tag matches `package.json`, builds on pinned Node 20, and publishes with `--provenance`. No-ops (does not fail) if the version is already on the registry, so resuming a partial release stays safe.
- New `.github/workflows/deploy-client-instance.yml`: redeploys and verifies the hosted client instance on `release: published`, running the same post-deploy gates the sandbox already runs (`/health`, deployed `git_sha` match, non-trivial landing-page render, always-on machines). Contains no client-identifying values; skips cleanly when the client-instance app is unset.
- Regenerated `src/shared/capability_manifest.json` to record `query_contacts_at_company`'s `addedInVersion: v0.19.0`, unblocking the `validate:capability-manifest` CI check that had been red on `main` since the v0.19.0 tag.

## Internal changes

- `entity_cursor.ts`: new versioned, opaque base64url cursor token, scoped to the default `entity_id` sort (the only ordering with a unique, index-backed key).
- Legacy-payload fixtures added for the `offset` tightening per the errors.md hint-obligation rule.

## Fixes

- **Deep-offset entity queries no longer block the event loop.** Root cause: the chunked scan in `entity_queries.ts` re-read and discarded every visible row up to `offset` in JS on every page, with a deleted-entity-ids round-trip per chunk, freezing concurrent requests for the duration on a hosted instance at deep offsets. Fixed by keyset cursor pagination (see Highlights).
- **`validate:capability-manifest` CI check.** Was failing on `main` since the v0.19.0 tag because `query_contacts_at_company` had no `addedInVersion` entry; regenerated the manifest.

## Tests and validation

- Cursor pagination: cursor-paged pages tile the full result set with no gaps or duplicates and match legacy offset paging on the same data; invalid-cursor envelope verified over a real HTTP request and a real MCP client/transport pair.
- `canonical_name_fields`: canonical-path contract tests, service-level coverage (ordered-precedence rule stored + major version bump, `reducer_config` preserved, omit-preserves-existing, rejects unknown-field references), and a CLI cross-surface parity test.
- `tsc` and `eslint` clean (0 errors); `openapi:generate` produces no drift.
- Full test suite, security gates (`security:classify-diff`, `security:lint`, `security:manifest:check`, `test:security:auth-matrix`), and `/review` code-review pass recorded in `docs/releases/in_progress/v0.20.0/test_coverage_review.md`.

## Breaking changes

None. `npm run openapi:bc-diff --base v0.19.0 --head HEAD` reports zero breaking changes (14 additive fields only). The `offset` parameter is deprecated and now bounded, but remains accepted and returns a structured hint rather than being removed — existing callers under the bound are unaffected. Setting `canonical_name_fields` on an existing schema is a major *schema* version bump for that entity type (consistent with existing field-removal semantics), not a breaking change to the release itself — it is an opt-in write, not a default behavior change, and affects only new writes.
