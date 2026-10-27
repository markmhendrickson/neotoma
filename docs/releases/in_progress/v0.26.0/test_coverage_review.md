# v0.26.0 test coverage review

Range: `v0.25.0..release/v0.26.0` (48 commits and 437 files at `7c428ad60`; refreshed 2026-10-22 and 2026-10-27). The 2026-10-27 sync merged `origin/main` at `119e0960f` (#2606, backup verification and restore safety) and carries the release-branch site PRs #2721 and #2724 and the site claim fixes in `7c428ad60`. The code was reviewed on `fdefe19e3`. Merged in afterwards: `b0b78cee0` (#2660, deploy workflow + `tests/contract/deploy_workflow_config.test.ts`), the two release-branch fixes, the version bump, and website, documentation and CI work (#2663, #2680, #2683 to #2689, #2696, #2697, #2701, #2709 to #2712, #2714, #2715, and #2684 which fixes #2682; see the supplement). Six parallel `/review` passes, one per theme, read every diff and the test bodies for each user-facing surface. Focused suites were run locally against real SQLite. CI run 38585142254 on `fdefe19e3` passed every required job. CI run 39801146123 on `f062accad` also passed every job (`baseline`, `contract_parity`, `security_gates`, `frontend`, `site_export`, `agentic_evals`, `eval_scenarios`, `eval_combined`, `python_sdk`, `graph_render_smoke`): `baseline` ran 396 test files and 4,784 tests green, with 2 files and 13 tests skipped and 3 todo. The tests added by the later site and documentation PRs (for example `site_onepager_copy`, `llms_txt_claims`, `docs_viewer_*`, `site_route_retirement`) run in `baseline`.

## Code review

**Verdict: APPROVE after release-branch fixes.** The first pass returned NEEDS-CHANGES with two BLOCKING findings. Both are fixed on `release/v0.26.0`, each with a regression test that fails without the fix and passes with it.

### BLOCKING (resolved)

1. **Cross-type merge broke snapshot recompute on every install (#2618).** `selectEntityLifecycleVisibility` (`src/services/entity_lifecycle_authority.ts`) refused any observation set whose `entity_type` differed from `observations[0]`, before checking `pre_migration` mode. `mergeEntities` (used by plural-type repair) keeps the original `entity_type` on repointed observations. So after a cross-type merge, `recomputeSnapshot` threw `EntityLifecycleAcquisitionError`. A later write persisted its observation but returned an error and left the snapshot stale, and point-in-time reads failed.
   - Fix: the entity_type equality check applies only in cutover modes. `pre_migration` keeps the owner and duplicate-id checks, which is the legacy reducer's behavior.
   - Tests: `tests/services/entity_lifecycle_selector.test.ts` (mixed types accepted pre-migration; a foreign owner is still refused) and `tests/integration/cross_type_merge_snapshot.test.ts` (real SQLite: merge, recompute, write to the survivor, read the snapshot back). Both are added to the required lifecycle CI lane. Red without the fix, green with it.
2. **HTTP `409 ERR_STORE_WRITE_INCOMPLETE` counted the wrong source (#2651).** When the interpretation named a `source_id`, the summary counted observations on the keyed source, which holds none. It reported every entity missing, and a client following the hint would write duplicate observations. MCP already counted the right source.
   - Fix: `src/actions.ts` uses `interpretation.source_id ?? interpretationSourceId ?? existingSource.id`, the same resolution as `observationSourceId` and the MCP path.
   - Test: `tests/integration/store_partial_write_2144.test.ts` "counts written entities on the interpretation's own source when it names one" (real Express route). Red before the fix (0 written, 24 missing), green after (11 written, 13 missing). Runs in the CI `contract_parity` job.

### ADVISORY (follow-ups, not release-blocking)

- **#2528** CLI `array-item patch` auto-generates its idempotency key from the payload only, so patching A, then B, then A again replays the first call and writes nothing. `corrections create` has the same pattern.
- **#2528** `EntitySnapshot.entity_version` is declared in `openapi.yaml`, but `get_entity_snapshot` and MCP `retrieve_entity_snapshot` do not return it. List, query and correct responses do.
- **#2528** `batch_correct` returns 500 on idempotency-prefix reuse with a changed value, checks staleness before replay, and compares only by timestamp.
- **#2397** `/corrections/transaction` has no `writeRateLimit`. A single call can make up to 2,500 corrections while holding the write gate.
- **#2528/#2397** There are no `tenant_isolation_matrix` rows for `/patch_array_item` or `/entities/{id}/batch_correct`. Both are owner-scoped in code and covered at the service layer.
- HTTP `/correct` writes an orphan observation for a nonexistent `entity_id` (this existed before v0.25.0). MCP checks first.
- `merge_array_by_key` has no item removal, and later lower-priority stores to a patched field are ignored. This needs documenting.
- **#2612** `read_contract` type order and the predicate digest depend on DB row order. The predicate digest also hashes over foreign type names, a weak existence oracle. GET coerces `exclude_bookkeeping` differently from POST. `read_contract` is not described in the MCP or CLI docs.
- **#2618** Merge-chain truncation now throws after the observation INSERT. Entity delete, restore, delete is still a silent no-op (this existed before; it is listed in the supplement as a known limitation). `ERR_ENTITY_LIFECYCLE_AUTHORITY_INPUT` is undocumented. `dist/maintenance/` ships in the package.
- **#2651** Updating `sources.provenance.store_write` is a documented bookkeeping exception in `sources.md` §10.7, but guardrail MUST NOT #8 was not amended. That needs owner sign-off; it is a foundation-rule edit.
- **#2651** Completeness detection for keys written before this release can misjudge payloads that differ only in unknown fields. On MCP, a shared interpretation source can under-report missing entities.
- **#2614** The conditional error codes are not in `docs/reference/error_codes.md` or `docs/subsystems/errors.md`. Their store-path cost (key-mode row, double resolution) is noted in the supplement.
- **#2636** `cli_reference.md` lacks `--data-origin` (the supplement wording was corrected). Guest redaction of origins is tested only at the helper level.
- **#2577** `WS_PORT` vs `NEOTOMA_WS_PORT` docs drift.
- **#1934** Detection of agent file reads is tracked in #1935.

### NIT

`localeCompare` sort before hashing in `correction_transaction.ts`; non-strict zod on MCP CAS schemas; plan-mode REST `mime_type` echo; grant-import filtering of `relationship_types`; `collapsedEntityReadContract` never emits the `groups` unit; missing `user_id` filters on two internal resume reads.

## Surfaces

| Surface | Tests | Classification |
|---|---|---|
| `POST /corrections/transaction`, MCP `correct_transaction` | `tests/cli/request_atomic_transaction.test.ts`, `src/services/correction_transaction.test.ts`, `tenant_isolation_matrix` row | End-to-end |
| `POST /patch_array_item`, MCP `patch_array_item`, CLI `array-item patch` | `tests/integration/array_item_patch_conflict.test.ts`, `tests/unit/array_item_patch_atomic.test.ts`, `tests/cli/cli_array_item_patch_commands.test.ts` | End-to-end (no cross-user row; see advisory) |
| `/correct` `expected_version` / `overwrite`, CLI `corrections create --expected-version` | `array_item_patch_conflict`, `array_item_patch_atomic`, `tests/cli/cli_edit_commands.test.ts` | End-to-end |
| `/entities/{id}/batch_correct` transactional | `cli_edit_commands`, `array_item_patch_atomic` | End-to-end (stale case); idempotency mismatch untested |
| `include_cleared_fields` | `tests/integration/atomic_null_projection.test.ts`, `tests/unit/nullable_winning_projection.test.ts` | End-to-end |
| `entity_version` on snapshot reads | none | Gap: the field is not returned (advisory) |
| `expected_entity_absent` (HTTP, MCP, CLI) | `tests/services/store_conditional.test.ts`, `store_conditional_race.test.ts`, `store_condition_keys.test.ts`, `tests/cli/request_conditional_store.test.ts` | End-to-end, including multi-process races |
| Keyed-store resume, `ERR_STORE_WRITE_INCOMPLETE` | `tests/integration/store_partial_write_2144.test.ts` (plus the new interpretation-source case), `store_abort_context_2144.test.ts` | End-to-end |
| `data_origin` (REST, MCP, CLI, reads) | `tests/integration/store_data_origin.test.ts`, `tests/cli/cli_store_data_origin.test.ts`, `tests/unit/store_data_origin.test.ts`, legacy-payload fixtures | End-to-end; guest redaction helper-only |
| `observation_source: unspecified` + warning (#2635) | `tests/integration/observation_source_unspecified_default.test.ts`, `tests/cli/cli_store_observation_source.test.ts`, reducer unit tests | End-to-end |
| `retrieve_field_provenance` on corrected/merged fields (#2634) | `tests/integration/field_provenance_corrected_and_merged.test.ts` | End-to-end |
| `read_contract` on GET/POST entities, MCP `retrieve_entities`, CLI | `tests/integration/entity_read_contract*.test.ts` | End-to-end; semantic cap helper-level |
| `store --plan` writes nothing | `tests/cli/cli_store_plan_mode_no_writes.test.ts`, `tests/integration/mcp_store_plan_mode_no_writes.test.ts`, contract test | End-to-end |
| Relationship grant scoping | `tests/integration/relationship_write_capability_surfaces.test.ts`, `tests/contract/relationship_write_grant_contract.test.ts` | End-to-end |
| Relationship delete after restore (#2570) | `tests/integration/relationship_liveness_pagination.test.ts`, `tests/services/relationship_type_registration.test.ts` | End-to-end at the service level |
| `NEOTOMA_WS_HOST` loopback default | `tests/security/ws_bridge_bind_host.test.ts` | End-to-end (spawns the bridge) |
| Docker `.env*` exclusion | `tests/scripts/test_docker_context.py` | End-to-end (real Docker matcher) |
| Operator deploy workflow escalation + probe retry (#2660, #2663; CI-only) | `tests/contract/deploy_workflow_config.test.ts` (16 tests, all passing in `baseline` on `f062accad`) | Config contract; not a package surface |
| Cross-type merge snapshot (release fix) | `tests/integration/cross_type_merge_snapshot.test.ts` | End-to-end |
| Shared observation-insert primitive (#2582, no behaviour change) | `tests/unit/observation_insert_primitive.test.ts` (9 tests, in `baseline`), `tests/unit/observation_reducer_comparator.test.ts`, `tests/integration/observation_insert_sites_{attribution,characterization,routing}.test.ts` (not in the `baseline` lane; not seen in the CI run log) | Unit plus characterization of the insert sites |
| Offline lifecycle preview and verifier (#2621, internal, `apply` refuses) | `tests/integration/entity_lifecycle_inventory.test.ts` (5), `entity_lifecycle_executor_boundary.test.ts` (12), `entity_lifecycle_executor_program.test.ts` (26), all passing in CI on `f062accad` | Service-level; no tool or startup step exposes it |
| `neotoma backup create` verification under `node:sqlite`, `neotoma backup restore` staging, sidecar removal, containment and rollback (#2606) | `tests/cli/backup_verify.test.ts` (both SQLite drivers), `tests/cli/eval_backup_cli_boundary.test.ts`, `tests/unit/eval_backup_cli_contract.test.ts`, `tests/unit/sqlite_driver_pragma.test.ts`, `tests/unit/sqlite_connection_pragmas.test.ts`, `tests/cli/cli_recovery_hint.test.ts`, `tests/unit/mcp_instructions_backup_restore.test.ts`, `tests/contract/native_sqlite_backup_ci_wiring.test.ts` | End-to-end through the CLI on real SQLite; crash-wide atomicity is not claimed or tested |
| neotoma.io one-pager, route retirement, docs viewer, README and `llms.txt` claims (#2680 to #2724, and the claim fixes in `7c428ad60`) | `tests/unit/site_onepager_copy.test.ts`, `site_route_retirement.test.ts`, `site_served_claims.test.ts`, `llms_txt_claims.test.ts`, `docs_viewer_{build,lint,render}.test.ts`, `root_landing_site_nav_drift.test.ts`, `frontend/src/components/onepager/InterfaceExplorer.interactions.test.tsx` (new in #2715) | Site and documentation copy guards; not a package surface |

No surface is classified BLOCKING.

## Committed evals for agent-facing changes

CI run 39801146123 on `f062accad` ran these committed evals green. `agentic_evals` ran 61 tests in total. The replay scenarios run in `eval_scenarios` (50 scenarios: 42 passed, 0 failed, 8 skipped) and in `eval_combined`, which reports them as Tier 2.

| Change | Eval | Lane |
|---|---|---|
| Agent-initiated file-read provenance (#1934) | Three agentic fixtures in `tests/fixtures/agentic_eval/`: `agent_initiated_file_read_provenance`, `agent_initiated_file_read_provenance_noncompliant`, `agent_initiated_secret_file_read_no_persist` | `agentic_evals` |
| Relationship grant scoping (#2525) | One agentic fixture: `relationship_write_capability_effect` (a single declared model, by design) | `agentic_evals` |
| `observation_source` default (#2635) | Eval-harness scenarios `observation_source_unspecified_rank` and `observation_source_lineage` | `eval_scenarios`, `eval_combined` |
| `data_origin` (#2636) | Eval-harness scenario `store_data_origin_readback` | `eval_scenarios`, `eval_combined` |
| Interrupted keyed stores (#2651) | Eval-harness scenario `store_keyed_write_resume` | `eval_scenarios`, `eval_combined` |
| `store --plan` writes nothing (#2471) | Eval-harness scenarios `store_plan_mode_persists_nothing` and `store_commit_persists_control` | `eval_scenarios`, `eval_combined` |
| Atomic corrections, keyed array writes, conditional store, read acquisition (#2397, #2528, #2614, #2612) | Eval-harness scenarios `atomic_correction_transaction_recovery`, `atomic_keyed_array_disjoint_writers`, `native_conditional_store_recovery`, `entity_read_acquisition_scope` | `eval_scenarios`, `eval_combined` |
| Backup verification and restore safety (#2606) | Replay-only eval-harness scenario `backup_restore_cli_safety` with its committed cassette, driven through the real CLI by `packages/eval-harness/src/neotoma_cli.ts` | `eval_scenarios`, `eval_combined` |
| Field provenance on corrected and merged fields (#2634) | No eval-harness scenario. `tests/integration/field_provenance_corrected_and_merged.test.ts` is run by the CI step "Run field-provenance regression for corrected and merged fields (#2026)" in `ci_test_lanes.yml` | CI step |

**Tier 2 skips.** `eval_combined` reported "Tier 2: 44/61 passed, 0 failed, 17 skipped". Skipped scenarios did not run and are not claimed here. The `eval_scenarios` log itemizes its 8 skips: three are quarantined under neotoma#1726 because the isolated replay server does not emit the counters they read (`closing_assistant_store`, `compact_profile_still_stores`, `file_source_provenance`), and five lack a replay cassette (`agent_under_load_skips_store`, `attachment_extraction`, `compliance_followup_loop`, `multi_tool_research_then_synthesis`, `simple_user_message_with_extracted_contact`). The `eval_combined` log does not give a reason for its other skips, and this review did not establish them. None of the evals in the table above was skipped: each shows as passed in both lanes. Because `file_source_provenance` is quarantined, file-sourced provenance is held by the #1934 agentic fixtures and not by a replay scenario.

## Local run notes

- The local suites were run against a temporary or default `.vitest` data dir with `NEOTOMA_ENV=test`. Local failures in `tenant_isolation_matrix`, `cli_store_data_origin`, `cli_store_plan_mode_no_writes`, `entity_lifecycle_executor_program` and two `store_conditional` HTTP cases came from the environment: the worktree has an env file, the operator shell sets `NEOTOMA_ENV=production`, and a `NEOTOMA_DATA_DIR` override splits server and worker databases. All of these pass in CI run 38585142254 on `fdefe19e3`; the `baseline` job of run 39801146123 on `f062accad` also passes `tenant_isolation_matrix` (19 of 19) and `deploy_workflow_config` (16 of 16).
- After the fixes: `type-check` clean, `build:server` clean. Lifecycle, merge and plural-repair suites: 91/91. Keyed-store and conditional-store suites: 66/66.
