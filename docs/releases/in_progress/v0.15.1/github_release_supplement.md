# v0.15.1

## Summary

This patch fixes five reported defects across the `@neotoma/client` store helpers, the issue-submission newline handling, the `retrieve_graph_neighborhood` related-entity shape, the `split_entity` MCP dispatch, and relationship pagination determinism — plus sibling cleanups to the cursor-hooks package, the relationship service, and the `copy:env` script. It also restores the `id` field on `retrieve_graph_neighborhood` `related_entities` items as a deprecated alias, un-breaking callers affected by an earlier silent `id` → `entity_id` rename (tracked in #1498).

## Highlights

- **`@neotoma/client` store helpers return real entity ids again.** `storeChatTurn`, `retrieveOrStore`, and `recordConversationTurn` now read entities from the top-level `/store` response shape, so they no longer hand back `entity_id: undefined` (resolves #316).
- **`retrieve_graph_neighborhood` related entities carry canonical `entity_id`.** Each `related_entities` item now exposes `entity_id` (matching `relationships[].source_entity_id` / `target_entity_id`), with the legacy `id` restored as a deprecated alias (resolves #276).
- **`split_entity` is now callable over MCP.** The tool was advertised everywhere but missing from the `executeTool` dispatch switch, so MCP calls returned `Unknown tool: split_entity`; the dispatch case is now wired (resolves #330).

## What changed for npm package users

- **`@neotoma/client` store helpers read the top-level store response shape (#316).** The `/store` endpoint (`StoreStructuredResponse`) and both `HttpTransport` and `LocalTransport` return entities at the top level (`{ success, replayed, entities: [...] }`); there is no `structured` wrapper on the live response. `storeChatTurn`, `retrieveOrStore`, and `recordConversationTurn` previously read `result.structured?.entities`, which is always `undefined`, so they silently returned `entity_id: undefined` for every entity they created. A shape-tolerant `extractStoredEntities()` reader now prefers top-level `result.entities` and falls back to `result.structured?.entities`; it is exported so downstream consumers can reuse it. The `StoreResult` type declares `entities` at the top level and keeps `structured` as a deprecated legacy field.
- **`retrieve_graph_neighborhood` related_entities now carry `entity_id` (#276).** Each item in the `related_entities` array exposes the canonical `entity_id`, matching `relationships[].source_entity_id` / `target_entity_id` and every other Neotoma response surface. The raw database `id` column is retained as a deprecated alias with the same value for one minor release; prefer `entity_id` and stop reading `id`.
- **`split_entity` is dispatchable as an MCP tool (#330).** `split_entity` shipped in the MCP tool registry, the contract mappings, the OpenAPI spec, the request schema, and the HTTP `POST /entities/split` handler, but the `executeTool` dispatch switch in `src/server.ts` had no `case "split_entity":`, so MCP calls fell through to the default branch and returned `MCP error -32601: Unknown tool: split_entity`. The dispatch case and a `splitEntity()` handler (mirroring `mergeEntities()`) are now in place; no new contract mapping, OpenAPI op, or schema was needed.

## API surface & contracts

- Additive only. `npm run openapi:bc-diff` against v0.15.0 reports **no breaking changes**.
- `openapi.yaml` declares both `entity_id` (canonical) and `id` (`deprecated: true`) on `related_entities` items; no request or response shape is narrowed and no field is removed.
- The `split_entity` fix binds an already-declared MCP tool / OpenAPI op to its dispatch; the contract surface is unchanged.

## Behavior changes

- `@neotoma/client` callers that read `entity_id` off the result of `storeChatTurn` / `retrieveOrStore` / `recordConversationTurn` now receive real ids instead of `undefined`.
- Callers reading `related_entities[].entity_id` now receive a value instead of `undefined`; callers still reading `related_entities[].id` continue to receive the same value (now formally deprecated).
- MCP clients can now call `split_entity` and receive a structured result instead of `Unknown tool`.
- `submit_issue` and `add_issue_message` bodies that arrive double-encoded (a real newline delivered as the two-character literal `\n`) are decoded into real newlines before being mirrored to GitHub and stored in the canonical Neotoma `conversation_message` record, so markdown no longer collapses into a single run-on block (resolves #1484). The decoder only runs when the body looks double-encoded (has a decodable escape and no real newline), so Windows paths and intentional literal `\\n` are left untouched.
- `list_relationships`, `retrieve_graph_neighborhood`, and `GET /relationships` paginate in a deterministic order. Previously these ordered only by the mutable `last_observation_at` column (and `retrieve_graph_neighborhood` had no `.order()` clause at all before `.range()`), so tied or unordered rows could move between pages across successive calls. A stable `relationship_key ASC` tiebreaker (the `relationship_snapshots` primary key) now fully determines order after `last_observation_at DESC` (resolves #368).

## Internal changes

- **Sibling cleanups (#1500).** Aligned the cursor-hooks package to the top-level entities response shape (same defect class as #316), applied the `relationship_key` tiebreaker inside `src/services/relationships.ts` for the service-level relationship query, and fixed a path typo in the `copy:env` script.

## Fixes

- #316 — `@neotoma/client` store helpers read `result.structured?.entities` (always `undefined`); now read entities from the top-level store response shape.
- #1484 — `submit_issue` / `add_issue_message` emitted literal `\n` sequences; bodies are now decoded into real newlines before mirroring to GitHub and storing.
- #276 — `retrieve_graph_neighborhood` `related_entities` exposed only the raw `id`; now exposes the canonical `entity_id`, with `id` retained as a deprecated alias.
- #330 — `split_entity` was advertised but not dispatched over MCP; the `executeTool` dispatch case is now wired.
- #368 — relationship pagination ordered only by mutable `last_observation_at`; a stable `relationship_key ASC` tiebreaker now makes pagination deterministic.
- #1500 — sibling cleanups: cursor-hooks entities shape, relationship-service tiebreaker, `copy:env` path typo.

## Tests and validation

- Extended `tests/integration/graph_neighborhood_pagination.test.ts` with a regression that boots the Express app and asserts every `related_entities` item carries a string `entity_id`, that `id === entity_id`, and that `entity_id` values match the relationship target ids exactly.
- Added `tests/contract/mcp_tool_dispatch_coverage.test.ts` as an advertised-but-unregistered guard: every tool returned by `buildToolDefinitions()` must have a matching case in the `executeTool` dispatch switch, so the "advertised yet undispatchable" regression class (#330) fails at test time.
- Added `tests/integration/relationship_query_determinism.test.ts` covering stable pagination order across successive calls.
- `@neotoma/client` tests assert `extractStoredEntities()` reads the real top-level shape first, plus the legacy nested fallback and the both-present precedence.
- Issue-newline tests cover the double-encoded body path and confirm real-newline, Windows-path, and intentional-literal-`\\n` bodies are left untouched.
- `npm run openapi:generate` regenerated `src/shared/openapi_types.ts`; `npm run type-check` and the contract suite pass.

## Security hardening

No security-sensitive surfaces touched. All six fixes are client-shape, newline-decoding, MCP-dispatch, and pagination-ordering changes; none alter authentication, authorization, proxy trust, local-dev scope, public-route registration, or guest-access policy. No advisories opened or referenced by this release.

## Breaking changes

No breaking changes.

Note: this release re-adds `id` as a deprecated alias on `retrieve_graph_neighborhood` `related_entities` items. Re-adding the field is additive, not breaking. The restoration un-breaks callers affected by an earlier silent `id` → `entity_id` rename that shipped while its release supplement stated "No breaking changes"; that release-process gap is tracked in #1498. The `id` alias is marked deprecated and will be removed in a future minor release after callers migrate to `entity_id`.
