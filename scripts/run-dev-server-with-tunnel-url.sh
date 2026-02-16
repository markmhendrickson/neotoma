#!/bin/bash
# Waits for the tunnel script to write the ngrok URL, then runs the server with API_BASE_URL set.
# Used by dev:server+api so the server automatically uses the tunnel URL (no .env change needed).

set -euo pipefail

URL_FILE="${NGROK_URL_FILE:-/tmp/ngrok-mcp-url.txt}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Start server immediately so it's ready for CLI health check. Tunnel runs in parallel.
# If tunnel URL file appears, we could source it next run; for this run use default (localhost or .env).
if [ -s "$URL_FILE" ] && [ -z "${HOST_URL:-}" ] && [ -z "${API_BASE_URL:-}" ]; then
  _url=$(cat "$URL_FILE")
  export HOST_URL="$_url"
fi
exec node "$SCRIPT_DIR/run-dev-task.js" tsx watch src/actions.ts
