# Tenant isolation gap in relationship query endpoints (v0.14.0 fix)

- **Date disclosed:** 2026-05-21
- **GHSA:** [GHSA-wrr4-782v-jhwh](https://github.com/markmhendrickson/neotoma/security/advisories/GHSA-wrr4-782v-jhwh)
- **CVE:** _requested_
- **Severity:** Low — authenticated cross-user data disclosure on two read endpoints. No known multi-tenant deployments exist; severity escalates to Medium the moment any instance is configured with two or more distinct user accounts.
- **Affected:** `>= 0.13.0, < 0.14.0` (the gap exists in earlier versions but `/retrieve_graph_neighborhood` was first introduced in a form that exposed it at v0.13.0). Single-user deployments were not effectively at risk.
- **Fixed in:** `0.14.0`
- **Reporter:** internal security review.
- **CWEs:** [CWE-639](https://cwe.mitre.org/data/definitions/639.html) (Authorization Bypass Through User-Controlled Key), [CWE-863](https://cwe.mitre.org/data/definitions/863.html) (Incorrect Authorization).

## Summary

Two query endpoints — `/list_relationships` and `/retrieve_graph_neighborhood` — accepted an authenticated request but did not constrain database queries to the authenticated user's records. An authenticated caller with a known entity ID, source ID, or relationship key belonging to another user could retrieve that user's relationship metadata and (via `/retrieve_graph_neighborhood`) the full graph neighborhood reachable from that node.

The regression class is the same as the v0.11.1 Inspector advisory at the system level (authentication succeeded but authorization scope was missing), but landed in a different layer: the auth middleware correctly resolved the user, the handlers correctly called `getAuthenticatedUserId` in spec — but the resolved `userId` was not propagated into the Supabase query filter, so every row matching the supplied `entity_id` / `node_id` was returned regardless of owner.

## Impact

For affected deployments with two or more user accounts:

- `/list_relationships` returned relationship edges (type, weight, linked entity IDs) for any `entity_id` the caller knew, regardless of which user owned the entity
- `/retrieve_graph_neighborhood` returned the full graph neighborhood reachable from any `node_id` the caller knew, including:
  - The target entity record
  - Relationship edges (one and two hops via `node_type=source`)
  - Related entity records
  - Observations and sources, if `include_observations` / `include_sources` were set

No write capability was exposed by this gap. The MCP-side handlers (`server.ts` `listRelationships` and `retrieveGraphNeighborhood`) had the same shape and the same gap as the HTTP-side handlers (`actions.ts`).

Single-user deployments (the only kind known to exist at the time of disclosure) had no real-world impact: the only valid authenticated identity was the data owner.

## Reproduction (sanitized)

Against an affected deployment with two user accounts (`alice`, `bob`) holding disjoint data:

```bash
# alice authenticates
curl -X POST https://example.tld/list_relationships \
  -H "Authorization: Bearer $ALICE_BEARER" \
  -d '{"entity_id":"<bob_entity_id>"}'
```

Returned the relationships connected to `bob_entity_id` even though they belonged to bob, not alice.

## Root cause

The handlers' query construction in `src/actions.ts` and `src/server.ts` did not append `.eq("user_id", userId)` to the `relationship_snapshots`, `entities`, `observations`, `sources`, `entity_snapshots`, or `timeline_events` queries. The `getAuthenticatedUserId` resolution was either absent (in the HTTP handlers) or present but not propagated (in the MCP handlers).

This is the second incarnation of "authentication is not authorization" in the codebase. The G3 auth-topology matrix correctly verifies that protected routes reject unauthenticated callers, but it did not have a row for cross-user data scoping — so the gap shipped past the gates.

## Fix

In all four handlers (`/list_relationships` HTTP, `/retrieve_graph_neighborhood` HTTP, MCP `listRelationships`, MCP `retrieveGraphNeighborhood`):

1. Resolve `userId` via `getAuthenticatedUserId(req, parsed.user_id)` (HTTP) or `this.getAuthenticatedUserId(parsed.user_id)` (MCP)
2. Apply `.eq("user_id", userId)` to every query that touches `entities`, `relationship_snapshots`, `entity_snapshots`, `observations`, `sources`, or `timeline_events`
3. The `.or()` clause for source/target entity matching is retained; the `user_id` filter is `AND`-ed with it

Regression tests in `tests/security/tenant_isolation_matrix.test.ts` seed two users and assert that user A cannot retrieve user B's data through these endpoints (`/list_relationships` and `/retrieve_graph_neighborhood`).

## Operator action

- Upgrade to `>= 0.14.0`.
- No data migration required.
- If the deployment had two or more user accounts at any point in `>= 0.13.0`, review access logs for `/list_relationships` and `/retrieve_graph_neighborhood` calls whose resolved user differs from the queried entity's owner.

## Detection

The `tenant_isolation_matrix.test.ts` suite added in v0.14.0 detects regressions of this class going forward. New query endpoints touching user-owned tables MUST add a row to the matrix per the change guardrails rule (see `docs/architecture/change_guardrails_rules.mdc` § MUST 5).

## Gates that catch this regression class going forward

- **G3 tenant isolation matrix** (`tests/security/tenant_isolation_matrix.test.ts`) — new in v0.14.0. Seeds two users and asserts cross-user reads are blocked on every authenticated query endpoint.
- **Change guardrails rule MUST 5** — requires `.eq("user_id", userId)` on user-owned tables and a matrix row for new query endpoints.
- **Pre-release adversarial checklist** — gains a "cross-tenant data access" category that must be walked through for every release containing new or modified read endpoints.

## Timeline

| Date | Event |
|------|-------|
| 2026-05-21 | Vulnerability identified during internal security review |
| 2026-05-21 | GHSA-wrr4-782v-jhwh created (draft) |
| 2026-05-21 | Internal advisory + practices.md filed in `docs/security/` |
| 2026-05-21 | Issues #365, #366, #372 filed (sanitized; no attack vector details) |
| 2026-05-21 | Fix PRs #376, #377, #378 merged to `dev` |
| TBD | v0.14.0 released with fix |
| TBD | GHSA published |
