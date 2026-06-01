# v0.15.1

## Summary

This patch makes `retrieve_graph_neighborhood` expose the canonical `entity_id` on its `related_entities` items while restoring the legacy `id` field as a deprecated alias, so callers can correlate related entities against `relationships[].source_entity_id` / `target_entity_id` and existing `id`-keyed callers keep working.

## What changed for npm package users

- **`retrieve_graph_neighborhood` related_entities now carry `entity_id`.** Each item in the `related_entities` array exposes the canonical `entity_id`, matching `relationships[].source_entity_id` / `target_entity_id` and every other Neotoma response surface (resolves #276). The raw database `id` column is still present as a deprecated alias with the same value for one minor release; prefer `entity_id` and stop reading `id`.

## API surface & contracts

- Additive only. `openapi.yaml` declares both `entity_id` (canonical) and `id` (`deprecated: true`) on `related_entities` items; no request or response shape is narrowed and no field is removed.
- This patch also restores the `id` field that v0.15.0 silently dropped from `related_entities` when it renamed `id` → `entity_id` (bundled, undocumented, in the #262 mirror change). Re-adding `id` un-breaks any v0.15.0 caller that depended on the legacy field.

## Behavior changes

- Callers reading `related_entities[].entity_id` now receive a value instead of `undefined`.
- Callers still reading `related_entities[].id` continue to receive the same value (now formally deprecated).

## Fixes

- #276 — `retrieve_graph_neighborhood` `related_entities` exposed only the raw `id`; now exposes the canonical `entity_id`, with `id` retained as a deprecated alias.

## Tests and validation

- Extended `tests/integration/graph_neighborhood_pagination.test.ts` with a regression that boots the Express app and asserts every `related_entities` item carries a string `entity_id`, that `id === entity_id`, and that `entity_id` values match the relationship target ids exactly.
- `npm run openapi:generate` regenerated `src/shared/openapi_types.ts`; `npm run type-check` and the contract suite pass.

## Breaking changes

No breaking changes. Re-adding the `id` alias is additive; the field is now marked deprecated and will be removed in a future minor release after callers migrate to `entity_id`.
