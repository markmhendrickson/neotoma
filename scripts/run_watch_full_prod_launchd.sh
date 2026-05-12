#!/usr/bin/env bash
# Run npm run dev:full:prod (prod-mode full stack) for LaunchAgent.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

# Inspector `vite build --watch` writes to ../dist/inspector; `inspector/vite.config.ts` enables
# chokidar polling for that out-of-package outDir so rebuilds fire under LaunchAgents (see
# docs/developer/launchd_watch_build.md). Override with NEOTOMA_INSPECTOR_BUILD_WATCH_POLL=0 in .env if needed.

RESTART_DELAY=5
while true; do
  npm run dev:full:prod || true
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] dev:full:prod exited, restarting in ${RESTART_DELAY}s..."
  sleep "$RESTART_DELAY"
done
