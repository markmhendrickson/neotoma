# Security review — v0.14.0

Manual security review for v0.14.0 (security patch release on top of v0.13.0). This file is the gate artifact for `/release` Step 3.5 (Security review lane); the supplement's `Security hardening` section links it.

## Scope

- Base ref: `v0.13.0`
- Head ref: `release/v0.14.0` (pending tag)
- Diff classifier: **sensitive** (touches auth-middleware and database query construction)
- Provider: manual (focused security patch, narrow scope, no LLM review needed for this small diff)
- Protected routes manifest: in sync (no new routes added).
- `security:lint`: 0 errors.
- `test:security:auth-matrix`: 16/16 passed.
- `test:security:tenant-isolation-matrix`: new in this release, 8/8 passed (list_relationships ×2, retrieve_graph_neighborhood ×4, retrieve_related_entities ×2).
- Changed files: 7
  - `src/actions.ts` (handler scoping fixes)
  - `src/server.ts` (MCP handler scoping fixes)
  - `src/shared/action_schemas.ts` (no functional change — `user_id` already optional on both schemas at v0.13.0)
  - `docs/security/advisories/2026-05-21-relationship-endpoint-tenant-isolation.md` (new)
  - `docs/security/advisories/README.md` (new row)
  - `docs/architecture/change_guardrails_rules.mdc` (MUST 5 extension)
  - `.claude/rules/change_guardrails_rules.md` (mirrored)
  - `tests/security/tenant_isolation_matrix.test.ts` (new gate)

### Concerns flagged by `classify_diff.js`

- **auth-middleware** — `src/actions.ts` and `src/server.ts` query construction in `/list_relationships` and `/retrieve_graph_neighborhood`.

## Adversarial review prompt

Treat the diff as if you were an attacker. For every concern below, propose at least one _concrete_ request or code path that exercises the failure mode, then either confirm the gate would catch it or describe the missing test.

1. **Alternate-path auth.** Not applicable — this diff does not add or modify route registration. All affected endpoints were already in the protected routes manifest with auth-required status; the gap was in query scoping after authentication, not in auth itself.

2. **Proxy trust.** Not applicable — no `X-Forwarded-For`, `Host`, or `req.socket.remoteAddress` reads added. `getAuthenticatedUserId` resolution unchanged.

3. **Local-dev widening.** No change to `LOCAL_DEV_USER_ID`, `assertExplicitlyTrusted`, `NEOTOMA_TRUST_PROD_LOOPBACK`, or sandbox surface. The `user_id` request field is honored only for `LOCAL_DEV_USER_ID` per the existing `getAuthenticatedUserId` rules.

4. **Unauth public route.** No new Express routes. No manifest delta.

5. **Guest-access policy widening.** No change to `assertGuestWriteAllowed`, `routeAcceptsGuestPrincipal`, or guest-token issuance. Guest writes were never reachable through `/list_relationships` or `/retrieve_graph_neighborhood`.

6. **AAuth / agent identity downgrade.** No change to AAuth admission or agent identity verification.

7. **Cross-tenant data access (NEW category added per #372).** This release fixes the regression class. For every query against a user-owned table (entities, observations, sources, relationship_snapshots, timeline_events, entity_snapshots), is `.eq("user_id", userId)` applied where `userId` comes from `getAuthenticatedUserId`?
   - Confirmed in `src/actions.ts`:
     - `/list_relationships`: `userId` resolved, filter applied to `relationship_snapshots` query
     - `/retrieve_graph_neighborhood` (entity branch): filter applied to entities, entity relationship_snapshots (count + range), related entities, observations, sources
     - `/retrieve_graph_neighborhood` (source branch): filter applied to source, timeline_events, observations
   - Confirmed in `src/server.ts`:
     - `listRelationships`: `userId` resolved, filter applied to inbound and outbound queries
     - `retrieveGraphNeighborhood`: filter applied across all 9 query call sites (entity, snapshot, relationships, related entities, observations, sources, timeline_events, source, second-hop relationships)
   - Gate that catches future regressions of this class: `tests/security/tenant_isolation_matrix.test.ts` seeds two users and asserts cross-user reads return empty.

## Findings

- **auth-middleware / `src/actions.ts`**: `/list_relationships` and `/retrieve_graph_neighborhood` now call `getAuthenticatedUserId(req, parsed.data.user_id)` and apply `.eq("user_id", userId)` to every Supabase query. The `.or()` clause for source/target entity matching is retained; the `user_id` filter is `AND`-ed with it. No changes to the auth middleware itself — the fix is entirely in handler-layer query construction.

- **mcp-handlers / `src/server.ts`**: `listRelationships` and `retrieveGraphNeighborhood` now call `this.getAuthenticatedUserId(parsed.user_id)` and apply the same filter. MCP-side handlers go through the existing `this.authenticatedUserId` resolution; no new auth path introduced.

- **schemas / `src/shared/action_schemas.ts`**: `ListRelationshipsRequestSchema` and `RetrieveGraphNeighborhoodSchema` both already declared `user_id: z.string().optional()` at v0.13.0. No schema changes in this release.

- **new gate / `tests/security/tenant_isolation_matrix.test.ts`**: Companion to `auth_topology_matrix.test.ts`. The topology matrix verifies unauthenticated rejection; the tenant isolation matrix verifies authenticated scoping. New query endpoints touching user-owned tables MUST add a row per change guardrails MUST 5.

- **change guardrails / `docs/architecture/change_guardrails_rules.mdc`**: MUST 5 (Authorization) extended to explicitly require `.eq("user_id", userId)` on user-owned tables and matrix coverage for new query endpoints. Mirrored to `.claude/rules/change_guardrails_rules.md`.

## Adversarial walk-through

### Cross-tenant data access (the v0.14.0 fix)

**Attack scenario:** User Alice has an account on a multi-tenant Neotoma instance. She knows the entity ID of an entity owned by user Bob (e.g. via an out-of-band channel, log leakage, or a guessable identifier).

**Pre-fix (v0.13.0) request:**

```bash
curl -X POST https://example.tld/list_relationships \
  -H "Authorization: Bearer $ALICE_BEARER" \
  -d '{"entity_id":"<bob_entity_id>"}'
```

Returned bob's relationships even though alice is the authenticated caller.

**Post-fix (v0.14.0):** Same request returns `{"relationships": [], "total": 0, ...}` because the query is now `WHERE source_entity_id = ? AND user_id = $ALICE_USER_ID`.

**Gate that catches a regression of this class:**

- `tests/security/tenant_isolation_matrix.test.ts > /list_relationships > "user A querying user B's entity_id returns empty (scoped to user A)"`
- `tests/security/tenant_isolation_matrix.test.ts > /retrieve_graph_neighborhood > "user A querying user B's node_id does NOT return user B's entity"`
- `tests/security/tenant_isolation_matrix.test.ts > /retrieve_graph_neighborhood > "user A querying user B's source does NOT return user B's source"`

### Single-user deployment impact

All known v0.13.0 deployments are single-user. The gap had no real-world impact in those deployments: the only valid authenticated identity was the data owner. The fix is forward-looking and protects multi-tenant deployments that may exist in the future.

## Verdict

**Approve for release.**

- Fix is correct and minimal
- New gate prevents regressions of the same class
- Change guardrails rule extension forces future query endpoints to follow the same pattern
- No new attack surface introduced
- No behavior change for single-user deployments
