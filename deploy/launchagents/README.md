# Neotoma launchagents

macOS launchd agents that run the Neotoma server stack on login.

## Agents

| Label | Template | What it runs | Auto-restart |
|---|---|---|---|
| `com.neotoma.prod-server` | `com.neotoma.prod-server.plist.tmpl` | Production API server (`npm run start:prod`) | yes (`KeepAlive`) |
| `com.neotoma.dev-server` | `com.neotoma.dev-server.plist.tmpl` | Development API server (`npm run dev`) | yes (`KeepAlive`) |
| `com.neotoma.issues-sync` | `com.neotoma.issues-sync.plist.tmpl` | GitHub ↔ Neotoma issues sync (every 5 min) | no (interval) |
| `com.neotoma.watch-build` | `com.neotoma.watch-build.plist.tmpl` | TypeScript watch + rebuild | yes (`KeepAlive`) |

Typically only `prod-server` + `issues-sync` are loaded on a production machine. `dev-server` and `watch-build` are for active development.

---

## Install

```bash
cd deploy/launchagents
./install.sh           # renders templates → ~/Library/LaunchAgents/
./install.sh --dry-run # preview rendered output without writing
```

The script auto-detects `NEOTOMA_REPO_PATH`, `NODE_BIN`, `NPM_CLI`, and `NPM_BIN` from your environment. Override any by exporting before running:

```bash
NEOTOMA_REPO_PATH=/custom/path ./install.sh
```

---

## Load / unload

```bash
# Load (start now + on every login)
launchctl load ~/Library/LaunchAgents/com.neotoma.prod-server.plist
launchctl load ~/Library/LaunchAgents/com.neotoma.issues-sync.plist

# Unload (stop now + disable on login)
launchctl unload ~/Library/LaunchAgents/com.neotoma.prod-server.plist

# Reload after editing a plist
launchctl unload ~/Library/LaunchAgents/com.neotoma.prod-server.plist
launchctl load   ~/Library/LaunchAgents/com.neotoma.prod-server.plist
```

---

## Status and logs

```bash
# Check which agents are running
launchctl list | grep neotoma

# Tail prod server logs
tail -f ~/repos/neotoma/data/logs/launchd-prod-server.log
tail -f ~/repos/neotoma/data/logs/launchd-prod-server.error.log

# All neotoma logs
tail -f ~/repos/neotoma/data/logs/launchd-*.log
```

A non-zero exit code in `launchctl list` output means the agent last exited with an error — check the error log.

---

## Template variables

| Variable | Description | Default |
|---|---|---|
| `{{NEOTOMA_REPO_PATH}}` | Absolute path to the neotoma repo | Auto-detected from script location |
| `{{NODE_BIN}}` | Absolute path to `node` binary | `nvm which current` → `which node` |
| `{{NPM_CLI}}` | Absolute path to `npm-cli.js` | Derived from `NODE_BIN` |
| `{{NPM_BIN}}` | Absolute path to `npm` binary | `which npm` |

The rendered plists in `~/Library/LaunchAgents/` are **not** tracked in git — only the `.tmpl` sources are. Re-run `install.sh` after pulling template changes.
