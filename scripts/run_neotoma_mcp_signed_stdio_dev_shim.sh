#!/usr/bin/env bash
# Stdio MCP (Cursor harness) + dev-shim live reload + AAuth-signed HTTP to local API.
#
# The shim owns stdin/stdout (JSON-RPC only) and restarts its worker when
# src/, openapi.yaml, or MCP tool descriptions change. The worker is the
# identity proxy (--aauth), which signs requests to Neotoma's HTTP /mcp.
#
# Prereqs:
#   1. `neotoma auth keygen` (keys under ~/.neotoma/aauth/)
#   2. Dev API serving /mcp, e.g. `neotoma api start --env dev` (default :3080)
#
# Optional overrides (export before launch or set in mcp.json "env"):
#   MCP_PROXY_DOWNSTREAM_URL   default http://127.0.0.1:3080/mcp
#   MCP_PROXY_SESSION_PREFLIGHT, MCP_PROXY_FAIL_CLOSED, etc.
#
# Do not use `tsx watch` on the MCP-facing process: watch output on stdout
# breaks JSON-RPC. This script uses mcp_dev_shim.ts instead.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/neotoma_mcp_source_env.sh"

export NEOTOMA_ACTIONS_DISABLE_AUTOSTART=1
export MCP_PROXY_AAUTH="${MCP_PROXY_AAUTH:-1}"

# Optional: read bound API port from .dev-serve/local_http_port_<dev|prod> (parallel
# dev + prod) or legacy local_http_port. Set in mcp.json, e.g.:
#   "env": { "NEOTOMA_MCP_USE_LOCAL_PORT_FILE": "1", "NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE": "dev" }
# Preset A sets PROFILE per slot. TCP-probe before use; override timeout with
# NEOTOMA_MCP_PORT_PROBE_MS (default 1200, max 5000).
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/lib/neotoma_mcp_resolve_downstream_url.sh"
neotoma_mcp_resolve_mcp_proxy_downstream "neotoma-mcp-signed-shim"

# The local API's canonical AAuth authority is `localhost:<port>` by default,
# even though Cursor configs often point the proxy at 127.0.0.1. Sign with the
# canonical loopback host unless the operator set an explicit override.
if [ -z "${NEOTOMA_AAUTH_AUTHORITY_OVERRIDE:-}" ]; then
  _downstream_authority="$(python3 - <<'PY'
import os
from urllib.parse import urlparse

url = urlparse(os.environ["MCP_PROXY_DOWNSTREAM_URL"])
if url.hostname == "127.0.0.1":
    print(f"localhost:{url.port or (443 if url.scheme == 'https' else 80)}")
PY
)"
  if [ -n "$_downstream_authority" ]; then
    export NEOTOMA_AAUTH_AUTHORITY_OVERRIDE="$_downstream_authority"
  fi
fi

# Worker = identity proxy (stdio MCP upstream, signed HTTP downstream).
_DEFAULT_PROXY_ARGS='["tsx","src/cli/index.ts","mcp","proxy","--aauth"]'
export NEOTOMA_MCP_DEV_WORKER_CMD="${NEOTOMA_MCP_DEV_WORKER_CMD:-npx}"
export NEOTOMA_MCP_DEV_WORKER_ARGS="${NEOTOMA_MCP_DEV_WORKER_ARGS:-$_DEFAULT_PROXY_ARGS}"

if [ -f dist/mcp_dev_shim.js ]; then
  exec node dist/mcp_dev_shim.js
fi
exec npx tsx src/mcp_dev_shim.ts
