# Security Review — v0.17.0

**Classification:** `sensitive=true` (output of `npm run security:classify-diff -- --base v0.16.0 --head HEAD`)

**Surfaces flagged by classify-diff:**
- `openapi-security` — `openapi.yaml`
- `protected-routes-manifest` — `scripts/security/protected_routes_manifest.json`
- `security-gates` — `scripts/security/protected_routes_manifest.json`
- `auth-middleware` — `src/actions.ts`

**Reviewer:** ateles-agent (automated, G4 lane)
**Date:** 2026-06-25

---

## Adversarial review — per Step 3.5 prompt sections

### 1. AAuth admission as `/mcp` authentication path — session-admission race RESOLVED (PR #1731, #1788)

**What the change does.** Before #1731, an AAuth-signed request that resolved to an active `agent_grant` already authenticated REST/CLI direct-write endpoints (via the `aauthAdmission()` middleware stamping `req.authenticatedUserId`). The `/mcp` StreamableHTTP handler was widened to let admitted requests past the 401 gate, but `server.ts initialize` only read `authenticatedUserId` from an OAuth connection-id or Bearer token. An admitted-but-no-OAuth MCP request therefore fell through to `getUnauthenticatedResponse()` and every tool call threw `-32600`. The fix adds `setSessionAdmission()` on `NeotomaServer` so the `/mcp` handler threads the admission result onto the server instance per request; `initialize` then reads `this.sessionAdmission` to authenticate the session when OAuth/Bearer is absent.

**PR #1788 — request-scope ALS threading (admission race fix).** The initial implementation stored admission in a shared `NeotomaServer.sessionAdmission` field. Under highly concurrent admitted `/mcp` requests from different grant owners, request B could overwrite A's admission immediately before A's `initialize` read it — a potential owner-pivot race. PR #1788 removes the shared field entirely and threads admission through the per-request AsyncLocalStorage context (`runWithRequestContext` in `actions.ts`) so each request's admission is isolated. The `setSessionAdmission()` method is now a no-op (deprecated); `initialize` reads admission from the ALS context directly. The CLI dispatch path (`executeToolForCli`) explicitly passes `aauthAdmission: null` — intentional design: CLI callers use local auth, not grant-based AAuth.

**Exposure if mis-implemented.** The two obvious failure modes are:
1. *Unadmitted requests authenticated*: if the ALS context stored a stale or insufficiently-verified admission, a request without a valid agent_grant could become authenticated.
2. *Owner pivot*: if `user_id` were derived from the request body rather than from the admission, a caller could supply a different user's ID. The prior shared-field race was a variant of this: request B's grant owner could shadow A's session.

**Why it is safe as shipped.**

- `admitFromAAuthContext` returns `admitted: true` only when `signature_verified === true` AND the matched grant has `status === "active"`. A forged or unmatched signature stays `admitted: false` and the session falls through to `getUnauthenticatedResponse()` exactly as before.
- The session `user_id` is taken exclusively from `admission.user_id`, which is the grant owner's ID, set at grant creation and never request-derived. The commit message and threat_model.md update both confirm "user_id is always the grant owner — never a request-supplied id — so an AAuth caller cannot pivot owners."
- Admission is stored in and read from the per-request AsyncLocalStorage scope (`runWithRequestContext`), not a shared field. Two concurrent requests from different grant owners each see only their own ALS context — the race is structurally impossible.
- OAuth connection-id and Bearer are checked first; the ALS admission context is consulted only after those fail to produce a user. Existing callers with OAuth or Bearer are entirely unaffected.
- Per-`(op, entity_type)` capability enforcement (`enforceAgentCapability`) and protected-entity-type governance (`assertCanWriteProtectedBatch`) run on every tool call for admitted sessions, identical to the REST path. An admitted MCP session cannot exceed its grant ceiling or touch governance types it wasn't granted.
- Regression coverage:
  - `tests/integration/aauth_mcp_initialize_admission.test.ts` — asserts initialize authenticates from a threaded admission and that an unadmitted session stays unauthenticated.
  - `tests/integration/aauth_mcp_capability_parity.test.ts` — asserts per-tool capability scope through the real ALS wiring (updated to reflect the ALS-based design).
  - `tests/integration/aauth_mcp_session_admission_race.test.ts` — **new in #1788**: red-before-fix, green-after-fix proof that concurrent requests from different grant owners cannot cross-contaminate sessions.

**Residual risk.** None identified. The shared `sessionAdmission` field — the only cross-request state that could enable a race — has been removed. The per-request ALS pattern is the same isolation primitive used throughout `actions.ts` for other per-request context (agent identity, authenticated user ID). The residual risk flagged in the prior draft ("sessionAdmission field on NeotomaServer is a single shared field; concurrency safety relies on Node.js single-threaded event loop semantics — low risk") is **resolved** by #1788.

**Gate:** G1 (classify-diff catches `src/actions.ts` changes), G3 (`test:security:auth-matrix` + `protected_routes_manifest`), G4 (this review). G2 `security:lint` found no `no-auth-local-fallback` or `loopback-trust-in-production` violations in the changed paths.

**Operator action:** Upgrade to v0.17.0. AAuth-admitted MCP sessions now receive parity with REST sessions and are concurrency-safe; no bearer token needed if the agent has a valid `agent_grant`. No configuration change required; existing Bearer/OAuth callers are unaffected.

---

### 2. Proxy session recovery — bounded retry + per-request timeout (PR #1750)

**What the change does.** The stdio MCP proxy dropped sessions on backend restarts or non-sticky replica routing (503 / connection-refused / hang). The fix adds a bounded re-initialize + retry loop (`DEFAULT_MAX_ATTEMPTS=4`, exponential backoff), a per-request timeout (`DEFAULT_REQUEST_TIMEOUT_MS=15s`), and generalised transport-error + timeout handling. Configurable via `NEOTOMA_MCP_PROXY_TIMEOUT_MS` and `NEOTOMA_MCP_PROXY_MAX_ATTEMPTS`.

**Exposure if mis-implemented.** The proxy layer sits between the CLI/agent and the backend. A mis-implemented retry could:
1. *Re-play mutating calls* after a partial write, causing duplicate entities.
2. *Authenticate against a different backend instance* with a stale session, bypassing that instance's per-session auth state.

**Why it is safe as shipped.**

- The retry loop re-initializes a fresh MCP session before replaying the original call. It does not replay the original call against a stale session — it drops the session, re-handshakes, and retries. So the session auth on the retry is as strong as an initial connection.
- Mutation idempotency: Neotoma's `store` and `correct` are already content-addressed / idempotency-keyed. A replayed call after a partial write will resolve to the same entity via the idempotency key.
- `initialize` itself is never auto-retried (the client owns the handshake), preventing a loop that could exhaust a rate limit on the auth endpoint.
- Exhaustion (after `maxRetries` attempts) emits a structured JSON-RPC error and never hangs — the client gets a deterministic failure signal.
- Unit coverage: `src/proxy/mcp_stdio_proxy.test.ts` covers session-loss recovery, restart/timeout recovery, exhaustion, and the no-retry-for-initialize contract.

**Residual risk.** None identified beyond standard retry semantics (potential N-fold server load under restart storms). No auth surface is widened.

**Gate:** G1 (classify-diff does not flag `src/proxy/mcp_stdio_proxy.ts` directly — the proxy layer is not in the auth-middleware path). G2 `security:lint` clean. Covered by the `test:security:auth-matrix` suite which tests the real auth gates, not the proxy transport.

**Operator action:** Upgrade to v0.17.0. MCP proxy sessions now survive backend restarts and replica routing events. `NEOTOMA_MCP_PROXY_TIMEOUT_MS` and `NEOTOMA_MCP_PROXY_MAX_ATTEMPTS` are available for tuning; defaults (`15000ms`, `4`) are reasonable for most deployments.

---

### 3. Real server version in `initialize` response (PR #1689)

**What the change does.** The MCP `initialize` response hardcoded version `"1.0.0"` in three places. This prevented clients from detecting client/server drift. The fix introduces `src/shared/package_version.ts` (reads `package.json`, returns `"0.0.0"` on failure) and replaces all three hardcoded sites.

**Exposure if mis-implemented.** If `readPackageVersion` returned a caller-influenced value (e.g. read from a request header), a downgrade or version-spoofing attack could confuse upgrade logic. Alternatively, if it read from the wrong `package.json`, version detection would silently lie.

**Why it is safe as shipped.** `readPackageVersion` reads `package.json` from a `projectRoot` path resolved at server startup, not from any request input. The helper has a safe fallback (`"0.0.0"`) that degrades gracefully without throwing. Unit tests (`tests/unit/mcp_initialize_version.test.ts`, 6 tests) assert the helper returns the real version and that the server card and initialize both report a non-`"1.0.0"` value. No auth surface is touched.

**Residual risk.** None. This is a pure informational fix.

**Gate:** G1 (classify-diff does not flag this path). G4 (this review notes it for completeness). Impact is visibility-only.

**Operator action:** Upgrade to v0.17.0. Clients that inspect `serverInfo.version` in the initialize response now see the real server version, enabling accurate drift detection.

---

### 4. `user_id`-scoped observation queries (PR #1753)

**What the change does.** Two queries in `storeStructuredInternal` (`server.ts`) lacked `user_id` filters:
1. The existing-observation check queried by observation `id` alone. A content-addressed observation from a different user with the same `id` could cause the current user's insert to be silently skipped, leaving a write/read gap.
2. The snapshot-computation observations fetch queried by `entity_id` alone, allowing cross-user observations to bleed into the snapshot.

Both queries are now scoped with `.eq('user_id', userId)`.

**Exposure if mis-implemented.** The pre-fix queries ran in a multi-user or multi-tenant deployment and could have caused: (a) a user's observation to be silently dropped because another user's observation collided on the content-addressed ID; (b) another user's observation data appearing in a snapshot retrieved by the current user. This is a data-isolation bug, not an auth bypass (a caller cannot read another user's entities — the snapshot is computed and returned, not stored cross-user). However, a sufficiently adversarial caller could craft a store call that intentionally collides with another user's observation ID to suppress that user's write.

**Why it is safe as shipped.** The fix adds `.eq('user_id', userId)` to both the existence check and the snapshot fetch. The `userId` value is taken from `this.getAuthenticatedUserId(parsed.user_id)`, which is the server-authenticated user, not the caller-supplied `user_id` field. Unit tests (`tests/unit/store_strict_and_consistency.test.ts`, 10 tests) cover the fixed paths.

**Residual risk.** The `--strict` merge gate expansion (part of the same PR) permits merges via `canonical_name`, `email`, and stable ID fields. Heuristic fallbacks (`name`, `title`, fuzzy matches) are still refused. The permitted paths are deterministically unique, so unintended merges are low-risk. No auth surface is widened.

**Gate:** G1 (classify-diff does not flag `src/server.ts` store query path directly). G4 (this review). Unit test coverage in `tests/unit/store_strict_and_consistency.test.ts`.

**Operator action:** Upgrade to v0.17.0. Multi-user deployments that previously experienced silent observation drops or incorrect snapshots under content-addressed ID collisions will see correct write/read consistency after upgrade.

---

### 5. New `/identify_entity_by_signals` endpoint + manifest entry (PR #1603, #1670)

**What the change does.** A new `POST /identify_entity_by_signals` endpoint resolves an entity from a multi-signal bundle. It is added to `openapi.yaml` with a `security: [bearerAuth: []]` block and added to `scripts/security/protected_routes_manifest.json` with `requires_auth: true`, `sandbox_allowed: "none"`, and expected 401 on no-auth and invalid-auth.

**Exposure if mis-implemented.** If the route were registered without `auth.requireUser()`, it would expose entity identity resolution (name, email, domain, phone signals) to unauthenticated callers, potentially leaking whether a given identity is stored in the graph.

**Why it is safe as shipped.** The manifest entry declares `requires_auth: true` and `sandbox_allowed: "none"`. G3 (`test:security:auth-matrix`) enforces that the route returns 401 for no-auth and invalid-auth. `openapi.yaml` has the `bearerAuth` security block. The manifest was regenerated via `npm run security:manifest:write` and is in sync with the OpenAPI document.

**Residual risk.** The endpoint accepts open-ended `additional_signals` properties (the OpenAPI schema shows `additionalProperties: true` for that field). If a future refactor exposed internal matching signals as a side channel (timing or content), that would warrant a follow-up review. As shipped, the endpoint only returns a best-match entity and top-N candidates, which are already accessible to authenticated callers via existing retrieve endpoints.

**Gate:** G1 (openapi.yaml changes flow through classify-diff `openapi-security` and `protected-routes-manifest` surfaces), G3 (`test:security:auth-matrix`), G5 (post-deploy probes will exercise the 401 row in the manifest).

**Operator action:** Upgrade to v0.17.0. The endpoint is available to all authenticated callers.

---

### 6. Declarative write-time value constraints (PR #1756)

**What the change does.** `register_schema` gains per-field `constraints` (`min`/`max`, `enum`, `pattern`, `banned`) and a schema-level `constraint_violation_policy` (`"reject"` | `"warn"`). Enforcement runs in both the MCP (`storeStructuredInternal`) and HTTP (`storeStructuredForApi`) store paths before the entity is written. Constraints are validated at registration time (type-appropriateness, `min <= max`, compilable regex) in `SchemaDefinition.validateSchemaDefinition`. No built-in schema declares constraints — the feature is purely opt-in.

**Exposure if mis-implemented.** The primary security-adjacent concern is constraint bypass: if enforcement ran in one store path but not the other, a caller could route around the constraint via the unprotected path. A secondary concern is denial-of-service via over-eager constraint rejection on valid data.

**Why it is safe as shipped.** Enforcement runs symmetrically in both MCP and HTTP paths (the same `field_constraints.ts` module is called from both). The `constraint_violation_policy: "warn"` option explicitly downgrades rejection to an advisory — caller controls risk. Constraints are applied only to schemas that declare them; schemas with no `constraints` field are completely unaffected. Registration-time validation prevents malformed constraints (e.g., non-compilable regexes) from being stored. 55 unit tests in `tests/unit/field_constraints.test.ts` cover the pure evaluation logic. No auth surface is touched.

**Residual risk.** None identified for the shipped scope. The `required` field enforcement is a deliberate follow-up (not changed here) — when it lands it will warrant a separate review.

**Gate:** G1 (classify-diff does not flag this path — no auth-middleware or openapi-security change). G4 (this review). Unit coverage in `tests/unit/field_constraints.test.ts`.

**Operator action:** Upgrade to v0.17.0. Write-time constraints are available for schemas that declare them; no action required for existing schemas.

---

## G2 — Static rules (`npm run security:lint`)

No `ERROR`-level findings. The changed files — `src/actions.ts` (admission threading via ALS), `src/server.ts` (ALS-based admission reads, user_id filters) — do not introduce bare `req.socket.remoteAddress` checks, `X-Forwarded-For` reads outside canonical helpers, or new `LOCAL_DEV_USER_ID` references. No `WARNING`-level findings were identified in the security-relevant paths.

## G3 — Protected routes manifest + auth matrix

`scripts/security/protected_routes_manifest.json` was updated to add `/identify_entity_by_signals` (`requires_auth: true`, `sandbox_allowed: "none"`, expected 401s). The manifest is in sync with `openapi.yaml` (verified by `npm run security:manifest:check` at time of commit). `npm run test:security:auth-matrix` covers the matrix.

## Sign-off verdict

**`yes`** — all material security changes are fail-safe by construction, regression-tested, and flagged correctly by the G1–G3 gates. No new unauthenticated public routes, no loopback-trust widening, no local-dev surface expansion. The `user_id`-scoped observation fix closes a data-isolation bug that could affect multi-user deployments. The `sessionAdmission` shared-field race (previously flagged as residual, low risk) is **resolved** by PR #1788 via per-request AsyncLocalStorage threading, with a dedicated regression test (`aauth_mcp_session_admission_race.test.ts`). Operators should upgrade to v0.17.0; bearer token rotation is not required.

**Caveats to track as follow-ups (non-blocking):**
1. The `/embed/graph` route (`/embed/*`) is unauthenticated by design (public iframe embed). It is not in the protected manifest; verify it is in the allow-list or explicitly excluded from G3 checks in future manifest updates. (The route serves static graph UI only — no data is emitted without the `apiBase` target's own auth enforcing; the current setup is correct but should be documented in the manifest allow-list.)
2. `register_schema` `constraints.pattern` accepts arbitrary regex strings; the server validates compilability at registration time but does not apply ReDoS mitigation (catastrophic backtracking on large inputs). If untrusted schema registrations are ever permitted, add a regex complexity cap. Not applicable for the current trust model (schema registration is operator-only).
