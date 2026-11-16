# Security review — v0.30.0

Manual review lane for `/release` Step 3.5, completed by the release-prep agent with no AI provider (`NEOTOMA_AI_REVIEW_PROVIDER=none`). The supplement's `Security hardening` section links this file. This review supersedes the v0.29.2 review (RC PR #2854), which did not cover #2867.

## Scope

- Base ref: `v0.29.1`
- Code head: `origin/main` at `3eb3c1354`, 5 commits: #2848 Markdown proposal; #2816 CI integration-test step; #2860 dependency split plus packed production-consumer check; #2862 opt-in worktree env copy plus pre-commit env-file guard; #2867 unified field-scoped provenance.
- Release-branch commits on top change only the version (`package.json`, `package-lock.json`), the version lines in `README.md`, `docs/known_limitations.md` and `SECURITY.md`, and release docs under `docs/releases/in_progress/v0.30.0/`.

## Lane results

| Check | Command | Result |
|---|---|---|
| Diff classifier | `npm run security:classify-diff -- --base v0.29.1 --head HEAD --json` | `sensitive=true`, 44 changed files; concerns `openapi-security` (`openapi.yaml`) and `auth-middleware` (`src/actions.ts`) |
| Static rules | `npm run security:lint` | 0 errors, 138 warnings across 473 files; same warning count as v0.29.1, none in changed lines |
| Protected routes manifest | `npm run security:manifest:check` | In sync with `openapi.yaml` (127 routes) |
| Auth topology matrix | `npm run test:security:auth-matrix` (after `npm run build:server`, `NEOTOMA_ENV=development`, scratch `HOME`, inherited `NEOTOMA_DATA_DIR` unset) | 18 passed, 1 skipped |
| Provenance scoping | `tests/security/provenance_read_scoping.test.ts` | Passed |
| OpenAPI diff | `npm run openapi:bc-diff -- --base v0.29.1 --head HEAD` | 1 breaking (`tightened-additional-properties` on `POST /get_field_provenance [200]`), 9 additive response fields; named in the supplement's Breaking changes |

## Findings

### #2867 field provenance (the sensitive surface)

- **Alternate-path auth:** the `src/actions.ts` change replaces the inline `get_field_provenance` handler body with a call to `getFieldProvenance(entity_id, field, userId)`. `userId` still comes from `getAuthenticatedUserId(req)` in the unchanged handler preamble. No new route, middleware or auth branch was added. The MCP handler in `src/server.ts` keeps its existing user resolution and calls the same service.
- **Tenant isolation:** every read in `src/services/field_provenance.ts` is scoped to the caller. The snapshot and observation reads apply `.eq("user_id", userId)`, and source reads go through `getOwnedSource(id, userId, …)`. A foreign contributor is not returned. It raises `PROVENANCE_INTEGRITY_ERROR`, whose `details` name only the referenced ID that the caller's own snapshot already holds. Foreign entities and missing fields return the same `RESOURCE_NOT_FOUND` message, and the message names only the caller's own arguments. `tests/security/provenance_read_scoping.test.ts` covers both transports.
- **Data exposure:** the change reduces exposure. HTTP no longer returns `storage_url`, `original_filename`, unrelated observation fields or raw `provenance` blobs, which can hold conditional-operation receipts. Attribution is limited to an allowlist of write-attribution keys plus `data_origin`.
- **Proxy trust, local-dev widening, unauthenticated public routes, AAuth downgrade:** no code in these areas changed.
- **Guest access:** the operation remains member-only, and guest admission is unchanged.
- **Error envelopes:** `DB_QUERY_FAILED` now returns a fixed message instead of the raw database error text, so it no longer leaks query internals.

### Other commits

- #2860 removes 42 packages from runtime `dependencies`, which shrinks the production supply-chain surface (340 to 214 installed packages). No file under `src/` or `bin/` imports a moved package.
- #2862 reduces credential exposure in contributor tooling. The copy is opt-in, refuses a `NEOTOMA_ENV=production` source and fails closed. It does not detect an opted-in source that points storage at production data without setting `NEOTOMA_ENV=production`; a follow-up issue tracks that gap.

### Release-prep observation

The operator's main checkout still runs the pre-#2862 `post-checkout` hook. When release prep created this worktree, that hook copied `~/.config/neotoma/.env` into `.env.development`. The file was deleted before any test ran and was never staged. Inherited shell variables also pointed the first test runs at the operator's data directory. That directory is read-only in the release sandbox, so nothing was written, and the reported runs used a scrubbed environment. Once the operator's checkout is on a release that includes #2862, the hook stops copying.

## Suggested negative tests

- Covered: foreign entity, foreign contributor observation, foreign contributor source, missing observation, missing source, absent field (parity, CLI and scoping suites).
- Not covered: a guest-token caller on the HTTP route asserting refusal. The route is member-only through existing middleware, and the auth matrix covers that middleware, so this is advisory.

## Residual risks

- Clients that parsed `storage_url` or `original_filename` from the HTTP provenance response break. This is intended and documented as breaking.

## Sign-off

Verdict: `yes`.
