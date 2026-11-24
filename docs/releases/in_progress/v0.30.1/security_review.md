# Security review — v0.30.1

Completed for `/release` Step 3.5 (Security review lane). Provider: `none` (manual).

## Scope

- Base ref: `v0.30.0`, head ref: `HEAD` (origin/main at 4ad395e0d)
- Changed files: 1, `tests/security/guest_token_entity_binding.test.ts` (test only, +57 lines)
- Diff classifier (G1): `sensitive=false`, no concerns
- `security:lint` (G2): 0 errors, 139 warnings, all pre-existing `local-dev-user-widening` style warnings outside this diff
- `security:manifest:check` (G3): in sync with `openapi.yaml` (130 routes)
- `test:security:auth-matrix` and `guest_token_entity_binding` (G3): 145 passed, 1 skipped

## Findings

- Alternate-path auth, proxy trust, local-dev widening, unauth public route, guest-access policy widening, AAuth downgrade: no runtime code changed, so no new surface exists in any of these categories. No new routes.
- The added test sets `x-forwarded-for: 203.0.113.9` on its requests to exercise the non-local path; it does not read forwarding headers itself.

## Suggested negative tests

- The diff is itself the negative test: out-of-grant guest tokens are refused on `/subscribe`, `/unsubscribe`, `/get_subscription_status` and `/events/stream` under all five policies.

## Residual risks

- None introduced. The matrix covers the routes listed; any new subscription route needs a row.

## Sign-off

| Reviewer | Verdict | Date |
|----------|---------|------|
| Phoenicurus (release-preparation agent) | yes | 2026-11-24 |
