#!/usr/bin/env bash
# Run Neotoma MCP server (stdio) with development env, using tsx watch for live reload.
# No build required; uses source directly. Restarts on file changes.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
[ -f .env ] && set -a && source .env && set +a
export NEOTOMA_ACTIONS_DISABLE_AUTOSTART=1
exec npx tsx watch src/index.ts
