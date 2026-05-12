#!/usr/bin/env bash
# Run npm run watch:dev (tunnel + dev API + tsc in concurrently) for LaunchAgent.
# Restart loop matches run_watch_build_launchd.sh so transient failures recover.
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

RESTART_DELAY=5
while true; do
  npm run watch:dev || true
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] watch:dev exited, restarting in ${RESTART_DELAY}s..."
  sleep "$RESTART_DELAY"
done
