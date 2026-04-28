v0.9.0 delivers the bundled Inspector, a unified turn-telemetry pipeline across all hook harnesses, the self-contained local feedback pipeline, and sandbox ephemeral sessions — all aimed at making a fresh `npm install -g neotoma` immediately useful without external configuration.

## Highlights

- **Inspector ships inside the npm package.** `neotoma api start` now serves the Inspector SPA at `/inspector` out of the box — no separate build, no `NEOTOMA_INSPECTOR_STATIC_DIR`, no Docker flag. Operators can disable, relocate, or point at an external Inspector via six new `NEOTOMA_INSPECTOR_*` env vars.
- **Every hook harness reports per-turn telemetry to a single `conversation_turn` entity.** cursor-hooks, opencode-plugin, claude-code-plugin, codex-hooks, and claude-agent-sdk-adapter all accrete onto one `conversation_turn` keyed by `(session_id, turn_id)`, capturing hook events, tool counts, missed steps, compliance status, and — on skipped-store turns — a root-cause classification with recommended repairs. The legacy `turn_compliance` entity is preserved as an alias.
- **Run the full feedback pipeline locally with zero hosted config.** `submit_feedback` now mirrors every submission into a `neotoma_feedback` entity in the local DB. Inspector `/feedback`, `neotoma triage`, and the ingest cron all work end-to-end on a fresh install. Set `NEOTOMA_FEEDBACK_ADMIN_MODE=disabled` to force read-only.
- **Sandbox visitors get ephemeral per-session isolation.** Cookie-based sessions with one-time-code redemption, per-pack seed data, automatic sweep, and full data purge on session end replace the single shared `SANDBOX_PUBLIC_USER_ID`.
- **Docs site restructured for scannability.** Large monolithic pages (Install, Agent Instructions, Evaluate, AAuth Reference) split into focused sub-pages; "Verticals" renamed to "Use Cases" with a new landing shell.

## What changed for npm package users

**CLI (`neotoma`, `neotoma api start`, …)**

- `neotoma api start` now serves the Inspector at `/inspector` by default. The bundled SPA is baked into `dist/inspector/` at publish time via `prepublishOnly`. No env vars required for the default path.
- `neotoma triage --set-status` and `--resolve` now mirror triage changes onto the `neotoma_feedback` entity via `mirrorLocalFeedbackToEntity`, keeping the JSON store and entity graph in sync.
- `tsc --watch --preserveWatchOutput` replaces bare `tsc --watch` in all watch/dev scripts and the CLI's internal `api start` spawner, eliminating the terminal-clearing behavior that made concurrent output unreadable.

**Runtime / data layer**

- New `inspector_mount.ts` service handles the Inspector SPA lifecycle: bundled-first (from `dist/inspector/`), fallback to `NEOTOMA_INSPECTOR_STATIC_DIR`, or external URL via `NEOTOMA_PUBLIC_INSPECTOR_URL`. Live-build mode (`NEOTOMA_INSPECTOR_LIVE_BUILD=1`) re-reads `index.html` on each request and injects a 2-second poll for watch workflows.
- `cookie-parser` added as a runtime dependency for sandbox session management.
- `sandbox_sessions` table added to SQLite schema with bearer-token-hash, one-time-code-hash, pack selection, and expiry tracking. `local_auth_users` gains `is_ephemeral` column for session-scoped users.
- New `conversation_turn` seeded schema (160 lines) in `schema_definitions.ts` with aliases `turn_compliance` and `turn_activity`, composite canonical-name identity `[session_id, turn_id]`, and `reject` collision policy. Includes `instruction_diagnostics` (classification, confidence, reason, signals, recommended_repairs) and `followup_message` fields for compliance diagnosis.
- New `listConversationTurns` and `getConversationTurn` service functions.
- `listRecentConversations` service updated.
- `MCP_INTERACTION_INSTRUCTIONS_FALLBACK` constant exported from `server.ts` — a compact-mode fallback aligned to the critical [TURN LIFECYCLE] / [STORE RECIPES] / [COMMUNICATION & DISPLAY] / [ERRORS & RECOVERY] invariants, replacing the old unstructured inline fallback.
- Feedback admin proxy (`admin_proxy.ts`) reworked for tri-state mode resolution (`hosted` / `local` / `disabled`) with `NEOTOMA_FEEDBACK_ADMIN_MODE` env var. `GET /admin/feedback/preflight` now returns `mode` and `mode_env`. Local-mode routes read/write the JSON store and mirror to entity graph.
- `mirrorLocalFeedbackToEntity` (`src/services/feedback/mirror_local_to_entity.ts`) and `storedFeedbackToEntity` projection (`src/services/feedback/neotoma_payload.ts`) extracted as canonical helpers used by submit, ingest cron, CLI triage, and admin proxy.

**Shipped artifacts**

- `dist/inspector/` is now included in the npm package `files` list. The Inspector SPA is built during `prepublishOnly`.
- `openapi.yaml` — `neotoma_env` field added to the `/mcp/config` response schema.

## API surface & contracts

- `GET /admin/feedback/preflight` response now includes `mode: "hosted" | "local" | "disabled"` and `mode_env: "NEOTOMA_FEEDBACK_ADMIN_MODE"` alongside the existing `configured` boolean.
- `GET /admin/feedback/pending` in `local` mode returns records from `LocalFeedbackStore` with `mode: "local"` in the response body.
- `POST /admin/feedback/:id/status` in `local` mode writes the JSON record and mirrors to `neotoma_feedback` entity. All admin routes still require `hardware` / `software` / `operator_attested` AAuth tier.
- `GET /mcp/config` response now includes `neotoma_env` (resolved `NEOTOMA_ENV` for the running process).
- Sandbox session endpoints: `POST /sandbox/session/new`, `POST /sandbox/session/redeem`, `GET /sandbox/session`, `DELETE /sandbox/session`.

## Behavior changes

- The Inspector is served at `/inspector` by default on every `neotoma api start`. The root landing page links to it. Previously required `NEOTOMA_INSPECTOR_STATIC_DIR` and a separate build step.
- Unconfigured feedback installs default to `local` mode instead of returning `501 admin_proxy_unconfigured`. The 501 is now reserved for `NEOTOMA_FEEDBACK_ADMIN_MODE=disabled`.
- Sandbox mode uses ephemeral per-visitor sessions instead of a single shared `SANDBOX_PUBLIC_USER_ID`. Each visitor gets isolated data seeded from a fixture pack.
- `watch:full` and `watch:full:prod` now include a concurrent Inspector watcher with live-build mode, plus a `dev:resources:watch` lane showing local resource URLs.
- `pack:local` now includes `build:inspector` so local pack testing includes the Inspector.
- GitHub Pages site build fixes root-absolute asset paths (`/assets/…`) instead of relative paths, fixing broken chunk URLs on nested pages.

## Agent-facing instruction changes

- `MCP_INTERACTION_INSTRUCTIONS_FALLBACK` is a compact, structured fallback covering the critical turn lifecycle, store recipes, display rule, and retry policy. Agents connecting to a Neotoma server where `docs/developer/mcp/instructions.md` is unreadable (packaged app, broken path) receive this compact block instead of the old unstructured fallback. The compact block is tested by `tests/unit/mcp_instructions_fallback_invariants.test.ts`.

## Plugin / hooks / SDK changes

All five harness packages received a coordinated rewrite to share the same turn-telemetry and failure-signal architecture:

**cursor-hooks** (TypeScript, +1,624 lines)

- New `session_start.ts` hook: initializes per-turn state, optionally injects compact reminder for small models, seeds recent timeline retrievals.
- `before_submit_prompt.ts`: user message capture and identifier-retrieval warmup. (Cursor drops `additional_context` from this hook; reminders use `sessionStart` and `postToolUse` instead.)
- New `post_tool_use_failure.ts`: captures `tool_invocation_failure` entities for Neotoma-relevant tools, bumps per-`(tool, error_class)` counter on disk.
- `after_tool_use.ts` (renamed from `postToolUse` in docs): `tool_invocation` observation, optional small-model reminder, failure-hint surfacing.
- `stop.ts`: `conversation_message` safety net, compliance backfill with bounded root-cause classification (`instruction_diagnostics`, `diagnosis_confidence`, `recommended_repairs`), classifier-driven `followup_message` for non-compliant turns.
- `_common.ts`: per-turn state management (`NEOTOMA_HOOK_STATE_DIR`), failure-signal accumulator with PII scrub, error classification, small-model detection, `isExpectedNetworkError` downgrade, `ConversationTurnObservationInput` type, `accreteTurn` helper.
- 12+ new env vars: `NEOTOMA_HOOK_STATE_DIR`, `NEOTOMA_HOOK_FEEDBACK_HINT`, `NEOTOMA_HOOK_FEEDBACK_HINT_THRESHOLD`, `NEOTOMA_HOOK_COMPLIANCE_FOLLOWUP`, `NEOTOMA_HOOK_SMALL_MODEL_PATTERNS`, `NEOTOMA_HOOK_SMALL_MODEL_DETECTED`, `NEOTOMA_HOOK_DETECTED_MODEL`, `NEOTOMA_LOCAL_BUILD`, `NEOTOMA_HOOK_CONNECTION_ID`.

**opencode-plugin** (TypeScript, +626 lines)

- Same `isNeotomaRelevantTool` / `scrubErrorMessage` / `classifyErrorMessage` / failure-counter infrastructure.
- Per-turn `conversation_turn` accretion via `recordConversationTurn` from `@neotoma/client`.
- Failure-hint surfacing not available (opencode has no prompt-injection channel); storage-only capture.

**claude-code-plugin** (Python, +354 lines in `_common.py`)

- Shared `is_neotoma_relevant_tool()`, `scrub_error_message()`, `classify_error_message()`, per-session failure counter with 24h TTL.
- `tool_invocation_failure` entity storage. One-shot hint via `user_prompt_submit` additional context.
- All hook entry points (`post_tool_use`, `user_prompt_submit`, `session_start`, `stop`) updated for turn telemetry.

**codex-hooks** (Python, +264 lines in `_common.py`)

- Same Python failure-signal infrastructure. Storage-only (no prompt-injection channel).
- `notify` and `session_end` hooks updated for turn telemetry.

**claude-agent-sdk-adapter** (TypeScript, +372 lines)

- Same TS failure-signal infrastructure. `recordConversationTurn` from `@neotoma/client`.
- `UserPromptSubmit` hook surfaces one-shot failure hint.

**@neotoma/client**

- New `helpers.ts` exports: `ConversationTurnInput` interface and `recordConversationTurn` helper for harness-agnostic turn telemetry writes.

## Docs site & CI / tooling

- **Frontend restructuring**: Large monolithic pages split into focused sub-pages — `AgentInstructionsDisplayPage`, `AgentInstructionsRetrievalPage`, `AgentInstructionsStoreRecipesPage`, `EvaluateAgentInstructionsPage`, `InstallDockerPage`, `InstallManualPage`. New `InstallCodeBlock` component.
- **"Verticals" → "Use Cases"**: `VerticalsIndexPage` / `VerticalIconTile` / `VerticalLandingShell` deleted; replaced by `UseCasesIndexPage` / `UseCaseIconTile` / `UseCaseLandingShell`.
- **GitHub Pages build**: Asset paths normalized to root-absolute `/assets/…` everywhere (fixes broken chunk URLs on nested routes). New `finalizeBundledAssetPathsInAllHtml` pass and `validate_site_export.ts` checks.
- **`pick-port.js`**: New `--print-resources` flag displays local resource URLs (Inspector, MCP, API, UI) alongside port allocation.
- **`show-dev-resources.js`**: New script (and `dev:resources` / `dev:resources:watch` npm scripts) that prints a summary of local dev resource URLs.
- **`watch:full` / `watch:full:prod`**: Now include Inspector watcher (`watch:inspector`) and `dev:resources:watch` as concurrent lanes; `NEOTOMA_INSPECTOR_LIVE_BUILD=1` set automatically.
- **New `eval:tier1` / `eval:tier1:update`**: npm scripts for the Tier 1 agentic eval harness.
- **`--preserveWatchOutput`** added to all `tsc --watch` invocations across npm scripts and CLI internals.

## Internal changes

- `cookie-parser` dependency added for sandbox session cookie handling.
- Dockerfile simplified: Inspector is always built (no `BUILD_INSPECTOR` arg), served at `/inspector` from `dist/inspector/`. `VITE_NEOTOMA_API_URL` and `VITE_PUBLIC_BASE_PATH` build args removed.
- `fly.sandbox.toml` cleaned up: `BUILD_INSPECTOR`, `VITE_NEOTOMA_API_URL`, `VITE_PUBLIC_BASE_PATH`, `NEOTOMA_INSPECTOR_STATIC_DIR`, `NEOTOMA_INSPECTOR_BASE_PATH` removed.
- Sandbox deployment docs (`docs/subsystems/sandbox_deployment.md`) substantially rewritten for ephemeral sessions, pack registry, and updated architecture diagram.
- Hook integration docs (`docs/integrations/hooks/`) rewritten with expanded configuration tables, failure-signal accumulator documentation, and instruction diagnostics section.
- Feedback pipeline docs (`docs/subsystems/agent_feedback_pipeline.md`) expanded with signal sources section, local pipeline mode docs, and Inspector admin proxy tri-state mode.
- Schema snapshots README updated.
- `src/services/root_landing/` updated: `readNeotomaConfigEnvironment`, `parseCookieBearer`, sandbox pack registry integration, Inspector URL resolution via `inspector_mount.ts`.
- New sandbox service files: `pack_registry.ts`, `seeder.ts`, `sessions.ts` under `src/services/sandbox/`.

## Fixes

- GitHub Pages nested-route asset paths fixed (root-absolute `/assets/…` instead of relative `../assets/`).
- `tsc --watch` terminal clearing eliminated across all dev workflows via `--preserveWatchOutput`.
- Feedback admin proxy no longer returns `501` on unconfigured installs; defaults to `local` mode.

## Tests and validation

- `tests/integration/feedback_admin_proxy.test.ts` — extended with tri-state mode resolver, preflight `mode`/`mode_env` fields, and uniform tier-gate verification across hosted/local/disabled modes.
- `tests/integration/root_landing.test.ts` — new (+91 lines), covers landing page context, mode resolution, and Inspector URL integration.
- `tests/services/schema_definitions.test.ts` — new (+41 lines), validates seeded schema definitions including the new `conversation_turn` schema.

## Breaking changes

No breaking changes. The OpenAPI addition (`neotoma_env` on `/mcp/config`) is additive. The old `NEOTOMA_INSPECTOR_STATIC_DIR` / `NEOTOMA_INSPECTOR_BASE_PATH` env vars continue to work as overrides. The `turn_compliance` entity type is preserved as an alias of `conversation_turn`.
