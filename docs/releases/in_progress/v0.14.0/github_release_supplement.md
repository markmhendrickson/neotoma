v0.14.0 ships substantial improvements across search, ingestion, agent ergonomics, and security. Headlines: smarter entity search that ranks by entity-type intent and hides chat bookkeeping; persistent issue-filing consent; paginated graph neighborhood traversal; structured cold-start error responses on `update_schema_incremental`; per-user data scoping on relationship query endpoints (GHSA-wrr4-782v-jhwh); a `/review` skill wired into the automated PR review workflow; the `preference` entity schema is now registered; and `neotoma schemas repair-plural-types` is fixed for global / `npx` installs.

## Highlights

- **Smarter entity search.** When a query token names an entity type (e.g. "plans", "tasks", "transactions"), `retrieve_entities` now boosts that type's results by 280 points and filters by type instead of matching the token against snapshot text — so "newest plans" actually surfaces plans, not chat messages mentioning the word "plans". Singular/plural normalization included.
- **Chat bookkeeping no longer pollutes product search.** The Inspector header search and `/search` automatically exclude `conversation`, `conversation_message`, and related bookkeeping entity types unless the caller explicitly filters by one of those types. Pass `exclude_bookkeeping: true` on `retrieve_entities` to apply the same filter from any caller.
- **Issue-filing preference persists across sessions.** On first encounter, agents ask once and store your choice (`always` / `ask` / `never`) as a `preference` entity so future sessions skip the prompt. `neotoma issues config --mode` still sets the runtime flag; the preference entity is the cross-session layer that feeds it.
- **Paginate large graph neighborhood results.** `retrieve_graph_neighborhood` and `POST /retrieve_graph_neighborhood` now accept `limit` (default 100, max 500) and `offset` parameters and return `total_count` and `has_more`, so callers can page through densely-connected nodes without truncation.
- **Tenant isolation fix on relationship query endpoints.** [GHSA-wrr4-782v-jhwh](https://github.com/markmhendrickson/neotoma/security/advisories/GHSA-wrr4-782v-jhwh) — `/list_relationships` and `/retrieve_graph_neighborhood` previously authenticated callers but did not scope database queries to the requesting user. An authenticated user with a known cross-user entity ID could read another user's relationship metadata. Severity Low under current single-tenant deployments; escalates to Medium for multi-tenant. Fixed with explicit `.eq("user_id", userId)` on every query and a new `tenant_isolation_matrix.test.ts` gate.
- **`/review` skill wired into automated PR review.** The PR review workflow now invokes a versioned `/review` skill that walks the full architectural + product-principles + agent-instruction coherence checklist instead of a hand-rolled prompt. The same skill runs as a hard gate inside `/release` Step 3.6.
- **`preference` entity schema registered.** The schema is now seeded at boot so `preference` entities (used by the issue-filing consent flow, future agent settings) have proper canonical-name derivation, last-write merge policy, and field declarations.
- **`neotoma schemas repair-plural-types` works from a global or npx install.** A dynamic import in the compiled CLI used the wrong relative path (`../../services/` instead of `../services/`), which silently failed after installation. Fixed, with new dist-level smoke tests covering this class of bug going forward.

## What changed for npm package users

**CLI (`neotoma`)**

- `neotoma schemas repair-plural-types` — fixed: the dist-level dynamic import path for `plural_type_repair` was one directory level off (`../../services/plural_type_repair.js` instead of `../services/plural_type_repair.js`). The bug was invisible to TypeScript compilation and source-level tests because both resolve from `src/`; only a subprocess spawned against the compiled `dist/` catches it. New smoke tests at `tests/contract/cli_handler_dist_smoke.test.ts` cover this class of regression for `schemas repair-plural-types`, `schemas audit`, `schemas list`, and `status`.

**Runtime / data layer**

- **Entity search ranking and bookkeeping exclusion (`retrieve_entities`, `POST /retrieve_entities`)** — substantial rework of `src/shared/action_handlers/entity_handlers.ts` (~430 lines):
  - New `ENTITY_TYPE_KEYWORD_BOOST = 280`. When a search token equals an entity_type's name (canonical or singular-normalized via `suggestSingular`), matching entities of that type get ranked 280 points higher in the result list.
  - New `exclude_bookkeeping` parameter on `retrieve_entities` (boolean, default false on direct API calls; default true for Inspector header and `/search`). When set, `conversation`, `conversation_message`, and related `BOOKKEEPING_ENTITY_TYPES` are omitted from results.
  - New `buildEntityTypeFilterTokens(searchTokens, knownEntityTypes)` and `textTokensForEntityMatch(searchTokens, typeFilterTokens)` helpers: when the query names a known entity_type, that token is removed from snapshot-text matching and becomes a type filter instead. The remaining tokens still match snapshot content.
  - New `buildEntityLexicalSearchText(canonicalName, snapshot, rawFragmentText)` builds the canonical lexical haystack (canonical name + snapshot + raw fragments) used for ranking.
  - `lexicalSearchEntityIds` now resolves active entity types from `schema_registry` to drive the type-filter logic; falls back to a warning log if the schema registry query fails.
  - Net effect: a query like "newest plans" now narrows the candidate query to `entity_type='plan'` and boosts ranking accordingly, rather than fuzzy-matching the literal string "plans" against every entity's snapshot.
- **`retrieve_graph_neighborhood` pagination** — accepts `limit` (1–500, default 100) and `offset` (default 0) query parameters. Response now includes `total_count` (total relationships for the node before pagination) and `has_more`. Use these to page through high-degree nodes.
- **`list_relationships` filter expansion + OpenAPI declaration** — `src/actions.ts`: the handler now supports `source_entity_id` and `target_entity_id` as direct filter params in addition to the legacy `entity_id + direction` pattern. Pagination (`limit`, `offset`) added. The request schema requires at least one of `entity_id`, `source_entity_id`, `target_entity_id`, or `relationship_type`. Optional `user_id` filter added. `openapi.yaml` now declares the full request and response shape including the closed `relationship_type` enum (matching `RelationshipTypeSchema`) and an `anyOf` "at least one identifying field" constraint. Non-breaking addition.
- **Per-user data scoping on `/list_relationships` and `/retrieve_graph_neighborhood`** ([GHSA-wrr4-782v-jhwh](https://github.com/markmhendrickson/neotoma/security/advisories/GHSA-wrr4-782v-jhwh)) — both endpoints now resolve `getAuthenticatedUserId` and apply `.eq("user_id", userId)` to every relationship, entity, observation, and source lookup. Closes #365 and the tenant-isolation portion of #366. Test gate added: `tests/security/tenant_isolation_matrix.test.ts`.
- **`update_schema_incremental` cold-start handling** — when called for an entity_type with no registered or code-defined schema, previously threw an opaque `McpError(-32603)`; now returns a structured non-throwing response with `error_code: ERR_NO_SCHEMA_FOR_ENTITY_TYPE`, `no_schema_for_entity_type: true`, and a stable `hint` ("Pick `register_schema` for the new entity_type. The MCP tool is `register_schema`; the HTTP route is `POST /register_schema`...") that no longer interpolates per-type strings. When the entity_type has an existing schema that lacks both `canonical_name_fields` and `identity_opt_out`, the R2 error is now surfaced as `ERR_SCHEMA_MISSING_IDENTITY_CONFIG` with a hint to call `register_schema` with a complete schema definition.
- **`preference` entity schema** — registered at boot under `src/services/schema_definitions.ts`. Fields: `title` (canonical name source), `value` (last-write merge policy), `scope`, `description`. Backs the cross-session issue-filing consent flow and is available for any future agent-settings entity. Closes #339.
- **Profile mirror render correctness (`rebuildProfile` / `mirrorEntity`)** — `mirrorEntity` now dispatches to `renderProfileEntity` when `render_mode` is `frontmatter_content` or `content_only`, matching `rebuildProfile` behavior. Previously the live-write path always called `renderEntityMarkdown`, ignoring `render_mode`, `frontmatter_fields`, and `content_field`. When `content_field` was `"body"`, this produced a spurious `## body` heading in the output. Fixed via dynamic import of `renderProfileEntity` from `canonical_markdown.js`. Closes #262.
- **Graceful `entity_types` fallback in search** (`src/shared/action_handlers/entity_handlers.ts`) — when `schema_registry` queries fail (cold start, transient DB error), `resolveEntityTypesForTypeFilters` now logs a warning and returns an empty set rather than throwing. Search falls back to the un-typed match path instead of failing the whole request. Closes #342.

**Shipped artifacts**

- `openapi.yaml` — substantial additions:
  - `POST /retrieve_graph_neighborhood` gains `limit`, `offset`, `user_id` request fields and `total_count`, `has_more`, `node_id`, `node_type`, `entity`, `relationships`, `related_entities`, `observations`, `sources` response fields.
  - `POST /list_relationships` gains a fully-declared request body (`entity_id`, `source_entity_id`, `target_entity_id`, `direction`, `relationship_type` closed enum, `limit`, `offset`, `user_id`) with `anyOf` "at least one identifying field" constraint, plus full response shape (`relationships`, `total`, `limit`, `offset`).
- `.dockerignore` — substantially trimmed: build context reduced from ~15 GB to ~50 MB by excluding non-source dirs (`backups`, `data_backups`, `tmp`, `site_pages`, `writ`, `packages`, `mcp`, `public`, `frontend`, `.claude`, `.vitest`). Faster image builds; no runtime behavior change.

## API surface & contracts

**OpenAPI** — no breaking changes. ~35 non-breaking additions covering `POST /retrieve_graph_neighborhood` (12 fields) and `POST /list_relationships` (request body + response body + closed enum + anyOf constraint). `npm run openapi:bc-diff -- --base v0.13.0 --head HEAD` reports no breaking changes.

**Request schemas** — `ListRelationshipsRequestSchema` (`src/shared/action_schemas.ts`) refactored: `entity_id` becomes optional, `source_entity_id` / `target_entity_id` / `user_id` added as optional, `.refine()` requires at least one identifying field, `limit` is bounded `1..500`, `offset` bounded `≥ 0`. Existing callers passing only `entity_id` continue to work.

**MCP tool surface** — `retrieve_graph_neighborhood` tool gains `limit` (integer, 1–500, default 100) and `offset` (integer, min 0, default 0) parameters.

## Behavior changes

- **Entity search results reorder.** Queries containing entity-type names ("plans", "tasks", "transactions") will now return type-filtered results ranked by a 280-point keyword boost, where previously they returned mixed-type fuzzy matches. Snapshots and downstream callers that depended on the old fuzzy behavior may see different result orderings or smaller result sets when the query happens to name a type.
- **Inspector header search hides chat bookkeeping by default.** Conversations and conversation messages no longer appear in product search results unless the caller explicitly filters by `conversation` or `conversation_message`.
- **`neotoma schemas repair-plural-types`** now executes its handler correctly from a global `npm install -g neotoma` or `npx neotoma` invocation. Previously the dynamic import silently threw `ERR_MODULE_NOT_FOUND` when invoked against the dist tree.
- **`update_schema_incremental`** on an unregistered type returns a structured error with stable `hint` text instead of an uncaught internal error. Callers should check for `error_code: ERR_NO_SCHEMA_FOR_ENTITY_TYPE` and redirect to `register_schema`. Hint text no longer interpolates per-type strings (stable across calls).
- **`mirrorEntity` profile render** — `## body` section heading no longer appears spuriously when `content_field` is `"body"` in `frontmatter_content` mode.
- **Graph neighborhood traversal** — responses are now paginated; callers relying on all relationships being present in a single response must check `has_more` and page when `true`.
- **Relationship query endpoints scope to authenticated user.** `/list_relationships` and `/retrieve_graph_neighborhood` now return only the authenticated user's relationships/graph. Multi-tenant callers that previously received cross-user rows (a bug) will see strictly smaller result sets. Single-tenant deployments are unaffected.

## Agent-facing instruction changes (ship to every client)

The MCP instructions (`docs/developer/mcp/instructions.md`) shipped with this release include two changes:

1. **Issue-filing consent uses a stored preference entity.** The `[ISSUE REPORTING]` section's mode-discovery flow now first calls `retrieve_entities` with `entity_type: "preference"` and filter `title: "issue_filing_consent"` before prompting the user. If a matching entity exists, its `value` field (`always` / `ask` / `never`) resolves the mode without re-prompting. On first consent, the agent persists both the preference entity (cross-session memory) and `neotoma issues config --mode` (runtime config flag). The QA-driven filing section mirrors this flow.

2. **`describe_entity_type` added as the first option for schema-check.** The schema-check rule in `[ENTITY TYPES & SCHEMA]` now lists `describe_entity_type` as the preferred introspection call (returns the full `SchemaDefinition`: fields, `canonical_name_fields`, `temporal_fields`, `reference_fields`, `aliases`, `merge_policies`) before falling back to `get_schema_recommendations` or a snapshot inspection.

The previous draft `[IDENTITY & ATTRIBUTION]` "Blocked-plan recovery at session start" rule referencing a `check_blocked_plans` tool was reverted (#349) because the underlying tool was never implemented (#297 closed in favor of an existing-primitives approach; see #193 follow-up).

## Plugin / hooks / SDK changes

The `/review` skill is now invoked end-to-end by `.github/workflows/claude_pr_review.yml` instead of a hand-rolled prompt. Path triggers widened to include `docs/developer/mcp/instructions.md`, `docs/developer/cli_agent_instructions.md`, `docs/foundation/**`, `docs/architecture/**`, `docs/subsystems/**`, `.claude/skills/**`, `.claude/rules/**`. `/release` Step 3.6 also runs `/review` on the full release diff as a hard gate. Closes #348.

## Security hardening

The diff classifier (`npm run security:classify-diff -- --base v0.13.0 --head HEAD`) reports `sensitive=true` because `openapi.yaml` and `src/actions.ts` appear in the monitored surface set. Two distinct security-relevant changes shipped:

1. **Tenant isolation fix** ([GHSA-wrr4-782v-jhwh](https://github.com/markmhendrickson/neotoma/security/advisories/GHSA-wrr4-782v-jhwh)) — Per-user data scoping added to `/list_relationships` and `/retrieve_graph_neighborhood` HTTP handlers and their MCP counterparts. Closes #365, addresses the tenant-isolation portion of #366. Test gate added: `tests/security/tenant_isolation_matrix.test.ts` (6 tests) seeds two users and asserts cross-user reads are blocked. See `docs/security/advisories/2026-05-21-relationship-endpoint-tenant-isolation.md` for the full advisory.

2. **`change_guardrails_rules.mdc` MUST 5 (Authorization) extended** — explicit `.eq("user_id", userId)` requirement on every query against user-owned tables, plus mandatory tenant-isolation matrix coverage for new query endpoints. Prevents recurrence of the tenant isolation gap class.

Surfaces touched (full inspection):
- **`openapi.yaml`** — adds pagination, response-enrichment, and request-body declarations on `POST /retrieve_graph_neighborhood` and `POST /list_relationships`. No changes to security blocks, protected routes, or auth scheme declarations.
- **`src/actions.ts`** — `list_relationships` handler refactor (filter expansion + pagination) + per-user scoping on both `/list_relationships` and `/retrieve_graph_neighborhood`. No changes to `isLocalRequest`, `forwardedForValues`, `isProductionEnvironment`, or any auth-gating logic.
- **`src/server.ts`** — corresponding per-user scoping on the MCP versions of `listRelationships` and `retrieveGraphNeighborhood`.
- **`src/shared/action_handlers/entity_handlers.ts`** — search ranking and bookkeeping-exclusion changes. The new helpers (`shouldExcludeBookkeepingFromSearch`, `searchTokenMatchesEntityType`, `entityTypeKeywordBoost`, `buildEntityTypeFilterTokens`) are pure query/ranking functions with no auth surface. Query construction continues to filter by `user_id` through the standard authenticated path.

Security review: [`docs/releases/in_progress/v0.14.0/security_review.md`](security_review.md) — verdict `yes`, no security-relevant findings beyond the documented advisory.

Post-deploy probes: [`docs/releases/in_progress/v0.14.0/post_deploy_security_probes.md`](post_deploy_security_probes.md) (populated after Step 5).

Gate results:
- G1 `npm run security:classify-diff` — `sensitive=true`.
- G2 `npm run security:lint` — 0 errors (112 pre-existing warnings, none introduced by this release).
- G3a `npm run security:manifest:check` — in sync (108 routes).
- G3b `npm run test:security:auth-matrix` — 16 passed, 1 skipped.
- G3c `tests/security/tenant_isolation_matrix.test.ts` (new) — 6 passed.
- G4 `npm run security:ai-review` — review file filled, sign-off `yes`.

## Docs site & CI / tooling

- `docs/subsystems/entity_field_semantics.md` — new canonical doc (141 lines) defining `source` (originating system slug), `source_url` (URL), `source_ref` (upstream external ID), and `data_source` (audit string). Includes canonical slug table and forbidden-value examples.
- `docs/subsystems/record_types.md` — dataset `source` description tightened to reference `entity_field_semantics.md`.
- `docs/developer/mcp/instructions.md` — adds a source-field rule to the agent instructions: source is a slug, never a URL or person name; use `source_url` and `source_ref` for those.
- `docs/doc_dependencies.yaml` — registers `entity_field_semantics.md` as upstream for `schema_definitions.ts`, `instructions.md`, and `record_types.md`.
- `src/services/schema_definitions.ts` — inline comments on the `source` fields of `income`, `note`, and `agent_task` declarations now point to the canonical doc.
- `docs/reference/error_codes.md` — new Schema Registry Errors section documenting `ERR_NO_SCHEMA_FOR_ENTITY_TYPE` and `ERR_SCHEMA_MISSING_IDENTITY_CONFIG`. Closes #344.
- `docs/security/advisories/README.md` — new entry for GHSA-wrr4-782v-jhwh.
- `docs/architecture/change_guardrails_rules.mdc` — MUST 5 (Authorization) extended per security hardening above.
- `.claude/skills/review/SKILL.md` — new (335 lines), the `/review` skill body that the PR review workflow invokes.
- `.github/workflows/claude_pr_review.yml` — invokes the skill via `direct_prompt`, widens path triggers, broadens `substantial` gate detection.
- `docs/testing/automated_test_catalog.md` regenerated to include all new test files.

## Fixes

- **Tenant isolation on relationship query endpoints** ([GHSA-wrr4-782v-jhwh](https://github.com/markmhendrickson/neotoma/security/advisories/GHSA-wrr4-782v-jhwh)) — see Security hardening section above.
- **`neotoma schemas repair-plural-types` dist import** (#304, #311) — import path `../../services/plural_type_repair.js` → `../services/plural_type_repair.js` in the compiled CLI. Invisible to TypeScript and source-level tests; caught only by running `node dist/cli/index.js`.
- **`update_schema_incremental` opaque error on unregistered types** (#269) — replaced uncaught `McpError(-32603)` with structured `ERR_NO_SCHEMA_FOR_ENTITY_TYPE` / `ERR_SCHEMA_MISSING_IDENTITY_CONFIG` responses with actionable hints. Hint text stabilized to remove per-type string interpolation (#345).
- **`mirrorEntity` spurious `## body` heading** (#262) — `mirrorEntity` live-write path now dispatches to `renderProfileEntity` for profile render modes, matching `rebuildProfile` behavior.
- **OpenAPI declaration drift on `/list_relationships`** (#340) — the v0.14.0 handler refactor added request and response fields that were not declared in `openapi.yaml`. Now declared with closed `relationship_type` enum and `anyOf` constraint.
- **`schema_registry` cold-start search failure** (#342) — `resolveEntityTypesForTypeFilters` now logs a warning and falls back gracefully instead of throwing.
- **Removed broken `check_blocked_plans` instruction** (#337) — the `[IDENTITY & ATTRIBUTION]` rule referenced a tool that was never implemented; removed pending a proper recovery-workflow design (see #193 follow-up).

## Tests and validation

- New `tests/contract/cli_handler_dist_smoke.test.ts` (92 lines) — spawns `node dist/cli/index.js <command>` as a real subprocess and asserts no `ERR_MODULE_NOT_FOUND` in stderr. Covers `schemas repair-plural-types`, `schemas audit`, `schemas list`, and `status`. Catches the class of regression from issue #304 that is invisible to TypeScript and source-level tests.
- New `tests/integration/graph_neighborhood_pagination.test.ts` (177 lines) — real HTTP server + real DB integration test. Seeds a center node with multiple spoke relationships, then asserts `limit` truncates results, `offset` skips correctly, `total_count` reflects the full set, and `has_more` flips when the final page is reached.
- New `tests/integration/update_schema_incremental_cold_start.test.ts` (130 lines) — covers the `ERR_NO_SCHEMA_FOR_ENTITY_TYPE` and `ERR_SCHEMA_MISSING_IDENTITY_CONFIG` cold-start paths against a real `schema_registry` row.
- New `tests/security/tenant_isolation_matrix.test.ts` (6 tests) — companion to the auth topology matrix. Seeds two users and asserts authenticated endpoints scope responses to the requesting user.
- New `src/shared/action_handlers/entity_handlers.test.ts` (32 tests, #343) — unit coverage for the pure ranking and bookkeeping helpers introduced by the search rework (`ENTITY_TYPE_KEYWORD_BOOST` magnitude lock-in, `shouldExcludeBookkeepingFromSearch`, `searchTokenMatchesEntityType`, `entityTypeKeywordBoost`, `buildEntityTypeFilterTokens`, `textTokensForEntityMatch`, `buildEntityLexicalSearchText`, `compareSearchRank`).
- New contract test block in `tests/contract/openapi_schema.test.ts` for `list_relationships` — asserts declared request fields and the closed `relationship_type` enum match the handler's `RelationshipTypeSchema`.
- Regression test in `src/services/canonical_markdown.test.ts` — asserts `## body` never appears when `content_field` is `"body"` in `frontmatter_content` mode (#262).

## Breaking changes

No breaking changes.
