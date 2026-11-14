# Security review — v0.29.0

Manual review lane for `/release` Step 3.5, completed by the release-prep agent with no AI provider (`NEOTOMA_AI_REVIEW_PROVIDER=none`). The supplement's `Security hardening` section links this file.

## Scope

- Base ref: `v0.28.0`
- Code head: `origin/main` at `1f95f4d8566383d00034f98a501fe32cc30736d7` (20 non-merge commits plus the merge of the v0.28.0 release branch; 132 files).
- Release-branch commits on top of that head change only the version (`package.json`, `package-lock.json`), release docs under `docs/releases/in_progress/v0.29.0/`, the version line in `README.md` and `docs/known_limitations.md` with the matching README claim pattern in `tests/unit/llms_txt_claims.test.ts`, the `SECURITY.md` supported-versions table, `docs/operations/configuration.md`, `docs/subsystems/guest_access_policy.md` and the version headings in `tests/contract/legacy_payloads/CHANGES.md`. No product code, route, workflow or dependency changes on the release branch; `classify_diff.js --base 1f95f4d85 --head HEAD` reports `sensitive=false` for those commits.

## Lane results

| Check | Command | Result |
|---|---|---|
| Diff classifier | `npm run security:classify-diff -- --base v0.28.0 --head HEAD` | `sensitive=true` |
| Static rules | `npm run security:lint` | 0 errors, 138 warnings across 469 files. `semgrep` is not installed on the prep host, so the bundled fallback scanner ran. None of the 138 warnings points at a line added in `v0.28.0..HEAD` (checked per warning against the added-line ranges of the diff): 130 `unauth-public-route` and 8 `local-dev-user-widening`, the same set as the v0.28.0 review. |
| Protected routes manifest | `npm run security:manifest:check` | In sync with `openapi.yaml`: 127 routes, 111 requiring auth, 9 runtime-only unauthenticated. The one new entry is `GET /entities/{id}/html` (`getEntityHtml`, `requires_auth: true`), an existing route now documented in OpenAPI. |
| Auth topology matrix | `npm run test:security:auth-matrix` (after `npm run build:server`) | 18 passed, 1 skipped |
| CI security gates | CI run 43536753035 on `main` at `1f95f4d85` | `security_gates` job passed |

### Classifier concerns

| Concern | Files |
|---|---|
| `openapi-security` | `openapi.yaml` |
| `protected-routes-manifest` | `scripts/security/protected_routes_manifest.json` |
| `security-gates` | `scripts/security/protected_routes_manifest.json` |
| `auth-middleware` | `src/actions.ts` |
| `access-policy` | `src/services/access_policy.ts` |

Per-commit classification (`classify_diff.js --base <c>^ --head <c>`): `sensitive=true` for #1952, #2822, #2824, #2826, #2829, #2833 and #2835; `sensitive=false` for the other 14 non-merge commits.

## Sensitive changes

| PR | sensitive | Behavior summary | Tests |
|---|---|---|---|
| #2829 | true | Guest tokens are checked in one place on every guest-readable route. Refusals use `401 GUEST_TOKEN_INVALID` and `403 GUEST_TOKEN_SCOPE`; a link lasts the shorter of its stored and configured lifetime. | `tests/security/guest_token_entity_binding.test.ts`, `tests/security/guest_token_signed_identity.test.ts`, `tests/integration/guest_invalid_bearer_routes.test.ts`, `tests/integration/guest_subscription_owner_scope.test.ts`, `tests/integration/guest_token_isolation.test.ts`, `src/services/guest_access_token.test.ts`, `tests/unit/publish_rendered_page_description_parity.test.ts` |
| #2833 | true | Related-entity expansion on guest reads is limited to what the guest link covers. | `tests/security/guest_relationship_expansion.test.ts`, `tests/integration/guest_token_precedence_over_type_policy.test.ts`, `tests/security/guest_token_signed_identity.test.ts` |
| #2835 | true | Signed agents with a matching grant read entity details as the grant owner. | `tests/integration/aauth_admitted_entity_detail_read.test.ts` |
| #1952 | true | An entity-scoped guest token takes precedence over a closed type policy on the two share-link read routes; `/entities/:id/html` answers a policy refusal with `403`. | `tests/integration/guest_token_precedence_over_type_policy.test.ts` (also a dedicated CI contract-lane step), `src/services/access_policy.test.ts` |
| #2822 | true | Caller-supplied patterns in schema constraints are bounded and validated at registration; evaluation runs under time, size and per-request limits. | `tests/security/schema_pattern_bounds.test.ts`, `tests/services/schema_stored_pattern_load.test.ts`, `src/services/rendered_page/publish_conformance_policy.test.ts`, legacy payload `v0.28.x/register_schema_repeated_group_pattern` |
| #2828 | false | Counted quantifiers of any length are recognised at pattern registration. | `tests/security/schema_pattern_bounds.test.ts`, `tests/services/schema_stored_pattern_load.test.ts`, legacy payload `v0.28.x/register_schema_counted_quantifier_pattern` |
| #2824 | true | A committed store with an unconfirmed completion marker returns success with `write_committed: true`; writes outside a transaction take their place in the transaction queue. | `tests/contract/store_marker_unconfirmed.test.ts`, `tests/unit/store_write_completion.test.ts`, `tests/services/store_worker_backend_gate_contention.test.ts`, `tests/unit/db_sqlite_gate_order.test.ts`, `tests/unit/db_worker_file_database.test.ts` |
| #2826 | true | `entity.created` is emitted for a new entity even when the snapshot step fails; no entity event for a merged-away id. | `tests/services/store_entity_created_emission.test.ts` |

Change-by-change notes against the classifier concerns:

- `src/actions.ts`: no new Express route registration. Guest read routes resolve tokens through `checkGuestTokenForEntity`; the only new auth-middleware branch is `maybeStampAdmittedEntityReader` on the two no-Bearer branches, which applies only to the four entity-detail GET routes, only outside sandbox mode, only when no guest token is presented, and only when the admission middleware's user id still matches. No new `remoteAddress`, `X-Forwarded-For`, `Forwarded` or `Host` reads; no new `LOCAL_DEV_USER_ID` reference.
- `src/services/access_policy.ts`: hint text of the guest refusal only; modes and resolution order are unchanged.
- `openapi.yaml`: shared `GuestTokenInvalid` and `GuestTokenScope` responses, `getEntityHtml`, `404` responses on two read routes, three optional store response fields. No `security:` block changed.
- `scripts/security/protected_routes_manifest.json`: regenerated; one added auth-required entry.

## Residual notes

- The static-rule lane ran the fallback scanner because `semgrep` is not installed on the prep host; CI's `security_gates` job is the authoritative run.
- No AI-provider review was run. Deployed probes are a later release-completion gate and were not run here.
- Operator approval of the verdict is pending.

## Sign-off

| Reviewer | Verdict | Date |
|----------|---------|------|
| Claude (release-prep agent, manual read of the full diff); operator approval pending | with-caveats | 2026-11-14 |

Caveats: static rules ran on the fallback scanner, and no AI-provider review or deployed probe was run. The verdict is for code head `1f95f4d85`. Release-branch commits that change only the paths listed under Scope do not require a re-run; any later change to product code, workflows, `openapi.yaml`, package dependencies or the security scripts does.

## Diff appendix

Changed files in `v0.28.0..1f95f4d85` outside `tests/`:

- `.github/workflows/ci_test_lanes.yml`
- `.github/workflows/deploy-operator-instance.yml`
- `.husky/pre-commit`
- `README.md`
- `docs/architecture/idempotence_pattern.md`
- `docs/developer/cli_agent_instructions.md`
- `docs/developer/mcp/instructions.md`
- `docs/developer/mcp/tool_descriptions.yaml`
- `docs/developer/subscriptions_guide.md`
- `docs/operations/configuration.md`
- `docs/performance/entity_list_source_lookups.md`
- `docs/rendered_page.md`
- `docs/subsystems/errors.md`
- `docs/subsystems/substrate_events.md`
- `docs/testing/automated_test_catalog.md`
- `frontend/public/brand/october/essay/inspectable-explanations.svg`
- `frontend/public/brand/october/essay/shared-instance.svg`
- `frontend/public/brand/october/essay/source-material.svg`
- `frontend/src/components/onepager/onepager.css`
- `openapi.yaml`
- `package.json`
- `scripts/bench_entities_user_type_index.ts`
- `scripts/classify_deploy_changes.mjs`
- `scripts/security/protected_routes_manifest.json`
- `server.json`
- `src/actions.ts`
- `src/events/substrate_store_emit.ts`
- `src/events/types.ts`
- `src/repositories/db/driver.ts`
- `src/repositories/libsql/libsql_driver.ts`
- `src/repositories/sqlite/sqlite_client.ts`
- `src/repositories/sqlite/sqlite_driver.ts`
- `src/repositories/worker/worker_file_database.ts`
- `src/server.ts`
- `src/services/access_policy.ts`
- `src/services/field_constraints.ts`
- `src/services/guest_access_token.ts`
- `src/services/interpretation.ts`
- `src/services/rendered_page/conformance.ts`
- `src/services/safe_pattern.ts`
- `src/services/schema_derived_entity_extraction.ts`
- `src/services/schema_registry.ts`
- `src/services/store_conditional.ts`
- `src/services/store_write_state.ts`
- `src/shared/contract_mappings.ts`
- `src/shared/openapi_types.ts`
- `src/tool_definitions.ts`
- `vitest.global_setup.ts`
- `vitest.setup.ts`
