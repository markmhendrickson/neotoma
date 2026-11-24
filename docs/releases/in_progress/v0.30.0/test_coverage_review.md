# Test coverage review — v0.30.0

Range: `v0.29.1..e4c5e62c0` (`origin/main`), 43 commits. Release-branch commits on top change only the version, version lines in `README.md`, `docs/known_limitations.md` and `SECURITY.md`, and release docs. Each entry names the tests the commit added or changed; those ran in the commit's own pull request and in CI on `main`. Release prep reran only the security lane (auth topology matrix: 18 passed, 1 skipped) and the manifest, classifier and OpenAPI diff checks.

## Surfaces, per commit

### Field provenance and packaging (carried from the earlier candidate)

- **#2867 field provenance, HTTP and MCP:** `tests/integration/field_provenance_contract_parity.test.ts` (both transports, same body; projections, ordering, aliases, integrity and not-found envelopes), `tests/integration/field_provenance_corrected_and_merged.test.ts`, `tests/cli/cli_field_provenance.test.ts` (CLI exit code, domain code and hint) and `tests/security/provenance_read_scoping.test.ts`.
- **#2855, #2860 dependency split:** `npm run check:production-consumer` on every PR; helpers in `tests/scripts/check_production_consumer.test.mjs`.
- **#2862 worktree env copy:** `tests/scripts/worktree_env_copy.test.ts`, a required CI step.
- **#2816:** is itself a CI gate. **#2848:** design document only.

### Reads, writes and the SDK

- **#2871 as-of relationship reads:** `tests/integration/record_wide_as_of.test.ts` covers MCP, REST and CLI, edge and endpoint visibility.
- **#2879 SDK `correct()`:** `tests/integration/sdk_client_correct_http.test.ts`, `tests/integration/sdk_client_correct_types.test.ts`, `tests/unit/client_correct.test.ts`, `tests/unit/client_helpers.test.ts`.
- **#2866 embedded configuration:** `tests/unit/embedded_config.test.ts`, `embedded_env_routing.test.ts`, `embedded_issues_client.test.ts`, `embedded_standard_pins.test.ts`.
- **#2882, #2884, #2881 ownerless interpretation:** `tests/integration/interpretation_ownerless_refusal.test.ts` (null, undefined, empty, whitespace; zero rows written) and `tests/integration/observation_ingestion.test.ts`.
- **#2880, #2892 write-time wording:** `tests/contract/snapshot_temporal_cutoff_wording.test.ts` (scan widened to specs, foundation, subsystems, use cases, developer docs and `openapi.yaml`), `tests/cli/request_snapshot_temporal_cutoff.test.ts`, `tests/integration/snapshot_ingestion_cutoff.test.ts`, `tests/integration/temporal_natural_surface_acceptance.test.ts`, `tests/integration/transport_parity_store_snapshot_auth.test.ts`.

### Search and data layer

- **#2888 snapshot cleaning:** `tests/integration/lexical_search.test.ts` pins ranked ids to a baseline fixture; `src/shared/action_handlers/entity_handlers.test.ts`.
- **#2889 yielding and object fragments:** `tests/integration/lexical_search.test.ts`.
- **#2891 semantic search without a vector backend:** `src/services/__tests__/entity_semantic_search.test.ts`, `tests/integration/entity_read_contract.test.ts` (both the provider-failure and no-backend paths), `tests/integration/entity_search_mode.test.ts`, `tests/services/store_conditional.test.ts`.
- **#2900 `search_text` column:** `tests/integration/entity_search_text_column.test.ts` and its libsql variant, `tests/integration/entity_lifecycle_executor_program.test.ts` (validator: refuse wrong, accept fresh, accept NULL after rename, fail closed on unreadable read, refuse when encrypted). In the `test:contract-parity` lane.
- **#2903 SQL candidate filter:** `tests/integration/lexical_search_sql_filter.test.ts`, in the contract-parity lane.
- **#2905 backfill:** `tests/integration/entity_search_text_backfill.test.ts` and its libsql variant.
- **#2887 instance-policy index:** `tests/unit/instance_policy_lookup_index.test.ts`.
- **#2904 store-path indexes:** `tests/unit/store_path_write_indexes.test.ts`, `tests/unit/filter_owned_entity_ids.test.ts`, `tests/unit/entities_user_type_index.test.ts`, deploy config contract tests.
- **#2909, #2911 leftover full-text objects:** `tests/integration/orphan_entity_fts_triggers.test.ts` (drop counts, no copy of deleted text remains, median-based timing), in the contract-parity lane.

### Authentication, sessions and admission

- **#2890 lookup failure as 503:** `tests/integration/aauth_admission_lookup_failed.test.ts`, `tests/unit/aauth_admission.test.ts`, `tests/unit/aauth_admission_middleware_lookup_failed.test.ts`, `tests/unit/agent_capabilities.test.ts`.
- **#2886 `last_used_at`:** `tests/unit/agent_grants_service.test.ts`.
- **#2898, #2902 outbound host guard:** `tests/security/ssrf_outbound_host_guard.test.ts` and `tests/security/ssrf_sink_wiring.test.ts` drive each outbound path on a `0.0.0.0` bind, with a loopback control. #2902 is release-notes text.
- **#2899 sign-out:** `src/services/__tests__/oauth_key_gate.test.ts`, `tests/integration/mcp_oauth_sign_out.test.ts` (authorize re-prompts; failed callback ends the session).
- **#2901 `user_id` override scope:** `tests/integration/dev_user_id_override_scope.test.ts` over HTTP; `tests/unit/mcp_instruction_token_budget.test.ts` for the instruction budget.
- **#2908 static bearer shared graph:** `tests/integration/mcp_static_bearer_skill_delivery.test.ts` (contract-parity lane), `tests/unit/static_bearer_gate_only_id.test.ts`.
- **#2915 guest-token revocation:** `src/services/guest_access_token_revoke.test.ts`, `tests/cli/request_guest_revocation.test.ts` (error codes and correction history over HTTP).
- **#2920, #2926 optional retrieve enforcement:** `tests/integration/agent_retrieve_capability.test.ts` (merge hops, cycles, over-deep chains, typed raw-id lookups, MCP resources, graph rows), `tests/contract/retrieve_scope_coverage_guard.test.ts`, `tests/contract/retrieve_scope_registered_routes.test.ts`.

### Logging

- **#2917 access log:** `tests/unit/access_log.test.ts` (formats, IPv4 and expanded IPv6 prefixes, full-address opt-in).
- **#2927 read log:** `tests/unit/read_log.test.ts`, `read_log_classification.test.ts`, `read_log_output_channel.test.ts`, plus the read-log guard.

### Agent-facing delivery

- **#2906 standing rules in prose:** `tests/integration/standing_rules_initialize_effect.test.ts`, `..._lookup_failure.test.ts`, `..._parity.test.ts`, `standing_rules_isolated_server_initialize.test.ts`, `tests/unit/standing_rules_prose.test.ts`.
- **#2916 stateless entrances:** `tests/integration/standing_rules_stateless_entrances.test.ts`, `standing_rules_cli_instructions_print.test.ts`, `mcp_http_server_discover.test.ts`, `tests/security/sync_protected_routes_manifest.test.ts`.
- **#2907 derived skill description:** `tests/integration/instance_skills_initialize_effect.test.ts`, `tests/unit/mcp_instance_skill_hints.test.ts`.
- **#2930 skills on discover:** `tests/integration/mcp_instance_skill_and_rule_delivery.test.ts` (initialize, discover, static-token shared-graph scoping), contract-parity lane.
- **#2933 empty skill lookup hint:** `tests/integration/skill_lookup_not_found_hint.test.ts`.
- **#2935 skipped rule count:** `tests/integration/standing_rules_skipped_count_entrances.test.ts`, `standing_rules_initialize_skipped_count.test.ts`, `standing_rules_cli_skipped_count.test.ts`, `tests/unit/standing_rules.test.ts`.

### CI and docs only

- **#2878:** `tests/unit/test_prerequisites.test.ts` pins the build-before-suite step. **#2447:** documentation row, no test (no docs-parity harness exists).

## Gaps

- Index creation time on a large existing database (#2887, #2904) is not measured by a test; self-hosters are told it adds time to the first start.
- The background backfill switch (`NEOTOMA_SEARCH_TEXT_BACKFILL=1`) is covered through the shared backfill routine, not by a server-start test.

## Code review notes

No blocking findings.

- Note: #2867 changes the response contract of an existing operation in four ways; all are named with migration steps in Breaking changes, and the version is a minor bump. The change is response-side, so the request-side legacy-payload corpus does not apply.
- Note: #2898 and #2901 change behavior for existing self-hosted setups; both are in Breaking changes with migration steps.
- Note: the `FieldProvenanceError` envelope sets `timestamp` from the wall clock; it is response metadata, not data-layer output.
- Note: contract seams are aligned. `openapi.yaml`, `src/shared/openapi_types.ts`, `src/shared/contract_mappings.ts` (#2916 rows) and the protected-routes manifest (130 routes, in sync) are regenerated.
