# Security review — v0.29.1

Manual review lane for `/release` Step 3.5, completed by the release-prep agent with no AI provider (`NEOTOMA_AI_REVIEW_PROVIDER=none`). The supplement's `Security hardening` section links this file.

## Scope

- Base ref: `v0.29.0`
- Code head: `origin/main` at `dea3208bc915c5d59c5123ca81d6872a44c5fcb2` (6 non-merge commits: #2837, #2838, #2839, #2840, #2841, #2842; 50 files).
- Release-branch commits on top of that head change only the version (`package.json`, `package-lock.json`), release docs under `docs/releases/in_progress/v0.29.1/`, the version line in `README.md` and `docs/known_limitations.md`, and the regenerated `docs/testing/automated_test_catalog.md`. No product code, route, workflow or dependency changes on the release branch.

## Lane results

| Check | Command | Result |
|---|---|---|
| Diff classifier | `npm run security:classify-diff -- --base v0.29.0 --head HEAD` | `sensitive=true` |
| Static rules | `npm run security:lint` | 0 errors, 138 warnings across 472 files. `semgrep` is not installed on the prep host, so the bundled fallback scanner ran. The warning set is the 130 `unauth-public-route` and 8 `local-dev-user-widening` entries recorded in the v0.29.0 review. The only changed file with warnings is `src/actions.ts`, and none of its warnings points at a line added in `v0.29.0..HEAD` (checked against the added-line ranges of the diff, lines 4619–4679). |
| Protected routes manifest | `npm run security:manifest:check` | In sync with `openapi.yaml` (127 routes). No route added or removed. |
| Auth topology matrix | `npm run test:security:auth-matrix` (after `npm run build:server`) | 18 passed, 1 skipped |
| OpenAPI diff | `npm run openapi:bc-diff -- --base v0.29.0 --head HEAD` | No breaking changes detected |

### Classifier concerns

| Concern | Files |
|---|---|
| `openapi-security` | `openapi.yaml` |
| `auth-middleware` | `src/actions.ts` |

Per-commit classification (`classify_diff.js --base <c>^ --head <c>`): `sensitive=true` for #2841 (`openapi-security`) and #2842 (`auth-middleware`); `sensitive=false` for #2837, #2838, #2839 and #2840.

## Changes

| PR | sensitive | Behavior summary | Tests |
|---|---|---|---|
| #2842 | true | Guest observation and relationship reads answer a merged entity as absent. | `tests/security/guest_relationship_expansion.test.ts`, `tests/security/guest_token_signed_identity.test.ts` |
| #2841 | true | Guest issue submit refuses an issue identifier that is already in use. | `tests/security/guest_issue_submit_token_scope.test.ts`, `tests/security/guest_issue_submit_attribution.test.ts`, `src/services/issues/neotoma_client.test.ts` |
| #2840 | false | With an AAuth key configured, the CLI authenticates by signature only; `--with-bearer` adds the token. | `tests/unit/api_client_aauth_bearer.test.ts`, `tests/cli/cli_aauth_bearer.test.ts`, `tests/cli/cli_aauth_local_transport.test.ts`, `tests/cli/cli_aauth_raw_fetch.test.ts`, `tests/cli/api_client_offline_fallback.test.ts` |
| #2837 | false | The server no longer starts a new background timer for every MCP session. | `tests/unit/auto_enhancement_processor_single_timer.test.ts` |
| #2838 | false | Schema lookups are cached in memory and the schema registry is indexed. | `tests/unit/schema_registry_cache.test.ts`, `tests/unit/db_sqlite_gate_order.test.ts`, `tests/cli/cli_infra_commands.test.ts`, `tests/services/schema_registry_incremental.test.ts` |
| #2839 | false | Applying a correction updates the snapshot without re-reading the entity's whole history. | `tests/unit/snapshot_incremental_correction.test.ts`, `tests/integration/correction_incremental_snapshot_lifecycle_cutover.test.ts` |

Change-by-change notes against the classifier concerns:

- `src/actions.ts` (#2842): one helper, `entityIsMergedAway`, filtered by entity id and the policy-resolved owner, and one merge check in `resolveGuestEntityReadAccess`. No new route registration, no new `remoteAddress`, `X-Forwarded-For`, `Forwarded` or `Host` read, no new `LOCAL_DEV_USER_ID` reference, and no change to token validation or AAuth admission.
- `openapi.yaml` (#2841): description text on `POST /issues/submit` and its `400` response. No `security:` block changed; the manifest is unchanged.
- #2840 changes only which credentials the CLI attaches to its own outbound requests; server-side auth is unchanged. Each CLI request is decided by one function, `decideCliCredentials`, covered by a decision-table test over every input.
- #2838 keys every cached schema lookup by scope and, for a user-scoped lookup, by user id; a database without the change counter is read without the cache.
- #2839 keeps its snapshot records in process memory, keyed by user and entity; any check that fails takes the full rebuild.

## Residual notes

- The static-rule lane ran the fallback scanner because `semgrep` is not installed on the prep host; CI's `security_gates` job is the authoritative run.
- No AI-provider review was run. Deployed probes are a later release-completion gate and were not run here.
- Operator approval of the verdict is pending.

## Sign-off

| Reviewer | Verdict | Date |
|----------|---------|------|
| Claude (release-prep agent, manual read of the full diff); operator approval pending | with-caveats | 2026-11-14 |

Caveats: static rules ran on the fallback scanner, and no AI-provider review or deployed probe was run. The verdict is for code head `dea3208bc`. Release-branch commits that change only the paths listed under Scope do not require a re-run; any later change to product code, workflows, `openapi.yaml`, package dependencies or the security scripts does.

## Diff appendix

Changed files in `v0.29.0..dea3208bc` outside `tests/`:

- `docs/developer/cli_agent_instructions.md`
- `docs/developer/cli_reference.md`
- `docs/operations/configuration.md`
- `docs/releases/in_progress/v0.29.1/github_release_supplement.md`
- `docs/site/pages/en/issue-reporting.md`
- `docs/site/pages/en/issue-reporting.mdx`
- `docs/subsystems/issues.md`
- `docs/subsystems/schema_registry.md`
- `docs/testing/automated_test_catalog.md`
- `openapi.yaml`
- `src/actions.ts`
- `src/cli/index.ts`
- `src/reducers/observation_reducer.ts`
- `src/repositories/db/driver.ts`
- `src/repositories/db/schema_registry_cache.ts`
- `src/repositories/sqlite/internal_tables.ts`
- `src/repositories/sqlite/local_db_adapter.ts`
- `src/repositories/sqlite/sqlite_client.ts`
- `src/server.ts`
- `src/services/auto_enhancement_processor.ts`
- `src/services/correction.ts`
- `src/services/gdpr_deletion.ts`
- `src/services/issues/issue_operations.ts`
- `src/services/issues/neotoma_client.test.ts`
- `src/services/issues/neotoma_client.ts`
- `src/services/observation_insert.ts`
- `src/services/schema_registry.ts`
- `src/services/snapshot_computation.ts`
- `src/services/snapshot_incremental.ts`
- `src/shared/api_client.ts`
- `src/shared/local_transport.ts`
- `src/shared/openapi_types.ts`
- `vitest.global_setup.ts`
