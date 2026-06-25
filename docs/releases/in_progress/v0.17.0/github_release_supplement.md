# v0.17.0 Release Supplement

v0.17.0 ships four agent-facing capabilities surfaced from a high-volume production integration — a single-call entity-identity resolver, machine-readable per-release capability delta, discard-by-default high-velocity intake with read-time sightings aggregation, and an embeddable (chrome-less) Inspector graph — alongside auth parity for AAuth-admitted MCP sessions, proxy session resilience, multi-user data isolation fixes, and a large expansion of the agentic eval harness. All new data surfaces are additive and backward-compatible.

## Highlights

- **Resolve entity identity from any combination of signals in one call.** `identify_entity_by_signals` accepts a bundle of name, email, company, domain, phone, and open-ended properties and returns a best-match entity with an identity score, resolution band (`high`/`medium`/`low`/`unresolved`), and top-N candidates — so an agent can auto-merge on high confidence, ask a human on medium, and create-new on low, without chaining three separate retrieve calls.
- **Know which tools an upgrade adds or removes before touching production.** `npm_check_update` gains an opt-in `include_capability_delta: true` flag that returns `new_tools` and `removed_tools` arrays alongside a one-line `capability_delta_recommendation`, letting auto-upgrading agents enumerate newly available MCP tools in the same update-check call.
- **Keep high-velocity sources out of the graph without losing data.** `store` accepts `intake: { mode: "overflow" }` to append raw payloads to a configurable JSONL sink (`NEOTOMA_OVERFLOW_SINK`) instead of creating entities; a new `canonical_key` + `collapse_by` mechanism deduplicates sightings at read time without merging or deleting stored rows.
- **Embed the Inspector graph anywhere via iframe.** The new chrome-less `/embed/graph?apiBase=<url>&node=<id>` route renders the graph explorer with no sidebar or header, inherits CSS-variable skin tokens, and emits `postMessage` on node double-click so a host page can react — zero behavior change for the existing in-app `/graph` route.
- **AAuth-admitted agents can now use MCP tools directly.** An agent with a valid `agent_grant` (AAuth-signed requests) can now authenticate an MCP session without a Bearer token, at exact parity with the REST direct-write endpoints. Capability scope (`(op, entity_type)` ceiling) is enforced per tool call, identical to the REST path.
- **Enforce allowed values, numeric bounds, and patterns at write time.** `register_schema` now accepts per-field `constraints` (`min`/`max`, `enum`, `pattern`, `banned`) and a schema-level `constraint_violation_policy` (`"reject"` aborts the write; `"warn"` stores a non-blocking advisory). Schemas with no constraints are completely unaffected. (#1756)

## What changed for npm package users

**CLI (`neotoma`, `neotoma request`, …)**

- `neotoma request` gains a `--aauth` flag (#1748, #1752). Pass it to authenticate via AAuth request signature instead of a bearer token — the CLI sends no `Authorization` header so the per-agent JWK signature is the credential. Requires `NEOTOMA_AAUTH_PRIVATE_JWK_PATH` + `NEOTOMA_AAUTH_SUB`/`NEOTOMA_AAUTH_KID`. Useful for testing agent attribution from the CLI.
- Per-agent AAuth JWK path override (`NEOTOMA_AAUTH_PRIVATE_JWK_PATH`) lets the CLI signer resolve the private JWK from an env-configured path rather than the global default (#1744). Useful when running multiple agent identities from the same machine.
- `neotoma digest import --from-ndjson` is the consuming counterpart to the observer NDJSON feed (#1777). Reads an NDJSON file and imports entities into the local database.

**Runtime / data layer**

- **Proxy resilience:** the stdio MCP proxy (`src/proxy/mcp_stdio_proxy.ts`) now recovers MCP sessions across backend restarts and non-sticky replica routing (#1750). A bounded re-initialize + retry loop (`DEFAULT_MAX_ATTEMPTS=4`, exponential backoff) replaces the single-shot 503 recovery; per-request timeouts (`DEFAULT_REQUEST_TIMEOUT_MS=15s`) fail fast into a retry instead of stalling. Configurable via `NEOTOMA_MCP_PROXY_TIMEOUT_MS` and `NEOTOMA_MCP_PROXY_MAX_ATTEMPTS`.
- **Multi-user data isolation fix:** observation existence checks and snapshot computation queries in `store` are now scoped by `user_id` (#1753). Previously, a content-addressed observation from a different user with the same ID could silently suppress the current user's insert; snapshot computation could bleed cross-user observations into a snapshot. Both are fixed.
- **Prod server non-watch default:** `neotoma api start` in production now defaults to non-watch mode (#1751), matching how most operators run the server and avoiding accidental file-watcher overhead on `--env prod`.
- **rc-autodeploy follow-ups:** `fix(ops)` tidies the autodeploy flow after the v0.16.0 rc-autodeploy feature review (#1754).
- **`SOURCE_PRIORITY_IGNORED` store warning (#1774):** when an observation carries a non-default `source_priority` but every field on the entity type uses a merge strategy that ignores it (`last_write`, `merge_array`, or `most_specific` without `tie_breaker: source_priority`), the priority value is now surfaced as a non-blocking advisory warning in the store response instead of being silently discarded.

**Shipped artifacts**

- `openapi.yaml` is updated with a new `POST /identify_entity_by_signals` operation and updated `store` / `npm_check_update` schemas. See API surface section below.
- `src/shared/capability_manifest.json` is a new generated artifact (built by `scripts/generate-capability-manifest.ts`). It is included in the npm package and is the source of truth for `npm_check_update` capability delta computation.

## API surface & contracts

**New endpoints**

- `POST /identify_entity_by_signals` (MCP: `identify_entity_by_signals`) — multi-signal entity resolver. Requires bearer auth; `sandbox_allowed: none`. Request body: `{ signals: { name?, email?, company?, domain?, phone?, additional_signals? }, entity_type?, top_n? }`. Response: `{ best_match: { entity, identity_score, resolution_band, matched_signals } | null, candidates: [...] }`.

**Updated endpoints / tools**

- `POST /store` (MCP: `store`) — new optional `intake` field: `{ mode: "graph" | "overflow", reason? }`. Default `"graph"` is unchanged. `mode: "overflow"` skips graph writes and appends to the JSONL sink; response shape changes to `{ overflowed: true, sink_path, line_offset }`. New `canonical_key` and `sighting_source_id` fields on observation inputs are accepted and indexed. New `SOURCE_PRIORITY_IGNORED` advisory warning when `source_priority` is set but has no effect under the schema's merge strategies (#1774).
- `GET /entities` (MCP: `retrieve_entities`) — new optional `collapse_by: "canonical_key"` parameter. When set, groups observations sharing a `canonical_key` at read time; response carries a `sightings[]` array on each synthesized result.
- `npm_check_update` (MCP tool) — new optional `include_capability_delta: boolean` (default `false`). When true, response gains `new_tools`, `removed_tools`, `capability_delta_recommendation`, and (on degraded computation) `capability_delta_note`.
- `POST /register_schema` (MCP: `register_schema`) — new optional per-field `constraints` object (`min`, `max`, `enum`, `pattern`, `banned`) and schema-level `constraint_violation_policy` (`"reject"` | `"warn"`, default `"reject"`). Schema registration validates constraint fields at registration time. Schemas without constraints are unaffected (#1756).
- `GET /retrieve_entity_snapshot` (MCP: `retrieve_entity_snapshot`) — new optional `at_ingested` parameter: ingestion-time cutoff ("what did we know by T"), excluding observations whose `created_at` is after the cutoff even if their `observed_at` predates it (#1777). Supplying both `at` and `at_ingested` ANDs the bounds.

**OpenAPI security**

`/identify_entity_by_signals` has `security: [bearerAuth: []]` and is present in `scripts/security/protected_routes_manifest.json` with `requires_auth: true`. The manifest has been regenerated and is in sync with `openapi.yaml`.

**MCP `initialize` version fix**

The `serverInfo.version` field in the MCP `initialize` response now reports the real server package version (e.g. `0.17.0`) instead of the hardcoded `"1.0.0"` (#1689). Clients that inspect `serverInfo.version` for drift detection now get accurate data.

## Behavior changes

- **AAuth MCP authentication parity:** AAuth-admitted agents (active `agent_grant`, verified signature) can authenticate an MCP session without a Bearer token. The tool-call `(op, entity_type)` capability ceiling and governance-type guard apply identically to the REST path. Existing Bearer/OAuth callers are unaffected.
- **`--strict` merge gate expanded:** `store` with `--strict` now permits merges via `canonical_name`, `email`, and stable internal/external ID fields (`message_id`, `turn_key`, `thread_id`, etc.), in addition to schema-declared `canonical_name_fields`. Heuristic fallbacks (`name`, `title`, fuzzy matches) are still refused. The updated error message explains all allowed paths (#1753).
- **Prod server watch mode:** `neotoma api start --env prod` now defaults to non-watch mode.
- **Proxy retry semantics:** MCP proxy sessions that previously fell permanently "unavailable" after a backend restart or replica routing event now recover transparently with bounded retries. The observable change is that tool calls succeed (with a short delay) across restarts rather than failing with a 503 or timeout.
- **Ingestion-time snapshot cutoff (`at_ingested`):** `retrieve_entity_snapshot` gains an `at_ingested` parameter (ingestion-time cutoff: "what did we know by T", excluding observations whose `created_at` is after the cutoff even if their `observed_at` predates it) (#1777). Supplying both `at` and `at_ingested` ANDs the bounds for the most conservative view.
- **Write-time value constraints:** `store` enforces per-field `constraints` declared in the schema. Default policy `"reject"` aborts the write and returns `ERR_CONSTRAINT_VIOLATION`; `"warn"` policy stores a `CONSTRAINT_VIOLATION` warning and proceeds. Schemas with no `constraints` declared are entirely unaffected (#1756).
- **`issue` entity keying on `(github_number, repo)`:** issue entities now key on the immutable `(github_number, repo)` pair instead of the mutable title. Existing duplicate `issue` entities may coalesce on upgrade via the seed-repair path — see Upgrade notes (#1778).

## Agent-facing instruction changes (shipped to every client)

`docs/developer/mcp/instructions.md` changed in multiple places (shipped to every connected MCP client on server upgrade):

1. **`retrieve_entity_snapshot` tool reference updated** — the `at` / `at_ingested` parameter distinction is now described: `at` is event-time cutoff ("what had happened by T"), `at_ingested` is ingestion-time cutoff ("what did we know by T"). Agents should use both parameters when they need the most conservative view.
2. **`npm_check_update` update-check rule updated** — agents are now instructed to pass `include_capability_delta: true` when the session needs to enumerate newly available MCP tools after an upgrade, and to omit the flag when only the version check matters (to avoid unnecessary manifest I/O).
3. **`register_schema` conflict-resolution config and `as_of` on `retrieve_entity_snapshot` now named on the tool surface** (#1785) — `register_schema` description explicitly names per-field conflict resolution via `reducer_config` and that `source_priority` only takes effect under `highest_priority`; `retrieve_entity_snapshot` description adds the `as-of` synonym for findability. Description-only; no behavior change.

## Security hardening

This release is security-sensitive (`npm run security:classify-diff -- --base v0.16.0 --head HEAD` → `sensitive=true`). The diff touches `src/actions.ts` (auth-middleware surface), `openapi.yaml` (openapi-security), and `scripts/security/protected_routes_manifest.json` (protected-routes-manifest + security-gates).

The full AI security review is at [`docs/releases/in_progress/v0.17.0/security_review.md`](security_review.md).

Post-deploy security probes are pending execution after sandbox deployment (Step 5 of the release process); the report will be written to `docs/releases/in_progress/v0.17.0/post_deploy_security_probes.md`.

No security advisories were opened for this release. All changes are fail-safe by construction (see review).

### Material security changes

**1. AAuth admission as `/mcp` authentication path — session-admission race fixed (PR #1731, #1788)**

- **Surface:** `src/actions.ts` (threads admission via per-request AsyncLocalStorage), `src/server.ts` (reads admission from ALS context, not shared field).
- **What was fixed by #1788:** The prior implementation stored admission in a shared `NeotomaServer.sessionAdmission` field. Under concurrent admitted `/mcp` requests from different grant owners, request B could overwrite A's admission before A's `initialize` read it — a potential owner-pivot race. PR #1788 removes the shared field and threads admission through per-request AsyncLocalStorage (`runWithRequestContext`), eliminating the race. Regression test: `tests/integration/aauth_mcp_session_admission_race.test.ts` (red-before, green-after proof).
- **Exposure if a regression had landed:** A mis-implemented admission thread could authenticate an unadmitted session (no valid grant) or allow an owner pivot (a signer selecting a different user's data). Either would be a privilege escalation on the MCP surface. The race was the residual risk flagged in the prior supplement draft — it is now resolved.
- **Why it is safe as shipped:** `admitted: true` is set only for a verified signature (`signature_verified: true`) matched to an `active` grant; `user_id` is taken from the grant owner's record, never from request input; OAuth/Bearer check precedence is preserved; capability scope enforced per tool call. Regression tests: `aauth_mcp_initialize_admission.test.ts`, `aauth_mcp_capability_parity.test.ts`, `aauth_mcp_session_admission_race.test.ts`.
- **Gate:** G1 (classify-diff `auth-middleware`), G3 (`test:security:auth-matrix`, protected routes manifest), G4 (security review).
- **Operator action:** Upgrade to v0.17.0. AAuth-admitted agents now work with MCP tools directly, concurrency-safe. No bearer token rotation required.

**2. `user_id`-scoped observation queries — multi-user data isolation fix (PR #1753)**

- **Surface:** `src/server.ts` `storeStructuredInternal` (observation existence check, snapshot computation).
- **Exposure if a regression had landed:** A content-addressed observation collision across users could cause a user's write to be silently skipped (write/read gap); snapshot computation could bleed another user's observation data into the current user's snapshot.
- **Why it is safe as shipped:** Both queries now carry `.eq('user_id', userId)`. The `userId` is the server-authenticated identity, not a caller-supplied value. Unit tests: `store_strict_and_consistency.test.ts` (10 tests).
- **Gate:** G4 (this security review). Unit test coverage in `tests/unit/store_strict_and_consistency.test.ts`.
- **Operator action:** Upgrade to v0.17.0. Multi-user deployments that experienced silent observation drops or cross-user snapshot contamination will see correct write/read consistency after upgrade.

**3. New `/identify_entity_by_signals` endpoint — manifest entry (PR #1603, #1670)**

- **Surface:** `openapi.yaml` (new operation), `scripts/security/protected_routes_manifest.json` (new row).
- **Exposure if a regression had landed:** An unauthenticated route would expose entity identity resolution to anonymous callers, leaking whether a given name/email/domain is stored in the graph.
- **Why it is safe as shipped:** The route has `requires_auth: true` and `sandbox_allowed: none` in the manifest; `openapi.yaml` has `security: [bearerAuth: []]`. The manifest is in sync with `openapi.yaml` (verified by `npm run security:manifest:check`). G3 (`test:security:auth-matrix`) enforces 401 responses for no-auth and invalid-auth requests.
- **Gate:** G1 (classify-diff `openapi-security`, `protected-routes-manifest`), G3 (`test:security:auth-matrix`), G5 (post-deploy probes will exercise the 401 row).
- **Operator action:** Upgrade to v0.17.0. The endpoint is available to authenticated callers.

## Breaking changes

None. This release is additive.

The `--strict` merge gate expansion (PR #1753) is not a breaking change: it widens the set of inputs that succeed under `--strict` (previously these returned an error). Callers that passed `--strict` with `canonical_name`, `email`, or stable ID fields will now get a merge result rather than a refusal. Callers that did not pass `--strict` are unaffected.

The write-time field constraints feature (PR #1756) is opt-in: no built-in schema declares constraints, and the enforcement path is only entered when a schema explicitly declares `constraints`. Existing schemas and existing store calls are completely unaffected.

Validation tightening: no request shapes were tightened in this release. No `additionalProperties: false` blocks added to previously open schemas; no fields promoted from optional to required; no enum narrowing.

## Documentation

Pre-staged site pages for each feature (discharges #1760 coverage for these tools):

- [Identity resolver](/identify-entity-by-signals) — `identify_entity_by_signals` multi-signal bundle, scoring, resolution bands, example call
- [Capability delta](/capability-delta) — `npm_check_update` with `include_capability_delta`, `new_tools`/`removed_tools` response, agent integration pattern
- [High-velocity intake](/high-velocity-intake) — overflow sink (`intake.mode='overflow'`, `NEOTOMA_OVERFLOW_SINK`), `canonical_key` sightings, `collapse_by` read-time aggregation
- [Embeddable graph](/embed-graph) — chrome-less `/embed/graph` iframe route, `?apiBase=`/`?node=` params, `postMessage` on node double-click
- [Inspector skinning guide](/inspector-skinning) — CSS-variable theming, `NEOTOMA_INSPECTOR_SKIN` / `NEOTOMA_INSPECTOR_SKIN_CONFIG` (closes #1680)
- [Observer / batch JSONL issue import guide](/issues-guide) — consuming the observer NDJSON feed, `neotoma digest import --from-ndjson` (#1765)

Subsystem docs updated:
- `docs/subsystems/agent_attribution_integration.md` — AAuth transport parity + MCP session threading
- `docs/subsystems/agent_capabilities.md` — MCP enforcement points for admitted sessions
- `docs/security/threat_model.md` — AAuth-admission `/mcp` auth path + fail-safe conditions
- `docs/subsystems/conflict_resolution.md` — conflict resolution — merge policies, LWW default, omit-don't-zero (#1773)

## Sandbox (sandbox.neotoma.io)

Operator-facing fixes to the public sandbox; none affect single-tenant installs.

- **Fixture packs now seed per visitor.** Picking a pack on the sandbox actually populates the workspace. Two root causes were fixed: the per-session seeder was never invoked, and (the deeper one) deterministic entity ids were global — `entities.id` is a global primary key and `generateEntityId` hashed only `(entity_type, canonical_name)`, so the 2nd+ visitor to seed a given name `matched_existing` against the 1st visitor's row and got an empty workspace.
- **Opt-in tenant-scoped entity ids.** `generateEntityId` now accepts an optional tenant salt applied via `entityIdTenantSalt(userId)`, gated on `isSandboxMode()` **or** the new `NEOTOMA_TENANT_SCOPED_ENTITY_IDS` flag (truthy `1`/`true`/`yes`). **Single-tenant prod is unchanged** — no salt → identical global ids → no migration, no id churn. The gate is intended to be set once per deployment (toggling it on a persistent store would strand existing rows). Latent note: the global-identity behavior means any multi-tenant deployment (e.g. shared `mcp.neotoma.io`) should enable this flag deliberately.
- **`seed_status` on session responses.** `POST /sandbox/session/{new,reset}` now return `seed_status: "seeded" | "skipped" | "failed"` so the UI can tell a legitimately-empty pack from a seeding failure.
- **Inspector served at the sandbox root.** `GET /` (HTML) now serves the Inspector SPA in sandbox mode too (as it already did in local/personal/prod); the pack picker moved into the Inspector home. Agents/`curl` still get the JSON/Markdown discovery payload at `/`. The legacy `/inspector#session=<code>` hash handoff still works.
- **CI-driven sandbox deploy.** Publishing a GitHub Release now deploys `neotoma-sandbox` via `.github/workflows/deploy-sandbox.yml` (was a manual, easy-to-skip `flyctl` step), and the build stamps the real commit SHA so the root JSON `git_sha` is a verifiable 40-char commit instead of a Fly machine-version ULID.

## Docs site & CI / tooling

- **Agentic eval harness — major expansion (#1703–#1735, #1737–#1741):** `packages/eval-harness` now covers entity delete/restore, merge dedup, split repair, relationship lifecycle, retrieve filters + snapshot + provenance, match_mode, schema/interpretation/peers/submission/turn-summary/reads, subscribe webhook-secret, and a combined WRIT+Tier-2 QA gate lane (`packages/eval-combined`). These are the authoritative regression evals for the tool-behavior contract.
- **CI lane — `ci_test_lanes.yml`** updated to include the new eval harness lanes (`baseline`, `frontend`, `site_export`, `security_gates`).

## Internal changes

- `src/shared/package_version.ts` — new shared utility for reading the package version at runtime, used by `initialize` and the server card.
- `src/services/entity_signal_resolver.ts` — new service backing `identify_entity_by_signals`.
- `src/services/capability_delta.ts` — new service for computing the tool capability delta from the manifest.
- `scripts/generate-capability-manifest.ts` — build-time script that walks `vX.Y.Z` release tags and emits `src/shared/capability_manifest.json`.
- `src/services/field_constraints.ts` — new pure module implementing `FieldConstraints` evaluation (min/max, enum, pattern, banned); enforced in both MCP and HTTP store paths (#1756).
- `src/services/source_priority_warning.ts` — pure helpers for detecting when `source_priority` has no effect under the entity type's merge strategies (#1774).
- Inspector: `inspector/src/contexts/api_base_context.tsx`, `*WithBase` helpers, `inspector/src/pages/embed_graph.tsx` — new API-base context and embed route.
- Eval harness cassettes — large set of stub/replay cassettes for the new eval scenarios.

## Fixes

- **Proxy session recovery** — MCP proxy sessions no longer fall permanently "unavailable" after a backend restart or non-sticky replica routing. The fix handles transport errors, 503s, and per-request timeouts uniformly (#1750).
- **MCP `initialize` version** — `serverInfo.version` now reports the real package version instead of hardcoded `"1.0.0"`. Clients using version checks for drift detection will get accurate data after upgrading (#1689).
- **Multi-user observation isolation** — content-addressed observation ID collisions no longer silently suppress one user's insert, and snapshot computation no longer bleeds cross-user observations (#1753).
- **Prod server non-watch default** — `neotoma api start --env prod` no longer starts with file-watching enabled by default (#1751).
- **AAuth MCP session admission race** — concurrent admitted `/mcp` requests from different grant owners can no longer contaminate each other's session admission via the prior shared `sessionAdmission` field (#1788).
- **`issue` entity deduplication** — issue entities now key on immutable `(github_number, repo)` instead of mutable title, eliminating duplicate issue entities that arose when a triage write carrying only a title received a title-hashed entity ID that diverged from the later `(github_number, repo)` composite (#1778).

## Upgrade notes

- **Fully backward-compatible.** Every new surface is opt-in: `include_capability_delta`, `intake`, `canonical_key`/`sighting_source_id`, `collapse_by`, `constraints`, `constraint_violation_policy`, and `at_ingested` all default to prior behavior when omitted. The `canonical_key` columns are nullable additive columns — existing rows stay `NULL`.
- **`issue` entity coalescing (#1778):** existing duplicate `issue` entities (one title-keyed, one `(github_number, repo)`-keyed) may coalesce on upgrade via the seed-repair path. Review your issue entities before upgrading if you rely on specific entity IDs for `issue` type records.
- **New env vars:**
  - `NEOTOMA_OVERFLOW_SINK` (absolute path or directory). Only consulted when a `store` call passes `intake.mode: "overflow"`; unset = overflow disabled (a structured hint is returned if overflow is requested without it).
  - `NEOTOMA_MCP_PROXY_TIMEOUT_MS` (integer, milliseconds, default `15000`). Per-request timeout for the stdio MCP proxy.
  - `NEOTOMA_MCP_PROXY_MAX_ATTEMPTS` (integer, default `4`). Maximum retry attempts before the proxy emits a structured JSON-RPC error.
  - `NEOTOMA_AAUTH_PRIVATE_JWK_PATH` (path). Overrides the default global AAuth private JWK path for CLI signing.
  - `NEOTOMA_TENANT_SCOPED_ENTITY_IDS` (truthy `1`/`true`/`yes`). Enables tenant-scoped entity ID generation (sandbox: auto-enabled; single-tenant prod: off; set once per deployment — toggling on a persistent store strands existing rows).
- **Embedders:** point an iframe at `/embed/graph?apiBase=<your-api-origin>`; theme via the existing `NEOTOMA_INSPECTOR_SKIN` / `NEOTOMA_INSPECTOR_SKIN_CONFIG` mechanism from v0.16.0.
- **`initialize` version field:** clients that previously relied on `serverInfo.version === "1.0.0"` as a wildcard will now see the real version. No expected compatibility impact.
