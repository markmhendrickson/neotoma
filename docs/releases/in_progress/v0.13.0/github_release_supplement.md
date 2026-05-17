---
title: v0.13.0 Release Supplement
summary: "v0.13.0 is a substantial feature release. The headline additions are **schema-level and per-entity agent instructions** (an entity-type can carry behavioral guidance that agents must apply when the entity is retrieved), a **multi-harness..."
---

# v0.13.0 Release Supplement

## Summary

v0.13.0 is a substantial feature release. The headline additions are **schema-level and per-entity agent instructions** (an entity-type can carry behavioral guidance that agents must apply when the entity is retrieved), a **multi-harness preflight CLI** that replaces the multi-prompt onboarding flow, **bulk harness-transcript import** from `~/.claude/`, `~/.codex/`, and `~/.cursor/`, **MCP integration guides for Continue, Windsurf, VS Code, and Letta**, a **bidirectional column-encryption migration command** for self-hosted deployments, and a **data-layer determinism fix** for `GET /timeline` pagination. Sandbox releases now stage as draft GitHub Releases and publish only after the sandbox deployment is verified.

## What changed for npm package users

### New CLI commands

- **`neotoma preflight [--tool <harness>] [--apply] [--scope project|user|both] [--dry-run]`** — prints a copy-paste allowlist block for the specified harness or writes it directly with `--apply`. Allowlist writes are supported for `claude-code`, `cursor`, and `codex`; for MCP-only harnesses (`claude-desktop`, `openclaw`, `windsurf`, `continue`, `vscode`) the command prints a redirect to `neotoma setup` since those harnesses have no writable command allowlist file. For `claude-code`, `--scope` selects project (`.claude/settings.local.json`), user (`~/.claude/settings.json`), or both. `neotoma setup` calls the same write path, so preflight is only strictly necessary when the allowlist must be in place before `npm install -g neotoma` runs. Replaces the multi-prompt manual setup that previously plagued the onboarding flow.
- **`neotoma db migrate-encryption <encrypt|decrypt>`** — bidirectional bulk column encryption migration that operates directly on the SQLite file (no running server). Migrates `observations.fields`, `entity_snapshots.snapshot/provenance`, `relationship_snapshots.snapshot/provenance`, `raw_fragments.fragment_value/fragment_envelope`, and `schema_recommendations.fields_*`/`converters_to_add`. Uses the same key configuration as the runtime (`NEOTOMA_KEY_FILE_PATH` or `NEOTOMA_MNEMONIC` + optional `NEOTOMA_MNEMONIC_PASSPHRASE`). Covered by `tests/cli/db_migrate_encryption.test.ts` (encrypt→decrypt identity, idempotency, dry-run non-mutation, NULL preservation, missing-table skip, wrong-key per-row failure).
- **`neotoma db repair-schema-lag [--dry-run] [--types <entity_types>] [--rollback <run_id>]`** — audit and repair `raw_fragments` rows that were misrouted due to the schema-projection-lag bug (issue #142). Rows in `raw_fragments` whose `fragment_key` now matches a declared field in the active schema for their entity type are promoted to observations and affected entity snapshots are recomputed. Every inserted observation carries a `_migration_run_id` field so runs are fully rollback-safe. Covered by `tests/cli/db_repair_schema_lag.test.ts`.

### New CLI flags on existing commands

- **`neotoma discover --harness-transcripts`** — also detects Claude Code (`~/.claude/projects/*/conv-*.jsonl`), Codex (`~/.codex/archived_sessions/*.jsonl`), and Cursor (`~/.cursor/chats/**/store.db`) transcript locations. Prints a structured summary with file counts, sample titles, date ranges, and SQLite requirement flags.
- **`neotoma ingest-transcript [path] --harness <claude-code|codex|cursor>`** — `path` is now optional. When `--harness` is given and `path` is omitted, bulk-imports all transcripts from the corresponding well-known location.
- **`neotoma cursor-hooks --global`** — installs cursor hooks into `~/.cursor/hooks.json` instead of the project-local `.cursor/hooks.json` (#144).

### Behavior changes in existing commands

- **`neotoma store` / `retrieve_entities`** — entity responses now include two new nullable string fields:
  - `schema_instructions` — markdown sourced from `SchemaDefinition.agent_instructions` for the entity's registered schema.
  - `entity_instructions` — markdown sourced from the entity's own snapshot `agent_instructions` field.
  Both are populated automatically when present. Agents MUST treat these as behavioral context for the entity type and apply them to the current turn.
- **`neotoma sources` access mutation commands** now fail fast when `--base-url` or `--api-only` are present (these commands are local-only).
- **`neotoma issue add-message`** treats partial success (GitHub write succeeded, remote Neotoma append failed) as success, returning a non-null `remote_submission_error` so callers can react without an end-to-end failure (#43, #90).
- **`neotoma cli access reset-issue-policy`** correctly writes the default policy to disk (#40, #89).

### New seeded entity types

- **`gist`** — GitHub Gists and similar code/text snippets shared via URL. Identity uses gist URL; preserves description casing; last-write merge for description (#72, #75, #77, #84).
- **`neotoma_repair`** — records a repair or remediation action taken within Neotoma. Identity is composed of action + timestamp + actor.
- **`external_link`** — generic external URL entity with gist-style metadata fields (title, description, source).

## API surface & contracts

- New nullable response fields on entity objects in `openapi.yaml`:
  - `schema_instructions: string | null` — from `SchemaDefinition.agent_instructions`.
  - `entity_instructions: string | null` — from snapshot `agent_instructions`.
- `submit_issue` and `add_issue_message` accept a new optional `entity_ids_to_link: string[]`; the server creates `REFERS_TO` relationships from the issue (or message) to the referenced entities in the same operation, so callers no longer need a follow-up relationship write (#131, #146, #147).
- `add_issue_message` result schema adds `remote_submission_error: string | null`. Non-null when remote Neotoma append failed after local and/or GitHub side effects were already recorded.
- HTTP `keepAliveTimeout` extended to prevent MCP session drops behind reverse proxies (#148).
- No endpoints removed. No request shape tightening. No closed `additionalProperties` flipped. No required fields added. No type narrowings. **No breaking changes.**

## Behavior changes

- **Timeline pagination is now deterministic.** `GET /timeline` previously sorted only by `event_timestamp` (or `created_at` when explicitly requested). When many events shared the same timestamp — which is the common case for events ingested from a single source in one store request — page boundaries were unstable across offset queries, so events could repeat across pages or be skipped. A secondary `id ASC` sort key now applies to the query so ties on the primary sort key fall through to a deterministic order. Aligns the endpoint with `docs/architecture/determinism.md`.
- **Schema-level agent instructions.** `SchemaDefinition.agent_instructions` is now a validated optional field. When set, it is returned alongside every entity of that type so agents in the loop see the relevant behavioral context (e.g. "this entity type represents a contract — preserve `effective_date` exact-case").
- **Per-entity agent instructions.** An entity's snapshot may carry its own `agent_instructions` field which extends or overrides the schema-level instructions for that specific entity.
- **Schema auto-enhancement gates relaxed for trusted sources.** Thresholds drop to `ceil(base * 0.5)` for user-scoped schemas when the observation source is `llm_summary`, `import`, or `sync`. Does not apply to global schemas (#98, #102).
- **Recurring event field projection.** Recurring-event fields now project correctly into snapshots (#37, #115).
- **Null correction clears date fields from snapshot.** A correction that writes `null` to a date field now removes it from the snapshot instead of leaving the previous value (#41, #104).
- **Source existence validated before creating an interpretation.** `interpret` now returns a clear `Source not found: <id>` error instead of orphan rows.
- **Canonical mirror commits work in unconfigured environments.** The git-backed canonical mirror now provides a fallback `user.name`/`user.email` so commits succeed in CI and other environments without a global git identity.
- **Untrusted `X-Forwarded-For` IPs are redacted in log lines.** `isLocalRequest` log output no longer leaks raw client IPs from spoofed headers (PII hardening).
- **Neotoma entity IDs carved out of phone-number PII redaction.** Entity IDs of the form `ent_*` are no longer mistakenly matched as phone numbers (#130, #134).

## Docs site & CI / tooling

- **MCP integration guides added** for Continue, Windsurf, VS Code, and Letta. Each guide ships with a frontend subpage (`NeotomaWithContinuePage`, `NeotomaWithLettaPage`, `NeotomaWithVSCodePage`, `NeotomaWithWindsurfPage`) and a docs site MDX page.
- **Mobile MCP setup guide** added; **compact MCP instructions mode** documented (#93, #105).
- **Pre-release checklist** and **tunnel auth audit matrix** added under `docs/developer/`.
- **Cloud-fronted caller auth section** added to the tunnel guide with an advisory operational note (covers Cloudflare Tunnel topology).
- **`install.md` updated** — Step 2.1 now calls `neotoma preflight --tool <tool> --apply`; harness transcript detection block added.
- **`docs/developer/cli_reference.md` updated** with `preflight`, `db migrate-encryption`, `db repair-schema-lag`, `discover --harness-transcripts`, and `ingest-transcript --harness`.
- **`SECURITY.md`** — Supported Versions table updated (`0.13.x` Yes, `0.12.x` Yes, `< 0.12` No).
- **CI: Claude PR review GitHub Action** triggers on every push to open non-draft PRs (#111, #119); pre-review reading list wired in.
- **CI: baseline job isolates integration test DB state** to eliminate shared-state flakiness (#126).
- **CI: `@neotoma/client` alias resolution** fixed in vitest and the opencode-plugin (#107, #109, #132).
- **CI: security classifier JSON output** no longer includes the npm script header line.
- **Site: `neotoma-wordmark.svg`** now ships with site_pages build output (#122).
- **Release skill: GitHub Releases now stage as draft** and publish only after sandbox deploy verification — eliminates the window where a release appears in "latest" before the deployed surface matches.
- **`fly.toml`** — Fly.io app renamed from `neotoma` to `neotoma-sandbox`; data volume mount (`source: "data"`, destination: `/app/data`) added so the SQLite file persists across deploys (#117).

## Internal changes

- **`src/cli/preflight.ts`** (new, 167 lines) — implements the standalone permission-file writer described above.
- **`src/cli/discovery.ts`** (new, 222 lines) — harness transcript detection (Claude Code JSONL, Codex JSONL, Cursor SQLite `store.db`) with sample-title extraction and date-range estimation.
- **`src/cli/commands/db.ts`** (expanded) — adds `db migrate-encryption` (bulk column encryption migration, operates on closed SQLite file) and `db repair-schema-lag` (audit and repair raw_fragments misrouted by the schema-projection-lag bug with full rollback support).
- **`src/services/schema_lag_repair.ts`** (new, 431 lines) — implements `auditEntityType`, `repairEntityType`, `auditAll`, `repairAll`, and `rollbackRun` for the schema-lag repair command. Uses deterministic observation IDs (SHA-256 of `entity_id:run_id`) so re-runs are safe.
- **`src/server.ts`** — wires `queueSchemaLagRepair` on server startup so users who had data affected by #142 are automatically offered the repair path.
- **`src/repositories/sqlite/sqlite_client.ts`** — minor extension to support repair service queries.
- **`src/services/auto_enhancement_processor.ts`** — schema-lag repair integration: repair-candidate fragments are bypassed from auto-enhancement queue to avoid processing data that will be migrated.
- **`src/cli/transcript_parser.ts`** — major expansion (+355 lines). Adds `conversation_id` field to extracted conversation entities; broadened harness parsing.
- **`src/services/schema_definitions.ts`** — adds `gist`, `neotoma_repair`, `external_link` seeded types and extends existing definitions.
- **`src/services/schema_registry.ts`** — validates and persists `SchemaDefinition.agent_instructions`.
- **`src/services/schema_recommendation.ts`** — `trusted_source_relaxation` config plus `TRUSTED_OBSERVATION_SOURCES = {llm_summary, import, sync}` allowlist.
- **`src/server.ts`** — MCP instruction body refreshed (schema/fidelity, display rule, product-bug repair, issue reporting QA tightened); `entity_ids_to_link` plumbing on `submit_issue` and `add_issue_message`.
- **MCP instruction file (`docs/developer/mcp/instructions.md`)** — major narrative refresh covering schema-instruction handling, retrieval-first behavior, image-only compliance, and global-conservative reducer policy (#97, #99, #93, #95). **PII stripping checklist** added to `[GUEST ENTITY SUBMISSION]` section: agents must strip names, emails, private identifiers, credentials, and sensitive field excerpts before every `submit_issue` or `add_issue_message` call (#139).
- **`scripts/backfill_harness_transcripts.ts`** — loads `.env.production` for `NEOTOMA_BEARER_TOKEN`, surfaces child-process stderr on failure, accepts `--base-url` and explicit env injection.
- **`scripts/audit_raw_fragments_schema_lag.ts`** — expanded from stub to full audit script for diagnosing raw_fragments rows misrouted by the schema-projection-lag bug (issue #142, fixed on main).
- **`scripts/check_migration_run.ts`** (new) — operational helper for verifying a migration run completed and stored correctly.
- **Skill directories** — `.claude/skills/` and `.cursor/skills/` renamed from kebab-case to snake_case throughout. New skills added: `process_prs`, `publish_plan`, `shadcn`.
- **Frontend assets** — Castor agent avatar and mascot concept renders added under `frontend/src/assets/images/mascots/`. SEO metadata expanded (+59 lines in `frontend/src/site/seo_metadata.ts`).
- **Gmail proactive check Cursor rule** (`.cursor/rules/gmail_proactive.mdc`, `alwaysApply: true`) — directs agents to check Gmail when task context implies email may be relevant.

## Fixes

- **Timeline pagination non-determinism** (data-layer, high impact): `GET /timeline` with `--limit` + `--offset` could repeat or skip events when multiple events shared the same `event_timestamp`. Fixed by adding `id ASC` as a secondary sort key in `src/actions.ts:4319`. Regression test in `tests/cli/cli_timeline_commands.test.ts` now asserts zero overlap across pages and probes total count before pagination assertions.
- **Self-hosted auth for key-file-only deployments and Cloudflare Tunnel topology** (#79) — token resolution now works when only `NEOTOMA_KEY_FILE_PATH` is set (no mnemonic), and the tunnel-fronted topology produces the correct auth response.
- **`NEOTOMA_TRUSTED_PROXY_IPS` discovery logging** — `isLocalRequest` now logs untrusted XFF IPs (redacted) so operators can identify the correct CIDR to allowlist.
- **`isLocalRequest` log line PII** — untrusted XFF IPs in the rejection log are redacted; set `NEOTOMA_DEBUG_TUNNEL=1` to see full IPs.
- **`external_link` entity type** with gist metadata fields, plus identity/canonical-name fixes for `gist` and `neotoma_repair` (#72, #75, #77, #84).
- **`remote_submission_error: null`** on the `AddMessageResult` early-return path.
- **`@neotoma/client` alias resolution** in vitest and opencode-plugin (#107, #109, #132).
- **CI checkout step** in `claude-code-action` workflow; **`id-token:write` and `github_token`** added so the action can authenticate.
- **Security classifier JSON output** strips the npm script header line.
- **Site wordmark** included in `site_pages` build output (#122).
- **Issue access reset-issue-policy** correctly writes default to disk (#40, #89).
- **Schema-projection lag for recurring events** (#37, #115) — fields now project into the snapshot.
- **Multiple-active-schema rows causing raw_fragments misrouting** (#142) — when `registerSchema` was called with `activate: true`, prior active rows for the same `entity_type` + scope were not deactivated. `loadGlobalSchema` / `loadUserSpecificSchema` use `.single()`, so a second active row caused the `.single()` call to error; new observations were silently routed to `raw_fragments` instead of being applied to the snapshot. Fixed in `src/services/schema_registry.ts` by explicitly deactivating all prior active versions before returning the newly registered row. Regression test: `tests/unit/schema_projection_lag.test.ts` (+242). Deployments that ingested data while the bug was active can recover misrouted rows using the new `neotoma db repair-schema-lag` command.
- **`db migrate-encryption` rowid-aliasing latent bug** — the migration used `SELECT rowid, <col> FROM <table>` and `UPDATE … WHERE rowid = ?`. SQLite rewrites `rowid` to the declared primary-key column name when a table has an `INTEGER PRIMARY KEY` (which aliases rowid), so `row.rowid` would be `undefined` and the UPDATE would match no rows — silently, while still incrementing the `processed` counter. Today's production schemas all use `TEXT PRIMARY KEY` so the bug was a no-op in v0.12.x, but a future schema migration could trigger silent data loss. Fixed in `src/cli/commands/db.ts` by aliasing `rowid AS _migration_rowid` in the SELECT so the column name is stable regardless of the table's primary-key declaration. Regression test: `tests/cli/db_migrate_encryption.test.ts` includes an explicit `INTEGER PRIMARY KEY` schema case that fails without the alias.
- **Vendored `neotoma-client` in cursor-hooks plugin** — removed hardcoded dev-local token from the published artifact (security hardening for the published hooks plugin).

## Tests and validation

- **2917 / 2917 unit tests pass** on `HEAD` (full `npm test` lane; 14 skipped are integration-only tests, 3 todo are scaffolded future assertions).
- **G2 (`security:lint`)**: 0 errors, 110 warnings (pre-existing patterns, no new gating findings).
- **G3 (`security:manifest:check` + `test:security:auth-matrix`)**: manifest in sync (106 routes), auth matrix 16/16 pass.
- New test files added in this release range:
  - `tests/cli/cli_access_commands.test.ts` (+129)
  - `tests/cli/cli_doctor_setup.test.ts` (+245)
  - `tests/cli/cli_onboarding_commands.test.ts` (+100)
  - `tests/cli/cli_timeline_commands.test.ts` (+20, tightened pagination test)
  - `tests/cli/discovery_harness.test.ts` (+87)
  - `tests/cli/transcript_parser.test.ts` (+204)
  - `tests/integration/issue_37_event_schema_projection.test.ts` (+162)
  - `tests/integration/mcp_store_canonical_name_unknown_fields.test.ts` (+105)
  - `tests/integration/store_builtin_identity_opt_out_schemas.test.ts` (+162)
  - `tests/integration/store_explicit_canonical_name.test.ts` (+222)
  - `tests/integration/store_external_link_schema.test.ts` (+100)
  - `tests/services/schema_recommendation.test.ts` (+252)
  - `tests/unit/observation_reducer_projection.test.ts` (+330)
  - `tests/unit/schema_agent_instructions.test.ts` (+208)
  - `tests/unit/schema_projection_lag.test.ts` (+242)
  - `tests/cli/db_migrate_encryption.test.ts` (+340) — round-trip integration test for `db migrate-encryption` operating on a real closed SQLite file: encrypt→decrypt identity across all 5 covered tables, idempotency, `--dry-run` non-mutation, NULL preservation, missing-table skip, wrong-key per-row failure with errors reported, missing-key-source clear error, plus an explicit `INTEGER PRIMARY KEY` schema case that pins the rowid-aliasing fix (without the fix, the migration silently writes nothing while reporting `processed: N`).
  - `tests/cli/transcript_parser.test.ts` cursor section (+10 tests) — Cursor `state.vscdb` and per-workspace `store.db` SQLite parsing covering hex-encoded and raw-buffer blobs, structured content blocks, malformed JSON skip, missing-table fallback, corrupt-file fallback.
  - `tests/cli/cursor_hooks_global.test.ts` (+175) — `packages/cursor-hooks/scripts/install.mjs --global`: writes to `$HOME/.cursor/hooks.json` (not cwd), creates parent dir, inserts all 5 expected event hooks, preserves foreign hooks on merge, `--uninstall --global` removes only Neotoma entries, idempotent re-install.
  - `tests/cli/discover_to_parse_roundtrip.test.ts` (+170) — paths emitted by `discoverHarnessTranscripts` always parse via `parseTranscript`: claude-code JSONL, codex JSONL, cursor store.db, and a combined three-harness `$HOME`.
  - `tests/unit/keepalive_timeout.test.ts` (+60) — asserts the running server's `Keep-Alive: timeout=N` response header timeout is ≥ 60 s (default is 120 s), guarding against regression to Node's 5 s default behind reverse proxies.
  - `tests/cli/db_repair_schema_lag.test.ts` (+75) — behavioral tests for `db repair-schema-lag`: empty-database audit returns no hits, `repairAll` with a nonexistent entity type filter writes zero observations, result shape guarantees (run_id non-empty, errors array always present).

## Security hardening

`npm run security:classify-diff -- --base v0.12.1 --head HEAD` flagged `sensitive=true`. Concerns:
- **openapi-security** — response field additions (`schema_instructions`, `entity_instructions`, `entity_ids_to_link`, `remote_submission_error`) on existing secured endpoints. No security blocks changed. No new unauthenticated endpoints.
- **auth-middleware** — `src/actions.ts` modified for the timeline determinism fix only. `isLocalRequest`, `forwardedForValues`, `LOCAL_DEV_USER_ID`, and `assertExplicitlyTrusted` are unchanged from v0.12.1.

Review artifact: [`docs/releases/in_progress/v0.13.0/security_review.md`](./security_review.md)

**Gate results:**
- G1 (`security:classify-diff`): sensitive=true; concerns documented above.
- G2 (`security:lint`): 0 errors, 110 warnings; no new findings.
- G3 (`security:manifest:check` + `test:security:auth-matrix`): manifest in sync (106 routes, 97 protected, 7 runtime-only unauth with stated reasons); auth matrix 16/16 pass.
- G4 (`security:ai-review`): review filled; sign-off verdict `with-caveats`. Caveat: `NEOTOMA_TRUSTED_PROXY_IPS` CGNAT residual risk documented in `docs/security/threat_model.md`; no new code in v0.13.0 touches this surface.

Operational hardening landing in this release:
- Untrusted XFF IPs redacted in `isLocalRequest` rejection logs (PII).
- `NEOTOMA_TRUSTED_PROXY_IPS` discovery messages documented for CGNAT / Warp / Cloudflare Tunnel scenarios.
- `cursor-hooks` plugin no longer ships a hardcoded dev-local token in the published artifact.
- Cloud-fronted caller auth section added to the tunnel guide.

No new security advisories opened for this release.

## Breaking changes

No breaking changes.
