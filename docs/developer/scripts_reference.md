# `scripts/` reference

Index of the helpers under `scripts/`. The directory holds 200+ files; this page groups them by family so contributors can find the right tool without scanning the directory tree. Each family entry links to the canonical doc that owns the underlying behavior so this page stays a router rather than a duplicated source-of-truth.

## When to add to `scripts/`

`scripts/` is for repo-local automation. Anything that ships in the npm package or is consumed at runtime belongs in `src/`. Anything that is purely build-time, test-time, or operator-time can live here.

Conventions:

- TypeScript scripts are runnable with `npx tsx scripts/<name>.ts` and SHOULD avoid pulling in `dist/` so they work on a fresh checkout.
- Shell scripts target zsh / bash 5+ and SHOULD start with `#!/usr/bin/env bash` + `set -euo pipefail`.
- macOS-only scripts (LaunchAgents, `launchctl`) MUST say so in their first comment.
- New scripts MUST be referenced from the relevant subsystem doc (or this page) so they do not become orphaned.

## MCP transport shims

Wrap the MCP entry point with the local-port-file resolver, AAuth signing, and dev/prod profile selection. Canonical docs: [`docs/developer/mcp/proxy.md`](mcp/proxy.md), [`docs/developer/mcp_cursor_setup.md`](mcp_cursor_setup.md).

- `run_neotoma_mcp_signed_stdio_dev_shim.sh` — production-grade signed stdio shim used by Cursor / Claude Code by default. Resolves `MCP_PROXY_DOWNSTREAM_URL` from `.dev-serve/local_http_port_*`, sets `NEOTOMA_AAUTH_AUTHORITY_OVERRIDE`, then `exec`s `mcp_dev_shim.ts` which runs `mcp proxy --aauth`.
- `run_neotoma_mcp_unsigned_stdio_dev_shim.sh` — same resolver path without forced AAuth signing; useful when an operator has not configured `~/.neotoma/aauth/` yet.
- `run_neotoma_mcp_unsigned_stdio_proxy.sh` — legacy alias kept so existing `mcp.json` `command` paths continue to work; `exec`s the unsigned dev shim.
- `run_neotoma_mcp_stdio_dev_shim.sh`, `run_neotoma_mcp_stdio_dev_watch.sh`, `run_neotoma_mcp_stdio_prod_watch.sh`, `run_neotoma_mcp_stdio_prod.sh`, `run_neotoma_mcp_stdio.sh` — variant launchers for dev / prod / watch combinations.

## LaunchAgents (macOS)

Install or run macOS LaunchAgents that keep dev / build / sync tasks alive across reboots. Canonical docs: [`docs/developer/launchd_dev_servers.md`](launchd_dev_servers.md), [`docs/developer/launchd_prod_server.md`](launchd_prod_server.md), [`docs/developer/launchd_watch_build.md`](launchd_watch_build.md).

- `com.neotoma.watch-build.plist.template`, `run_watch_build_launchd.sh` — keeps `tsc --watch` running so the global `neotoma` CLI stays in sync.
- `com.neotoma.dev-server.plist.template`, `install_launchd_dev_server.js`, `run_dev_server_launchd.sh` — runs `npm run dev:server` for the local HTTP stack (no tunnel).
- `com.neotoma.prod-server.plist.template`, `install_launchd_prod_server.js`, `run_prod_server_launchd.sh` — runs `npm run start:server:prod` for the built production-mode API.
- `run_watch_full_prod_launchd.sh` — runs `npm run dev:full:prod` for the full production stack when invoked directly.
- `com.neotoma.issues-sync.plist.template`, `install_launchd_issues_sync.js`, `run_issues_sync_launchd.sh`, `launchd-issues-sync.env.example` — runs `neotoma issues sync` on a 5-minute cadence.
- `install_launchd_watch_build.js`, `install_launchd_watch_stacks.js` — installers consumed by the `setup:launchd-*` npm scripts. The latter is a compatibility wrapper around the maintained dev-server and watch-build installers.
- `reload_neotoma_launchagents.sh` — developer helper: `launchctl unload` + `load` for each installed Neotoma LaunchAgent plist (`npm run reload:launchd-neotoma`). Does not reload unrelated system jobs. Optional `--kill-zombies` flag SIGTERMs stale Neotoma server processes from the current repo before reloading; it recognizes four orphan patterns observed in the wild: (1) `node dist/index.js` with `PPID=1`, (2) `scripts/with_branch_ports.js node --import tsx … src/actions.ts` chains and their immediate `tsx` server child (left by chokidar reload chains that did not propagate `SIGTERM`), (3) `tsx watch … src/actions.ts` watcher chains rooted in this repo (left behind by `npm test` / `vitest` integration suites), and (4) `npm exec tsx … src/actions.ts` invocations from manual debug runs. Use after a crashed reload that leaked port `3080` / `3180` so the prod LaunchAgent can re-bind.
- `shutdown_neotoma_launchagents.sh` — developer helper: unloads Neotoma LaunchAgents, stops dev/prod APIs, and reaps leftover launchd-owned repo processes (`npm run shutdown:launchd-neotoma`).
- `kill_stale_neotoma_dev_stacks.sh` — clears orphan dev stacks before re-installing the LaunchAgents.

## MDX site validators

Audit and validate the public site. Canonical doc: [`docs/developer/site_mdx_documentation.md`](site_mdx_documentation.md).

- `mdx_site_route_inventory.ts` — regenerates [`docs/site/generated/ROUTE_INVENTORY.md`](../site/generated/ROUTE_INVENTORY.md).
- `mdx_site_docs_audit.ts` — regenerates [`docs/site/generated/DOCS_MARKDOWN_AUDIT.md`](../site/generated/DOCS_MARKDOWN_AUDIT.md).
- `mdx_site_translation_audit.ts` — regenerates [`docs/site/generated/translation_audit.md`](../site/generated/translation_audit.md).
- `validate_mdx_site_pages.ts` — lints MDX pages against the manifest; fails CI if a routed page is missing a `canonical_site_path`, `repo_path`, or expected supporting source.
- `validate_locale_parity.ts` — locale parity guard for translated pages.
- `validate_site_export.ts`, `validate_site_route_parity.ts` — extra route / export parity checks used during site builds.
- `lint_site_copy_style.ts` — copy-style linter (anti-AI patterns, voice).
- `sync_legal_site_mdx.mjs` — pulls canonical legal copy into the MDX surface.

## Schema and data tooling

Inspect, repair, and migrate stored data. Canonical docs: [`docs/subsystems/schema.md`](../subsystems/schema.md), [`docs/subsystems/observation_architecture.md`](../subsystems/observation_architecture.md), [`docs/operations/runbook.md`](../operations/runbook.md).

- `analyze_data_dir_for_schemas.ts`, `analyze_low_confidence_fields.ts`, `analyze_schema_redundancies.ts`, `analyze-data-dir-schemas.js` — read-only analysis passes used during schema reviews.
- `check_*` (e.g. `check_snapshot_schema.ts`, `check_stale_snapshots.ts`, `check_timeline_health.ts`, `check_raw_fragments.ts`, `check_sources.ts`, `check_remaining_fields.ts`, `check_remaining_eligibility.ts`, `check_auto_enhancement_status.ts`, `check_auto_test_schemas.ts`, `check_agent_*`, `check_claude_sync.sh`) — diagnostic snapshots for production health.
- `backfill_entity_embeddings.ts`, `backfill_timeline_via_recompute.ts`, `feedback_mirror_backfill.ts` — one-shot backfills.
- `migrate_*.{ts,js}`, `migrate_plans.ts`, `migrate_feedback_to_issues.ts`, `migrate_env_to_secrets.js`, `migrate/` (subdir) — data-migration entry points.
- `recompute_bob.ts`, `recompute_snapshots.ts`, `monitor_and_fix_snapshots.ts`, `manually_queue_enhancements.ts`, `process_remaining_eligible.ts` — reducer-side maintenance.
- `recover_sqlite_database.js` — SQLite recovery helper invoked by `neotoma storage recover-db` and the `.cursor/skills/recover-sqlite-database/SKILL.md` workflow.
- `seed_sandbox.ts` (+ compiled artifacts), `seed_sandbox.d.ts` — sandbox seed for fresh sandbox installs.
- `wipe-local-database.js` — destructive reset; ask before running.
- `cleanup_test_schemas.ts`, `cleanup-auto-test-schemas.ts` — remove auto-generated test schemas after CI runs.
- `export_schema_snapshots.ts` — exports the schema registry for review.
- `add_required_observation_fields.js`, `add_required_source_fields.js`, `remove_duplicate_source_fields.js`, `fix_observation_*.js`, `fix_sqlite_schema_mismatch.js` — historical migration scripts kept for replay.

## Build and release

Render the package, the GitHub release, and the public site. Canonical docs: [`docs/developer/release_orchestrator.md`](release_orchestrator.md), [`docs/developer/github_release_process.md`](github_release_process.md), [`docs/subsystems/release_notes.md`](../subsystems/release_notes.md).

- `release_orchestrator.js` — top-level release driver consumed by the release SKILL.
- `render_github_release_notes.ts` — renders the GitHub release body using `src/release_notes_enrichment.ts`.
- `build_github_pages_site.tsx` — builds the static GitHub Pages site.
- `build_inspector.js` — packages the inspector submodule for distribution.
- `pdf_worker_polyfill.mjs`, `copy_pdf_worker_wrapper.js` — bundle PDF.js worker assets for browser builds.
- `openapi_bc_diff.js` — OpenAPI breaking-change diff gate; required by the release SKILL.
- `simulate_npm_install.js` — verifies a published tarball installs cleanly into a temp directory.
- `validate-coverage-map.ts`, `validate-doc-dependencies.js`, `validate_schema_sync.ts`, `validate_spec_compliance.js`, `validate_all_fu_compliance.js`, `spec_compliance_patterns.js` — pre-release validation gates.
- `prune-merged-branches.js`, `merge-dev.js`, `branch.js`, `rename-branch-from-commit.js` — release-branch hygiene.
- `prototypes/` (subdir) — exploratory prototypes, intentionally not wired into release.

## Dev servers, tunnels, and ports

Local-development helpers. Canonical docs: [`docs/developer/development_workflow.md`](development_workflow.md), [`docs/developer/launchd_dev_servers.md`](launchd_dev_servers.md), [`docs/developer/tunnels.md`](tunnels.md).

- `dev-serve.js`, `dev-proxy.js`, `run-dev-server-with-tunnel-url.sh`, `run-dev-task.js` — dev-server launchers.
- `pick-port.js`, `kill_port.js`, `with_branch_ports.js`, `get_branch_ports.js` — port arbitration used by the orchestrator.
- `setup-https-tunnel.sh`, `setup-dns.sh`, `disable-dns.sh`, `generate-dev-cert.sh`, `fix-ssl-cert.sh`, `debug-ssl.sh`, `add_ngrok_mapping.py` — tunnel and TLS helpers.
- `cloudflare_*.sh`, `remove_cloudflare_redirect.sh` — DNS / Cloudflare automation.
- `setup_cloudflare_email_routing.sh`, `setup_sendgrid_*.sh`, `test_sendgrid_smtp.sh`, `check_sendgrid_*.sh`, `configure_sendgrid_dns.sh` — outbound-email plumbing.
- `provision_sandbox_fly.sh`, `reset_sandbox.ts`, `schedule_sandbox_reset.sh`, `sandbox_purge_entity.ts` — sandbox deployment helpers ([`docs/subsystems/sandbox_deployment.md`](../subsystems/sandbox_deployment.md)).
- `show-dev-resources.js` — prints active dev URLs for terminal display.
- `watch_site.js` — runs the site build in watch mode.

## Setup, agents, and credentials

Onboarding and agent-environment helpers. Canonical docs: [`docs/developer/getting_started.md`](getting_started.md), [`docs/developer/agent_cli_configuration.md`](agent_cli_configuration.md), [`docs/developer/agent_instructions.md`](agent_instructions.md).

- `setup_agent_credentials.sh`, `setup_agent_environment.sh`, `setup_claude_instructions.sh`, `setup_cursor_from_foundation.sh`, `setup_shared_submodule.sh`, `complete_submodule_setup.sh` — first-run install helpers.
- `setup-test-env.sh`, `setup-data-symlink.js`, `setup-foundation-symlink.js`, `setup-env-copy-hook.sh`, `cursor-worktree-init.sh`, `copy-env-to-worktree.js` — workspace bootstrap.
- `sync-env-from-1password.sh`, `secrets_manager.js`, `migrate_env_to_secrets.js`, `notify_agents_env_vars.js`, `notify_agents_setup_script.js`, `notify_running_agents_credentials.js`, `respawn_agents_with_credentials.js`, `respawn_single_agent.js`, `instruct_agents_credential_setup.js`, `instruct_agents_env_check.js`, `instruct_agents_run_tests_until_passing.js`, `unblock_agents.js`, `send_agent_followup.js`, `test_agent_env_spawn.js`, `get_secrets_for_agents.js`, `get_mcp_token.sh` — agent-environment automation.
- `sync_mcp_configs.js` — keeps `.cursor/mcp.json` and `.mcp.json` aligned.

## Testing and QA

Test runners and fixtures. Canonical doc: [`docs/testing/`](../testing/).

- `run_integration_tests.js` — wrapper that prepares the environment and runs the integration suite.
- `check-playwright-coverage.ts` — coverage gate for Playwright tests.
- `test_*.ts`, `test-*.ts`, `test_store_parquet_via_mcp.ts`, `test_dsnp_parquet_reading.ts`, `test_mcp_semantic_search.ts`, `test_parquet_ingestion.ts`, `test_raw_fragments_in_response.ts`, `test_confidence.ts`, `test-base64-store.ts`, `test-error-handling.ts`, `test-file-path-store.ts`, `test-store-response-structure.ts`, `test-store-structured-response.ts`, `test-raw-fragments-idempotence.ts`, `test-raw-fragments-insert.ts` — focused harnesses kept for regression replay.
- `trigger_error_debug_cli.js` — drives `manage_error_debugging.sh` (canonical: [`docs/developer/error_debugging.md`](error_debugging.md)) for error-protocol exercises.
- `fix_mcp_phase1_tests.sh` — historic test-fix script kept for record.

## Generators (assets and icons)

Visual asset generation. Canonical doc: [`docs/site/README.md`](../site/README.md).

- `generate_guarantee_pngs.ts`, `generate_guarantee_sym_hero_pngs.ts`, `generate_guarantee_sym_square_pngs.ts`, `generate_who_icp_square_pngs.ts` — guarantee / ICP page assets.
- `generate_illustrations.ts`, `generate_pdf_fixtures.ts`, `generate_schema_icons.ts` — additional asset pipelines.
- `make_bg_transparent.py`, `scrape_nytimes_*.py` — small Python helpers used during one-off content generation.
- `create_sample_parquet_files.{py,ts,sh}`, `create_sample_parquet_files_simple.sh`, `create_sample_parquet_files_mcp.ts` — Parquet test-fixture generators.

## Documentation tooling

- `apply_documentation_rules.sh`, `apply_file_naming_convention.sh` — repo hygiene scripts.
- `move_docs_rules_to_cursor.{js,sh}` — historical migration of rule files into `.cursor/`.
- `repo_info.ts` — small utility consumed by docs generators.

## Configuration

- `config/` — declarative configuration consumed by other scripts (port fallbacks, agent env defaults).
- `linters/` — bespoke linter helpers invoked from CI.
- `migrate/` — data-migration sub-pipeline used by the historical `migrate_*` scripts.
- `neotoma-npm-reserve/` — placeholder package used to reserve the `neotoma` npm name.
- `postinstall.js` — runs after `npm install` to surface upgrade guidance.

## Related

- [`docs/developer/cli_reference.md`](cli_reference.md) — for the `neotoma` CLI surface (preferred over scripts where parity exists).
- [`docs/developer/development_workflow.md`](development_workflow.md) — when to use which dev launcher.
- [`docs/operations/runbook.md`](../operations/runbook.md) — operator-side recovery playbook that references many of these scripts.
