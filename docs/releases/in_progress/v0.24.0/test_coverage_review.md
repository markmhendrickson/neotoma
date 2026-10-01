# Test coverage review — v0.24.0

Reviewed range (rc2): v0.23.1..HEAD (165 files, +19098/-2061). rc3 (2026-09-29) rebuilt the release on current `main`, adding eight commits; see **rc3 delta** at the end of this file. rc3 range before the `main` merge: 237 files, +27353/-2423. On 2026-09-29 `main` (`cabd1eef5`) was merged into the branch (merge commit `6b237ba17`), adding #2517 and #2534; see **main merge delta** inside the rc3 section. Release range at `6b237ba17` (`v0.23.1..HEAD`): 257 files, +30653/-2562. The artifact-extension commit on top of it changes documentation only.

## Surface-by-surface coverage

### register_relationship_type endpoint

**Covers a helper function only (GAP), with strong denial-path coverage.**

- MCP: `tests/services/relationship_type_security.test.ts` ("MCP registration refuses absent admission and admits an explicit scoped grant") calls `(server as any).registerRelationshipType(...)` directly — a private-method invocation, not the public `server.callTool`/tool-dispatch path — and does assert a real successful registration once capability is granted via `runWithRequestContext`. Close to end-to-end but bypasses public MCP dispatch.
- CLI: `tests/cli/relationship_types_cli.test.ts` drives the real `runCli` against a live HTTP server, but only exercises the **denial** path (exit code 1, capability error). No CLI test performs and verifies a **successful** registration end-to-end through HTTP.
- HTTP/REST: no test found that POSTs to `/register_relationship_type` via `fetch()` and asserts a 200 with a registered row (unlike `/list_relationship_types`, which does have this).
- The only full round-trip proof of a *successful* registration is `tests/services/relationship_type_registration.test.ts`, which calls `relationshipTypeRegistry.register(...)` directly — a service-layer unit test that bypasses capability enforcement, HTTP, and MCP dispatch entirely.

No single test proves a successful `register_relationship_type` call end-to-end through a real, publicly reachable HTTP or CLI surface. Denial paths are well covered on all three surfaces; the success path is not, at the boundary that actually matters (the wiring from route/tool/command into the service).

### list_relationship_types endpoint

**Covers user-observable behavior end-to-end.**

- `tests/integration/empty_registry_builtin_repair_e2e.test.ts` performs a real `fetch()` POST against the live test HTTP server and asserts on the JSON response body (`total`, `empty_reason`, `relationship_types` contents), including the "empty registry" repair path.
- Same file's CLI block runs `runNeotomaCli([...,"relationship-types","list"])` through the real `runCli` entrypoint against the live server and asserts on parsed stdout.
- `tests/contract/relationship_type_enum_parity.test.ts` and `relationship_type_single_source.test.ts` verify the MCP tool schema/description shape via `buildToolDefinitions()`.

### Relationship-type CLI commands (`relationship-types list` / `relationship-types register`)

**`list`: covers user-observable behavior end-to-end. `register`: GAP for the success path** (see register_relationship_type above — `tests/cli/relationship_types_cli.test.ts` and `empty_registry_builtin_repair_e2e.test.ts` both invoke the real `runCli` entrypoint against a live HTTP base URL, but the `register` coverage is denial-only: capability-denial and invalid-scope validation-error cases, no completed successful registration read back).

### Schema-registry scope-precedence fix (`SchemaRegistryService.activate`)

**Covers user-observable behavior end-to-end.** `tests/integration/schema_scope_resolution_parity.test.ts` calls the real, unmocked `schemaRegistry.activate()` against real SQLite rows owned by two distinct principals and asserts that activation resolves only the caller's own or the global row, fails closed with `Schema not found` otherwise, and leaves the other principal's row unchanged. `tests/integration/schema_scope_surface_parity.test.ts` extends this to real HTTP (`GET /schemas`) and MCP tool calls, confirming all read surfaces agree. `tests/services/schema_registry_incremental.test.ts` is a fully mocked companion (branch-coverage only, not independent proof of the fix — the module-level `db.js` mock means every assertion only confirms the expected query-chain shape, not that real SQLite honors the filter).

### POST /mcp stateless transport (2026-07-28)

**Covers user-observable behavior end-to-end.** `tests/helpers/mcp_http_modern.ts` boots the real Express `app` on a real loopback TCP socket and issues real `fetch()` POSTs to `/mcp`. On that harness: `tests/integration/mcp_http_stateless_auth_resolution.test.ts` drives two independently booted "replica" apps sharing a data dir through a realistic multi-call sequence with no session minted, asserts sequential requests with different credentials resolve independently, asserts 16 interleaved concurrent requests from two identities stay isolated, and asserts a credential revoked mid-flight is refused with a typed 401 before any method executes. `tests/integration/mcp_http_method_name_headers.test.ts` and `mcp_http_server_discover.test.ts` cover the header-based credential/PII screen and `server/discover`'s response shape over the same real-HTTP harness. `tests/integration/mcp_server_process_listeners.test.ts` confirms 50 served stateless requests add zero `process.on` listeners.

### Tenant-isolation fixes generally

**Covers user-observable behavior end-to-end.** `tests/security/tenant_isolation_matrix.test.ts` seeds two real users' data in real SQLite and drives real HTTP endpoints, including two adversarial vectors (a planted cross-tenant relationship edge probing multi-hop BFS leakage, and a bulk-import request smuggling a per-line `user_id` override). `tests/security/scoped_source_and_relationship_reads.test.ts` covers the new `src/services/scoped_reads.ts` module's real call sites, consistently asserting a foreign-owned id is refused identically to a missing id. `tests/security/store_external_actor_claim.test.ts` confirms a caller cannot spoof a server-verified attribution tier. `tests/unit/aauth_grant_key_binding.test.ts` uses real RFC 9421 signatures and the real middleware chain.

### Worker DB abort containment fix (#2483)

**Covers user-observable behavior end-to-end.** `tests/integration/unhandled_abandoned_abort_containment.test.ts` spawns the real compiled `dist/actions.js` as the production entrypoint, forces the real autostart path, injects a real `WorkerDbAbortError` as an unhandled rejection, and asserts the process survives, a real DB read stays healthy across the event, the exact structured diagnostic fields match production code, and a differently-typed unhandled rejection still crashes the process (proving the handler is narrowly scoped). It also carries 9 dedicated cases for the test-only `NEOTOMA_ACTIONS_TEST_FOLLOWUP_MODULE` entrypoint hook's containment (production refusal, prefix isolation, percent-encoding bypass, symlink-escape refusal, etc.) — independently confirmed against `src/actions.ts:13505-13554`, which resolves via `fs.realpathSync` before either check and imports the canonical resolved path via `pathToFileURL(...).href`, closing the exact bypass the hardening review described.

### Cycle-detection (relationship-type registry, `acyclic` flag)

**Covers user-observable behavior end-to-end**, including the previously-fixed fail-open bug. `tests/services/relationship_type_security.test.ts` creates a real `PART_OF` edge via the actual service and asserts the reverse edge throws `/cycle/i`; separately asserts fail-closed behavior on a hand-inserted corrupt registry row (the exact `parseDefinition` fail-open class this release fixed) and on a DB read failure during the DFS traversal.

## Code review

### Pre-PR checklist walk

1. `openapi.yaml` edited first; `npm run openapi:generate` output committed — ✓. New operations (`registerRelationshipType`, `listRelationshipTypes`, `mcpStreamableHttpPost`) and response-field additions are present in `openapi.yaml` with matching TS types.
2. `contract_mappings.ts` updated for new operationId/MCP tool/CLI command — ✓. Verified `registerRelationshipType` → `/register_relationship_type` and `listRelationshipTypes` → `/list_relationship_types` rows exist (`src/shared/contract_mappings.ts:691-703,940-941`); `mcpStreamableHttpPost` → `/mcp` row pre-exists and is unchanged in shape.
3. `npm test -- tests/contract/` passes — ✓. This reviewer's own attempt hit `SQLITE_READONLY` because this worktree's ambient `.env` points at the shared production SQLite file — a local environment artifact, not a defect in the diff. Re-run with an isolated `NEOTOMA_DATA_DIR` (per the contract/CLI/docs review pass): 20 files, 220 tests, all passing.
4. New top-level CLI commands in `cli_command_coverage_guard.test.ts` — ✓. `relationship-types` is present (`tests/cli/cli_command_coverage_guard.test.ts:36`).
5. MCP and CLI agent-instruction parity — ✗ BLOCKING. Diffed `docs/developer/mcp/instructions.md` against `docs/developer/cli_agent_instructions.md`. Behavioral content is present in both (parity of substance is fine), but the "Relationship type discovery and registration" section was pasted byte-identically into both files (confirmed programmatically) rather than following the required canonical-doc-plus-pointer mechanism that the endpoint-ownership and schema-scope-mismatch additions in this same diff correctly use. See BLOCKING finding below.
6. Runtime overrides follow `flag > env > default` — — N/A. No new runtime override introduced in this diff.
7. New env vars `NEOTOMA_`-prefixed, read in `preAction` — — N/A. No new `NEOTOMA_*` env var added (the pre-existing `NEOTOMA_ACTIONS_TEST_FOLLOWUP_MODULE` and `NEOTOMA_ACTIONS_SKIP_HTTP_SERVER_FOR_TEST` gates are hardened, not newly introduced as user-facing overrides).
8. Error hints structured, not concatenated into `message` — ✗ BLOCKING for one path, ✓ elsewhere. `ERR_SCHEMA_SCOPE_MISMATCH` and the new `MCP_*` transport error codes use structured `hint`/`details` fields correctly. But `create_relationship`'s `OwnedEntityNotFoundError` branch on both the REST (`src/actions.ts:10165-10169`) and MCP (`src/server.ts:3738-3743`) paths carries no hint at all, unlike the sibling `UnregisteredRelationshipTypeError` branch immediately above it in both files. See BLOCKING finding below.
9. Tightening-change hint obligation — ✗ BLOCKING. `create_relationship_unowned_target` is correctly seeded as `rejected` with a `CHANGES.md` entry and is named in the supplement's Breaking/Behavior changes section (two of three legs satisfied), but the actual API response for this tightening carries no structured hint on either REST or MCP direct-call paths (the third leg), and the fixture's `outcome.yaml` correspondingly omits the `hint_match` field every other tightening fixture in the corpus carries. Same finding as item 8.
10. `openapi:bc-diff` reviewed for release PR — ✓. Independently re-ran `npm run -s openapi:bc-diff -- --base v0.23.1 --head HEAD`; output matches the known-context exactly: 9 "removed-response-field" entries, all on `POST /update_schema_incremental [200]`, and independently confirmed as a false positive by inspecting `openapi.yaml:7283-7338` — the response schema is a `oneOf` with the unchanged success shape as the first branch and `SchemaRegistryToolErrorResponse` as the second; the diff tool does not traverse `oneOf`. 11 non-breaking additions also match.
11. `legacy_payloads/replay.test.ts` passes; outcome flips paired with `CHANGES.md` — ✓ for test execution (17/17 passing, re-run in an isolated environment), ✗ BLOCKING for the hint-match content gap (see items 8-9 above).
12. `additionalProperties: false` on new top-level request bodies — ~ advisory. Neither `register_relationship_type` nor `list_relationship_types` request bodies declare `additionalProperties: false` (`openapi.yaml:7368-7479`). This is not a strict repo-wide convention (46 of 111 operations declare it), and the advisory-fields design (`source_entity_types`, `inverse`, `symmetric` are explicitly documented as non-enforced/best-effort) suggests an open shape may be intentional for forward compatibility, but it is undocumented as such and the corresponding Zod schemas are not `.strict()` either, so an unrecognized field is silently accepted rather than surfaced as `ERR_UNKNOWN_FIELD`.
13. New response fields declared in `openapi.yaml`, populated consistently — ✓. `GET /me` (`authenticated_user_id`/`shared_graph`), `StoreStructuredResponse`/`CreateInterpretationResponse` (`relationships_created`/`relationships_refused`), `agents/grants` (`warnings`) all declared and populated at their respective handler/service sites per subagent verification.
14. Release-visible changes documented in supplement; historical supplements untouched — ✓. `docs/releases/in_progress/v0.24.0/github_release_supplement.md` exists, is thorough, and no `docs/releases/completed/` file was touched in this diff.
15. `schema_agnostic_design_rules.md` re-read when adding per-type behavior — ✓. The relationship-type registry migration is a model example: the old 28-member hardcoded array in `inspector/src/lib/constants.ts` is fully removed with an explicit "no hardcoded fallback" design comment, `relationships.ts`'s `validTypes` Set is fully removed, and no remaining reference to the old array exists anywhere in `inspector/src/` (verified via repo-wide grep). No new hardcoded per-type branch was found introduced as a side effect.
16. Data-layer changes preserve determinism — ✓ with one advisory. Reproducible IDs and stable ordering are preserved; entity/event ID derivation is untouched. The relationship-type registry's race/duplicate-handling story is documented and has a real regression test (`tests/services/relationship_type_registration.test.ts` "a truly concurrent duplicate registration...is absorbed, not a 500"), but that test issues two **sequential** awaited calls with an explicit pinned `registry_version`, not genuinely concurrent overlapping calls — see ADVISORY finding below. Ordinary (non-pinned-version) concurrent registrations from independent callers get distinct millisecond timestamps and do not exercise the UNIQUE-constraint collision path this test proves safe.
17. Mutating ops honor `idempotency_key`; ingestion writes transactional — — N/A / unchanged in this diff's scope (no ingestion/store idempotency-key handling was modified).
18. No new PII in logs/metrics/events — ✓. Connection-id logging is consistently redacted via a SHA-256 fingerprint helper; no raw connection ids, credentials, or PII found in any new log line across all four review passes.
19. Renamed files snake_case, symlinks updated — — N/A. No file renames in this diff.
20. Security gate results recorded — ✓. `docs/releases/in_progress/v0.24.0/security_review.md` exists with a full adversarial walkthrough and a `with-caveats` sign-off (caveat: an advisory disclosure for the schema-activation fallback fix is still outstanding — see Phase 5c below).
21. New Express routes in `protected_routes_manifest.json` — ✓. `POST /mcp`, `POST /register_relationship_type`, `POST /list_relationship_types` are all present and `npm run security:manifest:check` reports in sync (123 routes), per the security review.
22. No bare `req.socket.remoteAddress`/`X-Forwarded-For`/`Host` reads outside canonical helpers — ✓. Confirmed by the security review and independently spot-checked; the production-detection unification consolidates rather than forks this logic.
23. **User-facing-surface coverage** — see "Surface-by-surface coverage" above. Summary: `list_relationship_types`, the MCP stateless transport, tenant-isolation fixes, the worker-abort containment fix, and cycle-detection are all covered end-to-end. `register_relationship_type`'s success path (HTTP, CLI, and public MCP dispatch) is a GAP — only the denial path is proven at the public-surface level; the success path is proven only at the service layer or via a private-method MCP call.
24. npm script naming convention — — N/A. No new/renamed top-level npm scripts in this diff.
25. No unstable iteration over `Object.keys()`/`Map`/`Set` in stored/returned-output paths — ✓. The registry's `latestPerKey` reduction uses an explicit deterministic tiebreak (`registry_version` string comparison) when `created_at` ties; no unsorted iteration found feeding stored or returned output in the reviewed files.

### Phase 5 — Architectural review

```
[BLOCKING] docs
File: docs/subsystems/relationships.md:489-505 (§8 Cycle Detection)
Rule: change_guardrails_rules.md — canonical doc must reflect shipped behavior
Finding: §8 still describes the pre-fix, type-blind/tenant-blind/unbounded detectCycle()/getAncestors() pseudocode as unconditional behavior for PART_OF/DEPENDS_ON. The actual implementation (RelationshipsService's acyclic-flag check backed by the relationship-type registry) is opt-in per registered type, tenant-scoped, and depth-bounded (1000-node fail-closed limit) — a deliberate rewrite documented at length in registry.ts. This section was not touched even though §6.1 elsewhere in the same file was updated in this diff, so the doc now describes a mechanism that no longer exists and omits the one that replaced it.
Fix: Rewrite §8 to describe the registry's `acyclic` field, name the enforcing function, state the traversal bound and fail-closed behavior on corrupt/unreadable rows, and correct "PART_OF/DEPENDS_ON relationships should not form cycles" to reflect that cycle-checking is opt-in per registered type via `acyclic: true`.
```

```
[BLOCKING] docs
File: docs/developer/cli_reference.md
Rule: change_guardrails_rules.md Touchpoint Matrix "New or changed CLI command"; supplement itself points here
Finding: `neotoma relationship-types list` and `neotoma relationship-types register` (new in this diff, `src/cli/index.ts` ~12605-12660) have no documented syntax, options, or examples anywhere in cli_reference.md. The only relationship-type-related change in that file is a one-line rewording of the pre-existing `relationships get-snapshot` entry. The release supplement explicitly states "See docs/developer/cli_reference.md" for this command family, making the omission a doc that now contradicts what the release's own shipped documentation claims exists.
Fix: Add a "Relationship Types" subsection documenting `relationship-types list [--keyword] [--scope] [--include-edge-count]` and `relationship-types register --relationship-type <type> [--description] [--scope] [--acyclic] [--inverse] [--symmetric] [--source-entity-types] [--target-entity-types]`, matching the pattern used for other command groups in the file. Independently confirmed by two separate review passes.
```

```
[BLOCKING] error-handling
File: src/actions.ts:10165-10169 and src/server.ts:3738-3743
Rule: change_guardrails_rules.md constraint 13 — Tightening-change hint obligation
Finding: `create_relationship`'s new ownership-enforcement tightening (`OwnedEntityNotFoundError`, commit c44cee51f) returns no structured `hint` on either the REST or MCP path. Verified directly against both files: the sibling `UnregisteredRelationshipTypeError` catch branch immediately above passes `hint: error.hint` in both handlers, while the `OwnedEntityNotFoundError` branch three lines below returns only `error.message`/`entity_id` — for the identical class of previously-accepted-input-now-rejected tightening this same release introduces. The sibling relationship-refusal path used by `store`/`create_interpretation` (`relationshipRefusalFromError` in `src/services/store_relationships.ts:111-119`) DOES carry a hint for the identical error condition, so the correct fix pattern already exists in the codebase — it was simply not applied to these two direct-call surfaces.
Fix: Add a `hint` to both catch branches (e.g. "Both endpoints must be entities you own. Store the entity first, or in the same store call referenced by index, then link it."), mirroring `relationshipRefusalFromError`'s existing wording. Add a `hint_match` assertion to `tests/contract/legacy_payloads/v0.23.x/create_relationship_unowned_target.outcome.yaml` once the hint exists, consistent with every other tightening-change fixture in the corpus.
```

```
[BLOCKING] agent-instructions
Files: docs/developer/mcp/instructions.md and docs/developer/cli_agent_instructions.md — "Relationship type discovery and registration" section
Rule: .claude/rules/agent_instructions_sync_rules.md — "Forbidden: Reintroducing a line-by-line MCP ↔ CLI duplicate mirror in cli_agent_instructions.md"
Finding: Independently confirmed programmatically (string comparison) — the new "Relationship type discovery and registration" section is byte-identical (3065 characters) across both files, rather than the canonical-doc-plus-pointer split `cli_agent_instructions.md` uses everywhere else in this same diff (e.g. the "Relationship endpoints must be owned entities" and schema-scope-mismatch additions both correctly use "see docs/developer/mcp/instructions.md §X" pointers). This one section breaks the pattern established elsewhere in the identical diff.
Fix: In `docs/developer/cli_agent_instructions.md`, replace the duplicated section with a short pointer to the canonical section in `docs/developer/mcp/instructions.md`, naming the CLI equivalents (`neotoma relationship-types list` / `register`) inline. Keep the full text only in the MCP doc. Note: MCP↔CLI *behavioral* parity is still required and is correctly present in substance — the defect is the duplication mechanism, not a content or parity gap.
```

```
[ADVISORY] test-coverage
File: tests/services/relationship_type_registration.test.ts:352-389
Rule: task instruction — verify a genuinely TESTED race/duplicate-handling story, not an assumed one
Finding: The test titled "a truly concurrent duplicate registration (same key AND same registry_version) is absorbed, not a 500" issues two SEQUENTIAL awaited calls to `register()` with the same explicitly pinned `registry_version`, not two overlapping in-flight calls. This proves idempotent-retry behavior but not genuine concurrent contention on the INSERT. More importantly: for ordinary (non-built-in) callers, `registry_version` defaults to a live `new Date().toISOString()` per call — two independent callers registering the same type moments apart typically get DIFFERENT registry_versions and never exercise the UNIQUE-constraint collision path this test proves safe at all.
Fix: Add a true concurrent test using `Promise.all([register(...), register(...)])` with a mocked clock forcing the same default registry_version, to prove the actual two-callers-in-the-same-millisecond case; or soften the module's documentation to state plainly that ordinary concurrent registrations of the same type are NOT deduplicated by the UNIQUE index (each becomes a distinct row, later one wins per latestPerKey) — a materially different and currently overstated guarantee.
```

```
[ADVISORY] contract
File: openapi.yaml:7368-7419 (register_relationship_type), 7458-7479 (list_relationship_types)
Rule: Pre-PR checklist item 12 — additionalProperties: false unless intentional and documented
Finding: Both new POST request bodies omit `additionalProperties: false`; the matching Zod schemas are not `.strict()` either. Not a strong repo-wide violation (many existing operations also lack it), but the advisory-metadata design intent (open for forward compatibility) is not documented as an explicit exception.
Fix: Either add `additionalProperties: false` plus `.strict()` on the Zod schemas, or add a one-line schema `description` stating the open shape is intentional for forward-compatible advisory metadata.
```

```
[ADVISORY] test-coverage
File: register_relationship_type surface (HTTP + public MCP dispatch)
Rule: task instruction — surface coverage must exercise user-observable behavior end-to-end, not a helper only
Finding: No test drives a *successful* `register_relationship_type` call to completion through a real HTTP POST or the public MCP tool-dispatch path and reads the registered type back. Existing coverage proves the denial path end-to-end on all three surfaces and proves the success path only at the service layer (bypassing capability enforcement) or via a private-method MCP call (bypassing public dispatch).
Fix: Add one HTTP-level test (`fetch()` POST to `/register_relationship_type` with a valid grant) and one CLI-level test asserting a successful registration, then a `list_relationship_types` read-back confirming the new type appears.
```

```
[ADVISORY] docs
File: docs/subsystems/auth.md
Rule: task requirement — docs must reflect new tenant-isolation/scoping mechanisms
Finding: auth.md documents the shared-graph identity/scope split (#2228) but does not mention three other genuinely new tenant-isolation mechanisms landed in this release: the schema-registry scope-precedence fix, the register_relationship_type governance-capability gate (including the raw-store/correct choke-point guard), and the new src/services/scoped_reads.ts generalized ownership-check module. Not inaccurate, just incomplete relative to the size of this release's tenant-isolation work.
Fix: Add a short subsection under Authorization naming these three mechanisms and pointing at their regression tests.
```

```
[ADVISORY] doc-completeness
File: docs/specs/MCP_SPEC.md § 3.30 "Extended tools (registry parity)"
Rule: The doc's own stated obligation: "When adding or renaming an MCP tool, update this catalog, NEOTOMA_TOOL_NAMES, and the change-guardrails checklist"
Finding: `register_relationship_type` and `list_relationship_types` are both new first-class MCP tools (present in `NEOTOMA_TOOL_NAMES`, `contract_mappings.ts`, and `tool_descriptions.yaml`) but neither appears in the §3.30 table, which exists specifically to catalog tools without a dedicated numbered subsection. Comparable recent additions (peer-sync tools, submission-flow tools) are present in this table; these two are not.
Fix: Add two rows to the §3.30 table for both tools, matching the table's existing format.
```

```
[ADVISORY] doc-completeness
File: docs/reference/error_codes.md, docs/subsystems/errors.md
Rule: Phase 5c instruction — verify new error codes are listed
Finding: `ERR_SCHEMA_SCOPE_MISMATCH` and `ERR_NO_SCHEMA_FOR_ENTITY_TYPE` are well documented with examples, but the relationship-refusal codes this diff surfaces on the relationships endpoints (`unregistered_relationship_type`, `RELATIONSHIP_ENDPOINT_NOT_FOUND`, `RELATIONSHIP_REFERENCE_UNRESOLVED`, `RELATIONSHIP_INVALID_ENTITY_ID`, `RELATIONSHIP_NOT_CREATED` — all documented inline only in openapi.yaml's `RelationshipRefusal.code` description) do not appear in either canonical error-code doc.
Fix: Add a "Relationship Errors" entry to docs/reference/error_codes.md, or a pointer to docs/subsystems/relationships.md § 6.1 where the codes are already used in context.
```

```
[ADVISORY] test-coverage
File: tests/unit/webhook_url_allowed.test.ts / src/services/subscriptions/webhook_delivery.ts:14
Rule: task requirement — assess whether SSRF-adjacent coverage is real
Finding: `isWebhookUrlAllowed` checks only URL scheme (https, or http to localhost) with no private/internal IP-range check (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254 cloud metadata), no DNS-resolution check, and no redirect restriction. A URL like `https://169.254.169.254/latest/meta-data/` passes this gate in production. This is pre-existing (only the function's `isProductionEnvironment` dependency was touched in this release), not a new regression, but the new test file locks in the existing incomplete behavior without flagging the gap.
Fix: File a follow-up issue for private-IP/metadata-endpoint blocking on webhook delivery; not a blocker for this release.
```

```
[NIT] test-coverage
File: tests/unit/mcp_instructions_schema_scope_mismatch.test.ts
Rule: task requirement — distinguish real end-to-end coverage from decoration
Finding: Pure documentation/string-presence check against markdown/YAML files; asserts nothing about ERR_SCHEMA_SCOPE_MISMATCH's runtime behavior and would still pass if the real error path were broken.
Fix: No change required — the real behavioral coverage lives in tests/integration/update_schema_incremental_scope_mismatch.test.ts. Consider renaming this file to make its docs-only scope explicit.
```

```
[NIT] naming
File: src/services/agent_grants.ts:627
Finding: findActiveGrantByIdentity is now a thin wrapper around lookupGrantForIdentity with zero remaining internal callers.
Fix: Remove if no external consumer needs the pre-#2356 shape, or comment why it's kept.
```

```
[NIT] style
File: .github/workflows/ci_test_lanes.yml:202
Finding: Comment "Forces the libsql backend (NEOTOMA_DB_BACKEND)" on the new CI step is misleading in isolation — the forcing happens inside the test file's spawned child process, not the workflow step.
Fix: Reword the comment to point at tests/integration/unhandled_abandoned_abort_containment.test.ts's spawnChild().
```

No findings for: State Layer boundaries (no strategy/orchestration logic introduced), schema-agnostic design beyond the relationship-type migration (clean), immutability (no in-place mutation of observations/sources found), the auth surface constraints in `src/actions.ts`/middleware (production-detection unification consolidates rather than forks logic; no new `req.socket.remoteAddress` reads outside canonical helpers; no new `LOCAL_DEV_USER_ID` references outside allowed paths), portability (no hardcoded paths in the touched CI/workflow files), or PII (none found in logs, metrics, or error messages across all four review passes). Error handling has two BLOCKING gaps specific to the `create_relationship` ownership tightening (see above) — otherwise structured-hint discipline is sound across the diff (schema-scope-mismatch and MCP transport errors are all correctly structured).

### Phase 5b — Product/UX and principles alignment

No findings requiring action. Every new response field (`shared_graph`, `authenticated_user_id`, `relationships_refused`, `relationships_created`, `warnings`) is explicit, additive, and declared in `openapi.yaml` — no silent behavior change was found where a caller couldn't tell from the response that something changed. Defaults are fail-closed and privacy-preserving throughout (production-environment detection defaults to production on an unrecognized value; `register_relationship_type` scope defaults to the safe "user" branch, inverting `register_schema`'s riskier default; AAuth grant admission requires key-thumbprint binding). One NIT: `agent_grant_form.tsx`'s `match_thumbprint` field is not marked `required` in the UI even though a grant without it "stays inert" per the updated hint text — server-side validation is the actual enforcement point, so this is cosmetic only.

### Phase 5c — Documentation completeness

Strong overall, with three gaps. New error codes (`ERR_SCHEMA_SCOPE_MISMATCH`, the `MCP_*` transport error family) are documented in both `docs/subsystems/errors.md` and `docs/reference/error_codes.md` with response-shape examples — but the relationship-refusal codes are not (ADVISORY above). `docs/developer/mcp/tool_descriptions.yaml` is correctly updated for `register_relationship_type`/`list_relationship_types` (notable because this exact file was called out in code comments as having drifted before — it previously advertised 8 relationship types while the schema had 28), but `docs/specs/MCP_SPEC.md`'s own tool catalog (§3.30) was not updated for the same two tools (ADVISORY above). `docs/developer/mcp/instructions.md` and `docs/developer/cli_agent_instructions.md` carry identical new sections for the relationship-type material — this satisfies substantive parity but violates the required canonical-plus-pointer mechanism (BLOCKING above); the endpoint-ownership and schema-scope-mismatch additions in the same diff correctly use the pointer pattern instead. `docs/subsystems/relationships.md` §6.1 is well updated for ownership/refusal semantics, but §8 (Cycle Detection) was left describing the removed pre-fix mechanism (BLOCKING above). `docs/developer/cli_reference.md` is missing the new command family entirely (BLOCKING above, confirmed independently twice). Disclosure for the schema-activation scope fix is handled through the project's private advisory process (see `security_review.md` finding 7) and is out of scope for this file.

## Supplement accuracy (informational — no supplement-gating check performed per task scope, but spot-checked since one already exists)

The in-progress supplement at `docs/releases/in_progress/v0.24.0/github_release_supplement.md` was spot-checked against code and found accurate on every claim independently verified: the `oneOf` restructuring of `update_schema_incremental`'s response, the `bc-diff` false-positive characterization (9 removed / 11 added, both independently re-run and matched exactly), the `POST /mcp` / `register_relationship_type` / `list_relationship_types` new-operation list, and the "Breaking changes" section's explicit accounting. One inaccuracy found: the supplement's "New `neotoma relationship-types` command family... See `docs/developer/cli_reference.md`" line points to a file that does not in fact document this command family (see BLOCKING finding above) — the supplement's own citation is currently false.

--- Review Summary ---
Base..Head: v0.23.1..HEAD
Files reviewed: 165 (all files diffed; full-body reads performed on all high-risk surfaces and all listed test files across four parallel review passes plus independent spot-verification, including two independent re-runs of `npm run openapi:bc-diff` and a full `npm test -- tests/contract/` + `tests/contract/legacy_payloads` pass in an isolated environment: 220 + 17 tests passing)
Blocking: 4
Advisory: 7
Nit: 3

Verdict: NEEDS-CHANGES

Must fix before merge:
- `docs/subsystems/relationships.md` §8 Cycle Detection describes the removed pre-fix mechanism (type-blind, tenant-blind, unbounded `detectCycle`/`getAncestors`) and omits the shipped one (opt-in `acyclic` flag, tenant-scoped, depth-bounded) — actively contradicts current code.
- `docs/developer/cli_reference.md` does not document the new `neotoma relationship-types list/register` command family, despite the release supplement citing that file as the place to find it — confirmed independently by two review passes.
- `create_relationship`'s `OwnedEntityNotFoundError` tightening carries no structured `hint` on either the REST (`src/actions.ts:10165-10169`) or MCP (`src/server.ts:3738-3743`) path, unlike the sibling `UnregisteredRelationshipTypeError` branch immediately above it in both files and unlike the identical error class's handling in `store`/`create_interpretation`'s refusal path — violates the Tightening-change hint obligation for a genuine new-in-this-release rejection.
- The new "Relationship type discovery and registration" section was pasted byte-identically (confirmed programmatically, 3065 characters) into both `docs/developer/mcp/instructions.md` and `docs/developer/cli_agent_instructions.md`, rather than following the canonical-doc-plus-pointer mechanism the sync rules require and that the rest of this same diff correctly uses for its other new sections. Behavioral parity is fine; the duplication mechanism is the defect.

Should address in follow-up:
- Add HTTP- and CLI-level tests for a *successful* `register_relationship_type` call (current coverage proves denial end-to-end but proves success only at the service layer or via a private MCP method call).
- Either add a genuinely concurrent (`Promise.all`, mocked-clock) test for the relationship-type registration race, or correct the module doc's claim that ordinary concurrent registrations are deduplicated (they are not, for non-pinned `registry_version` callers).
- Add `additionalProperties: false` (or a documented exception) to the two new relationship-type request bodies; add matching `.strict()` to the corresponding Zod schemas.
- Expand `docs/subsystems/auth.md` to name the three additional tenant-isolation mechanisms shipped in this release.
- Add the two new relationship-type MCP tools to `docs/specs/MCP_SPEC.md` §3.30's own catalog table, per that section's stated update obligation.
- Add the relationship-refusal error codes (`RELATIONSHIP_ENDPOINT_NOT_FOUND`, `RELATIONSHIP_REFERENCE_UNRESOLVED`, etc.) to `docs/reference/error_codes.md`.
- File a follow-up issue for the pre-existing SSRF gap in webhook URL validation (no private-IP/metadata-endpoint blocking) — not a regression, but newly adjacent to touched code.
- Schema-activation scope fix: disclosure sequenced by the advisory owner (see `security_review.md`).


## rc3 delta (2026-09-29)

Branch `release/v0.24.0-rc3` = `origin/main` at `4578f8e2e` plus the rc2 release commit, cherry-picked cleanly. Eight commits were added relative to rc2: #2513, #2472, #2516, #2474, #2520, #2163, #2519 and #2514. Each surface below was classified by reading the named test bodies' cases, not by file existence.

### Resolution of the four rc2 BLOCKING findings

All four were fixed in the rc2 release commit and carry forward unchanged into rc3:

- `docs/subsystems/relationships.md` §8 now describes the opt-in `acyclic` flag, type- and tenant-scoped, depth-bounded check in `RelationshipsService.assertAcyclicWrite`.
- `docs/developer/cli_reference.md` documents `neotoma relationship-types`.
- `create_relationship`'s ownership refusal carries the structured hint on both REST (`src/actions.ts`) and MCP (`src/server.ts`); `tests/contract/legacy_payloads/v0.23.x/create_relationship_unowned_target.outcome.yaml` asserts the REST hint via `hint_match` (its endpoint is `POST /create_relationship`). The MCP half of the hint is not asserted by any test; that is tracked in Neotoma task `ent_a5bf01a0df43c3aee77251e2`, and the fix is the same on both paths.
- `docs/developer/cli_agent_instructions.md` now points at the canonical section in `docs/developer/mcp/instructions.md` instead of duplicating it.

The rc2 verdict below (`NEEDS-CHANGES`) is therefore superseded by the rc3 verdict at the end of this section.

### Entity-write ownership (#2519)

**Covers user-observable behavior at the service choke points; HTTP/MCP envelope covered for grant writes.** `tests/services/entity_resolution_cross_owner_conflict.test.ts` drives `resolveEntityWithTrace` for a heuristic match and an explicit `target_id` on another owner's entity (both refused, the owner's snapshot unchanged), plan mode (`commit:false`) refusing identically, same-owner merge still working, and adoption of null-owner and legacy-test-owner rows; it also calls `createObservation` and `createCorrection` directly with another owner's id. `tests/services/by_id_write_ownership_conflict.test.ts` covers `resolveSyncConflict` (manual), `applyBatchCorrection` (including an empty change set) and `loadEntityForEdit`, asserting the refusal is indistinguishable from a missing id. `tests/services/entity_split_cross_owner_conflict.test.ts` and `tests/services/agent_grant_cross_owner_conflict.test.ts` cover split and grant writes; `tests/services/entity_resolution_owner_conflict_tenant_scoped_unaffected.test.ts` is the no-false-positive control. [NON-BLOCKING] test-coverage: no test asserts the REST `409` / MCP `InvalidRequest` envelope for `entity_owner_conflict` on `POST /store` / `POST /correct` for a non-grant entity; the service-layer refusal is proven, the transport mapping is proven only for grants.

### AAuth key-bound identity and pin uniqueness (#2513)

**Covers user-observable behavior end-to-end.** `tests/integration/agent_grant_thumbprint_pin_uniqueness.test.ts` exercises the grants service (create, update, same-owner re-pin allowed, revoked and suspended grants keep their pin), REST `/agents/grants` create and update (`409`), REST `/store` and `/correct`, MCP `store` and `correct`, and grants import. `tests/unit/aauth_key_bound_identity.test.ts` and `tests/integration/aauth_tier_resolution.test.ts` cover tier resolution from the pinning grant and the thumbprint allowlist; `tests/unit/agent_grant_pin_checks.test.ts` covers returning a grant to service (status restore, `_deleted: false` correction) under another owner's pin and the bounded identity-lookup cache; `restore_entity`, `merge_entities` and `split_entity` refusals are exercised in the integration suite above.

### Loopback-default HTTP bind (#2472)

**Covers user-observable behavior end-to-end.** `tests/security/http_listener_bind_host.test.ts` binds a real socket and reads back the bound address: default `127.0.0.1`, explicit `0.0.0.0` opt-in, ephemeral-port readback, and undefined / empty / whitespace host values all failing safe at the sink. `tests/security/sandbox_mode_resolver.test.ts` covers the posture derivation.

### Development proxy bind (#2474)

**Covers user-observable behavior.** `tests/security/proxy_bind_host.test.ts` covers `resolveProxyBindHost()` default and opt-in. Dev tooling only.

### MCP OAuth local-backend code binding (#2520)

**Covers user-observable behavior end-to-end.** `tests/integration/mcp_oauth_token_endpoint.test.ts` drives the real token endpoint: bare connection id refused, mismatched verifier refused and the code consumed, replay refused, missing verifier refused, correct pair issues a working token exactly once, refresh-token grant still works, and the OpenAI Custom GPT no-PKCE flow completes only for the exact callback. `tests/integration/mcp_oauth_local_login_preflight_gate.test.ts` covers the credential preflight on both entry routes. [NON-BLOCKING] docs: `openapi.yaml`'s `code_verifier` description says "Required with grant_type=authorization_code" without naming the Custom GPT exception the code and tests implement.

### Outbound host guard (#2163)

**Covers user-observable behavior end-to-end.** `tests/security/ssrf_sink_wiring.test.ts` asserts each of the five sinks refuses before fetching in hosted mode (stubbed `fetch`); `tests/integration/ssrf_guard_cross_surface_parity.test.ts` asserts MCP and HTTP `subscribe` reject the same internal webhook URL, accept a public one, and that `add_peer` stays store-time permissive with the guard applied at fetch time; `tests/security/ssrf_guarded_fetch_redirects.test.ts` and `tests/security/ssrf_outbound_host_guard.test.ts` cover redirects and the hostname classifier. This discharges the rc2 follow-up about webhook URL validation.

### `neotoma mcp config` deliberate-entry guard (#2516)

**Covers user-observable behavior.** `tests/cli/cli_mcp_commands.test.ts` covers the classifier (command, args, env and URL-transport entries), refusal under `assumeYes` and `rewriteExistingNeotoma`, the backup, and installing a missing slot alongside an untouched deliberate entry.

### `security_gates` CI wiring (#2514)

**Covers the contract it names.** `tests/contract/security_gates_ci_wiring.test.ts` fails on each of the four regression shapes (per the commit, each was reverted locally and confirmed red).

### Legacy-payload corpus

[NON-BLOCKING] contract: the `main` merge adds a further tightening, the guest subscription refusals (`403` for a guest `subscribe` outside its grant, with webhook delivery, or with a sync peer), which has no fixture either because the corpus cannot present a guest principal. It is named with a migration note in the supplement's Breaking changes section. The rc3 tightenings (`entity_owner_conflict`, `agent_grant_pin_conflict`, `/mcp/oauth/token` without `code_verifier`) have no fixture under `tests/contract/legacy_payloads/`, and `CHANGES.md` has no v0.24.0 line for them. The cross-owner cases need two seeded users, which the corpus runner cannot express (the existing `create_relationship_unowned_target` fixture documents the same limitation); the missing-verifier case is expressible and should be added in a follow-up. All three are named, with migration notes, in the supplement's Breaking changes section, which is the part of the obligation that gates release.

### main merge delta: guest subscription scoping (#2517)

**Covers user-observable behavior end-to-end over REST and SSE; CLI covers credential selection only.** Classified by reading the named cases.

- REST: `tests/integration/guest_subscription_owner_scope.test.ts` drives the real routes with guest tokens. It covers the full in-grant lifecycle and the refusal of empty and mixed scopes with no effect on stored rows; a guest cannot list subscriptions outside its grant, cannot create one over unrelated `entity_ids`, and cannot cancel one outside its scope; every guest HTTP surface refuses a mixed subscription while the owner keeps access over MCP; webhook and peer-sync creation by a guest is refused with `403` and writes nothing.
- Unit: `tests/subscriptions/guest_scope.test.ts` pins `subscriptionWithinGuestScope` (every watched entity must be in the grant, a fully contained subscription is accepted, an unscoped subscription fails closed).
- SSE: `tests/integration/events_stream.test.ts` closes an established guest stream before delivery after its grant narrows; `tests/subscriptions/sse_hub_dead_client_eviction.test.ts` closes and evicts a client whose credential is no longer authorized and still delivers to the next client when an authorization check unregisters its own client.
- CLI: `tests/cli/request_guest_subscription.test.ts` asserts, for subscribe, list, status and unsubscribe, that `--guest-access-token` is sent instead of the configured owner token (with the owner token deliberately set in the environment), that `eventsStream` opens with the guest credential and prints the frames, and that a structured `403` from the API is preserved. The transport is a stubbed `fetch`, so this proves credential selection and output handling, and the server behavior is proven by the REST and SSE suites above.
- Existing suites updated for scoped tokens: `subscription_list`, `subscription_unsubscribe`, `guest_write_rate_limit` and `tests/contract/contract_mapping.test.ts` (the new operation parameters are mapped).
- Red-before-fix: the PR states that the core REST suite was red on the pre-change code and green after the fix.
- [NON-BLOCKING] test-coverage: the 25-second heartbeat re-authorization on an open guest stream has no test of its own (the delivery-time check is covered by the hub and stream cases above). [NON-BLOCKING] contract: no legacy-payload fixture for the new guest refusals; the corpus cannot present a guest principal, and the change is declared in the supplement's Breaking changes section.

### main merge delta: write attribution (#2534)

**Covers user-observable behavior end-to-end on REST and both MCP transports; guest redaction is covered for two of the guest read routes and the redaction function.**

- REST and MCP: `tests/integration/shared_graph_write_attribution.test.ts` signs two members in to one shared graph. It asserts that `POST /store` attributes each write to its member, that the recorded value is a random per-instance id and nothing derivable from the member's email, that `POST /correct` is attributed to the member who made the correction and not the entity's author, and that MCP stateless `store`/`correct` and MCP session `store` attribute each member. Fail-closed cases: a static-token write over REST and over MCP, a local no-auth write, and a write under a connection row with no recorded sign-in each name no person.
- Guest reads: the same file reads an attributed entity with a guest token on `/entities/:id/observations` and `/entities/:id`, with a member read of the same data as the control so a clean guest response is redaction and not an empty instrument, and confirms the guest still receives the observations.
- Units: `tests/unit/member_attribution.test.ts` (one stable random id per member, distinct across members, not the local id or a hash of the email, convergence under concurrent first resolution, null for anything that is not a known member, and `redactMemberAttribution` at any depth, in string-encoded provenance, and passing primitives through); `tests/unit/authenticated_principal_provenance.test.ts` (the principal is recorded with or without an agent identity, alongside the agent and external actor, absent when there is none, and preserved or cleared across nested request contexts); `tests/unit/mcp_server_authenticated_principal.test.ts` (member kept while the graph matches, dropped when the graph changes through or around the setter, dropped on AAuth admission and CLI dispatch, adopted connections name the member by attribution id, and an unknown signer stamps no one). `tests/helpers/google_sign_in.ts` is a synthetic sign-in fixture.
- Red-before-fix: the PR states each of these was confirmed red under a targeted mutation.
- [NON-BLOCKING] test-coverage: no test asserts that a guest event stream or a guest `GET /entities/:id/relationships` response omits `authenticated_actor_id` end to end; the redaction function is unit tested and both paths call it.
- [NON-BLOCKING] test-coverage: deletes, restores, merges, splits and interpretation-derived observations are not attributed and have no test that says so; the supplement and `docs/subsystems/auth.md` state the limit.

### rc3 gate evidence

- `security:classify-diff --base v0.23.1 --head HEAD`: `sensitive=true`.
- `security:lint`: 0 errors, 136 warnings (one new, see `security_review.md` finding 19).
- `security:manifest:check`: in sync, 123 routes.
- `openapi:bc-diff --base v0.23.1 --head HEAD` at `6b237ba17`: the same 9 `oneOf` false positives as rc2, and 12 non-breaking additions (one more than before the `main` merge: `AgentAttribution.authenticated_actor_id`); `--base d0af5a26e --head HEAD` (the pre-merge rc3 head): no breaking changes, one addition (that field). `--base <rc2 release commit> --head HEAD`: no breaking changes detected. The request-side tightenings above are not modelled by the diff tool and are declared by hand.
- Local Vitest could not run in the earlier release-prep sandbox (read-only test database; ambient `NEOTOMA_ENV=production` makes the harness's `NEOTOMA_FORCE_MODE` refuse at boot). CI on the rc3 PR head is the authoritative run of the suites named above.
- Local runs on the merged tree at `6b237ba17` (worktree with `NEOTOMA_ENV` unset): `npm run type-check`, lint and format check pass; the unit, services, agent, contract, security, cli and subscriptions suites pass (354 files, 2 skipped); the 14 test files changed by #2517 and #2534 pass (80 tests); 36 auth, guest, subscription, shared-graph, MCP and AAuth integration files pass; full `npm test` (602 files, 6214 tests) and `npm run test:integration` (175 files, 1188 tests) pass when run directly; `npm run test:security:auth-matrix`: 18 passed, 1 skipped; `npm run validate:test-catalog` passes. The pre-commit hook's own integration run once failed on a port collision (`EADDRINUSE` on its chosen port) in `graph_neighborhood_pagination.test.ts`, which passes on its own, so that commit used the `SKIP_TESTS` escape with the reason recorded.
- QA re-review of `6b237ba17` independently ran 14 files and 126 tests green on the merged tree. Each merged PR had QA sign-off at its final head (#2517 at `ec129ae2`, #2534 at `861db249`).
- This extension is a coverage classification of the delta by reading the named tests' cases, plus the gate runs above. The full `v0.23.1..HEAD` `/review` pass recorded earlier in this file covers the rc2 range; the `main` merge delta is covered by the two sections above, not by a repeat of that pass.

Verdict (rc3, extended for the `main` merge at `6b237ba17`): PASS-WITH-ADVISORIES — 0 blocking. Non-blocking, listed above: the rc3 legacy-corpus gap; the unasserted MCP half of the `create_relationship` hint; the guest-subscription legacy-corpus gap; the untested guest-stream heartbeat re-authorization; the missing end-to-end assertion that a guest event stream and guest `relationships` response omit `authenticated_actor_id`; and the unstated non-coverage of deletes, restores, merges and splits. Contingent on the CI test lanes being green on the head that is tagged; a further code change on this branch requires extending this file again.
