Neotoma v0.30.0 is a minor release. Field provenance now returns the same complete, field-scoped evidence over MCP and HTTP, and that changes the response shape for existing callers. The release also moves 42 Inspector and frontend build packages out of the runtime dependencies, so `npm install neotoma` installs far less. For contributors, the worktree env copy becomes opt-in, CI gains new gates, and one design proposal ships.

## Highlights

- **Field provenance returns the full chain, the same way on every transport.** `retrieve_field_provenance` (MCP) and `POST /get_field_provenance` (HTTP) now share one implementation and one declared response. The response lists every contributing observation and its source, ordered by `observed_at` descending then ID. It shows only the requested field and permitted attribution metadata. If any contributor or source is missing, the call returns a typed `PROVENANCE_INTEGRITY_ERROR` instead of a partial chain (#2867).
- **A production install is 43% smaller.** React, Radix UI, Tailwind helpers and the other packages used only to build the Inspector and the site are now devDependencies. Direct runtime dependencies drop from 70 to 28, installed production packages from 340 to 214, and production `node_modules` from 413,320 KiB to 235,916 KiB. The Inspector still ships prebuilt in `dist/inspector` (#2855, #2860).
- **A new packed production-consumer check guards the published package.** `npm run check:production-consumer` packs the package and installs it into an empty project with `--omit=dev`. It rejects frontend build packages in the runtime tree, runs `neotoma --help`, imports the package, reaches `/health`, and requests the Inspector shell and its assets. CI runs it on every PR (#2860).
- **Creating a worktree no longer copies an env file by default.** The copy runs only when `NEOTOMA_WORKTREE_COPY_ENV=1` is set, refuses a source that sets `NEOTOMA_ENV=production`, and no longer prints paths. The pre-commit hook now rejects staged env files other than `*.example` templates (#2862).

## What changed for npm package users

- `npm install neotoma` no longer installs React, Radix UI, Tailwind, `turndown`, `papaparse` or the other Inspector and site build packages. No server or CLI code imports them, and the Inspector is still served from the prebuilt bundle.
- If your own project imported one of those packages without declaring it, relying on Neotoma to bring it in, add it to your own `package.json`.
- `neotoma request` failures keep the server's recovery hint. With `--json`, the stderr error line carries the domain code, message and hint (#2867).

## API surface & contracts

- `getFieldProvenance` now has a declared 200 response, `FieldProvenanceResponse`, with `additionalProperties: false`. It contains `field`, `entity_id`, `value`, `observation_ids`, `observations`, `sources`, and the aliases `source_observation`, `source` and `observed_at`. New schemas `FieldProvenanceObservation` and `FieldProvenanceSource` define the projections (#2867).
- The MCP tool `retrieve_field_provenance` returns the same body. It now includes the plural `observation_ids`, `observations` and `sources`.
- New error code `PROVENANCE_INTEGRITY_ERROR` (HTTP 500, MCP InternalError). Missing or foreign entities and absent fields share `RESOURCE_NOT_FOUND` (HTTP 404, MCP InvalidParams). Both transports carry the same ErrorEnvelope; MCP puts it in error `data`. See `docs/developer/field_provenance.md` and `docs/reference/error_codes.md`.
- No path, operation, MCP tool or CLI command was added or removed. The README still states 67 MCP tools and 113 REST paths.

## Behavior changes

- Field provenance, HTTP: observation and source rows are no longer raw table rows. Each observation's `fields` contains only the requested field. `provenance` holds only write-attribution keys and `data_origin`. Sources return `id`, `mime_type`, `content_hash`, `file_size` and `created_at`, and no longer include `storage_url` or `original_filename`. `observation_ids` is ordered by `observed_at` descending then ID, not in snapshot order.
- Field provenance, MCP: `source.file_urls` is removed. Use `retrieve_file_url` for file access. The `source_observation`, `source` and `observed_at` aliases select the most recent contributor. They do not name a single winner of a merged field.
- Field provenance, both: a dangling observation or source reference returns `PROVENANCE_INTEGRITY_ERROR` instead of a partial 200. A corrected field with no source succeeds, with an empty `sources` array.
- Contributor tooling: the `post-checkout` hook, `scripts/cursor-worktree-init.sh` and `npm run copy:env` skip the env copy unless `NEOTOMA_WORKTREE_COPY_ENV=1` is set. To set up a new worktree, run `cp .env.example .env.development`, or review the source file and then opt in. These scripts are not in the npm package.

## Docs site & CI / tooling

- `.github/workflows/ci_test_lanes.yml` gains new steps. They install the Inspector's build dependencies and run the packed production-consumer check and its unit tests (#2860). They run `tests/scripts/worktree_env_copy.test.ts` (#2862) and ten correction and observation-insert integration test files on PRs (#2816). They also run the field provenance parity and CLI tests (#2867).
- New `scripts/check_production_consumer.js` and `scripts/deny-staged-env-files.js`.
- New `docs/developer/field_provenance.md`. `docs/testing/testing_standard.md` documents the production-consumer check and the worktree env copy test. `docs/developer/development_workflow.md`, `docs/developer/worktree_env.mdc` and the agent rule mirrors describe the opt-in copy.
- New `docs/proposals/target_instance_check.md` (#2848), the revision 8 design for slices 1a and 1b of the target-instance check (design issue #2589). It is a design document only; nothing is implemented.

## Internal changes

- `src/services/field_provenance.ts` replaces the separate MCP and HTTP provenance handlers in `src/server.ts` and `src/actions.ts` (#2867).
- `scripts/simulate_npm_install.js` is updated to match the new dependency split.

## Security hardening

The classifier reports `sensitive=true` for `v0.29.1..HEAD` because #2867 touches `src/actions.ts` and `openapi.yaml`. The change narrows what field provenance exposes. HTTP no longer returns source storage paths, original filenames, unrelated observation fields or internal operation receipts. Owner resolution through `getAuthenticatedUserId`, `user_id` scoping and guest admission are unchanged. The worktree env change (#2862) stops contributor tooling from copying a production env file, and its credentials, into a new worktree unless asked. It also blocks committing env files at pre-commit. No route, middleware or proxy-trust code changed. See the [security review](https://github.com/markmhendrickson/neotoma/blob/main/docs/releases/in_progress/v0.30.0/security_review.md).

## Tests and validation

- Release prep ran the security lane (classifier, static rules, protected-routes manifest check, auth topology matrix) and the OpenAPI breaking-change diff. It also ran the field provenance suites: `tests/integration/field_provenance_contract_parity.test.ts`, `tests/integration/field_provenance_corrected_and_merged.test.ts`, `tests/cli/cli_field_provenance.test.ts` and `tests/security/provenance_read_scoping.test.ts`. With the auth matrix, those five files gave 65 passed and 1 skipped. CI test lanes passed on `main` at `3eb3c1354`. Results are in the security review and the [test coverage review](https://github.com/markmhendrickson/neotoma/blob/main/docs/releases/in_progress/v0.30.0/test_coverage_review.md).

## Breaking changes

- **`POST /get_field_provenance` response is closed and projected (#2867).** `npm run openapi:bc-diff` reports `tightened-additional-properties` on the 200 response. Clients that read `storage_url`, `original_filename`, non-requested keys in `observations[].fields`, or other raw observation columns from this response will no longer find them. Migration: read the requested field from `observations[].fields[field]`, use `retrieve_file_url` / `GET /get_file_url` for file access, and use `sources[].id` to join.
- **MCP `retrieve_field_provenance` drops `source.file_urls` (#2867).** It was always an empty array. Migration: call `retrieve_file_url`.
- **Incomplete provenance is an error, not a partial result (#2867).** A missing or foreign contributor or source now returns `PROVENANCE_INTEGRITY_ERROR` (HTTP 500, MCP InternalError), where HTTP previously returned 200 with the rows it found. Migration: handle the error code. `details` names the unresolved reference and carries a repair hint.
- **`observation_ids` order changed on HTTP (#2867).** The order is now `observed_at` descending then ID, matching `observations`. Migration: do not rely on snapshot order.
- **Runtime packages removed from `dependencies` (#2860).** This only affects projects that imported an Inspector build package through `neotoma` without declaring it. Migration: add the package to your own `package.json`.
