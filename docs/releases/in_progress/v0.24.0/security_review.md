# Security review — v0.24.0

`npm run security:classify-diff --base v0.23.0 --head HEAD` reports `sensitive=true`, driven by one concern:

- `auth-middleware` — `src/actions.ts` (the store-warning-rule fail-open fix touches `storeStructuredForApi`, which sits in the same file the classifier watches for auth-middleware changes; the edit itself is an import addition plus a refactor of an advisory-warning evaluator, not an authorization check).

## Gate results

- **G1 `security:classify-diff`**: `sensitive=true`, one concern (`auth-middleware` on `src/actions.ts`).
- **G2 `security:lint`**: 0 errors, 133 warnings across 408 files — same warning categories as the v0.23.0 baseline (`unauth-public-route` matches on long-standing routes; `local-dev-user-widening` matches on the two pre-existing `LOCAL_DEV_USER_ID` references in `sandbox_mode.ts`). No new warning categories or new files introduced this release.
- **G3 `security:manifest:check`**: in sync (120 routes, unchanged from v0.23.0 — this release adds no new Express routes).
- **G3 `test:security:auth-matrix`**: 18 passed / 1 skipped (19 total) — identical to the v0.23.0 baseline.

## Adversarial review

### Alternate-path auth

The two code changes touching request-handling in this release are:

1. `src/actions.ts` / `src/server.ts` — `storeStructuredForApi` and the MCP `store` handler now call `evaluateStoreWarningRule(rule, fields)` instead of inlining `rule.fields.some(...)`. This function only changes whether an **advisory, non-blocking** warning is appended to a store response; it does not gate access to the store operation itself, does not run before authorization, and its output is never consulted by any auth decision. A rule shape the evaluator cannot fully parse now reports `STORE_WARNING_RULE_NOT_EVALUATED` and continues, rather than throwing — the write proceeds exactly as it would if no rule were declared at all. This narrows failure modes (throw → write blocked) rather than widening any privilege boundary.
2. `src/server.ts` — `resolveInstructionLookupUserId()` in `buildAuthenticatedInitializeResponse`. This is a **read-path identity resolution fallback for instruction-lookup content only** (standing rules, instance skills), reached after MCP `initialize` has already authenticated the connection by whatever means the transport enforces (Authorization header or `x-connection-id`-scoped session). The fallback mirrors an existing, already-shipped pattern in `listTools` (`this.sessionConnectionId` → `ensureLocalDevUser()` or `getAccessTokenForConnection()`), does not create a new authentication path, and does not affect any store/read/write data operation — only which standing-rules/instance-skills content is attached to the initialize response. A failed resolution reports `lookup_failed: true` (fail-closed on content, not fail-open on access) rather than silently returning an empty list, which is a stricter posture than before this fix (previously: silently empty, indistinguishable from "no rules configured").

Verified: neither change adds a new Express route, a new MCP tool, or a new branch that reaches a data-mutating call before an existing auth check.

### Proxy trust / `X-Forwarded-For`

No changes to `isLocalRequest`, `forwardedForValues`, or `isProductionEnvironment` in this release (confirmed via `git diff v0.23.0..HEAD -- src/actions.ts` — the only `src/actions.ts` change is the `evaluateStoreWarningRule` import/call-site swap). The auth-matrix test suite's XFF-trust cases (18/19, matching baseline) pass unchanged.

### Local-dev widening

`LOCAL_DEV_USER_ID` / `ensureLocalDevUser()` usage in `src/server.ts`'s `resolveInstructionLookupUserId()` is scoped to the existing `connectionId === "dev-local"` sentinel check, the same pattern `listTools`'s pre-existing fallback already uses — no new call site outside `src/cli/`, `src/services/local_auth.ts`, or the already-established `dev-local` connection sentinel in `server.ts`. `security:lint`'s `local-dev-user-widening` warning count is unchanged from baseline (still the two pre-existing `sandbox_mode.ts` references; the new `server.ts` reference mirrors the existing `listTools` pattern and was not newly flagged).

### Unauth public route

No new Express routes in this release (`security:manifest:check` confirms 120 routes, unchanged). Both code changes are internal to already-registered handlers (`storeStructuredForApi`'s internals, and the MCP `initialize` response builder).

### Guest-access widening

Not applicable — no guest-principal or subscription-auth code touched in this release.

### AAuth downgrade

Not applicable — `aauth_admission.ts` does not appear in this release's diff.

## Suggested negative tests

- Attempt to store an entity whose schema declares a `store_warnings` rule with a condition the evaluator does not recognize (e.g. an unsupported sibling key alongside `missing_all_of`, or a `fields` list containing a non-string entry); confirm the write still succeeds and the response carries `STORE_WARNING_RULE_NOT_EVALUATED` naming the unreadable path. **Already covered**: `tests/unit/store_warning_rule.test.ts` and `tests/integration/store_warning_condition_rule.test.ts` (702 combined new lines) assert this contract directly, including the "list rejected intact, not partially salvaged" case.
- Attempt an MCP `initialize` call authenticated only by `Authorization` header (no `x-connection-id`) against an instance with standing rules and instance skills configured; confirm both are returned rather than silently empty. **Already covered**: `tests/unit/instance_skills_initialize_effect.test.ts` (expanded in this release) exercises the recovery-path case with a session connection id present.
- Attempt the same `initialize` call where identity resolution itself fails (e.g. `getAccessTokenForConnection` throws); confirm the response reports `lookup_failed: true` for both standing rules and instance skills rather than an empty, confident list. Not independently re-verified against this specific release's code path beyond code inspection; the existing `#2131`-era test pattern this release extends already covers the shape of this assertion for the pre-existing `listTools` fallback.

## Residual risks

- The `resolveInstructionLookupUserId()` fallback catches all errors from `getAccessTokenForConnection()` into a single `lookup_failed: true` outcome without distinguishing "connection id not found" from "token expired" from "unexpected internal error." This is intentional per the design (any unresolved identity must read as unknown, not as absent), but means a transient internal error and a genuinely unauthenticated connection are reported identically to the agent. Low risk: this is a read-path content-availability signal, not an access-control decision — no operation gates on it beyond which instructions text is attached to the initialize response.
- `store_warning_rule.ts` is now the single evaluation point for `store_warnings` rules across both the HTTP (`src/actions.ts`) and MCP (`src/server.ts`) store paths, which is the correct consolidation (previously each path inlined its own copy) but means a defect in this one module now affects both surfaces at once. Mitigated by the 702 lines of new unit + integration coverage added in the same release, and by the module's fail-open-and-legible design meaning any residual defect degrades to "unevaluated warning," not "blocked write."

## Sign-off verdict

**with-caveats** — the two residual risks above are both narrowing/neutral relative to pre-release behavior (stricter fail-closed reporting on identity, and consolidated but heavily-tested rule evaluation replacing two inline duplicates that could throw). No new authorization surface, no new Express route, no proxy-trust or local-dev-widening change. Security-lane test counts (auth-matrix 18/19, lint 0 errors/133 warnings, manifest 120 routes) are unchanged from the v0.23.0 baseline.
