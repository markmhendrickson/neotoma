# Test coverage review — v0.21.1

`/review` pass over `v0.21.0..HEAD`, run as part of release preparation.

## Scope

Reviewing v0.21.0..HEAD — 3 files changed, +166/−4 lines.

Surfaces: data layer (schema registry — `updateSchemaIncremental` metadata carry-forward), tests, generated test catalog. High-risk: no. No changes to `openapi.yaml`, CLI, MCP tools, Express routes, or the reducer/observation/entity ingestion pipeline.

## Pre-PR checklist (change_guardrails_rules.md)

1. `openapi.yaml` edited first — **— N/A** (no API surface changes)
2. `contract_mappings.ts` updated for new `operationId`/MCP tool/CLI command — **— N/A** (no new surface)
3. `npm test -- tests/contract/` passes — **✓** (160/160 passing, verified in this review)
4. New top-level CLI commands in `cli_command_coverage_guard.test.ts` — **— N/A** (no new CLI commands)
5. MCP and CLI agent-instruction parity — **— N/A** (no agent-instruction changes)
6. Runtime overrides follow `flag > env > default` — **— N/A**
7. New env vars `NEOTOMA_`-prefixed, read in `preAction` — **— N/A**
8. Error hints as structured fields, not concatenated into `message` — **— N/A** (no new error paths)
9. Tightening-change hint obligation — **— N/A** (no validation tightening)
10. `openapi:bc-diff` reviewed; breaking entries named in supplement — **✓** (ran `npm run openapi:bc-diff -- --base v0.21.0 --head HEAD`: "No breaking changes detected"; supplement's Breaking changes section states `None`, consistent)
11. `legacy_payloads/replay.test.ts` passes — **✓** (part of the 160 contract tests)
12. New top-level request bodies declare `additionalProperties: false` — **— N/A**
13. New response fields declared in `openapi.yaml` — **— N/A**
14. Release-visible changes documented in supplement under `docs/releases/in_progress/v0.21.1/` — **✓**
15. `schema_agnostic_design_rules.md` re-read for per-type behavior — **✓** re-read; the fix operates generically on `SchemaMetadata` regardless of `entity_type` — no new per-type branch, no hardcoded entity-type list.
16. Determinism preserved — **✓** (no random IDs, no `Date.now()`; the merge is a pure object-spread of two plain objects, no iteration-order dependency since object spread of named keys is not affected by property enumeration order for the purposes of the resulting value)
17. Idempotency / transactional ingestion — **— N/A** (no ingestion/observation writes in this diff; schema-registry `register()` is a distinct write path, already covered by existing tests, unaffected by this change's shape)
18. No new PII in logs/metrics/errors — **✓** (no new log lines; `mergedMetadata` values are schema configuration — `guest_access_policy` enum values, `icon` slugs — not personal data)
19. Renamed files snake_case — **— N/A** (no renames)
20. Security gate results recorded — **✓** (`classify-diff` → `sensitive=false`; full lane run anyway given the `guest_access_policy` access-control relevance — see `security_review.md`, verdict `yes`)
21. New Express routes in `protected_routes_manifest.json` — **— N/A** (no new routes; 116 routes unchanged)
22. No bare `req.socket.remoteAddress`/XFF/Host reads outside canonical helpers — **— N/A** (`src/actions.ts` not touched)
23. User-facing-surface coverage:
    - Metadata carry-forward on incremental schema update — **✓** `schema_incremental_metadata_preservation.test.ts` (4 tests): carries `guest_access_policy` forward on an unrelated field add (the exact #1977 symptom, reproduced against a realistic `SchemaRegistryEntry` fixture with `guest_access_policy: "read_only"`), preserves an unrelated key (`icon`), explicit single-key override without dropping others, and the undefined-prior-metadata edge case yielding `{}` not `undefined`. All 4 verified to exercise `register()`'s actual call arguments via a spy, not just the return value.
24. npm script naming convention — **— N/A** (no new/renamed npm scripts)
25. No unstable iteration order in stored/emitted/ID-input paths — **✓** (the merge is `{...a, ...b}` on two named-key objects — result value does not depend on enumeration order for objects without conflicting numeric-like keys, and `SchemaMetadata` keys are all named string properties, not iterated collections)

## Architectural review

**State Layer boundaries:** No strategy, filtering-suggestion, orchestration, or scheduled-execution logic added. This is a pure data-integrity fix in the schema-registry service's existing incremental-update path — no new decision logic about what a signal means, purely a "don't drop this field when writing the new row" fix.

**Schema-agnostic design:** No new `switch (entity_type)` or `if (entityType === "X")` branches. The fix operates identically across every entity type, keyed only by whatever `entity_type` the caller already specified — no type-specific carve-outs added or needed.

**Determinism:** Confirmed clean — see checklist item 16 above. The merge is a pure function of its two inputs with no randomness or wall-clock dependency.

**Immutability:** No `UPDATE` on `observations` or `sources` rows. Schema-registry rows are a distinct, non-observation/non-source table; this diff does not change the write pattern (still register-new-version, not update-in-place) — it only changes what data is included when writing that new version.

**Auth surface:** `src/actions.ts` is not touched. No route registration, no middleware, no `LOCAL_DEV_USER_ID` reference. The affected `guest_access_policy` field is a downstream *consumer* of schema metadata (resolved elsewhere, at guest-read time) — this diff only fixes what gets written to that field during a specific write path, not how it is read or enforced.

**Error handling:** No new error paths in this diff. No tightened validation.

## Product/UX and principles alignment

- **10.1 Truth Before Experience:** The fix directly serves this principle — before the fix, a schema update silently discarded state (access-control metadata) without any signal to the operator or caller. The metadata is now preserved by default, restoring truthful state carry-forward.
- **Silent behavior changes:** None introduced. The prior behavior (`metadata` silently reset to `{}`) was itself the silent-behavior-change bug being fixed; this diff removes a silent failure mode rather than introducing one.
- **Discoverability:** No new capability requiring documentation — this is an internal correctness fix to an existing action's existing metadata-preservation contract (the doc comment on `updateSchemaIncremental`'s `metadata` option already states the preserve-by-default behavior, which is now actually true).

## Documentation completeness

- `docs/testing/automated_test_catalog.md` — regenerated via `npm run generate:test-catalog`, not hand-edited; verified current via `npm run validate:test-catalog` (up to date). ✓
- No subsystem doc update required: `docs/foundation/schema_agnostic_design_rules.md` already documents `merge_policies`/declaration-driven behavior generically and does not need a per-bug-fix update; no new `SchemaMetadata` field, CLI flag, or MCP tool was added that would require a new doc entry.
- No new error code registry entry needed (no new `ERR_*` constants in this diff).

## Supplement accuracy

Cross-checked every claim in `github_release_supplement.md` against the code:
- `updateSchemaIncremental` metadata merge — confirmed present at `src/services/schema_registry.ts:1443-1449`, matches described semantics (preserve current active row's metadata by default, explicit `options.metadata` layered on top).
- `guest_access_policy` resolution from the active row's `SchemaMetadata` — confirmed via `SchemaMetadata` interface definition (`schema_registry.ts:570-586`) and the doc comment on the new `metadata` option (`schema_registry.ts:1226-1231`) describing exactly this mechanism.
- `openapi:bc-diff` output ("No breaking changes detected") reconciled with the supplement's Breaking changes section. ✓
- Breaking changes section present and reads correctly (`None.` with justification). ✓
- Test count (4 new unit tests) matches `tests/unit/schema_incremental_metadata_preservation.test.ts` content exactly.

## Code review

`/review v0.21.0..HEAD` executed inline as part of this release-prep pass (see conversation). Verdict: **APPROVED** — zero blocking findings, zero advisory findings. Type-check, format-check, full contract suite (160/160), and the 4 new regression tests all verified passing directly. The 3 pre-existing failures in `tests/integration/cli_to_mcp_schemas.test.ts` when run in isolation were confirmed to reproduce identically against an unmodified v0.21.0 baseline in a separate worktree — pre-existing test-isolation flakiness unrelated to this diff, not a regression.

## Findings

No findings. All checklist items are either satisfied or correctly marked N/A; all architectural, product-principles, and documentation-completeness checks pass. The fix is narrowly scoped, its regression tests were verified to target the exact original failure mode (#1977), and no new capability, surface, or behavior beyond the metadata-preservation fix itself was introduced.

--- Review Summary ---
Base..Head: v0.21.0..HEAD
Files reviewed: 3
Blocking: 0
Advisory: 0
Nit: 0

Verdict: APPROVED
