#!/usr/bin/env bash
# Run Neotoma production HTTP API for LaunchAgent with hot-reload from source.
# Used by com.neotoma.prod-server.plist so the server starts at login, restarts
# after reboot, and picks up source changes automatically via node --watch + tsx.
#
# Calls `dev:server` directly (not `dev:server:prod`) to bypass pick-port.js /
# with-branch-ports.js, which would assign a branch-hash-derived port instead of
# the deterministic 3180.  HTTP_PORT and NEOTOMA_HTTP_PORT are set explicitly so
# the process always binds $PROD_HTTP_PORT (default 3180).  NEOTOMA_ENV=production
# is forwarded so the server uses the prod SQLite database.  Pre-kills any
# incumbent on 3180 before start.  This guarantees the `neotoma` MCP entry
# (NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE=prod) and the Cloudflare tunnel for
# https://neotoma.markmhendrickson.com/ both target the same bound process.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
export PATH="/usr/sbin:/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
export TSC_WATCHFILE="${TSC_WATCHFILE:-UseFsEventsWithFallbackDynamicPolling}"
export TSC_WATCHDIRECTORY="${TSC_WATCHDIRECTORY:-UseFsEventsWithFallbackDynamicPolling}"

run_npm() {
  if [[ -n "${NEOTOMA_LAUNCHD_NODE:-}" && -n "${NEOTOMA_LAUNCHD_NPM_CLI:-}" && -x "${NEOTOMA_LAUNCHD_NODE}" && -f "${NEOTOMA_LAUNCHD_NPM_CLI}" ]]; then
    "${NEOTOMA_LAUNCHD_NODE}" "${NEOTOMA_LAUNCHD_NPM_CLI}" "$@"
    return
  fi
  if [[ -n "${NEOTOMA_LAUNCHD_NPM_BIN:-}" && -x "${NEOTOMA_LAUNCHD_NPM_BIN}" ]]; then
    "${NEOTOMA_LAUNCHD_NPM_BIN}" "$@"
    return
  fi
  npm "$@"
}

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

for env_file in ".env" ".env.production"; do
  if [ -f "$env_file" ]; then
    set -a
    # shellcheck source=/dev/null
    source "$env_file"
    set +a
  fi
done

# Trust loopback in production mode so browser requests from localhost (Inspector)
# are authenticated as the local dev user without a Bearer token. Safe for a
# single-host setup with no reverse proxy; do not set on tunnel-exposed servers.
export NEOTOMA_TRUST_PROD_LOOPBACK=1

RESTART_DELAY=5
while true; do
  # Invoke dev:server directly with explicit port env vars so we bypass
  # pick-port.js / with-branch-ports.js entirely.  Those scripts scan upward
  # from 3180 and assign a branch-hash-derived port, which is wrong for a
  # deterministic production launchagent that must always bind 3180.
  HTTP_PORT="$PROD_HTTP_PORT" \
  NEOTOMA_HTTP_PORT="$PROD_HTTP_PORT" \
  NEOTOMA_ENV=production \
    run_npm run dev:server || true
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] dev:server exited, restarting in ${RESTART_DELAY}s..."
  sleep "$RESTART_DELAY"
done
