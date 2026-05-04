v0.6.0 is an agent-runtime hardening release: AAuth-aware attribution and a `/session` preflight land across every write surface; closed OpenAPI request shapes now reject unknown top-level fields with a structured `ERR_UNKNOWN_FIELD`; writes can be classified by `observation_source`; multi-agent chat becomes first-class via `conversation_message` + `sender_kind`; over-merged entities are recoverable through `POST /entities/split`; an agents directory and richer provenance reads land; a full submit→queue→triage→mirror→upgrade/verify feedback pipeline ships (local store, HTTP transport, and a Netlify-hosted `agent-site` relay at `agent.neotoma.io`); fleet snapshot export + drift tooling lands via `neotoma snapshots`; and API security defaults tighten (Helmet CSP, per-user write rate limiting, timing-safe token compare, socket-based loopback classification). The previously planned `neotoma api start --env prod` default-runner flip ships in the same release.

## Highlights

- **Know which agent wrote what.** Neotoma verifies AAuth-signed requests, stamps a trust tier on every observation/relationship/source/interpretation, and exposes a preflight (`GET /session`, `get_session_identity`, `neotoma auth session`) so agents can confirm they are seen as a real, signed writer before producing any data.
- **Your whole agent fleet upgrades with the server.** The MCP instructions the server ships to every connected client now codify AAuth preflight, `observation_source` tagging, reply-cited provenance edges (Step 5b.1), an `Ambiguous (N)` display group for heuristic merges, and the structured feedback-submission loop — so every connected agent picks up the new defaults on server upgrade without client-side changes.
- **Fleet-grade write integrity.** Tag writes with `observation_source` (`sensor` / `workflow_state` / `llm_summary` / `human` / `import`) — accepted on `/store`, MCP store tools, and `neotoma store --observation-source` — then export canonical snapshots and diff them against external state (MEMORY.md, shadow DBs, other fleets) with explicit field-level and provenance-gap reports via `neotoma snapshots export|diff|parsers|check|request`.
- **Multi-agent conversations as first-class data.** `conversation_message` with `sender_kind` (`user` / `assistant` / `agent` / `system` / `tool`) plus stable `sender_agent_id` / `recipient_agent_id` give real agent-to-agent routing and reporting; `thread_kind` (`human_agent` / `agent_agent` / `multi_party`) describes participant topology; stricter `turn_key` / `conversation_id` guidance keeps unrelated threads from silently merging.
- **A structured agent feedback loop.** Agents can `submit_feedback`, poll for resolution with `get_feedback_status` (respecting `next_check_suggested_at`), receive install/upgrade guidance, and verify fixes; the new `agent.neotoma.io` Netlify service relays, redacts, and optionally forwards each item into Neotoma so one-off bug reports become a machine-ingestible pipeline.
- **Repair over-merged entities without destructive edits.** `POST /entities/split` and the `split_entity` MCP tool rebind a subset of observations to a new entity by time range, source, or field match, producing an `entity_splits` audit record instead of an irreversible delete/re-insert.

## What changed for npm package users

**CLI (`neotoma`)**

- `neotoma auth session` — calls `GET /session` and prints the resolved trust tier, identity, and `eligible_for_trusted_writes`, merging any local `cli_signer` state.
- `neotoma auth keygen` — writes a local AAuth keypair under `~/.neotoma/aauth/`; flags: `--alg`, `--sub`, `--iss`, `--force`.
- `neotoma auth sign-example` — prints a signed `curl` example targeting `/session` so operators can sanity-check signing end-to-end.
- `neotoma api start --env prod` on source checkouts now defaults to the **built** production runner (`dist/…`) instead of the `dev:prod` watcher. Pass `--watch` to restore the previous tsx-watcher behavior under `NEOTOMA_ENV=production`.
- `--observation-source <kind>` is threaded through store-oriented flows so operators/agents can label writes as `sensor`, `workflow_state`, `llm_summary`, `human`, or `import` instead of treating every write as equivalent.
- `neotoma feedback mode <proactive|consent|off>` — controls whether agents auto-submit feedback, prompt for consent, or stay silent unless explicitly asked.
- `neotoma triage` — ingest pending feedback; flags: `--watch`, `--list-pending`, `--set-status`, `--resolve`, `--health`, `--mirror-replay`, `--dry-run`, plus resolution-link options.
- `neotoma snapshots check|request|export|diff|parsers` — offline-first fleet audit tooling: export canonical snapshots of local state, request snapshots from a remote Neotoma via `POST /health_check_snapshots`, diff against external sources (MEMORY.md, shadow DBs), and report on supported parsers.
- New npm scripts: `openapi:bc-diff` (release preflight for breaking contract changes), `feedback:seed-schema` (provision the `product_feedback` entity schema), `feedback:mirror-backfill` (replay historical feedback through the mirror).

**Runtime / data layer**

- Request pipeline now stages JSON parsing with a raw-body stash (for signature verification), then Morgan, then an `unknownFieldsGuard` that rejects undeclared top-level keys on closed schemas before route handlers run.
- Helmet CSP tightens by default (`connectSrc: ['self']`); operators can allow additional hosts via `NEOTOMA_CSP_CONNECT_SRC` (comma-separated list).
- Per-user/IP write rate limit lands via `writeRateLimit` with a default cap of 120 writes/minute, tunable through `NEOTOMA_WRITE_RATE_LIMIT_PER_MIN`; keyed by authenticated user when available, falling back to an IPv6-safe IP helper. Separate rate limiters apply to the OAuth initiate/callback/token/register routes.
- AAuth verification runs non-blocking by default; `NEOTOMA_AAUTH_STRICT=1` causes signed-but-invalid requests to fail with 401. AAuth is honored on every HTTP surface (`/mcp`, `/store`, `/observations/create`, `/create_relationship`, `/correct`, `/session`, …) and the same identity is threaded into write-path services regardless of transport (HTTP `/mcp`, MCP stdio, CLI-over-MCP, CLI-over-HTTP).
- Operator-secret compares are timing-safe; loopback classification now inspects the actual socket address instead of trusting the `Host` header, so tunneled requests no longer masquerade as local.
- The observation reducer tie-breaks on `observation_source` after `source_priority`, so classified writes win over unclassified legacy rows deterministically.
- New service areas: entity split, attribution policy, request context, agents directory, agent capabilities registry, feedback transport/local-store/redaction/next-check/verification-request, snapshot export, drift comparison.
- SQLite adapter and schema registry are updated to carry the new agent attribution, `conversation_message` / `sender_kind`, `observation_source`, and provenance fields end to end.

**Shipped artifacts**

- `openapi.yaml` grows ~900 lines for the new session, agents, entity-split, attribution, provenance, feedback, and validation surfaces; `src/shared/openapi_types.ts` is regenerated to match.
- Updated schema snapshots land under `docs/subsystems/schema_snapshots/` for `conversation` (v1.0–v1.3, including bounded workspace/repository context), `agent_message` (v1.0–v1.1, retained as alias), and new `conversation_message` (v1.0–v1.2).
- The npm package picks up the CLI/runtime changes plus the updated docs and snapshots via the existing `files` list (`dist`, `openapi.yaml`, `openclaw.plugin.json`, `skills`, `LICENSE`, `README.md`). The `files` list itself is unchanged.

## API surface & contracts

**New HTTP routes**

- `GET /session` — resolved attribution tier, client identity, anonymous-write policy, and `eligible_for_trusted_writes`, plus a diagnostic `attribution.decision` block explaining why the tier resolved the way it did.
- `GET /agents`, `GET /agents/{key}`, `GET /agents/{key}/records` — agents directory: list known agents, fetch per-agent detail, and audit which records a given agent authored.
- `POST /entities/split` — rebind a subset of observations from a source entity to a new entity by time range, source, or field match; writes an `entity_splits` audit row.
- `GET /sources/{id}/relationships` — enumerate relationships associated with a source without ad-hoc queries.
- `POST /health_check_snapshots` — fleet snapshot export endpoint consumed by `neotoma snapshots check|request`.

**Expanded existing routes**

- `GET /sources/{id}` now includes a `provenance` block describing where the source came from.
- `POST /create_relationship` responses and `GET /relationships/{id}` include an `agent_attribution` block.
- `POST /entities/query` accepts `identity_basis` for finer-grained resolution/query semantics.
- `POST /relationships/snapshot` accepts an optional `user_id` for scoped snapshots.
- `Observation`, `TimelineEvent`, `Interpretation`, and `Source` response shapes carry richer provenance fields so reads surface the same attribution metadata writes produce.
- `StoreResolutionIssue.hint` and related error payloads are expanded with migration-oriented guidance instead of opaque resolution failures.

**New MCP tools**

- `get_session_identity` — MCP equivalent of `GET /session`; use in `initialize` or before enabling writes.
- `split_entity` — MCP equivalent of `POST /entities/split`.
- `submit_feedback` / `get_feedback_status` — feedback submission and polling (see the Agent feedback pipeline section).
- `health_check_snapshots` — MCP equivalent of the new fleet-snapshot endpoint.
- `npm_check_update` — checks for newer `neotoma` npm releases so agents can prompt users to upgrade when their client version falls behind.

**Validation tightening**

Unknown top-level fields are now rejected early (before route handlers) on closed request bodies with HTTP `400`, `error_code: ERR_UNKNOWN_FIELD`, and a structured details payload containing `allowed_fields`, `unknown_fields`, and `json_paths`. See **Breaking changes** for the full list of affected routes and migration paths.

## Behavior changes

- **`neotoma api start --env prod` on source checkouts runs the built artifact by default.** The old `dev:prod` watcher path is no longer the default production route; pass `--watch` when you explicitly want watcher behavior.
- **Unknown top-level request fields on closed write/auth endpoints fail fast.** The `unknownFieldsGuard` runs before route handlers, so extra JSON keys that previously slipped through are now rejected with a structured allow-list instead of being silently ignored or stripped downstream.
- **Session attribution is now inspectable.** Operators and agent builders can query the active trust tier, client identity, and anonymous-write policy via `GET /session` / `get_session_identity` / `neotoma auth session` instead of inferring it from logs or headers.
- **Stricter browser-side defaults.** The default Helmet CSP allows only `connect-src 'self'`; deployments that relied on permissive outbound browser connections need to set `NEOTOMA_CSP_CONNECT_SRC`.
- **Write traffic is rate-limited by default.** Bursty writers see HTTP `429` after 120 writes/minute per user or IP; tune with `NEOTOMA_WRITE_RATE_LIMIT_PER_MIN`.
- **Loopback-only routes no longer trust the `Host` header.** Requests that route via tunnels or proxies are correctly classified as remote even when they carry a localhost host.
- **Store responses may include a `warnings[]` block.** Heuristic-merge ambiguity (R3) is surfaced as a structured warning; agents following the shipped MCP instructions render these under an `Ambiguous (N)` section in chat.
- **Chat hooks emit `conversation_message` with `sender_kind`.** Cursor, Claude Code, Codex, OpenCode, and Claude Agent SDK hook packages all produce the new canonical shape; `agent_message` continues to be accepted as an alias at write time.
- **Reducer outputs may shift.** When `observation_source` is set on a new write, it tie-breaks against unclassified legacy observations via the reducer's `source_priority` → `observation_source` ordering; snapshots of mixed-classification entities can change accordingly.

## Agent-facing instruction changes (ship to every client)

The MCP server ships `docs/developer/mcp/instructions.md` to every connected client as its operating guidance, so these are user-facing behavior changes for every connected agent:

- **`observation_source` usage** — agents are instructed to set it only for non-LLM-summary writers (sensor emitter, state-machine step, human confirmation, bulk import) and leave it unset for ordinary chat extraction.
- **`conversation_message` canonicalization** — new writes use `conversation_message` + `sender_kind`; `agent_message` remains an accepted alias for pre-v0.6 clients.
- **A2A fields** — agent-to-agent traffic is expected to set `sender_kind: "agent"` with `sender_agent_id` / `recipient_agent_id`; `conversation.thread_kind` categorizes the thread topology.
- **Chat context scope** — agents may attach bounded host-provided conversation context (`client_name` / `harness`, workspace kind, repository name/root/remote, and a short scope summary) plus volatile per-turn context on `conversation_turn`, while keeping all context fields optional and non-identity-bearing.
- **Reply-cited provenance edges (Step 5b.1)** — the closing assistant store now includes `REFERS_TO` edges from the assistant message to every entity the reply materially cites or produces, tightening the provenance graph without linking every retrieval result.
- **`Ambiguous (N)` display group** — agents surface structured `HEURISTIC_MERGE` warnings from store responses in chat alongside `Created`/`Updated`/`Retrieved`.
- **`[ATTRIBUTION & AGENT IDENTITY]` block** — codifies AAuth preflight via `get_session_identity` / `GET /session` / `neotoma auth session`, forbidden `clientInfo` values, trust-tier badging, and impersonation policy.
- **`[FEEDBACK REPORTING]` block** — when to submit feedback, PII redaction expectations, persisting a `product_feedback` record with `access_token`, polling via `get_feedback_status`, handling `upgrade_guidance`, and responding to `verification_request`.
- **`npm_check_update` hint** — agents may call it at session start and prompt the user to upgrade when a newer `neotoma` client is available.

`docs/developer/cli_agent_instructions.md` mirrors these rules for CLI-backed flows, and `AGENTS.md` adds an **Agent Identity & Attribution** section pointing at both.

## Plugin / hooks / SDK changes

- **`packages/cursor-hooks`** — `before_submit_prompt.ts` and `stop.ts` emit `conversation_message` + `sender_kind` and propagate AAuth-aware session metadata.
- **`packages/codex-hooks`** — `session_end.py` propagates session/agent metadata on stop.
- **`packages/claude-code-plugin`** — `stop.py` and `user_prompt_submit.py` align with the new message shape and attribution fields.
- **`packages/opencode-plugin`** — updated to match the same conventions.
- **`packages/claude-agent-sdk-adapter`** — attribution/session metadata threaded through the adapter.
- **`packages/client` (TypeScript client)** — `helpers.ts` exposes `ChatTurnSenderKind`, the new `sender_kind`, A2A id fields, bounded conversation/workspace context fields, and canonical `conversation_message` typing; `diagnose.ts` and `turn_report.ts` align with the new attribution/diagnostic surface.

## Agent feedback pipeline (end-to-end)

- **MCP entry points** — `submit_feedback` for agents to report friction; `get_feedback_status` for polling with backoff respecting `next_check_suggested_at`.
- **Transport selection** — `NEOTOMA_FEEDBACK_TRANSPORT=local|http`, `AGENT_SITE_BASE_URL`, `AGENT_SITE_BEARER`; kill-switch `NEOTOMA_FEEDBACK_AUTO_SUBMIT=0` disables proactive submission.
- **Local store** — `src/services/feedback/local_store.ts` persists records to disk for dev/cron flows when HTTP transport is not configured.
- **Redaction** — emails, phone numbers, tokens, UUIDs, and home-directory path fragments are replaced with `<LABEL:hash>` placeholders before submission; the server returns a `redaction_preview` so agents can audit what was transformed.
- **Upgrade guidance** — resolved items can carry `upgrade_guidance` (`install_commands`, `verification_steps`) and `verification_request` (with `verify_by`); `feedback_upgrade_guidance_map.json` catalogs the canonical responses.
- **Netlify `agent-site`** (`services/agent-site/`) — public `/feedback/submit` + `/feedback/status`, admin `/feedback/pending`, `/feedback/{id}/status`, `/feedback/{id}/mirror_replay`, `/feedback/by_commit/:sha`, `/jwks`, `/healthz`, and a scheduled `push_webhook_worker`. Optionally forwards each item into Neotoma via tunnel + Cloudflare Access + AAuth (see `docs/subsystems/feedback_neotoma_forwarder.md`).
- **Cron ingestion** — `scripts/cron/ingest_agent_incidents.ts` classifies queued feedback, applies the upgrade-guidance map, and updates status; `scripts/cron/com.neotoma.feedback-ingest.plist.template` provides a launchd template.
- **Backfill + seeding** — `scripts/feedback_mirror_backfill.ts` replays historical submissions; `scripts/seed_product_feedback_schema.ts` (via `npm run feedback:seed-schema`) provisions the `product_feedback` entity schema in a Neotoma instance.
- **Capability registry** — `config/agent_capabilities.default.json` pins `agent-site@neotoma.io` to `neotoma_feedback` operations only, so the forwarder cannot perform unrelated writes even if its key is used (`docs/subsystems/agent_capabilities.md`).

## Security hardening

- Default Helmet CSP with explicit `connect-src` allow-list via `NEOTOMA_CSP_CONNECT_SRC`.
- Per-user write rate limit (`NEOTOMA_WRITE_RATE_LIMIT_PER_MIN`, default 120/min) plus dedicated OAuth-route limiters.
- Timing-safe equality on operator-secret compares.
- Raw-body capture ahead of JSON parsing so AAuth signature verification operates on the exact bytes clients signed.
- Loopback/local classification uses the socket address, not `Host`.
- AAuth strict mode (`NEOTOMA_AAUTH_STRICT=1`) and optional subject allow-list (`NEOTOMA_STRICT_AAUTH_SUBS`) for deployments that want hard failures or per-tier ACLs.
- Capability registry caps what registered service agents can do, independent of key validity.
- A security audit summary lands at `docs/reports/security_audit_2026_04_22.md`.

## Docs site & CI / tooling

**Docs added or expanded**

- Operator / integrator: `docs/subsystems/agent_attribution_integration.md`, `agent_capabilities.md`, `agent_feedback_pipeline.md`, `feedback_neotoma_forwarder.md`, `feedback_auto_pr_config.json`, `feedback_upgrade_guidance_map.json`; `docs/developer/fleet_onboarding.md`; `docs/architecture/openapi_contract_flow.md`, `docs/architecture/change_guardrails_rules.mdc`; expanded `docs/subsystems/auth.md`, `errors.md`, `sources.md`, `entity_merge.md`; `docs/infrastructure/deployment.md`; `.env.example` grows by ~125 lines documenting the new knobs.
- Agent-author: `docs/developer/mcp/instructions.md`, `docs/developer/cli_agent_instructions.md`, `docs/developer/cli_reference.md`, `docs/developer/mcp/tool_descriptions.yaml`, `AGENTS.md`; field validation and schema-agnostic rules adjusted where new fields required it.
- Contributor / release: `docs/developer/github_release_process.md` (now documents the mandatory Highlights drafting rule), `docs/developer/github_release_supplement.example.md`, `docs/developer/agent_instructions_sync_rules.mdc`, `docs/developer/package_scripts.md`.

**CI / tooling**

- `scripts/openapi_bc_diff.js` + `npm run openapi:bc-diff` — release preflight that enumerates breaking OpenAPI changes vs a base ref.
- `tests/contract/legacy_payloads/` corpus plus `replay.test.ts` — pre-v0.6 request shapes are exercised explicitly on every CI run so future tightenings cannot silently break older clients.
- `scripts/migrate/rename_agent_message_to_conversation_message.ts` — migration helper for stores that want to canonicalize historic chat rows.

## Internal changes

- Middleware stack carries request context, unknown-field validation, AAuth verification, and attribution-aware session plumbing end to end.
- New service areas for agents directory, agent capabilities, attribution policy, entity split, request context, snapshot export, drift comparison, feedback transport (local + HTTP), redaction, next-check computation, and verification-request handling.
- Hook/plugin packages across Cursor, Claude Code, Codex, OpenCode, and the Claude Agent SDK adapter propagate agent/session metadata consistently.
- SQLite adapter and schema registry are updated to persist the new attribution and classification fields.
- Frontend (`frontend/src/components/MainApp.tsx`, `subpages/McpReferencePage.tsx`, `site/repo_info.json`, `site/site_data.ts`) and Inspector (`inspector/` submodule pointer + entity-link component) receive alignment edits for the new chat/attribution contracts.

## Fixes

- Store-resolution failures point callers at missing identity inputs more clearly, reducing silent coalescing and making chat-thread persistence easier to debug.
- Local-only detection uses the connection socket address instead of trusting `Host`, closing a tunneled-request masquerade vector.
- Operator-secret equality checks are timing-safe.
- OpenAPI + generated types + docs are re-synced so the published contract matches runtime behavior (the v0.5.x `attributes`-nested resolver regression class cannot recur silently because the contract is now closed-by-default and exercised by legacy-payload replay).

## Tests and validation

- New integration/unit coverage lands for AAuth attribution stamping, attribution parity across transports, session introspection, observation-source round-trips, agent-runtime schema definitions, drift comparison, request-context handling, unknown-field rejection, anonymous-write policy, agents-directory API, agent-capabilities store, feedback pipeline (happy path, tunnel-down, local vs HTTP, smoke, Simon Apr 21 replay), MCP stdio attribution, record-activity attribution, relationship-attribution API, and observation-source round-trips.
- `tests/contract/legacy_payloads/` exercises v0.4.x, v0.5.x, and v0.6.x request shapes against the current server to guard against silent shape regressions.
- `node scripts/openapi_bc_diff.js --base 'v0.5.1^{commit}'` reports the breaking validation tightenings below; this supplement names each one explicitly with a migration path.
- Existing CLI/unit tests (`cli_api_start_prod_advisory.test.ts`, `cli_api_start_watch_flag.test.ts`, `cli_store_commands.test.ts`, `client_helpers.test.ts`, `entity_resolution.test.ts`, `schema_definitions.test.ts`, `tunnel_auth.test.ts`) were updated to reflect the new defaults.

## Breaking changes

- **`POST /store`, `components.schemas.StoreRequest`, and `components.schemas.StoreStructuredRequest` now reject undeclared top-level fields.** Before: extra root-level keys could pass through the HTTP layer and be silently stripped or ignored later. After: requests with unknown top-level fields fail with HTTP `400`, `error_code: ERR_UNKNOWN_FIELD`, and a structured details payload containing `allowed_fields`, `unknown_fields`, and `json_paths`. Migration: send only declared top-level keys (`entities`, `relationships`, `source_priority`, `observation_source`, `idempotency_key`, file-related fields, `commit`, `strict`, `user_id` as applicable) and move entity-specific data inside the individual `entities[]` objects.
- **`POST /store/unstructured` and `components.schemas.StoreUnstructuredRequest` now reject undeclared top-level fields.** Before: callers could include extra wrapper keys alongside the upload payload. After: HTTP `400` with `error_code: ERR_UNKNOWN_FIELD` and a structured details payload. Migration: limit the body to `file_content`, `mime_type`, `idempotency_key`, `original_filename`, `user_id`.
- **`POST /relationships/snapshot` and `components.schemas.GetRelationshipSnapshotRequest` now reject undeclared top-level fields.** Before: extra keys could slip through until the route-level validator ran. After: rejected earlier with HTTP `400` / `ERR_UNKNOWN_FIELD`. Migration: send only `relationship_type`, `source_entity_id`, `target_entity_id`, `user_id` (the last is newly optional).
- **`POST /mcp/oauth/initiate` and `components.schemas.OAuthInitiateRequest` now reject undeclared top-level fields.** Before: callers could include extra auth-initiation metadata at the request root. After: HTTP `400` / `ERR_UNKNOWN_FIELD`. Migration: restrict requests to `connection_id`, `client_name`, `redirect_uri`.
- **`POST /correct` now rejects undeclared top-level fields.** Before: extra root-level keys were not contractually forbidden at the HTTP boundary. After: HTTP `400` / `ERR_UNKNOWN_FIELD`. Migration: limit the body to `entity_id`, `entity_type`, `field`, `value`, `idempotency_key`, `user_id`.
- **`neotoma api start --env prod` on source checkouts now runs the built runner by default.** Contributors or automation that relied on the old `dev:prod` watcher must switch to `neotoma api start --env prod --watch`. The `dev:prod` npm script alias itself is unchanged.
- **Default Helmet CSP restricts `connect-src` to `'self'`.** Deployments that served browser UI from the API and relied on permissive outbound connections must opt in via `NEOTOMA_CSP_CONNECT_SRC`.
- **Default write rate limit of 120 writes/minute per user/IP.** Bursty writers receive HTTP `429`; tune via `NEOTOMA_WRITE_RATE_LIMIT_PER_MIN` or batch via `store_structured`.
- **Loopback classification changed.** Requests routed through tunnels/proxies are no longer treated as local even when they carry a localhost `Host` header; deployments that relied on this behavior for lightweight dev-auth must switch to AAuth or an explicit allow-list.
