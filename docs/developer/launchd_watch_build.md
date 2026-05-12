# Run tsc --watch at login (macOS)

Use a LaunchAgent so `tsc --watch` runs when you log in and after reboot. The agent also re-links the global `neotoma` command to this checkout using the same Node/npm toolchain that installed the agent, so the CLI on your `PATH` stays pointed at the repo it is rebuilding.

## One-time setup

From the Neotoma repo root:

```bash
npm run setup:launchd-cli-sync
```

(`npm run setup:launchd-watch-build` is the same command.)

This installs `~/Library/LaunchAgents/com.neotoma.watch-build.plist`, loads it so the watcher starts immediately, and creates `data/logs` for output. The installed plist captures the current `node` / `npm` paths so launchd does not drift onto a different Homebrew or system Node than your interactive shell. After reboot, the agent runs again automatically.

## What runs

At startup the agent runs `npm link` once to point the global `neotoma` command at this checkout, runs `npm run build:server` once (full TypeScript compile plus PDF worker copy), then runs `npm run dev:types` (i.e. `tsc --watch`) so `dist/` stays in sync with source. It does not start the API or tunnel. If the watch process exits (e.g. after a fatal error), the script restarts it after a short delay so the watcher is always running.

## Commands

| Action        | Command |
|---------------|--------|
| Load (start)  | `launchctl load ~/Library/LaunchAgents/com.neotoma.watch-build.plist` |
| Unload (stop) | `launchctl unload ~/Library/LaunchAgents/com.neotoma.watch-build.plist` |
| Status        | `launchctl list \| grep neotoma` |
| Logs          | `tail -f data/logs/launchd-watch-build.log` |

The installed plist sets **`TSC_WATCHFILE`** and **`TSC_WATCHDIRECTORY`** to `UseFsEventsWithFallbackDynamicPolling` so `tsc --watch` keeps seeing saves from a LaunchAgent session. The wrapper script also exports the same defaults before running `dev:types`. Re-install after template edits or after switching Node manager / Node version (for example a different `nvm` version): `npm run setup:launchd-cli-sync`.

## Disable

```bash
launchctl unload ~/Library/LaunchAgents/com.neotoma.watch-build.plist
rm ~/Library/LaunchAgents/com.neotoma.watch-build.plist
```

## Scope

macOS only. The plist runs the script at `scripts/run_watch_build_launchd.sh`, which runs `npm run build:server` once then `npm run dev:types` in the repo.

## Related: supervised dev stack scripts

Inspector is built with `vite build --watch` into `dist/inspector` (`NEOTOMA_INSPECTOR_OUT_DIR=../dist/inspector`). For that out-of-package output path, **`inspector/vite.config.ts` enables chokidar polling during `--watch`** so file saves are picked up under LaunchAgents (native watchers often only ran a single build otherwise). Opt out with `NEOTOMA_INSPECTOR_BUILD_WATCH_POLL=0`; tune interval with `NEOTOMA_INSPECTOR_BUILD_WATCH_POLL_INTERVAL_MS` (milliseconds).

To run **`npm run dev:server:tunnel:types`** (tunnel + dev server + embedded `tsc` in concurrently) and **`npm run dev:full:prod`** (prod-mode full stack on 3180 / 5295 / 3101) at login with restart loops, use:

```bash
npm run setup:launchd-watch-stacks
```

That installs the dev HTTP agent (`com.neotoma.dev-server`, `npm run dev:server`) and the watch-build agent, in sequence. Unload `com.neotoma.dev-server` if you use a conflicting interactive `dev:server` / `dev:server:tunnel` stack on the same port. `watch-build` and the dev server both run TypeScript tooling; that overlap is optional—unload `watch-build` if you want a single `tsc` for dev.
