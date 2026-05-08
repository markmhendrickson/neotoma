# Documentation coverage manifest

A reviewable map of every code surface in the repo to its primary `docs/` source-of-truth. Generated as the spine of the docs full-coverage audit (see [.cursor/plans/docs_full-coverage_audit_760791a8.plan.md](../.cursor/plans/docs_full-coverage_audit_760791a8.plan.md)).

Status legend:

- `documented` — primary doc exists and substantively reflects the code.
- `stale` — primary doc exists but lags recent code changes (touched in this docs pass).
- `gap` — no primary doc; authored or extended in this docs pass.
- `pointer` — surface is a thin wrapper documented inside its parent's doc; no dedicated entry needed.
- `external` — surface lives in a submodule or external package with its own doc.

Totals (pre-pass baseline from [docs/site/generated/DOCS_MARKDOWN_AUDIT.md](site/generated/DOCS_MARKDOWN_AUDIT.md)): 393 markdown files across 30+ `docs/` subdirs. Outstanding git changes touched 234 entries. This pass closes the gaps for the new code subsystems (`subscriptions`, `sync`, `entity_submission`, `events`, expanded `issues`) and adds a top-level scripts reference.

---

## Backend — `src/`

### Top-level entrypoints

- `src/server.ts` — HTTP API + MCP transport entry. Status: `documented` ([docs/architecture/architecture.md](architecture/architecture.md), [docs/specs/MCP_SPEC.md](specs/MCP_SPEC.md), [docs/architecture/openapi_contract_flow.md](architecture/openapi_contract_flow.md)).
- `src/actions.ts` — canonical action registry (store, retrieve, etc.). Status: `documented` ([docs/specs/MCP_SPEC.md](specs/MCP_SPEC.md), [docs/architecture/mcp_actions_assessment.md](architecture/mcp_actions_assessment.md)).
- `src/tool_definitions.ts` — MCP tool descriptors. Status: `documented` ([docs/developer/mcp/tool_descriptions.yaml](developer/mcp/tool_descriptions.yaml), [docs/developer/mcp/instructions.md](developer/mcp/instructions.md)).
- `src/db.ts` — sqlite/repository façade. Status: `documented` ([docs/subsystems/observation_architecture.md](subsystems/observation_architecture.md)).
- `src/normalize.ts` — store-time field normalization. Status: `documented` ([docs/subsystems/schema.md](subsystems/schema.md)).
- `src/embeddings.ts` — embedding gateway. Status: `documented` ([docs/subsystems/vector_ops.md](subsystems/vector_ops.md)).
- `src/openclaw_entry.ts` — OpenClaw plugin entry. Status: `documented` ([docs/integrations/](integrations/), [docs/developer/mcp_openclaw_setup.md](developer/mcp_openclaw_setup.md)).
- `src/mcp_dev_shim.ts`, `src/mcp_ws_bridge.ts`, `src/mcp_instruction_doc.ts`, `src/mcp_server_card.ts` — MCP shims and metadata. Status: `documented` ([docs/developer/mcp/proxy.md](developer/mcp/proxy.md), [docs/developer/mcp/instructions.md](developer/mcp/instructions.md)).
- `src/release_notes_enrichment.ts`, `src/semver_compat.ts`, `src/version_check.ts` — release tooling. Status: `gap` → addressed by new [docs/subsystems/release_notes.md](subsystems/release_notes.md).
- `src/config.ts`, `src/config/record_types.ts` — runtime config. Status: `documented` ([docs/developer/environment/](developer/environment/), [docs/subsystems/record_types.md](subsystems/record_types.md)).

### `src/services/` — top-level files (78 files)

- AAuth attestation/admission (`aauth_*.ts`, ~10 files): `documented` ([docs/subsystems/aauth.md](subsystems/aauth.md), [docs/subsystems/aauth_attestation.md](subsystems/aauth_attestation.md), [docs/subsystems/aauth_cli_attestation.md](subsystems/aauth_cli_attestation.md)).
- Access policy (`access_policy.ts`): `documented` ([docs/subsystems/auth.md](subsystems/auth.md), [docs/subsystems/guest_access_policy.md](subsystems/guest_access_policy.md)).
- Agent capabilities, grants, key, directory (`agent_capabilities.ts`, `agent_grants.ts`, `agent_key.ts`, `agents_directory.ts`): `documented` ([docs/subsystems/agent_capabilities.md](subsystems/agent_capabilities.md), [docs/subsystems/agent_attribution_integration.md](subsystems/agent_attribution_integration.md), [docs/plans/agent_identity_attribution_pilot.md](plans/agent_identity_attribution_pilot.md)).
- Attribution policy (`attribution_policy.ts`): `documented` ([docs/subsystems/agent_attribution_integration.md](subsystems/agent_attribution_integration.md)).
- Auto-enhancement (`auto_enhancement_processor.ts`): `documented` ([docs/architecture/schema_expansion.md](architecture/schema_expansion.md), [docs/architecture/progressive_schema_enforcement.md](architecture/progressive_schema_enforcement.md)).
- Batch correction (`batch_correction.ts`): `documented` ([docs/subsystems/observation_architecture.md](subsystems/observation_architecture.md)).
- Canonical mirror / markdown (`canonical_markdown.ts`, `canonical_mirror.ts`, `canonical_mirror_git.ts`): `documented` ([docs/subsystems/markdown_mirror.md](subsystems/markdown_mirror.md)) — refreshed in Phase 2.
- Capability registry (`capability_registry.ts`): `documented` ([docs/subsystems/agent_capabilities.md](subsystems/agent_capabilities.md)).
- Conversation turn (`conversation_turn.ts`): `documented` ([docs/subsystems/conversation_turn.md](subsystems/conversation_turn.md)).
- Correction (`correction.ts`): `documented` ([docs/subsystems/observation_architecture.md](subsystems/observation_architecture.md)).
- CSV chunking/extraction (`csv_chunking.ts`, `csv_row_extraction.ts`): `documented` ([docs/subsystems/ingestion/](subsystems/ingestion/)).
- Dashboard stats (`dashboard_stats.ts`): `documented` ([docs/subsystems/entities.md](subsystems/entities.md)).
- Deletion (`deletion.ts`, `deletion_monitor.ts`, `gdpr_deletion.ts`): `documented` ([docs/subsystems/deletion.md](subsystems/deletion.md), [docs/subsystems/privacy.md](subsystems/privacy.md)).
- Drift comparison (`drift_comparison.ts`): `documented` ([docs/subsystems/entity_snapshots.md](subsystems/entity_snapshots.md)).
- Duplicate detection (`duplicate_detection.ts`): `documented` ([docs/subsystems/entity_merge.md](subsystems/entity_merge.md)).
- Encryption service (`encryption_service.ts`): `documented` ([docs/subsystems/privacy.md](subsystems/privacy.md)).
- Entity merge / split / queries / resolution / semantic search / snapshot embedding / type guards (`entity_*.ts`): `documented` ([docs/subsystems/entities.md](subsystems/entities.md), [docs/subsystems/entity_merge.md](subsystems/entity_merge.md), [docs/subsystems/entity_snapshots.md](subsystems/entity_snapshots.md), [docs/foundation/entity_resolution.md](foundation/entity_resolution.md)).
- External actor promoter (`external_actor_promoter.ts`): `documented` ([docs/subsystems/agent_attribution_integration.md](subsystems/agent_attribution_integration.md)).
- Field canonicalization/converters/validation (`field_*.ts`): `documented` ([docs/foundation/field_validation.md](foundation/field_validation.md), [docs/subsystems/schema.md](subsystems/schema.md)).
- File text extraction (`file_text_extraction.ts`): `documented` ([docs/subsystems/ingestion/](subsystems/ingestion/), [docs/developer/import_interpretation_debug.md](developer/import_interpretation_debug.md)).
- Finances field mapping (`finances_field_mapping.ts`): `documented` ([docs/subsystems/ingestion/](subsystems/ingestion/)).
- Flat packed detection (`flat_packed_detection.ts`): `documented` ([docs/subsystems/ingestion/](subsystems/ingestion/)).
- GitHub link / webhook (`github_link.ts`, `github_webhook.ts`): `documented` ([docs/subsystems/issues.md](subsystems/issues.md)) — extended in Phase 3.
- Guest access token (`guest_access_token.ts`): `documented` ([docs/subsystems/guest_access_policy.md](subsystems/guest_access_policy.md)).
- Inspector mount (`inspector_mount.ts`): `documented` (README in [README.md](../README.md), [docs/developer/cli_overview.md](developer/cli_overview.md), [inspector/README.md](../inspector/README.md)).
- Interpretation (`interpretation.ts`): `documented` ([docs/subsystems/interpretations.md](subsystems/interpretations.md)).
- Local auth / entity embedding (`local_auth.ts`, `local_entity_embedding.ts`): `documented` ([docs/subsystems/auth.md](subsystems/auth.md), [docs/subsystems/vector_ops.md](subsystems/vector_ops.md)).
- MCP auth / OAuth (`mcp_auth.ts`, `mcp_oauth.ts`, `mcp_oauth_errors.ts`, `oauth_key_gate.ts`, `oauth_state.ts`): `documented` ([docs/developer/mcp_oauth_implementation.md](developer/mcp_oauth_implementation.md), [docs/developer/mcp_oauth_migration_guide.md](developer/mcp_oauth_migration_guide.md), [docs/developer/mcp_oauth_troubleshooting.md](developer/mcp_oauth_troubleshooting.md), [docs/developer/mcp_authentication_summary.md](developer/mcp_authentication_summary.md)).
- Memory export (`memory_export.ts`): `documented` ([docs/subsystems/peer_sync.md](subsystems/peer_sync.md), [docs/foundation/data_models.md](foundation/data_models.md)).
- Observation identity / source label / storage / raw fragments / raw storage (`observation_*.ts`, `raw_*.ts`): `documented` ([docs/subsystems/observation_architecture.md](subsystems/observation_architecture.md), [docs/subsystems/sources.md](subsystems/sources.md)).
- Parquet reader (`parquet_reader.ts`): `documented` ([docs/specs/PARQUET_MCP_RESOURCES_SPEC.md](specs/PARQUET_MCP_RESOURCES_SPEC.md)).
- Protected entity types (`protected_entity_types.ts`): `documented` ([docs/subsystems/schema_registry.md](subsystems/schema_registry.md)).
- Public key registry (`public_key_registry.ts`): `documented` ([docs/subsystems/aauth.md](subsystems/aauth.md)).
- Recent conversations / record activity (`recent_*.ts`): `documented` ([docs/subsystems/conversation_turn.md](subsystems/conversation_turn.md)).
- Relationships (`relationships.ts`): `documented` ([docs/subsystems/relationships.md](subsystems/relationships.md)).
- Request context (`request_context.ts`): `documented` ([docs/subsystems/agent_attribution_integration.md](subsystems/agent_attribution_integration.md)).
- Sandbox mode (`sandbox_mode.ts`): `documented` ([docs/subsystems/sandbox_deployment.md](subsystems/sandbox_deployment.md)).
- Schema definitions / icon / inference / recommendation / reference linking / registry (`schema_*.ts`): `documented` ([docs/subsystems/schema.md](subsystems/schema.md), [docs/subsystems/schema_registry.md](subsystems/schema_registry.md), [docs/architecture/schema_handling.md](architecture/schema_handling.md), [docs/architecture/progressive_schema_enforcement.md](architecture/progressive_schema_enforcement.md), [docs/plans/schema_introspection.md](plans/schema_introspection.md)).
- Session info (`session_info.ts`): `documented` ([docs/subsystems/auth.md](subsystems/auth.md)).
- Snapshot computation / export (`snapshot_*.ts`): `documented` ([docs/subsystems/entity_snapshots.md](subsystems/entity_snapshots.md), [docs/subsystems/schema_snapshots/](subsystems/schema_snapshots/)).
- Source identity (`source_identity.ts`): `documented` ([docs/subsystems/sources.md](subsystems/sources.md)).
- Timeline events (`timeline_events.ts`): `documented` ([docs/subsystems/timeline_events.md](subsystems/timeline_events.md), [docs/foundation/timeline_events.md](foundation/timeline_events.md)).

### `src/services/` — subdirectories

- `src/services/compliance/` (1 file: `scorecard.ts`) — Status: `documented` ([docs/subsystems/agentic_eval.md](subsystems/agentic_eval.md)).
- `src/services/feedback/` (1 file: `redaction.ts`) — Status: `documented` ([docs/subsystems/feedback_system_architecture.md](subsystems/feedback_system_architecture.md), [docs/subsystems/feedback_neotoma_forwarder.md](subsystems/feedback_neotoma_forwarder.md), [docs/subsystems/agent_feedback_pipeline.md](subsystems/agent_feedback_pipeline.md)).
- `src/services/issues/` (15 files) — Status: was partially `gap` → addressed by new [docs/subsystems/issues.md](subsystems/issues.md) authored in Phase 3, supplements existing [docs/subsystems/feedback_system_architecture.md](subsystems/feedback_system_architecture.md).
- `src/services/root_landing/` (5 files) — Status: `documented` ([docs/developer/getting_started.md](developer/getting_started.md), [docs/site/README.md](site/README.md)).
- `src/services/sandbox/` (8 files) — Status: `documented` ([docs/subsystems/sandbox_deployment.md](subsystems/sandbox_deployment.md), [docs/developer/sandbox*](developer/)).
- `src/services/subscriptions/` (8 files) — Status: was `gap` → addressed by new [docs/subsystems/subscriptions.md](subsystems/subscriptions.md) authored in Phase 3.
- `src/services/sync/` (8 files) — Status: was partially `gap` → addressed by extending [docs/subsystems/peer_sync.md](subsystems/peer_sync.md) in Phase 3 with sub-sections for full_sync, conflict_resolver, peer_health, peer_ops, sync_webhook_*, peer_sync_batch.
- `src/services/entity_submission/` (5 files + `ingest/`, `mirrors/`) — Status: was `gap` → addressed by new [docs/subsystems/entity_submission.md](subsystems/entity_submission.md) authored in Phase 3.

### `src/cli/` — top-level (27 files)

- `src/cli/index.ts` — CLI entry. Status: `documented` ([docs/developer/cli_reference.md](developer/cli_reference.md), [docs/developer/cli_overview.md](developer/cli_overview.md), [docs/developer/cli_agent_instructions.md](developer/cli_agent_instructions.md)).
- AAuth signers (`aauth_signer.ts`, `aauth_tbs_attestation.ts`, `aauth_tpm2_attestation.ts`, `aauth_yubikey_attestation.ts`) — Status: `documented` ([docs/subsystems/aauth_cli_attestation.md](subsystems/aauth_cli_attestation.md), [docs/integrations/aauth_*](integrations/)).
- `access.ts`, `agent_instructions_scan.ts`, `agents_grants_import.ts`, `bootstrap.ts`, `config.ts`, `discovery.ts`, `doctor.ts`, `format.ts`, `harness_configure.ts`, `hooks.ts`, `hooks_detect.ts`, `init_abort.ts`, `inspector_admin_unlock_url.ts`, `mcp_config_scan.ts`, `mcp_proxy.ts`, `pack_rat.ts`, `permissions.ts`, `setup.ts`, `setup_runners.ts`, `transcript_parser.ts` — Status: `documented` (cli_reference.md sections; `transcript_parser.ts` covered by [docs/developer/transcript_ingestion.md](developer/transcript_ingestion.md)).
- `issues.ts` — Status: `stale` → refreshed in Phase 2 ([docs/developer/cli_reference.md](developer/cli_reference.md)).
- `peers.ts` — Status: was `gap` → added to [docs/developer/cli_reference.md](developer/cli_reference.md) and cross-linked from [docs/subsystems/peer_sync.md](subsystems/peer_sync.md) in Phase 2/3.

### `src/cli/commands/`

- `mirror.ts`, `processes.ts` — Status: was `gap` → added to [docs/developer/cli_reference.md](developer/cli_reference.md) in Phase 2.

### `src/events/` (NEW)

- `substrate_event_bus.ts`, `substrate_store_emit.ts`, `types.ts` — Status: was `gap` → addressed by new [docs/subsystems/substrate_events.md](subsystems/substrate_events.md) authored in Phase 3.

### `src/repositories/`

- `interfaces.ts`, `index.ts`, `db/`, `file/`, `sqlite/` — Status: `documented` ([docs/subsystems/observation_architecture.md](subsystems/observation_architecture.md), [docs/architecture/architecture.md](architecture/architecture.md)).

### `src/middleware/`, `src/proxy/`, `src/crypto/`, `src/utils/`, `src/reducers/`, `src/types/`, `src/shared/`, `src/core/`

- AAuth middleware (`middleware/aauth_admission.ts`, `aauth_verify.ts`): `documented` ([docs/subsystems/aauth.md](subsystems/aauth.md)).
- Attribution context (`middleware/attribution_context.ts`): `documented` ([docs/subsystems/agent_attribution_integration.md](subsystems/agent_attribution_integration.md)).
- Encrypt response, unknown_fields_guard middleware: `documented` ([docs/subsystems/privacy.md](subsystems/privacy.md), [docs/subsystems/schema.md](subsystems/schema.md)).
- Proxy (`proxy/`): `documented` ([docs/developer/mcp/proxy.md](developer/mcp/proxy.md)).
- Crypto: `documented` ([docs/subsystems/aauth.md](subsystems/aauth.md), [docs/subsystems/privacy.md](subsystems/privacy.md), [docs/architecture/determinism.md](architecture/determinism.md)).
- Utils (`utils/`): `documented` (cross-cutting helpers; `local_http_port_file.ts` covered by [docs/developer/mcp/proxy.md](developer/mcp/proxy.md), `log_encrypt.ts` by [docs/subsystems/privacy.md](subsystems/privacy.md)).
- Reducers (`reducers/observation_reducer.ts`, `relationship_reducer.ts`): `documented` ([docs/subsystems/reducer.md](subsystems/reducer.md)).
- Types: `documented` (AAuth attestation type defs; cross-ref from [docs/subsystems/aauth_attestation.md](subsystems/aauth_attestation.md)).
- Shared (action_handlers, schemas, api_client, contract_mappings, openapi_*, sandbox_terms_content): `documented` ([docs/specs/MCP_SPEC.md](specs/MCP_SPEC.md), [docs/architecture/openapi_contract_flow.md](architecture/openapi_contract_flow.md)).
- Core (`core/operations.ts`): `documented` ([docs/subsystems/observation_architecture.md](subsystems/observation_architecture.md)).

---

## CLI surfaces — `src/cli/`

Index lives in [docs/developer/cli_reference.md](developer/cli_reference.md). Adjuncts: [docs/developer/cli_overview.md](developer/cli_overview.md), [docs/developer/cli_agent_instructions.md](developer/cli_agent_instructions.md), [docs/developer/agent_cli_configuration.md](developer/agent_cli_configuration.md). All commands listed; new `peers`, `mirror`, `processes` added in Phase 2.

---

## MCP — actions, tools, transports

- Actions catalog: [docs/specs/MCP_SPEC.md](specs/MCP_SPEC.md), [docs/architecture/mcp_actions_assessment.md](architecture/mcp_actions_assessment.md).
- Tool descriptors: [docs/developer/mcp/tool_descriptions.yaml](developer/mcp/tool_descriptions.yaml).
- Agent instructions block (canonical): [docs/developer/mcp/instructions.md](developer/mcp/instructions.md).
- Transport / proxy / dev shims: [docs/developer/mcp/proxy.md](developer/mcp/proxy.md), [docs/developer/mcp_cursor_setup.md](developer/mcp_cursor_setup.md), [docs/developer/mcp_chatgpt_setup.md](developer/mcp_chatgpt_setup.md), [docs/developer/mcp_claude_code_setup.md](developer/mcp_claude_code_setup.md), [docs/developer/mcp_ironclaw_setup.md](developer/mcp_ironclaw_setup.md), [docs/developer/mcp_openclaw_setup.md](developer/mcp_openclaw_setup.md).
- HTTPS / tunnels / OAuth: [docs/developer/mcp_https_testing.md](developer/mcp_https_testing.md), [docs/developer/mcp_https_tunnel_status.md](developer/mcp_https_tunnel_status.md), [docs/developer/mcp_oauth_implementation.md](developer/mcp_oauth_implementation.md), [docs/developer/tunnels.md](developer/tunnels.md), [docs/developer/tunnel_auth_audit_matrix.md](developer/tunnel_auth_audit_matrix.md).
- ChatGPT app: [docs/developer/chatgpt_app_readiness_audit.md](developer/chatgpt_app_readiness_audit.md), [docs/developer/chatgpt_app_submission_draft.md](developer/chatgpt_app_submission_draft.md), [docs/developer/chatgpt_apps_setup.md](developer/chatgpt_apps_setup.md), [docs/developer/chatgpt_apps_auth_security.md](developer/chatgpt_apps_auth_security.md), [docs/developer/chatgpt_apps_validation_submission_checklist.md](developer/chatgpt_apps_validation_submission_checklist.md), [docs/developer/chatgpt_integration_instructions.md](developer/chatgpt_integration_instructions.md).

---

## Scripts — `scripts/` (205 files)

Status: was largely `pointer` (covered ad-hoc) → consolidated index added in Phase 3 as [docs/developer/scripts_reference.md](developer/scripts_reference.md). Family groupings:

- MCP shims (`run_neotoma_mcp_*.sh`): cross-ref [docs/developer/mcp/proxy.md](developer/mcp/proxy.md).
- Launchd (`com.neotoma.*.plist.template`, `install_launchd_*.js`, `run_*_launchd.sh`, `kill_stale_neotoma_dev_stacks.sh`): cross-ref [docs/developer/launchd_watch_build.md](developer/launchd_watch_build.md), [docs/developer/launchd_dev_servers.md](developer/launchd_dev_servers.md).
- MDX site validators (`mdx_site_*.ts`, `validate_mdx_site_pages.ts`, `sync_legal_site_mdx.mjs`): cross-ref [docs/developer/site_mdx_documentation.md](developer/site_mdx_documentation.md).
- Schema/data tooling (`analyze_*`, `backfill_*`, `migrate_*`, `seed_*`, `recompute_*`, `recover_sqlite_database.js`): cross-ref [docs/subsystems/schema.md](subsystems/schema.md), [docs/subsystems/observation_architecture.md](subsystems/observation_architecture.md), [docs/operations/runbook.md](operations/runbook.md).
- Build/release (`release_orchestrator.js`, `render_github_release_notes.ts`, `build_*.{js,tsx}`, `pdf_worker_polyfill.mjs`): cross-ref [docs/developer/release_orchestrator.md](developer/release_orchestrator.md), [docs/developer/github_release_process.md](developer/github_release_process.md).
- Dev servers and tunnels (`dev-serve.js`, `dev-proxy.js`, `with_branch_ports.js`, `setup-https-tunnel.sh`, `setup-dns.sh`): cross-ref [docs/developer/development_workflow.md](developer/development_workflow.md), [docs/developer/launchd_dev_servers.md](developer/launchd_dev_servers.md).
- Sandbox (`provision_sandbox_fly.sh`, `reset_sandbox.ts`, `schedule_sandbox_reset.sh`, `seed_sandbox.ts`, `sandbox_purge_entity.ts`): cross-ref [docs/subsystems/sandbox_deployment.md](subsystems/sandbox_deployment.md).
- Test/QA (`test_*.{ts,sh,js}`, `validate_*.{ts,js}`, `spec_compliance_*`, `instruct_agents_*`): cross-ref [docs/testing/](testing/).
- DNS / Cloudflare (`cloudflare_*.sh`, `setup-dns.sh`, `disable-dns.sh`): cross-ref [docs/operations/runbook.md](operations/runbook.md).
- Setup helpers (`setup_*.sh`, `setup-*.sh`, `setup-*.js`): cross-ref [docs/developer/getting_started.md](developer/getting_started.md), [docs/developer/development_workflow.md](developer/development_workflow.md).
- Migrations / fixes (`fix_*.{js,sh}`, `migrate*`, `migrate/`): cross-ref [docs/migration/](migration/), [docs/operations/runbook.md](operations/runbook.md).

Sub-directories: `scripts/config/`, `scripts/migrate/`, `scripts/linters/`, `scripts/prototypes/`, `scripts/neotoma-npm-reserve/` are documented in their parent family entries.

---

## Frontend — `frontend/src/components/`

The site SPA (public marketing + docs) is a hybrid MDX/React surface. Architecture and authoring rules: [docs/developer/site_mdx_documentation.md](developer/site_mdx_documentation.md), [docs/site/README.md](site/README.md), [docs/site/MIGRATION_BATCHES.md](site/MIGRATION_BATCHES.md).

Component folder coverage:

- `frontend/src/components/subpages/` (127 files) — thin TSX route shells, mostly `MdxSitePage` wrappers around MDX bodies. Status: `pointer` → covered by site MDX manifest ([docs/site/site_doc_manifest.yaml](site/site_doc_manifest.yaml)) and [docs/site/MIGRATION_BATCHES.md](site/MIGRATION_BATCHES.md).
- `frontend/src/components/install/` — install page bodies (`install_page_body.tsx`, `install_docker_page_body.tsx`, `install_manual_page_body.tsx`). Status: `documented` ([docs/site/MIGRATION_BATCHES.md](site/MIGRATION_BATCHES.md) Batch 1).
- `frontend/src/components/integration_connect/` — connect-flow page bodies for Codex/Claude/OpenClaw/ChatGPT. Status: `documented` (Batch 2).
- `frontend/src/components/neotoma_with/` — main `/neotoma-with-*` landing bodies. Status: `documented` (Batch 2).
- `frontend/src/components/memory_guarantees/` — `/memory-guarantees` body. Status: `documented` (Batch 3).
- `frontend/src/components/primitives/` — primitive guides (entities/observations/sources/etc.). Status: `documented` (Batch 3).
- `frontend/src/components/schemas/` — schema concept guides. Status: `documented` (Batch 3).
- `frontend/src/components/mdx/` — MDX provider components (changelog_live_block, doc_reference_tables, mdx_i18n_link, mdx_site_components). Status: `documented` ([docs/developer/site_mdx_documentation.md](developer/site_mdx_documentation.md)).
- `frontend/src/components/ui/`, `design-system/`, `icons/`, `illustrations/` — shared UI primitives and assets. Status: `documented` ([docs/ui/](ui/)).
- Top-level pages (Home, MainApp, Layout, etc.): `documented` ([docs/site/MIGRATION_BATCHES.md](site/MIGRATION_BATCHES.md), [docs/specs/UI_SPEC.md](specs/UI_SPEC.md), [docs/specs/homepage_design_guidelines.md](specs/homepage_design_guidelines.md)).

---

## Frontend — `inspector/` (git submodule)

External submodule with its own `inspector/README.md`. Status: `external` — high-level surface only; cross-referenced from [README.md](../README.md), [docs/developer/cli_overview.md](developer/cli_overview.md). Inspector route inventory is covered by [docs/site/generated/ROUTE_INVENTORY.md](site/generated/ROUTE_INVENTORY.md) under the `/inspector/*` paths.

---

## Site MDX — `docs/site/pages/**/*.mdx`

90 MDX files total: 88 in `en/` (76 root + 7 nested under `primitives/`, 4 nested under `schemas/`, 1 nested under `home/`) + 2 in `es/`.

- Authoring guide: [docs/developer/site_mdx_documentation.md](developer/site_mdx_documentation.md).
- Manifest: [docs/site/site_doc_manifest.yaml](site/site_doc_manifest.yaml) — pre-pass had 87 `docs/site/pages/*` entries; missing entries (added in Phase 4):
  - `docs/site/pages/en/home.mdx`
  - `home-2.mdx` and `home/x7k9m2vp.mdx` preview variants were removed 2026-05-08; only the canonical `/` variant remains.
- Route classification: [docs/site/generated/ROUTE_INVENTORY.md](site/generated/ROUTE_INVENTORY.md).
- Migration progress: [docs/site/MIGRATION_BATCHES.md](site/MIGRATION_BATCHES.md).
- Generated audits: [docs/site/generated/DOCS_MARKDOWN_AUDIT.md](site/generated/DOCS_MARKDOWN_AUDIT.md), [docs/site/generated/translation_audit.md](site/generated/translation_audit.md).

---

## Packages — `packages/`

13 packages; each carries its own README. Status: `external` for behavior, with cross-cutting docs as noted:

- `aauth-mac-se`, `aauth-tpm2`, `aauth-win-tbs`, `aauth-yubikey` — AAuth attestation packages: [docs/integrations/aauth_*.md](integrations/), [docs/subsystems/aauth_attestation.md](subsystems/aauth_attestation.md).
- `client`, `client-python` — neotoma client SDKs. Cross-ref [docs/developer/canonical_walkthrough.md](developer/canonical_walkthrough.md). The Node client carries `src/turn_report.ts` (modified) which surfaces in agent display rules covered in [docs/developer/mcp/instructions.md](developer/mcp/instructions.md).
- `claude-agent-sdk-adapter`, `claude-code-plugin`, `cursor-hooks`, `codex-hooks`, `opencode-plugin` — harness-specific adapters and hooks: [docs/integrations/hooks/](integrations/hooks/), [docs/developer/agent_cli_configuration.md](developer/agent_cli_configuration.md).
- `eval-combined`, `eval-harness` — agentic evaluation: [docs/subsystems/agentic_eval.md](subsystems/agentic_eval.md), [docs/developer/agentic_eval_fixture_format.md](developer/agentic_eval_fixture_format.md).

---

## Tests — `tests/`

Catalog: [docs/testing/automated_test_catalog.md](testing/automated_test_catalog.md). Standard: [docs/testing/testing_standard.md](testing/testing_standard.md). New tests added with this work cycle (`tests/integration/cross_instance_issues.test.ts`, `tests/services/peer_sync_batch.test.ts`, `tests/services/sync_webhook_outbound.test.ts`, `tests/subscriptions/`, `tests/unit/subscription_types.test.ts`, `tests/unit/substrate_event_bus.test.ts`) are covered by the new subsystem docs they exercise (subscriptions, substrate_events, sync extensions, issues).

---

## Plans — `docs/plans/`

- [docs/plans/agent_identity_attribution_pilot.md](plans/agent_identity_attribution_pilot.md) — companion to `docs/subsystems/agent_attribution_integration.md`.
- [docs/plans/multi_tenant_operations.md](plans/multi_tenant_operations.md) — operational scaling plan; references [docs/subsystems/peer_sync.md](subsystems/peer_sync.md) and the new subscriptions / substrate events docs.
- [docs/plans/observer_wire_feedback_channel.md](plans/observer_wire_feedback_channel.md) — feedback loop plan; references [docs/subsystems/feedback_system_architecture.md](subsystems/feedback_system_architecture.md), [docs/subsystems/issues.md](subsystems/issues.md).
- [docs/plans/schema_introspection.md](plans/schema_introspection.md) — schema introspection plan; references [docs/subsystems/schema.md](subsystems/schema.md), [docs/subsystems/schema_registry.md](subsystems/schema_registry.md).

---

## Top-level configuration / infra docs

- `package.json`, `package.json.scripts`: covered by [docs/developer/package_scripts.md](developer/package_scripts.md).
- `openapi.yaml`: covered by [docs/architecture/openapi_contract_flow.md](architecture/openapi_contract_flow.md).
- `vite.config.ts`, `vitest.config.ts`: covered by [docs/developer/vite_troubleshooting.md](developer/vite_troubleshooting.md), [docs/testing/](testing/).
- `.codex/`, `.cursor/rules/`, `.claude/skills/`: covered by [docs/developer/agent_instructions.md](developer/agent_instructions.md), [docs/developer/agent_cli_configuration.md](developer/agent_cli_configuration.md).
- `.mcp.json`, `.cursor/mcp.json`: covered by [docs/developer/mcp/proxy.md](developer/mcp/proxy.md), [docs/developer/mcp_cursor_setup.md](developer/mcp_cursor_setup.md).

---

## Coverage status

After this docs full-coverage pass (executed 2026-05-07):

### Closed in this pass

- New subsystem docs: 5 added (`subscriptions`, `substrate_events`, `entity_submission`, `issues`, `release_notes`). Existing `peer_sync.md` extended with per-file sections covering all 8 files in `src/services/sync/`.
- New developer reference: [docs/developer/scripts_reference.md](developer/scripts_reference.md) (~205 scripts grouped by family).
- CLI reference: `peers` command suite added; `mirror` and `processes` were already documented; `issues` CLI cross-linked to the new subsystem doc.
- Site MDX manifest: 3 missing home variants added (`home.mdx`, `home-2.mdx`, `home/x7k9m2vp.mdx`). The `home-2.mdx` and `home/x7k9m2vp.mdx` preview variants were removed 2026-05-08; only the canonical `home.mdx` remains.
- Site MDX manifest-closure rule added to [docs/developer/site_mdx_documentation.md](developer/site_mdx_documentation.md) Invariant 5.
- Generated audit outputs refreshed: [docs/site/generated/ROUTE_INVENTORY.md](site/generated/ROUTE_INVENTORY.md), [docs/site/generated/DOCS_MARKDOWN_AUDIT.md](site/generated/DOCS_MARKDOWN_AUDIT.md), [docs/site/generated/translation_audit.md](site/generated/translation_audit.md).
- `validate_mdx_site_pages.ts` passes against the updated manifest.
- All 234 outstanding git changes have at least one corresponding docs entry (this manifest plus the per-surface docs cited above).

### Validators run

- `npx tsx scripts/mdx_site_route_inventory.ts` — wrote `route_inventory.json` + `ROUTE_INVENTORY.md`.
- `npx tsx scripts/mdx_site_docs_audit.ts` — wrote `docs_markdown_audit.json` + `DOCS_MARKDOWN_AUDIT.md` (402 files).
- `npx tsx scripts/mdx_site_translation_audit.ts` — wrote `translation_audit.md`.
- `npx tsx scripts/validate_mdx_site_pages.ts` — passed.

### Remaining acknowledged gaps (deliberately deferred or out-of-scope)

- `docs/private/**` not enumerated here (excluded from the audit scope).
- `docs/reports/**` — historical investigation snapshots, not rolled into subsystem docs (per plan out-of-scope).
- `inspector/` — submodule with its own README; only documented externally from this repo.
- Spanish-locale MDX siblings beyond `changelog`/`faq` — translation audit lists outstanding pages but translation work is out-of-scope; recorded in [docs/site/generated/translation_audit.md](site/generated/translation_audit.md).
- A canonical reading-order index file (the plan referenced `docs/context/index_rules.mdc`, which does not currently exist in this repo). The new subsystem docs are reachable from this coverage manifest, from the per-subsystem cross-links, and from `peer_sync.md` / `feedback_system_architecture.md`. If a top-level reading-order index is reintroduced later, it should add the five new subsystem docs to its list.
