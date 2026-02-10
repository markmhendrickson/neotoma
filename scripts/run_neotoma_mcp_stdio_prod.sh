#!/usr/bin/env bash
# Run Neotoma MCP server (stdio) with production env from repo root.
# Uses built dist/ for fast startup so Cursor "Loading tools" completes reliably.
# Run `npm run build` after code changes. For watch mode use: npm run watch:mcp:stdio:prod (with cwd set).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
[ -f .env ] && set -a && source .env && set +a
if [ ! -f "dist/index.js" ]; then
  echo "Run npm run build first." >&2
  exit 1
fi
export NEOTOMA_ACTIONS_DISABLE_AUTOSTART=1
export NEOTOMA_ENV=production
exec node dist/index.js
