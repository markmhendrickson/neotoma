#!/usr/bin/env bash
# Run Neotoma MCP server (stdio) with production env from repo root.
# Prefer built JS for cross-platform compatibility (e.g. Linux containers mounting a macOS repo).
# Fall back to tsx source execution when dist artifacts are missing.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/neotoma_mcp_source_env.sh"
export NEOTOMA_ACTIONS_DISABLE_AUTOSTART=1
export NEOTOMA_ENV=production
if [ -f dist/index.js ]; then
  exec node dist/index.js
fi
exec npx tsx src/index.ts
