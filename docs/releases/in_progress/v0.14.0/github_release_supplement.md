# v0.14.0 Release Supplement

## Summary

v0.14.0 is a security patch and gate-hardening release on top of v0.13.0. Headline:

- **Fixes [GHSA-wrr4-782v-jhwh](https://github.com/markmhendrickson/neotoma/security/advisories/GHSA-wrr4-782v-jhwh)** — tenant isolation gap on `/list_relationships` and `/retrieve_graph_neighborhood`. Authenticated callers with a known cross-user entity ID could read relationship metadata and graph neighborhood data belonging to another user on the same instance. Severity Low under current single-tenant deployment conditions; escalates to Medium for multi-tenant.
- **Adds Gate G3 tenant isolation matrix** — `tests/security/tenant_isolation_matrix.test.ts` companion to the auth topology matrix. Seeds two users and asserts authenticated endpoints scope responses to the requesting user.
- **Extends change guardrails rule MUST 5** — explicit `.eq("user_id", userId)` requirement on user-owned tables and mandatory tenant-isolation matrix coverage for new query endpoints.

## Security hardening

This release fixes one disclosed advisory and closes the regression class that produced it.

### Fixed advisory

- **[GHSA-wrr4-782v-jhwh — Tenant isolation gap in relationship query endpoints](../../security/advisories/2026-05-21-relationship-endpoint-tenant-isolation.md)**
  - Severity: Low (no multi-tenant deployments known)
  - Affected: `>= 0.13.0, < 0.14.0`
  - Fix: every Supabase query in `/list_relationships`, `/retrieve_graph_neighborhood`, and the MCP equivalents now applies `.eq("user_id", userId)` after `getAuthenticatedUserId` resolution. Applied symmetrically to entities, observations, sources, relationship_snapshots, timeline_events, and entity_snapshots query paths in both HTTP (`src/actions.ts`) and MCP (`src/server.ts`) layers.

### New gate

- **Gate G3 tenant isolation matrix** (`tests/security/tenant_isolation_matrix.test.ts`):
  - Seeds two distinct user_ids with disjoint entity/source data
  - Asserts cross-user reads via `/list_relationships`, `/retrieve_graph_neighborhood`, and `/retrieve_related_entities` are blocked
  - Companion to `auth_topology_matrix.test.ts`: where the topology matrix verifies unauthenticated rejection, this matrix verifies authenticated scoping

### Guardrail extension

- `docs/architecture/change_guardrails_rules.mdc` MUST rule 5 (Authorization) now explicitly requires `.eq("user_id", userId)` on all queries against user-owned tables and a row in the tenant-isolation matrix for every new query endpoint.

### Closed tracking issues

- [#365](https://github.com/markmhendrickson/neotoma/issues/365) — `/list_relationships` tenant isolation
- [#366](https://github.com/markmhendrickson/neotoma/issues/366) — `/retrieve_graph_neighborhood` tenant isolation
- [#372](https://github.com/markmhendrickson/neotoma/issues/372) — auth-matrix coverage gap for per-user data scoping

## Breaking changes

No breaking changes. The new `.eq("user_id", userId)` filters are additive: queries that previously returned cross-user rows now return only the calling user's rows, which matches the documented contract of every authenticated endpoint. No request/response schema fields were removed; the optional `user_id` request field is honored only for `LOCAL_DEV_USER_ID` per the existing `getAuthenticatedUserId` rules.

## What changed for npm package users

No CLI or API contract changes. The endpoints affected are unchanged in shape. Callers operating against a single-user deployment will see no difference; callers operating against a multi-user deployment will now correctly receive only their own data.

## Verification

- Type check: passes
- Lint: passes (0 errors)
- New tests: `tests/security/tenant_isolation_matrix.test.ts` passes
- Existing tests: unchanged

## Upgrade notes

- Upgrade to `>= 0.14.0` from any `>= 0.13.0` deployment.
- No data migration required.
- If your deployment had two or more user accounts at any point in `>= 0.13.0`, review access logs for `/list_relationships` and `/retrieve_graph_neighborhood` calls whose resolved user differs from the queried entity's owner.

## Related

- Advisory: `docs/security/advisories/2026-05-21-relationship-endpoint-tenant-isolation.md`
- GHSA: [GHSA-wrr4-782v-jhwh](https://github.com/markmhendrickson/neotoma/security/advisories/GHSA-wrr4-782v-jhwh)
- Security review: `docs/releases/in_progress/v0.14.0/security_review.md`
