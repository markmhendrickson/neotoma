#!/usr/bin/env bash
# Run the Neotoma HTTP API entry with a watcher so the process restarts on
# source edits. On macOS, prefer the chokidar polling watcher: Node's native
# watch mode can leave the supervisor alive after the server child exits,
# leaving no process bound to the HTTP port.
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

# Use NEOTOMA_LAUNCHD_NODE if set (injected by launchd plist) so the correct
# Node version is used even when the launchd PATH resolves an older system node.
NODE_BIN="${NEOTOMA_LAUNCHD_NODE:-node}"

# LaunchAgent sessions: Node --watch (fs.watch / FSEvents) often misses saves.
# Interactive macOS sessions can also leave the watch supervisor alive after the
# API child disappears, so use chokidar polling by default on Darwin. Operators
# can opt back into native watch with NEOTOMA_API_WATCH_NATIVE=1 or
# NEOTOMA_API_WATCH_FORCE_POLL=0.
force_poll="${NEOTOMA_API_WATCH_FORCE_POLL:-}"
native_watch="${NEOTOMA_API_WATCH_NATIVE:-}"
platform="$(uname -s 2>/dev/null || echo unknown)"
if [ "$force_poll" = "1" ] || [ "$force_poll" = "true" ] || {
  [ "$platform" = "Darwin" ] &&
    [ "$force_poll" != "0" ] &&
    [ "$force_poll" != "false" ] &&
    [ "$native_watch" != "1" ] &&
    [ "$native_watch" != "true" ];
}; then
  exec "$NODE_BIN" "$SCRIPT_DIR/run_neotoma_api_chokidar_poll_watch.js" "$ENTRY"
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

exec "$NODE_BIN" "$SCRIPT_DIR/run-dev-task.js" "$NODE_BIN" "${watch_args[@]}"
