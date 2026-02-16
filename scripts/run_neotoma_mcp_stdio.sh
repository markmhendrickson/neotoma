#!/usr/bin/env bash
# Run Neotoma MCP server (stdio) from repo root. Use this in MCP config so cwd is correct
# when Cursor spawns the process. Uses tsx without watch so stdout is only JSON-RPC
# (tsx watch prints "Found 0 errors. Watching for file changes." and breaks the protocol).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
[ -f .env ] && set -a && source .env && set +a
export NEOTOMA_ACTIONS_DISABLE_AUTOSTART=1
exec npx tsx src/index.ts
