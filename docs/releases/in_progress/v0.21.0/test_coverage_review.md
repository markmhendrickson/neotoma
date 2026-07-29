# Test coverage review — v0.21.0

`/review` pass over `v0.20.0..HEAD`, run as part of release preparation.

## Scope

Reviewing v0.20.0..HEAD — 34 files changed, +4363/−251 lines (11 files / +762/−163 added since the initial pass, from the schema-seeding fix, PR #1992/#1968).

Surfaces: CLI (`neotoma skills sync` instance flags, new `sources content` command), Inspector auth (OAuth token persistence/refresh), CI/deploy workflow (Fly token scoping), boot-time and deploy-time schema seeding (`src/services/schema_registry_bootstrap.ts`, `scripts/initialize-schemas.ts`, `src/seed_schemas_entry.ts`, `fly.toml`, `fly.sandbox.toml`, `scripts/redeploy_rc_from_main.sh`), docs, tests. High-risk: yes (filesystem writes derived from graph-supplied data; browser-side auth-token handling; a data-clobbering bug in schema activation) — all three are addressed within the diff's own commit history (see Security hardening in the supplement and `security_review.md`).

No changes to `openapi.yaml`, the reducer/observation/entity pipeline, relationships, or timeline events. One change touches schema *registration/activation* (`schema_registry.ts` consumers), not schema-agnostic per-type branching in application code — `loadGlobalSchema` is an existing registry-service method, not a new `entity_type` branch (see Architectural review below).

## Pre-PR checklist (change_guardrails_rules.md)

1. `openapi.yaml` edited first — **— N/A** (no API surface changes)
2. `contract_mappings.ts` updated for new `operationId`/MCP tool/CLI command — **— N/A** (no new HTTP operationId or MCP tool; new CLI-only surface, correctly documented as CLI-only with no MCP equivalent)
3. `npm test -- tests/contract/` passes — **✓** (160/160 passing, verified in this review)
4. New top-level CLI commands in `cli_command_coverage_guard.test.ts` — **✓** (`sources` was already a top-level command; `content` is a subcommand, no guard update needed per the commit's own note — confirmed correct, guard test passes)
5. MCP/CLI agent-instruction parity — **✓** (both `docs/developer/mcp/instructions.md:278` and `docs/developer/cli_agent_instructions.md:31` document this as CLI-only, consistent wording, cites the `NEOTOMA_USER_ID` precedent)
6. Runtime overrides follow `flag > env > default` — **— N/A** (no new env-var runtime overrides)
7. New env vars `NEOTOMA_`-prefixed, read in `preAction` — **— N/A** (no new env vars; `CLIENT_INSTANCE_FLY_TOKEN` is a GitHub Actions secret, not a Neotoma runtime env var)
8. Error hints as structured fields, not concatenated into `message` — **✓** (CLI console output for blocked/rejected scripts uses structured outcome variants, not string concatenation into a thrown error)
9. Tightening-change hint obligation — **— N/A** (no previously-accepted input now rejected; this is new opt-in functionality)
10. `openapi:bc-diff` reviewed; breaking entries named in supplement — **✓** (ran `npm run openapi:bc-diff -- --base v0.20.0 --head HEAD`: "No breaking changes detected"; supplement's Breaking changes section states `None`, consistent)
11. `legacy_payloads/replay.test.ts` passes — **✓** (15/15 passing as part of the 160 contract tests)
12. New top-level request bodies declare `additionalProperties: false` — **— N/A**
13. New response fields declared in `openapi.yaml` — **— N/A**
14. Release-visible changes documented in supplement under `docs/releases/in_progress/v0.21.0/` — **✓**
15. `schema_agnostic_design_rules.md` re-read for per-type behavior — **✓** re-read; the schema-seeding change registers/skips per-*schema-registry-row*, not per hardcoded `entity_type` branch — it iterates `Object.values(ENTITY_SCHEMAS)` generically and calls the same registry methods (`loadGlobalSchema`, `register`) for every type; adding a new built-in entity type requires zero code changes to the seeder.
16. Determinism preserved — **✓** (no random IDs, no `Date.now()` in ID derivation; the MIME-extension map and hash-pin approval keys are pure deterministic string maps; schema seeding iterates `Object.values(ENTITY_SCHEMAS)` — insertion order of a module-level object literal, stable across runs — and every registration decision is a pure function of registry state, not wall-clock or random input)
17. Idempotency / transactional ingestion — **— N/A** (no ingestion/observation writes in this diff; schema *registration* is a different write path, and is itself verified idempotent by `tests/services/schema_registry_bootstrap.test.ts`'s "is idempotent: a second run registers nothing and leaves the row identical" case)
18. No new PII in logs/metrics/errors — **✓** (script filenames printed in blocked/error output are graph-supplied attachment filenames, not local filesystem paths or personal data; OAuth token values are never logged, confirmed by diff inspection; schema-seeding log lines emit only `entity_type` strings and counts, no user data)
19. Renamed files snake_case — **— N/A** (no renames)
20. Security gate results recorded — **✓** (`classify-diff` → `sensitive=true`, driven by a path-match on `src/actions.ts`; investigated and confirmed a false positive for the auth-middleware heuristic, not a genuine auth-path change — full lane run regardless given the sensitive-adjacent surfaces touched — see `security_review.md`, verdict `yes`)
21. New Express routes in `protected_routes_manifest.json` — **— N/A** (no new Express routes; `security:manifest:check` confirms 116 routes unchanged)
22. No bare `req.socket.remoteAddress`/XFF/Host reads outside canonical helpers — **✓** (`src/actions.ts` IS touched in this diff, but only by a ~35-line boot-time hook inside `startHTTPServer()` that calls `seedSchemaRegistryIfEmpty()` — confirmed by direct read that the added hunk contains no `remoteAddress`/XFF/Host access, no route registration, and no reference to `isLocalRequest`/`forwardedForValues`/`isProductionEnvironment`)
23. User-facing-surface coverage:
    - New CLI flags (`--include-instance-skills`, `--include-instance-scripts`, `--approve-scripts`) — **✓** `skills_sync_instance_cli.test.ts` drives the Commander closure end-to-end via `runCli(argv)` with fetch stubbed, 13 tests covering both-flags/scripts-only/neither, exit codes, `--json` shape, `--approve-scripts` coercion including the deprecated alias.
    - New CLI command (`sources content`) — **✓** `sources_content_cli.test.ts`, 6 tests: success/bytes-verbatim, `--source-id` flag, UTF-8 vs non-UTF-8 warning, nonexistent-source error, missing-id validation.
    - Filesystem-writing / trust-boundary logic (hash-pin, path sanitization) — **✓** `instance_scripts.test.ts` (31 tests) and `instance_skills.test.ts` (16 tests): hash-pin round-trip, mismatch refusal even with `--approve-scripts`, 7 path-traversal fixtures asserting both refusal and sandbox containment, package-wins-on-collision, provenance-gated pruning.
    - Network fetch/parsing boundary — **✓** `instance_skills_client.test.ts` (12 tests): filtering of disabled/malformed rows, relationship-type/source spoofing rejection, error propagation.
    - HTTP-runtime auth behavior (OAuth refresh) — **✓** `token_refresh.test.ts` (7 tests, Inspector): bundle persistence, refresh-and-retry on 401, no-double-retry guard, dead-refresh-clears-session, concurrent-401 coalescing. Retry-path cases were verified (per commit message) to fail with the guard disabled and pass with it — genuine behavioral coverage, not just line coverage.
    - Deploy-time schema seeding (boot hook + Fly `release_command` + RC redeploy script) — **✓** classified as a **destructive/data-mutating operation** per the release-lane test-coverage criteria (it activates/deactivates schema registrations). Required a real round-trip test against real state, not an in-memory stub: `seed_then_works_at_e2e.test.ts` runs a real store operation against a real SQLite-backed test server and asserts the actual `works_at` relationship-edge side effect, both absent (negative control) and present (positive case) — this is effect-verified coverage, not contract-only coverage. `schema_registry_bootstrap.test.ts` covers the custom-schema-preservation property directly (the specific regression this release fixes) at both a matching and a differing version string. `deploy_seed_wiring.test.ts` guards the deploy-config artifacts themselves (the exact files whose `release_command` disappeared in the original #1968 regression), closing the "config silently stripped again" failure mode, not just the code-level failure mode. I ran all three files directly in this review (10/10 passing), not just read them.
24. npm script naming convention — **— N/A** (no new/renamed npm scripts)
25. No unstable iteration order in stored/emitted/ID-input paths — **✓** (`resolveMimeTypeFromExtension` is a static object literal keyed by extension, looked up by key — not iterated; approval-manifest keys are explicit string concatenation, not iteration order-dependent; schema seeding iterates `Object.values(ENTITY_SCHEMAS)` for logging/summary purposes only — the *outcome* per entity type does not depend on iteration order, since each type's registration decision reads only that type's own registry row)

## Architectural review

**State Layer boundaries:** No strategy, filtering-suggestion, orchestration, or scheduled-execution logic added. The skills-sync materialization reads instance state (skill/file_asset entities) and writes to the *local filesystem* of the invoking CLI process — this is the operational layer (the CLI harness) consuming truth, not the state layer deciding anything. No new code emits or interprets "importance" signals. The schema-seeding module registers schema-registry rows from a fixed, code-defined source (`ENTITY_SCHEMAS`) — it is a bootstrap/ops concern, not strategy or execution logic.

**Schema-agnostic design:** No new `switch(entity_type)` or `if (entityType === "X")` branches. `fetchEnabledInstanceSkills` filters on `entity_type: "skill"` at the query level (existing pattern, not a new per-type branch in service code). The schema-seeding rewrite is itself a schema-agnostic-design improvement: it replaced a hazard that only manifested per-type as an incidental side effect of a generic loop, with a generic loop whose skip/register decision is now correctly derived from registry state for every type uniformly — no type-specific carve-outs were added or needed.

**Determinism:** Confirmed clean — see checklist item 16 above.

**Immutability:** No `UPDATE` on `observations` or `sources`; this diff introduces read-only fetches (`GET /sources/:id/content`, `POST /entities/query`, `POST /retrieve_related_entities`) plus local-filesystem writes, no graph mutation of source/observation rows. Schema-registry rows are a distinct, non-observation/non-source table; the fix's whole point is to make writes to that table strictly additive (register only when nothing active exists) rather than mutating (deactivate-then-activate) an existing row.

**Auth surface:** `src/actions.ts` IS touched in this diff (new in the extended pass) — but only by a ~35-line boot-time hook calling `seedSchemaRegistryIfEmpty()` inside `startHTTPServer()`, verified by direct read to contain no route registration, no middleware, and no reference to any of the canonical auth-topology helpers (`isLocalRequest`, `forwardedForValues`, `isProductionEnvironment`). The OAuth changes are entirely client-side (Inspector); server-side `/mcp/oauth/token` refresh-grant handling was already in place (added in an earlier release per the commit message) and is unchanged here.

**Error handling:** Structured outcome variants (`ScriptWriteOutcome`) rather than opaque throws; no tightened validation in this diff (opt-in new functionality only). Schema-seeding failures are captured per-entity-type into a `failed: Array<{entity_type, error}>` summary rather than thrown, and boot itself never fails on a seeding error (try/catch at the call site).

## Product/UX and principles alignment

- **10.2 Explicit Over Implicit:** Both new flags are opt-in, off by default. A plain `neotoma skills sync` is byte-identical in behavior to pre-v0.21.0.
- **10.7 Privacy Over Automation:** Script writes require explicit `--approve-scripts` consent per hash; no auto-approval path exists.
- **Silent behavior changes:** None found in the CLI/Inspector surfaces. The `--json` exit-code fix (found and fixed within this diff's own commits) actually *removes* a silent-failure mode rather than introducing one — previously a `--json` invocation could report a hash mismatch in its body while exiting 0. The schema-seeding fix is itself a silent-failure removal at the operator level: a never-seeded instance previously lost reference-field auto-linking with zero error or warning anywhere; the new boot-time seeder both fixes the gap and logs which entity types were seeded vs. preserved, making the state observable for the first time.
- **Discoverability:** New capability is documented in `cli_reference.md` (full flag semantics + a worked 3-step consent example), `cli_agent_instructions.md`, `mcp/instructions.md` (CLI-only pointer), and `docs/skills/skill_strategy.md` (design rationale). No orphaned capability. Schema seeding behavior is documented in `docs/developer/schema_initialization.md`.

## Documentation completeness

- `docs/developer/cli_reference.md` — updated (Skills section, Sources section for the new `content` subcommand). ✓
- `docs/developer/cli_agent_instructions.md` — updated (CLI-only pointer, no behavioral duplicate per the sync rule). ✓
- `docs/developer/mcp/instructions.md` — updated (one pointer line, correctly notes "no MCP tool exists" so agents don't infer one). ✓
- `docs/skills/skill_strategy.md` — updated (169 lines added, documents the two-tree model gaining a third source, the boundary test for package vs. instance-local). ✓
- `docs/developer/schema_initialization.md` — updated (73 lines net; documents the boot-time seeder, the shared skip-if-active-schema-exists contract across all three seeding paths, and the `--force` hazard). ✓
- `docs/testing/automated_test_catalog.md` — regenerated via `npm run generate:test-catalog`, not hand-edited; verified current via `npm run validate:test-catalog` (✅ up to date). ✓
- No new error code registry entry needed (no new `ERR_*` constants in this diff). `src/services/schema_registry_bootstrap.ts` is a new service module but is documented in-line (extensive header doc comment) and in `schema_initialization.md`, not a candidate for a separate subsystem doc given its narrow, single-purpose scope.

## Supplement accuracy

Cross-checked every claim in `github_release_supplement.md` against the code:
- `--include-instance-skills`, `--include-instance-scripts`, `--approve-scripts`/`--approve` — confirmed present in `src/cli/index.ts`, matches described semantics.
- `neotoma sources content` — confirmed present, `--json` shape `{ id, size, is_utf8, content_base64 }` matches `sources_content_cli.test.ts` assertions.
- Path-traversal fix — confirmed `sanitizeScriptFilename()` in `src/cli/instance_scripts.ts` matches the described rejection rules exactly (empty, absolute would fail the separator check, `.`/`..`, path separators, null bytes).
- MIME map additions — confirmed the exact 6 extensions listed (`.py`, `.sh`, `.js`, `.ts`, `.rb`, `.sql`) match `raw_storage.ts`.
- OAuth fix — confirmed `setAuthSession`, single-flight `ensureRefreshed`, `TOKEN_EXPIRY_SKEW_MS = 60_000` all present as described.
- Fly token fix — confirmed `CLIENT_INSTANCE_FLY_TOKEN` with fallback to `FLY_API_TOKEN` in `.github/workflows/deploy-client-instance.yml`.
- Schema-seeding fix — confirmed `seedSchemaRegistryIfEmpty()` exists, is called from `startHTTPServer()`, and its skip-if-active-schema-exists logic matches the supplement's description exactly; confirmed the same contract in both `scripts/initialize-schemas.ts` and `src/seed_schemas_entry.ts`; confirmed `fly.toml` and `fly.sandbox.toml` both gained the described `[deploy] release_command`; confirmed `scripts/redeploy_rc_from_main.sh` gained the described non-fatal seed step.
- `openapi:bc-diff` output ("No breaking changes detected") reconciled with the supplement's Breaking changes section. ✓
- Breaking changes section present and reads correctly (`None.` with justification, now including the schema-seeding additive-only guarantee). ✓

## Findings

No findings. All checklist items are either satisfied or correctly marked N/A; all architectural, product-principles, and documentation-completeness checks pass. The diff's own commit history shows issues found and fixed by prior review passes before this release-prep review: path traversal, `--approve` UX naming, `--json` exit code (arch-gate/ux-lens/qa-lens on the skills-sync PR), and the custom-schema-clobbering bug plus two coverage gaps flagged by a "pm gate" review on the schema-seeding PR (no effect-verified e2e test; no deploy-config regression guard) — both gaps were closed within the same PR (`seed_then_works_at_e2e.test.ts`, `deploy_seed_wiring.test.ts`), verified by direct test execution in this review. No new issues surfaced by this pass.

--- Review Summary ---
Base..Head: v0.20.0..HEAD
Files reviewed: 34
Blocking: 0
Advisory: 0
Nit: 0

Verdict: APPROVED

## Code review

Verdict: **APPROVED**. Zero blocking findings. Full test suite for the affected surfaces passes (84 CLI/service unit tests, 7 Inspector OAuth tests, 10 schema-seeding tests, 160 contract tests, 18/19 auth-matrix tests) — all run directly in this review, not just read. Type-check, lint (0 errors, 333 warnings all pre-existing baseline), format:check, and test-catalog validation all clean. `openapi:bc-diff` confirms no breaking changes. Security review verdict: `yes` (see `security_review.md`), including an investigated-and-dismissed `sensitive=true` classifier flip. Proceeding to RC PR.
