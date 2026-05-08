#!/usr/bin/env bash
# Run a full build once, then npm run dev:types (tsc --watch) so dist/ stays current for the global neotoma CLI. For LaunchAgent.
# Used by com.neotoma.watch-build.plist so the build runs at login and the watcher resumes after reboot.
# Restarts the watch process if it exits (e.g. tsc fatal error) so it is always running.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"

# LaunchAgents / headless: FSEvents can miss saves; polling fallback keeps tsc --watch reactive.
export TSC_WATCHFILE="${TSC_WATCHFILE:-UseFsEventsWithFallbackDynamicPolling}"
export TSC_WATCHDIRECTORY="${TSC_WATCHDIRECTORY:-UseFsEventsWithFallbackDynamicPolling}"

# Full build once at startup (tsc + copy_pdf_worker_wrapper) so dist/ is complete before watch runs.
npm run build:server || true

RESTART_DELAY=5
while true; do
  npm run dev:types || true
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] dev:types exited, restarting in ${RESTART_DELAY}s..."
  sleep "$RESTART_DELAY"
done
