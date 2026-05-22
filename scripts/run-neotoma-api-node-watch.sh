#!/usr/bin/env bash
# Run the Neotoma HTTP API entry with Node's native watch mode so the process
# restarts on source edits. More reliable under macOS LaunchAgents than some
# pure-FSEvents watchers (see docs/developer/launchd_dev_servers.md).
#
# Usage:
#   scripts/run-neotoma-api-node-watch.sh              # default: src/actions.ts
#   scripts/run-neotoma-api-node-watch.sh src/mcp_ws_bridge.ts
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

ENTRY="${1:-src/actions.ts}"

# TypeScript compiler watch (when stacked with tsc --watch) uses these under GUI-less sessions.
export TSC_WATCHFILE="${TSC_WATCHFILE:-UseFsEventsWithFallbackDynamicPolling}"
export TSC_WATCHDIRECTORY="${TSC_WATCHDIRECTORY:-UseFsEventsWithFallbackDynamicPolling}"

# LaunchAgent sessions: Node --watch (fs.watch / FSEvents) often misses saves. The launchd
# wrapper sets NEOTOMA_API_WATCH_FORCE_POLL=1 so we use chokidar polling instead.
if [ "${NEOTOMA_API_WATCH_FORCE_POLL:-}" = "1" ] || [ "${NEOTOMA_API_WATCH_FORCE_POLL:-}" = "true" ]; then
  exec node "$SCRIPT_DIR/run_neotoma_api_chokidar_poll_watch.js" "$ENTRY"
fi

watch_args=(--watch-path=src)
if [ -f "$REPO_ROOT/openapi.yaml" ]; then
  watch_args+=(--watch-path=openapi.yaml)
fi
# MCP tool copy and YAML descriptions reload the HTTP /mcp catalog when changed.
if [ -d "$REPO_ROOT/docs/developer/mcp" ]; then
  watch_args+=(--watch-path=docs/developer/mcp)
fi
watch_args+=(--watch-preserve-output --import tsx "$ENTRY")

exec node "$SCRIPT_DIR/run-dev-task.js" node "${watch_args[@]}"
