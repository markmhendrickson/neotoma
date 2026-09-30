This minor release makes `update_schema_incremental` write to the schema scope it actually read, so incremental schema updates stop losing fields. It adds a `repo` argument, an allowlist and a dry run to issue sync, and it retires the `query-memory` and `store-data` wrapper skills. It also fixes the capability manifest so upgrade checks from v0.24.0 report the two new relationship-type tools.

## Highlights

- **Incremental schema updates stop dropping fields.** `update_schema_incremental` (MCP, REST, `neotoma schemas update`) now writes to the scope its own read resolved, so a second call no longer merges onto a stale row and loses the first call's field. It also reports the outcome truthfully: `migrated_existing` is true only when fragments were actually promoted, and the response carries `scope` and `migration_result`.
- **The `force` override works over MCP.** `force: true` is now declared on the `update_schema_incremental` and `register_schema` tool schemas and forwarded to the registry, and `neotoma schemas update` and `neotoma schemas register` gain `--force`. It bypasses only the entity-type naming guards.
- **Issue sync can target another repo, safely.** `sync_issues`, `POST /issues/sync` and `neotoma issues sync` accept `repo` (`owner/name`), checked against a new operator allowlist (`NEOTOMA_ISSUES_ALLOWED_REPOS`). `commit: false` (CLI `--dry-run`) returns a `plan` and writes nothing, and pushing is opt-in outside the configured repo.
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

**CLI (`neotoma`), schemas and issues**

- `neotoma schemas update` and `neotoma schemas register` accept `--force`, which bypasses only the entity-type naming guards. On `schemas update` for a type with no schema, `--force` is also forwarded on the `/register_schema` fallback call.
- `neotoma schemas update --user-specific` no longer defaults to false. Leaving it off now means "write to the scope the schema resolves to". Use `--no-user-specific` to target the global schema explicitly.
- `neotoma issues sync` gains `--repo <owner/name>`, `--dry-run` (reads, writes nothing, prints a plan) and `--push` / `--no-push`. Push defaults on only for the configured repo.

**Schema registry (MCP `update_schema_incremental`, REST `POST /update_schema_incremental`)**

- When `user_specific` is omitted, the write goes to the scope the read resolved: your own user-scoped row if you have one, otherwise the global row. Before, an omitted value meant global, so a caller with a user-scoped override read the user row and wrote a new global row, leaving two active rows and dropping fields on the next call.
- `user_specific: false` now reads the global row, so the new global version extends the global schema rather than copying your override. It returns `ERR_SCHEMA_SCOPE_MISMATCH` when no global row exists.
- The response reports `scope` (read from the written row), `user_id` when the scope is `user`, `fields_added`, `activated`, `migrated_existing` and, when `migrate_existing` was requested, `migration_result`. REST now returns the same fields MCP already did.
- `migrated_existing` is true only when `migration_result.migrated_count > 0`. It used to echo the request flag. `migration_result.skipped` lists each `(field_name, reason)` that did not promote, with reasons `no_entity_resolution`, `no_active_schema`, `observation_insert_failed`, `already_promoted` and `unexpected_error`. A backfill whose fragments have no resolvable entity still promotes nothing; the skip reason is now the signal.
- Activating a schema version now targets the exact row by id and never reactivates a sibling scope's row that shares the version string, so a retried update cannot create a second active row.
- `force` is now declared on the MCP `update_schema_incremental` and `register_schema` input schemas and forwarded through both to the registry. Before, MCP clients had it stripped at the protocol layer.

**Issue sync (MCP `sync_issues`, REST `POST /issues/sync`)**

- New request fields: `repo` (`owner/name`, strictly validated; a malformed value is rejected before any GitHub request or local write) and `commit` (`false` is a dry run that returns a `plan`). New response fields: `repo`, `dry_run`, `push_enabled`, `plan`.
- New setting `NEOTOMA_ISSUES_ALLOWED_REPOS` / `issues.allowed_repos` (comma-separated `owner/name`, matched case-insensitively, no wildcards, malformed entries dropped, the environment variable wins). A caller-supplied `repo` must be the configured repo or on this list. Otherwise the call fails with HTTP 403 `ERR_ISSUE_REPO_NOT_ALLOWED` on REST and `InvalidParams` on MCP, before any GitHub or local access. The message is the same whether or not the repo exists and does not echo the repo or the list.
- Allowlisting a repo also lets the server comment on and close issues there, not only read them.
- `push` defaults to true only for the configured repo. An explicit `push` always wins.
- The `issue` tool family follows each row's own repo: `get_issue_status`, `add_issue_message` and Inspector bulk close / remove use the row's stored repo. A row whose repo is not permitted is handled locally only.

**Shipped artifacts**

- `src/shared/capability_manifest.json` (bundled in `dist/`) now includes `list_relationship_types` and `register_relationship_type`.

## API surface & contracts

- `npm run openapi:bc-diff` (base `v0.24.0`) reports no breaking changes and eight non-breaking additions:
  - `POST /issues/sync`: request fields `repo` and `commit`; response fields `repo`, `dry_run`, `push_enabled`, `plan`. 400 and 403 responses are documented, and `repo` carries a `pattern`.
  - `POST /update_schema_incremental` and `POST /register_schema`: request field `force`. `user_specific` semantics, `migration_result`, `scope` and `user_id` are declared on the update route.
- New error code `ERR_ISSUE_REPO_NOT_ALLOWED` (403). `ERR_SCHEMA_SCOPE_MISMATCH` is now returned only for an explicit `user_specific: false` when no global schema exists (with `user_specific` omitted it can no longer arise), and its retry hint changed. See `docs/reference/error_codes.md`.
- No new or removed MCP tools. Tool input schemas gain `force` (`update_schema_incremental`, `register_schema`) and `repo` / `commit` / `push` (`sync_issues`). The capability manifest gains entries for the two tools that already shipped in v0.24.0.

## Behavior changes

- **Schema writes follow the schema you read.** See "Breaking changes" below for the one default that changed and how to keep the old behavior.
- Rows filed through `submit_issue` with `target_repo` set to a repo that is not on the allowlist are now local-only: follow-up messages and refreshes no longer go to GitHub. Before, they went, wrongly, to the configured repo's issue of the same number. Their follow-ups still reach the `target_url` instance by entity id. Add the repo to the allowlist to restore GitHub-backed follow-ups. `submit_issue` itself is not yet gated by the allowlist (#2540).
- Agents connected over MCP stop seeing `query-memory` and `store-data` in `available_skills`. The MCP instruction block now tells agents to follow its own store and retrieval guidance directly instead of calling a skill.
- On neotoma.io, the Store Data and Query Memory skill pages, their nav entries, and their cross-links from use-case pages are gone. The old `/skills/store-data` and `/skills/query-memory` URLs redirect to `/skills`.

## Agent-facing instruction changes (by channel)

- **MCP instruction block (`docs/developer/mcp/instructions.md`, `[INITIALIZATION]`):** the typical local-skill list drops `query-memory` and `store-data`. It adds a note that storage and retrieval need no skill, and that the two retired wrappers must not be advertised or invoked. This reaches every MCP client and `neotoma instructions print`.
- **Schema scope guidance (`docs/developer/mcp/instructions.md` and `docs/developer/cli_agent_instructions.md`):** the scope-mismatch rule is rewritten. Omitting `user_specific` now writes to the scope the schema resolves to, and the mismatch error means an explicit `user_specific: false` found no global row. Agents are told not to retry it by registering a second schema. `cli_agent_instructions.md` adds a naming-guard rule for `--force` (#2446).
- **Issue dedup guidance (`docs/developer/mcp/instructions.md`):** agents that pull open issues before filing are told to pass `push: false` so the call only pulls and never exports local issues (#2539).
- `install.md` drops both skills from the Phase 2 skill table and says the same thing.

## Security hardening

`npm run security:classify-diff -- --base v0.24.0 --head HEAD` reports `sensitive=true` for three reasons: `openapi.yaml` (security blocks and new request fields), `src/actions.ts` (the issue sync and schema routes) and `src/services/root_landing/site_nav.ts` (two nav entries removed). The findings and sign-off are in [`docs/releases/in_progress/v0.25.0/security_review.md`](security_review.md). Deployed-probe results will be linked here after Step 5.

- **Issue sync repo allowlist.** A caller-supplied `repo` is now checked against the configured repo plus `NEOTOMA_ISSUES_ALLOWED_REPOS` before any GitHub or local access, for pull, push and dry run. With nothing configured only the configured repo is reachable (fail closed). The rejection text does not reveal whether a repo exists. If this check regressed, any authenticated caller could point the server's GitHub credential at an arbitrary repo. The gate is `tests/services/sync_issues_from_github.test.ts` and `src/services/issues/repo_allowlist.test.ts`. Operator action: upgrade, then set `NEOTOMA_ISSUES_ALLOWED_REPOS` only for repos you want issue sync, comments and closes to reach.
- **Schema writes stay in the caller's scope.** Activation now targets a row by id resolved for the caller (their own row, else the global row, else it throws). It can no longer reactivate a sibling scope's row that shares a version string. The regression is pinned in `tests/integration/update_schema_incremental_scope_mismatch.test.ts` and `tests/integration/update_schema_incremental_defect_cluster.test.ts`.
- Static rules (`npm run security:lint`), the protected-routes manifest check and the auth topology matrix results are recorded in the review file.

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

- `tests/integration/update_schema_incremental_defect_cluster.test.ts` (14 tests through the real MCP handler and REST routes against a real local DB), `tests/integration/update_schema_incremental_scope_mismatch.test.ts`, `tests/cli/schemas_force_flag.test.ts` and `tests/contract/schema_tools_force_input_schema_2197.test.ts` cover the scope, migration-truthfulness and `force` changes.
- `tests/services/sync_issues_from_github.test.ts`, `src/services/issues/repo_allowlist.test.ts`, `tests/contract/sync_issues_contract.test.ts`, `tests/integration/sync_issues_handler_passthrough.test.ts`, `tests/cli/cli_issues_commands.test.ts` and `src/services/issues/inspector_bulk.test.ts` cover the repo argument, allowlist, dry run and per-row repo.

## Breaking changes

There are no request-shape tightenings, and `openapi:bc-diff` reports none. One default changed, which is why this is a minor release:

- **`update_schema_incremental` default write scope.** Before: omitting `user_specific` always wrote a global schema row, even when your identity held a user-scoped override that the call had just read. Now: omitting it writes to the scope the read resolved (your user-scoped row if present, otherwise global). Migration: a script that maintains the global schema while its identity also holds a user-scoped override must pass `user_specific: false` (`--no-user-specific` on the CLI). With `user_specific: false` and no global row, the call now returns `ERR_SCHEMA_SCOPE_MISMATCH` instead of creating one.
- **`neotoma schemas update --user-specific`** no longer defaults to false (same migration).
- **Follow-up handling for `submit_issue` rows** with a `target_repo` outside the allowlist is local-only, as described under Behavior changes.
