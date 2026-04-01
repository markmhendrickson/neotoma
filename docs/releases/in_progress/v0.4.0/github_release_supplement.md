**Draft release summary:** Neotoma `0.4.0` is planned as the first npm release after `0.3.10`, combining the unpublished `v0.3.11` train with the current `dev` work. The headline is a clearer evaluation-first site, expanded vertical positioning, and a larger round of CLI/runtime/schema changes that justify a minor release instead of another patch.

**Release-prep note:** This draft assumes the remaining `dev` changes are committed before tagging `v0.4.0`. Render GitHub Release notes with **`--compare-base v0.3.10`** so the compare link matches what npm users actually upgrade from.

## What changed for npm package users

**CLI and runtime**

- `storage info` is clearer and more script-friendly, with explicit environment context, absolute local paths, and a stronger nudge toward `--json` for stable automation.
- CLI argument handling is more reliable when Neotoma is invoked through node, bun, or deno wrappers. The `extractUserCliArgs` change avoids accidental fallback into interactive session mode.
- Timeline, observation projection, snapshot computation, schema registry, interpretation, and action schema work continue the push toward cleaner schema-aware behavior across the packaged server and CLI.

**Why it matters**

- Operators get a more dependable CLI surface for automation and debugging.
- Teams depending on timeline- and schema-heavy flows should expect more capable behavior, but should still validate those paths before rollout because the release range is broad.

**Shipped artifacts**

- `openapi.yaml` and the generated `dist/` output change with this release.
- The release-prep toolchain now includes a better GitHub release renderer plus helper scripts for timeline health, timeline recomputation, and site copy linting.

## API surface & contracts

- This release range includes meaningful changes around actions, timeline generation, schema behavior, and OpenAPI output.
- If the currently outstanding server/runtime work lands before tag, treat the HTTP and MCP contract surface as materially updated from `0.3.10` and verify integrations accordingly.
- If you consume Neotoma programmatically, plan on rechecking OpenAPI-driven clients and any assumptions about timeline event shape.

## Behavior changes

- The website now pushes a clearer evaluation-first path: users are expected to evaluate fit before install or tool-specific setup.
- The docs and marketing surface expand further into vertical-specific entry points such as CRM, compliance, healthcare, government, logistics, and customer operations.
- Header navigation and related page flows are being simplified so key routes such as Evaluate, Install, and Architecture stay consistently reachable.
- If the remaining runtime refactors ship in this release, some server-side behavior may change even where the public surface area looks similar.

## Docs site & CI / tooling

- The site adds more landing pages, more explicit product positioning, a markdown hub, and broader SEO/dev-preview support.
- GitHub Pages and Playwright coverage continue to expand so site regressions are caught earlier.
- The static export pipeline and route/site validation scripts are being tightened as part of the same train.
- Repo documentation is being reorganized, including ICP material moving into a clearer `docs/icp/` home.

## Internal changes

- This release train includes broader refactoring across `src/server.ts`, `src/actions.ts`, and `src/cli/index.ts`.
- The current `dev` work also removes the older `llm_extraction` path and reshapes related tests and docs.
- Test coverage is being updated to reflect navigation, schema, MCP, and CLI changes, including the new header-navigation assertion added during release prep.

## Fixes

- The known `AgentAuthLandingPage` / `/agent-auth` Vite build regression was fixed.
- Navigation and section-flow cleanup continues across the site experience.
- The release-prep flow itself is now better documented for skipped npm versions, so GitHub release compare ranges can match the real npm upgrade path.

## Tests and validation

- Release prep has already passed typecheck, lint, site copy lint, unit/integration suites, Playwright site coverage, Playwright coverage validation, and doc dependency validation for the committed release-prep changes.
- Before tagging `v0.4.0`, run the full release checks against the final committed tree: `npm run build:server`, `npm test`, and any route/site-export validation needed for the final site content.
- If the remaining outstanding runtime work is included, validate CLI workflows, MCP/OpenAPI consumers, and timeline behavior against real data before publish.

## Breaking changes

- The upgrade path is effectively `0.3.10 -> 0.4.0` because `v0.3.11` never shipped to npm.
- The currently intended scope includes semver-significant work: removal of the old `llm_extraction` path, larger server/action refactors, and OpenAPI churn. That is why this release is being prepared as **minor `0.4.0`** rather than a patch.
- For users coming from `0.3.10`, also review the unpublished `v0.3.11` narrative because its CLI and runtime changes are expected to land in the same next npm release.
