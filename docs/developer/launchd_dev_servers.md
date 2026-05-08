# Run Neotoma dev HTTP server at login (macOS)

Use a LaunchAgent so `npm run dev:server` starts when you log in and restarts after reboot. This is the HTTP stack only (no tunnel). For remote MCP or HTTPS tunneling, run `npm run dev:server:tunnel` from a terminal when needed.

## One-time setup

From the Neotoma repo root:

```bash
npm run setup:launchd-dev
```

Alias: `npm run setup:launchd-dev-server` (same as `setup:launchd-dev`).

This will:

1. Unload and remove the legacy `com.neotoma.dev-servers` agent if it was installed (that label ran `dev:server:tunnel`).
2. Install `~/Library/LaunchAgents/com.neotoma.dev-server.plist` with your repo path.
3. Create `data/logs` if needed (logs go to `data/logs/launchd-dev-server.log`).
4. Unload `com.neotoma.dev-server` if it was already loaded, then load the agent so the dev server starts or restarts immediately (same pattern as `setup:launchd-issues-sync`).

After reboot, the agent runs again automatically (RunAtLoad + KeepAlive).

## What runs

The agent runs `npm run dev:server`. It sources `.env` from the repo root if present.

The API process is started via `scripts/run-neotoma-api-node-watch.sh`. **Under LaunchAgent** (`scripts/run_dev_server_launchd.sh`), `NEOTOMA_API_WATCH_FORCE_POLL` defaults to `1`, so restarts are driven by **`scripts/run_neotoma_api_chokidar_poll_watch.js`** (chokidar with **polling**). That matches the same failure mode as TypeScript’s native watcher under some LaunchAgent sessions: Node’s `--watch` uses `fs.watch` / FSEvents and can **miss saves**, so the HTTP stack would keep running stale code until a manual bounce. Interactive `npm run dev:server` (no launchd wrapper) still uses **Node’s native watch** (`node --watch-path=… --import tsx …`) so edits under `src/`, `openapi.yaml` when present, and `docs/developer/mcp/**` trigger a restart without the extra polling CPU cost.

Opt out of polling for the launchd-only path (restore Node `--watch` under LaunchAgent): set `NEOTOMA_API_WATCH_FORCE_POLL=0` in the repo `.env` or edit `run_dev_server_launchd.sh` after install. Tune chokidar interval with `NEOTOMA_API_WATCH_POLL_INTERVAL_MS` (milliseconds, default `750`). The plist also sets `TSC_WATCHFILE` / `TSC_WATCHDIRECTORY` so any stacked `tsc --watch` in the same npm tree falls back to polling when needed.

### MCP parity with prod (Cursor / stdio shims)

After `neotoma cli config` (signed or unsigned stdio shims), **`neotoma-dev` and `neotoma` entries set `NEOTOMA_MCP_USE_LOCAL_PORT_FILE=1` and `NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE`** so the shims probe `.dev-serve/local_http_port_dev` / `local_http_port_prod` the same way as documented for prod. Re-run `neotoma cli config --yes` (or your transport preset) after upgrading the CLI so `mcp.json` picks up the env. Optional: keep `npm run setup:launchd-cli-sync` so global `neotoma` + `dist/` stay aligned with `src/` when you are not running only tsx.

Re-install the plist after template changes: `npm run setup:launchd-dev`.

To **reload** an already-installed Neotoma agent without re-running the full installer (after local plist edits or to bounce the process): `npm run reload:launchd-neotoma` from any directory on macOS. That script only touches Neotoma-owned labels under `~/Library/LaunchAgents` (see `scripts/reload_neotoma_launchagents.sh`).

## Commands

| Action        | Command |
|---------------|--------|
| Load (start)  | `launchctl load ~/Library/LaunchAgents/com.neotoma.dev-server.plist` |
| Unload (stop) | `launchctl unload ~/Library/LaunchAgents/com.neotoma.dev-server.plist` |
| Status        | `launchctl list \| grep neotoma` |
| Logs          | `tail -f data/logs/launchd-dev-server.log` |

## Disable

```bash
launchctl unload ~/Library/LaunchAgents/com.neotoma.dev-server.plist
```

Remove the agent entirely:

```bash
rm ~/Library/LaunchAgents/com.neotoma.dev-server.plist
```

## Production-like server

For a separate always-on **built** API in production mode (build + default prod port + `start:server`), see [`docs/developer/launchd_prod_server.md`](launchd_prod_server.md) and `npm run setup:launchd-prod-server`.

## Scope

- **macOS only.** LaunchAgents are a macOS feature. On Linux, use a systemd user service or similar.
- **Dev environment.** This agent does not set `NEOTOMA_ENV=production`. Use the prod LaunchAgent or your own wrapper for that.
