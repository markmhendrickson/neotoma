**Shipped scope:** Git tag **`v0.4.1`** is at **`8081ee5`** (`Release v0.4.1: incremental deploy (marketing site)`). Narrative and `release-notes:render --tag v0.4.1` use range **`v0.4.0..v0.4.1`**.

**Post-tag `dev` (not in the `v0.4.1` tag):** `5258b9f3` — `fix(site): keep record-types headline tail on one line`. Ship as **`v0.4.2`** (or cherry-pick) if that fix should ride with npm/GitHub users on the same semver.

Neotoma `0.4.1` tightens the release-prep workflow, adds a safer SQLite recovery path for local installs, improves MCP/CLI contract parity around entity counts, ships FU-301 marketing-site refresh with incremental Pages deploy, syncs foundation commands into Claude Code skills, adds the `writ` submodule for WRIT benchmarking, and continues the evaluation-first site refresh with clearer product positioning, install guidance, and homepage demos.

## What changed for npm package users

**CLI and runtime**

- Added a SQLite recovery helper for corrupted local databases via `scripts/recover_sqlite_database.js`, plus npm script entry points such as `recover:db` and `recover:db:prod`. The flow runs `PRAGMA integrity_check`, optionally uses SQLite `.recover`, and keeps recovery manual and non-destructive instead of auto-swapping the live DB.
- Expanded CLI guidance and release-prep tooling around the canonical `/release` workflow so GitHub/npm releases are prepared from the real shipped scope, including committed `dev` work, explicit uncommitted-change previews, and clearer compare-range handling.
- Continued CLI/API/runtime refinement across `src/cli/index.ts`, `src/actions.ts`, and `src/server.ts`, including the release-candidate stability fix that makes CLI tests use the shared test API server in `NODE_ENV=test` unless `--offline` is explicitly requested.

**Runtime / data layer**

- Added MCP coverage for canonical entity counts by type, backed by dashboard stats, so entity-type totals align better across MCP responses, CLI expectations, and contract tests.
- Updated shared action schemas, contract mappings, and generated OpenAPI types alongside the runtime changes so packaged server behavior and documented surface area stay in sync.

**Shipped artifacts**

- `openapi.yaml` and the generated `dist/` output change with this release.
- The public site bundle, localized static packs, and related assets also change as part of the same release train.

## API surface & contracts

- The release range includes parity work for entity-count reporting, with new MCP integration coverage in `tests/integration/mcp_get_entity_type_counts.test.ts`.
- `openapi.yaml`, `openapi_actions.yaml`, `src/shared/action_schemas.ts`, `src/shared/contract_mappings.ts`, and `src/shared/openapi_types.ts` all moved with this release, so API consumers should refresh generated clients if they track the spec closely.
- This is still a compatibility-focused update, not a broad contract reset, but operators using MCP or OpenAPI-derived tooling should recheck entity-count and schema-oriented flows after upgrade.

## Behavior changes

- The site continues the evaluation-first product path: evaluate fit before install, keep key routes such as Evaluate / Install / Architecture consistently reachable, and make the homepage work better as a guided narrative instead of a static landing page.
- The homepage now includes a richer interactive CLI demo, updated section flow, and better hash-synced navigation behavior for the current slide IDs.
- Install and configuration pages continue to steer users toward understanding onboarding and memory fit before jumping straight into setup steps.

## Docs site & CI / tooling

- **FU-301:** Marketing site refresh, SEO, and v0.4.1 prep docs; **incremental GitHub Pages deploy** for the marketing site (`Release v0.4.1: incremental deploy`).
- Refreshed public positioning, ICP, and release-targeting material across `docs/foundation/`, `docs/icp/`, and homepage design guidance.
- Expanded the `evaluate_positioning` skill and related reference material so release prep, positioning review, and site iteration share the same framework.
- Kept site coverage current with Playwright updates for hash navigation and other homepage regressions, plus ongoing route/SEO/localization maintenance in the frontend site layer.

## Internal changes

- Renamed the canonical release command to `/release` while keeping `/create_release` as a legacy alias, and updated synced command/rule/skill copies accordingly.
- Emit foundation commands as **Claude Code skills** (`.claude/skills/<name>/SKILL.md`), with Cursor skill sync when not sourced from foundation.
- Added **`writ` submodule** (WRIT write-integrity benchmark).
- Synced generated Cursor/Claude instruction surfaces with the updated release workflow, positioning material, and rule set.
- Added the focused test-only transport behavior in `src/cli/index.ts` to remove flaky per-command local transport startup during CLI test runs.

## Fixes

- Fixed the docs sidebar toggle path for `/evaluate` and `/install`.
- Fixed stale homepage section-hash expectations so the current section IDs are covered by Playwright again.
- Fixed several homepage polish issues in this release train, including intro edge-indicator alignment and dark-surface readability improvements that continued after `v0.4.0`.

## Tests and validation

- The committed `v0.4.1` candidate passed the full pre-commit gate used during release prep: `tsc --noEmit`, `eslint src --ext .ts`, `npm run lint:site-copy`, `npm test`, `npm run test:e2e`, `npm run validate:coverage`, `npm run check:pw-coverage`, and `npm run validate:doc-deps`.
- Release prep also included focused reruns of the previously failing CLI correction test and the homepage hash-update Playwright test after the fixes landed.
- The `v0.4.1` tag exists on `8081ee5`; re-run `npm run -s release-notes:render -- --tag v0.4.1` after any tag movement before publishing or editing the GitHub Release.

## Breaking changes

- None called out for `0.4.1`.
