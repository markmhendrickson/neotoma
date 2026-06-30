# Security review — v0.18.4

## Scope

This release is security-sensitive (`npm run security:classify-diff -- --base v0.18.3 --head HEAD` → `sensitive=true`) solely because of #1842 (PR #1850), which touches `src/actions.ts`, the route principal resolver. The other four fixes (#1838, #1839, #1840, #1841) are warn/response/CLI/docs changes with no auth surface.

**Change under review (#1842):** extend local-loopback trust so local `POST /issues/submit` and `POST /issues/add_message` (plus their `/api/...` aliases) are accepted without a Bearer token, resolving to the local dev/sandbox user. Implemented via `routeAllowsLocalIssueWriteFallback` (`src/actions.ts:3129`) and a new branch in `resolveRoutePrincipal` (`src/actions.ts:3262`), gated on `isLocalRequest(req)` AND no `Authorization: Bearer` header AND one of the four exact issue-write paths.

**Reviewed against:** `origin/main` @ `f2f4ddc56` (the authoritative merged state).

## Adversarial review prompt

An independent adversarial pass was run with the explicit goal of finding remote reachability or over-broad scoping: (1) can the local fallback be reached remotely by spoofing `X-Forwarded-For` / `Host` / proxy headers? (2) is it scoped to only the two issue-write routes, or can a crafted path slip through? (3) what can the resolved local user do via these routes? (4) does a remote no-Bearer request still get `AUTH_REQUIRED`? (5) any interaction with guest-token handling or `NEOTOMA_TRUST_PROD_LOOPBACK` / `LOCAL_DEV_USER_ID`?

## Findings

- **F1 — Remote spoofing via XFF/Host — NOT EXPLOITABLE.** `isLocalRequest` gates on `req.socket.remoteAddress` (kernel-set TCP peer), not `Host` and not naive XFF (`src/actions.ts:1261`). Any non-loopback XFF entry *disqualifies* locality (`1263–1280`). `trust proxy` feeds `req.ip`, but the locality check reads the socket, not `req.ip`, so `X-Forwarded-For: 127.0.0.1` from a remote peer does not become local. The only non-loopback acceptance is the operator-opt-in `NEOTOMA_TRUSTED_PROXY_IPS` / `NEOTOMA_TRUST_PROD_LOOPBACK` paths, which pre-date this PR and are not widened.
- **F2 — Route scoping — NOT EXPLOITABLE.** `routeAllowsLocalIssueWriteFallback` (`3129–3140`) uses strict `===` against four literal paths + method `POST`. No prefix/substring/regex. Express normalizes `req.path`, so `/issues/submit/../store` resolves to `/store`, which is not in the set.
- **F3 — Local dev user + `user_id` override — LOW (local-only, pre-existing).** The fallback resolves to the nil-UUID local user; `getAuthenticatedUserId` honors a body/query `user_id` when authed as the local dev user, so a local unauthenticated caller can attribute issues to an arbitrary `user_id`. This is **not new** — it already applied to every other local-no-Bearer route — and is bounded to `issue`-typed writes via these two routes, not arbitrary `/store` or admin escalation. Captured as condition C1 below.
- **F4 — Non-local still 401s — NO REGRESSION, TEST CONFIRMED.** A remote no-Bearer request is rejected at the global auth gate before reaching the new branch. The regression test `tests/integration/issues_local_auth_fallback.test.ts` asserts exactly this ("still requires auth for a remote request (untrusted X-Forwarded-For) with no Bearer"). **Verified present in `origin/main` @ `f2f4ddc56` and registered in `docs/testing/automated_test_catalog.md`, so it runs in the `baseline` CI lane.** (The adversarial reviewer initially flagged the test as possibly dropped; that was an artifact of a stale local checkout — confirmed false against origin/main.)
- **F5 — Redundancy on the encryption-on path — LOW (efficacy, not security).** With encryption off, the global gate already stamps the local user for any local no-Bearer request before the handler, making the new branch effectively redundant. With encryption on, a no-credential local request may still be gated earlier. Net: the change never loosens auth beyond the global gate; the open question is whether it fully closes #1842 in every encryption configuration. This is an efficacy/follow-up item, not a vulnerability — the change is safe in all configurations. Tracked as a residual risk below.
- **F6 — Guest/AAuth ordering — NOT EXPLOITABLE.** Guest branches run before the new user fallback (`3233–3248`); a legitimate guest token never silently downgrades to the unauthenticated local user.

## Suggested negative tests

The shipped regression test already covers the critical negative case (remote no-Bearer → 401). Additional hardening tests worth adding later: a path-traversal probe against the route allow-list, and an explicit assertion that a non-loopback `X-Forwarded-For` disqualifies locality on these two routes.

## Residual risks

- **F3/C1:** on a non-`local` storage backend exposed over loopback, a local unauthenticated caller can attribute issues to an arbitrary `user_id`. Mitigation: bind loopback-only deployments to `127.0.0.1` and require auth for any externally reachable deployment. Pre-existing behavior, not introduced here.
- **F5:** efficacy of the fix on the encryption-on path is unverified end-to-end; follow-up to confirm #1842 is fully resolved for that configuration. No security exposure either way.

## Sign-off

**Verdict: YES — ship.** No remote-reachability hole, no over-broad route scoping, no auth regression (confirmed by a test that is present and in CI). Conditions: **C1** — document the local arbitrary-`user_id` attribution caveat (done in the supplement's Security hardening section, reverse-proxy/loopback guidance). **C2** — confirm the remote-401 regression test is in the live CI lane: **satisfied** (present in `origin/main` @ `f2f4ddc56`, in the test catalog, runs in `baseline`). F5 logged as a non-blocking efficacy follow-up.

## Diff appendix

Security-relevant change is confined to `src/actions.ts` (`routeAllowsLocalIssueWriteFallback` + the `resolveRoutePrincipal` branch). `security:lint` (incl. the `local-dev-user-widening` rule) reported 0 errors; `security:manifest:check` (protected-routes manifest) in sync; `test:security:auth-matrix` passed (18 / 1 skipped). G1 (`security:classify-diff`) correctly flagged the file as auth-adjacent, triggering this review.
