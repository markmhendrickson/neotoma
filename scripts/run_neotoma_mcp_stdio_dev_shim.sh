#!/usr/bin/env bash
# Run the stable Neotoma MCP development shim from repo root.
# The shim owns the client-facing stdio stream and restarts its worker on source changes.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
[ -f .env ] && set -a && source .env && set +a
export NEOTOMA_ACTIONS_DISABLE_AUTOSTART=1
if [ -f dist/mcp_dev_shim.js ]; then
  exec node dist/mcp_dev_shim.js
fi
exec npx tsx src/mcp_dev_shim.ts
