#!/usr/bin/env bash
# Run Neotoma dev HTTP stack (no tunnel) for LaunchAgent. Stays running until stopped.
# Used by com.neotoma.dev-server.plist so the dev API starts at login and resumes after reboot.
#
# Pins the dev API to canonical port 3080 (matches Cursor's `neotoma-dev` /
# `neotoma-dev-unsigned` MCP entries with NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE=dev).
# Pre-kills any incumbent on 3080 plus the historical with-branch-ports scan
# range (3081-3179) so chokidar reload chains can never accumulate orphans on
# secondary ports. By exporting NEOTOMA_HTTP_PORT=3080, scripts/run-dev-task.js
# bypasses with_branch_ports.js entirely and runs the API directly.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
# /usr/sbin for lsof; /usr/bin for system utilities under LaunchAgents.
export PATH="/usr/sbin:/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
# Same TSC watch fallbacks as dev:types when npm stacks tsc with the server.
export TSC_WATCHFILE="${TSC_WATCHFILE:-UseFsEventsWithFallbackDynamicPolling}"
export TSC_WATCHDIRECTORY="${TSC_WATCHDIRECTORY:-UseFsEventsWithFallbackDynamicPolling}"
# Node --watch often misses src edits under LaunchAgents; run-neotoma-api-node-watch uses
# chokidar polling when this is set (see scripts/run_neotoma_api_chokidar_poll_watch.js).
export NEOTOMA_API_WATCH_FORCE_POLL="${NEOTOMA_API_WATCH_FORCE_POLL:-1}"

DEV_HTTP_PORT="${NEOTOMA_DEV_HTTP_PORT:-3080}"
DEV_PORT_KILL_RANGE_END="${NEOTOMA_DEV_HTTP_PORT_KILL_RANGE_END:-3179}"

kill_port_range() {
  local start_port="$1"
  local end_port="$2"
  local pid
  for ((p = start_port; p <= end_port; p++)); do
    while IFS= read -r pid; do
      [ -z "$pid" ] && continue
      [ "$pid" = "$$" ] && continue
      kill -TERM "$pid" 2>/dev/null || true
    done < <(lsof -ti tcp:"$p" 2>/dev/null || true)
  done
  sleep 1
  for ((p = start_port; p <= end_port; p++)); do
    while IFS= read -r pid; do
      [ -z "$pid" ] && continue
      [ "$pid" = "$$" ] && continue
      kill -KILL "$pid" 2>/dev/null || true
    done < <(lsof -ti tcp:"$p" 2>/dev/null || true)
  done
}

kill_port_range "$DEV_HTTP_PORT" "$DEV_PORT_KILL_RANGE_END"
# Reap any leftover with_branch_ports.js invocations from prior dev sessions
# (their server children would otherwise survive on whatever port they grabbed).
pkill -TERM -f "scripts/with_branch_ports.js node --import tsx /Users/.*/src/actions.ts" 2>/dev/null || true
sleep 1
pkill -KILL -f "scripts/with_branch_ports.js node --import tsx /Users/.*/src/actions.ts" 2>/dev/null || true

# Clear the previous bound-port file so MCP shims do not connect to a now-dead port
# while the new server is starting up. The API rewrites this file on bind.
rm -f "$REPO_ROOT/.dev-serve/local_http_port_dev" "$REPO_ROOT/.dev-serve/local_http_port" 2>/dev/null || true

# Load .env if present so NEOTOMA_* vars are set
if [ -f ".env" ]; then
  set -a
  # shellcheck source=/dev/null
  source ".env"
  set +a
fi

export NEOTOMA_HTTP_PORT="$DEV_HTTP_PORT"
export HTTP_PORT="$DEV_HTTP_PORT"

exec npm run dev:server
