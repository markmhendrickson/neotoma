v0.14.0 ships several user-facing improvements across search, ingestion, and agent ergonomics: entity search now ranks results by entity-type intent and hides chat bookkeeping from product results; issue-filing consent is remembered across sessions via a stored preference entity; graph neighborhood traversal is paginated; the `scrape_chatgpt_workout` skill correctly wires REFERS_TO provenance; `update_schema_incremental` returns structured errors instead of opaque failures on cold-start types; and a dist-level CLI import bug that broke `neotoma schemas repair-plural-types` is fixed.

## Highlights

- **Smarter entity search.** When a query token names an entity type (e.g. "plans", "tasks", "transactions"), `retrieve_entities` now boosts that type's results by 280 points and filters by type instead of matching the token against snapshot text — so "newest plans" actually surfaces plans, not chat messages mentioning the word "plans". Singular/plural normalization included.
- **Chat bookkeeping no longer pollutes product search.** The Inspector header search and `/search` automatically exclude `conversation`, `conversation_message`, and related bookkeeping entity types unless the caller explicitly filters by one of those types. Pass `excludeBookkeeping: true` on `retrieve_entities` to apply the same filter from any caller.
- **Issue-filing preference persists across sessions.** On first encounter, agents ask once and store your choice (`always` / `ask` / `never`) as a `preference` entity so future sessions skip the prompt. `neotoma issues config --mode` still sets the runtime flag; the preference entity is the cross-session layer that feeds it.
- **Paginate large graph neighborhood results.** `retrieve_graph_neighborhood` and `POST /retrieve_graph_neighborhood` now accept `limit` (default 100, max 500) and `offset` parameters and return `total_count` and `has_more`, so callers can page through densely-connected nodes without truncation.
- **`neotoma schemas repair-plural-types` works from a global or npx install.** A dynamic import in the compiled CLI used the wrong relative path (`../../services/` instead of `../services/`), which silently failed after installation. Fixed, with new dist-level smoke tests covering this class of bug going forward.

## What changed for npm package users

**CLI (`neotoma`)**

- `neotoma schemas repair-plural-types` — fixed: the dist-level dynamic import path for `plural_type_repair` was one directory level off (`../../services/plural_type_repair.js` instead of `../services/plural_type_repair.js`). The bug was invisible to TypeScript compilation and source-level tests because both resolve from `src/`; only a subprocess spawned against the compiled `dist/` catches it. New smoke tests at `tests/contract/cli_handler_dist_smoke.test.ts` cover this class of regression for `schemas repair-plural-types`, `schemas audit`, `schemas list`, and `status`.

**Runtime / data layer**

- **Entity search ranking and bookkeeping exclusion (`retrieve_entities`, `POST /retrieve_entities`)** — substantial rework of `src/shared/action_handlers/entity_handlers.ts` (~430 lines):
  - New `ENTITY_TYPE_KEYWORD_BOOST = 280`. When a search token equals an entity_type's name (canonical or singular-normalized via `suggestSingular`), matching entities of that type get ranked 280 points higher in the result list.
  - New `excludeBookkeeping` parameter on `retrieve_entities` (boolean, default false on direct API calls; default true for Inspector header and `/search`). When set, `conversation`, `conversation_message`, and related `BOOKKEEPING_ENTITY_TYPES` are omitted from results.
  - New `buildEntityTypeFilterTokens(searchTokens, knownEntityTypes)` and `textTokensForEntityMatch(searchTokens, typeFilterTokens)` helpers: when the query names a known entity_type, that token is removed from snapshot-text matching and becomes a type filter instead. The remaining tokens still match snapshot content.
  - New `buildEntityLexicalSearchText(canonicalName, snapshot, rawFragmentText)` builds the canonical lexical haystack (canonical name + snapshot + raw fragments) used for ranking.
  - `lexicalSearchEntityIds` now resolves active entity types from `schema_registry` to drive the type-filter logic; falls back to a warning log if the schema registry query fails.
  - Net effect: a query like "newest plans" now narrows the candidate query to `entity_type='plan'` and boosts ranking accordingly, rather than fuzzy-matching the literal string "plans" against every entity's snapshot.
- **`retrieve_graph_neighborhood` pagination** — accepts `limit` (1–500, default 100) and `offset` (default 0) query parameters. Response now includes `total_count` (total relationships for the node before pagination) and `has_more`. Use these to page through high-degree nodes.
- **`list_relationships` filter expansion** — `src/actions.ts`: the handler now supports `source_entity_id` and `target_entity_id` as direct filter params in addition to the legacy `entity_id + direction` pattern. Pagination (`limit`, `offset`) added. The request schema requires at least one of `entity_id`, `source_entity_id`, `target_entity_id`, or `relationship_type`. Optional `user_id` filter added. Non-breaking addition.
- **`update_schema_incremental` cold-start handling** — when called for an entity_type with no registered or code-defined schema, previously threw an opaque `McpError(-32603)`; now returns a structured non-throwing response with `error_code: ERR_NO_SCHEMA_FOR_ENTITY_TYPE`, `no_schema_for_entity_type: true`, and a `hint` pointing to `register_schema` and `analyze_schema_candidates`. When the entity_type has an existing schema that lacks both `canonical_name_fields` and `identity_opt_out`, the R2 error is now surfaced as `ERR_SCHEMA_MISSING_IDENTITY_CONFIG` with a hint to call `register_schema` with a complete schema definition.
- **Profile mirror render correctness (`rebuildProfile` / `mirrorEntity`)** — `mirrorEntity` now dispatches to `renderProfileEntity` when `render_mode` is `frontmatter_content` or `content_only`, matching `rebuildProfile` behavior. Previously the live-write path always called `renderEntityMarkdown`, ignoring `render_mode`, `frontmatter_fields`, and `content_field`. When `content_field` was `"body"`, this produced a spurious `## body` heading in the output. Fixed via dynamic import of `renderProfileEntity` from `canonical_markdown.js`.

**Shipped artifacts**

- `openapi.yaml` — 52 lines added: `POST /retrieve_graph_neighborhood` gains `limit`, `offset`, `user_id` request fields and `total_count`, `has_more`, `node_id`, `node_type`, `entity`, `relationships`, `related_entities`, `observations`, `sources` response fields.
- `.dockerignore` — substantially trimmed: build context reduced from ~15 GB to ~50 MB by excluding non-source dirs (`backups`, `data_backups`, `tmp`, `site_pages`, `writ`, `packages`, `mcp`, `public`, `frontend`, `.claude`, `.vitest`). Faster image builds; no runtime behavior change.

## API surface & contracts

**OpenAPI** — no breaking changes. 12 non-breaking additions to `POST /retrieve_graph_neighborhood`: `limit`, `offset`, `user_id` request fields; `total_count`, `has_more`, `node_id`, `node_type`, `entity`, `relationships`, `related_entities`, `observations`, `sources` response fields. The `related_entities` items are annotated with `entity_id` (not raw `id`) as the canonical identifier. `npm run openapi:bc-diff -- --base v0.13.0 --head HEAD` reports no breaking changes.

**Request schemas** — `ListRelationshipsRequestSchema` (`src/shared/action_schemas.ts`) refactored: `entity_id` becomes optional, `source_entity_id` / `target_entity_id` / `user_id` added as optional, `.refine()` requires at least one identifying field, `limit` is bounded `1..500`, `offset` bounded `≥ 0`. Existing callers passing only `entity_id` continue to work.

**MCP tool surface** — `retrieve_graph_neighborhood` tool gains `limit` (integer, 1–500, default 100) and `offset` (integer, min 0, default 0) parameters.

## Behavior changes

- **Entity search results reorder.** Queries containing entity-type names ("plans", "tasks", "transactions") will now return type-filtered results ranked by a 280-point keyword boost, where previously they returned mixed-type fuzzy matches. Snapshots and downstream callers that depended on the old fuzzy behavior may see different result orderings or smaller result sets when the query happens to name a type.
- **Inspector header search hides chat bookkeeping by default.** Conversations and conversation messages no longer appear in product search results unless the caller explicitly filters by `conversation` or `conversation_message`.
- **`neotoma schemas repair-plural-types`** now executes its handler correctly from a global `npm install -g neotoma` or `npx neotoma` invocation. Previously the dynamic import silently threw `ERR_MODULE_NOT_FOUND` when invoked against the dist tree.
- **`update_schema_incremental`** on an unregistered type returns a structured error with `hint` instead of an uncaught internal error. Callers should check for `error_code: ERR_NO_SCHEMA_FOR_ENTITY_TYPE` and redirect to `register_schema`.
- **`mirrorEntity` profile render** — `## body` section heading no longer appears spuriously when `content_field` is `"body"` in `frontmatter_content` mode.
- **Graph neighborhood traversal** — responses are now paginated; callers relying on all relationships being present in a single response must check `has_more` and page when `true`.

## Agent-facing instruction changes (ship to every client)

The MCP instructions (`docs/developer/mcp/instructions.md`) shipped with this release include three changes:

1. **Issue-filing consent uses a stored preference entity.** The `[ISSUE REPORTING]` section's mode-discovery flow now first calls `retrieve_entities` with `entity_type: "preference"` and filter `title: "issue_filing_consent"` before prompting the user. If a matching entity exists, its `value` field (`always` / `ask` / `never`) resolves the mode without re-prompting. On first consent, the agent persists both the preference entity (cross-session memory) and `neotoma issues config --mode` (runtime config flag). The QA-driven filing section mirrors this flow.

2. **`describe_entity_type` added as the first option for schema-check.** The schema-check rule in `[ENTITY TYPES & SCHEMA]` now lists `describe_entity_type` as the preferred introspection call (returns the full `SchemaDefinition`: fields, `canonical_name_fields`, `temporal_fields`, `reference_fields`, `aliases`, `merge_policies`) before falling back to `get_schema_recommendations` or a snapshot inspection.

3. **Blocked-plan recovery at session start.** A new rule in `[IDENTITY & ATTRIBUTION]` requires agents to call `check_blocked_plans` immediately after `get_session_identity` succeeds. If `unblockable_plans` is non-empty, each plan is surfaced to the user (plan title + linked issue number). Agents may skip this call only when the user explicitly requests it.

## Plugin / hooks / SDK changes

None.

## Security hardening

The diff classifier (`npm run security:classify-diff -- --base v0.13.0 --head HEAD`) reports `sensitive=true` because `openapi.yaml` and `src/actions.ts` appear in the monitored surface set. Inspection of the actual changes:

- **`openapi.yaml`** — adds pagination and response-enrichment fields to `POST /retrieve_graph_neighborhood`. No changes to security blocks, protected routes, or auth scheme declarations.
- **`src/actions.ts`** — the `list_relationships` handler was refactored to support `source_entity_id` / `target_entity_id` direct filter params and pagination. No changes to `isLocalRequest`, `forwardedForValues`, `isProductionEnvironment`, or any auth-gating logic. The refactored handler path is user-scoped through the same `getAuthenticatedUserId` path as before.
- **`src/shared/action_handlers/entity_handlers.ts`** — search ranking and bookkeeping-exclusion changes. The new helpers (`shouldExcludeBookkeepingFromSearch`, `searchTokenMatchesEntityType`, `entityTypeKeywordBoost`, `buildEntityTypeFilterTokens`) are pure query/ranking functions with no auth surface. Query construction continues to filter by `user_id` through the standard authenticated path.

Security review: [`docs/releases/in_progress/v0.14.0/security_review.md`](security_review.md) — verdict `yes`, no security-relevant findings.

Post-deploy probes: [`docs/releases/in_progress/v0.14.0/post_deploy_security_probes.md`](post_deploy_security_probes.md) (populated after Step 5).

Gate results:
- G1 `npm run security:classify-diff` — sensitive=true (structural; no actual auth-surface changes).
- G2 `npm run security:lint` — 0 errors, 112 warnings (all pre-existing unauth-public-route warnings, none introduced by this release).
- G3 `npm run security:manifest:check` — in sync (108 routes, identical to v0.13.0). `npm run test:security:auth-matrix` — 16 passed, 1 skipped.
- G4 `npm run security:ai-review` — review file filled, sign-off `yes`.

## Docs site & CI / tooling

- `docs/subsystems/entity_field_semantics.md` — new canonical doc (141 lines) defining `source` (originating system slug), `source_url` (URL), `source_ref` (upstream external ID), and `data_source` (audit string). Includes canonical slug table and forbidden-value examples.
- `docs/subsystems/record_types.md` — dataset `source` description tightened to reference `entity_field_semantics.md`.
- `docs/developer/mcp/instructions.md` — adds a source-field rule to the agent instructions: source is a slug, never a URL or person name; use `source_url` and `source_ref` for those.
- `docs/doc_dependencies.yaml` — registers `entity_field_semantics.md` as upstream for `schema_definitions.ts`, `instructions.md`, and `record_types.md`.
- `src/services/schema_definitions.ts` — inline comments on the `source` fields of `income`, `note`, and `agent_task` declarations now point to the canonical doc.
- `docs/testing/automated_test_catalog.md` regenerated to include the three new test files.

## Internal changes

- `scrape_chatgpt_workout` skill (`.claude/skills/scrape_chatgpt_workout/SKILL.md`, 350 lines) added with explicit REFERS_TO wiring from stored `workout_session` entities back to the source conversation entity. Phase 3 preamble now requires `conversation_entity_id` to be set before the store loop; Step 3.3 calls `create_relationships` in batch with all collected `workout_session` entity_ids; Step 4.2 stores the returned entity_id as `conversation_entity_id` for downstream use.

## Fixes

- **`neotoma schemas repair-plural-types` dist import** (#304, #311) — import path `../../services/plural_type_repair.js` → `../services/plural_type_repair.js` in the compiled CLI. Invisible to TypeScript and source-level tests; caught only by running `node dist/cli/index.js`.
- **`update_schema_incremental` opaque error on unregistered types** (#269) — replaced uncaught `McpError(-32603)` with structured `ERR_NO_SCHEMA_FOR_ENTITY_TYPE` / `ERR_SCHEMA_MISSING_IDENTITY_CONFIG` responses with actionable hints.
- **`mirrorEntity` spurious `## body` heading** (#262) — `mirrorEntity` live-write path now dispatches to `renderProfileEntity` for profile render modes, matching `rebuildProfile` behavior.

## Tests and validation

- New `tests/contract/cli_handler_dist_smoke.test.ts` (92 lines) — spawns `node dist/cli/index.js <command>` as a real subprocess and asserts no `ERR_MODULE_NOT_FOUND` in stderr. Covers `schemas repair-plural-types`, `schemas audit`, `schemas list`, and `status`. Catches the class of regression from issue #304 that is invisible to TypeScript and source-level tests.
- New `tests/integration/graph_neighborhood_pagination.test.ts` (177 lines) — real HTTP server + real DB integration test. Seeds a center node with multiple spoke relationships, then asserts `limit` truncates results, `offset` skips correctly, `total_count` reflects the full set, and `has_more` flips when the final page is reached.
- New `tests/integration/update_schema_incremental_cold_start.test.ts` (130 lines) — covers the `ERR_NO_SCHEMA_FOR_ENTITY_TYPE` and `ERR_SCHEMA_MISSING_IDENTITY_CONFIG` cold-start paths against a real `schema_registry` row.
- Regression test in `src/services/canonical_markdown.test.ts` — asserts `## body` never appears when `content_field` is `"body"` in `frontmatter_content` mode (#262).

## Breaking changes

No breaking changes.
