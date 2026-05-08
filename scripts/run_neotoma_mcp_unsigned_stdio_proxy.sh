#!/usr/bin/env bash
# Launcher for the Neotoma MCP identity proxy.
#
# Sits between a stdio-only harness (Cursor, Claude Code, Codex) and
# Neotoma's HTTP /mcp endpoint. Sources .env for MCP_PROXY_* and
# NEOTOMA_AAUTH_* configuration.
#
# Usage in mcp.json:
#   { "command": "/path/to/neotoma/scripts/run_neotoma_mcp_proxy.sh" }

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Source environment
for envfile in "${REPO_ROOT}/.env.dev" "${REPO_ROOT}/.env" "${REPO_ROOT}/.env.development"; do
  if [ -f "$envfile" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$envfile"
    set +a
    break
  fi
done

# Default downstream URL if not set
export MCP_PROXY_DOWNSTREAM_URL="${MCP_PROXY_DOWNSTREAM_URL:-http://localhost:3080/mcp}"

# Use built dist if available, fall back to tsx
if [ -f "${REPO_ROOT}/dist/cli/index.js" ]; then
  exec node "${REPO_ROOT}/dist/cli/index.js" mcp proxy "$@"
else
  exec npx tsx "${REPO_ROOT}/src/cli/index.ts" mcp proxy "$@"
fi
