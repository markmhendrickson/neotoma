# Test coverage review: v0.27.0

Range: `v0.26.0..HEAD` (15 commits, 419 files, mostly site and docs). Targeted run of the new tests: 7 files, 71 tests, all passed. Auth matrix: 18 passed, 1 skipped.

## Code review

Verdict: APPROVE. No BLOCKING findings.

Reviewed: `src/services/bearer_slots.ts`, auth gate changes in `src/actions.ts`, `src/services/oauth_key_gate.ts`, `src/reducers/observation_reducer.ts`, `src/services/correction_identity.ts`, `src/services/correction.ts`, `src/services/entity_population_certificate.ts`, `src/shared/action_handlers/entity_handlers.ts`.

- ADVISORY: `isCorrectionObservation` is a derived predicate; a new internal writer using priority 1000, specificity 1.0 and no `observation_source` would be treated as a correction. The header comment documents this and `POST /observations/create` is covered by an integration test.
- ADVISORY: the default `store` response narrowing is not flagged by `openapi:bc-diff`; it is declared in the supplement's Breaking changes section.
- NIT: `security:lint` reports 138 warnings, none new to the auth surface (test files and existing `LOCAL_DEV_USER_ID` references).

## Surfaces

| Surface | Classification | Test |
|---|---|---|
| Bearer handover slot (REST, `/mcp`, OAuth preflight) | Covers user-observable behavior end-to-end | `tests/integration/bearer_handover_slot.test.ts`, `tests/unit/bearer_slots.test.ts` |
| `merge_array` correction replacement, including `[]` clear and CLI `corrections create` | Covers user-observable behavior end-to-end | `tests/integration/correct_array_replaces.test.ts`, `tests/unit/observation_reducer_merge_array_correction.test.ts` |
| `store` compact `related_entities` and `include_related_snapshots` | Covers user-observable behavior end-to-end | `tests/integration/store_related_entities_compact.test.ts` |
| Entity list source-id lookups and page-bounded fragment fetch | Covers user-observable behavior end-to-end | `tests/integration/entity_list_source_lookups.test.ts`, `tests/performance/entity_list_page.bench.test.ts` |
| Recorded-cutover visibility plans | Covers user-observable behavior end-to-end | `tests/integration/entity_lifecycle_visibility_plans.test.ts` |
| Snapshot population certificate | Covers user-observable behavior end-to-end | `tests/unit/services/entity_population_certificate.test.ts`, `tests/integration/entity_read_contract.test.ts` |
| Site, docs viewer and illustrations | Covered by site contract and unit tests | `tests/unit/site_*.test.ts`, `tests/unit/docs_viewer_*.test.ts`, `tests/unit/seo_metadata.test.ts` |

No surface is BLOCKING. No new CLI commands were added.
