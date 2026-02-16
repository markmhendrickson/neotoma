# Run Neotoma dev servers at login (macOS)

Use a LaunchAgent so the Neotoma dev API (and optional tunnel) starts when you log in and restarts after reboot. You can then run `neotoma` or `neotoma dev` anytime without starting servers manually.

## One-time setup

From the Neotoma repo root:

```bash
npm run setup:launchd-dev
```

This will:

1. Install `~/Library/LaunchAgents/com.neotoma.dev-servers.plist` with your repo path.
2. Create `data/logs` if needed (logs go to `data/logs/launchd-dev-servers.log`).
3. Load the agent so dev servers start immediately.

After reboot, the agent runs again automatically (RunAtLoad + KeepAlive).

## What runs

The agent runs `npm run dev:api` (tunnel + API on port 8080). It sources `.env` from the repo root if present, so `NEOTOMA_*` and tunnel vars are applied.

## Commands

| Action        | Command |
|---------------|--------|
| Load (start)  | `launchctl load ~/Library/LaunchAgents/com.neotoma.dev-servers.plist` |
| Unload (stop) | `launchctl unload ~/Library/LaunchAgents/com.neotoma.dev-servers.plist` |
| Status        | `launchctl list \| grep neotoma` |
| Logs          | `tail -f data/logs/launchd-dev-servers.log` |

## Disable

To stop the dev servers from starting at login:

```bash
launchctl unload ~/Library/LaunchAgents/com.neotoma.dev-servers.plist
```

To remove the agent entirely, unload as above and delete the plist:

```bash
rm ~/Library/LaunchAgents/com.neotoma.dev-servers.plist
```

## Scope

- **macOS only.** LaunchAgents are a macOS feature. On Linux, use a systemd user service or similar.
- **Dev environment only.** This runs the dev API (port 8080). For production-like always-on, you would use a separate plist or process manager.
