---
title: Github Release Supplement
summary: MCP OAuth connections now support refresh tokens, the docs site adds OpenCode and IronClaw integration guides plus three new operational guides, and the OpenCode plugin adopts the v2 hook API with backward-compatible legacy aliases.
---

MCP OAuth connections now support refresh tokens, the docs site adds OpenCode and IronClaw integration guides plus three new operational guides, and the OpenCode plugin adopts the v2 hook API with backward-compatible legacy aliases.

## Highlights

- **MCP clients stay connected without re-auth.** The `/oauth/token` endpoint now accepts `grant_type=refresh_token`, and the `mcp_oauth` service transparently refreshes expired access tokens against the upstream provider. Local-backend connections mint a fresh local token on refresh.
- **Connect OpenCode and IronClaw to Neotoma.** New integration landing pages (`/neotoma-with-opencode`, `/neotoma-with-ironclaw`) with SEO metadata, routing, and brand icons join the docs site alongside the existing Claude, Cursor, Codex, and OpenClaw guides.
- **Three new operational guides on the docs site.** `/what-to-store` (tiered entity guidance), `/backup` (SQLite + source protection), and `/tunnel` (HTTPS tunnels for remote MCP clients) fill common first-week questions.
- **OpenCode plugin speaks the v2 hook API.** `event()`, `tool.execute.after`, and `experimental.session.compacting` are now the primary entry points; legacy aliases (`session.started`, `message.user`, `tool.called`, `chat.compacted`, `message.assistant`) remain for older OpenCode builds.

## What changed for npm package users

**CLI (`neotoma`, `neotoma api start`, …)**

- No CLI command changes in this release.

**Runtime / data layer**

- `POST /oauth/token` now accepts `grant_type=refresh_token` alongside `authorization_code`. A valid `refresh_token` returns a fresh `access_token` (and optionally a rotated `refresh_token`) without requiring the user to re-authorize through the browser flow.
- `getAccessTokenForConnection` refreshes against the upstream auth provider when a stored access token expires, persisting the new token and (if rotated) the new refresh token in `mcp_oauth_connections`.
- `validateTokenAndGetConnectionId` now checks `access_token_expires_at` and returns a `tokenRefreshFailed` error for expired tokens instead of silently succeeding. Both local-backend and remote-backend paths enforce this check.
- New `refreshAccessToken` export handles the full refresh cycle: find connection by refresh token, exchange with the provider (or mint locally), persist, and return the RFC 6749 token response shape.

**Shipped artifacts**

- `openapi.yaml` — unchanged in the working tree (committed changes in v0.9.1 already shipped the expanded schema).
- `dist/` — rebuilt with refresh-token paths.

## API surface & contracts

- `POST /oauth/token`: new `refresh_token` grant type. Request body: `{ grant_type: "refresh_token", refresh_token: "<token>" }`. Response shape: `{ access_token, token_type, expires_in, refresh_token?, scope? }`.
- No other REST or MCP tool surface changes.

## Behavior changes

- **Token expiry enforcement:** `validateTokenAndGetConnectionId` now rejects expired access tokens instead of returning them. MCP clients that previously relied on a stale token will receive an error prompting refresh. This is a correctness fix, not a breaking change — the prior behavior was silently returning invalid credentials.
- **Site navigation reordered:** Integration items are now alphabetical (ChatGPT, Claude, Claude Code, Codex, Cursor, IronClaw, OpenClaw, OpenCode). "Connect a remote Neotoma" renamed to "Connect remotely". "Expose tunnel" and "What to store first" added to the Getting Started nav group.

## Agent-facing instruction changes

- Agent instruction sync rules, conversation turn docs, and agentic eval subsystem docs were updated in the committed `36efc6e3`. No net-new instruction blocks in the working-tree delta.
- `.claude/` and `.cursor/` rules refreshed: new `checkpoint_management`, `post_build_testing`, `release_detection`, `release_status_readme_update` rules; `image_generation` and `process_feedback` skill removed; `publish` skill added; `create_release` and `release` skills updated for the v0.10.0 workflow.

## Plugin / hooks / SDK changes

**`@neotoma/opencode-plugin`**

- Adopts the OpenCode v2 hook API: `event()` dispatches `session.created`, `session.compacted`, and `message.updated` events; `tool.execute.after` replaces `tool.called`; `experimental.session.compacting` injects the compact Neotoma turn checklist.
- Legacy hooks (`session.started`, `message.user`, `tool.called`, `chat.compacted`, `message.assistant`) remain as aliases so existing OpenCode builds continue to work.
- `message.user` hook now stores a `conversation` entity alongside the user `conversation_message` in a single store call with an inline `PART_OF` relationship, matching the canonical store recipe.
- New `NeotomaClientLike` interface and `client` option enable test-seam injection without a live server.
- `cwd` option and `NEOTOMA_HOOK_STATE_DIR` env var for explicit provenance and hook-state directory overrides.
- Determinism fix: `Date.now()` fallbacks in idempotency keys and session IDs replaced with stable `"unknown"` sentinel values.
- `package.json` gains `keywords`, `author`, `repository`, `homepage`, and `bugs` fields for npm discoverability.
- README rewritten with npm-package install path (`"plugin": ["@neotoma/opencode-plugin"]` in `opencode.json`), `export const Neotoma = neotoma()` pattern, and updated event table.

## Security hardening

- Token expiry is now enforced on read (both local and remote paths), preventing use of expired access tokens that previously passed validation.

## Docs site & CI / tooling

- **New pages:** `/what-to-store` (What to store first), `/backup` (Backup and restore), `/tunnel` (Expose tunnel), `/neotoma-with-opencode` (OpenCode integration), `/neotoma-with-ironclaw` (IronClaw integration).
- **New icons:** `IronClawIcon` and `OpenCodeIcon` SVG components.
- **SEO:** Route metadata entries for all five new pages with title, description, breadcrumb, and keywords.
- **Navigation:** Site nav categories updated — integrations listed alphabetically, Getting Started expanded with What to Store, Backup, and Tunnel entries.
- **Localized site pages:** All 12 language variants regenerated (~3,174 files) reflecting the new pages and nav changes.
- **IronClaw MCP setup guide:** `docs/developer/mcp_ironclaw_setup.md` added.
- **OpenCode hooks doc:** Updated event table and install instructions to match v2 plugin API.
- **Docs reorganization:** MVP planning docs (`FUNCTIONAL_REQUIREMENTS.md`, `MANIFEST_ALIGNMENT_SUMMARY.md`, `MVP_EXECUTION_PLAN.md`, `MVP_FEATURE_UNITS.md`, `MVP_OVERVIEW.md`) moved from `docs/specs/` to `docs/releases/archived/mvp_planning/`.

## Internal changes

- Foundation submodule updated from `14442cbd` to `f3c5c53` (store-neotoma skill, plan_sections_rules, draft-illustration skill, release workflow refinements).
- `.claude/` rules and skills synced with foundation: rules modernized, `setup_symlinks` skill removed in favor of `setup_cursor_copies`, `publish` skill added.
- `.cursor/` skills synced: `create-release` and `draft-illustration` updated with style references.
- Various docs refreshed: ICP profiles, estimation methodology, readme generation framework, development workflow, MCP overview, observation architecture docs, creating feature units, multi-agent orchestration, worker agent template.
- Aspirational release plans for v0.9.0 and v1.0.0 updated.
- `LifecycleDemoStrip`, `SitePageHome2`, and `WhoProfileCardVisual` frontend components added/updated (committed in `36efc6e3`).
- `conversation/v1.3.json` schema snapshot added.

## Fixes

- **Expired token passthrough:** `validateTokenAndGetConnectionId` previously returned connection info for expired access tokens without checking `access_token_expires_at`. Both local-backend and remote paths now reject expired tokens with a clear error.
- **OpenCode plugin determinism:** Replaced `Date.now()` fallbacks in idempotency keys with stable sentinel values, preventing nondeterministic entity resolution.
- **OpenCode plugin orphaned messages:** User messages are now stored with an inline `PART_OF` relationship to the conversation entity in a single store call, preventing orphaned `conversation_message` entities.

## Tests and validation

- `tests/integration/mcp_oauth_token_endpoint.test.ts` — integration tests for the `refresh_token` grant type on the `/oauth/token` endpoint.
- `tests/unit/opencode_plugin.test.ts` — unit tests for the OpenCode plugin v2 hook API and legacy alias dispatch.
- `tests/contract/ironclaw_integration.test.ts` — contract tests for IronClaw MCP integration.

## Breaking changes

- **Token expiry enforcement:** Access tokens that have passed their `access_token_expires_at` are now rejected by `validateTokenAndGetConnectionId`. Previously these would silently succeed. MCP clients should handle the `tokenRefreshFailed` error by refreshing via the new `refresh_token` grant type. This is a correctness fix — the prior behavior was a bug.
- **Ship constraint:** `docs/private/` is untracked and excluded from this release per security policy. Foundation submodule dirty edits (release skill and workflow) will be committed inside the submodule before tagging.
