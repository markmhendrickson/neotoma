#!/usr/bin/env bash
# Run a full build once, then npm run watch:build (tsc --watch) so dist/ stays current for the global neotoma CLI. For LaunchAgent.
# Used by com.neotoma.watch-build.plist so the build runs at login and the watcher resumes after reboot.
# Restarts the watch process if it exits (e.g. tsc fatal error) so it is always running.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

# Full build once at startup (tsc + copy_pdf_worker_wrapper) so dist/ is complete before watch runs.
npm run build:server || true

RESTART_DELAY=5
while true; do
  npm run watch:build || true
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] watch:build exited, restarting in ${RESTART_DELAY}s..."
  sleep "$RESTART_DELAY"
done
