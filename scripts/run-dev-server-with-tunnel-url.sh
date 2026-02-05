#!/bin/bash
# Waits for the tunnel script to write the ngrok URL, then runs the server with API_BASE_URL set.
# Used by dev:server+api so the server automatically uses the tunnel URL (no .env change needed).

set -euo pipefail

URL_FILE="${NGROK_URL_FILE:-/tmp/ngrok-mcp-url.txt}"
WAIT_TIMEOUT="${NGROK_WAIT_TIMEOUT:-20}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Wait for tunnel URL file to exist and have content
WAITED=0
while [ ! -s "$URL_FILE" ] && [ "$WAITED" -lt "$WAIT_TIMEOUT" ]; do
  sleep 1
  WAITED=$((WAITED + 1))
done

if [ ! -s "$URL_FILE" ]; then
  echo "⚠️  Tunnel URL file not ready after ${WAIT_TIMEOUT}s. Starting server without API_BASE_URL from tunnel."
  exec node "$SCRIPT_DIR/run-dev-task.js" tsx watch src/actions.ts
fi

API_BASE_URL=$(cat "$URL_FILE")
export API_BASE_URL
exec node "$SCRIPT_DIR/run-dev-task.js" tsx watch src/actions.ts
