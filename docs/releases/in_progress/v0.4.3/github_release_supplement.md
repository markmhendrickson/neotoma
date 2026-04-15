Neotoma `0.4.3` combines the committed marketing-site refresh already on `main` with the current release-candidate worktree: a narrower marketing-first frontend, OpenClaw-oriented packaging and contract surface, slimmer server wiring, and updated release tooling that can preview the exact GitHub Release body before tagging.

## What changed for npm package users

**CLI and runtime**

- Added OpenClaw-oriented packaging inputs and tool-definition entrypoints via `openclaw.plugin.json`, `src/openclaw_entry.ts`, and `src/tool_definitions.ts`, plus contract coverage in `tests/contract/openclaw_plugin.test.ts`.
- Updated package and runtime scripts around MCP stdio startup and release-note rendering, including pre-tag GitHub Release preview support in `scripts/render_github_release_notes.ts`.

**Runtime / data layer**

- `src/server.ts` is substantially reduced, signaling a slimmer runtime surface and less bundled operational UI/server behavior in this release train.
- MCP stdio helper scripts were updated to match the narrower runtime packaging.

**Shipped artifacts**

- `dist/`, runtime entrypoints, and plugin-facing packaging inputs change with this release.
- The site bundle and route metadata also change as part of the same release.

## API surface & contracts

- The release adds OpenClaw plugin contract coverage and new tool-definition entrypoints, so operators integrating through plugin/tool metadata should recheck the packaged surface after upgrade.
- The server/runtime contraction in `src/server.ts` means previously bundled HTTP or app-facing behavior should be treated as changed unless confirmed otherwise in final validation.

## Behavior changes

- The committed `main` range adds the marketing-site refresh, walkthrough-route SEO, and responsive evaluate-prompt layout updates.
- The current release candidate removes a large set of in-repo operational frontend screens and helpers, shifting the shipped frontend toward a marketing/documentation-first experience rather than the prior app-style UI.
- New or expanded subpages around comparison, foundations, memory guarantees, memory models, false-closure risk, multi-agent state, trading, and OpenClaw positioning continue the evaluation-first site narrative.

## Docs site & CI / tooling

- Updated release-process documentation and skills so `/release` previews the exact rendered GitHub Release Markdown body before tagging.
- Refreshed README, determinism docs, release checklist material, route coverage docs, and product-positioning/supporting site metadata to match the current packaging and positioning direction.

## Internal changes

- Removed many legacy Cursor/Claude release-skill aliases, publish skill copies, and operational frontend components that no longer fit the current repo shape.
- Reworked site structure and supporting content across `frontend/src/components`, `frontend/src/site`, and related docs.
- Updated the release-notes renderer to support pre-tag previews using a future tag with a chosen head ref.

## Fixes

- The committed range includes responsive evaluate-prompt and mobile-copy improvements on the marketing site.
- Local release-tooling fixes ensure previewed GitHub Release notes use the correct previous-tag compare base even before the new tag exists.

## Tests and validation

- Added or updated contract and utility coverage through `tests/contract/openclaw_plugin.test.ts` and `frontend/src/utils/entity_display.test.ts`.
- Full release validation has not been run in this preview step; final tagging should re-run the normal release validation suite after the intended local commit set is finalized.

## Breaking changes

- The frontend removes many previously bundled operational screens, auth/realtime helpers, search/entity/source/schema views, quick-entry dialogs, and related tests. Users relying on the in-repo app UI should expect a materially narrower shipped interface.
- `src/server.ts` is heavily reduced; any consumers depending on previous bundled server behavior should validate routes and integrations before upgrading.
- Ship constraints: `docs/private` is a protected path and must not be included in the public release commit. `foundation`, `.claude/settings.local.json`, `.cursor/plans/`, and other local-only or private paths should be explicitly reviewed before staging.
