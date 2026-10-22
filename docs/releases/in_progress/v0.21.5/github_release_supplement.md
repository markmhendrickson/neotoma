## Summary

This release closes a stored-XSS vector in rendered pages served without a page-scoped Content Security Policy, fixes standing rules being silently dropped on every libSQL deployment (and a concurrency race found in that same fix during release preparation), and removes a redundant key-wrap step from the response-encryption envelope.

## What changed for npm package users

No CLI or package-artifact changes in this release.

## API surface & contracts

**MCP `initialize` response gains two optional fields under `serverInfo._neotoma`:** `standing_rules_unavailable` (boolean) and `standing_rules_note` (string). Both appear **only** when the standing-rules lookup fails; on success the payload is unchanged. This is a strictly additive contract change — no existing field is renamed, removed, or retyped.

No REST/OpenAPI surface touched. `npm run openapi:bc-diff` against `v0.21.4`: no breaking changes detected.

## Behavior changes

Standing rules now load correctly on libSQL-backed instances (self-hosted default). Previously, every libSQL deployment silently received zero standing rules regardless of how many were stored, while `store` and retrieval both reported success — the query failed with `unrecognized token: "!"` and the failure was caught and converted to an empty array.

When a standing-rules lookup fails (of any kind, on any backend), the MCP `initialize` response now flags it explicitly instead of returning an indistinguishable empty list, and `docs/developer/mcp/instructions.md` tells agents to treat an unflagged empty list as "no rules configured" but a flagged one as "policy unknown — do not proceed as if unrestricted."

Pages served from `GET /entities/:id/html` (rendered pages, including those viewed unauthenticated via a guest access token) now carry a strict, route-scoped Content Security Policy (`script-src 'none'`, `default-src 'none'`, `sandbox allow-same-origin`, plus `X-Content-Type-Options: nosniff`). This blocks all script execution on rendered-page views regardless of the page's stored content. No visible change for legitimate pages — only inline `<style>` and same-origin images/fonts were ever needed on this route, and both remain allowed.

## Docs site & CI / tooling

- `docs/developer/mcp/instructions.md` — `[STANDING RULES]` section updated with the `standing_rules_unavailable` / `standing_rules_note` contract and an explicit FORBIDDEN clause against reporting "no rules configured" when the lookup failed.
- `docs/testing/automated_test_catalog.md` regenerated.

## Internal changes

`getActiveStandingRules()` no longer joins through `entities` with the PostgREST `entity_snapshots!inner(snapshot)` hint. It reads `entity_id`, `canonical_name`, and `snapshot` directly off `entity_snapshots`, which already carries everything needed. Since `entity_snapshots` carries no merge pointer, merged-away rules are excluded via a second bounded lookup against `entities`; if that lookup itself fails, the function warns and falls back to returning the rules unfiltered, on the reasoning that a stale merged rule reaching an agent is a lesser harm than losing all rules.

The failure signal is carried by a private `lookupActiveStandingRules()` helper that returns `{ rules, lookup_failed, error }` as a single per-call value; both the exported array-returning `getActiveStandingRules()` and the richer `getActiveStandingRulesResult()` derive from that one call. An earlier version of this fix (as merged) carried the failure signal on a module-level variable instead — that version was replaced during release preparation after a concurrency race was found in it (see Fixes below).

`src/crypto/envelope.ts`: the response-encryption envelope no longer transmits a wrapped AES-GCM content key. Both parties already derive the identical key from the X25519 ECDH shared secret via HKDF, so the prior XOR-based key-wrap step (introduced as a stopgap, per its own comment: "simple XOR for now") was redundant attack surface. The HKDF salt is now bound to the per-envelope ephemeral public key (previously an empty salt), and the derived key is marked non-extractable. `encryptedKey` remains on the wire as an empty `Uint8Array` for shape compatibility only.

## Fixes

- **Standing rules silently empty on libSQL** (#2131): `getActiveStandingRules()` used a Supabase-only PostgREST embedded-resource hint that libSQL forwards into SQL and rejects (`unrecognized token: "!"`). Because the function swallows all errors to avoid blocking session init, this failure was invisible — session `initialize` reported `standing_rules: []`, identical to the "no rules configured" case, on every libSQL instance regardless of how many rules were stored.
- **Stored XSS in rendered pages** (GHSA-qp63-9r52-4q25): `html_body` on a `rendered_page` entity is author-supplied and was served verbatim under the global CSP, which allows `'unsafe-inline'` scripts. A script injected into `html_body` would execute in the server's origin when the page was viewed, including via an unauthenticated guest access-token link. `GET /entities/:id/html` now serves a strict per-route CSP that blocks all script execution regardless of `html_body` contents.
- **Redundant key-wrap in response-encryption envelope** (no advisory — narrow, signature-gated call path today, hardening regardless): removed the unauthenticated XOR wrapped-key path from `src/crypto/envelope.ts`; see Internal changes above.
- **Concurrency race in the standing-rules failure signal** (found and fixed during this release's preparation, before this release shipped): the merged `#2131` fix carried its "did the lookup fail" signal on a module-level mutable flag written and read across `await` boundaries. Under the MCP server's normal concurrent-session operation, two overlapping `initialize` calls for different users could interleave such that one caller's lookup outcome was misreported to a different caller. Fixed by threading the failure signal through a per-call return value instead of shared module state.

## Tests and validation

- Integration test `tests/integration/standing_rules_initialize_effect.test.ts` (2 cases): seeds a real `standing_rule` entity, drives the real MCP `initialize` handler through `NeotomaServer`, and asserts the rule's `entity_id`/`title`/`rule_text` arrive verbatim on `serverInfo._neotoma.standing_rules`, and that the failure-only diagnostic fields are absent on success.
- `tests/unit/db_driver_contract.test.ts` (22 tests, both `sqlite` and `libsql` backends): asserts the new query shape executes against a real database and that the old `entity_snapshots!inner(snapshot)` hint throws — a dialect-portability guard.
- `tests/unit/standing_rules.test.ts` (15 cases): failure/empty/recovery paths, the outer-catch thrown-exception path, and a new adversarially-interleaved concurrency test added during this release's preparation — uses deferred-promise gates to force the exact interleaving that exposed the concurrency race; confirmed to fail against the pre-fix module-state implementation and pass against the fix.
- `tests/security/rendered_page_csp.test.ts`: stores a real `rendered_page` entity with a script payload in `html_body`, requests `/entities/{id}/html` over a live-listening Express app, and asserts the exact `Content-Security-Policy` and `X-Content-Type-Options` header values plus that the page body is still served (mitigation is header-based, not content-stripping).
- `src/crypto/crypto.test.ts` (23 tests): asserts `encryptEnvelope(...).encryptedKey.byteLength === 0` against the real production function.
- `npm run openapi:bc-diff` against `v0.21.4`: no breaking changes.
- `npm run security:classify-diff`: `sensitive=true` (file-identity match on `src/actions.ts` for the CSP-hardening change; the touched code is response-header logic, not auth-middleware logic — full analysis in `security_review.md`). `security:lint`: 0 errors (125 pre-existing baseline warnings, none new). `security:manifest:check`: in sync (118 routes, no drift). `test:security:auth-matrix`: 18 passed, 1 skipped.
- 100/100 tests passing across all touched test files (`tests/unit/standing_rules.test.ts`, `tests/unit/db_driver_contract.test.ts`, `tests/integration/standing_rules_initialize_effect.test.ts`, `tests/security/rendered_page_csp.test.ts`, `src/crypto/crypto.test.ts`).
- `/review v0.21.4..HEAD`: independent subagent pass found 1 BLOCKING finding (the concurrency race described above), fixed in the same preparation pass with a verified regression test. Full record in [`docs/releases/in_progress/v0.21.5/test_coverage_review.md`](./test_coverage_review.md).

## Security hardening

Classified `sensitive=true` by `npm run security:classify-diff` (file-identity match on `src/actions.ts`). Full adversarial review, including the stored-XSS fix analysis, the envelope key-wrap removal, and the concurrency-race finding and fix, in [`docs/releases/in_progress/v0.21.5/security_review.md`](./security_review.md). Sign-off: **with-caveats** (see below).

**Advisory:** [GHSA-qp63-9r52-4q25](../../../security/advisories/2026-08-09-rendered-page-stored-xss-csp.md) covers the stored-XSS fix. The local advisory doc is filed; the GitHub Security Advisory itself has not yet been created — filing/publishing it requires repository security-advisory admin scope that the release-preparation automation account does not hold. This is tracked as a required operator follow-up (Step 5.2 of the release process, after this tag is live) and is not a blocker to shipping the code fix.

Operator action: upgrade to v0.21.5. No token rotation or manual migration required.

## Breaking changes

No breaking changes.
