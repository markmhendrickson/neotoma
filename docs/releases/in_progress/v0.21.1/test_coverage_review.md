# Test coverage review — v0.21.1

`/review` pass over `v0.21.0..HEAD`, run as part of release preparation. This release grew from a single-commit schema-registry fix to a 3-commit release (schema metadata carry-forward, atomic backup snapshot, MCP shim port discovery) after the RC branch was rebuilt to include two more `fix:` commits that landed on `main` after the branch was first created. This review supersedes the prior single-commit review and covers the full 3-commit range.

## Scope

Reviewing v0.21.0..HEAD — 11 files changed, +548/−32 lines (including generated docs/release artifacts).

Surfaces: data layer (schema registry — `updateSchemaIncremental` metadata carry-forward), CLI (`backup create` — destructive/data-mutating operation), MCP shim shell script (port discovery/self-heal), tests, generated test catalog, release docs. High-risk: **yes** — `backup create` is a destructive/data-mutating operation surface per the release skill's Step 3.6 criteria, reviewed accordingly below. No changes to `openapi.yaml`, MCP tools, Express routes, or the reducer/observation/entity ingestion pipeline.

## Pre-PR checklist (change_guardrails_rules.md)

1. `openapi.yaml` edited first — **— N/A** (no API surface changes)
2. `contract_mappings.ts` updated for new `operationId`/MCP tool/CLI command — **— N/A** (no new surface; `backup` is an existing command, no new subcommand or flag)
3. `npm test -- tests/contract/` passes — **✓** (160/160 passing, verified directly in this review)
4. New top-level CLI commands in `cli_command_coverage_guard.test.ts` — **— N/A** (`backup` already listed; no new top-level command added)
5. MCP and CLI agent-instruction parity — **— N/A** (no agent-instruction changes)
6. Runtime overrides follow `flag > env > default` — **— N/A**
7. New env vars `NEOTOMA_`-prefixed, read in `preAction` — **— N/A** (no new env vars; the MCP shim uses internal `_NEOTOMA_SHIM_PROBE_*` vars scoped to a single subshell probe, not a configurable override)
8. Error hints as structured fields, not concatenated into `message` — **— N/A** (no new structured-error paths; `writeCliError` messages for backup failures are CLI stderr output, not the API error envelope)
9. Tightening-change hint obligation — **— N/A** (no validation tightening)
10. `openapi:bc-diff` reviewed; breaking entries named in supplement — **✓** (ran `npm run openapi:bc-diff -- --base v0.21.0 --head HEAD`: "No breaking changes detected"; supplement's Breaking changes section states `None`, consistent)
11. `legacy_payloads/replay.test.ts` passes — **✓** (part of the 160 contract tests, verified directly)
12. New top-level request bodies declare `additionalProperties: false` — **— N/A**
13. New response fields declared in `openapi.yaml` — **— N/A**
14. Release-visible changes documented in supplement under `docs/releases/in_progress/v0.21.1/` — **✓**
15. `schema_agnostic_design_rules.md` re-read for per-type behavior — **✓** re-read; the schema-registry fix operates generically on `SchemaMetadata` regardless of `entity_type` — no new per-type branch, no hardcoded entity-type list. Backup and MCP-shim fixes are entity-type-agnostic by construction (infrastructure, not data-layer).
16. Determinism preserved — **✓** (no random IDs, no `Date.now()` in ID derivation; the schema-registry merge is a pure object-spread; `VACUUM INTO` is deterministic given the same source DB state; the MCP-shim port probe has no ID/storage implication)
17. Idempotency / transactional ingestion — **— N/A** (no ingestion/observation writes in this diff)
18. No new PII in logs/metrics/errors — **✓** (no new log lines carry personal data; `mergedMetadata` values are schema configuration, not personal data; backup error messages name file paths and SQLite integrity-check output, not user data; MCP-shim log lines name ports and profile names only)
19. Renamed files snake_case — **— N/A** (no renames)
20. Security gate results recorded — **✓** (`classify-diff` → `sensitive=false` across all 3 commits; full lane run anyway given the `guest_access_policy` access-control relevance of the schema-registry commit — see `security_review.md`, verdict `yes`, with an added scope-extension pass for the backup/MCP-shim commits)
21. New Express routes in `protected_routes_manifest.json` — **— N/A** (no new routes; 116 routes unchanged)
22. No bare `req.socket.remoteAddress`/XFF/Host reads outside canonical helpers — **— N/A** (`src/actions.ts` not touched)
23. User-facing-surface coverage:
    - **Metadata carry-forward on incremental schema update** — **✓** `schema_incremental_metadata_preservation.test.ts` (4 tests): carries `guest_access_policy` forward on an unrelated field add (the exact #1977 symptom), preserves an unrelated key (`icon`), explicit single-key override without dropping others, undefined-prior-metadata edge case yielding `{}` not `undefined`. All 4 verified to exercise `register()`'s actual call arguments via a spy, not just the return value.
    - **`backup create` — destructive/data-mutating operation** — **✓** `tests/cli/backup_verify.test.ts` adds a real round-trip regression test (not a unit test on a helper): spins up a real `better-sqlite3` database in WAL mode, commits 5000 rows split across a checkpointed prefix and an uncheckpointed WAL tail, runs a background writer committing concurrently, invokes the actual `neotoma backup create` CLI command against it, and asserts (a) the command reports `verified: true`, (b) the resulting snapshot is openable and internally consistent, (c) no stray `-wal` sidecar is present (since `VACUUM INTO` output is self-contained). This exercises the exact interleaving that produced `SQLITE_CORRUPT` under the old implementation — verified by reading the test body, not just confirming the file exists. Read directly at `tests/cli/backup_verify.test.ts:97-176`.
    - **MCP shim port discovery** — **~ advisory (no automated coverage)** — the discovery/self-heal logic in `scripts/lib/neotoma_mcp_resolve_downstream_url.sh` has no automated test (it is a POSIX shell script, outside the vitest suite's reach, and there is no existing shell-script test harness in this repo). The fix was verified manually per the commit message (sabotaged a port file to an unreachable port, confirmed discovery + self-heal + successful MCP `initialize` handshake) and re-confirmed by reading the diff logic directly: the probe only targets a hardcoded loopback candidate list per profile, with a 1200ms timeout and error/timeout handlers that resolve to "unreachable," so a hung or non-responsive port cannot block the shim indefinitely. This is advisory, not blocking, given: (1) the surface is a local dev-ops shim, not a network-facing or data-mutating path; (2) the change is narrowly scoped (adds a probe step before an existing fallback, does not remove or weaken the existing fallback); (3) manual verification evidence is documented in the commit message. Recommend a follow-up: add a `bats`/`shellspec` harness or a Node-based integration test that stubs a TCP listener on a non-canonical port and asserts the shim's stdout/stderr and exported `MCP_PROXY_DOWNSTREAM_URL` — tracked as a follow-up, not gating this patch release.
24. npm script naming convention — **— N/A** (no new/renamed npm scripts)
25. No unstable iteration order in stored/emitted/ID-input paths — **✓** (schema-registry merge is `{...a, ...b}` on two named-key objects, order-independent for the resulting value; backup fix has no iteration-order-dependent output — `VACUUM INTO` and `integrity_check` are engine-level, not app-level iteration; MCP-shim candidate list is a fixed, explicit space-separated string per profile, not derived from iteration over an unordered collection)

## Architectural review

**State Layer boundaries:** No strategy, filtering-suggestion, orchestration, or scheduled-execution logic added in any of the 3 commits. The schema-registry fix is a pure data-integrity fix in an existing write path. The backup fix changes only how bytes are captured to disk, not what is captured or any policy about backups. The MCP-shim fix is local dev-ops connectivity, entirely outside the State Layer / Operational Layer boundary (it does not touch `src/`).

**Schema-agnostic design:** No new `switch (entity_type)` or `if (entityType === "X")` branches in any commit.

**Determinism:** Confirmed clean across all 3 commits — see checklist item 16.

**Immutability:** No `UPDATE` on `observations` or `sources` rows in any commit. `backup create` reads the live SQLite file via the engine's own atomic snapshot primitive; it does not mutate the source database (`VACUUM INTO` is read-only against the source, write-only against the destination path).

**Auth surface:** `src/actions.ts` is not touched by any of the 3 commits. No route registration, no middleware, no `LOCAL_DEV_USER_ID` reference change.

**Error handling:** The backup fix changes error *messages* for the CLI's own stderr output (naming the on-disk path, the `integrity_check` result) but does not touch the structured API error envelope — this is CLI operator-facing text, not an HTTP/MCP error response, so the errors.md structured-hint obligation does not apply. No tightened validation in any commit.

**Destructive-operation review (backup create, per release skill Step 3.6):** The fix strictly *improves* safety: it replaces a race-prone two-file copy with an atomic engine-level snapshot, and replaces a size-only sanity check with a real `PRAGMA integrity_check`. The failure mode on error is fail-closed (non-zero exit, backup left in place for inspection, `verified` is never falsely reported `true`) rather than fail-open. `VACUUM INTO` refuses to overwrite an existing destination — the code explicitly `fs.rm`s the destination first, which is correct since the destination is a fresh path inside a newly-created backup directory, not a path that could collide with unrelated operator data.

## Product/UX and principles alignment

- **10.1 Truth Before Experience:** All 3 fixes directly serve this principle. The schema-registry fix stops silently discarding access-control state. The backup fix stops silently producing an unrestorable artifact while claiming success — the single worst kind of silent failure for a backup command, since operators only discover it during a real restore emergency. The MCP-shim fix replaces a silent, unexplained "Could not attach" failure with a self-explaining discovery-and-heal path.
- **Silent behavior changes:** None introduced. All 3 diffs remove pre-existing silent-failure modes rather than introducing new ones.
- **Discoverability:** The backup manifest's new `db_snapshot_method: "vacuum_into"` field is a small but real discoverability win — an operator or downstream tool inspecting a manifest can now tell which snapshot mechanism produced it, and therefore whether a `-wal` sidecar should be expected.

## Documentation completeness

- `docs/testing/automated_test_catalog.md` — regenerated via `npm run generate:test-catalog`, not hand-edited; verified current via `npm run validate:test-catalog` (up to date). ✓
- No subsystem doc update required for the schema-registry fix: `docs/foundation/schema_agnostic_design_rules.md` already documents `merge_policies`/declaration-driven behavior generically.
- Backup fix: no `docs/developer/cli_reference.md` update needed — no new flag or command, output shape (`backup_dir`, `verified`) unchanged; the new `db_snapshot_method` manifest field is internal manifest structure, not part of the documented CLI output contract, so no CLI reference change required. Considered whether `docs/subsystems/` has a backup/restore doc — none exists in this repo's subsystem doc set; not introducing a gap, since none existed before this change either.
- MCP-shim fix: no operator-facing doc change required — the shim's discovery/self-heal behavior is an internal resilience improvement to existing connectivity behavior, not a new configurable surface.
- No new error code registry entry needed (no new `ERR_*` constants in any of the 3 commits).

## Supplement accuracy

Cross-checked every claim in `github_release_supplement.md` against the code for all 3 commits:
- `updateSchemaIncremental` metadata merge — confirmed present at `src/services/schema_registry.ts:1443-1449` (line numbers per the schema-registry-only diff; unaffected by the later merges), matches described semantics.
- `guest_access_policy` resolution from the active row's `SchemaMetadata` — confirmed via `SchemaMetadata` interface definition and the doc comment on the `metadata` option.
- `backup create` — `VACUUM INTO` snapshot, `PRAGMA integrity_check` verification, `db_snapshot_method: "vacuum_into"` manifest field — all confirmed present in `src/cli/index.ts` matching the diff shown in the commit and matching the supplement's description exactly (including the fail-closed behavior and the "left in place for inspection" language, which is a literal substring of the actual `writeCliError` message).
- MCP shim — candidate port lists (`prod`: 9180/3180; `dev`: 9080/3080), 1200ms probe timeout, self-heal rewrite of the port file — all confirmed present in `scripts/lib/neotoma_mcp_resolve_downstream_url.sh` matching the supplement's description.
- `openapi:bc-diff` output ("No breaking changes detected") reconciled with the supplement's Breaking changes section, re-run against the full 3-commit range. ✓
- Breaking changes section present and reads correctly (`None.` with justification covering all 3 fixes). ✓
- Test counts match: 4 new unit tests (schema), 1 new regression test (backup, plus the pre-existing smoke test — 2 total in that file), 0 new automated tests (MCP shim — documented as a gap above).

## Code review

`/review v0.21.0..HEAD` executed inline as part of this release-prep pass, covering the full 3-commit range (this run supersedes the prior single-commit review). Type-check (`tsc --noEmit`), the full contract suite (160/160), the 4 schema-registry regression tests, and the 2 backup tests (including the new #2075 regression test) were all verified passing directly by running them, not by reading test names. One prettier-format-only fix was applied to `tests/unit/schema_incremental_metadata_preservation.test.ts` (whitespace/wrapping only, no logic change) since `npm run format:check` does not cover `tests/**` and the file had drifted from `prettier --write` formatting; confirmed zero behavioral diff.

## Findings

No blocking findings. One advisory finding, documented above under checklist item 23: the MCP shim's port-discovery/self-heal logic has no automated test coverage (shell script, outside the vitest harness's reach). This is judged non-blocking for a patch release given the narrow, additive scope of the change, the documented manual verification, and the fail-safe design (probe failures fall through to the pre-existing hardcoded fallback, so the fix cannot make connectivity worse than before). Recommend tracking a follow-up to add shell-script test coverage (e.g. `bats` or a Node-based stub-listener integration test) — not gating this release.

--- Review Summary ---
Base..Head: v0.21.0..HEAD
Files reviewed: 11
Blocking: 0
Advisory: 1
Nit: 0

Verdict: APPROVED-WITH-NOTES

Should address in follow-up:
- Add automated test coverage for the MCP shim's port-discovery/self-heal logic in `scripts/lib/neotoma_mcp_resolve_downstream_url.sh` (e.g. via `bats` or a Node-based stub-listener integration test).
