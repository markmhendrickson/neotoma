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
- No endpoints removed. No type narrowings on existing declared fields.
- **`POST /create_relationship` schema corrected** — the OpenAPI spec previously declared an open schema (`additionalProperties: true`, no properties). The handler has always validated `relationship_type`, `source_entity_id`, and `target_entity_id` as required via `CreateRelationshipRequestSchema` (Zod), so behavior is unchanged. The spec now matches the handler: `additionalProperties: false`, three required fields declared, three optional fields (`source_id`, `metadata`, `user_id`) declared. Clients sending undeclared extra fields to this endpoint were already rejected by the handler; this change makes the schema contract match that reality. See Breaking changes section.
- **`store` response: new optional `conversation_message_count` field** (FU-2026-05-001). Populated when the request created or updated a `conversation_message` entity linked `PART_OF` a conversation; returns the post-commit count of sibling `conversation_message` entities in that conversation. Additive — omitted when no conversation context is in scope. Consumed by the new `neotoma_turn_summary` tool (FU-2026-05-002) to populate `msg N/M` in the turn status line without an extra retrieval round-trip.
- **New `neotoma_turn_summary` MCP tool / `POST /turn_summary` endpoint** (FU-2026-05-002). Computes the per-turn Neotoma status line (`msg N/M, stored K, retrieved L`, with optional `, issues J` suffix) and an optional `ui://neotoma/turn-summary?...` widget URI for ext-apps clients. Agents call this at end of every turn after the closing assistant store completes; pass the assistant message's `conversation_id` and `turn_key`. The server resolves stored/retrieved/issue entities from the assistant message's REFERS_TO edges, the turn ordinal from the message's `turn_number` field, and total message count from sibling `conversation_message` entities. Replaces the previous six [COMMUNICATION & DISPLAY] sub-rules with two: call the tool, emit `status_line`.
- **`conversation_message.turn_number`** (schema v1.4) — optional 1-based ordinal of a message within its conversation. Read by `neotoma_turn_summary` as the authoritative turn ordinal; falls back to total message count when absent on legacy rows.
- **`@neotoma/ext-apps-widget-host`** (new package) — host-agnostic widget host for MCP clients that support the `ui://` resource URI scheme. Parses widget URIs emitted by `neotoma_turn_summary`, fetches authoritative state from the Neotoma API via a caller-supplied client, and returns a normalized descriptor (status line + consent-card flag). Clients without this host fall back to the plain-text `status_line`.

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
- **MCP instruction file (`docs/developer/mcp/instructions.md`)** — see _MCP agent instructions changes_ section above for the full list of new mandatory rules and clarifications.
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
- **openapi-security** — response field additions (`schema_instructions`, `entity_instructions`, `entity_ids_to_link`, `remote_submission_error`) on existing secured endpoints. No security blocks changed. No new unauthenticated endpoints introduced.
- **auth-middleware** — `src/actions.ts` modified for the timeline determinism fix only. `isLocalRequest`, `forwardedForValues`, `LOCAL_DEV_USER_ID`, and `assertExplicitlyTrusted` are unchanged from v0.12.1.

Review artifact: [`docs/releases/in_progress/v0.13.0/security_review.md`](./security_review.md)

**Gate results:**
- G1 (`security:classify-diff`): sensitive=true; concerns documented above.
- G2 (`security:lint`): 0 errors, 110 warnings; no new findings.
- G3 (`security:manifest:check` + `test:security:auth-matrix`): manifest in sync (106 routes, 97 protected, 7 runtime-only unauth with stated reasons); auth matrix 16/16 pass.
- G4 (`security:ai-review`): review filled; sign-off verdict `with-caveats`. Caveat: `NEOTOMA_TRUSTED_PROXY_IPS` CGNAT residual risk documented in `docs/security/threat_model.md`; no new code in v0.13.0 touches this surface.

**Operational hardening in this release:**

- **`/docs` route — fail-closed visibility and XSS-safe rendering.** The new server-rendered `GET /docs` / `GET /docs/*` route is the only new unauthenticated public route in this release. It was hardened before exposure: unmapped `docs/*/` subtrees default to `visibility: "internal"` (fail-closed, not fail-open); `docs/private/` is never served regardless of configuration; rendered markdown escapes text boundaries; inline links with unsafe schemes (`javascript:`, `data:`, protocol-relative) are rewritten to `#`; `Cache-Control: public, max-age=60` with an in-process mtime-keyed cache. Registered in `protected_routes_manifest.json` with a stated `reason`. Addressed the fail-open default found in PR #178 review.

- **`sync_issues --push` PII redaction at the GitHub API boundary.** The new push leg of `sync_issues` mirrors local public Neotoma issue entities to GitHub. Before calling `github.createIssue`, it runs `runRedactionGuard(mode: "scan")` on the issue title and body — the same redaction path used by `submitIssue` — so private identifiers, names, and sensitive content are stripped before any data leaves the local instance. Push failures are non-fatal and do not block the pull leg.

- **Hardcoded credential removed from `cursor-hooks` published artifact.** The `@neotoma/cursor-hooks` npm package was shipping `Authorization: Bearer dev-local` in the client code included in the published artifact. Every consumer of the package was sending this hardcoded token to the Neotoma server on every hook call. The fix vendors the `neotoma-client` source directly into the plugin and omits the `Authorization` header entirely when no token is configured.

- **Draft GitHub Release + RC branch flow.** Releases now stage as draft GitHub Releases and publish only after sandbox deployment is verified. This closes the window where a release could appear as "latest" on GitHub before the deployed surface matched the release body. A new RC branch + PR step opens `release/vX.Y.Z` → `main` for public review before the execute step runs.

- **Untrusted XFF IPs redacted in `isLocalRequest` rejection logs** (PII hardening). `NEOTOMA_TRUSTED_PROXY_IPS` discovery messages documented for CGNAT / Warp / Cloudflare Tunnel scenarios.

- **Cloud-fronted caller auth section** added to the tunnel guide with an advisory operational note covering Cloudflare Tunnel topology.

No new security advisories opened for this release.

## Breaking changes

- **`POST /create_relationship` — schema documentation corrected, `additionalProperties: false` now enforced at the OpenAPI level.** The request body schema previously declared `type: object, additionalProperties: true` with no fields. The handler has always required `relationship_type`, `source_entity_id`, and `target_entity_id` and rejected unknown fields via Zod validation. The OpenAPI spec is now aligned with that behavior. Migration: ensure callers send only the declared fields (`relationship_type`, `source_entity_id`, `target_entity_id`, optional `source_id`, `metadata`, `user_id`). Any caller already compliant with the Zod validation is unaffected.

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
