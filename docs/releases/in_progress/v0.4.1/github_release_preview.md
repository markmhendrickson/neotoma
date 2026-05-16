---
title: Github Release Preview
summary: "| | | |:--|:--| | **npm** | https://www.npmjs.com/package/neotoma/v/0.4.1 | | **Compare** | `v0.4.0` → `v0.4.1` — [view diff](https://github.com/markmhendrickson/neotoma/compare/v0.4.0...v0.4.1) |"
---

## Install

```bash
npm install -g neotoma@0.4.1
```

| | |
|:--|:--|
| **npm** | https://www.npmjs.com/package/neotoma/v/0.4.1 |
| **Compare** | `v0.4.0` → `v0.4.1` — [view diff](https://github.com/markmhendrickson/neotoma/compare/v0.4.0...v0.4.1) |

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

---

## Commits (`v0.4.0` → `v0.4.1`)

- `80203f2` Release v0.4.1: incremental deploy (marketing site)
- `5a95524` Merge dev into main for release v0.4.1 (marketing site)
- `9c62ea4` FU-301: Marketing site refresh, SEO, and v0.4.1 prep docs
- `56d4b50` chore: add writ submodule (WRIT write-integrity benchmark)
- `2665395` fix(claude): emit skills as .claude/skills/<name>/SKILL.md
- `5e816a2` Sync .cursor/skills into Claude skills when not in foundation
- `8034a9b` Emit all foundation commands as Claude Code skills
- `e91cacd` chore(release): prepare main-repo v0.4.1 candidate
- `e3b99e5` Dev: CLI/API contracts, site UI, docs, cursor rules, inspector submodule
- `0da9e28` docs(icp): refresh primary ICP, dev release targeting, general release criteria; anonymize evaluator PII in public docs; add private field_evidence submodule ref
- `e9ad210` fix(site): allow docs sidebar toggle on /evaluate and /install
- `513e2ba` build(site): refresh prerendered export for v0.4.0
- `48d6396` docs(release): refresh v0.4.0 supplement for final site fixes
- `897a22c` fix(site): improve dark-surface copy contrast
- `f03869a` fix(site): align intro section edge indicators
- `af63f54` chore: remove repo-root clutter (tracked branch-ports state, npm pack artifact)
- `aee67c2` docs: update foundation submodule for release guidance
- `6ce245f` refine evaluation-first site flow and public release notes
- `f91f41b` docs(release): prepare v0.4.0 notes and versioning
- `c3778e4` Update marketing site navigation, scroll UX, analytics, and subpages
- `ddc25a1` fix: track DatabaseMemoryPage for Vite build (gitignore data* clash)
- `4300731` Update marketing site, repo metadata, SEO, analytics, and home IA
- `7119cac` docs(site): ICP paths, marketing pages, workflows, and site export refresh
- `5f1f004` Add site marketing pages, markdown hub, and SEO dev tooling
- `6738fb5` chore(docs): bump docs/private submodule (Isaac CD trilogy + persona)
- `1b29ead` feat(site): healthcare, gov, customer-ops, logistics use cases; private doc submodule
- `ea333c2` refine(site): use-case landing shell UX and agent-auth page
- `a6ad85a` fix(site): ship AgentAuthLandingPage and full-page segment for /agent-auth
- `8fee422` feat(site): use-case index + landings, marketing full-page shell
- `1485d9f` ci(dev-pages): install Playwright Chromium before site prerender build
- `9e1f86e` feat(site): CRM/compliance use cases, timeline/schema, docs, scripts
- `49edfe4` Release v0.3.11: site, docs, MCP/ChatGPT integration
- `2f395c6` Prepare v0.3.10 patch release metadata.
- `c213566` fix seo title on basename-root detail pages
- `7e1b865` Install Playwright Chromium in Pages deploy workflow.
- `d332c75` Add build-time prerendering for GitHub Pages SEO.
- `4056ea9` Update install page content tweaks.
- `c242922` Update localized site loading and docs navigation refinements.
- `bcc074d` Commit outstanding docs, frontend, and generated site updates.
- `54af605` Fix docs UI icon wiring and guarantee table runtime regression.
- `555377a` Merge branch 'dev'
- `77408ab` Record local main-branch updates before merge.
- `5f71e37` Update docs site cards, icons, and integration walkthrough content.
- `930f283` Fix intermittent intro invisibility on dev homepage.
- `3488aa2` Fix blank home sections on dev site by relaxing fade-in visibility gating.
- `a9237c0` Update site content, navigation, and integration walkthrough pages on dev.
- `6e7a63f` Restore today's recovered site redesign and asset work after rebase loss, including new ICP/interface artwork and expanded landing subpages.
- `ee2eb53` Update site content and isolate dev Pages deployment.
- `73bd182` Fix dev site build by removing stale data-model route and fallback missing card images.
- `f9fb20f` Replace missing site illustration assets with stable fallback image.
- `98a9f49` Fix dev deploy lockfile mismatch and widen guarantees section.
- `5b843cc` Update site content and isolate dev Pages deployment.
- `6a5007a` Overhaul docs and site architecture for expanded multilingual navigation.
- `401e560` Revert GitHub Pages content to v0.3.8.
- `99421d3` Fix Playwright site coverage test startup.
- `d6f0c46` Release v0.3.9.
- `81f1eda` Release v0.3.8.
- `2b6377d` Fix CI install by removing local tarball self-dependency.
- `ab79c46` Merge branch 'release/v0.3.3'
- `b07926f` Release v0.3.7.
- `16e00b8` Apply post-hook updates to CLI init and site build artifact.
- `ba4ef5a` Update CLI startup docs and environment handling.
- `0b8b7b0` Release v0.3.6.
- `fb38a64` Merge pull request #22 from markmhendrickson/release/v0.3.3
- `56c6c6f` Adjust mobile table chrome and keep desktop table styling.
- `2c3e0ac` Merge pull request #21 from markmhendrickson/release/v0.3.3
- `9105bb3` Prepare v0.3.5 and fix get-started demo asset.
- `a92e410` Merge pull request #20 from markmhendrickson/release/v0.3.3
- `c5444b2` Release v0.3.5.
- `7f791c9` Release v0.3.4.
- `9ed256b` chore(frontend): normalize related post ordering
- `9c03939` Release v0.3.3.
- `f2c42d0` Release v0.3.2.
- `666962c` docs: add tester checklist for init env fixes
- `8def077` fix(cli): init .env creation and clearer env/config status
- `062669e` Finalize site updates and deployment readiness.
- `b3311cb` Release v0.3.1.
- `7ef1b01` Merge dev into main for release v0.3.1
- `30234c7` Prepare v0.3.1 release inputs and deployment tooling.
- `fff53db` Include workflow note and CLI wrapping improvements in release.
- `83e602a` Apply remaining CLI cleanup changes before release merge.
- `9565b70` Finalize CLI init flow updates for release branch.
- `489c2f5` Prepare v0.3.0 developer release with domain cutover.
- `7f90811` Fix GitHub Pages root 404; improve CLI session resize and box width
- `66f9d72` Ignore public/ build output; fix OAuth redirect and CLI box formatting
- `8db5c36` Fix GitHub Pages sidebar and styles; deploy build:ui; CLI and test fixes
- `79d26cb` Deploy site from dev branch; rename env.example to .env.example; tunnel script tweaks
- `83a9c01` Refactor auth workflows and align API contract coverage.
- `fff77fc` Refactor auth flows, CLI fallback, and site SEO updates
- `a246a6f` Refactor rules, docs, CLI tests; fix tests and data-dir exclusions
- `22a7209` Add CLI-first agent parity, local entity embedding, and expanded test coverage
- `72b72a0` Add deletion/GDPR and entity snapshot embeddings; expand CLI and tests
- `c6207a5` Add timeline_events service and migrations; add user_id to interpretations
- `c60dbc9` Update mcp/web-scraper submodule and doc table alignment
- `56ff927` Add crypto layer and log encryption; update docs and SQLite adapter
- `9eb3877` Create v0.3.0 reconciliation release and archive aspirational releases
- `b1e1f25` Update CLI, migrations, and docs/UI alignment
- `3296f35` Consolidate cursor rules, expand design system docs, add snapshot monitoring
- `4836f12` Update docs/private submodule to latest commit after resolving conflicts
- `f68ef4d` Migrate generic development rules to foundation and add major implementation work
- `a979409` Refactor schema registry and entity queries with raw_fragments support
- `4cef222` Improve test quality, fix auto-enhancement bugs, optimize database
- `16adc1a` Add parquet MCP resources specification
- `35f3314` Fix CI: Check migration files only, not database state
- `1ba6598` Update README and documentation, clean up frontend dependencies
- `28fc875` Update README with canonical vocabulary and ignore error reports
- `e02e9d0` Update v0.2.0 release status and refactor codebase
- `aa8210f` Reorganize documentation, update cursor rules, and add frontend components
- `1d70f5e` Execute v0.2.0: Minimal Ingestion + Correction Loop
- `cccb77c` FU-110: Implement v0.2.0 sources-first ingestion architecture
- `ffd87ef` FU-MIGRATION-001: Migrate cursor commands and rules to foundation system
- `b59501a` Extract generic Cursor rules to foundation
- `0a1f7cb` Update agent instructions: add foundation submodule usage
- `c44c8e4` Update foundation: copyright year 2025
- `4df364c` Update foundation submodule: README with license
- `066b6f9` Add foundation submodule with MIT License
- `bda6e62` Re-add foundation submodule with LICENSE
- `e078d48` Update foundation submodule to use GitHub remote
- `d6066e1` Complete foundation submodule setup
- `9eb4a14` Convert foundation to git submodule
- `a711d60` Convert foundation to git submodule
- `c13e62e` Add foundation: shared development processes
- `8732d0a` Fix database migration handling and improve error reporting
- `a019979` Separate dev/prod environment variables for security
- `a095922` Enforce strict dev/prod Supabase environment separation
- `6739dc3` Reorganize documentation structure and update configuration
- `7c0b443` docs: Update documentation and add integration candidates
- `3886150` Remove credentials from notify_running_agents_credentials.js
- `7f4b4bb` Add security check to validation checklist
- `e9788b6` Remove credential passing via API environment field
- `3109c14` Remove credentials from respawn_single_agent.js and add security prohibition
- `0a56267` Remove unused loadCredentials call from respawn script
- `2fa97e1` Remove credentials from agent instructions in respawn script
- `ccf55f6` Update task instructions to require all tests passing before completion
- `8c106e6` Update orchestrator instructions to require all tests passing
- `3cc555c` Update setup script to automatically apply migrations via Management API
- `fae2af0` Configure Cursor Cloud Agents environment.json
- `cf79c84` Update orchestrator for Cursor Cloud Agents Secrets
- `4b5e954` Update setup script to handle Supabase CLI authentication gracefully
- `249bac0` Add automated setup script for agent environments
- `5c2a957` fix: resolve blockers for cloud agent execution
- `2a9e9b0` Align v0.2.x+ release execution with orchestrator
- `58fa448` Align v0.x release docs and workflow
- `069bacd` Standardize string literals to double quotes
- `228b320` Refactor release documentation structure and fix syntax errors
- `415dd5a` Fix doc inconsistencies: align with v0.2.0 minimal scope
- `54c2b10` Streamline release spacing: minimal core first, defer safety nets
- `2190bcd` v0.2.0: formalize nondeterminism boundary, harden validation, prioritize core flows
- `80ce612` Add v0.2.0 release plan and align docs with sources-first ingestion
- `b8c95c2` feat: payload ingestion and observation hardening
- `f907748` Remove data symlink from git tracking
- `8a67f29` Fix retrieve_records order preservation and update documentation
- `0670069` Add entity and timeline MCP endpoints, enhance Cursor integration, and update documentation
- `ac2e2be` Comprehensive documentation and codebase updates
- `2c1b61e` Comprehensive documentation and infrastructure updates
- `4ee9a7b` Enhance commit command with comprehensive change analysis
- `229ea54` Major documentation restructure and timeline estimate updates
- `148e1fa` docs: Comprehensive documentation, workflow, and release planning updates
- `7ea05d8` docs: Comprehensive documentation and workflow improvements
- `cc8f67b` feat: restructure docs, add manifest, and refine frontend tooling
- `b1bb143` feat: Add AI-powered record comparison and enhance file upload insights
- `f8178f3` Docs: restructure MVP docs and architecture overview Tests: stabilize UI integration against missing frontend/backend Chore: ignore local data and private docs; improve SSL debug scripts
- `9b0181b` feat: add branch-based domain routing with HTTPS support
- `1fc4d72` Merge branch 'feat/playwright-coverage-worktree'
- `701b40d` refactor: migrate commit command to user-level
- `058595b` Merge remote-tracking branch 'origin/feat/playwright-100-percent-coverage' into feat/playwright-100-percent-coverage
- `16a8484` chore: harden commit workflow and dev serve helpers
- `30a2051` fix: stabilize ui tests
- `0c9cf48` feat: achieve 100% Playwright test coverage across functional, state, and component dimensions
- `93050d7` feat: achieve 100% Playwright test coverage across functional, state, and component dimensions
- `fa594c3` Fix WebSocket port discovery and improve error handling
- `c3c6a42` Merge branch 'fix-debug-issue-gpENr' into dev
- `0d12f01` feat: implement fuzzy matching for record searches and fix chat query discrepancies
- `6cedbb2` Merge remote-tracking branch 'origin/feat/playwright-test-coverage' into dev
- `9a683d9` feat: add comprehensive Playwright end-to-end test coverage
- `d789da4` Merge branch 'chat-20251118-140748-044d41' into dev
- `d9662cb` test(e2e): add Playwright harness and server fixtures
- `514fbba` chore(cursor): move commands and rules out of repo
- `4277753` feat(records): dynamic property columns and dev tooling
- `3d8f694` Align Plaid normalizer expectations with machine-case props
- `d1169b2` feat: add worktree support to merge-dev script
- `eae2780` feat: restore chat intro message, fix key change detection, and improve AI query behavior
- `3b1b890` Stabilize dev env tests and oauth state
- `443e536` feat: add connectors platform and modern records workspace
- `3c4a01c` feat: align grooming tools and docs
- `576ba04` fix: improve error handling and API configuration for file uploads
- `e75df73` Merge branch 'test/convert-ui-integration-test-stubs' into dev
- `644ccee` docs: update merge command to switch to dev after merge
- `45ecc14` Merge branch 'test/convert-ui-integration-test-stubs' into dev
- `3e9bf2d` feat: enhance file processing, error handling, and UI improvements
- `367a99c` Merge test/convert-ui-integration-test-stubs into dev
- `8e18735` chore: switch license from ISC to MIT
- `809121a` test: Convert UI integration test stubs to executable tests
- `64421c0` feat: Add summary field to records with AI-generated summaries
- `1a73db1` feat: Add merge command to merge current branch into dev
- `16cab5a` feat: Add chat-specific branch management with automatic renaming
- `12d3fc5` docs: improve commit command instructions to prevent missing changes
- `8e4bca9` feat: implement local-first end-to-end encrypted datastore architecture
- `730ddef` feat: migrate UI to React with shadcn
- `fabd232` Update README with chat endpoint in API spec table
- `751a1cf` Add chat interface with OpenAI function calling for record queries
- `99150f9` Add Plaid integration, API sandbox UI, and security logging improvements
- `79285c8` WIP: CSV uploader with normalization and LLM transforms
- `dc11c6d` Initial commit: MCP server for extensible record storage with semantic search, ChatGPT Actions, and Supabase backend

**Full compare:** [`v0.4.0...v0.4.1`](https://github.com/markmhendrickson/neotoma/compare/v0.4.0...v0.4.1)

