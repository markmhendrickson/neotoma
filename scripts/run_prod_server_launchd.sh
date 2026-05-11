#!/usr/bin/env bash
# Run Neotoma production HTTP API for LaunchAgent (build + prod port + NEOTOMA_ENV=production).
# Used by com.neotoma.prod-server.plist so a built API can start at login and resume after reboot.
#
# Pre-kills any incumbent on canonical port 3180 so prod always binds 3180 and
# never drifts via pick-port.js's scan-up fallback. This guarantees the Cursor
# `neotoma` MCP entry (NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE=prod) and the
# Cloudflare tunnel for https://neotoma.markmhendrickson.com/ both target the
# same bound process.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
export PATH="/usr/sbin:/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
export TSC_WATCHFILE="${TSC_WATCHFILE:-UseFsEventsWithFallbackDynamicPolling}"
export TSC_WATCHDIRECTORY="${TSC_WATCHDIRECTORY:-UseFsEventsWithFallbackDynamicPolling}"

PROD_HTTP_PORT="${NEOTOMA_PROD_HTTP_PORT:-3180}"

kill_port() {
  local port="$1"
  local pid
  while IFS= read -r pid; do
    [ -z "$pid" ] && continue
    [ "$pid" = "$$" ] && continue
    kill -TERM "$pid" 2>/dev/null || true
  done < <(lsof -ti tcp:"$port" 2>/dev/null || true)
  sleep 1
  while IFS= read -r pid; do
    [ -z "$pid" ] && continue
    [ "$pid" = "$$" ] && continue
    kill -KILL "$pid" 2>/dev/null || true
  done < <(lsof -ti tcp:"$port" 2>/dev/null || true)
}

kill_port "$PROD_HTTP_PORT"

rm -f "$REPO_ROOT/.dev-serve/local_http_port_prod" 2>/dev/null || true

if [ -f ".env" ]; then
  set -a
  # shellcheck source=/dev/null
  source ".env"
  set +a
fi
exec npm run start:server:prod
