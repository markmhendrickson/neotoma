#!/usr/bin/env bash
# Stop orphan Neotoma dev processes under this repo (interactive duplicates).
# Safe to run before (re)loading LaunchAgents so only one supervised stack binds ports.
# Does not unload LaunchAgents; unload those separately if you need a full stop.
set +e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "[kill_stale_neotoma_dev_stacks] repo=${REPO_ROOT}"

kill_pattern() {
  local pat="$1"
  pkill -TERM -f "$pat" 2>/dev/null
}

# tsx API watcher stacks (npm run dev:server:tunnel:types / dev / dev:server)
kill_pattern "${REPO_ROOT}/node_modules/.bin/tsx watch src/actions.ts"
kill_pattern "${REPO_ROOT}/scripts/run-dev-task.js tsx watch"
# Vite (dev:ui / dev*)
kill_pattern "${REPO_ROOT}/scripts/run-dev-task.js vite"
# pick-port + concurrently entrypoints for common dev/prod-full scripts
kill_pattern "${REPO_ROOT}/scripts/pick-port.js 3080"
kill_pattern "${REPO_ROOT}/scripts/pick-port.js --print-resources 3080 5195 3001"
kill_pattern "${REPO_ROOT}/scripts/pick-port.js --print-resources 3180 5295 3101"

sleep 2
# Second pass: anything still holding the watcher cmdline
kill_pattern "${REPO_ROOT}/node_modules/.bin/tsx watch src/actions.ts"
kill_pattern "${REPO_ROOT}/scripts/run-dev-task.js tsx watch"
kill_pattern "${REPO_ROOT}/scripts/run-dev-task.js vite"

echo "[kill_stale_neotoma_dev_stacks] done"
