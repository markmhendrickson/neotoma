This release ships two fixes, one regression test, and a positioning/documentation pass: a schema-declared store-warning rule can no longer throw and block an otherwise-valid write, MCP `initialize` now resolves identity correctly for standing-rules and instance-skills lookups on header-only authenticated sessions, the instruction payload gains a size-budget regression test, and the foundation/ICP documentation is consolidated around a single durable ICP and a stated category-noun authority claim.

## Highlights

- **A schema-declared store-warning rule can no longer throw and block a write.** Rules spelled declaratively (`condition: { missing_all_of: [...] }`) had no `fields` key, so the inline evaluator's `rule.fields.some(...)` threw a `TypeError` that surfaced to callers as `DB_QUERY_FAILED` — making entire entity types unwritable, including on `commit: false` dry runs. Both store paths now share one evaluator that fails open and legibly on anything it cannot fully parse.
- **MCP `initialize` no longer hands header-only-authenticated sessions an empty standing-rules/instance-skills list.** `this.authenticatedUserId` was not reliably set by the time the initialize response was built for sessions that authenticate by `Authorization` header without an `x-connection-id`; the lookups were silently skipped rather than reported as failed, so a session with real standing rules or skills configured saw none.
- **Foundation and ICP documentation consolidated.** Ten ICP documents behind one index; `core_identity.md` restates Neotoma's category as an authority claim rather than a "state layer" mechanism list; the durable ICP decision (Candidate B — the technically fluent operator who will not build their own state infrastructure) applied across README, docs, and the `/evaluate` page in both English and Spanish.

## What changed for npm package users

**Runtime / data layer**

- `store_warnings` schema rules now support a declarative `condition: { missing_all_of: [...] }` spelling alongside the existing `fields: string[]` spelling. Both evaluate identically; a rule declaring neither, or a shape the evaluator cannot fully read, emits a `STORE_WARNING_RULE_NOT_EVALUATED` warning naming the unreadable part rather than blocking the write.
- MCP `initialize` responses for header-only-authenticated sessions (no `x-connection-id`) now resolve identity the same way `listTools` already did, so standing rules and instance skills are returned instead of silently omitted. A genuinely unresolvable identity now reports `lookup_failed: true` instead of a confident empty list.

**Shipped artifacts**

- No `openapi.yaml` changes in this release (`npm run openapi:bc-diff` confirms zero surface changes).

## API surface & contracts

- No new or changed HTTP operations. Both fixes are internal to existing store and MCP `initialize` handlers.
- No breaking changes (`npm run openapi:bc-diff --base v0.23.0 --head HEAD`: no breaking changes detected, zero operation diffs).

## Behavior changes

- **A malformed or declaratively-spelled `store_warnings` rule no longer fails the write it is attached to.** Previously: a rule with no `fields` key threw, and the throw escaped as `DB_QUERY_FAILED` before the commit decision — even on `commit: false` dry runs. Now: the write proceeds, and the response carries a `STORE_WARNING_RULE_NOT_EVALUATED` warning naming the rule and the exact path (`fields` or `condition.missing_all_of`) that could not be read. A `condition.missing_all_of` field list is taken whole or not at all — a list containing a non-string entry is rejected intact and reported, never silently narrowed to its readable subset.
- **MCP `initialize` no longer silently omits standing rules or instance skills for header-only-authenticated sessions.** Any session lacking `x-connection-id` previously reached the standing-rules and instance-skills lookups with `authenticatedUserId` still null, so the lookups were skipped and reported as "this instance has none" rather than "this lookup failed." They are now attempted via the same connection-id-based fallback `listTools` already used, and report `lookup_failed: true` when identity genuinely cannot be resolved.

## Docs site & CI / tooling

- `docs/foundation/core_identity.md`, `docs/foundation/redlines.md`, `docs/foundation/product_positioning.md`, `docs/foundation/problem_statement.md`, `docs/foundation/mmry_comparison.md`, `docs/foundation/layered_architecture.md`, `docs/foundation/scope_decisions.md`, `docs/foundation/developer_release_principles.md`: category noun restated as "the system of record for AI agents" (an authority claim bounded to agent-generated state), "state layer" retired as a category noun but kept as the architectural invariant name; `never_say_the_agent_forgot` redline documented under R13 with the competitor test and the verbatim-user-research exemption; durable ICP decision (Candidate B) applied, removing the "zero-install" framing in favor of "guided installer intended, not yet shipped."
- `docs/icp/README.md` (new): index for the ten pre-existing ICP documents, with a per-surface category-noun table, the canonical ICP quoted from `icp_from_functionality.md`, and four operator decisions (O1-O4) surfaced but left open. `visibility: internal` — carries pricing and GTM detail, not shipped in public bundled docs.
- `README.md`, `docs/getting_started/what_is_neotoma.md`, `docs/icp/developer_release_targeting.md`, `docs/icp/general_release_criteria.md`, `docs/icp/icp_from_functionality.md`, `docs/icp/icp_reconciliation.md`, `docs/icp/primary_icp.md`: install-barrier framing corrected to state the guided installer is intended and not yet available, in both places that previously stated only the intent.
- `frontend/src/i18n/locales/evaluate_subpage_strings.ts` and the `/evaluate` page: every reader-characterizing field (`whoForP`, `taxLi3BeforeLink`, `scorecardPre`, `storeFirstItems`) realigned to the durable ICP in both English and Spanish, with a new effect-verified parity test (`icp_evaluate_surface_parity.test.ts`) reading the docs and both locale packs together so a divergence between any two surfaces is caught.
- `docs/testing/automated_test_catalog.md` regenerated for the new test files added in this release.

## Internal changes

- `src/services/store_warning_rule.ts` (new, 254 lines): single evaluation point for `store_warnings` rules, replacing the two inline copies previously duplicated across `src/actions.ts` and `src/server.ts`. Implements `condition: { missing_all_of: [...] }`, treats a field list as legible only whole (never partially salvaged), and reports any unrecognized shape via `STORE_WARNING_RULE_NOT_EVALUATED` instead of throwing.
- `src/services/schema_registry.ts`: `store_warnings` rule type gains the optional `condition` field alongside the now-optional `fields` field.
- `src/server.ts`: new `resolveInstructionLookupUserId()` helper, mirroring the identity-resolution fallback `listTools` already used, applied to the standing-rules and instance-skills lookups inside `buildAuthenticatedInitializeResponse`.
- `tests/unit/mcp_instruction_token_budget.test.ts` (new, 153 lines): character-budget regression test for the MCP instruction payloads (full ~145K chars / ~31K tokens, compact ~5.1K chars / ~1.1K tokens, measured with tiktoken `cl100k_base`), asserting via the same server code path the payload ships through rather than reading the source markdown directly. Ceilings, not targets — shrinking never fails; growth past the ceiling does.
- Tests added: `tests/unit/store_warning_rule.test.ts` (288 lines), `tests/integration/store_warning_condition_rule.test.ts` (414 lines, includes a cassette fixture for replay), `tests/unit/instance_skills_initialize_effect.test.ts` (expanded), `frontend/src/pages/subpages/EvaluatePage.icp_fit.test.tsx` (180 lines), `tests/integration/icp_evaluate_surface_parity.test.ts` (270 lines).

## Fixes

- **A schema-declared store-warning rule could block an otherwise-valid write (#2067, #2165, #2170).** Three live production schemas (`skill`, `agent_definition`, `operator_profile`) declared their `store_warnings` rule using `condition: { missing_all_of: [...] }`, which the inline evaluator could not read, throwing before the commit decision. Fixed by extracting a shared evaluator that supports both spellings and never throws on an unreadable shape.
- **MCP `initialize` returned empty standing rules and instance skills for header-only-authenticated sessions (#2438, refs #2429, #2368, #2131).** Every branch that sets `this.authenticatedUserId` is nested inside `if (connectionId)`, so a session authenticating by `Authorization` header alone reached the lookups with identity still unresolved, and the resulting empty result was indistinguishable from "this instance has none." Fixed by resolving identity the same way `listTools` already did, and reporting `lookup_failed: true` when resolution genuinely fails.

## Tests and validation

- `npm run type-check`: clean.
- `npm run lint`: 0 errors, 332 warnings (pre-existing `@typescript-eslint/no-explicit-any` baseline, unchanged in kind from prior releases).
- `npm run openapi:bc-diff -- --base v0.23.0 --head HEAD`: no breaking changes, zero operation diffs.
- `npm run validate:test-catalog`: catalog regenerated and confirmed current.
- Full unit/integration suite (`npm test`): see CI status on the release-candidate PR.
- Security lane (G1-G3): see Security hardening section below.
- Test coverage review: see `docs/releases/in_progress/v0.24.0/test_coverage_review.md`.

## Security hardening

`npm run security:classify-diff` reports this release `sensitive=true`, driven by `src/actions.ts` touching the auth-middleware surface classifier (the store-warning-rule fix sits in the same file). See `docs/releases/in_progress/v0.24.0/security_review.md` for the full adversarial review; summary: neither code change in this release adds a new Express route, a new MCP tool, or a new authentication path — the store-warning fix only changes whether an advisory response warning is appended, and the initialize-identity fix only changes which instruction content is attached to an already-authenticated session, reporting failure explicitly rather than silently returning empty. `security:lint` (0 errors / 133 warnings, identical categories to baseline), `security:manifest:check` (120 routes, unchanged), and `test:security:auth-matrix` (18 passed / 1 skipped, unchanged) all confirm no new authorization surface. Sign-off verdict: **with-caveats**.

## Breaking changes

No breaking changes.
