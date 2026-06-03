# v0.13.0 Release Supplement

## Summary

v0.13.0 is a substantial feature release covering everything since v0.12.1. Headline additions:

- **Schema-level and per-entity agent instructions** — entity types and individual entities can carry behavioral guidance that agents must apply when the entity is retrieved.
- **Multi-harness preflight CLI** — replaces the multi-prompt onboarding flow.
- **Bulk harness-transcript import** from `~/.claude/`, `~/.codex/`, and `~/.cursor/`.
- **MCP integration guides** for Continue, Windsurf, VS Code, and Letta.
- **Bidirectional column-encryption migration command** for self-hosted deployments.
- **Plan-entity refactor** — adds opt-in first-class `plan` entities and a `neotoma-plans` mirror profile; replaces feature units as the internal planning abstraction. Regular harness plan files (`.cursor/plans/`, `.claude/plans/`, etc.) continue to work without changes.
- **Server-rendered `/docs` index** over repo docs, with fail-closed visibility.
- **Prettier baseline + CI format gate**.
- **Selective Claude PR review on substantial PRs**.
- Corrective fixes to schema discovery, idempotency, intra-batch relationships, raw_fragments routing, and timeline determinism.

GitHub Releases now stage as draft and publish only after the sandbox deployment is verified. The release flow opens an RC branch + PR for public review before execute.

## What changed for npm package users

### New CLI commands

- **`neotoma preflight [--tool <harness>] [--apply] [--scope project|user|both] [--dry-run]`** — prints a copy-paste allowlist block for the specified harness or writes it directly with `--apply`. Allowlist writes are supported for `claude-code`, `cursor`, and `codex`; for MCP-only harnesses (`claude-desktop`, `openclaw`, `windsurf`, `continue`, `vscode`) the command prints a redirect to `neotoma setup`. For `claude-code`, `--scope` selects project (`.claude/settings.local.json`), user (`~/.claude/settings.json`), or both. Replaces the multi-prompt manual setup that previously plagued the onboarding flow.
- **`neotoma db migrate-encryption <encrypt|decrypt>`** — bidirectional bulk column encryption migration that operates directly on the SQLite file (no running server). Migrates `observations.fields`, `entity_snapshots.snapshot/provenance`, `relationship_snapshots.snapshot/provenance`, `raw_fragments.fragment_value/fragment_envelope`, and `schema_recommendations.fields_*`/`converters_to_add`. Uses the same key configuration as the runtime (`NEOTOMA_KEY_FILE_PATH` or `NEOTOMA_MNEMONIC` + optional `NEOTOMA_MNEMONIC_PASSPHRASE`). Covered by `tests/cli/db_migrate_encryption.test.ts` (encrypt→decrypt identity, idempotency, dry-run non-mutation, NULL preservation, missing-table skip, wrong-key per-row failure, INTEGER PRIMARY KEY rowid-aliasing fix).
- **`neotoma db repair-schema-lag [--dry-run] [--types <entity_types>] [--rollback <run_id>]`** — audit and repair `raw_fragments` rows that were misrouted due to the schema-projection-lag bug (#142). Rows whose `fragment_key` now matches a declared field in the active schema are promoted to observations and snapshots recomputed. Every inserted observation carries a `_migration_run_id` field for rollback. Covered by `tests/cli/db_repair_schema_lag.test.ts`.
- **`neotoma db migrate-env-split`** — repairs npm-installed deployments that had previously written user data to a dev database. Subsequent installs now default to a production DB; this command moves existing data into the production location (#172, #244).
- **`neotoma schemas repair-plural-types`** — coalesces accidentally-plural entity types (e.g. `posts` → `post`) back to the canonical singular form, declaring the plural as an alias on the canonical schema (#162).
- **`neotoma onboarding import-transcripts`** and **`neotoma init --import-transcripts`** — bulk-import all detectable harness transcripts in one step during onboarding (#143).
- **`neotoma reporter setup`** — guided setup for the issue reporter flow (auth, scope, default labels), supersedes the multi-step manual procedure (#199).

### New CLI flags on existing commands

- **`neotoma discover --harness-transcripts`** — also detects Claude Code (`~/.claude/projects/*/conv-*.jsonl`), Codex (`~/.codex/archived_sessions/*.jsonl`), and Cursor (`~/.cursor/chats/**/store.db`, plus `state.vscdb`) transcript locations. Prints a structured summary with file counts, sample titles, date ranges, and SQLite requirement flags.
- **`neotoma ingest-transcript [path] --harness <claude-code|codex|cursor>`** — `path` is now optional. When `--harness` is given and `path` is omitted, bulk-imports all transcripts from the corresponding well-known location.
- **`neotoma cursor-hooks --global`** — installs cursor hooks into `~/.cursor/hooks.json` instead of the project-local `.cursor/hooks.json` (#144).
- **`neotoma store --turn-key <key>`** — stable per-turn idempotency key surface for replay-safe stores; used internally by the test suite and supported for external callers.
- **`neotoma sync-issues --push`** — new push leg that mirrors local public Neotoma issues to GitHub with PII redaction applied at the boundary.

### Behavior changes in existing commands

- **`neotoma store` / `retrieve_entities`** — entity responses now include two new nullable string fields:
  - `schema_instructions` — markdown sourced from `SchemaDefinition.agent_instructions` for the entity's registered schema.
  - `entity_instructions` — markdown sourced from the entity's own snapshot `agent_instructions` field.
  Agents MUST treat these as behavioral context for the entity type and apply them to the current turn.
- **`neotoma store`** — unknown-field surfacing improved: the response now includes a concrete list of unknown field names (not just a count) when fields are dropped to `raw_fragments`, and emits a structured recovery hint pointing the caller at the right corrective action (#185, #187). A pre-resolution pass prevents partial batch writes — if any entity in a batch fails to resolve, none are written (#203). Intra-batch relationships are honored: a relationship targeting another entity created in the same `store` call now resolves correctly (#203, #221).
- **`neotoma store`** — schema/type discovery is required before the store completes; callers receive a clear error when targeting an unregistered entity type instead of silently routing all fields to `raw_fragments` (#196, #208). When the target type has no registered schema, the response surfaces the no-schema state explicitly so callers can register a schema and retry (#164).
- **`neotoma store`** — idempotency key reuse with a different payload is now detected via content-hash comparison and returns `ERR_IDEMPOTENCY_MISMATCH` instead of silently overwriting (#186).
- **`neotoma store` aliases** — the MCP dispatcher now recognises `store_structured` and `store_unstructured` aliases for the unified `store` tool.
- **`neotoma store` ranking** — store-tool ranking improved so agents surface the right entry point when multiple variants match (#181, #182, #183, #191, #206).
- **`neotoma retrieve` / `list_timeline_events`** — `list_timeline_events` returns an empty result for an unknown `event_type` instead of erroring (#207).
- **`neotoma sources` access mutation commands** now fail fast when `--base-url` or `--api-only` are present (these commands are local-only).
- **`neotoma issue add-message`** treats partial success (GitHub write succeeded, remote Neotoma append failed) as success, returning a non-null `remote_submission_error` so callers can react without an end-to-end failure (#43, #90).
- **`neotoma cli access reset-issue-policy`** correctly writes the default policy to disk (#40, #89).
- **`neotoma doctor`** — reports the source of the resolved `data_dir` so users can tell when the path came from an env var, default, or explicit flag (#170).
- **`neotoma upload`** — `--local` correctly uses the local data dir for source persistence (#168).
- **`neotoma submit-issue` / `add-issue-message`** — `reporter_app_version` is auto-populated when not supplied; `AUTH_REQUIRED` errors now surface a structured `hint` directing the caller at the right next step (#181, #182).
- **`neotoma plans`** — new top-level surface backed by `plan` entities (see Plan refactor below).

### New seeded entity types

- **`plan`** — first-class entity for engineering and design plans, replacing the previous filesystem-only feature units. Plans are mirrored back to `plans/` (was `docs/plans/`) via the new `neotoma-plans` mirror profile.
- **`gist`** — GitHub Gists and similar code/text snippets shared via URL. Identity uses gist URL; preserves description casing; last-write merge for description (#72, #75, #77, #84).
- **`neotoma_repair`** — records a repair or remediation action taken within Neotoma. Identity is composed of action + timestamp + actor.
- **`external_link`** — generic external URL entity with gist-style metadata fields (title, description, source).
- **`conversation`** — promoted from inferred to bootstrap-registered schema; `session_uuid` field added as a bridge to coalesce slug-style conversation IDs with harness-issued UUIDs (#138, #145, #256).
- **`workout_session`** — new schema with an `exercises` field using `merge_array` semantics (#209).
- **`product_feedback`** — adds a `feedback_source` discriminator and tightened identity validation (#136, #137).

### Plan refactor

Plans can now be stored as first-class Neotoma entities. This is opt-in; regular harness plan files continue to work without changes. When plans are entities, they participate in the entity graph and can be queried, linked, and mirrored. See the [plans guide](../../developer/plans_guide.md) for usage. Highlights:

- Plans live as `plan` entities with structured fields, retrieval routing, and graph edges to objectives, gates, and feedback.
- The new **`neotoma-plans` mirror profile** snapshots `plan` entities into the repo with canonical-name filenames and YAML frontmatter for harness compatibility.
- Plan content moved out of `.cursor/plans/` and `docs/plans/` flat files into Neotoma; the mirror writes them back to `plans/` for harness visibility (`b1d163696`).
- Selective mirror profiles support snapshot field tokens, slug truncation, and a remote API client for profile-based hydration (`8d39d1000`, `7a441614f`).
- Plan-entity retrieval routing fixed so `plan` queries return plan entities and not the conversation that referenced them (#228, #233).
- A new `renderProfileEntity` helper emits harness-compatible YAML frontmatter for profile rendering (#241).

## API surface & contracts

- New nullable response fields on entity objects in `openapi.yaml`:
  - `schema_instructions: string | null` — from `SchemaDefinition.agent_instructions`.
  - `entity_instructions: string | null` — from snapshot `agent_instructions`.
- `submit_issue` and `add_issue_message` accept a new optional `entity_ids_to_link: string[]`; the server creates `REFERS_TO` relationships from the issue (or message) to the referenced entities in the same operation, so callers no longer need a follow-up relationship write (#131, #146, #147).
- `add_issue_message` result schema adds `remote_submission_error: string | null`. Non-null when remote Neotoma append failed after local and/or GitHub side effects were already recorded.
- HTTP `keepAliveTimeout` extended to prevent MCP session drops behind reverse proxies (#148).
- **`POST /create_relationship` request schema declared** (`additionalProperties: false`, three required fields: `relationship_type`, `source_entity_id`, `target_entity_id`; three optional: `source_id`, `metadata`, `user_id`). The handler has always validated these via Zod; the OpenAPI spec is now aligned. See Breaking changes section.
- **MCP `create_relationship` and `list_entity_types` tool schemas declared** explicitly so MCP clients can introspect required and optional parameters (#159, #161). Previously these surfaced as schema-less or untyped tools to some clients.
- **`store` response shape extensions** — `unknown_fields` (array of names, not just a count), `no_schema_for_entity_type` flag, content-hash mismatch error path with structured hint.
- New unauthenticated route **`GET /docs` / `GET /docs/*`** — serves repo `docs/**.md` as a browsable read-only documentation tree (fail-closed visibility, see Security hardening).
- No endpoints removed. No type narrowings on existing previously-declared fields other than the create_relationship body alignment.

## Behavior changes

- **Agent guidance — retrieval disambiguation.** Agents are now required to disambiguate multi-candidate identifier lookups (from both `retrieve_entity_by_identifier` and identifier-shaped `retrieve_entities` calls) rather than report not found; up to 10 candidates are surfaced ranked by recency or observation count, with an inline question prompt in the reply body.
- **Timeline pagination is now deterministic.** `GET /timeline` previously sorted only by `event_timestamp` (or `created_at` when explicitly requested). When many events shared the same timestamp, page boundaries were unstable so events could repeat across pages or be skipped. A secondary `id ASC` sort key now applies. Aligns with `docs/architecture/determinism.md`.
- **Schema-level agent instructions.** `SchemaDefinition.agent_instructions` is now a validated optional field. When set, it is returned alongside every entity of that type so agents in the loop see the relevant behavioral context.
- **Per-entity agent instructions.** An entity's snapshot may carry its own `agent_instructions` field which extends or overrides the schema-level instructions for that specific entity.
- **Schema auto-enhancement gates relaxed for trusted sources.** Thresholds drop to `ceil(base * 0.5)` for user-scoped schemas when the observation source is `llm_summary`, `import`, or `sync`. Does not apply to global schemas (#98, #102).
- **Interpretation orders fragment writes after entity resolution.** Buffer raw_fragment writes until after entity resolution completes so they land against the correct resolved entity ID (#163).
- **SQLite lock retry.** Read and write operations now retry with exponential backoff on `SQLITE_BUSY` / `SQLITE_LOCKED` instead of failing immediately, which removes a class of flaky errors under concurrent agent load (#173).
- **Recurring event field projection.** Recurring-event fields now project correctly into snapshots (#37, #115).
- **Null correction clears date fields from snapshot.** A correction that writes `null` to a date field now removes it from the snapshot instead of leaving the previous value (#41, #104).
- **Source existence validated before creating an interpretation.** `interpret` now returns a clear `Source not found: <id>` error instead of orphan rows.
- **Canonical mirror commits work in unconfigured environments.** The git-backed canonical mirror provides a fallback `user.name`/`user.email` so commits succeed in CI and other environments without a global git identity.
- **Untrusted `X-Forwarded-For` IPs are redacted in log lines.** `isLocalRequest` log output no longer leaks raw client IPs from spoofed headers (PII hardening).
- **Neotoma entity IDs carved out of phone-number PII redaction.** Entity IDs of the form `ent_*` are no longer matched as phone numbers (#130, #134).
- **Hook bridge: session UUID coalescing.** The hook bridge now coalesces slug-style `conversation_id`s with harness-issued session UUIDs against the bootstrap-registered `conversation` schema, eliminating duplicate conversation entities per session (#145, #153, #256).
- **Automated-sender extraction.** Agent instructions now require organization and contact extraction for automated email senders (no-reply, alerts, etc.), bringing them into the entity graph instead of dropping them (#198).
- **npm-installed default database environment.** New npm installs default to a production database (was: dev). Existing dev installs are migrated via `neotoma db migrate-env-split` (#172).

## Docs site & CI / tooling

- **Server-rendered `/docs` index** over repo `docs/**.md` files, with fail-closed visibility (`docs/private/` never served, unmapped `docs/*/` paths default to internal). XSS-safe rendering, `Cache-Control: public, max-age=60`, in-process cache keyed by manifest and tree mtime. New visibility model documented in `src/services/docs/doc_frontmatter.ts`.
- **MCP integration guides added** for Continue, Windsurf, VS Code, and Letta. Each guide ships with a frontend subpage and a docs site MDX page.
- **Mobile MCP setup guide** added; **compact MCP instructions mode** documented (#93, #105).
- **Pre-release checklist** and **tunnel auth audit matrix** added under `docs/developer/`.
- **Cloud-fronted caller auth section** added to the tunnel guide with an advisory operational note (covers Cloudflare Tunnel topology).
- **`install.md` updated** — Step 2.1 calls `neotoma preflight --tool <tool> --apply`; harness transcript detection block added.
- **`docs/developer/cli_reference.md` updated** with the new commands and flags listed above.
- **`SECURITY.md`** — Supported Versions table updated (`0.13.x` Yes, `0.12.x` Yes, `< 0.12` No).
- **CI: Prettier format gate enforced** in pre-commit and the CI baseline lane (#166, #167). Baseline Prettier pass applied across `src/`.
- **CI: Claude PR review GitHub Action** triggers on every push to open non-draft PRs (#111, #119); pre-review reading list wired in. Reviewer scoped, throttled, de-looped (skip synchronize re-reviews for castor-agent PRs; cap at 15 turns; 60-minute timeout; diff-size gate; switched to Max plan OAuth with concurrency guard). `packages/**` paths and substantial-diff gate added (#243).
- **CI: selective `@claude` review on substantial PRs** via `/process_prs` instead of every push (#237 + follow-ups).
- **CI: baseline job isolates integration test DB state** to eliminate shared-state flakiness (#126).
- **CI: `@neotoma/client` alias resolution** fixed in vitest and the opencode-plugin (#107, #109, #132).
- **CI: security classifier JSON output** no longer includes the npm script header line.
- **Site: `neotoma-wordmark.svg`** ships with site_pages build output (#122).
- **Site: status banners** on partly-shipped proposals; stale artifacts archived (`de598863e`, `15ee7c770`).
- **Release skill: GitHub Releases stage as draft** and publish only after sandbox deploy verification — eliminates the window where a release appears as "latest" before the deployed surface matches. New **RC branch + PR** step opens `release/vX.Y.Z` → `main` and stops for public review before execute (this skill).
- **`fly.toml`** — Fly.io app renamed from `neotoma` to `neotoma-sandbox`; data volume mount added so the SQLite file persists across deploys (#117).
- **launchd: prod-server hot-reload via `dev:server:prod`** — switches the production launchd job to a source build with hot reload.
- **Standards scaffolding** — PR template, CODEOWNERS, format scripts, severity-mapping docs (#165).
- **`/audit` skill, FU spec, and manifest** added for Neotoma graph-health audits.
- **`/design_issues` skill** for working needs-design issues to resolution (#237).
- **`/process_prs` skill** for triage, security check, Opus review request on substantial PRs, merge, and release detection.
- **`/publish_plan` skill** to convert a plan entity into a GitHub Discussion post.

## Internal changes

- **Plan-entity refactor.** `.cursor/plans/` and `plans/` flat files migrated into `plan` entities; the new `neotoma-plans` mirror profile writes them back to `plans/` for harness visibility. Touches schema definitions, store routing, retrieval routing, and the mirror service.
- **`src/cli/preflight.ts`** (new) — standalone permission-file writer for the new `preflight` command.
- **`src/cli/discovery.ts`** (new) — harness transcript detection (Claude Code JSONL, Codex JSONL, Cursor SQLite `store.db` + `state.vscdb`).
- **`src/cli/commands/db.ts`** (expanded) — adds `db migrate-encryption`, `db repair-schema-lag`, and `db migrate-env-split`.
- **`src/services/schema_lag_repair.ts`** (new) — `auditEntityType`, `repairEntityType`, `auditAll`, `repairAll`, `rollbackRun`. Deterministic observation IDs (SHA-256 of `entity_id:run_id`).
- **`src/services/schema_registry.ts`** — validates and persists `SchemaDefinition.agent_instructions`; explicitly deactivates all prior active versions before returning a newly registered row (the #142 fix); plural-type repair backend.
- **`src/services/schema_definitions.ts`** — adds `gist`, `neotoma_repair`, `external_link`, `plan`, `workout_session`; promotes `conversation` to bootstrap; extends `product_feedback` with `feedback_source`.
- **`src/services/schema_recommendation.ts`** — `trusted_source_relaxation` config plus `TRUSTED_OBSERVATION_SOURCES = {llm_summary, import, sync}` allowlist.
- **`src/services/docs/doc_frontmatter.ts`** + **`src/services/docs/docs_index.ts`** (new) — fail-closed `/docs` visibility model and server-rendered index.
- **`src/cli/transcript_parser.ts`** — major expansion. Adds `conversation_id` extraction; broadened harness parsing; Cursor `state.vscdb` and per-workspace `store.db` SQLite parsing covering hex-encoded and raw-buffer blobs, structured content blocks, malformed JSON skip, missing-table fallback, corrupt-file fallback.
- **`src/server.ts`** — wires `queueSchemaLagRepair` on server startup; `entity_ids_to_link` plumbing on `submit_issue` and `add_issue_message`; MCP instruction body refreshed; skips SIGINT/SIGPIPE handlers in test environment; HTTP `keepAliveTimeout` extension.
- **`src/repositories/sqlite/sqlite_client.ts`** — exponential-backoff retry on `SQLITE_BUSY` / `SQLITE_LOCKED` (#173); minor extension to support repair service queries.
- **`src/services/auto_enhancement_processor.ts`** — schema-lag repair integration; repair-candidate fragments bypassed from auto-enhancement queue.
- **`src/services/mirror/*`** — selective profiles, canonical-name filenames, snapshot field tokens, slug truncation, remote API client, `renderProfileEntity` helper, `neotoma-plans` profile.
- **MCP instruction file (`docs/developer/mcp/instructions.md`)** — narrative refresh covering schema-instruction handling, retrieval-first behavior, image-only compliance, global-conservative reducer policy (#97, #99, #93, #95), PII stripping checklist for `submit_issue`/`add_issue_message` (#139), schema/type discovery first (#196, #208), per-record extraction, schema-first store (#160, #174, #175, #176), automated-sender organization/contact extraction (#198), auto-file consent (#250). Misnomer renamed; openclaw drift fixed; harness table added (`98d0907da`).
- **`scripts/backfill_harness_transcripts.ts`** — loads `.env.production`, surfaces child-process stderr, accepts `--base-url` and explicit env injection.
- **`scripts/audit_raw_fragments_schema_lag.ts`** — expanded from stub to full audit script.
- **`scripts/check_migration_run.ts`** (new) — operational helper for verifying a migration run completed and stored correctly.
- **Skill directories** — `.claude/skills/` and `.cursor/skills/` renamed kebab-case → snake_case. New skills: `process_prs`, `publish_plan`, `shadcn`, `audit`, `design_issues`.
- **Frontend** — Castor agent avatar and mascot concept renders added under `frontend/src/assets/images/mascots/`. SEO metadata expanded.
- **Gmail proactive check Cursor rule** — directs agents to check Gmail when task context implies email may be relevant.
- **`packages/cursor-hooks`** — vendored `neotoma-client` no longer ships a hardcoded dev-local token in the published artifact.

## Fixes

- **Timeline pagination non-determinism** (data-layer, high impact): adding `id ASC` as a secondary sort key. Regression test in `tests/cli/cli_timeline_commands.test.ts`.
- **Self-hosted auth for key-file-only deployments and Cloudflare Tunnel topology** (#79) — token resolution works when only `NEOTOMA_KEY_FILE_PATH` is set; tunnel-fronted topology produces correct auth response.
- **`NEOTOMA_TRUSTED_PROXY_IPS` discovery logging** — `isLocalRequest` logs untrusted XFF IPs (redacted) so operators can identify the correct CIDR to allowlist.
- **`isLocalRequest` log line PII** — untrusted XFF IPs in the rejection log are redacted; set `NEOTOMA_DEBUG_TUNNEL=1` to see full IPs.
- **`external_link` entity type** with gist metadata fields, plus identity/canonical-name fixes for `gist` and `neotoma_repair` (#72, #75, #77, #84).
- **`remote_submission_error: null`** on the `AddMessageResult` early-return path.
- **`@neotoma/client` alias resolution** in vitest and opencode-plugin (#107, #109, #132).
- **CI checkout step** in `claude-code-action` workflow; `id-token:write` and `github_token` added; `CLAUDE_CODE_OAUTH_TOKEN` passed correctly (`1eb2957bd`).
- **Security classifier JSON output** strips the npm script header line.
- **Site wordmark** included in `site_pages` build output (#122).
- **Issue access reset-issue-policy** correctly writes default to disk (#40, #89).
- **Schema-projection lag for recurring events** (#37, #115) — fields now project into the snapshot.
- **Multiple-active-schema rows causing raw_fragments misrouting** (#142) — when `registerSchema` was called with `activate: true`, prior active rows for the same `entity_type` + scope were not deactivated. `loadGlobalSchema` / `loadUserSpecificSchema` use `.single()`, so a second active row caused the call to error; new observations were silently routed to `raw_fragments`. Fixed in `src/services/schema_registry.ts`. Regression test: `tests/unit/schema_projection_lag.test.ts`. Deployments that ingested data while the bug was active can recover misrouted rows using `neotoma db repair-schema-lag`.
- **`db migrate-encryption` rowid-aliasing latent bug** — SQLite rewrites `rowid` to the declared primary-key column name when a table has `INTEGER PRIMARY KEY`. Fixed by aliasing `rowid AS _migration_rowid`. Regression test in `tests/cli/db_migrate_encryption.test.ts`.
- **`store` schema canonical_name_fields and combined unknown-fields / idempotency-mismatch fix** (`c8f497198`) — see *Behavior changes in existing commands* for caller-facing detail (#164, #185, #186, #187, #203, #221).
- **`store_structured` / `store_unstructured` alias dispatch** in the MCP executeTool path.
- **`store` ranking and AUTH_REQUIRED hint** plus auto-populated `reporter_app_version` (#181, #182, #183, #191, #206).
- **`conversation` schema and session UUID bridge** (#138, #145, #256).
- **`product_feedback` `feedback_source` discriminator and identity validation** (#136, #137).
- **`workout_session` schema with merge_array exercises** (#209).
- **Plan entity retrieval routing** (#228).
- **SQLite lock retry with exponential backoff** (#173).
- **CLI bugs**: `getProjectRoot` resolution, doctor `data_dir_source`, local transport probe, upload `--local` data dir (#168, #170, #171, #172).
- **Recurring duplicate `renderProfileEntity` declaration** (#241 follow-up).
- **`mcp_ironclaw_setup.md`** full-path reference restored in overview (`70aa1c810`).
- **PR review carryovers**: addressed overlooked findings from PRs #224/#178, #233/#232/#151, #152/#222/#223, and #153 hook bridge hardening (`cc9fa5407`, `61919140b`, `69ca88230`, `f194cad25`).

## Tests and validation

- Full unit + integration test suite green on HEAD.
- G2 (`security:lint`): 0 errors; warnings are pre-existing patterns.
- G3 (`security:manifest:check` + `test:security:auth-matrix`): manifest in sync; auth matrix passes.
- G4 (`security:ai-review`): see `docs/releases/in_progress/v0.13.0/security_review.md`; verdict `with-caveats`.
- Test catalog regenerated; Prettier baseline applied repo-wide.

Test files added across this range include (non-exhaustive):

- `tests/cli/cli_access_commands.test.ts`
- `tests/cli/cli_doctor_setup.test.ts`
- `tests/cli/cli_onboarding_commands.test.ts`
- `tests/cli/cli_timeline_commands.test.ts` (tightened pagination test)
- `tests/cli/discovery_harness.test.ts`
- `tests/cli/transcript_parser.test.ts` (with cursor `state.vscdb` and `store.db` coverage)
- `tests/cli/db_migrate_encryption.test.ts` (round-trip + INTEGER PRIMARY KEY case)
- `tests/cli/db_repair_schema_lag.test.ts`
- `tests/cli/cursor_hooks_global.test.ts`
- `tests/cli/discover_to_parse_roundtrip.test.ts`
- `tests/integration/issue_37_event_schema_projection.test.ts`
- `tests/integration/mcp_store_canonical_name_unknown_fields.test.ts`
- `tests/integration/store_builtin_identity_opt_out_schemas.test.ts`
- `tests/integration/store_explicit_canonical_name.test.ts`
- `tests/integration/store_external_link_schema.test.ts`
- `tests/services/schema_recommendation.test.ts`
- `tests/unit/observation_reducer_projection.test.ts`
- `tests/unit/schema_agent_instructions.test.ts`
- `tests/unit/schema_projection_lag.test.ts`
- `tests/unit/keepalive_timeout.test.ts`
- `tests/unit/store_alias_dispatch.test.ts`
- `tests/unit/submit_issue_dx.test.ts`
- `tests/unit/workout_session_schema.test.ts`

## Security hardening

`npm run security:classify-diff -- --base v0.12.1 --head HEAD` flagged `sensitive=true`. Concerns reviewed:

- **openapi-security** — response field additions (`schema_instructions`, `entity_instructions`, `entity_ids_to_link`, `remote_submission_error`, `unknown_fields` list) on existing secured endpoints. No security blocks changed. No new authenticated endpoints removed.
- **auth-middleware** — `src/actions.ts` modified for the timeline determinism fix only. `isLocalRequest`, `forwardedForValues`, `LOCAL_DEV_USER_ID`, and `assertExplicitlyTrusted` are unchanged from v0.12.1.
- **new unauthenticated route `/docs`** — added to `protected_routes_manifest.json` runtime-only unauth allowlist with stated reason (serves public repo markdown). Fail-closed visibility model (`docs/private/` never served; unmapped paths default to internal; XSS-safe rendering; safe-scheme link rewriting). Reviewed via PR #178.

Review artifact: [`docs/releases/in_progress/v0.13.0/security_review.md`](./security_review.md).

Operational hardening landing in this release:

- Untrusted XFF IPs redacted in `isLocalRequest` rejection logs (PII).
- `NEOTOMA_TRUSTED_PROXY_IPS` discovery messages documented for CGNAT / Warp / Cloudflare Tunnel scenarios.
- `cursor-hooks` plugin no longer ships a hardcoded dev-local token in the published artifact.
- Cloud-fronted caller auth section added to the tunnel guide.
- Issue push leg redacts PII at the GitHub boundary before mirroring local issues out.
- Public `/docs` route defaults unknown subtrees to `internal` (fail-closed) and rewrites unsafe link schemes.

No new security advisories opened for this release.

## Breaking changes

- **`POST /create_relationship` — request body schema declared with `additionalProperties: false`.** The OpenAPI spec previously declared an open schema with no fields. The handler has always validated `relationship_type`, `source_entity_id`, and `target_entity_id` as required via `CreateRelationshipRequestSchema` (Zod) and rejected unknown fields, so behavior is unchanged. The spec now matches the handler. Migration: ensure callers send only the declared fields (`relationship_type`, `source_entity_id`, `target_entity_id`, optional `source_id`, `metadata`, `user_id`). Any caller already compliant with the Zod validation is unaffected.
- **`MCP create_relationship` and `list_entity_types` tool schemas now declared.** MCP clients that previously sent ad-hoc fields through these tools will see explicit validation errors against the declared schema. Aligns the MCP surface with the HTTP surface (#159, #161).
- **`store` idempotency-key reuse with different payload returns `ERR_IDEMPOTENCY_MISMATCH`.** Previously, reuse silently overwrote. Callers relying on the silent-overwrite behavior must either use a new idempotency_key per distinct payload or use the explicit `correct` flow (#186).
- **`store` partial-batch writes are no longer possible.** A pre-resolution pass aborts the whole batch if any entity fails to resolve. Callers that relied on partial writes must split their input (#203).
- **`store` schema/type discovery required before completion.** Targeting an unregistered entity type now returns a structured error instead of silently routing all fields to `raw_fragments`. Callers must register the schema (or accept the `no_schema_for_entity_type` flag and re-store after registration) (#196, #208).
- **npm-installed default database environment switched to production.** New npm installs default to a production DB. Existing dev installs continue to work and can be migrated explicitly via `neotoma db migrate-env-split` (#172).
- **Plans relocated from `.cursor/plans/` and `docs/plans/` to `plans/` (mirrored from Neotoma).** Tooling that referenced the previous paths must update; the canonical source is now the `plan` entity, and the on-disk mirror is `plans/`.
- **Skill directories renamed from kebab-case to snake_case** under `.claude/skills/` and `.cursor/skills/`. Symlinks may need refreshing via `npm run setup:cursor`.

## MCP agent instructions changes

`docs/developer/mcp/instructions.md` received significant additions in this release. The file is the behavioral contract the Neotoma MCP server sends to clients at runtime, so these changes take effect without any code changes on the agent side — as soon as the server is updated, connected agents receive the updated instructions.

### New mandatory rules

- **Image-only message compliance.** When the user message contains only an image or screenshot (no text), all five turn-lifecycle steps still MUST execute. Agents must store a `conversation_message` describing the image and extract any entities visible in it (tasks, events, contacts, transactions). (#93, #95)

- **Short-pass compliance.** Doc-only edits, `neotoma cli config`, single-file lint tweaks, and other minimal turns are explicitly NOT exempt from steps 1–5. Rationalizing a store skip as "analysis-only", "in-session bookkeeping", or "just an evaluation" is FORBIDDEN. (#93)

- **PII stripping checklist before issue filing.** A mandatory six-point checklist must be completed before every `submit_issue` or `add_issue_message` call: strip names/emails/phones, replace private identifiers with `ent_*` IDs or generic labels, redact credentials and verbatim sensitive data, and re-read the body before calling. (#139)

- **Issue entity linking after filing.** Immediately after `submit_issue` returns, agents MUST call `create_relationships` with REFERS_TO edges to every Neotoma entity that motivated or is referenced by the issue. Likewise for `add_issue_message`. Previously these edges were optional. (#131, #135)

- **Schema-level and per-entity agent instructions.** When `retrieve_entities` or `retrieve_entity_snapshot` returns a `schema_instructions` or `entity_instructions` field, agents MUST treat those strings as behavioral context and apply them to the current turn. FORBIDDEN: ignoring these fields when present. (#129, #146)

- **Schema-first store for unfamiliar types.** Before the first `store` for an entity_type the agent has not used this session and that is not in the common-types short list, call `list_entity_types` with a keyword to discover whether a registered schema exists. FORBIDDEN: storing with an unfamiliar entity_type via intuited fields without a schema check. (#160, #174, #175, #176, #196, #208)

- **Unknown-fields mandatory repair.** If any entity in a store response has `unknown_fields_count > 0`, agents must immediately re-store or `correct` those entities using declared field names before proceeding to the closing assistant store. (#185, #187)

- **Automated sender extraction.** For every sender of an external-source record (email, notification, invoice), agents must create or match a `contact` entity for the sender address AND an `organization`/`company` entity for the underlying service, even for automated senders (no-reply, alerts, invoicing addresses). FORBIDDEN: extracting only the transactional payload without persisting the organization and sender contact. (#198)

- **Session UUID bridge (Claude Code).** In Claude Code contexts, agents must call `get_session_identity` once per session and include `session_uuid` on the slug-keyed `conversation` entity. This coalesces the hook-created UUID entity with the agent-created slug entity so hook-written timeline events correlate with MCP conversation data. FORBIDDEN: omitting `session_uuid` when `get_session_identity` is available and returns a value. (#145, #153, #256)

- **Proactive auto-file mandate.** When `issues.reporting_mode` is `proactive`, agents MUST call `submit_issue` for every qualifying finding in the same turn with no user confirmation prompt. FORBIDDEN: pausing to ask "should I file this?" when proactive mode is set. (#250)

- **Retrieval-first for common query types.** When the user asks about tasks, schedule, contacts, notes, issues, events, finances, decisions, or commitments, agents MUST run a bounded Neotoma retrieval pass before answering or falling back to native integrations. (#97, #99)

- **Named entity-type routing.** When the user asks about a named entity type ("newest plans", "my tasks", "open issues"), agents must call `retrieve_entities` with the matching `entity_type` directly. FORBIDDEN: searching conversation history as a substitute for a direct entity query. (#228)

- **Artifact store triggers.** When a concrete artifact is approved or finalized in conversation (plan, schema_design, decision_record, feature_spec, etc.), agents must store it in the same turn without waiting for an explicit save instruction. FORBIDDEN: ending a turn where an artifact was finalized without storing it.

- **`TodoWrite` is session-local.** The host tool `TodoWrite` does NOT satisfy the Neotoma store protocol. Persistent follow-up tasks must also be stored via `entity_type: "task"` in Neotoma. FORBIDDEN: using `TodoWrite` alone to record tasks that should persist beyond the current session.

### Clarifications and fixes

- **Fallback turn_key scoping.** Bare `chat:<turn>` turn_keys are now explicitly FORBIDDEN — they reuse across sessions and cause cross-session entity merges. The correct fallback is a session-epoch-scoped key (`chat-<session_epoch_ms>:<turn>`). (#127)

- **Conversation entity maintenance.** When a conversation pivots materially in scope, agents must update `title` and `scope_summary` on the existing conversation entity. FORBIDDEN: minting a new conversation entity or new `conversation_id` to represent the new scope.

- **Tool deregistration recovery.** When a tool call fails with "tool 'Neotoma:X' is not registered", agents must call `tool_search` to reload it and retry. This is a client-side cache eviction, not a server-side removal.

- **`parse_file` is not file retention.** `parse_file` is a read-only inspection tool that writes nothing to Neotoma. Retention requires a subsequent `store` call with `file_path` or `file_content+mime_type`. FORBIDDEN: treating a successful `parse_file` call as sufficient persistence.

- **Transport precedence.** When both `neotoma` (prod) and `neotoma-dev` MCP servers are connected, default to `neotoma` for all retrieval and store operations. Dev and prod are separate SQLite databases — data written to one is not visible in the other.

- **Harness table added.** A new table of supported harnesses (Claude Code, Cursor, Codex, Continue, Windsurf, VS Code, Claude Desktop, Letta) with their configuration paths was added to the onboarding section. (`98d0907da`)

## Upgrading from v0.12.x — repair and migration guide

Most upgrades are drop-in. The items below are opt-in repair and migration commands for deployments that were running during the affected window and may have accumulated data-quality issues from bugs fixed in this release. None are required if you are installing v0.13.0 fresh.

### 1. Repair misrouted `raw_fragments` rows (schema-projection lag) — recommended for all existing deployments

**Bug:** When `registerSchema` was called with `activate: true`, prior active schema rows for the same entity type were not deactivated. `loadGlobalSchema` uses `.single()`, so a second active row caused an error and new observations were silently routed to `raw_fragments` instead of the entity snapshot. Any entity type that was re-registered (e.g. during onboarding or version upgrades) was affected. (#142)

**Impact:** Entity snapshots for affected types are incomplete — fields that should be first-class observations are in `raw_fragments` and invisible to retrieval and the reducer.

**Fix (automatic on server start):** `queueSchemaLagRepair` runs on startup in v0.13.0 and queues a background audit. To verify the repair or run it on large databases, run manually:

```
neotoma db repair-schema-lag
```

Options: `--dry-run` audits without writing; `--types <types>` limits to specific entity types; `--rollback <run_id>` reverses a prior run. The repair is fully reversible.

### 2. Migrate npm installs to production database — required for npm-installed deployments that pre-date this release

**Bug:** Prior npm installs defaulted to the dev database (`neotoma.db`). v0.13.0 defaults to the production database (`neotoma.prod.db`). Existing deployments will appear empty after upgrading because the server now opens a different file. (#172)

**Fix:**

```
neotoma db migrate-env-split
```

Run once immediately after upgrading. Self-hosted installs that set `NEOTOMA_DATA_DIR` explicitly are unaffected.

### 3. Repair accidentally-plural entity types — if applicable

**Bug:** The naming convention requires singular `entity_type` names. Deployments with plural types (e.g. `posts`, `transactions`) have fragmented entity graphs — queries for the singular canonical form will miss records stored under the plural variant. (#162)

Check first with `neotoma schemas list`. If any types are plural, run:

```
neotoma schemas repair-plural-types
```

This coalesces plural types to the canonical singular form and declares the plural as an alias so existing references remain resolvable.

### 4. Clean up duplicate conversation entities from session UUID bridge — Claude Code users

**Bug:** Before the session UUID bridge fix, the Claude Code SessionStart hook and the MCP agent each created a separate `conversation` entity for the same session — one keyed by raw UUID, one by slug — that were never coalesced. (#145, #153, #256)

v0.13.0 prevents new duplicates automatically. To clean up historical ones, use the `list_potential_duplicates` MCP tool (or Inspector → Entities) to identify duplicate `conversation` pairs and merge them with `merge_entities`. This is cosmetic but improves timeline coherence and reduces entity count.

### 5. Encrypt existing data at rest — optional, self-hosted only

v0.13.0 ships `db migrate-encryption` for deployments that want to encrypt existing SQLite data. This is opt-in; the database is not encrypted by default.

```
neotoma db migrate-encryption encrypt
neotoma db migrate-encryption decrypt   # reverses it
```

Requires `NEOTOMA_KEY_FILE_PATH` or `NEOTOMA_MNEMONIC` (+ optional `NEOTOMA_MNEMONIC_PASSPHRASE`). Both directions are idempotent.

### 6. Re-import harness transcripts to pick up previously missed conversations — optional

**Bug:** The transcript parser missed several conversation shapes across Claude Code, Codex, and Cursor (hex-encoded blobs, malformed JSON turns, `state.vscdb` format). Sessions imported before this release may be incomplete. (#143)

```
neotoma onboarding import-transcripts
```

The importer is idempotent — already-imported conversations are matched by stable identity and updated rather than duplicated.

---

**Summary**

| # | Command | Who should run it | Required? |
|---|---------|-------------------|-----------|
| 1 | `neotoma db repair-schema-lag` | All existing deployments | Recommended |
| 2 | `neotoma db migrate-env-split` | npm installs pre-dating v0.13.0 | Required if affected |
| 3 | `neotoma schemas repair-plural-types` | Anyone with plural entity type names | If applicable |
| 4 | Merge duplicate `conversation` entities via Inspector | Claude Code users | Cosmetic/optional |
| 5 | `neotoma db migrate-encryption encrypt` | Self-hosted, opt-in encryption | Optional |
| 6 | `neotoma onboarding import-transcripts` | Any harness transcript user | Optional |
