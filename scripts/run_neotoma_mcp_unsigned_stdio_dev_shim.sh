#!/usr/bin/env bash
# Unsigned stdio dev shim: pairs with `run_neotoma_mcp_signed_stdio_dev_shim.sh`
# naming; runs `neotoma mcp proxy` without forced AAuth (direct process, not
# `mcp_dev_shim.ts`). Same port-file / probe resolution as the signed shim.
#
# Sits between a stdio-only harness (Cursor, Claude Code, Codex) and Neotoma's
# HTTP /mcp endpoint. Sources repo env for MCP_PROXY_* and NEOTOMA_AAUTH_* configuration.
#
# Usage in mcp.json:
#   { "command": "/path/to/neotoma/scripts/run_neotoma_mcp_unsigned_stdio_dev_shim.sh" }
#
# Deprecated alias: `run_neotoma_mcp_unsigned_stdio_proxy.sh` (exec forwarder).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/neotoma_mcp_source_env.sh"
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/neotoma_mcp_resolve_downstream_url.sh"
neotoma_mcp_resolve_mcp_proxy_downstream "neotoma-mcp-unsigned-stdio-dev-shim"

# Use built dist if available, fall back to tsx
if [ -f "${REPO_ROOT}/dist/cli/index.js" ]; then
  exec node "${REPO_ROOT}/dist/cli/index.js" mcp proxy "$@"
else
  exec npx tsx "${REPO_ROOT}/src/cli/index.ts" mcp proxy "$@"
fi
