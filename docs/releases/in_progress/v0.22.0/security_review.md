# Security review — v0.22.0

**Classification:** `npm run security:classify-diff --base v0.21.5 --head HEAD --json` → `sensitive: true`

Concerns flagged: `openapi-security` (new `/instance-policy` path in `openapi.yaml`), `protected-routes-manifest` (manifest regenerated to include the new route), `security-gates` (manifest file touched), `auth-middleware` (`src/actions.ts` touched — file-identity match; the change in this file is the shared-graph OAuth callback fix plus the new instance-policy write-enforcement call site, not a change to `isLocalRequest`/proxy-trust logic).

## Gate results

- **G1** `security:classify-diff`: `sensitive=true` (see above).
- **G2** `security:lint`: 0 errors, 126 warnings (baseline was 125 on v0.21.5; +1 is `unauth-public-route` firing on the new `GET /instance-policy` route registration, a heuristic regex match — the route carries `requires_auth: true` in the protected-routes manifest and passes the auth-matrix test below). No new warnings from `src/services/instance_policy.ts` or the `google_oidc.ts` fix.
- **G3** `security:manifest:check`: in sync, 119 routes (up from 118 on v0.21.5 — the +1 is the new `GET /instance-policy` entry, `requires_auth: true`). `test:security:auth-matrix`: 18 passed, 1 skipped (same as v0.21.5 baseline).
- **G4** This document.

## Adversarial review

### 1. Alternate-path auth

**Surface touched:** `src/actions.ts` (Google OAuth callback handler, `~line 2901`), `src/services/google_oidc.ts` (`getSharedGraphUserId`).

The fix narrows `getSharedGraphUserId()` to reject the nil UUID (`00000000-0000-0000-0000-000000000000`) in addition to the existing malformed-value rejection. No new auth path is introduced — the shared-graph binding mechanism is unchanged; only the set of values it accepts as a valid bind target shrinks. This is a **fail-closed** tightening, not a new bypass surface: a previously-accepted misconfiguration (nil UUID) now falls back to the same isolated per-email path used for any other malformed value, which was already the safe default for the unset case.

Adversarial question: can an attacker who controls neither the environment variable nor a Google account force a signer onto the shared graph, or off it, by exploiting this change? No — `getSharedGraphUserId()` reads only `process.env.NEOTOMA_SHARED_GRAPH_USER_ID`, which is operator-configured, not caller-influenced. The change affects only how the *operator's own misconfiguration* is handled.

**Verdict:** Correctness fix that strictly narrows an operator-configured trust boundary. No new attacker-reachable path.

### 2. Proxy trust / `X-Forwarded-For`

No changes to `isLocalRequest`, `forwardedForValues`, or any proxy-trust helper in this release. `fly.toml` change is deploy-config only (removes a stale `app` field; does not touch networking, headers, or trust settings). Not applicable.

### 3. Local-dev shortcuts / `LOCAL_DEV_USER_ID` widening

No references to `LOCAL_DEV_USER_ID` added or modified in this release (confirmed via `security:lint`'s `local-dev-user-widening` rule — the 2 warnings present are pre-existing, in `src/services/sandbox_mode.ts`, unchanged by this diff). Not applicable.

### 4. Unauth public route

**Surface touched:** new `GET /instance-policy` route (REST) and the corresponding `describe_instance_policy` MCP tool.

`openapi.yaml` declares `requires_auth: true` for the REST path (confirmed in `security_lint` output and cross-checked directly in `scripts/security/protected_routes_manifest.json`: `{"path": "/instance-policy", "method": "GET", "operation_id": "describeInstancePolicy", "requires_auth": true, ...}`). `security:manifest:check` confirms the manifest is in sync with `openapi.yaml` (no drift), and `test:security:auth-matrix` passes with no new failures. The REST handler in `src/actions.ts` calls `getAuthenticatedUserId(req, undefined)`, matching the manifest.

**Finding (BLOCKING, found and fixed during this release's preparation via an independent `/review` pass):** the MCP tool handler `describeInstancePolicy()` in `src/server.ts` initially did **not** call `getAuthenticatedUserId()` — unlike its REST sibling and unlike every other MCP tool handler in the same file (e.g. `describeEntityType`, two functions below it). MCP tool dispatch (`CallToolRequestSchema` in `src/server.ts`) has no outer auth gate; each handler is individually responsible for enforcing authentication. An MCP session that never resolved an authenticated identity (no `NEOTOMA_CONNECTION_ID` / OAuth binding) could call `describe_instance_policy` successfully and read the instance's configured policy — a real divergence from the documented `requires_auth: true` contract, reachable on the MCP transport even though the REST transport correctly rejected it.

**Fix:** added `this.getAuthenticatedUserId()` (return value discarded — its only role is to throw when unauthenticated) as the first line of `describeInstancePolicy()`, mirroring the REST handler and every sibling MCP tool. Regression test added: `tests/integration/describe_instance_policy_auth.test.ts` (2 cases — rejects when unauthenticated, succeeds once authenticated). Both pass.

Adversarial question: does the instance-policy read leak information about the caller's tenant, or another tenant's data, to a cross-tenant *authenticated* caller? No — the endpoint returns only the instance's own configuration (what it declares itself willing to hold); there is no caller-supplied identifier on the read path, so the response is identical regardless of which authenticated caller asks. `tests/security/tenant_isolation_matrix.test.ts` gained new rows asserting the *inverse* property is true by design: the endpoint intentionally is not scoped to a caller, and that is called out explicitly rather than left implicit. This part of the design was correct from the start; only the authentication precondition was missing on the MCP transport.

**Verdict:** Correctly gated on REST from the start; MCP gap found and fixed during release preparation, with regression coverage. Not a new unauth surface as shipped in this release.

### 5. Guest-access widening

No changes to guest-access token issuance, scope, or verification (`assertGuestWriteAllowed`, guest token middleware) in this diff. The new `/instance-policy` route's manifest entry carries `sandbox_allowed: "none"` — it is not reachable via any sandbox/guest-relaxed path. Not applicable.

### 6. AAuth downgrade

No changes to AAuth signature verification, agent-attribution provenance, or the `external_actor` verification path in this diff. Not applicable.

## Instance-policy enforcement surface (new, not on the standard adversarial checklist but material to this release)

The instance-policy feature adds a new **write-rejection** control, which is the inverse direction of most security review concerns (it makes writes *harder*, not easier) but still merits adversarial scrutiny for two failure modes:

**Fail-open on lookup failure?** No — `tests/integration/instance_policy_db_enforcement.test.ts` includes a dedicated suite (`"an unreadable policy fails closed and says why (#1975)"`) asserting that a lookup failure (simulated as a thrown "connection reset") is reported as `lookup_failed` and the write is refused, not silently admitted. Verified passing in this run (3/3 cases in that describe block).

**Bypass via one write core while enforced on another?** The PR's own structural regression test (`tests/unit/instance_policy_write_path_coverage.test.ts`, now 11 tests with this release's addition, all passing) asserts every ENTITY write path (REST `store`, CLI `store`, MCP `store`, and `correct`) calls the enforcement gate before the first persistence. This is the exact class of gap the feature exists to close (the MCP core bypasses the shared `createObservation` helper and was previously unguarded by any shared-helper-only check) — the structural test is a design response to that specific risk, not an afterthought.

**Finding (BLOCKING, found during this release's preparation via an independent `/review` pass): raw/reference file storage is NOT covered.** `storeUnstructuredForApi` in `src/actions.ts` (the raw-file and reference-file `/store` path, used when the request has no `entities` array) calls `storeRawContent` / `storeRawReference` directly and never calls `assertStorePolicyAllows`. An instance configured with `enforcement: "enforced"` still accepts arbitrary raw file content through this path with zero policy evaluation. The gap was invisible to the structural coverage test because that test's docblock scopes itself explicitly to `storeStructuredForApi`, `storeStructuredInternal`, and `createCorrection` — the raw-file path was never in scope, and no code comment, doc, or the original supplement flagged the omission as intentional.

Root cause, not merely an oversight: the policy's `out_of_scope_entity_types` and `max_sensitivity_class` gates are keyed on `entity_type` and schema-declared sensitivity. Raw file storage never constructs a typed entity — it persists a `sources` row directly from bytes — so those gates have no evaluable target at that call site as currently designed. Closing this needs either a content-type/size-based raw-storage policy dimension or blocking raw storage outright under `enforcement: "enforced"`, both larger design changes than fit in release preparation.

**Resolution for this release:** rather than build new enforcement logic during release prep (which would need its own design review), the gap is now explicitly documented as a known scope boundary in three places: `src/services/instance_policy.ts`'s docblock, an inline comment at the `storeUnstructuredForApi` call site in `src/actions.ts`, and a new explicit test case in `tests/unit/instance_policy_write_path_coverage.test.ts` (`"documents (does not enforce) the known raw-file storage exception"`) that asserts the gate call is absent and fails loudly — forcing a deliberate decision — if someone adds inconsistent partial enforcement later without updating the documentation together. This converts a silent gap into a tracked, visible one; it does not close the gap. **An operator relying on `enforcement: "enforced"` to fully block a data category MUST NOT assume raw file uploads are covered — only structured `store` calls with an `entities` array are enforced today.**

**No-PII in denial responses:** `tests/unit/instance_policy.test.ts` includes a dedicated `"instance policy — no PII in the denial envelope"` describe block (part of the 31 passing tests in that file), asserting a submitted value never appears in any denial response. Denial hints interpolate only schema-declared field *names* and configured policy values.

## Suggested negative tests (already covered, cross-referenced here for auditability)

- Nil-UUID rejection, case-insensitive and with surrounding whitespace — covered in `tests/unit/google_oidc.test.ts`.
- A UUID containing zero-groups but not all-zero (e.g. `00000000-0000-0000-0000-000000000099`) is still accepted — regression guard against over-broad rejection, covered in the same file.
- Cross-tenant read on `/instance-policy` — covered by the new tenant-isolation-matrix rows (design intentionally non-scoped; documented, not silently permissive).
- Write-path coverage across all three cores — covered structurally, not just behaviorally, per above.

## Residual risks

- **Operator deployment ordering for the nil-UUID fix.** Per PR #2142's own description: any instance currently running with `NEOTOMA_SHARED_GRAPH_USER_ID` set to the nil UUID will, on upgrade, have every signer's session resolve to their own isolated per-email graph instead of the previously-nil-bound shared graph — this looks like "the shared graph disappeared" from the affected users' perspective, even though no data is lost (it remains attributed to the nil UUID in the database). This is a **behavior-visible, not data-destructive** change, but it requires the same operator migration discipline described in the PR (repoint existing nil-attributed rows to a real identity, then update the binding) for any instance actually running this misconfiguration today. Flagged in the supplement's Breaking changes section as an operator action item, not a code defect.
- **`security:lint`'s +1 warning is a heuristic false positive**, not a real gap — verified directly against the manifest and the passing auth-matrix test. No code action needed; documented here so the delta from the v0.21.5 baseline (125 → 126) is explained rather than silently absorbed.
- **Raw-file storage is not covered by instance-policy enforcement, by design limitation, not oversight-in-code (though it WAS an oversight-in-documentation until this release's preparation caught it).** See the "Instance-policy enforcement surface" section above. Any operator who has configured `enforcement: "enforced"` expecting it to fully gate what an instance holds, including uploads, needs to know this boundary exists. Tracked as a follow-up feature (raw-storage policy dimension), not a defect in what shipped structurally — but a real gap in what "enforced" currently guarantees.
- **`add_issue_message`'s remote leg has the same reporter-provenance forwarding bug this release fixes for `submit_issue`, and is NOT fixed here.** Found during release preparation when verifying the release supplement's claim of parity between the two; the claim was false and has been corrected in both the supplement and `docs/subsystems/issues.md`. Not a security issue (no PII exposure, no auth bypass) — a correctness gap that silently drops non-sensitive build-provenance metadata on one of two symmetric code paths. Tracked as a follow-up issue.

## Findings from independent `/review` pass (release-preparation Step 3.6)

An independent subagent review of `v0.21.5..HEAD` (full findings in `test_coverage_review.md`) surfaced 3 BLOCKING findings, all resolved before this document's sign-off:

1. `describe_instance_policy` MCP tool missing the authentication gate present on its REST sibling — **fixed**, see § Unauth public route above.
2. `storeUnstructuredForApi` (raw file storage) not covered by instance-policy enforcement — **documented as a known, tracked scope boundary** (not fixed; closing it is a larger design change), see § Instance-policy enforcement surface above.
3. Release docs falsely claimed `add_issue_message` already has parity with the `submit_issue` reporter-provenance fix — **corrected** in `docs/subsystems/issues.md` and the supplement; the underlying `add_issue_message` bug remains unfixed and is tracked as a follow-up.

## Sign-off

**with-caveats** — no PII newly introduced into any observable surface; the shared-graph auth-narrowing fix is a strict tightening of an operator-configured value with an explicit fail-closed fallback; the new `/instance-policy` REST endpoint was correctly gated and manifest-synced from the start; the new write-enforcement control has structural (not just behavioral) regression coverage against the exact bypass class it was built to prevent, for the three write cores it covers. Two real gaps were found by an independent review pass during preparation: the MCP `describe_instance_policy` tool was initially missing the authentication check its REST sibling has (**fixed** in this preparation pass, with a regression test) and raw/reference file storage is not covered by instance-policy enforcement (**not fixed** — documented as an explicit, tracked scope boundary rather than closed, since closing it is a larger design change than fits in release preparation). The caveat: any operator configuring `enforcement: "enforced"` must understand it does not gate raw file uploads today. This is disclosed here and in the supplement, not silently shipped.
