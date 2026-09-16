# Test coverage review — v0.23.1

`/review` pass over `v0.23.0..HEAD`.

Reviewing v0.23.0..HEAD — 9 files, +1612/−20 lines. Surfaces: data layer
(`store_warning_rule.ts`, `schema_registry.ts`), server route handlers
(`actions.ts`, `server.ts`), unit/integration tests, eval-harness scenario,
test catalog. High-risk: no (fail-open bug fix on an advisory warning path;
no auth, contract, or route-registration surface touched).

## Scope

Single commit: `ce636611d` — "fix(store): a schema store-warning rule must
never block a write" (#2409). Fixes a `TypeError` that escaped a schema-driven
`store_warnings` evaluation and surfaced to callers as `DB_QUERY_FAILED`,
making three live entity types (`skill`, `agent_definition`,
`operator_profile`) completely unwritable — root cause of issues #2067,
#2165, #2170.

## Pre-PR checklist

1. `openapi.yaml` edited first — N/A (no request/response shape change; `code`
   is already `type: string`, no enum to widen).
2. `contract_mappings.ts` updated for new tool/command — N/A (no new
   MCP tool, CLI command, or operationId).
3. `npm test -- tests/contract/` passes — ✓ (206/206 passed).
4. New CLI commands in coverage guard — N/A.
5. MCP/CLI agent-instruction parity — N/A (no instruction-doc changes).
6. Runtime overrides `flag > env > default` — N/A.
7. New env vars `NEOTOMA_`-prefixed — N/A.
8. Error hints as structured fields — ✓ (`STORE_WARNING_RULE_NOT_EVALUATED`
   message is a plain string per the existing `store_warnings[].message`
   contract, consistent with sibling codes `AUTO_LINK_RETRACTION_FAILED` etc.)
9. Tightening-change hint obligation — N/A (no validation tightened; this
   fix un-breaks a previously-broken write path, strictly loosens failure
   mode from 500 to 200-with-warning).
10. `openapi:bc-diff` reviewed — ✓ ("No breaking changes detected.")
11. `legacy_payloads/replay.test.ts` passes — ✓ (16/16 passed).
12. New request bodies declare `additionalProperties: false` — N/A.
13. New response fields declared in `openapi.yaml` — N/A (`store_warnings[]`
    already declared; `code` is untyped `string`, no enum to update).
14. Release-visible changes documented in supplement — ✓ (this release).
15. `schema_agnostic_design_rules.md` re-read for per-type behavior — ✓; the
    new evaluator (`src/services/store_warning_rule.ts`) takes no
    `entity_type` parameter and contains no per-type branching. It operates
    purely on the declared rule shape and resolved field values.
16. Determinism preserved — ✓; pure function, no `Date.now()`/`Math.random()`,
    no I/O, no unstable iteration.
17. Idempotency / transactional writes — N/A (no ingestion-path change; this
    is a read-only evaluation of already-resolved fields prior to the commit
    decision).
18. No new PII in logs/metrics/errors — ✓; the diagnostic message echoes only
    the schema-declared rule `code` and structural facts about the rule shape
    (field names, key names) — no entity data.
19. Renamed files snake_case — N/A (no renames).
20. Security gate results — ✓ `sensitive=false` (see security_review.md).
21. New Express routes in manifest — N/A (no new routes).
22. No bare proxy/host header reads — N/A.
23. User-facing-surface coverage — ✓; see Test coverage below.
24. npm script naming convention — N/A.
25. No unsorted `Object.keys()`/`Map`/`Set` iteration in stored/output paths
    — ✓; `Object.keys(condition)` in `evaluateStoreWarningRule` is used only
    to compute a `filter()` over declared vs. supported keys for a diagnostic
    message, not for output ordering or ID derivation.

## Architectural review

**State Layer boundaries:** No strategy/orchestration logic added; this is a
schema-declared advisory-rule evaluator, fully within State Layer scope.

**Schema-agnostic design:** Clean. `evaluateStoreWarningRule` takes
`(rule, fields)` with no `entity_type` parameter and no per-type branching.
Both call sites (`actions.ts`, `server.ts`) were previously duplicating an
inline `rule.fields.some(...)` check; this change consolidates both into the
one shared evaluator — the "extend the mechanism that already generalizes"
pattern.

**Determinism:** Pure function, verified — no `Date.now()`, `Math.random()`,
or unstable iteration in `src/services/store_warning_rule.ts`.

**Immutability:** N/A — no observation/source mutation in this diff.

**Error handling:** The new `STORE_WARNING_RULE_NOT_EVALUATED` code follows
the existing `store_warnings[]` non-fatal-warning contract (HTTP 200, `Retry?
No`). The diagnostic message explicitly avoids claiming the entity was
persisted (dry runs and independently-failed stores reach the same path),
which the unit test suite verifies directly (`does not claim the entity was
persisted`).

**Regression discipline:** The `classifyFieldList` "absent vs. malformed"
distinction directly targets a documented prior defect (a salvaging filter
that silently dropped non-string entries from a field list instead of
reporting the list as malformed). The commit message states this
was verified failing-red before the fix: "reintroducing the salvaging filter
turns 7 of the new unit cases red... restoring makes 26 green."

## Test coverage

- `tests/unit/store_warning_rule.test.ts` — 26 cases covering both rule
  spellings (`fields` flat list, `condition.missing_all_of` declarative),
  fail-open behavior for malformed/unrecognized shapes, and the
  absent-vs-malformed distinction that is the crux of the fix.
- `tests/integration/store_warning_condition_rule.test.ts` — 9 cases
  exercising the real HTTP `/store` path and the MCP `executeTool` store
  path, including a dry-run (`commit: false`) case matching the original
  incident (#2165 was first caught on a dry run) and an end-to-end
  skill-registration test tying the fix back to production impact.
- `packages/eval-harness/scenarios/store_warning_rule_contract.scenario.yaml`
  — synthetic, cassette-replayed eval scenario (no PII, no recorded user
  data); exercises declarative, flat, unknown, partial, empty, and mixed
  field-list warning rules end to end via `register_schema` + `store`.
- All 35 unit+integration tests pass; full `tests/contract/` suite (206
  tests) passes; `legacy_payloads/replay.test.ts` (16 tests) passes;
  `cli_command_coverage_guard.test.ts` passes; `test:security:auth-matrix`
  (18 passed, 1 pre-existing skip) passes.

## Findings

One ADVISORY finding, fixed in this release-prep pass (not blocking):

- **[ADVISORY] doc-completeness** — `docs/reference/error_codes.md`'s Store
  Warnings table did not list the new `STORE_WARNING_RULE_NOT_EVALUATED`
  code. Fixed: added a table row and a detailed `**`code`**` — section with
  example, mirroring the existing `AUTO_LINK_RETRACTION_FAILED` entry's
  format.

No BLOCKING findings.

## Code review

--- Review Summary ---
Base..Head: v0.23.0..HEAD
Files reviewed: 9
Blocking: 0
Advisory: 1 (fixed in this pass)
Nit: 0

Verdict: **APPROVED**
