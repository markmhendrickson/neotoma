This release fixes an advisory schema-warning rule that made three entity types completely unwritable on affected instances.

## Highlights

- **Fixes a store-blocking bug in schema-declared `store_warnings` rules.** A `store_warnings` rule spelled with the declarative `condition: { missing_all_of: [...] }` shape threw an uncaught `TypeError` instead of evaluating, which escaped the store handler and surfaced to every caller as `HTTP 500 DB_QUERY_FAILED`. Three live schemas on the operator's instance carried this shape — `skill`, `agent_definition`, and `operator_profile` — making every write of those types fail, including `commit: false` dry runs.

## What changed for npm package users

**Runtime / data layer**

- `/store` (both the HTTP handler in `src/actions.ts` and the MCP `executeTool` path in `src/server.ts`) now evaluates schema-declared `store_warnings` rules through a single shared evaluator (`src/services/store_warning_rule.ts`) instead of two independent inline checks. The declarative `condition: { missing_all_of: [...] }` rule spelling is now correctly implemented — it is not new syntax, it is the declarative form of the same rule logic the flat `fields: string[]` spelling already implemented.
- A rule the evaluator cannot understand (malformed `fields`/`condition.missing_all_of` list, unrecognized `condition` key, or a rule declaring neither spelling) now yields a `STORE_WARNING_RULE_NOT_EVALUATED` warning naming the rule and the unreadable path, and never blocks the write. See `docs/reference/error_codes.md` § Store Warnings.
- `SchemaDefinition.store_warnings[].fields` is now optional (`fields?: string[]`) to reflect that a rule may instead declare `condition` — this is a TypeScript type widening only; the OpenAPI `store_warnings[].code` field was already an untyped string, so no contract change.

## API surface & contracts

- No OpenAPI schema changes. `npm run openapi:bc-diff` against `v0.23.0` reports no breaking changes.
- No new or changed MCP tools or CLI commands.

## Behavior changes

- Schemas declaring `store_warnings` with a `condition: { missing_all_of: [...] }` rule now store successfully instead of failing every write with `DB_QUERY_FAILED`. This affects only the (previously fully broken) write path for entity types using this rule shape — no previously-working write becomes stricter or more permissive.
- A schema-declared warning rule with a malformed or unrecognized shape now surfaces as a `STORE_WARNING_RULE_NOT_EVALUATED` warning in the store response instead of silently doing nothing or throwing. Schema authors relying on an inert malformed rule (unlikely, since it previously either threw or silently no-opped depending on shape) will now see the rule's condition explicitly flagged as unevaluated.

## Internal changes

- Consolidated the previously-duplicated `store_warnings` evaluation inline in `src/actions.ts` and `src/server.ts` into one shared module, `src/services/store_warning_rule.ts`.
- Added a new eval-harness scenario (`packages/eval-harness/scenarios/store_warning_rule_contract.scenario.yaml`) replaying synthetic schema registration and store calls across all warning-rule shapes.

## Fixes

- Fixed the `store_warnings` evaluator throwing on the declarative `condition` rule shape, which made `skill`, `agent_definition`, and `operator_profile` entity types unwritable, including on dry runs (#2165, #2170; root cause of the `DB_QUERY_FAILED` reports in #2067). (#2409)

## Tests and validation

- `tests/unit/store_warning_rule.test.ts`: 26/26 passed — both rule spellings, fail-open behavior for malformed/unrecognized shapes, and the absent-vs-malformed distinction central to the fix.
- `tests/integration/store_warning_condition_rule.test.ts`: 9/9 passed — real HTTP `/store` and MCP `executeTool` paths, including a `commit: false` dry-run case and an end-to-end skill-registration regression test.
- Full `tests/contract/` suite: 206/206 passed.
- `tests/contract/legacy_payloads/replay.test.ts`: 16/16 passed.
- `tests/cli/cli_command_coverage_guard.test.ts`: 1/1 passed.
- `npm run openapi:bc-diff`: no breaking changes detected against `v0.23.0`.
- `npm run security:classify-diff`: `sensitive=true` (file-level match on `src/actions.ts`, the `auth-middleware` concern path — the diff's actual edit in that file is the `store_warnings` evaluator, not auth logic; see Security hardening below).
- `npm run security:lint`: 0 errors, 133 pre-existing warnings (none new to this diff).
- `npm run security:manifest:check`: in sync (120 routes).
- `npm run test:security:auth-matrix`: 18 passed, 1 pre-existing skip, 0 failed.
- Full `/review` pass over `v0.23.0..HEAD`: see `docs/releases/in_progress/v0.23.1/test_coverage_review.md` (verdict: APPROVED, one advisory doc-completeness finding fixed in this release-prep pass).

## Security hardening

`npm run security:classify-diff` flags this release `sensitive=true` because it edits `src/actions.ts`, the file that also holds the auth-middleware trust helpers (`isLocalRequest`, `forwardedForValues`). The classifier matches at file granularity, not line granularity. The actual change in that file is limited to the `store_warnings` advisory-rule evaluation inside `storeStructuredForApi` — no auth, routing, or proxy-trust code is touched. Full adversarial review, including the eight standard threat-model checks, is recorded in `docs/releases/in_progress/v0.23.1/security_review.md` (verdict: PASS, no security-sensitive surface touched).

## Breaking changes

No breaking changes.
