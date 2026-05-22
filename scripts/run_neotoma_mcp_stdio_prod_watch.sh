#!/usr/bin/env bash
# Run Neotoma MCP server (stdio) with production env from repo root.
# Uses tsx to run source directly; no build required. Self-contained: configure MCP in Cursor and enable.
# Note: tsx watch pollutes stdout and breaks MCP stdio; use plain tsx. Restart MCP connection after code changes.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/neotoma_mcp_source_env.sh"
export NEOTOMA_ACTIONS_DISABLE_AUTOSTART=1
export NEOTOMA_ENV=production
exec npx tsx src/index.ts
