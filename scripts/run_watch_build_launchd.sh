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

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

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

ensure_global_cli_linked() {
  if run_npm link; then
    echo "[$(timestamp)] Linked global neotoma CLI to ${REPO_ROOT}."
  else
    echo "[$(timestamp)] Warning: npm link failed; continuing with repo-local build/watch." >&2
  fi
}

ensure_global_cli_linked

# Full build once at startup (tsc + copy_pdf_worker_wrapper) so dist/ is complete before watch runs.
if run_npm run build:server; then
  echo "[$(timestamp)] Initial build completed."
else
  echo "[$(timestamp)] Initial build failed; continuing with watch mode." >&2
fi

RESTART_DELAY=5
while true; do
  run_npm run dev:types || true
  echo "[$(timestamp)] dev:types exited, restarting in ${RESTART_DELAY}s..."
  sleep "$RESTART_DELAY"
done
