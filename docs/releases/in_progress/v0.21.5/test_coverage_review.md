# Test coverage review — v0.21.5

Base: `v0.21.4`, Head: `HEAD` (`f79a037e1` + one release-prep fix commit).

## Surfaces walked

### 1. `GET /entities/:id/html` — strict CSP + `nosniff` (rendered_page XSS hardening)

Classification: **Covers user-observable behavior end-to-end.**

`tests/security/rendered_page_csp.test.ts` stores a `rendered_page` entity with an `html_body` fixture, then issues a real `GET /entities/:id/html` request against a live Express app and asserts on the actual response headers (`Content-Security-Policy`, `X-Content-Type-Options: nosniff`). This is the surface a user would hit (viewing a shared/guest-accessible rendered page), not a helper-level unit test. Ran directly: 1 test, passes.

### 2. Standing-rules lookup — backend-portable query + failure-vs-empty distinction + concurrency safety

Classification: **Covers user-observable behavior end-to-end.**

Four layers of coverage, each hitting a different observable surface:

- `tests/unit/standing_rules.test.ts` (15 tests) — unit coverage of `getActiveStandingRules` / `getActiveStandingRulesResult`, including the merge-filter fallback path, the `enabled: false` skip, and (added during this release's preparation) a concurrency regression test.
- `tests/unit/db_driver_contract.test.ts` (22 tests) — backend-portability contract test asserting the `entity_snapshots` query shape works identically across drivers (the regression class: a query hint that only one backend understands). This is the test that would have caught the original bug before it shipped.
- `tests/integration/standing_rules_initialize_effect.test.ts` (2 tests) — integration test that drives a real MCP `initialize` request through the server and asserts on the actual response payload shape (`serverInfo._neotoma.standing_rules`, and the failure-path `standing_rules_unavailable` / `standing_rules_note` fields). This is the user-observable surface (what an agent actually receives at session start).

**Gap found and closed during this review:** the merged fix (`78dbcbef`) carried its failure signal on a module-level `let lastLookupFailure` variable — shared, mutable state across concurrent calls. Since `getActiveStandingRules` runs once per MCP `initialize` and MCP sessions for different users run concurrently, this was a real concurrency race: one user's lookup outcome could leak into another's under adversarial interleaving. No existing test exercised concurrent calls (all 14 original tests called the function sequentially, one `await` at a time). This is exactly the kind of gap a helper-level unit test suite that never runs two calls concurrently cannot catch.

Fixed by threading the failure signal through a per-call return value (`lookupActiveStandingRules()` returns `{ rules, lookup_failed, error? }` directly; no shared state). Added `tests/unit/standing_rules.test.ts` › "keeps concurrent lookups for different users independent under adversarial interleaving": uses deferred promises to force a resolution order where a healthy call's continuation is paused across a failing call's completion, and asserts the healthy call's own outcome is unaffected. Verified this test fails against the pre-fix module-state implementation (reproduced by temporarily reverting the source locally) and passes against the fix.

All 39 tests across these four files ran directly: pass.

### 3. Envelope encryption — HKDF key derivation, non-extractable key, empty `encryptedKey`

Classification: **Covers user-observable behavior end-to-end** (for the code's own contract).

`src/crypto/crypto.test.ts` (23 tests) exercises `encryptEnvelope` / `decryptEnvelope` directly, including an assertion that `encryptedKey` is `byteLength === 0` on encrypt — a regression guard against a wrapped-key path being reintroduced silently. Round-trip encrypt→decrypt identity is exercised (existing coverage, unchanged contract). Ran directly: pass.

Reachability note: `encryptResponseMiddleware` is mounted in `src/actions.ts` and populates `req.publicKey` on the fully-verified Ed25519-bearer path (signature-gated, post the GHSA-33x4 fix). This is a narrow, signature-gated surface rather than literally dead code, though no first-party client provisions it today. The fix itself (HKDF salt binding, non-extractable key, XOR-wrap removal) is a strict improvement regardless of current call-site traffic.

### 4. Agent-facing instruction change (`docs/developer/mcp/instructions.md`)

Classification: **No test applicable** (documentation-only surface); correctness verified by direct read of the diff against the new `standing_rules_unavailable` payload shape, cross-checked against the field names `src/server.ts` actually emits (`standing_rules_unavailable`, `standing_rules_note`).

## Gaps identified

**One BLOCKING gap found and closed during this review** (see Surface 2 above: the standing-rules concurrency race). It was not present as a merged defect visible to end users prior to this release preparation catching it — it was introduced in `78dbcbef`, which had not yet shipped in any tagged release, and is fixed in the same commit range that will ship as v0.21.5.

All other surfaces (CSP hardening, envelope HKDF) have tests that exercise the actual user-observable behavior — real HTTP requests through a live Express app and direct crypto-contract assertions — not helper-only unit tests.

## Code review

Ran `/review v0.21.4..HEAD` as an independent subagent pass (not a manual checklist walk). First pass found the same concurrency race in `src/services/standing_rules.ts` described above (BLOCKING), independently corroborating this review's finding, plus flagged the missing `docs/releases/in_progress/v0.21.5/` directory (BLOCKING, now created — this file, `security_review.md`, and `github_release_supplement.md`) and the unfiled GHSA-qp63-9r52-4q25 (ADVISORY, now filed locally at `docs/security/advisories/2026-08-09-rendered-page-stored-xss-csp.md`, GHSA itself still pending operator action per Residual risks in `security_review.md`).

Both BLOCKING findings from that pass are resolved as of this writing:

- Concurrency race: fixed in `src/services/standing_rules.ts` (per-call return value, no shared module state), regression test added and verified.
- Missing release directory: created with this file, `security_review.md`, and `github_release_supplement.md`.

Additional checklist items verified directly:

- **Spec-before-handler**: N/A — no new/changed HTTP endpoint contract (headers-only change on an existing route; no `openapi.yaml` schema field changed).
- **Contract mappings**: N/A — no new `operationId`, MCP tool, or CLI command.
- **Determinism**: preserved. No `Math.random()` / `Date.now()` introduced. HKDF salt is deterministic (the ephemeral public key, itself already part of the envelope), not a new randomness source.
- **Immutability**: not touched — no observation/source mutation in this diff.
- **Auth**: `getAuthenticatedUserId` usage unchanged; the standing-rules query still scopes on `userId` in both old and new code paths.
- **Schema-agnostic design**: N/A — no per-entity-type branching introduced.
- **Security manifest / route registration**: no new Express route; `security:manifest:check` reports 118/118 in sync, zero drift.
- **PII in logs**: the new `logger.error` in `standing_rules.ts` logs `error.message` from the DB driver, not row content or user data.
- **Breaking changes**: none. `npm run openapi:bc-diff` confirms no OpenAPI-level breaking changes.

## Gate status

No unresolved BLOCKING findings. Proceeding to Step 4 (version bump + RC PR).
