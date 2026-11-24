# Security review — v0.30.0

Manual review lane for `/release` Step 3.5, completed by the release-prep agent with no AI provider (`NEOTOMA_AI_REVIEW_PROVIDER=none`). The supplement's `Security hardening` section links this file. It covers the whole range `v0.29.1..origin/main` and supersedes the earlier v0.30.0 review, which stopped at #2867, and the unreleased v0.29.2 draft.

## Scope

- Base ref: `v0.29.1`
- Code head: `origin/main` at `e4c5e62c0`, 43 commits.
- Release-branch commits on top change only the version (`package.json`, `package-lock.json`), the version lines in `README.md`, `docs/known_limitations.md` and `SECURITY.md`, and release docs under `docs/releases/in_progress/v0.30.0/`.

## Lane results

| Check | Command | Result |
|---|---|---|
| Diff classifier | `npm run security:classify-diff -- --base v0.29.1 --head HEAD --json` | `sensitive=true`, 332 changed files. Concerns: `openapi-security` (`openapi.yaml`); `protected-routes-manifest` and `security-gates` (manifest and `sync_protected_routes_manifest.js`); `auth-middleware` (`src/actions.ts`); `middleware` (`aauth_admission.ts`, `aauth_verify.ts`); `access-policy`; `inspector-mount`; `issues-gh-auth`; `root-landing`; `local-auth` (`sandbox_mode.ts`); `subscriptions`; `sync` |
| Static rules | `npm run security:lint` | 0 errors, 139 warnings across 485 files |
| Protected routes manifest | `npm run security:manifest:check` | In sync with `openapi.yaml` (130 routes) |
| Auth topology matrix | `npm run test:security:auth-matrix` (after `npm run build:server`, `NEOTOMA_ENV=development`, scratch `HOME`, `NEOTOMA_DATA_DIR` unset) | 18 passed, 1 skipped |
| OpenAPI diff | `npm run openapi:bc-diff -- --base v0.29.1 --head HEAD` | 1 breaking (`tightened-additional-properties` on `POST /get_field_provenance [200]`), 24 additive; named in the supplement's Breaking changes |

### Files reviewed by hand

These files sit outside the classifier's path rules but touch credentials, sign-in or sessions, so they were reviewed by hand from their diffs: `src/services/static_bearer_identity.ts` (new), `src/services/oauth_key_gate.ts`, `src/services/mcp_oauth.ts`, `src/services/guest_access_token.ts`, `src/services/agent_grants.ts`, `src/services/aauth_admission.ts`, `src/services/bearer_slots.ts`, `src/services/session_info.ts`, `src/services/aauth_attestation_*`, `src/services/aauth_operator_allowlist.ts`, `src/config_embedded.ts` and `src/services/access_log.ts`. Findings are in the per-commit entries below. The `runtimeEnv()` substitutions (#2866) keep host-variable behavior for the CLI and server; only the embedded entry point reads its explicit map.

## Findings, per commit

### Authentication, sessions and identity

- **#2901 local-development `user_id` override.** `getAuthenticatedUserId` honours a caller-supplied `user_id` only when the request carries the loopback no-token mark and is outside production, or `NEOTOMA_ALLOW_DEV_USER_ID_OVERRIDE=1`. Every token path leaves the mark unset. The sandbox public user stays excluded. Narrows the override; HTTP tests cover both scopes. Breaking for token callers that passed `user_id`; documented.
- **#2908 static bearer as the shared graph owner.** `resolveStaticBearerUserId` returns `NEOTOMA_SHARED_GRAPH_USER_ID` when set, else the local dev user as before. The gate-only connection id is dropped from inbound headers, the WebSocket bridge's `oauth_init` and the process environment, so it is assigned only after the token is presented. Fail-closed branches have unit tests. `GET /me` reports `shared_graph`.
- **#2899 OAuth key-session sign-out.** `revoke()` removes the session expiry and bound identity together. `POST /mcp/oauth/sign-out` answers 200 with or without credentials (declared `security: []`, manifest override records why). Authorize re-prompts after sign-out; a failed Google callback ends the existing session. Tests cover both.
- **#2915 guest-token revocation.** Owner-only route, member authentication required. Correction history is read by the validator's rules; rows naming another token hash or unreadable rows are refused. Canonical error codes; HTTP tests assert them.
- **#2890 agent-grant lookup failure.** A thrown lookup refuses under `lookup_failed` and answers 503 with `Retry-After`. Capability decisions treat it as `no_match`, so nothing refused before is admitted now.
- **#2886 agent-grant `last_used_at`.** The write runs in a fresh context with no agent identity or admission. It touches only `last_used_at` on the matched grant; the debounce entry is kept on failure.
- **#2916 per-user instructions.** `GET /mcp-interaction-instructions` sends `Vary: Authorization` and a private cache header, so a shared cache cannot serve one user's standing rules to another. Without credentials it returns the generic text. The manifest generator now records optional-auth operations as public with expected 200; generator tests cover it.

### Outbound requests and peers

- **#2898, #2902 outbound host guard.** On a non-loopback bind the guard is always on; `NEOTOMA_HOSTED_MODE` can only turn it on for a loopback bind. Tests drive each outbound path (guarded fetch, peer webhook, webhook mirror, inbound `sender_peer_url`, repo-discovery `peer.url`) on a `0.0.0.0` bind. Operator action is in the supplement's Breaking changes.

### Reads and data returned

- **#2867 field provenance.** Every read is scoped to the caller (`user_id` filter, `getOwnedSource`). Foreign contributors raise `PROVENANCE_INTEGRITY_ERROR` naming only ids the caller's snapshot already holds. HTTP no longer returns storage paths, file names, unrelated observation fields or raw provenance blobs. `DB_QUERY_FAILED` returns a fixed message. `tests/security/provenance_read_scoping.test.ts` covers both transports.
- **#2871 as-of relationship reads.** Cutoffs apply inside the existing user-scoped queries; an edge is visible only if it and both endpoints are visible to the caller at T.
- **#2920, #2926 optional retrieve enforcement.** Off by default. When on, it narrows entity reads, typed identifier lookups, merge-link following, MCP resource reads and graph-neighbourhood source and event rows, and refuses an unfollowed merge link. It only removes rows.
- **#2927 structured read log.** Logs entity ids returned by read operations to stdout when the access log is on. No content is logged; stored-content keys are skipped. A guard fails CI when a retrieve-gated route is neither logged nor excluded.
- **#2917 access log.** Redacted address prefixes by default (IPv4 `/24`, IPv6 `/48` from expanded addresses); `NEOTOMA_ACCESS_LOG_FULL_IP=1` logs full addresses. Forwarded-for hops are read only from peers listed in `NEOTOMA_TRUSTED_PROXY_IPS`, and `security:lint` reports no forwarded-for rule errors.
- **#2930, #2907, #2933 instance skills.** Skills on discover use the same graph scoping as `initialize`; the empty-lookup hint names only the caller's own user id.
- **#2906, #2935 standing rules.** Delivered only to the authenticated owner of the graph they belong to, as before; the skip count is a number with no rule content.

### Data layer and performance

- **#2887, #2904 indexes**, **#2900, #2903, #2905 `search_text`**, **#2909 leftover full-text objects**, **#2888, #2889, #2891 search.** No change to who can read what. The `search_text` validator fails closed on an unreadable `raw_fragments` read and refuses to fill when encryption is on. The opt-in drop removes leftover triggers and tables in one transaction, so no copy of deleted text remains. Semantic search no longer calls the embedding provider without a vector backend.
- **#2882, #2884, #2881 ownerless interpretation.** Refused before any write.
- **#2866 embedded configuration.** The embedded path reads no env files or host variables unless named in `allowProcessEnv`.
- **#2879 SDK `correct()`.** Client-side; the server's correction authorization is unchanged.

### Packaging and contributor tooling

- **#2855, #2860** shrink the production dependency tree (340 to 214 installed packages); no `src/` or `bin/` file imports a moved package.
- **#2862** makes worktree env copy opt-in, refuses a `NEOTOMA_ENV=production` source, and rejects staged env files at pre-commit. An opted-in source that points storage at production data without setting `NEOTOMA_ENV=production` is not detected; a follow-up issue tracks it.

### No security surface

- #2816, #2878 (CI), #2848 (design document), #2880, #2892, #2447 (docs), #2911 (test timing).

## Suggested negative tests

- Covered in their pull requests: foreign provenance reads; token callers passing `user_id`; gate-only connection id on non-HTTP transports; sign-out then authorize; revocation by a non-owner; each outbound path on a non-loopback bind; retrieve enforcement on merge hops, cycles and over-deep chains.
- Not covered: a guest-token caller on `POST /get_field_provenance` asserting refusal. The route is member-only through middleware the auth matrix covers.

## Residual risks

- Self-hosters on a non-loopback bind with private webhook or peer targets lose delivery until they rebind or repoint, and subscriptions deactivated during that window stay inactive until re-activated. Documented in Breaking changes.
- Clients that parsed `storage_url` or `original_filename` from HTTP provenance break. Intended and documented.

## Sign-off

Verdict: `yes`.
