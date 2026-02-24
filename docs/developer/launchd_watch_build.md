# Run tsc --watch at login (macOS)

Use a LaunchAgent so `tsc --watch` runs when you log in and after reboot. That keeps `dist/` in sync with source changes, so the global `neotoma` CLI (from `npm link`) always runs the latest build without starting servers or a manual watch process.

## One-time setup

From the Neotoma repo root:

```bash
npm run setup:launchd-watch-build
```

This installs `~/Library/LaunchAgents/com.neotoma.watch-build.plist`, loads it so the watcher starts immediately, and creates `data/logs` for output. After reboot, the agent runs again automatically.

## What runs

At startup the agent runs `npm run build:server` once (full TypeScript compile plus PDF worker copy), then runs `npm run watch:build` (i.e. `tsc --watch`) so `dist/` stays in sync with source. It does not start the API or tunnel. If the watch process exits (e.g. after a fatal error), the script restarts it after a short delay so the watcher is always running.

## Commands

| Action        | Command |
|---------------|--------|
| Load (start)  | `launchctl load ~/Library/LaunchAgents/com.neotoma.watch-build.plist` |
| Unload (stop) | `launchctl unload ~/Library/LaunchAgents/com.neotoma.watch-build.plist` |
| Status        | `launchctl list \| grep neotoma` |
| Logs          | `tail -f data/logs/launchd-watch-build.log` |

## Disable

```bash
launchctl unload ~/Library/LaunchAgents/com.neotoma.watch-build.plist
rm ~/Library/LaunchAgents/com.neotoma.watch-build.plist
```

## Scope

macOS only. The plist runs the script at `scripts/run_watch_build_launchd.sh`, which runs `npm run build:server` once then `npm run watch:build` in the repo.
