#!/usr/bin/env bash
# Unload then load Neotoma LaunchAgents under ~/Library/LaunchAgents (macOS only).
# Does not touch system Daemons or third-party agents. Skips labels with no plist file.
#
# Canonical agents managed here:
#   com.neotoma.dev-server   — `npm run dev:server`  (binds 3080)
#   com.neotoma.prod-server  — `npm run start:server:prod`  (binds 3180; tunnel target)
#   com.neotoma.watch-build  — `tsc --watch`
#   com.neotoma.issues-sync  — periodic GitHub issue sync (optional)
#
# The older overlapping agents (com.neotoma.watch-dev, com.neotoma.watch-full-prod,
# com.neotoma.dev-servers) are unloaded and warned about — they should be removed
# (`mv ~/Library/LaunchAgents/<label>.plist .disabled.<ts>`) once you confirm the
# canonical agents serve your needs.
#
# Optional flags:
#   --kill-zombies   force-kill stale `node dist/index.js` processes from this
#                    repo whose parent is launchd (PPID=1). These leak across
#                    crashes and hold ports 31xx so `prod-server` cannot bind.
set -u

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "reload_neotoma_launchagents.sh is macOS only." >&2
  exit 1
fi

KILL_ZOMBIES=0
for arg in "$@"; do
  case "$arg" in
    --kill-zombies) KILL_ZOMBIES=1 ;;
    -h|--help)
      sed -n '1,32p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

LA="${HOME}/Library/LaunchAgents"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

unload_one() {
  local plist="$1"
  if [[ -f "$plist" ]]; then
    launchctl unload "$plist" 2>/dev/null || true
  fi
}

reload_one() {
  local name="$1"
  local plist="${LA}/${name}.plist"
  if [[ ! -f "$plist" ]]; then
    echo "Skip ${name} (no plist)"
    return 0
  fi
  echo "Reloading ${name}..."
  unload_one "$plist"
  if ! launchctl load "$plist"; then
    echo "Warning: launchctl load failed for ${name}" >&2
  fi
}

# Legacy / overlapping agents — unload them so they can't fight the canonical pair.
for legacy in \
  com.neotoma.dev-servers \
  com.neotoma.watch-dev \
  com.neotoma.watch-full-prod \
; do
  legacy_plist="${LA}/${legacy}.plist"
  if [[ -f "$legacy_plist" ]]; then
    echo "Unloading legacy ${legacy} (overlaps com.neotoma.dev-server / com.neotoma.prod-server)"
    launchctl unload "$legacy_plist" 2>/dev/null || true
    echo "  Tip: rm or .disabled-rename the plist if you don't intend to use it again:"
    echo "       mv \"$legacy_plist\" \"${legacy_plist}.disabled.\$(date +%Y%m%d-%H%M%S)\""
  fi
done

# Optional: clean up `node dist/index.js` zombies from this repo (PPID=1) before
# reloading. Stale dev/prod API processes can hold 3080/3180 and cause the new
# LaunchAgent to bounce on EADDRINUSE.
if [[ "$KILL_ZOMBIES" == "1" ]]; then
  echo "Killing stale Neotoma node dist/index.js zombies (PPID=1) from ${REPO_ROOT}..."
  zombie_count=0
  for pid in $(ps -eo pid,ppid,command | awk '$2==1 && /node dist\/index\.js$/{print $1}'); do
    cwd="$(lsof -p "$pid" 2>/dev/null | awk '$4=="cwd"{print $NF; exit}')"
    case "$cwd" in
      "$REPO_ROOT"|"$REPO_ROOT"/*|/private/tmp/neotoma-*)
        kill -KILL "$pid" 2>/dev/null && echo "  killed PID=$pid (cwd=$cwd)"
        zombie_count=$((zombie_count + 1))
        ;;
    esac
  done
  if [[ "$zombie_count" == "0" ]]; then
    echo "  none found."
  fi
fi

# Canonical agents.
for label in com.neotoma.dev-server com.neotoma.prod-server com.neotoma.watch-build com.neotoma.issues-sync; do
  reload_one "$label"
done

echo "Done."
