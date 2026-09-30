This patch release retires the `query-memory` and `store-data` wrapper skills everywhere Neotoma installs or advertises skills. It also fixes the capability manifest so upgrade checks from v0.24.0 report the two new relationship-type tools.

## Highlights

- **`query-memory` and `store-data` are retired as loadable skills.** Both wrappers repeated the store and retrieval rules that the live MCP instructions already give at session start, and both had drifted from those rules. Fresh installs and `available_skills` no longer include them, and a re-sync removes them from harnesses that already had them. Ordinary storage and retrieval need no skill.
- **Upgrade checks from v0.24.0 name the new tools.** The shipped capability manifest now lists `list_relationship_types` and `register_relationship_type`, so the capability delta reports them as new tools.

## What changed for npm package users

**CLI (`neotoma`)**

- `neotoma setup` and `neotoma skills sync` skip any package skill whose `SKILL.md` frontmatter declares `deprecated: true`. `query-memory` and `store-data` are the first two skills marked this way.
- A harness skills directory that an earlier install created as a single symlink to the package `skills/` folder is converted to per-skill links on the next sync, because one directory symlink cannot leave out a single skill. The sync logs `Converted <dir> from a whole-dir symlink to per-skill links.` Skills you added to the directory yourself are not touched.
- In per-skill mode, the sync also removes Neotoma-created links to skills that are now deprecated, so a harness stops showing their old description and triggers.

**Runtime / MCP**

- The MCP `initialize` response leaves deprecated package skills out of `serverInfo._neotoma.available_skills`.
- A graph-stored `skill` row whose name matches a retired package skill is also dropped from `available_skills` and from the `[INSTANCE SKILLS]` block. Package skills win on a name collision, so that row was never written to disk locally, and listing it would offer the retired skill again under the same name.
- The two retired `SKILL.md` files stay in the package, with descriptions that start with `[Deprecated]`, so existing symlinks, SkillHub listings, and GitHub links still resolve.

**Shipped artifacts**

- `src/shared/capability_manifest.json` (bundled in `dist/`) now includes `list_relationship_types` and `register_relationship_type`.

## API surface & contracts

- No OpenAPI changes. `npm run openapi:bc-diff` (base `v0.24.0`) reports no breaking changes.
- No new or removed MCP tools. The capability manifest gains entries for the two tools that already shipped in v0.24.0.

## Behavior changes

- Agents connected over MCP stop seeing `query-memory` and `store-data` in `available_skills`. The MCP instruction block now tells agents to follow its own store and retrieval guidance directly instead of calling a skill.
- On neotoma.io, the Store Data and Query Memory skill pages, their nav entries, and their cross-links from use-case pages are gone. The old `/skills/store-data` and `/skills/query-memory` URLs redirect to `/skills`.

## Agent-facing instruction changes (by channel)

- **MCP instruction block (`docs/developer/mcp/instructions.md`, `[INITIALIZATION]`):** the typical local-skill list drops `query-memory` and `store-data`. It adds a note that storage and retrieval need no skill, and that the two retired wrappers must not be advertised or invoked. This reaches every MCP client and `neotoma instructions print`.
- `install.md` drops both skills from the Phase 2 skill table and says the same thing.

## Security hardening

`npm run security:classify-diff -- --base v0.24.0 --head HEAD` reports `sensitive=true`. The only flagged file is `src/services/root_landing/site_nav.ts`, which lost two nav link entries. No route handler, local-request check, or auth path changed. The findings and sign-off are in [`docs/releases/in_progress/v0.24.1/security_review.md`](security_review.md). Deployed-probe results will be linked here after Step 5.

- Static rules (`npm run security:lint`): 0 errors and 136 warnings, the same warning count as at v0.24.0.
- Protected-routes manifest (`npm run security:manifest:check`): in sync, 123 routes.
- Auth topology matrix (`npm run test:security:auth-matrix`): 18 passed, 1 skipped.

## Docs site & CI / tooling

- The CI step `Validate capability manifest` passes again after the manifest was regenerated for the v0.24.0 tools (#2541).
- `docs/skills/skill_strategy.md`, `README.md`, `install.md`, and the `docs/use_cases/` pages drop the retired skills. The site's skills catalog, SEO metadata, use-case data, and root-landing nav drop them too.

## Internal changes

- New shared helper `src/shared/skill_deprecation.ts` (`isDeprecatedSkillDir`, `filterInstallableSkillNames`), used by both the CLI skills mirror and the MCP server.
- `src/cli/skills_mirror.ts` gains `listInstallableSkillNames`. `listSkillNames` still returns every skill directory, for collision checks and pruning.

## Fixes

- `tests/integration/graph_neighborhood_pagination.test.ts` now binds an ephemeral port instead of a hard-coded `18120`. The fixed port collided with the pre-commit hook's own integration server (#2522).

## Tests and validation

- `tests/unit/skill_deprecation.test.ts` covers frontmatter detection and filtering.
- `tests/cli/skills_mirror.test.ts` covers deprecated skills forcing per-skill mode, conversion of an existing whole-dir symlink, and pruning of per-skill links to deprecated skills.
- `tests/unit/mcp_initialize_skills.test.ts` and `tests/integration/instance_skills_initialize_effect.test.ts` run the real `initialize` handler. They assert that the retired names are absent from `available_skills` and `[INSTANCE SKILLS]`, and that active skills remain.
- `npm run validate:capability-manifest`: up to date.

## Breaking changes

No breaking changes.
