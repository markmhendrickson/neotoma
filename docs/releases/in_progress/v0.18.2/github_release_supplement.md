Two targeted bug fixes: entity resolution no longer accepts provenance labels as an entity's canonical name, and SOURCE_PRIORITY_IGNORED warnings now tell you exactly which fields are affected and why.

## Highlights

- **Offline/auto-discovered entities no longer get named after a provenance label.** Fields like `source_name`, `data_source`, and `origin` are now rejected as canonical name candidates alongside the existing `source` block — preventing unrelated entities from merging under a shared import label (e.g. every auto-resolved entity named "gmail import"). Fixed in `src/services/entity_resolution.ts`.
- **SOURCE_PRIORITY_IGNORED warnings are now self-diagnosing.** The warning message now names each written field that ignores `source_priority` and states its effective merge strategy (e.g. `'title' uses last_write`), so you know exactly which fields to target in `reducer_config.merge_policies` without re-reading the schema. Fixed in `src/services/source_priority_warning.ts`.

## What changed for npm package users

**Runtime / data layer**

- Entity resolution: `source_name`, `data_source`, and `origin` are now included in the provenance-label deny-list for canonical name derivation. If your store calls were producing entities with names like "gmail import" or "stale cache" after a background sync, this release corrects the root cause. No schema or client changes are required.
- `store_warnings[]` shape for `SOURCE_PRIORITY_IGNORED`: the `message` field now includes a per-field breakdown (`'field' uses strategy`) and a policy note distinguishing between "no schema" and "schema present but no `highest_priority` entry". The `code`, `observation_index`, `entity_type`, and `entity_id` fields are unchanged.

**Shipped artifacts**

- `openapi.yaml` — unchanged; no route or schema additions in this patch.
- `dist/` — updated for the two changed source files.

## API surface & contracts

No OpenAPI changes. The `store_warnings[]` entry for `SOURCE_PRIORITY_IGNORED` carries a richer `message` string but the same structure. Callers that parse only the `code` field are unaffected.

## Behavior changes

- Entities that were previously auto-named after `source_name`, `data_source`, or `origin` field values will resolve differently going forward. If you have existing entities with provenance-label names, you may want to re-merge or split them — no automatic migration is applied.
- The text of `SOURCE_PRIORITY_IGNORED` warnings changes. Callers that parse the `message` string for display or logging will see richer output.

## Fixes

- **#1821** — `fix(entity-resolution): reject source_name/data_source/origin as canonical_name`. Provenance labels could become an entity's identity when no better name field was present, causing unrelated entities to merge under a shared import label.
- **#1822** — `fix(store): enrich SOURCE_PRIORITY_IGNORED warning with field names and strategies`. The warning previously identified the entity type and source priority but did not name which fields were ignoring it or why, forcing callers to cross-reference the schema to understand the fix.

## Tests and validation

- `tests/services/entity_resolution.test.ts` — 58 new assertions covering the three new provenance-label rejections and their interaction with the existing deny-list.
- `tests/unit/source_priority_ignored_warning.test.ts` — 165 new unit assertions covering `ignoredFieldStrategies` and the enriched `buildSourcePriorityIgnoredWarning` message shape across no-schema, partial-schema, and `highest_priority` configurations.
- `tests/integration/store_source_priority_ignored_warning.test.ts` — 9 new integration assertions validating the end-to-end warning emission path.
- Security gates: G1 (`security:classify-diff`) sensitive=false, G2 (`security:lint`) 0 errors, G3 (`security:manifest:check` + `test:security:auth-matrix`) passed.

## Security hardening

Not security-sensitive. `npm run security:classify-diff -- --base v0.18.1 --head HEAD` reported `sensitive=false` (5 changed files, all in entity-resolution logic and warning formatting — no middleware, auth, or route-registration paths).

Security review artifact: [docs/releases/in_progress/v0.18.2/security_review.md](security_review.md) — verdict: **yes** (no findings, no residual risks).

No security-sensitive surfaces touched.

## Breaking changes

No breaking changes. No OpenAPI validation tightening, no request-shape changes, no field promotions or removals. Patch bump is correct per SemVer.
