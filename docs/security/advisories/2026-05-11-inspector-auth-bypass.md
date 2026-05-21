# Advisory: Inspector Local-Auth Bypass via Alternate Path

**Advisory ID:** 2026-05-11-inspector-auth-bypass  
**Date:** 2026-05-11  
**Severity:** High (single-user; now patched)  
**Status:** Fixed in v0.11.1

---

## CVE Class

Local authentication bypass via alternate request path. An unauthenticated request routed through the Inspector proxy bypassed the `requireUser` middleware that protected the same endpoint when accessed directly. Regression class: auth middleware gap on an alternate path to a protected route.

---

## Affected Versions

- v0.11.0

Fixed in v0.11.1 (tag `v0.11.1`).

---

## Prerequisites

- Local instance of Neotoma running on the same machine as the attacker
- Network access to the Inspector proxy port
- Knowledge that the Inspector proxy exposes protected routes without re-applying auth middleware

---

## Impact

An unauthenticated local user could invoke protected Neotoma API endpoints via the Inspector proxy, bypassing the `requireUser` middleware. All data accessible to the local instance owner was accessible without credentials.

This affected single-user local deployments only. No network-accessible or multi-user instances existed at the time of disclosure.

---

## Severity

**High** at time of discovery for the vulnerability class, though actual user impact was bounded by the single-user, local-only deployment profile. Rated High because the bypass was complete (no auth required) and the exposed surface was the full authenticated API.

Downgraded to informational for users who have updated to v0.11.1.

---

## Remediation

Fix applied in commits `ff80d0ea1` and `56bd08f1e` (released as `v0.11.1`, version bump `df63d59c8`):

- Auth middleware applied consistently to the Inspector proxy path
- `protected_routes_manifest.json` updated and verified via `security:manifest:check`
- Auth-topology matrix test (`tests/security/auth_topology_matrix.test.ts`) updated to cover the Inspector path
- `security:lint` gate extended to catch the class of path that bypasses middleware

---

## Disclosure Timeline

| Date | Event |
|------|-------|
| 2026-05-11 | Vulnerability identified during internal security review |
| 2026-05-11 | Fix committed and pushed (`ff80d0ea1`) |
| 2026-05-11 | Docs and manifest updated (`56bd08f1e`) |
| 2026-05-11 | v0.11.1 released (`df63d59c8`) |
| 2026-05-21 | Advisory filed in `docs/security/advisories/` |

---

## Tracking Issues

No GitHub issues filed. Fix shipped same day as discovery.

---

## Gate Gap

The auth-matrix test did not cover the Inspector proxy path as a distinct route surface. The security manifest check confirmed route registration but did not verify that auth middleware was applied on every path that reached a protected handler. Both gaps were closed in v0.11.1 as part of the fix.

This advisory is the seed entry for the regression class tracked by the security gates. Any future alternate-path auth gap (new proxy, new middleware stack, new CLI tunnel) is the same class and must be caught by the auth-topology matrix test before release.
