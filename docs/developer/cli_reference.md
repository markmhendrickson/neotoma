# Neotoma CLI reference

## Scope

This document covers CLI commands, options, configuration, and developer facing details. It does not cover MCP behavior or server side implementation beyond public API references.

## Purpose

Provide a complete CLI command reference and developer context for Neotoma CLI behavior.

## Invariants

1. Commands and options MUST match the CLI implementation.
2. Output formatting MUST remain deterministic and stable.
3. Configuration details MUST remain consistent with the CLI config module.

## Definitions

- **Operation ID**: OpenAPI operation identifier used by `neotoma request`.
- **Config path**: The file path where CLI stores connection settings.
- **PKCE**: OAuth Proof Key for Code Exchange used for login.

## Running the CLI

Run via npm scripts: `npm run cli` or `npm run cli:dev` (dev mode with immediate source changes). For global `neotoma` command: `npm run setup:cli` (build and link in one step), or manually `npm run build:server` then `npm install -g .` or `npm link`. If `neotoma` is not found, add `$(npm config get prefix)/bin` to PATH. See [CLI setup](getting_started.md#cli-setup) and [CLI overview](cli_overview.md#installation-and-setup) for full installation and troubleshooting details.

### Keeping the global CLI in sync

The global `neotoma` runs the built files in `dist/`, not the TypeScript source. After you change CLI code, either build once (`npm run build:server`) or run a watcher so the global install stays current:

- **One-off:** `npm run build:server` after CLI changes.
- **Ongoing (terminal):** Run `npm run dev:types` in a terminal. It runs `tsc --watch` so every save recompiles `dist/`; the next `neotoma` invocation uses the new code. With `npm link`, no re-link is needed.
- **Ongoing (after reboot):** Run `npm run setup:launchd-cli-sync` once (alias: `setup:launchd-watch-build`). This installs a macOS LaunchAgent that re-links the global `neotoma` command to the current checkout, runs `tsc --watch` at login, and keeps it running so the global CLI stays in sync even after restart. The agent captures the current `node` / `npm` paths during setup; re-run the setup command after switching Node manager or Node version. Logs: `data/logs/launchd-watch-build.log`. Unload with `launchctl unload ~/Library/LaunchAgents/com.neotoma.watch-build.plist`.

### Dev or prod HTTP at login (macOS)

- **Dev API:** `npm run setup:launchd-dev` (alias `setup:launchd-dev-server`) installs `com.neotoma.dev-server`, which runs `npm run dev:server`. See [`docs/developer/launchd_dev_servers.md`](launchd_dev_servers.md).
- **Built production-mode API:** `npm run setup:launchd-prod-server` installs `com.neotoma.prod-server`, which runs `npm run start:server:prod`. See [`docs/developer/launchd_prod_server.md`](launchd_prod_server.md).

### Scheduled GitHub issues sync (macOS)

Run `npm run setup:launchd-issues-sync` once to install `com.neotoma.issues-sync`: it runs `neotoma issues sync` every 5 minutes (and once at login). Logs: `data/logs/launchd-issues-sync.log`. Optional env for launchd (not in your shell profile): copy `scripts/launchd-issues-sync.env.example` to `data/local/launchd-issues-sync.env`. Unload with `launchctl unload ~/Library/LaunchAgents/com.neotoma.issues-sync.plist`.

### Environment: `neotoma dev` / `neotoma prod`

To target a specific API environment, pass `dev` or `prod` as the first argument or use `--env`.

- `neotoma dev` — development API (port 3080).
- `neotoma prod` — production API (port 3180).

Examples: `neotoma prod`, `neotoma dev`, `neotoma prod storage info`. Equivalent to using `--env`.

### Default: interactive session (use-existing only)

When you run `neotoma` with **no arguments**, source checkout selection follows this precedence:

1. explicit CLI flags (for commands that accept root/path flags)
2. `NEOTOMA_REPO_ROOT`
3. directory-local checkout (walk up from current directory)
4. saved config `project_root` (legacy `repo_root`) in `~/.config/neotoma/config.json`
5. user-level env at `~/.config/neotoma/.env` when no checkout is detected

With a source checkout, the CLI:

1. Uses **use-existing** policy only (no automatic server start).
2. Discovers running API instances from session ports, default ports (`3080`, `3180`), remembered ports, and optional extra configured ports.
3. Applies `--env` as a preference when selecting among multiple detected instances.
4. If multiple candidates remain, prompts you to choose the instance.
5. If none respond, shows fallback startup guidance and the command menu.
6. Enters an **interactive session** with a `neotoma> ` prompt.

**Non-interactive (e.g. agents):** When stdout is not a TTY, the CLI does **not** prompt. It uses **use-existing** (connect only). If **no command** is given and stdout is not a TTY (e.g. an agent runs `neotoma` with no args), the CLI prints: "No command given. Run neotoma <command> (e.g. neotoma entities list). Use neotoma --help for options." and exits with code 1.

**Direct invocation and session parity:** Every action available at the interactive `neotoma>` prompt is available as a direct CLI call: `neotoma <top-level> [subcommand] [options] [args]`. Examples: `neotoma entities list`, `neotoma relationships list <entityId>`, `neotoma storage info`. Agents and scripts should always use direct invocation; do not depend on entering the interactive session. See [CLI overview](cli_overview.md) and the command sections below for the full command tree.

To show the intro and then a **command menu** (prompt `> ` and `? for shortcuts`; no servers), use:

- `neotoma --no-session`
  You get the same intro panel, then an interactive prompt. Type a command, or `?` / `help` to list commands. Type `exit` or `quit`, or press Ctrl+D, to exit.

To enter a session without starting any servers (connect to an already-running API):

- `neotoma --no-servers` or `neotoma --servers=use-existing`
  Connect-only startup. Detects all available local API instances (not only `3080`/`3180`), prefers `--env` matches when available, and prompts when multiple candidates remain.

To start the API in the **background**:

- `neotoma api start --background --env dev` (or `--env prod`)
  Starts the selected environment only and writes env-specific PID/log files.
- `neotoma api start --background --env dev --tunnel` (or `--env prod --tunnel`)
  Starts the API with an HTTPS tunnel (ngrok/cloudflared) for remote MCP access. Tunnel URL is written to `/tmp/ngrok-mcp-url.txt` when ready. Use `--tunnel-provider ngrok` or `--tunnel-provider cloudflare` to force a provider; otherwise the script auto-detects from installed tools.
- `neotoma api start --env dev --tunnel` (or `--env prod --tunnel`, no `--background`)
  Runs the API and tunnel in the **foreground** in the current terminal (same as `npm run dev:server:tunnel`). Logs stream to the terminal; Ctrl+C stops both. Tunnel URL: `cat /tmp/ngrok-mcp-url.txt`.

**`--watch` flag (source checkouts).** The product CLI command remains `neotoma api start`, but source-checkout npm spawn targets now use the `dev:server*` taxonomy. Production-env source checkouts route to `dev:server:prod`; installed-package production starts route to `start:server:prod`.

- `neotoma api start --env prod --watch` — keeps source-checkout watch behavior explicit.
- `neotoma api start --env prod --tunnel` — routes to `dev:server:prod:tunnel`.

The flag is a no-op on `--env dev`, on installed-package checkouts without source watch scripts, and on the `--tunnel` path (the tunnel flow always wants the watcher). The deprecation line is suppressed under `--output json`.

For a real **headless / systemd** production deployment, install the published npm package (`npm install -g neotoma`) and use the recipe in [install.md § Production deployment (headless / systemd)](../../install.md#production-deployment-headless--systemd) rather than `neotoma api start` on a source checkout.

## npm scripts summary

All `npm run <script>` commands in one place. Scripts follow the taxonomy documented in [`docs/developer/npm_scripts.md`](npm_scripts.md): `dev:*` for local development and watch processes, `build:*` for one-shot builds, `start:*` for compiled-`dist` runners, and `info:*` for one-shot informational output. Old `watch:*`, `start:api*`, and pages-site names remain as one-release compatibility aliases.

### Build and start

| Script           | Description                                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `build:server`   | Compile server TypeScript (`tsc`) → MCP, API, CLI, services                                                                                     |
| `build:ui`       | Build frontend (Vite)                                                                                                                           |
| `start:mcp`      | Run built MCP server (stdio)                                                                                                                    |
| `start:server`      | Run built HTTP Actions API                                                                                                                      |
| `start:api`         | Deprecated alias for `start:server`                                                                                                             |
| `start:server:prod` | Run `build:server`, pick HTTP port from 3180, set `NEOTOMA_ENV=production`, then run `start:server` (same `node dist/actions.js` as `start:server`). Does not build UI or run MCP. |
| `start:api:prod`    | Deprecated alias for `start:server:prod`                                                                                                        |
| `start:ws`       | Run MCP WebSocket bridge                                                                                                                        |

### Development (watch mode)

| Script                                       | Port           | Description                           |
| -------------------------------------------- | -------------- | ------------------------------------- |
| `dev:mcp`, `watch`                           | —              | MCP stdio watch                       |
| `dev:server`, `watch:server`                 | 3080           | HTTP Actions API + watch              |
| `dev:ui`, `watch:ui`                         | Vite           | Frontend dev server                   |
| `dev:server:tunnel`                          | 3080           | API + HTTPS tunnel (Cloudflare/ngrok) |
| `dev:server:tunnel:types`                    | 3080           | API + tunnel + `tsc --watch`          |
| `dev`, `dev:full`                            | 3080, Vite, WS | API + UI + build + resource banner + Inspector live build into `dist/inspector` (`NEOTOMA_INSPECTOR_LIVE_BUILD=1`: no long cache + **full page reload** when build output mtimes change — `index.html` plus `assets/*`, so lazy chunks trigger reload). With out-of-package `dist/inspector`, Vite watch uses **chokidar polling** by default so LaunchAgents pick up saves (`NEOTOMA_INSPECTOR_BUILD_WATCH_POLL=0` disables). |
| `dev:full:prod`                              | 3180, Vite, WS | Same as `dev` with `NEOTOMA_ENV=production` and prod-scoped Inspector watch (`dev:inspector:prod`) |
| `dev:inspector`, `dev:inspector:prod`        | —              | Inspector only: `vite build --watch` → repo `dist/inspector` (use with API already running, or rely on `dev` / `dev:full:prod`; polling applies when output is `../dist/inspector` per `inspector/vite.config.ts`) |
| `watch:mcp:dev-shim`, `dev:mcp:dev-shim`     | —              | Stable stdio dev shim that restarts its MCP worker behind the client connection |
| `dev:mcp`                                    | —              | MCP stdio watch                       |
| `dev:mcp:prod`                               | —              | MCP stdio, production env             |
| `dev:server:mcp`                             | 3080, 8280     | API + MCP HTTP + build                |
| `dev:ws`                                     | 3080, 8280     | API + WebSocket bridge watch          |
| `dev:server:prod`                            | 3180           | API + build, production env           |
| `dev:server:prod:tunnel`                     | 3180           | API + tunnel + build, production env  |

Scripts that start servers use the port(s) above when free; if a port is in use, they bind to the next available port (no process killing). See `scripts/pick-port.js`.

### Tunnel and setup

| Script             | Description                                    |
| ------------------ | ---------------------------------------------- |
| `tunnel:https`     | Start HTTPS tunnel only (Cloudflare or ngrok)  |
| `setup:cli`        | Build and link `neotoma` globally              |
| `setup:env-hook`   | Install git hook to copy `.env` into worktrees |
| `copy:env`         | Copy env file into current worktree            |
| `setup:worktree`   | Cursor worktree init                           |
| `setup:data`       | Data directory symlink                         |
| `setup:foundation` | Foundation submodule symlink                   |
| `setup:storage`    | Create storage buckets                         |

### Test and quality

| Script                   | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `test`                   | Run Vitest                                       |
| `test:unit`              | Vitest, skip migrations                          |
| `test:remote`            | Vitest with remote DB tests (RUN_REMOTE_TESTS=1) |
| `test:frontend`          | Vitest for frontend                              |
| `test:integration`       | Integration tests                                |
| `test:agent-mcp`         | Agent MCP tests                                  |
| `test:coverage`          | Vitest with coverage                             |
| `test:coverage:critical` | Coverage for critical paths                      |
| `test:e2e`               | Playwright E2E                                   |
| `test:e2e:headed`        | Playwright E2E, headed browser                   |
| `lint`                   | ESLint (src)                                     |
| `type-check`             | `tsc --noEmit`                                   |
| `validate:coverage`      | Validate coverage map                            |
| `validate:doc-deps`      | Validate doc dependencies                        |
| `validate:mdx-site`      | Validate `docs/site/pages/**/*.meta.json` + MDX siblings and `ROUTE_METADATA` keys |
| `validate:routes`        | Site route parity vs `seo_metadata` / `MainApp`  |
| `doctor`                 | Project health check (env, local SQLite hints)   |

### Database and schema

| Script                  | Description                               |
| ----------------------- | ----------------------------------------- |
| `migrate`               | Run migrations                            |
| `migrate:dry-run`       | Migrations dry run                        |
| `migrate:plans`         | Migrate plans                             |
| `migrate:plans:dry-run` | Migrate plans dry run                     |
| `schema:export`         | Export schema snapshots                   |
| `schema:init`           | Initialize schemas                        |
| `schema:init:dry-run`   | Schema init dry run                       |
| `schema:icons:generate` | Generate schema icons                     |
| `schema:cleanup:test`   | Cleanup test schemas                      |
| `recover:db`            | Check dev SQLite integrity / recover copy |
| `recover:db:prod`       | Check prod SQLite integrity / recover copy |
| `wipe:dev`              | Wipe dev database                         |
| `wipe:prod`             | Wipe prod database                        |
| `wipe:local`            | Wipe local database                       |
| `wipe:*:storage`        | Wipe + storage (e.g. `wipe:prod:storage`) |

### Docs and other

| Script                                 | Description                   |
| -------------------------------------- | ----------------------------- |
| `cli`, `cli:dev`                       | Run Neotoma CLI (built / dev) |
| `docs:generate`                        | Generate docs                 |
| `build:docs`, `dev:docs`, `dev:docs:serve` | Docs site build/dev/serve     |
| `openapi:generate`                     | Generate OpenAPI types        |
| `branches:prune`                       | Prune merged branches         |
| `parquet:samples`                      | Create sample parquet files   |
| `sync:env`                             | Sync env from 1Password       |

For environment and ports, see [Getting started](getting_started.md#start-development-server).

## Command reference

### Global options

- `--base-url <url>`: Override API base URL.
- `--env <env>`: Environment selector (`dev` or `prod`). Required for server commands such as `api start`, `api stop`, `api logs`, and `watch`.
- `--offline`: Force in-process local transport for data commands (no external API process required).
- `--api-only`: Force API-only mode; fail when API is unreachable (use when you want to avoid loading the local DB).
- `--json`: Output machine readable JSON.

### Issues

- `neotoma issues create --title <title> --body <body> [--visibility public|private] [--labels a,b]`: submit an issue through the same orchestration as MCP `submit_issue`. **Reporter environment is required** (v0.12+): the underlying API requires at least one of `reporter_git_sha` or `reporter_app_version`; pass them via the HTTP body when scripting against `/issues/submit`, or set `--reporter-git-sha` / `--reporter-app-version` once the CLI exposes those flags. JSON output includes `guest_access_token` when the configured operator instance accepts the issue; treat that value as a credential for later token-scoped status or message calls. Deprecated hidden alias: `--advisory` maps to `--visibility private` for one minor release and prints `visibility 'advisory' is deprecated; use 'private' instead.` to stderr outside JSON output.
- `neotoma issues message [number] --body <body> [--entity-id <id>] [--guest-access-token <token>]`: append to an issue thread. Use the guest token when the local issue snapshot does not already carry the operator token. On public issue threads, supply at least one of `reporter_git_sha` / `reporter_app_version` to record the build the message was authored against (soft requirement; the server emits a warning when both are missing).
- `neotoma issues status [--entity-id <id> | --issue-number <n>] [--skip-sync] [--guest-access-token <token>]`: print issue metadata and thread messages. At least one of `--entity-id` or `--issue-number` is required. The guest token is only needed for remote operator read-through when it is not already stored on the local issue row.
- `neotoma plans capture <file> | --all`: persist a harness `.plan.md` file (raw markdown source + structured `plan` row + EMBEDS) into Neotoma via the canonical combined `store` path. `--all` walks `.cursor/plans/`, `.claude/plans/`, `.codex/plans/`, `.openclaw/plans/` under the current repo (or `--repository-root <path>`). Optional `--source-message-entity-id`, `--source-entity-id`, `--source-entity-type` link the plan to the prompting message and a source entity (e.g. an `issue`). See [`docs/subsystems/plans.md`](../subsystems/plans.md).
- `neotoma plans list [--source-entity-id <id>] [--status <s>] [--harness <h>] [--limit <n>]`: list `plan` entities filtered by source / status / harness. Wraps `POST /retrieve_entities`.
- `--pretty`: Output formatted JSON.
- `--no-session`: With no arguments, show intro then command menu (prompt `> `, `? for shortcuts`). No servers started.
- `--no-servers`: With no arguments, enter session with connect-only behavior.
- `--tunnel`: Start HTTPS tunnel (ngrok/cloudflared) with server start commands.
- `--tunnel-provider <provider>`: Force tunnel provider to `ngrok` or `cloudflare` when using `--tunnel`; default is auto-detect from installed tools.
- `--no-update-check`: Disable the update availability check. When enabled (default), the CLI checks the npm registry for a newer version and, if available, prints a one-line notice to stderr. The notice is never shown when `--json` is used.

### Runtime overrides (precedence: flag > env > default)

CLI behavior can be pinned per invocation via flags or across invocations via environment variables. Every runtime override follows the same precedence: explicit flag > environment variable > default.

| Flag | Environment variable | Purpose |
|------|----------------------|---------|
| `--api-only` | `NEOTOMA_API_ONLY` | Force API-only transport; fail if API is unreachable. |
| `--offline` | `NEOTOMA_OFFLINE` | Force in-process local transport; do not contact a remote API. |
| `--env <env>` | `NEOTOMA_ENV` (`development` / `production`) | Environment selector for server lifecycle commands. |
| `--root <path>` | `NEOTOMA_REPO_ROOT` | Source-checkout root when `neotoma` is run with no args. |
| `--user-id <id>` | `NEOTOMA_USER_ID` | Pin the user scope for read-verb requests (`entities`, `observations`, `relationships`, `timeline`, `schemas`, `sources`, `stats`, `list-recent-changes` (alias `recent`), `memory-export`). The flag wins per call; the env var acts as a session-wide pin; the server falls back to the authenticated user when both are unset. |

`--offline` and `--api-only` are mutually exclusive; setting both (via flag or env) raises an error at startup.

`NEOTOMA_USER_ID` must be non-empty when set — an empty or whitespace-only value causes the CLI to fail fast with a clear error rather than silently falling back to the authenticated user. Resolution is performed by `resolveEffectiveUserId()` in `src/cli/index.ts`.

Any new runtime override must follow this precedence model: add the env var read in the `preAction` hook in `src/cli/index.ts` alongside the existing transport variables, use a `NEOTOMA_`-prefixed name, let an explicit flag override it, and document it in the table above. See `docs/architecture/change_guardrails_rules.mdc` for the cross-cutting guardrails.

### Peer sync and HTTP API (server process)

These are read by the Neotoma HTTP server (not the CLI `preAction` hook) for outbound peer sync and optional release-note enrichment:

| Environment variable | Purpose |
|----------------------|---------|
| `NEOTOMA_PUBLIC_BASE_URL` | Public base URL of this API (no trailing slash). Required for `POST /peers/{id}/sync` outbound `/sync/webhook` as `sender_peer_url`. |
| `NEOTOMA_LOCAL_PEER_ID` | Stable id this instance sends as `sender_peer_id`; must match the `peer_id` your counterparty stored for you. |
| `GITHUB_TOKEN` | Optional bearer for GitHub API when `npm_check_update` runs with `include_release_notes: true`. |

`GET /peers/{peer_id}` returns `remote_health` from probing `{peer_url}/health` and semver compat vs the local package version (same rules as `neotoma compat`). See `docs/subsystems/peer_sync.md`.

### MCP signed shim (`mcp.json` — not CLI `preAction`)

Cursor reads these from the **`env`** block for **`run_neotoma_mcp_signed_stdio_dev_shim.sh`** (they are **not** parsed by `neotoma` CLI `preAction`; document them here for discoverability).

| Environment variable | Values | Purpose |
|----------------------|--------|---------|
| `NEOTOMA_MCP_USE_LOCAL_PORT_FILE` | `1` / `true` | **Shim:** read `<repo>/.dev-serve/local_http_port_<dev|prod>` (and legacy `local_http_port` for dev) after HTTP bind, then set `MCP_PROXY_DOWNSTREAM_URL` after a successful TCP probe. **CLI:** `resolveBaseUrl()` uses the same rules and probe (after session port env, before `config.json` `base_url`). Repo root order: `NEOTOMA_PROJECT_ROOT`, then `project_root` / `repo_root` in `~/.config/neotoma/config.json`, then `cwd`. |
| `NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE` | `dev` / `prod` | Which port file the shim and CLI prefer when `NEOTOMA_MCP_USE_LOCAL_PORT_FILE` is on; preset A sets this per MCP slot for parallel dev + prod APIs. If unset, CLI infers from `NEOTOMA_ENV`; shim reads legacy `local_http_port` only. |
| `NEOTOMA_MCP_PORT_PROBE_MS` | integer ms (200–5000, default 1200) | TCP probe timeout for the port file in both the shim and the CLI. |
| `MCP_PROXY_DOWNSTREAM_URL` | URL | Explicit downstream `/mcp`; used when port-file mode is off, or as fallback when the file is missing / probe fails. |

Details, defaults, and verification steps: **`docs/developer/mcp/proxy.md`**.

### Update check (stderr notice)

When the CLI runs in an interactive context (TTY, not `--json`), it may check the npm registry for a newer version of the package. If an update is available, it writes one or two lines to **stderr only** (e.g. "Update available: neotoma 0.2.15 → 0.2.16" and "Run: npm i -g neotoma@latest"). The check is fire-and-forget and does not block startup. To disable: set `NO_UPDATE_NOTIFIER=1` or pass `--no-update-check`. The check is also skipped when `CI` is set. Cache: `~/.config/neotoma/update_check.json` with a 24-hour TTL so the registry is not queried on every run.

### Session (interactive prompt)

- `neotoma session`: Start an interactive session with a persistent `neotoma> ` prompt. Run subcommands (e.g. `storage info`, `api status`) without restarting the CLI. Similar to a native shell or IDE command prompt. Does **not** start servers automatically.
  - Type `help` to list commands.
  - Type `/` to open the live command list (command + description per line), and keep typing to filter matches.
  - Type `exit` or `quit`, or press Ctrl+D, to end the session.
  - Arguments with spaces can be quoted: `request --operation "GET /api/entities"`.
  - Maintenance invariant (TTY redraw): slash suggestions are rendered on the next line with a leading newline, so cursor-up must move `rendered_lines + 1`. See `getSlashSuggestionCursorUpLines()` and `tests/cli/cli_session_startup_ux.test.ts` (regression guard).

### Offline support matrix

- **Data commands (entities, relationships, sources, observations, timeline, store, schemas, stats, corrections, snapshots):** offline-first in-process local transport by default (no API server required).
- **Explicit local path:** pass `--offline`.
- **Strict remote path:** pass `--api-only`.
- **Server lifecycle commands (`api start|stop|status|logs`):** server-management behavior is unchanged and not redirected to local fallback.
- **Local OS inspection (`processes list|kill`):** uses `ps` only; does not use the Neotoma API or offline SQLite transport.
- **Watch/storage/logs/backup:** already local backend commands and continue to run without a running API.

**Transport default rationale:** The CLI defaults to offline-first so that data commands work without a running API (e.g. `neotoma entities list` works right after `neotoma init`). The native SQLite addon is lazy-loaded only when a data command actually uses the local DB, so entry points that never touch the DB (e.g. `neotoma --help`, `neotoma api start`) do not trigger macOS permission prompts. The first time a user runs a data command, the local DB may be opened and the OS may show a one-time permission prompt for the native addon; this is an accepted tradeoff for out-of-the-box usability. Use `--api-only` if you want to avoid loading the local DB and require the API instead.

**Examples:**

```bash
# Session only (no servers; use when API is already running)
neotoma session
# neotoma> storage info
# neotoma> api status
# neotoma> exit

# Session with dev + prod servers (same as running `neotoma` with no args)
neotoma session --servers
```

### Initialization

- `neotoma init`: Initialize Neotoma for first-time use. Creates data directories, initializes the SQLite database, and can prompt to create encryption keys for privacy-first mode. Default flow is auto-detection-first: if a source checkout is detected, init targets project `.env`; otherwise it configures user `.env` at `~/.config/neotoma/.env` without prompting for a source path. Source-path prompts only appear in personalization mode. In interactive mode (TTY), init can prompt to set `OPENAI_API_KEY` for LLM extraction. Init can also delegate harness setup through the same MCP and CLI instruction path used by `neotoma setup`.
  - `--data-dir <path>`: Custom data directory path. Default: `./data` (if in repo) or `~/neotoma/data` (if installed globally).
  - `--force`: Overwrite existing configuration.
  - `--skip-db`: Skip database initialization.
  - `--skip-env`: Skip interactive `.env` creation and variable prompts (e.g. for CI or non-interactive use).

**Example:**

```bash
# Basic initialization
neotoma init

# Initialize with custom data directory
neotoma init --data-dir /path/to/data
```

**What it creates:**

- Data directories: `<data-dir>/`, `<data-dir>/sources/`, `<data-dir>/logs/` (event log is `<data-dir>/logs/events.log`)
- SQLite database: `<data-dir>/neotoma.db` (with WAL mode enabled)
- Encryption key (if user chooses key-derived auth when prompted): `~/.config/neotoma/keys/neotoma.key` (mode 0600).
- Environment file target: project `<checkout>/.env` when checkout is detected, otherwise `~/.config/neotoma/.env`

### Harness setup

- `neotoma setup`: One-shot, idempotent harness setup. It runs init when needed, configures MCP entries, applies agent CLI instruction files, installs lifecycle hooks or the Claude Code plugin for the selected harness, then patches permission allowlists where the harness supports them.
  - `--tool <claude-code|cursor|codex|openclaw|claude-desktop>`: Target harness. If omitted, `doctor` supplies the current tool hint when available.
  - `--install-scope <project|user|both>`: Scope for MCP entries and agent CLI instruction files.
  - `--scope <project|user|both>`: Permission-file scope only. This is intentionally separate from `--install-scope`.
  - `--mcp-transport <a|b|c|d>`: Same transport presets as `neotoma mcp config`.
  - `--rewrite-neotoma-mcp`: Rewrite existing Neotoma MCP entries in the selected install scope.
  - `--skip-hooks`: Skip lifecycle hook/plugin installation.
  - `--all-harnesses`: Infer hook-capable harnesses from MCP configs and install hooks for all of them. The default remains one harness via `--tool` or the `doctor` hint.
  - `--dry-run`: Plan the setup without writing files.
  - `--yes`: Suppress prompts in init, MCP config, CLI instruction config, and hook install paths.
  - `--skip-permissions`: Skip permission-file writes.

`neotoma setup` writes a structured report when the global `--output json` flag is active. The report includes `steps[]`, `permission_patches`, `doctor_before`, `doctor_after`, and `overall_ok`, which lets agent-led installs show exactly what changed.

Use `neotoma setup --tool <harness> --yes` for the normal greenfield path. Use `neotoma mcp config` or `neotoma cli config` when only one layer needs repair.

### Reset

- `neotoma reset`: Reset local Neotoma state to a clean slate.
  - Backs up and removes local Neotoma state (config/env/keys/instructions and known local data directories).
  - Always backs up a data directory before removing it.
  - If `.env` sets `NEOTOMA_DATA_DIR`, that configured data directory is protected: reset does not back it up or remove it.
  - Cleans Neotoma MCP entries from user/project MCP configs.
  - Attempts global uninstall via `npm uninstall -g neotoma` (best effort; failures are reported but do not roll back completed local cleanup).
  - `-y, --yes`: Skip confirmation prompt.

### Authentication

CLI uses the same auth patterns as MCP and REST API. Local CLI commands can run without login in development, but MCP OAuth now requires key-auth preflight.

- `neotoma auth status`: Show auth mode (none, dev-token, key-derived) and user details. Works without prior login.
- `neotoma auth login`: OAuth PKCE flow for MCP Connect (Cursor) setup. Browser flow requires key authentication (`/mcp/oauth/key-auth`) first. Use `--tunnel` to read the API base URL from `/tmp/ngrok-mcp-url.txt` (for testing OAuth when the API is behind a tunnel).
- `neotoma auth logout`: Clear stored OAuth credentials (MCP Connect only).
- `neotoma auth mcp-token`: Print MCP auth token derived from private key (when encryption is enabled). Add to mcp.json headers.
- If key-authenticated OAuth is unavailable, configure `Authorization: Bearer <NEOTOMA_BEARER_TOKEN>` for MCP instead of OAuth.

- `neotoma inspector admin unlock`: Redeem a feedback-admin challenge via the same CLI AAuth signer used for signed API traffic; prints an Inspector URL to **`/feedback/admin-unlock?challenge=…`** (and optional `--open`). Omit `--challenge` to mint one from the API. When the Inspector dev server runs on another origin, set `NEOTOMA_INSPECTOR_BASE_URL` or pass `--inspector-base`. Use `--skip-browser-url` to suppress the printed link in text mode. When the HTTP API binds a non-default port, set **`NEOTOMA_MCP_USE_LOCAL_PORT_FILE=1`** and **`NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE`** when needed (same rules as the MCP signed shim) so `--base-url` resolution reads the matching `.dev-serve/local_http_port_*` file after a successful TCP probe; set **`NEOTOMA_PROJECT_ROOT`** if the file lives outside `cwd`.

### Access Policies

- `neotoma access list`: Show effective non-default guest access policies. Resolution follows env var > SchemaMetadata > deprecated config fallback > default; text output includes the winning source.
- `neotoma access set <entity_type> <mode>`: Set a schema metadata guest policy when the schema exists, falling back to the deprecated config file only when SchemaMetadata is unavailable.
- `neotoma access reset <entity_type>`: Clear any deprecated config fallback for the entity type and set schema metadata to the default `closed` policy when the schema exists. If an environment override still wins, output reports the remaining effective mode/source.
- `neotoma access enable-issues`: Set `issue`, `conversation`, and `conversation_message` to `submitter_scoped`.
- `neotoma access disable-issues`: Reset `issue`, `conversation`, and `conversation_message` to effective `closed` policy, subject to any env override.

### MCP configuration

Commands for managing MCP server configuration files (Cursor, Claude Code, Windsurf, etc.). The CLI uses symmetric verbs: `guide` is read-only guidance; `config` mutates files.

- `neotoma mcp guide`: Show MCP configuration guidance for Cursor and other clients.
  - `--no-check`: Skip checking for existing MCP config files (default: check and suggest `mcp config` if servers are missing).
  - Prints example JSON config for Cursor with URL or stdio server entries.
  - After printing config, scans current directory for MCP config files and suggests running `neotoma mcp config` if dev or prod servers are missing.

- `neotoma mcp config`: Scan for MCP config files in current directory and subdirectories, detect whether dev and prod Neotoma servers are configured, and offer to install missing servers.
  - `--rewrite-neotoma-mcp`: After you pick install scope and transport, rewrite **existing** `neotoma-dev` / `neotoma` (or Claude Desktop `mcpsrv_*`) entries in that scope to match the preset. Without this flag, configs that already have both slots are skipped so transport changes only apply where something was still missing.
  - `--user-level`: Include user-level MCP config paths (e.g. `~/.cursor/mcp.json`, Claude, Windsurf) in scan (default: project-local only).
  - `--install-hooks` / `--no-hooks`: Install or skip matching Neotoma lifecycle hooks when a configured MCP path maps to a hook-capable harness. Hook installation is enabled by default for non-JSON runs; use `--no-hooks` to limit the command to MCP config only.
  - `--yes`: Skip hook installation confirmation prompts. MCP server config prompts still follow the normal interactive flow.
  - `--mcp-transport <a|b|c|d>`: Transport preset. TTY installs prompt when omitted; non-TTY defaults to `b`.

**MCP transport presets:**

| Preset | Use when | Notes |
| --- | --- | --- |
| `a` | You want signed HTTP `/mcp` proxy entries with AAuth attribution. | Requires a reachable Neotoma API for each configured slot (`neotoma-dev` → dev, `neotoma` → prod). |
| `b` | You want the lowest-friction local MCP setup. | Default. Packaged npm installs launch Neotoma directly over stdio; source checkouts use the unsigned dev shim. |
| `c` | You explicitly want direct stdio entries. | Best for simple local clients that do not need HTTP proxy parity. |
| `d` | You want both MCP slots to point at prod HTTP `/mcp`. | Signed proxy path; requires prod API reachability. |
  - Scans for known config file patterns:
    - **Cursor:** `.cursor/mcp.json`, `.mcp.json` (project), `~/.cursor/mcp.json` (user-level with `--user-level`)
    - **Claude Code:** `claude_desktop_config.json` (project or user-level with `--user-level`):
      - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
      - Linux: `~/.config/Claude/claude_desktop_config.json`
      - Windows: `%APPDATA%\Claude\claude_desktop_config.json`
    - **Windsurf:** `mcp_config.json` (project or user-level with `--user-level`):
      - macOS/Linux: `~/.codeium/windsurf/mcp_config.json`
      - Windows: `%APPDATA%\Codeium\Windsurf\mcp_config.json`
  - For each found config, checks for `neotoma-dev` and `neotoma` server entries (based on `command` script names or `url` patterns). In Claude Desktop's `claude_desktop_config.json`, new entries use `mcpsrv_neotoma_dev` and `mcpsrv_neotoma`, and legacy `neotoma-dev` / `neotoma` keys are reported for repair because Claude Desktop validates server IDs as UUIDs or `mcpsrv_*` tags.
  - If any config is missing dev or prod servers, prompts to add them with absolute script paths.
  - If no config files found, offers to create `.cursor/mcp.json` in current directory.
  - Uses Neotoma source root (from `findRepoRoot`, config, or `NEOTOMA_REPO_ROOT`) to resolve absolute script paths for the selected transport. Preset `a` emits signed shim / `mcp proxy --aauth` with dev+prod downstreams as above; `b` emits unsigned dev shim; `c` emits direct stdio scripts; `d` emits signed shim with prod downstream for both MCP server entries.
  - After install, verifies or installs lifecycle hooks for hook-capable harnesses inferred from the configured MCP paths (for example `.cursor/mcp.json` → Cursor hooks, `.codex/config.toml` → Codex hooks). Harnesses without an auto-installer print the matching manual instruction.
  - After install, shows a reminder to run `neotoma cli config`; when MCP servers are installed interactively, it can also prompt to add CLI instructions if missing.
  - `neotoma mcp check` is retained as a deprecated alias for `neotoma mcp config` during the migration window.

**MCP transport presets:**

- **A:** signed shim + AAuth. Installs **both** `neotoma-dev` and `neotoma`: dev slot → dev API `http://127.0.0.1:3080/mcp` (default when `neotoma-dev` omits `MCP_PROXY_DOWNSTREAM_URL`, matching `run_neotoma_mcp_signed_stdio_dev_shim.sh`), prod slot → prod API `http://127.0.0.1:3180/mcp` (via `scripts/run_neotoma_mcp_signed_stdio_dev_shim.sh` or packaged `neotoma mcp proxy --aauth`). Requires matching API processes to be reachable.
- **B (default):** unsigned/local stdio. Packaged npm installs launch `dist/index.js` directly over stdio so local MCP does not require a separate API process; source checkouts use `scripts/run_neotoma_mcp_stdio_dev_shim.sh`, and prod entries add `NEOTOMA_ENV=production`.
- **C:** direct stdio. Uses `scripts/run_neotoma_mcp_stdio.sh` for dev and `scripts/run_neotoma_mcp_stdio_prod.sh` for prod. Reconnect the MCP client after code changes.
- **D:** signed prod parity. Signed shim with `MCP_PROXY_DOWNSTREAM_URL=http://127.0.0.1:3180/mcp` for **both** slots (including `neotoma-dev`), so both MCP entries hit the prod HTTP `/mcp` when the prod API is on the default port.

**Dev vs Prod detection patterns:**

- **Dev:** `command` contains `run_neotoma_mcp_stdio.sh`, `run_neotoma_mcp_stdio_dev_watch.sh`, `run_neotoma_mcp_stdio_dev_shim.sh`, `run_neotoma_mcp_signed_stdio_dev_shim.sh`, `run_neotoma_mcp_unsigned_stdio_dev_shim.sh`, or the legacy forwarder `run_neotoma_mcp_unsigned_stdio_proxy.sh` under a dev server id, or `url` contains `localhost:3080/mcp` or `127.0.0.1:3080/mcp`. During connect-only sessions, the currently selected instance port is also considered for dev if the active env is dev.
- **Prod:** `command` contains `run_neotoma_mcp_stdio_prod.sh`, `run_neotoma_mcp_stdio_prod_watch.sh`, `run_neotoma_mcp_signed_stdio_dev_shim.sh`, `run_neotoma_mcp_unsigned_stdio_dev_shim.sh`, or the legacy forwarder `run_neotoma_mcp_unsigned_stdio_proxy.sh` under a prod server id / prod downstream URL, or `url` contains `localhost:3180/mcp`, `127.0.0.1:3180/mcp`, or `neotoma.fly.dev/mcp`. During connect-only sessions, the currently selected instance port is also considered for prod if the active env is prod.

**Example workflow:**

```bash
# Show config guidance and check if servers are configured
neotoma mcp guide

# Scan project-local MCP configs and add missing servers
neotoma mcp config

# Scan including user-level configs (Cursor, Claude, Windsurf)
neotoma mcp config --user-level

# Deterministically install direct stdio entries without the transport prompt
neotoma mcp config --user-level --mcp-transport c

# Configure MCP and install matching hooks without hook prompts
neotoma mcp config --user-level --yes

# Interactive: refresh user-level Cursor/Claude JSON entries to transport D even when dev+prod already exist
neotoma mcp config --rewrite-neotoma-mcp
```

### CLI instructions (prefer MCP when available, CLI as backup)

Commands to ensure agent instructions tell agents to use the Neotoma CLI when running locally and MCP when remote. Like MCP, `guide` is read-only and `config` mutates files:

- `neotoma cli guide`: Show guidance for adding the "prefer MCP when available, CLI as backup" rule to Cursor, Claude, and Codex (project: `.cursor/rules/`, `.claude/rules/`, `.codex/`; user: `~/.cursor/rules/`, `~/.claude/rules/`, `~/.codex/`). Does not modify files.
- `neotoma cli config`: Scan only paths that each IDE actually loads (applied paths). Reports Cursor, Claude, and Codex separately and, with `--yes`, writes missing or stale files to the selected scope.
  - `--scope <project|user|both>`: Choose where to apply instruction files. This is separate from `neotoma setup --scope`, which controls permission-file patches.
  - `--yes`: Apply without prompting. Without `--yes`, the command reports what would change.
- `neotoma cli-instructions config` and `neotoma cli-instructions check` are deprecated aliases for `neotoma cli guide` and `neotoma cli config`.
- `neotoma instructions print`: Print the first fenced code block from `docs/developer/mcp/instructions.md` bundled with this package (same text MCP sends to clients). Use `--format md` to wrap output in a markdown fence, or `--json` with global JSON output mode for `{ path, body }`.
  - `--user-level` / `--no-user-level`: Include or exclude user-level paths in scan (default: include).

See `docs/developer/agent_cli_configuration.md` for the rule text and strategy.

### Entities

- `neotoma entities list`:
  - `--type <entityType>`
  - `--search <query>`
  - `--limit <n>`
  - `--offset <n>`
  - `--include-merged`
- `neotoma entities get <id>`
- `neotoma entities search [identifier]`:
  - Preferred: positional `identifier` or `--identifier <id>`
  - Compatibility alias: `--query <id>` (equivalent to `--identifier`)
  - If both `--identifier` and `--query` are provided, they must match

### Sources

- `neotoma sources list`:
  - `--search <query>`
  - `--mime-type <mimeType>`
  - `--limit <n>`
  - `--offset <n>`

### Observations

- `neotoma observations list`:
  - `--entity-id <id>`
  - `--entity-type <type>`
  - `--limit <n>`
  - `--offset <n>`

### Relationships

- `neotoma relationships create --source-entity-id <id> --target-entity-id <id> --relationship-type <type>`: Create one relationship.
  - `--metadata <json>`: attach relationship metadata.
  - `--file <path>`: create a batch from a JSON array, or an object with `relationships: [...]`. Each entry uses `relationship_type`, `source_entity_id`, `target_entity_id`, and optional `metadata`.
- `neotoma relationships list <entityId>`:
  - `--direction <direction>`: inbound, outbound, or both
- `neotoma relationships get-snapshot <relationshipType> <sourceEntityId> <targetEntityId>`: Get relationship snapshot with provenance (observations). Relationship type is one of: PART_OF, CORRECTS, REFERS_TO, SETTLES, DUPLICATE_OF, DEPENDS_ON, SUPERSEDES, EMBEDS.
- `neotoma relationships restore <relationshipType> <sourceEntityId> <targetEntityId>`: Restore a deleted relationship (creates restoration observation). Optional: `--reason <reason>`.

### Timeline

- `neotoma timeline list`:
  - `--start-date <date>`
  - `--end-date <date>`
  - `--event-type <type>`
  - `--entity-id <id>`: Filter by entity ID
  - `--user-id <userId>`: Filter by user ID (default: authenticated user)
  - `--limit <n>`
  - `--offset <n>`
  - `--order-by <column>`: `event_timestamp` (default, document dates) or `created_at` (when the timeline row was written)

### Schemas

- `neotoma schemas list`
- `neotoma schemas get <entityType>`

### Peers

Cross-instance peer sync. Backed by `src/services/sync/` and the HTTP `/peers` surface; see [`docs/subsystems/peer_sync.md`](../subsystems/peer_sync.md) for the underlying model and the env vars (`NEOTOMA_PUBLIC_BASE_URL`, `NEOTOMA_LOCAL_PEER_ID`) required on the API process.

- `neotoma peers add --peer-id <id> --name <name> --url <url> --types <csv>`: Register a peer.
  - `--direction <push|pull|bidirectional>` (default `bidirectional`).
  - `--sync-scope <all|tagged>` (default `all`). With `tagged`, only entities whose snapshot lists this peer in `sync_peers` are eligible.
  - `--auth-method <shared_secret|aauth>` (default `shared_secret`).
  - `--shared-secret <secret>`: HMAC peer secret when `auth-method=shared_secret`.
  - `--peer-public-key-thumbprint <thumbprint>`: Expected AAuth thumbprint when `auth-method=aauth`.
  - `--conflict-strategy <last_write_wins|source_priority|manual>` (default `last_write_wins`).
  - `--target-user-id <id>`: Receiver `user_id` on the peer instance.
- `neotoma peers list`: List configured peers.
- `neotoma peers status <peer_id>`: Show peer config plus `remote_health` (probed `{peer_url}/health`) and semver compatibility vs the local package version.
- `neotoma peers sync <peer_id>`: Run a bounded bilateral catch-up against the peer (push local changed observations, pull remote snapshots through `/sync/entities`).
  - `--limit <n>`: Cap observations / snapshots per direction.
- `neotoma peers remove <peer_id>`: Deactivate the peer (does not delete prior `observation_source: "sync"` rows).

### Interpretations

- `neotoma interpretations list`: List interpretation runs.
  - `--source-id <id>`: Filter by source.
  - `--limit <n>` / `--offset <n>`: Pagination.
- `neotoma interpretations create --source-id <id> --entities <path>`: Create an interpretation row for an existing source from agent-extracted flat entities.
  - `--interpretation-config <json>`: Audit configuration such as extractor type/version, model, prompt hash, schema version, and agent notes.
  - `--relationships <path>`: Optional JSON array of relationship refs to create after entity observations.
  - `--idempotency-key <key>`: Optional replay-safe operation key.

### Store

- `neotoma store`:
  - Preferred structured input: `--entities <json>` or `--file <path>`
  - Compatibility alias: `--json=<json>` maps to structured `--entities` for backward compatibility.
    - Use `--json=` (equals, no space) so the payload is parsed as entities input.
    - Bare `--json` (without `=`) remains the global output-format flag.
  - `--file <path>`: Path to JSON file containing entity array. Use for long payloads.
  - `--interpretation-source-id <id>` / `--interpretation-source-ref <structured|unstructured>` plus `--interpretation-config <json>`: Opt into Source -> Interpretation -> Observation provenance for source-derived extraction. Omit for ordinary already-structured/chat-native facts.
  - Silent-failure guard (v0.5.1+): when a commit-mode store returns `entities_created=0`, no resolved entities, and is not an idempotency replay (`replayed: true`), the CLI emits a non-fatal stderr warning so agents/humans don't mistake an empty result for success. Typical root cause: fields nested under `attributes` (see v0.5.0 breaking change) or mismatched `user_id` scope.
  - Idempotency replays: `POST /store` returns `replayed: true` when a request is a deterministic re-commit of a previously committed `(user_id, idempotency_key)` tuple. Use this to distinguish "same call, no new work" from "call produced zero entities."

### Ingest

- `neotoma ingest`: Atomic structured-entities + source-file ingest (composes `/store`).
  - `--entities <path>` (required): JSON file containing the entity array extracted by the caller.
  - `--source-file <path>` (required): Raw source artifact (PDF, transcript, CSV, etc.) attached as provenance.
  - `--user-id <id>` / `--idempotency-key <key>` / `--file-idempotency-key <key>`: same semantics as `neotoma store`.
  - `--plan` / `--dry-run`: Preview planned actions without committing.
  - `--strict`: Refuse silent merges (schema `canonical_name_fields` must match, or `--target-id` must be supplied).
  - `--source-upload` (v0.5.1+): Force base64 upload of the source file via `file_content`. Use this when the CLI and API run on different machines so the server can't read the CLI's local filesystem.
  - `--source-content` (v0.5.1+): Alias for `--source-upload`.
  - Auto-upload (v0.5.1+): when the resolved base URL is non-localhost (anything other than `localhost`, `127.0.0.1`, `::1`, `0.0.0.0`), the CLI automatically switches from `file_path` to `file_content` so remote deployments work without any flag. Localhost base URLs continue to send `file_path` so the server reads the artifact directly from disk.
  - Upload size limit: the server caps JSON bodies at 10 MB (`express.json({ limit: "10mb" })`). Accounting for base64 overhead (~1.37×), the CLI refuses to upload source files larger than ~7.5 MB with a clear error pointing operators at a localhost API as the alternative.

### MCP/CLI parity note

For chat persistence recipes, MCP and CLI use the same underlying store contract. In CLI examples:
- entity lookup supports positional identifier, `--identifier`, and compatibility alias `--query`
- structured store supports preferred `--entities`/`--file` and compatibility alias `--json=<json>`

### Upload

- `neotoma upload <path>`: Store an unstructured file (raw upload with optional AI interpretation).
  - `--no-interpret`: Skip AI interpretation after store.
  - `--idempotency-key <key>`: Idempotency key (default: content hash).
  - `--mime-type <type>`: MIME type (default: inferred from extension).
  - `--local`: Run store and interpretation in-process without starting or connecting to the API server. Uses the same `.env`, database, and storage backend as the server. Requires `neotoma init` to have been run. Encryption-off only (local dev user) for MVP. Example: `neotoma upload --local invoice.pdf`.

### Analyze

- `neotoma analyze <filePath>`

### Stats

- `neotoma stats`

### Watch (local backend only)

- `neotoma watch`: Stream record changes (entities, observations, sources, etc.) as they happen. Uses local dev user when encryption is off (no login needed).
  - `--interval <ms>`: Polling interval in ms (default: 400).
  - `--json`: Output NDJSON (one JSON object per line).
  - `--human`: Output one sentence per change (e.g. "Created person \"George\"", "Updated relationship \"wife\" for person \"Alice\" with person \"Bob\""). No timestamps, emoji, or IDs.
  - `--tail`: Only show changes from now (skip existing records).
  - When encryption is on, set `NEOTOMA_KEY_FILE_PATH` or `NEOTOMA_MNEMONIC`.

### Processes (local OS only)

- `neotoma processes list` (default for `neotoma processes`): Scan `ps` for processes whose argv matches Neotoma checkout paths, `tsx watch src/actions.ts`, `run-neotoma-api-node-watch.sh` / `node --watch-path` + `src/actions.ts`, `run_neotoma_mcp*.sh`, `run_watch_build_launchd.sh`, `mcp proxy`, orchestrator (`pick-port` / `concurrently`), `tsc --watch`, `esbuild`, Cursor hooks under the repo, etc. **TCP listen ports** per PID come from a single `lsof -nP -iTCP -sTCP:LISTEN -F pn` pass (comma-separated in the PORTS column, `-` when none); if `lsof` is missing or fails, PORTS stays `-`. Text mode adds **ENV** (`dev` \| `prod` \| `mix` \| `?`) and **CAT** (comma-separated tags: `server`, `mcp`, `build`, `orchestrator`, `tunnel`, `tooling`, `other`) inferred heuristically from argv and listen ports; a footer line explains the encoding. The full `ps` command line is **word-wrapped within the COMMAND column** to the current terminal width (continuation lines are blank under the fixed columns so COMMAND stays aligned). `--json` prints `{ "processes": [...] }` with `ports` (number array), `env_hint`, `categories` (string array), and each full `command` on one line.
- `neotoma processes servers`: Same `ps` + `lsof` scan as `list`, but only rows with category **`server`** (not limited to default HTTP ports). Rows are **deduplicated by server stack**: all processes in a connected parent-child chain that share the same stack context are collapsed into a single row showing the PID that actually holds the TCP listener (or the deepest child when no listener is detected). Prints a compact table: **PID** (the representative listener PID for the stack), **ENV** (resolved `NEOTOMA_ENV` when readable, otherwise inherited from the nearest connected server/orchestrator stack when the stack is unambiguous, else the same heuristic as `list`), **PORT** (all TCP listen ports visible anywhere in that connected server stack, comma-separated, with **`3080`** / **`3180`** listed first when present; `-` when none of the connected rows expose a listener), **LAUNCHAGENT** (macOS LaunchAgent label inferred from the process ancestry, plist path, or known launchd wrapper / `npm run ...` entrypoint such as `com.neotoma.dev-server`; `-` when not inferable), **DATA_DIR** (`NEOTOMA_DATA_DIR` from procfs or argv on the PID itself, otherwise inherited from the connected server stack when available, else `-`), **LOGS** (best-effort deduped paths: default event log per `src/config.ts` when data dir / `NEOTOMA_EVENT_LOG_*` overrides are known, app **`NEOTOMA_LOGS_DIR`** or data-relative `logs` / `logs_prod` when distinct from the parent directory of the event log, **`~/.config/neotoma/logs/api.log`** (dev) or **`logs_prod/api.log`** (prod) for `neotoma api start --background`, optional repo **`data/logs/session.log`** / `session.prod.log` when **`NEOTOMA_PROJECT_ROOT`** is set). `--watch` keeps the table running and refreshes it every few seconds until interrupted; use `--interval <ms>` to override the default 3000 ms cadence. In `--json --watch` mode it emits one JSON object per refresh line with `refreshed_at`. Plain `--json` prints `{ "servers": [ { "pid", "neotoma_env", "port", "launchagent", "data_dir", "log_paths" } ] }` (`log_paths` is a string array; `port` is comma-separated).
- `neotoma processes kill <pids...>`: One or more PIDs as separate tokens (e.g. `neotoma processes kill 92450 18852`) or a single comma/space string in quotes. Re-runs the same classifier; **only PIDs that appear in a fresh scan** are signalled (prevents typos from killing unrelated processes). Default signal is **SIGTERM**; use `--signal SIGKILL` when needed. `--dry-run` prints the plan. On a TTY, prompts once unless `--force`. Non-TTY requires `--force`.

### Mirror

- `neotoma mirror enable`: Enable the markdown mirror under `<NEOTOMA_DATA_DIR>/mirror/` and run an initial rebuild.
  - `--path <dir>`: Override mirror root.
  - `--git`: Enable git-backed history (`git init` on the mirror path, one commit per write batch). Requires the optional `simple-git` dependency (installed by default).
  - `--kinds <list>`: Comma-separated kinds to mirror (`entities,relationships,sources,timeline,schemas`, default all).
  - `--gitignore`: After enabling, append the resolved mirror path to the enclosing git repo's `.gitignore` (idempotent). No-op when the mirror path is not inside a repo. Equivalent to running `neotoma mirror gitignore` after `enable`.
  - `--no-gitignore`: Explicit form for `--yes` scripts that want to leave `.gitignore` alone (default).
- `neotoma mirror disable`: Disable mirror write-through. Does not delete existing files.
- `neotoma mirror rebuild`: Regenerate the mirror from SQLite.
  - `--kind <entities|relationships|sources|timeline|schemas|all>` (default `all`).
  - `--entity-type <type>`, `--entity-id <id>`: Scope rebuild to a type or single record.
  - `--clean`: Remove stale mirror files within the targeted scope that this rebuild did not produce.
- `neotoma mirror status`: Print current mirror config, file counts per kind, and whether git is enabled.
- `neotoma mirror gitignore`: Idempotently append the resolved mirror path to the enclosing git repo's `.gitignore`, under a `# Neotoma markdown mirror` comment. The helper walks up from the mirror path to find the enclosing `.git` directory; it never prompts for a path and never writes to a repo it did not detect. When the mirror path is not inside a repo, it exits 0 with a "not inside a git repo" message. Use `--json` to get the structured result (`repo_root`, `gitignore_path`, `entry`, `added`, `already_present`).

The mirror is a derived artifact: SQLite is the only source of truth. Mirror files carry a header warning that manual edits will be overwritten on the next write. To edit an entity, use `neotoma edit <id>` or the Inspector (see below). The mirror defaults to disabled; activation offers it as an opt-in (see [`install.md`](../../install.md#activation-step-66-offer-markdown-mirror-opt-in)). See `docs/subsystems/markdown_mirror.md` for layout, determinism, and git semantics.

### Edit

- `neotoma edit <id>`: Open the entity snapshot as YAML in `$EDITOR`, diff on save, and submit changed fields as one batch correction (one `correct()` observation per changed field, applied atomically).
  - `--set field=value` (repeatable): Non-interactive edit. No editor invoked. Same batch backend, same concurrency prompt.
  - `--force`: On optimistic-concurrency conflict, overwrite without prompting (non-interactive use).
  - Editor fallback order: `$EDITOR`, then `$VISUAL`, then `vi`.
  - Optimistic concurrency: captures `last_observation_at` on load. If a newer observation exists at save time, the CLI prints conflicting fields and prompts `[r]ebase / [o]verwrite / [a]bort`.
  - On validation failure, the draft file is preserved under `~/.config/neotoma/edit-drafts/<entity_id>-<ts>.yaml` and the path is printed so the user can rerun `neotoma edit <id>`.

The CLI and the Inspector share one `applyBatchCorrection` backend (`src/services/batch_correction.ts`), so both surfaces have identical semantics.

### Memory export

- `neotoma memory-export`: Write a single `MEMORY.md` file with bounded, deterministic contents for agent harnesses that consume file-based memory.
  - `--path <path>` (default `MEMORY.md`): Output path.
  - `--limit-lines <n>` (default 200): Hard line cap. When exceeded, output is truncated with a `<!-- fold: N entities not shown -->` marker. Set to `0` to include every entity with no line cap.
  - `--include-types <list>`: Comma-separated entity types to include. Omit to include all types (minus bookkeeping).
  - `--exclude-types <list>`: Comma-separated entity types to exclude. Applied on top of the default bookkeeping filter.
  - `--include-bookkeeping`: Include chat bookkeeping (`conversation`, `agent_message`). Excluded by default because they are noise in a memory manifest and already live in conversation history.
  - `--max-field-chars <n>` (default 400): Per-field character cap for long string values. Long bodies (posts, notes, transcripts) are truncated with a deterministic `… (<N> chars truncated)` suffix so one long entity cannot consume the entire line budget. Set to `0` to emit full values.
  - `--order <importance|recency>` (default `importance`): Sort strategy.
    - `importance`: type-weighted signal score `typeWeight × log2(observation_count + 2) × recency_decay` (half-life 30 days). Tier-1 types (`task`, `contact`, `event`, `transaction`, `business_opportunity`, `issue`, `user_persona_insight`, `life_tenets`, `architectural_decision`, `agent_decision`, `release`, `feature_unit`) rank above Tier-2 durable artifacts (`note`, `post`, `meeting_transcription`, `email_message`, `location`, `file_asset`, etc.). Bookkeeping types score 0 when included explicitly.
    - `recency`: `last_observation_at desc`, ties broken by `entity_id asc`.
  - `--user-id <id>`: Scope to a specific user. Defaults to the active local dev user when encryption is off.

`MEMORY.md` is regenerated automatically after each mirror batch when `mirror.memory_export.enabled` is set in `~/.config/neotoma/config.json`.

### Storage

- `neotoma storage info`: Show where CLI config and server data are stored (file paths and backend).
  - Local backend (only supported backend): prints `data_dir`, `sqlite_db` (default `data/neotoma.db` in development, `data/neotoma.prod.db` in production), `raw_sources` (e.g. `data/sources`), `event_log` (e.g. `data/logs/events.log`), `logs` (e.g. `data/logs`). Paths are resolved from current directory when run from a Neotoma source checkout, or from `NEOTOMA_PROJECT_ROOT` / `NEOTOMA_DATA_DIR` and other env overrides.
- `neotoma storage set-data-dir <dir>`: Update repo `.env` with `NEOTOMA_DATA_DIR=<dir>`, and optionally copy SQLite DB files (`neotoma.db`, `neotoma.prod.db`, and `-wal`/`-shm` sidecars) from the old data directory.
  - For durable SQLite storage on macOS, prefer a local-only path such as `~/Library/Application Support/neotoma/data` over iCloud-synced `Documents`, `Desktop`, or `iCloud Drive` folders.
  - Interactive mode asks whether to copy DB files.
  - When DB files exist in both old and new directories, conflict handling is:
    - `merge`: back up target DB files, then insert missing rows from old DBs into target DBs.
    - `overwrite`: back up target DB files, then replace target DB files with old DB files.
    - `use-new`: keep target DB files unchanged and only switch `NEOTOMA_DATA_DIR`.
  - Old directory files are always preserved (copy/merge only, never delete old DB files).
  - Options:
    - `--move-db-files` / `--no-move-db-files`
    - `--on-conflict <merge|overwrite|use-new>`
    - `--yes` (skip prompts)
  - `--json` output includes backup paths, copied files, conflict strategy, and merge stats.
- `neotoma storage merge-db`: Merge one SQLite DB file into another.
  - Required:
    - `--source <path>`: Source DB file.
    - `--target <path>`: Target DB file.
  - Options:
    - `--mode <safe|keep-target|keep-source>`:
      - `safe` (default): fail when matching primary keys contain differing row values.
      - `keep-target`: insert missing rows; keep target rows on conflicts (`INSERT OR IGNORE` behavior).
      - `keep-source`: insert/replace source rows into target (`INSERT OR REPLACE` behavior).
    - `--dry-run`: Analyze conflicts and merge impact without writing the target DB.
    - `--no-recompute-snapshots`: Skip post-merge snapshot recomputation.
  - Behavior notes:
    - Default mode is safety-first (`safe`) to avoid silent row loss on conflicts.
    - Post-merge recomputation rebuilds `entity_snapshots` and `relationship_snapshots` when those tables exist.
    - This command merges DB rows only; it does not copy `sources/` files or log directories. Use backup/restore or storage migration workflows when file assets must move with DB content.
- `neotoma storage recover-db`: Check SQLite integrity and optionally write a recovered copy via `sqlite3 .recover`.
  - Default: check only. Exits non-zero when corruption is detected.
  - `--recover`: write a new sibling file such as `neotoma.prod.recovered-<timestamp>.db`.
  - `--output <path>`: explicit recovered DB path.
  - Behavior notes:
    - Requires `sqlite3` on `PATH`.
    - Does not replace the live DB automatically.
    - Stop Neotoma (MCP/API) before running `--recover`.
    - After a successful recover, manually archive the live `.db` / `-wal` / `-shm` and then copy the recovered file into place.
    - If corruption recurs, run `neotoma doctor --json`; the `data.risks` block flags cloud-synced data directories and prior repair artifacts.

### Doctor

- `neotoma doctor`: Project health check. Verifies that the global CLI is on `PATH`, that `NEOTOMA_DATA_DIR` and the SQLite db are usable, whether a local API process is running, which MCP server entries the configured harnesses expose, and whether the data directory is on a high-risk filesystem.
  - `--json`: Emit a structured report instead of the human summary. Designed for agent-led installs (`neotoma setup --output json` consumes it) and for CI/operator scripts.
  - `--tool <claude-code|cursor|codex|openclaw|claude-desktop>`: Override the current-tool hint that `doctor` ships in the report and that `neotoma setup` reads.

  **`--json` shape (v0.12+):**

  ```jsonc
  {
    "version": "0.12.0",                  // installed neotoma version
    "cwd": "/Users/.../repos/neotoma",
    "global_cli": {
      "node_on_path": true,
      "resolved_via": "global-bin" | "fallback" | "missing",
      "which_neotoma": "/usr/local/bin/neotoma" | null,
      "global_bin": "/usr/local/bin",
      "global_package_dir": "/usr/local/lib/node_modules/neotoma",
      "npm_global_root": "/usr/local/lib/node_modules",
      "path_fix_hint": null | "Add /usr/local/bin to your PATH"
    },
    "data": {
      "config_dir": "/Users/.../.neotoma",
      "data_dir": "/Users/.../Library/Application Support/neotoma/data",
      "db_exists": true,
      "initialized": true,
      "risks": [
        // 0..N entries — see "data.risks codes" below
      ],
      "suggested_safe_data_dir":
        "/Users/.../Library/Application Support/neotoma/data" | null
    },
    "api": {
      "running": true,
      "env": "dev" | "prod" | null,
      "port": 3080,
      "pid": 12345,
      "base_url": "http://127.0.0.1:3080"
    },
    "mcp_servers_detected": {
      "cursor": { "path": "~/.cursor/mcp.json", "has_neotoma": true, "has_neotoma_dev": false }
      // …one entry per harness probed (cursor, claude_code, codex, claude_desktop, openclaw)
    },
    "cli_instructions": {
      "project": { "cursor": true, "claude": false, "codex": false },
      "user":    { "cursor": true, "claude": false, "codex": false }
    },
    "permission_files": { /* per-harness file existence + allow-list match */ },
    "current_tool_hint": "cursor" | null,
    "hooks": { /* HooksReport — installed hooks by harness */ },
    "mirror": { /* MirrorReport — mirror clone state */ },
    "suggested_next_step":
      "install" | "init" | "configure-mcp" | "configure-cli-instructions" |
      "configure-permissions" | "activate" | "offer-hooks" | "offer-mirror" | "ready"
  }
  ```

  **`data.risks[]` entry shape:**

  ```jsonc
  {
    "code": "icloud_drive"
          | "macos_synced_desktop_or_documents"
          | "prior_sqlite_repair_artifacts",
    "severity": "warn",
    "message": "<human-readable description>",
    "suggested_action": "<single concrete next command>"
  }
  ```

  The risk detector (`detectDataDirRisks` in `src/cli/doctor.ts`) covers three classes:

  - **`icloud_drive`** — `NEOTOMA_DATA_DIR` resolves inside `~/Library/Mobile Documents/`. iCloud Drive can re-upload `neotoma.db`, `neotoma.db-wal`, and `neotoma.db-shm` while Neotoma is writing, which is the corruption shape behind the SQLite `recover-db` flow. `suggested_action` points at the suggested local-only path returned by `suggested_safe_data_dir`.
  - **`macos_synced_desktop_or_documents`** — data dir sits under `~/Documents` or `~/Desktop`, both of which macOS enables for iCloud Drive sync by default. `suggested_action` is the matching `neotoma storage set-data-dir "<safe path>" --move-db-files` invocation.
  - **`prior_sqlite_repair_artifacts`** — the data directory contains marker files (`repair_backups/`, `repair_swaps/`, `recover-errors.log`, or `db_corrupt_before_swap_*`) left behind by a previous `neotoma storage recover-db` run. A recurrence is a signal to move the data dir to local-only storage.

  **`suggested_safe_data_dir`** is computed by `suggestSafeDataDir(os.homedir())`. On macOS it is `~/Library/Application Support/neotoma/data`; on other platforms it returns `null` and the report only contains `risks` without a generated suggestion. The field is `null` whenever `data.risks` is empty.

  **Migration command**: when `data.risks` is non-empty, an operator (or `neotoma setup` acting on their behalf) can move the data dir with:

  ```bash
  neotoma storage set-data-dir "<suggested_safe_data_dir>" --move-db-files
  ```

  Cross-references: [`docs/foundation/local_install.md`](../foundation/local_install.md) §§ data-dir hygiene, [`docs/security/threat_model.md`](../security/threat_model.md) `## Operator hardening knobs`, and the `recover:db` script in `### Database and schema` above.

### Snapshots

Fleet-general write-integrity tooling built on the canonical snapshot layer. `snapshots check` / `snapshots request` operate on the runtime snapshot tables; `snapshots export`, `snapshots diff`, and `snapshots parsers` power the fleet-neutral drift workflow described in `docs/releases/in_progress/v0.6.0/` (item 3: snapshot export + drift comparison).

- `neotoma snapshots check`: Check for stale entity snapshots.
  - `--auto-fix`: Also recompute stale snapshots in place.
- `neotoma snapshots request`: Request snapshot recomputation for stale snapshots.
  - `--dry-run`: Check only; do not recompute.
- `neotoma snapshots export`: Export entity snapshots as fleet-neutral JSON (schema_version `0.1.0`) with per-field provenance, an `observation_source` histogram, and an `attribution_fingerprint` roll-up per entity.
  - `--entity-types <csv>`: Restrict to comma-separated entity types (e.g. `agent_task,agent_attempt`).
  - `--agent-sub <sub>`: Restrict to a single AAuth `agent_sub`.
  - `--attribution-tier <tier>`: Restrict to one tier — `hardware | software | unverified_client | anonymous`.
  - `--observation-source <kind>`: Restrict to one write kind — `sensor | llm_summary | workflow_state | human | import`.
  - `--since <iso>`: ISO-8601 lower bound on `last_observation_at`.
  - `--limit <n>`: Cap on returned entities (default: 500).
  - `--out <path>`: Write the export to this file instead of stdout.
  - `--user-id <id>`: Override user scope (flag > `NEOTOMA_USER_ID` > authenticated user).
  - Output shape: `{ schema_version, exported_at, filter, total_entities, entities[] }`.
- `neotoma snapshots diff`: Compare a Neotoma export against an external-state snapshot via a pluggable `ExternalParser`. Defaults to the identity `json` parser; fleet-specific parsers register via `registerExternalParser` in `src/services/drift_comparison.ts`.
  - `--neotoma <path>` (required): Path to a `snapshots export` JSON file.
  - `--external <path>` (required): Path to the external-state snapshot file.
  - `--parser <name>`: External parser name (default: `json`; list via `snapshots parsers`).
  - `--out <path>`: Write the drift report to this file instead of stdout.
  - Report shape: `{ summary, missing_in_neotoma[], missing_in_external[], field_diffs[], provenance_gaps[] }`. `provenance_gaps` flags entities with unclassified `observation_source` or anonymous / unverified_client attribution even when field values agree.
- `neotoma snapshots parsers`: List registered external parsers available to `snapshots diff`.

Fleet round-trip example (AIBTC Lumen, LangGraph, custom adapters all follow the same shape):

```bash
neotoma snapshots export --entity-types agent_task,agent_attempt --out ./neotoma.json
# produce a NormalizedExternalSnapshot from whatever your fleet keeps on disk
neotoma snapshots diff --neotoma ./neotoma.json --external ./fleet.json --parser json
```

### Backup and restore

- `neotoma backup create`: Create a backup of the local database, sources, and logs.
  - `--output <dir>`: Output directory (default: `./backups`).
  - `--tar`: After the directory backup is verified, also create `<backup-folder-name>.tar.gz` in the same parent directory as the backup folder (GNU/BSD `tar` on `PATH` required). The timestamped directory is kept; the archive is an additional artifact for transport.
  - Creates a timestamped subdirectory with `neotoma.db`, WAL file, `sources/`, `logs/` (includes `events.log`), and a `manifest.json` with checksums.
  - **Human output** prints **backup size** first (total bytes on disk for the backup directory, file count, and raw byte count; with `--tar`, the same line also includes the `.tar.gz` size). Then **Backed up from**, **Contents**, **Sizes** (per-component breakdown; the directory total is labeled **total (directory)**), **db_checksum** when recorded. With `--tar`, also an **Archive** line for the `.tar.gz` path and size.
  - **JSON output** (`--json`) includes **`backup_size`**: `{ bytes, files, human }` for the backup directory walk (same totals as `sizes.total_backup_bytes` / `total_backup_files`, plus a single `human` summary string). With `--tar`, `backup_size` also has `archive_bytes` and `human` includes the archive. Other fields: `manifest_path`, `backed_up_from`, `sizes`, and with `--tar` `archive_path`, `archive_bytes`, `sizes.archive_bytes`.
  - Exits non-zero if the database copy is missing or under 1 KiB after write, or if `--tar` was set and creating the archive failed.
  - If encryption is enabled, data in the backup remains encrypted. Preserve the key file or mnemonic for restore.
- `neotoma backup verify <dir>`: Verify a backup directory (manifest, DB size, optional SHA-256 vs manifest). Exits non-zero if invalid. **Human** and **`--json`** both include **`backup_size`** (`bytes`, `files`, `human`) for the full directory tree on disk.
- `neotoma backup restore`: Restore a backup into the data directory.
  - `--from <dir>`: Backup directory to restore from (required).
  - `--target <dir>`: Target data directory (default: `NEOTOMA_DATA_DIR` or `./data`).

### Logs

- `neotoma logs tail`: Read persistent log files.
  - `--decrypt`: Decrypt encrypted log lines using `NEOTOMA_KEY_FILE_PATH` or `NEOTOMA_MNEMONIC`.
  - `--lines <n>`: Number of lines to show (default: 50).
  - `--file <path>`: Specific log file (default: latest in env-specific `data/logs`; prod uses `data/logs_prod`).

### Developer scripts

- `neotoma dev list`: List available npm scripts from `package.json`.
- `neotoma dev <script>`: Run a script from `package.json` (equivalent to `npm run <script>`).
- `neotoma dev run <script>`: Run a script by name (same as `neotoma dev <script>`).
- Use `-- <args>` to pass through extra arguments to the npm script.
- The source checkout is found by: explicit CLI inputs (where supported), then `NEOTOMA_REPO_ROOT`, then walking up from the current directory, then saved config `project_root` (legacy `repo_root` is still read).

### Debugging and testing (e.g. with an agent)

- **When debugging CLI-related issues, always check the CLI log first.** In dev the default path is `~/.config/neotoma/cli.log`. If the user passed `--log-file`, check that path. For session server output, check `<repo>/data/logs/session.log` (dev) or `session.prod.log` (prod). The same file is used whether the API was started by the CLI or by the MCP server (both append); look for "started by MCP" in the log to see who started a given run. For background API, check `neotoma api logs` or `~/.config/neotoma/logs/api.log`. See **Where to look for what (logs)** in `docs/operations/troubleshooting.md` for a per-component log map.
- **Dev** (default): CLI appends stdout and stderr to `~/.config/neotoma/cli.log`. Use `--no-log-file` to disable.
- **Prod** (`NEOTOMA_ENV=production`): No log file by default; use `--log-file <path>` to enable.
- `--log-file <path>`: Append CLI output to this path (overrides env default).
- `--no-log-file`: Do not write to the log file (dev only; prod has no default log file).
- `--debug`: Emit detailed initialization logs to stderr when starting a session.

### OpenAPI request

- `neotoma request --operation <id>`:
  - `--params <json>`: JSON object with `{ path, query, body }`.
  - `--body <json>`: JSON body override.
  - `--query <json>`: JSON query override.
  - `--path <json>`: JSON path override.
  - `--skip-auth`: Skip auth token for public endpoints.

## Configuration and storage paths

The CLI stores configuration in:

- `~/.config/neotoma/config.json`

To see where server data is stored (SQLite path, raw sources dir, etc.), run:

- `neotoma storage info`

Fields:

```
{
  "base_url": "http://localhost:3080",
  "access_token": "redacted",
  "token_type": "bearer",
  "expires_at": "2026-02-01T12:00:00Z",
  "connection_id": "redacted"
}
```

## Deterministic output

The CLI sorts object keys before outputting JSON. This keeps output stable between runs.

## Diagrams

```mermaid
flowchart TD
    cli[CLI] -->|"Read config"| config[ConfigFile]
    cli -->|"Call API"| api[HttpApi]
    api -->|"JSON response"| cli
```

## Examples

### Request by OpenAPI operation ID

```
neotoma request --operation listEntities --params '{"query":{"limit":5}}' --pretty
```

### Store entities from a file

```
neotoma store --file ./fixtures/tasks.json
```

### Stream record changes alongside MCP actions

```
neotoma watch --tail --json   # NDJSON, only new changes
neotoma watch --tail --human  # Plain one-line-per-change, only new
neotoma watch --tail          # Human-readable, only new changes
neotoma watch --human         # Plain one-line-per-change, no technical formatting
neotoma watch                 # Human-readable, includes existing records on startup
```

## Testing requirements

1. Verify each command prints deterministic JSON output.
2. Validate auth login flow against local server.

## Agent Instructions

### When to Load This Document

Load this document when updating CLI commands, options, or configuration behavior.

### Required Co-Loaded Documents

- `docs/NEOTOMA_MANIFEST.md`
- `docs/conventions/documentation_standards.md`
- `docs/api/rest_api.md`

### Constraints Agents Must Enforce

1. Commands and flags MUST match the CLI implementation.
2. Config path and fields MUST be accurate.
3. Examples MUST use synthetic data.

### Forbidden Patterns

- Listing commands that do not exist
- Using real tokens or private values
- Omitting required sections

### Validation Checklist

- [ ] Purpose, Scope, Invariants, Definitions present
- [ ] Commands and options match CLI implementation
- [ ] Config path and fields are accurate
- [ ] Agent Instructions included
