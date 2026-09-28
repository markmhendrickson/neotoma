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

---

## Addendum, 2026-09-27 — Lost-update prevention for structured array fields (Waxwing ADR)

Separate diff landing in the same in-progress release train.

### Highlights

- **Fixes a lost-update race on concurrent writes to structured array fields.** Two callers reading a structured collection field (e.g. a workboard's `tasks_claimed`), each editing a different row locally, and writing the full array back could silently discard each other's disjoint changes — both writes reported success. A new `patch_array_item` operation and a new `merge_array_by_key` reducer strategy close this: concurrent patches to different keys of the same array now both survive, and a same-key race is either resolved deterministically (latest `observed_at` wins) or surfaced as a structured conflict when the caller opts in with a version precondition.

### What changed for npm package users

**Runtime / data layer**

- New reducer merge strategy `merge_array_by_key` (`src/reducers/observation_reducer.ts`, `src/services/schema_registry.ts`): a sibling of `merge_array` for array fields whose items carry a stable `key_field`. Same priority-gating as `merge_array`; within the top-priority tier, items reconcile by key instead of Set-union.
- New service `src/services/array_item_patch.ts` (`patchArrayItem`): atomic keyed read-modify-write against one row of a structured array field, replacing the caller-side read-modify-full-array-write anti-pattern.
- `/correct` (HTTP and MCP) gained an optional entity-level CAS precondition (`expected_version` + `overwrite`), reusing `last_observation_at` as the version token — no new column. The precondition read and correction insert share one write transaction; omitted by default, it makes no behavior change for existing callers.
- New shared helper `src/services/stable_serialize.ts`, extracted from `batch_correction.ts` (no behavior change) and reused by the new item-version content-hash.

**New API surface**

- `POST /patch_array_item` (HTTP), `patch_array_item` (MCP tool), `neotoma array-item patch` (CLI) — atomically patch one item of a structured array field by key. See `docs/subsystems/reducer.md` §3.5 and `docs/developer/cli_reference.md` "Array item patch".
- `POST /entities/{id}/batch_correct` is now documented in `openapi.yaml` for the first time (pre-existing endpoint, contract-documentation gap closed; no behavior change).

## API surface & contracts

- `npm run openapi:bc-diff` against `origin/main`: no breaking changes. Four additive changes: new operation `POST /patch_array_item`, newly-documented pre-existing operation `POST /entities/{id}/batch_correct`, and two new optional request fields on `POST /correct` (`expected_version`, `overwrite`).
- New MCP tool: `patch_array_item`. New CLI command: `neotoma array-item patch`.

## Behavior changes

- `/correct` and `patch_array_item` calls that never supply a version precondition see no behavior change.
- Callers using `expected_version` (on `/correct`) or `expected_item_version` (on `patch_array_item`) now receive a structured `409` (`ERR_FIELD_VERSION_CONFLICT` / `ERR_ARRAY_ITEM_CONFLICT`) instead of a silent overwrite when the value is stale.
- Two concurrent same-key writers presenting the same valid version token cannot both pass: the write transaction admits exactly one and returns a conflict to the other. Disjoint keyed patches both survive.
- `patch_array_item` fails closed unless the active schema declares the target as an array using `merge_array_by_key` with the same `key_field`; a caller-supplied entity type cannot influence authorization and must match the stored type.
- A schema field declaring `merge_policies.<field>.strategy: "merge_array_by_key"` reconciles top-priority-tier items by key instead of Set-union. No existing schema declares this strategy yet, so no live reducer output changes; adopting it for a field (e.g. `session_digest.tasks_claimed`) is a follow-up schema-migration task, out of scope for this diff.

## Fixes

- Fixes the reproduced lost-update race where a concurrent full-array correction on a structured collection field could silently discard another writer's disjoint row while both writes reported success (Waxwing ADR, Neotoma task `ent_4b41bb83a4faf4428a73bfc8`).
- Fixes `POST /patch_array_item` (HTTP) and the MCP `patch_array_item` tool generalizing an instance store-policy denial into a generic 500/`InternalError` instead of the structured 400 denial envelope `/correct` already returns for the identical case (found in self-review before PR; see Security hardening below).

## Tests and validation

- `tests/unit/observation_reducer_merge_array_by_key.test.ts`: keyed merge, deterministic tie-break, priority gating, malformed-item preservation, and unkeyed deduplication.
- `tests/unit/array_item_patch_atomic.test.ts`: real-SQLite concurrency proof for disjoint-key preservation, same-key item CAS, entity-level correction CAS, fail-closed policy/type checks, and scalar key validation.
- `tests/integration/array_item_patch_conflict.test.ts`: HTTP and MCP parity, disjoint-key concurrent patches, same-key CAS, entity-level `/correct` CAS, structured retry guidance, policy/type mismatch refusal, and legacy behavior without a precondition.
- `tests/cli/cli_array_item_patch_commands.test.ts`: passed.
- `tests/cli/cli_edit_commands.test.ts`: passed (extended with the previously-untested `batch_correct` conflict branch).
- `tests/cli/cli_command_coverage_guard.test.ts`: 1/1 passed.
- `tests/unit/patch_array_item_store_policy_envelope.test.ts` (new): 2/2 passed — structural guard asserting both `/patch_array_item` transports map `StorePolicyDeniedError`/`StorePolicyUnavailableError` the same way `/correct` does.
- Full unit, contract, integration, CLI, and security totals are recorded in the PR validation section from the final committed tree.
- `npm run openapi:bc-diff`: no breaking changes detected against `origin/main`.
- `npm run security:classify-diff`: `sensitive=true` (new route `POST /patch_array_item`, `openapi.yaml`, and `protected_routes_manifest.json` changes; see Security hardening below).
- `npm run security:lint`: 0 errors, 137 pre-existing warnings (none new; `patch_array_item` itself is not flagged).
- `npm run security:manifest:check`: in sync (125 routes; one new route added).
- `./node_modules/.bin/tsc --noEmit`: clean.
- `npm run validate:test-catalog` / `npm run generate:test-catalog`: catalog regenerated to include the new test file (665 total automated test files); no other drift.
- Author-side review findings were resolved before PR: the CAS paths are transaction-bound; authorization uses the stored entity type; keyed policy lookup fails closed; item versions are opaque hashes; unkeyed historical duplicates are bounded; and incremental schema/OpenAPI/MCP/CLI surfaces carry the same keyed-reducer contract. See `docs/releases/in_progress/v0.23.1/security_review.md`.

## Security hardening

`npm run security:classify-diff` flags this diff `sensitive=true`: it adds a new Express route (`POST /patch_array_item`), edits `openapi.yaml`'s security-relevant paths, and updates `protected_routes_manifest.json`. The new route reuses the exact same `getAuthenticatedUserId` / `enforceAgentCapability("correct", ...)` / `assertCanWriteProtectedBatch` gating sequence as the existing `/correct` route it is a sibling of, and the underlying service (`patchArrayItem`) scopes its own entity read to the caller's `user_id`. Full adversarial review, including the eight standard threat-model checks, is recorded as an addendum in `docs/releases/in_progress/v0.23.1/security_review.md` (verdict: PASS, no new auth/routing/proxy-trust/guest-access surface).

## Breaking changes

No breaking changes.
