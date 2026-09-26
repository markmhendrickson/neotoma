This release closes a cluster of tenant-isolation and identity gaps across schema resolution, provenance reads, and shared-graph sign-in, adds a runtime relationship-type registry so the edge vocabulary is no longer a fixed enum, and ships a new MCP 2026-07-28 stateless transport alongside the existing session-based one.

## Highlights

- **Register new relationship types without a code change.** `register_relationship_type` (CLI: `neotoma relationship-types register`) and `list_relationship_types` make the edge vocabulary a runtime registry instead of a fixed enum — a consumer that needs an edge type the substrate doesn't already know no longer has to bend an existing type or simulate the edge as a field.
- **Schema reads now agree with schema writes, everywhere.** `list_entity_types`, `describe_entity_type`, and `GET /schemas` resolve the same global-vs-user-scoped schema the write path already preferred, closing both a version-disagreement bug and a cross-user schema-name disclosure.
- **A shared graph no longer tells you that you own it.** `GET /me` now reports `authenticated_user_id` (who you are) alongside `shared_graph` (whose graph you're on) instead of collapsing them, so the Inspector and CLI stop telling a signed-in teammate they are the graph's owner.
- **Relationship endpoints and provenance reads are ownership-checked.** `create_relationship` (and the relationship leg of `store`) now requires both endpoints to be entities you own; provenance and observation reads (`get_field_provenance`, `get_entity_snapshot`, `list_observations`) are scoped to the authenticated user.
- **MCP serves the 2026-07-28 stateless spec alongside existing sessions.** `POST /mcp` now dual-routes: session-less requests that declare a 2026-07-28 protocol version in `_meta` are served statelessly (per-request auth, no session state); `initialize`/`Mcp-Session-Id` clients are unaffected.

## What changed for npm package users

**CLI (`neotoma`)**

- New `neotoma relationship-types` command family: `list`, `register`, plus `--relationship-types <types>` filtering on relationship-read commands. See `docs/developer/cli_reference.md`.
- `neotoma relationships create` (and the underlying `create_relationship`/`create_relationships` calls) now require both `--source-entity-id` and `--target-entity-id` to be entities you own; an endpoint that doesn't exist and one owned by another user are refused identically, so the refusal reveals nothing about other users' data.
- `neotoma schemas update` (`update_schema_incremental`) reports `ERR_SCHEMA_SCOPE_MISMATCH` naming `guard_scope` and `found_scope` when an active schema exists in a different scope than the call checked; retry with `--user-specific` matching `found_scope` rather than running `neotoma schemas register`.
- `neotoma auth login`'s already-signed-in output now distinguishes "signed in as" (email, the verified identity) from the shared-graph id when the two differ, in both text and JSON modes.

**Runtime / data layer**

- One shared `isProductionEnvironment()` (`src/shared/environment.ts`) now backs the local-caller check, the root-landing page, and webhook-URL allowlisting. Production is `true` when either `NEOTOMA_ENV` or `NODE_ENV` says so, and an unrecognized `NEOTOMA_ENV` value is treated as production (with a rate-limited warning naming the value) rather than silently falling through. See `docs/operations/configuration.md` "Environments" for the operator-facing migration note — running a production-built bundle locally now counts as production even without `NEOTOMA_ENV` set, and `NEOTOMA_ENV=development` no longer overrides an ambient `NODE_ENV=production`.
- An unhandled `WorkerDbAbortError` that previously crash-looped the hosted server is now contained: a process-level listener scoped narrowly to that error type logs a structured diagnostic (stack, cause, reader-pool stats, uptime) and lets the process continue; every other unhandled rejection still exits as before.
- `relationship_snapshots.relationship_type` remains unconstrained `TEXT`; no data migration ran and the 28 built-in types validate identically after this change.

**Shipped artifacts**

- `openapi.yaml` and `dist/` reflect the new `/mcp`, `/register_relationship_type`, and `/list_relationship_types` routes plus the `update_schema_incremental` response restructuring described under Breaking changes.

## API surface & contracts

- **New operations:** `POST /mcp` (MCP 2026-07-28 stateless transport), `POST /register_relationship_type`, `POST /list_relationship_types`.
- **New response fields:** `GET /me` gains `authenticated_user_id` and `shared_graph` (emitted only when they differ from the graph-scope `user_id`, so existing consumers see an unchanged shape otherwise); `POST /agents/grants` and `PATCH /agents/grants/{id}` gain `warnings`; `POST /interpretations/create` and `POST /store` (`StoreStructuredResponse`) gain `relationships_refused`, and `StoreStructuredResponse` gains `relationships_created`.
- **`POST /update_schema_incremental` response restructured (non-breaking in practice, see Breaking changes below):** the 200 response is now a `oneOf` of the existing success shape and a new `SchemaRegistryToolErrorResponse` (`{ error: { error_code, message, hint, details } }`) carrying `ERR_SCHEMA_SCOPE_MISMATCH` / `ERR_NO_SCHEMA_FOR_ENTITY_TYPE` / `ERR_SCHEMA_MISSING_IDENTITY_CONFIG` on HTTP 200, matching the MCP tool response shape.
- Protected-routes manifest regenerated and verified in sync with `openapi.yaml` (123 routes).

## Behavior changes

- `create_relationship`, `create_relationships`, and the relationship leg of `store`/`create_interpretation` now refuse an edge whose source or target is not owned by the caller. A refused edge is reported in the response's `relationships_refused` array (`RELATIONSHIP_ENDPOINT_NOT_FOUND` or `RELATIONSHIP_REFERENCE_UNRESOLVED`) instead of being silently dropped — previously a store carrying an unacceptable edge could return success with the edge silently absent.
- `list_entity_types`/`GET /schemas`'s unscoped read now returns only global schema rows instead of collapsing a global/user-scoped pair with last-write-wins ordering; a private, user-scoped schema override no longer leaks its name to other users via the unscoped list.
- `SchemaRegistryService.activate()` no longer falls through to an arbitrary matching row when neither the caller's user-scoped row nor the global row matches at a given `(entity_type, schema_version)`; it fails closed with "Schema not found" instead.
- The relationship cycle-check in `create_relationship` is now opt-in per type via the registry's `acyclic` flag (set on `DEPENDS_ON` and `PART_OF`), scoped to that type and tenant, and depth-bounded — previously it ran across every edge of every type with no tenant filter and no depth bound, and only on one of four write paths.
- `GET /me` reports `authenticated_user_id`/`shared_graph` only when they diverge from the graph-scope `user_id`; the Inspector sidebar and Settings page now label which id is the signed-in person and which is the shared graph, and prompt re-authentication when a pre-migration connection row has no recorded signer identity.
- The sources read behind `get_field_provenance` previously selected a non-existent `file_name` column and always returned an empty list; it now selects `original_filename` and returns real results, scoped to the authenticated user.

## Agent-facing instruction changes (ship to every client)

`docs/developer/mcp/instructions.md` and `docs/developer/cli_agent_instructions.md` both gained:

- **Relationship type discovery and registration** — a new section instructing agents to call `list_relationship_types` before using an unfamiliar edge type, and `register_relationship_type` (default user scope; global scope requires an explicit grant) when the meaning is absent. Explains the `empty_reason` field (`registry_unseeded` vs `filtered_to_empty`) so an empty result is never mistaken for "no vocabulary exists," and gives a migration recipe for re-typing historical `related_to` + `metadata.relation` edges into a newly registered type.
- **Relationship endpoints must be owned entities** — agents must check `relationships_refused` after any `store`/`create_interpretation` call that named relationships, and resolve `RELATIONSHIP_ENDPOINT_NOT_FOUND` by storing the missing entity first rather than assuming the edge was created.
- **Schema scope mismatch** — agents hitting `ERR_SCHEMA_SCOPE_MISMATCH` on `update_schema_incremental` must retry with `user_specific` matching `details.found_scope`, and must not call `register_schema` for that error code (doing so risks creating a second dual-active schema row).
- **MCP 2026-07-28 clients** — a transport-layer pointer describing the stateless request shape (`params._meta` protocol version, no `initialize`/session), `server/discover` for instructions/capabilities, and the `Mcp-Method`/`Mcp-Name` header contract.

## Security hardening

This release is security-sensitive (`npm run security:classify-diff` reports `sensitive=true`: touches `src/actions.ts`, OpenAPI security blocks, the protected-routes manifest, root-landing route handlers, and the subscriptions webhook transport). Full findings, adversarial-review walkthrough, and sign-off are in [`docs/releases/in_progress/v0.24.0/security_review.md`](security_review.md); deployed-probe results will be linked here after Step 5.

- **Cross-tenant schema-activation fallback (fixed, shipped in prior releases through v0.23.1).** `SchemaRegistryService.activate()` had a silent `candidates[0]` fallback that could resolve to *any* row at a given `(entity_type, schema_version)` when neither the caller's own user-scoped row nor the global row matched. A caller-chosen `schema_version` string on `POST /register_schema` could be crafted to collide with a foreign user's private override version, steering `activate()` onto that foreign row and deactivating it. Fixed by dropping the fallback and failing closed. Gate: `tests/services/schema_scope_resolution_parity.test.ts` (regression-tested against the prior behavior). Operator action: upgrade to v0.24.0. **A disclosed advisory for this fix is being prepared separately** since the vulnerable code shipped in previously published versions.
- **Cross-user schema disclosure via unscoped list (fixed, shipped in prior releases through v0.23.1).** `listEntityTypes`'s unscoped branch previously collapsed global and user-scoped rows with last-write-wins ordering instead of filtering to global rows only, so a private user-scoped entity-type schema could be exposed to another caller's unscoped `GET /schemas`/`list_entity_types` call. Fixed alongside the activation fallback above. Gate: `tests/integration/schema_scope_surface_parity.test.ts` (drives HTTP, MCP `list_entity_types`, and MCP `describe_entity_type`, asserting all three agree with the write path's precedence).
- **Tenant isolation on provenance and relationship-endpoint reads (new hardening, not a prior-release gap in the affected endpoints).** `get_field_provenance`, `get_entity_snapshot`, `list_observations`, source reads, and relationship-target ownership checks are newly scoped to the authenticated user. Gate: `tests/security/provenance_read_scoping.test.ts`, `tests/security/scoped_source_and_relationship_reads.test.ts`, `tests/security/tenant_isolation_matrix.test.ts`.
- **Production-environment detection unified and made fail-closed.** Three independently-precedenced production checks are now one `isProductionEnvironment()`; an unrecognized `NEOTOMA_ENV` value is treated as production rather than silently falling through. Gate: `tests/unit/shared_environment.test.ts`, `tests/unit/root_landing_production_env.test.ts`, `tests/unit/webhook_url_allowed.test.ts`.
- **AAuth grant admission tightened.** A grant now admits a signed request only when its pinned key thumbprint matches the signing key; a grant with no pinned key, or one revoked/suspended, is refused on every transport. Grants are validated before storage, so an invalid grant is refused with `grant_invalid` rather than accepted and silently unusable later. Gate: `tests/unit/aauth_admission.test.ts`, `tests/unit/aauth_grant_key_binding.test.ts`.
- **External-actor claim downgrade.** `POST /store` no longer trusts a body-supplied `external_actor.verified_via`; it is normalized to `"claim"` unconditionally. Server-verified tiers (signed GitHub webhook, AAuth token claims, grant linkage) are unaffected. Gate: `tests/security/store_external_actor_claim.test.ts`.
- **MCP stateless-transport process safety.** The new per-request stateless path could otherwise register process-level `SIGINT`/`SIGPIPE` listeners once per request; signal-handler registration is now consolidated to a single call on the stdio path. Connection ids are no longer logged in full — only a 12-hex fingerprint or `"absent"` — across both transport eras. Gate: `tests/integration/mcp_server_process_listeners.test.ts`, `tests/integration/mcp_http_connection_id_logging.test.ts`.
- Static rules (`npm run security:lint`): 0 errors. Protected-routes manifest (`npm run security:manifest:check`): in sync, 123 routes. Auth topology matrix (`npm run test:security:auth-matrix`): 18 passed, 1 skipped.

## Docs site & CI / tooling

- `docs/subsystems/relationships.md`, `docs/subsystems/auth.md`, `docs/subsystems/errors.md`, `docs/reference/error_codes.md`, `docs/operations/configuration.md`, and `docs/security/threat_model.md` updated to describe the registry, identity, and environment-detection changes above.
- `docs/developer/mcp/proxy.md`, `docs/specs/MCP_SPEC.md` updated for the 2026-07-28 transport.
- `.github/workflows/ci_test_lanes.yml` wires the new abandoned-abort-containment regression test and the schema-scope-resolution parity suite into the `contract_parity` CI lane.
- Six operator decisions on install scope, onboarding surface, ICP segmentation, and the attestation surface applied across `docs/icp/`, `docs/specs/ONBOARDING_SPEC.md`, and `docs/foundation/scope_decisions.md` (docs-only, no behavior change).

## Internal changes

- `src/shared/environment.ts` extracted as the single production-detection module, replacing three independently-maintained copies.
- `services/relationship_types/` added as a sibling registry to `schema_registry`, deliberately not sharing its table or inheriting four of its known defects (no unique constraint, no index, non-transactional register, unscoped `activate()` update).
- `peekCachedDb()` added to `repositories/db/connection.ts`: a synchronous, non-opening accessor so the new abort-containment handler can read reader-pool diagnostics without itself awaiting a DB open.
- `Error.stackTraceLimit` raised to 100 at startup so future unhandled-rejection diagnostics carry async stack frames.
- Test catalog regenerated multiple times across this range to stay current with new integration/unit suites (`npm run generate:test-catalog`).

## Fixes

- `list_relationship_types` explains an empty result (`registry_unseeded` / `filtered_to_empty`) instead of returning a bare empty list when the built-in relationship types are missing for the serving process; they are reseeded once on first read or write.
- A millisecond-racing duplicate relationship-type registration previously surfaced as a raw 500 (`relationship_type_registration_failed`); it is now absorbed as "already registered."
- An unreadable relationship-type `definition` row previously parsed as `{}`, which read the `acyclic` flag as absent and skipped cycle-detection entirely; it now parses as `{ acyclic: true }` (the restrictive branch), so a corrupt row can never escape the cycle check.
- `describe_entity_type` and `update_schema_incremental`'s existence guard previously disagreed on which scope to check, so a type with an active user-scoped schema could report `ERR_NO_SCHEMA_FOR_ENTITY_TYPE` moments after `describe_entity_type` returned its schema. The guard now distinguishes "no schema in any scope" from "schema exists in a different scope" (`ERR_SCHEMA_SCOPE_MISMATCH`), and the old hint (which recommended `register_schema` — the exact action that produces a dual-active-row condition) is corrected for the scope-mismatch case.
- The MCP development-connection identity now applies only to loopback callers with the development setting enabled, with explicit trusted-proxy handling for same-host deployments.

## Tests and validation

- `npm run test:security:auth-matrix`: 18 passed, 1 skipped.
- `npm run security:lint`: 0 errors, 135 pre-existing warnings (unchanged by this release; verified via `git log` that the flagged files were not touched in this range).
- `npm run security:manifest:check`: protected-routes manifest in sync with `openapi.yaml` (123 routes).
- `npm run openapi:bc-diff --base v0.23.1 --head HEAD`: 9 flagged removals, all on `POST /update_schema_incremental [200]`, verified as a false positive from the diff tool not traversing `oneOf` — the success-path fields are unchanged, present in the first `oneOf` branch (see Breaking changes).
- Full `/review` code-review pass over `v0.23.1..HEAD`: see [`docs/releases/in_progress/v0.24.0/test_coverage_review.md`](test_coverage_review.md) for the structured findings and verdict.
- New regression suites added in this range: `tests/security/scoped_source_and_relationship_reads.test.ts`, `tests/security/provenance_read_scoping.test.ts`, `tests/security/store_external_actor_claim.test.ts`, `tests/unit/shared_environment.test.ts`, `tests/unit/root_landing_production_env.test.ts`, `tests/unit/webhook_url_allowed.test.ts`, `tests/unit/aauth_admission.test.ts`, `tests/unit/aauth_grant_key_binding.test.ts`, `tests/integration/schema_scope_resolution_parity.test.ts`, `tests/integration/schema_scope_surface_parity.test.ts`, `tests/integration/update_schema_incremental_scope_mismatch.test.ts`, `tests/integration/shared_graph_identity.test.ts`, `tests/integration/unhandled_abandoned_abort_containment.test.ts`, `tests/integration/mcp_http_stateless_auth_resolution.test.ts`, `tests/services/relationship_type_registration.test.ts`, `tests/services/relationship_type_security.test.ts`.

## Breaking changes

- **`POST /update_schema_incremental [200]` response schema restructured — non-breaking in practice, but flagged by the automated diff tool.** The OpenAPI breaking-change diff (`npm run openapi:bc-diff`) reports 9 "removed-response-field" entries (`success`, `entity_type`, `schema_version`, `fields_added`, `fields_removed`, `canonical_name_fields`, `activated`, `migrated_existing`, `scope`) for this operation. These fields were NOT removed: the response schema changed from a flat `type: object` to `oneOf: [<unchanged success shape>, SchemaRegistryToolErrorResponse]`, and the diff tool does not traverse into `oneOf` branches, so it reports the flat top-level properties as gone when they are simply nested one level deeper inside the first `oneOf` arm. Every field a client previously read from a successful response is present at the same path when the response is successful. **Migration:** none required for existing success-path consumers. A client that wants to distinguish the new structured-error shape on HTTP 200 (as opposed to a thrown exception) should check for the presence of `error.error_code` in the response body, matching the MCP tool response shape used by `ERR_SCHEMA_SCOPE_MISMATCH` / `ERR_NO_SCHEMA_FOR_ENTITY_TYPE` / `ERR_SCHEMA_MISSING_IDENTITY_CONFIG`.
- No other breaking changes. The 13 OpenAPI enum blocks, Zod enum, tool-schema enums, inspector constant, and CLI casts that previously hardcoded the relationship-type vocabulary are removed in favor of `list_relationship_types`, but `relationship_snapshots.relationship_type` remains unconstrained `TEXT` and all 28 built-in types continue to validate identically — no caller-visible enum was narrowed, and no existing edge type stops working.
