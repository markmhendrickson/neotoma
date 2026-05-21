# Advisory: Tenant Isolation Gap in Relationship Query Endpoints

**Advisory ID:** 2026-05-21-relationship-endpoint-tenant-isolation  
**Date:** 2026-05-21  
**Severity:** Low (no multi-tenant deployments; see escalation condition below)  
**Status:** Open — fix tracked in #365, #366

---

## CVE Class

Tenant isolation bypass on read endpoints. Two query endpoints apply authentication (confirming a valid session) but do not scope database queries to the authenticated user's data. Any authenticated user can read data belonging to other users on the same instance. Regression class: missing per-user filter on a protected route handler (same class as v0.11.1, different layer).

---

## Affected Versions

- v0.13.0

Fix not yet released. Remediation tracked in #365 and #366.

---

## Prerequisites

1. A valid authentication token for the Neotoma instance (i.e., the attacker must hold a legitimate account on the instance)
2. A known or guessable entity ID belonging to another user (~96 bits of entropy for hash-based IDs; brute-force is not practical)

An unauthenticated caller cannot exploit this vulnerability. A caller authenticated as the target user's account cannot benefit (they already own the data). The gap is meaningful only when two or more distinct user accounts share one Neotoma instance.

---

## Impact

The affected endpoints return entity relationship metadata and graph neighborhood data without filtering to the requesting user's records. A caller with a valid session and a known entity ID belonging to a different user can retrieve:

- Relationship edges (type, weight, linked entity IDs)
- Graph neighborhood data reachable from the known entity

Impact is bounded by:
- Requiring a valid authentication credential
- Requiring knowledge of the target entity ID (high-entropy, not enumerable via these endpoints)
- No write capability exposed by this gap

---

## Severity

**Low** under current deployment conditions.

No multi-tenant deployments of Neotoma are known to exist. All current instances are single-user. The vulnerability has no practical impact when only one user account exists on an instance.

**Escalation condition:** Severity escalates to **Medium** the moment any instance is configured with two or more distinct user accounts. The fix (#365, #366) must be applied before any multi-tenant deployment.

---

## Remediation

Tracked in:
- **#365** — Add per-user scoping to `/list_relationships`
- **#366** — Add per-user scoping to `/retrieve_graph_neighborhood`

Fix approach (per #365 and #366):
- Call `getAuthenticatedUserId` in both handlers (the canonical user-ID resolution path per `docs/subsystems/auth.md`)
- Add `.eq("user_id", userId)` to all database queries in each handler
- Validate entity ID inputs using `isNeotomaEntityId` before querying
- Replace any `.or()` string interpolation with separate scoped `.eq()` calls
- Extend `tests/security/auth_topology_matrix.test.ts` to cover cross-user read access on these endpoints

---

## Disclosure Timeline

| Date | Event |
|------|-------|
| 2026-05-21 | Vulnerability identified during internal security review |
| 2026-05-21 | GitHub issues #365 and #366 filed (sanitized; no attack vector details) |
| 2026-05-21 | Advisory filed in `docs/security/advisories/` |
| 2026-05-21 | GHSA-wrr4-782v-jhwh created (draft, private) |
| TBD | Fix released in a future patch version |

---

## Tracking Issues

- **#365** — Fix `/list_relationships` tenant isolation
- **#366** — Fix `/retrieve_graph_neighborhood` tenant isolation
- **GHSA-wrr4-782v-jhwh** — GitHub Security Advisory (draft; full technical details)

---

## Gate Gap

The security gates that ran for v0.13.0 did not catch this class of vulnerability:

- **Auth-matrix test**: Validates that routes require authentication; does not validate that authenticated queries are scoped to the requesting user.
- **Manifest check**: Confirms route registration and auth-middleware presence; does not inspect query-level user filtering.
- **`security:lint`**: Checks forwarded-for trust and local-dev shortcuts; does not analyze database query filter clauses.
- **Manual checklist**: The pre-release adversarial walk-through did not include a cross-user data access category.

Gate gap is tracked in **#372** — Extend security checklist and auth-matrix tests to cover per-user query scoping.
