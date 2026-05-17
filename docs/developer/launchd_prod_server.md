---
title: Run Neotoma production HTTP API at login (macOS)
summary: "Use a LaunchAgent so `npm run start:server:prod` runs when you log in and restarts after reboot. That npm recipe builds the server, picks an HTTP port from 3180, sets `NEOTOMA_ENV=production`, and runs the same `start:server` entrypoint ..."
---

# Run Neotoma production HTTP API at login (macOS)

Use a LaunchAgent so `npm run start:server:prod` runs when you log in and restarts after reboot. That npm recipe builds the server, picks an HTTP port from 3180, sets `NEOTOMA_ENV=production`, and runs the same `start:server` entrypoint as other environments.

## One-time setup

From the Neotoma repo root:

```bash
npm run setup:launchd-prod-server
```

This installs `~/Library/LaunchAgents/com.neotoma.prod-server.plist`, creates `data/logs` if needed, unloads the agent if it was already loaded, then loads it so the prod-mode server starts or restarts immediately.

Logs: `data/logs/launchd-prod-server.log` and `launchd-prod-server.error.log`.

The wrapper script sources `.env` from the repo root if present before invoking npm.

## Commands

| Action        | Command |
|---------------|--------|
| Load (start)  | `launchctl load ~/Library/LaunchAgents/com.neotoma.prod-server.plist` |
| Unload (stop) | `launchctl unload ~/Library/LaunchAgents/com.neotoma.prod-server.plist` |
| Logs          | `tail -f data/logs/launchd-prod-server.log` |

## Disable

```bash
launchctl unload ~/Library/LaunchAgents/com.neotoma.prod-server.plist
rm ~/Library/LaunchAgents/com.neotoma.prod-server.plist
```

## Scope

- **macOS only.**
- **Not for hosted production** unless you intentionally supervise the binary this way; most deployments use a process manager or container with explicit env and health checks.
- Do not load **both** `com.neotoma.dev-server` and `com.neotoma.prod-server` on the same default HTTP port without configuring `HTTP_PORT` / `.env` so they do not collide.
