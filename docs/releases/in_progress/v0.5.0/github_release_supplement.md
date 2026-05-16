---
title: Github Release Supplement
summary: "v0.5.0 strengthens entity identity end-to-end: every schema now declares how its entities are identified, every resolve reports a structured `identity_basis`, and a new read-only duplicate detector surfaces candidate pairs for operator r..."
---

v0.5.0 strengthens entity identity end-to-end: every schema now declares how its entities are identified, every resolve reports a structured `identity_basis`, and a new read-only duplicate detector surfaces candidate pairs for operator review — while identity resolution itself stays deterministic and the entity hash is unchanged. The release also ships agent-shaped client helpers, MCP server-card introspection, new `--since` query filters, and site/install polish.

## What changed for npm package users

**CLI (`neotoma`, `neotoma api start`, …)**

- New verb: `neotoma entities find-duplicates --entity-type <type> [--threshold N] [--limit N]`. Read-only fuzzy duplicate scan; surfaces candidate pairs ranked by similarity with `matched_fields` and `score`. Confirm with the user, then hand off to `neotoma request --operation mergeEntities`. Never auto-merges.
- `neotoma stats` now supports `--by identity-basis` to break observations down by how their entity's identity was resolved (`schema_rule`, `heuristic_name`, `heuristic_fallback`, `target_id`, `schema_lookup`). Dashboards and operators can now see how much of the graph is resting on strong-identifier rules versus heuristic fallbacks.
- `neotoma entities list` and `neotoma observations list` gain `--since <timestamp>` filters (maps to `updated_since` / `created_since` on the query).
- `neotoma doctor` and `neotoma mirror` get additional self-check and diagnostic paths; `resolveBaseUrl` records transport meta so transport choice is auditable across `--api-only`, `--offline`, and env flags.
- `neotoma cli-instructions check` ships a new **Duplicate repair (on demand)** atomic rule so agent clients (Cursor, Claude, Codex) know to call the detector, confirm, and only then merge.

**Runtime / data layer**

- `/register_schema` now requires schemas to declare either `canonical_name_fields` (ordered precedence list of single-field or composite rules) or an explicit `identity_opt_out: "heuristic_canonical_name"` flag. For back-compat, the HTTP/CLI handler auto-injects the opt-out when neither is provided and logs a warning, so existing callers keep working. A startup log enumerates every schema currently relying on heuristic fallback.
- `canonical_name_fields` now accepts ordered rules with partial-match fallback: the resolver walks the ordered list and uses the first rule whose fields are all present (R1). Flat arrays keep working unchanged.
- Every resolve records a structured `identity_basis`, which flows through the `/store` response, the MCP tool response, and a new `observations_by_identity_basis` aggregation on `/stats`.
- New post-hoc fuzzy duplicate detector. Per-schema config via `duplicate_detection_fields` (snapshot fields compared beyond `canonical_name`) and `duplicate_detection_threshold` (similarity 0..1, default 0.85). Read-only; hands off to `/entities/merge` once an operator or agent confirms a pair.
- Bundled schemas (`src/services/schema_definitions.ts`) now declare identity explicitly: priority types (`person`, `company`, `contact`, `email_message`, `transaction`, `file_asset`, plus `task`, `note`, `project`, `location`) use real `canonical_name_fields`; the long tail carries `identity_opt_out: "heuristic_canonical_name"` so the gap is visible rather than silent.

**Shipped artifacts**

- `openapi.yaml` and regenerated `src/shared/openapi_types.ts` include the new `GET /entities/duplicates` endpoint, extended `Stats` (`observations_by_identity_basis`), and extended `StoreStructuredResponse` (`identity_basis`). New MCP tool `list_potential_duplicates` is wired through tool definitions, server dispatch, and `contract_mappings`.
- New JavaScript client helpers in `packages/client`: `diagnose.ts`, `helpers.ts`, `turn_report.ts` (plus exports from `index.ts`), aimed at turn-shaped agent workflows. Client README and `package.json` updated accordingly.

## API surface & contracts

- **New MCP tool:** `list_potential_duplicates(entity_type, threshold?, limit?, user_id?)` — read-only; never auto-merges.
- **New OpenAPI endpoint:** `GET /entities/duplicates?entity_type=…[&threshold=][&limit=][&user_id=]` returning ranked `candidates[]` with `entity_a`, `entity_b`, `score`, `matched_fields`, `entity_type`.
- **Extended response fields:**
  - `StoreStructuredResponse` now includes a structured `identity_basis` per resolved entity.
  - `Stats` now includes `observations_by_identity_basis: Record<IdentityBasis, number>`.
- **Query schema additions:** `EntitiesQueryRequestSchema` and `ObservationsQueryRequestSchema` accept `updated_since` / `created_since`.
- **Schema definition vocabulary (additive):** `canonical_name_fields` rule-list form, `identity_opt_out`, `duplicate_detection_fields`, `duplicate_detection_threshold`.
- **New MCP server-card surface** (`src/mcp_server_card.ts`) introspectable by clients.

## Behavior changes

- Agent clients that use `list_potential_duplicates` must confirm candidate pairs with the user (or repair plan) before calling `merge_entities`. The detector is strictly post-hoc and never runs during write-time identity resolution; write-time identity stays deterministic via `entity_type + canonical_name` (hash unchanged).
- `/register_schema` payloads that omit both `canonical_name_fields` and `identity_opt_out` still succeed but are logged (server-side warning) and appear under the "heuristic fallback" bucket in `neotoma stats --by identity-basis`. Operators should migrate these schemas to declared identity over time.
- `identity_basis` appears in `/store` responses, MCP tool responses, and stats. Agent clients can now tell, per observation, whether identity was derived from a schema rule or a heuristic — useful for auditing silent merges.
- The ordered `canonical_name_fields` form lets a schema express "prefer `email`; if absent, `full_name`; if absent, `first_name + last_name`" without changing how the hash is computed.

## Docs site & CI / tooling

- New **Duplicate repair (on demand)** atomic rule in `docs/developer/mcp/instructions.md`, `docs/developer/cli_agent_instructions.md`, and the sync anchor table `(.cursor/rules/developer_agent_instructions_sync_rules.mdc)`, propagated by `neotoma cli-instructions check` into the user-level `~/.cursor/rules`, `~/.claude/rules`, and `~/.codex` targets.
- New MCP tool description for `list_potential_duplicates` in `docs/developer/mcp/tool_descriptions.yaml`.
- `docs/subsystems/entity_merge.md` Section 7 rewritten to document R5 duplicate detection (schema-driven config, CLI/MCP surfaces, read-only constraint).
- `docs/developer/cli_reference.md` and `docs/subsystems/markdown_mirror.md` refreshed.
- `install.md` expanded with additional onboarding guidance (+53 lines).
- New integrations doc: `docs/integrations/smithery_external_url.md`.

## Internal changes

- Resolver rewrite: `src/services/entity_resolution.ts` now walks ordered `canonical_name_fields` rules and attaches a structured `identity_basis` to every `ResolverTrace`. Canonical-name derivation exposes a traced form (`deriveCanonicalNameFromFieldsWithTrace`).
- Schema registry validation in `src/services/schema_registry.ts` enforces R2; a new `logIdentityOptOutsAtStartup` method enumerates opt-outs at boot.
- New service `src/services/duplicate_detection.ts` with `stringSimilarity` (normalized Levenshtein, reusing `src/normalize.ts`'s `levenshtein`) and `findDuplicateCandidates`.
- MCP server (`src/server.ts`) gains a `listPotentialDuplicates` dispatch path. Tool definitions (`src/tool_definitions.ts`) add the schema; contract mappings (`src/shared/contract_mappings.ts`) tie the MCP tool to `listPotentialDuplicates` OpenAPI operationId and to the new CLI verb.
- `src/services/snapshot_computation.ts`, `src/services/observation_storage.ts`, `src/services/entity_queries.ts`, and `src/shared/action_handlers/entity_identifier_handler.ts` updated to carry `identity_basis` end-to-end.
- Agent-shaped helpers: `src/services/recent_record_activity.ts` feeds the CLI `recent`/`ingest` surfaces; `src/mcp_server_card.ts` exposes a structured server card.

## Fixes

- Site: `fix(site): clarify install/evaluate prompts and install page flow` and `fix(site): streamline permissions preflight for install and evaluate` (shipped commits on `main` since v0.4.5).
- Frontend illustration and site polish: `SitePageAlt`, `EntityGraphHero`, `MainApp`, `site/repo_info.json`.
- Canonical mirror and SQLite adapter: stability fixes in `src/services/canonical_mirror_git.ts` and `src/repositories/sqlite/sqlite_client.ts`.
- Schema registration back-compat default for `identity_opt_out` prevents legacy CLI/HTTP flows from breaking after R2.

## Tests and validation

- New unit tests: `tests/unit/duplicate_detection.test.ts` (stringSimilarity; candidate discovery with schema-declared fields, merged-entity exclusion, per-call threshold override), `tests/unit/mcp_server_card.test.ts`, `tests/unit/client_diagnose.test.ts`, `tests/unit/client_helpers.test.ts`, `tests/unit/client_turn_report.test.ts`.
- Updated integration and service tests: `tests/integration/dashboard_stats.test.ts` asserts `observations_by_identity_basis`; `tests/services/entity_resolution.test.ts` covers ordered-precedence and `identity_basis` threading; `tests/services/schema_registry_incremental.test.ts` and numerous `tests/integration/mcp_*.test.ts` fixtures updated for R2's mandatory identity declaration.
- OpenAPI types regenerated via `npm run openapi:generate` and `tests/contract/openapi_schema.test.ts` covers the new MCP-tool-to-operationId mapping.

## Breaking changes

- **Schema registration (softened):** Schemas MUST declare `canonical_name_fields` or `identity_opt_out`. For existing callers, the `/register_schema` HTTP/CLI handler injects `identity_opt_out: "heuristic_canonical_name"` as a back-compat default (with a warning log) — so no caller breaks at runtime. Operators should migrate schemas to explicit identity declarations over time; `neotoma stats --by identity-basis` and the startup opt-out log make the gap visible.
- **Entity hash:** unchanged. Identity resolution remains deterministic `entity_type + canonical_name`. No data migration is required.
