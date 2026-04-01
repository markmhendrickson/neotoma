**npm `0.4.0`** is the **first package published to the registry after `neotoma@0.3.10`**. Git tag **`v0.3.11`** was **never published to npm**; **`0.3.10 → 0.4.0`** is the registry upgrade path. For the **`v0.3.10…v0.3.11`** git narrative, read **`docs/releases/in_progress/v0.3.11/github_release_supplement.md`**.

Render GitHub Release notes with **`--compare-base v0.3.10`** so compare URL + commit list match npm users (see **`docs/developer/github_release_process.md`**).

## Before you tag (release readiness)

This supplement describes **all work intended for `0.4.0`**, including:

1. **Eight commits** already on **`dev`** after **`v0.3.11`** (`649003c` … `715673d`).
2. A **large uncommitted working tree** on **`dev`** (~**774** files vs `HEAD` as of prepare): server/CLI/actions refactors, regenerated **`site_pages/`**, doc moves, test reshuffles, dependency/script changes.

**You MUST commit (or discard) every change you want in the release, then create tag `v0.4.0` on that commit.** Do not tag `v0.3.11` or an older `HEAD` and expect the working tree to ship.

Suggested checks before tag + `npm publish`:

- `npm install`, `npm run build:server`, `npm test` (and `npm run test:remote:critical` if you rely on it).
- Diff **`openapi.yaml`** / MCP clients against prior **`0.3.10`** behavior.
- `npm run build:ui`, `npm run validate:routes`, `npm run validate:site-export` if shipping the static site.

---

## A. Committed since git `v0.3.11` (8 commits)

Subjects (newest first): site marketing pages + markdown hub + SEO dev tooling; `docs/private` bump; healthcare/gov/customer-ops/logistics verticals; vertical shell UX + agent-auth; fix AgentAuth import / `/agent-auth` full-page segment; vertical index + marketing full-page shell; CI Playwright Chromium for dev Pages prerender; CRM/compliance verticals + timeline/schema + docs + scripts.

**npm / runtime (committed)**

- **`storage info`:** clearer sections, **`environment`**, absolute paths, pointer to **`--json`**.
- **`extractUserCliArgs`** for node/bun/deno argv (avoids bogus interactive session); tests in **`tests/cli/extract_user_cli_args.test.ts`**.
- **`cli_init_interactive.test.ts`** trimmed (file still present).
- **`timeline_events`**, **`observation_reducer`**, **`snapshot_computation`**, **`schema_registry`**, **`interpretation`**, **`actions.ts`**, **`server.ts`**, **`action_schemas`** — timeline/projection/schema train.
- **`scripts/render_github_release_notes.ts`**, **`check_timeline_health`**, **`backfill_timeline_via_recompute`**, **`lint_site_copy_style`**.

**Site / CI (committed)**

- Vertical landings, `/verticals`, agent-auth / build-vs-buy / personal-data pages, markdown hub, SEO metadata, `SeoDevMetaFooter`, Playwright + workflow tweaks, many frontend/site files (see git log).

---

## B. Additional outstanding changes (uncommitted on `dev`)

*Ship only after these are committed to the release branch.*

**Packaged server / CLI / OpenAPI (working tree)**

- **Large refactors** of **`src/server.ts`**, **`src/actions.ts`**, and **`src/cli/index.ts`** (substantial line churn vs the 8-commit snapshot).
- **Removed** **`src/services/llm_extraction.ts`** and the **`tests/integration/llm_extraction.test.ts`** suite; **removed** **`docs/prompts/llm_extraction_system_prompt.md`**. Confirm extraction/LLM behavior is intentionally out of this path or replaced elsewhere before release.
- Updates to **`entity_resolution`**, **`interpretation`**, **`action_schemas`**, **`openapi_types`**, **`openapi.yaml`**, and slimmer **`contract_mappings`** — **treat OpenAPI/MCP contract as changed** until you verify parity.
- **Tests:** new **`cli_to_mcp_schemas`**, **`mcp_schema_actions`**, **`mcp_npm_check_update`**; reworked **`mcp_store_unstructured`**, **`nonjson_csv_store_behavior`**, **`nonjson_fixtures_mcp_replay`**; removed **`mcp_correction_variations`**; assorted CLI contract/infra/correction test edits.

**Site export + frontend (working tree)**

- **~614 files under `site_pages/`** — regenerated static HTML (multilingual pages refreshed).
- **~77 files under `frontend/`** — marketing/subpage/layout/nav/SEO/illustration updates; **`CrossPlatformPage`** removed (IA/route change).

**Dependencies & scripts (working tree)**

- **`package.json` / `package-lock.json`:** version **0.4.0**; add **`test:remote:critical`**; **`validate:routes`**, **`validate:site-export`**; **`illustrations:generate`**, **`illustrations:guarantees`**, **`illustrations:guarantees:sym`**; replace **`react-markdown`** with **`turndown`** + **`turndown-plugin-gfm`**; dev **`sharp`**, **`@fal-ai/client`**.

**Docs & repo (working tree)**

- **ICP** docs consolidated under **`docs/icp/`** (moves from **`docs/specs/`** / **`docs/developer/`**); updates across **`MCP_SPEC`**, MVP/onboarding specs, auth, testing catalog, foundation/problem/positioning/**`what_to_store`**, REST API doc, CLI/MCP developer docs, pre-release + SEO checklists, architectural decisions, determinism, readme generation framework, FU-702 billing, aspirational release archive notes.
- **Deleted** **`docs/specs/ICP_PRIORITY_TIERS.md`**.
- **`.env.example`**, **`.gitignore`**, **`.github/workflows`** (Pages), **`install.md`**, **`.cursor/skills/create-release`**, **`foundation`** / **`docs/private`** submodule metadata.

---

## API surface & contracts

- **Committed train:** timeline/projection may shift event shapes at the margin — validate **`list_timeline_events`** / UI timeline if you depend on specifics.
- **Uncommitted train:** assume **OpenAPI and runtime routing** may differ materially from **`0.3.10`** until you complete contract tests and MCP matrix runs.

## Docs site & CI / tooling

- **Committed:** vertical marketing pages, markdown hub, Playwright Chromium in dev Pages workflow, lint site copy style, etc.
- **Uncommitted:** mass **`site_pages/`** regen, new **`validate:*`** and illustration scripts, workflow/copy tweaks, broad frontend edits.

## Behavior changes

- **CLI:** **`storage info`** layout + absolute paths (prefer **`--json`** for scripts).
- **CLI:** embedded-runtime argv fix (node/bun/deno).
- **Pending commit:** server/actions behavior may change with refactor; **no claim of byte-for-byte API parity** with `0.3.10` until validated.

## Internal changes

- **Committed:** frontend vertical shell stack, server simplification in that snapshot, new unit/integration tests listed in section A.
- **Uncommitted:** removal of **`llm_extraction`** module path, test suite consolidation, **`site_pages`** regeneration pipeline outputs.

## Fixes

- **Committed:** Vite/CI fix for **`AgentAuthLandingPage`** / **`/agent-auth`** (`a1ae104`).
- **Uncommitted:** any additional fixes bundled in the large diff (review `git log` / diff per file as needed).

## Tests and validation

- Run full **`npm test`** + applicable integration/remote suites after committing.
- **Upgrading from npm `0.3.10`:** exercise CLI (**`entities search`**, **`store`**, **`storage merge-db`** from v0.3.11 narrative), then **`storage info`**, schema/MCP flows, and timeline after this release’s server changes.

## Breaking changes

- **v0.3.11 git train (unpublished on npm):** see **Breaking changes** in **`docs/releases/in_progress/v0.3.11/github_release_supplement.md`** (e.g. **`storage merge-db`** defaults).
- **Pending uncommitted work:** **likely semver-significant** — removal of **`llm_extraction.ts`**, large **`server`/`actions`** edits, and OpenAPI churn. This is why this release is now prepared as **minor `0.4.0`** instead of a patch.
