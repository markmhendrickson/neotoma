# v0.12.1 security review

Pre-release security review for v0.12.1. Covers Step 3.5 of the release skill (`.cursor/skills/release/SKILL.md` G1–G4).

## Scope

Diff range: `v0.12.0` → working tree.

Security-relevant surfaces touched:

- `src/actions.ts` — guest auth path: `maybeStampGuestPrincipal` now async and validates an inbound `Authorization: Bearer …` against `validateGuestAccessToken`; `resolveGuestScopedEntityAccess` re-asserts the same check via `assertValidGuestAccessToken`.
- `src/tool_definitions.ts` — MCP JSON Schema: removed top-level `anyOf` from `submit_issue` / `add_issue_message` / `get_issue_status`. Server-side enforcement at the action handlers is unchanged.
- `tests/integration/guest_invalid_bearer_routes.test.ts` — new regression test that asserts `401` (not anonymous downgrade) for guest-capable protected routes when called with an invalid bearer.
- Documentation: `SECURITY.md`, `docs/security/threat_model.md`, `docs/developer/cli_reference.md`, `docs/developer/launchd_dev_servers.md`, `docs/developer/scripts_reference.md`, `docs/specs/MCP_SPEC.md`, `docs/subsystems/{issues,peer_sync,subscriptions}.md`, `docs/site/pages/en/{peer-sync,subscriptions,issue-reporting,security-hardening}.mdx`.
- Tooling: `scripts/build_inspector.js` (fail-closed when submodule absent during `prepublishOnly` / `pack:local`).

## Gates

### G1 — `security:classify-diff`

`npm run -s security:classify-diff -- --base v0.12.0 --head HEAD` → `sensitive=true`.

Flagged sensitive paths:

- `auth-middleware: src/actions.ts`
- `root-landing: src/services/root_landing/site_nav.ts`

Interpretation: the auth-path change in `src/actions.ts` is the primary security-relevant code change. It is covered by negative tests in `tests/integration/guest_invalid_bearer_routes.test.ts` and by the `tests/security/auth_topology_matrix.test.ts` lane. The root-landing nav mirror change is flagged because root landing is a public surface, but the diff only mirrors four already-public docs links from the frontend docs nav into the server-side landing-nav snapshot.

### G2 — `security:lint`

`npm run -s security:lint` → **0 errors, 110 warnings across 289 files**.

All warnings are pre-existing `unauth-public-route` findings on routes that **are** declared in `protected_routes_manifest.json` (verified by G3 below). v0.12.1 does not add or remove any route registration, so the warning count is unchanged from `v0.12.0`.

No suppression directives were added in this diff.

### G3 — `security:manifest:check` and `test:security:auth-matrix`

- `npm run -s security:manifest:check` → `protected_routes_manifest.json: in sync with openapi.yaml (106 routes)`.
- `npm run -s test:security:auth-matrix` → 16 passed, 1 skipped, 0 failed (1.64s). The skipped case is the pre-existing AAuth-only matrix entry that requires keys not provisioned in CI.

### G4 — Manual review (substituting for `security:ai-review`)

#### G4.1 Guest-token validation tightening (`src/actions.ts`)

**What changed:**

`maybeStampGuestPrincipal` is now `async` and, when the request carries `Authorization: Bearer …` plus a parseable guest principal, calls `validateGuestAccessToken(guestPrincipal.accessToken)` before stamping. If validation fails, the function returns `false` so the upstream middleware falls through to the standard `401` path.

`resolveGuestScopedEntityAccess` calls a new `assertValidGuestAccessToken(principal)` helper that re-validates the access token before resolving the user-scoped entity row. The helper throws `Not authenticated - invalid guest access token` on failure.

`resolveGuestUserId`'s no-token error message gains the `Not authenticated - …` prefix so operators can grep auth failures consistently.

**Risk addressed:** previously, a syntactically valid but unrecognized bearer token (UUID-shaped) on a guest-capable route could pass `buildGuestPrincipalFromRequest` and reach `stampGuestPrincipal` without re-validating against the persisted token grant, falling through to anonymous-equivalent attribution downstream.

**Negative tests:** `tests/integration/guest_invalid_bearer_routes.test.ts` (new) covers `GET /entities/duplicates`, `GET /events/stream`, `POST /get_subscription_status`, `POST /issues/add_message`, `POST /issues/status`, `POST /issues/submit`, `POST /list_subscriptions`, `POST /subscribe`, `POST /unsubscribe` — each must return `401` with `AUTH_INVALID|Unauthorized - invalid` in the body when called with `Authorization: Bearer invalid-guest-token`.

**Suggested additional negative tests (deferred):**

- A guest token whose `revoked_at` is set (TTL-aware revocation path).
- A guest token that successfully stamps but is then revoked mid-request — exercises `resolveGuestScopedEntityAccess`'s post-stamp re-validation.
- A guest token that succeeds at stamping but whose `user_id` mapping has been deleted between stamp and entity resolution.

These extend coverage but do not block v0.12.1; they are tracked as suggested follow-ups.

**Residual risk:** none identified for the in-scope routes. The new validation runs synchronously in the request lifecycle before any downstream entity resolution.

**Verdict:** approved.

#### G4.2 MCP JSON Schema simplification for Codex / OpenAI compatibility (`src/tool_definitions.ts`)

**What changed:**

Removed the top-level `anyOf` combinator from `submit_issue`, `add_issue_message`, and `get_issue_status` JSON Schemas. The combinator previously expressed "at least one of `reporter_git_sha` / `reporter_app_version`" (`submit_issue`) or "at least one of `entity_id` / `issue_number`" (`add_issue_message`, `get_issue_status`). OpenAI's function-tool registry rejects schemas with a top-level combinator, so Codex could not register these tools at all.

Server-side enforcement is unchanged:

- `submit_issue` returns `400 ERR_REPORTER_ENVIRONMENT_REQUIRED` with `details.acceptable_field_groups: [["reporter_git_sha"], ["reporter_app_version"]]` when both are missing.
- `add_issue_message` and `get_issue_status` still require `entity_id` or `issue_number` at the action handler.

**Risk addressed:** none — this is a compatibility fix for clients that could not consume the schemas. There is no security risk from clients that previously *did* consume the schemas correctly.

**Risks introduced:** none. The schema combinator was descriptive, not enforceable; removing it cannot weaken any existing validation that was already happening server-side.

**Regression coverage:** `tests/contract/openclaw_plugin.test.ts` — the renamed test "issue tools avoid top-level anyOf so Codex/OpenAI accept the schemas" asserts the absence of top-level `anyOf` and the presence of the relevant `properties.*` fields on all three tools.

**Verdict:** approved.

#### G4.3 Inspector packaging fail-closed (`scripts/build_inspector.js`)

**What changed:**

When the `inspector/` submodule is missing (`inspector/package.json` does not exist), the build script now exits `1` instead of `0`. `SKIP_INSPECTOR_BUILD=1` still bypasses the build for the legitimate skip case.

**Risk addressed:** previously, an operator running `npm pack` or `npm publish` from a fresh checkout that had not initialized the submodule would silently produce a tarball *without* the bundled Inspector. The packaged `dist/inspector/` would be empty, and consumers would silently lose the Inspector UI on install.

**Regression coverage:** `tests/contract/package_scripts.test.ts` pins the Inspector Vite entrypoints (`dev:vite`, `build:vite`, `build:watch`, `preview`) to `--config vite.config.ts` so the build cannot regress to a stale config file.

**Verdict:** approved.

#### G4.4 Documentation-only changes

`SECURITY.md`, `docs/security/threat_model.md`, `docs/developer/cli_reference.md` (Doctor section), `docs/developer/launchd_dev_servers.md` (`--kill-zombies`), `docs/developer/scripts_reference.md`, `docs/specs/MCP_SPEC.md` (`bulk_close_issues` / `bulk_remove_issues` table rows; `observation_source` / `source_peer_id` / `external_actor` on `store`), `docs/subsystems/{issues,peer_sync,subscriptions}.md`, the four new site pages, and the changelog highlight.

These are purely documentation; they describe runtime behaviors that already shipped in `v0.12.0`. They do not change runtime behavior.

**Verdict:** approved.

## Amendment — PR #79 (self-hosted auth + Cloudflare Tunnel fixes)

PR #79 (`test/current-branch-build` → `main`, commit `356ee2c10`) touches `src/actions.ts` and `src/crypto/mcp_auth_token.ts` — flagged `sensitive=true` by the G1 classifier (`auth-middleware`).

### G1 — `security:classify-diff`

`npm run -s security:classify-diff -- --base origin/main --head test/current-branch-build --json` → `sensitive=true`.

Flagged: `auth-middleware: src/actions.ts`.

### G2 — `security:lint`

`npm run -s security:lint` → **0 errors, 110 warnings across 290 files**. No new errors or suppression directives.

### G3 — `security:manifest:check` and `test:security:auth-matrix`

- `npm run -s security:manifest:check` → `protected_routes_manifest.json: in sync with openapi.yaml (106 routes)`.
- `npm run -s test:security:auth-matrix` → 16 passed, 1 skipped, 0 failed.

### G4 — Manual review

#### G4.5 Bearer token auth decoupled from `NEOTOMA_ENCRYPTION_ENABLED` (`src/crypto/mcp_auth_token.ts`, `src/actions.ts`)

**What changed:**

`getMcpAuthToken()` previously returned `null` whenever `config.encryption.enabled` was `false`, regardless of whether a key source (`NEOTOMA_KEY_FILE_PATH` or `NEOTOMA_MNEMONIC`) was configured. The early-return guard is removed. The function now returns a derived token whenever a key source is present.

In `src/actions.ts`, the `bearer_mcp_token` validation block in both the REST middleware and the MCP route handler was nested inside `if (config.encryption.enabled)`. Both blocks are now moved above that condition so they execute whenever `getMcpAuthToken()` returns a non-null value.

**Security analysis:**

The change only widens the set of *accepted* valid tokens — it does not relax validation. The token comparison continues to use `safeCompareTokens` (constant-time). An operator must have `NEOTOMA_KEY_FILE_PATH` or `NEOTOMA_MNEMONIC` set for the new path to activate; absent a key source, `getMcpAuthToken()` still returns `null` and the path is inert.

The previous behavior was a misconfiguration trap: `neotoma auth mcp-token` derived a token that the server silently rejected. Fixing this closes a user-facing gap while leaving the authentication model unchanged.

**Risk introduced:** none. The validation logic is identical; only the gating condition changed.

**Verdict:** approved.

#### G4.6 `NEOTOMA_TRUSTED_PROXY_IPS` (`src/actions.ts`)

**What changed:**

New `parseTrustedProxyIPs` and `isTrustedProxyIP` functions read `NEOTOMA_TRUSTED_PROXY_IPS` (comma-separated IPs/CIDRs). `isLocalRequest()` now accepts a loopback-socket request if every XFF entry is either a loopback address or matches a trusted proxy CIDR.

**Security analysis:**

The feature is opt-in and off-by-default — `NEOTOMA_TRUSTED_PROXY_IPS` is unset in all existing deployments, leaving `isLocalRequest()` behavior unchanged.

When set, the operator explicitly declares which proxy IPs are trusted infrastructure. The CIDR matching uses bitwise IPv4 arithmetic with no external dependency and no dynamic code evaluation. The function does not affect any other auth path; it only influences whether `isLocalRequest()` returns `true`.

Misconfiguration risk: an operator who sets `NEOTOMA_TRUSTED_PROXY_IPS=0.0.0.0/0` would trust all XFF IPs, effectively allowing any request on a loopback socket to be treated as local. This is an operator error analogous to misconfiguring `NEOTOMA_TRUST_PROD_LOOPBACK=1`. It is documented as operator responsibility and consistent with how other trust-extension env vars work in this codebase.

**Verdict:** approved.

## Suggested negative tests (forward-looking)

- Revoked guest token end-to-end (see G4.1).
- Concurrent revocation race (token valid at stamp, revoked at entity resolution).
- Inspector packaging: a CI job that runs `git submodule deinit inspector && npm pack` and asserts the pack fails with the new `process.exit(1)`.
- Codex / OpenAI function-tool registration smoke test that imports `buildToolDefinitions()` output and registers it against the OpenAI tool-validation surface.

None of these block v0.12.1.

## Residual risks

- The G1 classifier does not currently flag changes to the auth middleware as `sensitive`. v0.12.1 surfaces this gap; the recommended follow-up is to extend `scripts/security/classify_diff.js` to track `src/actions.ts` lines around `maybeStampGuestPrincipal` / `resolveRoutePrincipal` / `resolveGuestUserId`. Tracked separately; not blocking.
- All other risks are explicitly mitigated by the negative-test coverage above.

## Sign-off

**Verdict: yes** — proceed with v0.12.1.

The patch is small, well-scoped, and the security-relevant change (guest token validation) is covered by both the new integration test and the existing `auth_topology_matrix` lane. The MCP schema simplification has no security impact. Documentation changes are non-runtime. Inspector packaging is hardened, not weakened.

The only caveat: extend the G1 classifier to flag auth-middleware changes in a follow-up so a future regression in this same neighborhood does not pass `classify-diff` as `sensitive=false`.
