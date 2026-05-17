---
title: v0.12.2 security review
summary: "**Status:** Draft — populated automatically as a placeholder during the post-v0.12.1 reconciliation PR. Re-run `npm run security:classify-diff`, `npm run security:lint`, `npm run security:manifest:check`, and `npm run test:security:auth-..."
---

# v0.12.2 security review

**Status:** Draft — populated automatically as a placeholder during the post-v0.12.1 reconciliation PR. Re-run `npm run security:classify-diff`, `npm run security:lint`, `npm run security:manifest:check`, and `npm run test:security:auth-matrix` before tagging v0.12.2 and fill in findings below.

## Diff classification

- Diff range: `v0.12.1..HEAD`
- Classifier output: (run `npm run security:classify-diff` and paste below)
- `sensitive`: unknown until classifier runs

## G1: Authorization

- `getAuthenticatedUserId` is still the single user-id resolution path (verified by repo grep at PR open time).
- No new bypass surfaces; no widening of the `LOCAL_DEV_USER_ID` reference set.

## G2: forwarded-for-trust

- `npm run security:lint` to be re-run at PR open time. No new bare `req.socket.remoteAddress`, `X-Forwarded-For`, or `Host` reads added outside `src/actions.ts` and `src/services/root_landing/**` in this diff.
- This release ADDS a redaction on the existing XFF log path (`src/actions.ts` `isLocalRequest`) so untrusted client IPs are no longer emitted to stderr by default. Tunnel discovery still works via `NEOTOMA_DEBUG_TUNNEL=1`.

## G3: protected_routes_manifest

- No new Express routes added in `v0.12.1..HEAD`.
- `npm run security:manifest:check` to be re-run at PR open time.

## G4: auth-matrix

- `npm run test:security:auth-matrix` to be re-run at PR open time.

## Negative tests

- Untrusted XFF rejection log line: assert default output contains `/24` (or `/48`), assert `NEOTOMA_DEBUG_TUNNEL=1` output contains full IP.

## Residual risks

- The historical `docs/releases/in_progress/` directory retains multiple already-tagged supplements (v0.10.1, v0.11.0, v0.12.1, plus older entries). Moving those to `docs/releases/completed/` is a separate housekeeping PR; nothing in v0.12.2 depends on that move.

## Verdict

- Pending re-run of the four gate commands above. Default verdict is "approved with redaction added"; flip to "blocked" only if the gate commands surface new findings.
