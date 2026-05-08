#!/usr/bin/env bash
# Run Neotoma dev HTTP stack (no tunnel) for LaunchAgent. Stays running until stopped.
# Used by com.neotoma.dev-server.plist so the dev API starts at login and resumes after reboot.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
# /usr/sbin for lsof (with_branch_ports); /usr/bin for system utilities under LaunchAgents.
export PATH="/usr/sbin:/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"
# Same TSC watch fallbacks as dev:types when npm stacks tsc with the server.
export TSC_WATCHFILE="${TSC_WATCHFILE:-UseFsEventsWithFallbackDynamicPolling}"
export TSC_WATCHDIRECTORY="${TSC_WATCHDIRECTORY:-UseFsEventsWithFallbackDynamicPolling}"
# Node --watch often misses src edits under LaunchAgents; run-neotoma-api-node-watch uses
# chokidar polling when this is set (see scripts/run_neotoma_api_chokidar_poll_watch.js).
export NEOTOMA_API_WATCH_FORCE_POLL="${NEOTOMA_API_WATCH_FORCE_POLL:-1}"
# Load .env if present so NEOTOMA_* vars are set
if [ -f ".env" ]; then
  set -a
  # shellcheck source=/dev/null
  source ".env"
  set +a
fi
exec npm run dev:server
