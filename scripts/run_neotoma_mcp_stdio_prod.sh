#!/usr/bin/env bash
# Run Neotoma MCP server (stdio) with production env from repo root.
# Uses tsx to run source directly; no build required. Self-contained: configure MCP in Cursor and enable.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
[ -f .env ] && set -a && source .env && set +a
export NEOTOMA_ACTIONS_DISABLE_AUTOSTART=1
export NEOTOMA_ENV=production
exec npx tsx src/index.ts
