# Security review — v0.21.1

Diff classifier reports `sensitive=false` for this release. The release ships three fixes: a data-integrity bug fix in the schema registry that directly affects `guest_access_policy` resolution (a security-relevant access-control gate), plus two CLI-local reliability fixes (backup snapshotting, MCP shim port discovery) with no auth or access-control surface. This review checks the classifier's verdict on the full range rather than only recording it, with the adversarial pass focused on the schema-registry change.

## Scope

- Base ref: `v0.21.0`
- Head ref: `HEAD` (3 commits: `e198dacdd` schema metadata carry-forward, `2d6103471` atomic backup snapshot, `cba80b568` MCP port discovery)
- Diff classifier: `sensitive=false` (`npm run security:classify-diff -- --base v0.21.0 --head HEAD --json`). 11 changed files, 0 concerns.
- Protected routes manifest: 116 routes, **unchanged** (`security:manifest:check` — in sync).
- `security:lint` (G2): 0 errors, 125 warnings — identical count to the pre-existing baseline (all pre-existing `src/actions.ts` unauth-route matches and `sandbox_mode.ts` `LOCAL_DEV_USER_ID` references, none touched by this diff).
- `openapi.yaml`: unchanged. No new MCP tools, no new Express routes.
- Changed files: `src/services/schema_registry.ts` (metadata carry-forward fix), `src/cli/index.ts` (backup atomic snapshot), `scripts/lib/neotoma_mcp_resolve_downstream_url.sh` (MCP port discovery), `tests/unit/schema_incremental_metadata_preservation.test.ts` + `tests/cli/backup_verify.test.ts` (new regression tests), `docs/testing/automated_test_catalog.md` (generated, mechanical).

## Additional scope: backup snapshot and MCP port discovery

Both fixes are local-CLI-only, have no network-facing or access-control surface, and were confirmed out of scope for the adversarial pass below:

- **Backup snapshot (`src/cli/index.ts`):** `VACUUM INTO` runs against a path constructed from `backupDir` (an operator-controlled local directory, not user/network input) and the existing `sqlitePath`. `quoteSqliteStringLiteral` escapes embedded single quotes for the literal path argument — this is not attacker-controlled input (no HTTP/MCP caller supplies this path), so this is a correctness safeguard, not an injection boundary. No new file permissions, no new network exposure, no auth surface touched.
- **MCP shim port discovery (`scripts/lib/neotoma_mcp_resolve_downstream_url.sh`):** the probe only connects to `127.0.0.1` on a fixed, hardcoded candidate list of ports per profile (`prod`: 9180/3180; `dev`: 9080/3080) — no user-supplied host/port is probed. The self-heal write targets the same port-file path the resolver already reads from, gated on `[ -w "$(dirname "$_pf")" ]`. No privilege change, no remote connection, no new credential handling.

## Adversarial review prompt

1. **Metadata-merge correctness.** Does the merge (`{...currentSchema.metadata, ...options.metadata}`) correctly preserve unrelated keys while letting an explicit override win, in every combination (prior metadata present/absent, explicit override present/absent)?
2. **Privilege escalation via merge.** Can a caller who is not authorized to change `guest_access_policy` cause it to change as a side effect of an unrelated field-add/remove call?
3. **Fallback path (`loadCodeDefinedSchemaEntry`).** When `updateSchemaIncremental` falls back to a code-defined baseline (no active registry row yet), does the merge behave safely?
4. **Regression coverage.** Do the new tests actually reproduce the original #1977 failure mode (i.e., would they fail against the pre-fix code)?

## Findings

1. **Merge logic is correct in all four combinations (concern 1).** `mergedMetadata = {...(currentSchema.metadata ?? {}), ...(options.metadata ?? {})}` (`src/services/schema_registry.ts:1443-1446`). Read directly: prior-metadata-present + no override → prior metadata carried verbatim; prior-metadata-present + override → override keys win, other prior keys survive (object spread semantics, verified by the "lets an explicit metadata option override a single key without dropping others" test); prior-metadata-absent (`undefined`) + no override → `{}` (not `undefined`), verified by the "yields an empty object rather than undefined" test; prior-metadata-absent + override → override object only. Concern 1 closed.

2. **No privilege-escalation path (concern 2).** `options.metadata` is only set when a caller explicitly passes it; `updateSchemaIncremental`'s existing callers (CLI `schemas update`, MCP schema-update action) do not synthesize a `metadata` value from unrelated field operations — a plain field-add/remove call passes no `metadata` key at all, so `options.metadata ?? {}` is `{}` and the merge is a no-op override, i.e. `guest_access_policy` and every other metadata key pass through unchanged from the current active row. This is the fix's whole point: previously the omission caused metadata to be *dropped* (reset to `{}`), which is a data-loss bug, not a privilege-escalation vector; the fix does not introduce a new way to *change* `guest_access_policy` beyond what was already possible via an explicit `options.metadata` argument (unchanged surface, already gated by whatever caller-level authorization exists on `update_schema_incremental`). Concern 2 closed — no new caller-facing capability, only a data-preservation fix.

3. **Fallback path is unaffected and safe (concern 3).** `loadCodeDefinedSchemaEntry` (`schema_registry.ts:601-621`) returns `metadata: schema.metadata ?? {}` — a code-defined baseline schema's own declared metadata, or `{}` if none. When `updateSchemaIncremental` falls back to this baseline (no registry row yet), the merge carries that baseline metadata forward exactly as it would a registry row's metadata — no special-casing needed, no divergent behavior. Concern 3 closed.

4. **Regression tests reproduce the original failure mode (concern 4).** Ran `tests/unit/schema_incremental_metadata_preservation.test.ts` directly (4/4 passing). The primary test ("carries guest_access_policy forward when adding an unrelated field") asserts `metadata.guest_access_policy === "read_only"` after a field-add — this is exactly the assertion that would fail against the pre-fix code, which omitted `metadata` from the `register()` call entirely (the resulting call would carry `metadata: undefined`, and the test's mock `register` spy would capture that and fail the equality check). Concern 4 closed.

Additional checks:
- **G1 security:classify-diff:** `sensitive=false`, 0 concerns.
- **G2 security:lint:** 0 errors, 125 warnings (pre-existing baseline; none newly introduced — confirmed no new lines added to `src/actions.ts` or `sandbox_mode.ts` in this diff).
- **G3 security:manifest:check + test:security:auth-matrix:** manifest in sync (116 routes, no change); auth matrix 18 passed / 1 skipped, unchanged from baseline.
- **Full targeted test run:** `tests/unit/schema_incremental_metadata_preservation.test.ts` (4/4), full contract suite (160/160) — run directly in this review, not just read.
- **`npm run type-check`:** clean. **`npm run format:check`:** clean. **`npm run validate:test-catalog`:** up to date.

## Suggested negative tests

Already covered by the diff's own test additions — no gap identified requiring a new negative test:
- Guest-access-policy carry-forward on an unrelated field change (the exact #1977 symptom): covered.
- Unrelated metadata key preservation (`icon`): covered.
- Explicit single-key override without dropping other keys: covered.
- Undefined-prior-metadata edge case (yields `{}`, not `undefined`): covered.

## Residual risks

- None identified specific to this change. The fix narrows an existing data-loss bug; it does not introduce a new metadata-mutation capability, new caller, or new code path for changing `guest_access_policy`. The existing authorization model for who can call `update_schema_incremental` (and therefore who can supply an explicit `options.metadata` override) is unchanged by this diff.

## Sign-off

| Reviewer | Verdict | Date |
|----------|---------|------|
| Phoenicurus (release-prep agent, manual adversarial pass) | yes | 2026-07-31 |
| Phoenicurus (release-prep agent, scope extension: backup snapshot + MCP port discovery) | yes | 2026-08-04 |

Verdict `yes` — the merge logic is correct across all four prior-metadata/override combinations, there is no new privilege-escalation path (the fix only prevents metadata from being silently dropped, it does not add a new way to change it), the code-defined-baseline fallback path behaves consistently with the registry-row path, and the regression tests were verified to target the exact original failure mode. No block. The two additional commits merged into this release branch on 2026-08-04 (atomic backup snapshot, MCP port discovery) were confirmed local-CLI-only with no auth/access-control/network-facing surface (see "Additional scope" above) and re-ran G1-G3 clean against the full 3-commit range. No block.
