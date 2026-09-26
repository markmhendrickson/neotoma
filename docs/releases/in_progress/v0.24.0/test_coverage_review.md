# Test coverage review — v0.24.0

Reviewed range: v0.23.1..HEAD (165 files, +19098/-2061)

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

**Covers user-observable behavior end-to-end.** `tests/integration/schema_scope_resolution_parity.test.ts` calls the real, unmocked `schemaRegistry.activate()` (backed by real SQLite rows) with the exact vulnerability shape — two distinct principals, a version string colliding only with a foreign private override, no global row and no owned row at that version — and asserts `activate()` throws `Schema not found` rather than falling through to `candidates[0]` and mutating the foreign row; separately asserts the foreign row's `active` flag is untouched. `tests/integration/schema_scope_surface_parity.test.ts` extends this to real HTTP (`GET /schemas`) and MCP tool calls, confirming all read surfaces agree. `tests/services/schema_registry_incremental.test.ts` is a fully mocked companion (branch-coverage only, not independent proof of the fix — the module-level `db.js` mock means every assertion only confirms the expected query-chain shape, not that real SQLite honors the filter).

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

Strong overall, with three gaps. New error codes (`ERR_SCHEMA_SCOPE_MISMATCH`, the `MCP_*` transport error family) are documented in both `docs/subsystems/errors.md` and `docs/reference/error_codes.md` with response-shape examples — but the relationship-refusal codes are not (ADVISORY above). `docs/developer/mcp/tool_descriptions.yaml` is correctly updated for `register_relationship_type`/`list_relationship_types` (notable because this exact file was called out in code comments as having drifted before — it previously advertised 8 relationship types while the schema had 28), but `docs/specs/MCP_SPEC.md`'s own tool catalog (§3.30) was not updated for the same two tools (ADVISORY above). `docs/developer/mcp/instructions.md` and `docs/developer/cli_agent_instructions.md` carry identical new sections for the relationship-type material — this satisfies substantive parity but violates the required canonical-plus-pointer mechanism (BLOCKING above); the endpoint-ownership and schema-scope-mismatch additions in the same diff correctly use the pointer pattern instead. `docs/subsystems/relationships.md` §6.1 is well updated for ownership/refusal semantics, but §8 (Cycle Detection) was left describing the removed pre-fix mechanism (BLOCKING above). `docs/developer/cli_reference.md` is missing the new command family entirely (BLOCKING above, confirmed independently twice). One open item carried from the security review (not re-derived, flagging for completeness): the schema-activation cross-tenant fallback fix (a genuine pre-v0.23.1 vulnerability, fixed in this range) has not yet had a disclosed security advisory filed under `docs/security/advisories/` as of this review — the security review's own sign-off records this as an outstanding, non-blocking caveat for the release owner's decision before or shortly after this release ships.

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
- File the disclosed security advisory for the schema-activation cross-tenant fallback fix (already tracked as an outstanding item in `docs/releases/in_progress/v0.24.0/security_review.md`'s own sign-off caveat).
