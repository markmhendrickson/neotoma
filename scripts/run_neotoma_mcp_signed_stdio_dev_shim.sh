#!/usr/bin/env bash
# Stdio MCP (Cursor harness) + dev-shim live reload + AAuth-signed HTTP to local API.
#
# The shim owns stdin/stdout (JSON-RPC only) and restarts the worker when
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

for envfile in "${REPO_ROOT}/.env.dev" "${REPO_ROOT}/.env" "${REPO_ROOT}/.env.development"; do
  if [ -f "$envfile" ]; then
    set -a
    # shellcheck disable=SC1090
    source "$envfile"
    set +a
    break
  fi
done

export NEOTOMA_ACTIONS_DISABLE_AUTOSTART=1
export MCP_PROXY_AAUTH="${MCP_PROXY_AAUTH:-1}"

# Optional: read bound API port from .dev-serve/local_http_port_<dev|prod> (parallel
# dev + prod) or legacy local_http_port. Set in mcp.json, e.g.:
#   "env": { "NEOTOMA_MCP_USE_LOCAL_PORT_FILE": "1", "NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE": "dev" }
# Preset A sets PROFILE per slot. TCP-probe before use; override timeout with
# NEOTOMA_MCP_PORT_PROBE_MS (default 1200, max 5000).
_use_pf="${NEOTOMA_MCP_USE_LOCAL_PORT_FILE:-}"
_profile="${NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE:-}"
if [ "$_use_pf" = "1" ] || [ "$_use_pf" = "true" ]; then
  case "$_profile" in
    prod)
      _fallback="${MCP_PROXY_DOWNSTREAM_URL:-http://127.0.0.1:3180/mcp}"
      _port_files="${REPO_ROOT}/.dev-serve/local_http_port_prod"
      ;;
    dev)
      _fallback="${MCP_PROXY_DOWNSTREAM_URL:-http://127.0.0.1:3080/mcp}"
      _port_files="${REPO_ROOT}/.dev-serve/local_http_port_dev ${REPO_ROOT}/.dev-serve/local_http_port"
      ;;
    *)
      _fallback="${MCP_PROXY_DOWNSTREAM_URL:-http://127.0.0.1:3080/mcp}"
      _port_files="${REPO_ROOT}/.dev-serve/local_http_port"
      ;;
  esac
  _resolved=0
  for _pf in $_port_files; do
    if [ ! -f "$_pf" ]; then
      continue
    fi
    # shellcheck disable=SC2002
    _port="$(sed 's/#.*//' "$_pf" | tr -d '[:space:]' || true)"
    case "$_port" in
      ''|*[!0-9]*) _port="" ;;
    esac
    if [ -z "$_port" ] || [ "$_port" -lt 1 ] || [ "$_port" -gt 65535 ] 2>/dev/null; then
      continue
    fi
    # shellcheck disable=SC2016
    if _NEOTOMA_SHIM_PROBE_HOST=127.0.0.1 \
      _NEOTOMA_SHIM_PROBE_PORT="$_port" \
      node <<'NODE'
const net = require("node:net");
const host = process.env._NEOTOMA_SHIM_PROBE_HOST;
const port = Number(process.env._NEOTOMA_SHIM_PROBE_PORT);
const raw = process.env.NEOTOMA_MCP_PORT_PROBE_MS;
const ms = Math.min(5000, Math.max(200, raw ? Number(raw) : 1200));
if (!host || !Number.isFinite(port) || port < 1 || port > 65535) process.exit(1);
const s = net.createConnection({ host, port }, () => {
  s.end();
  process.exit(0);
});
s.setTimeout(ms);
s.on("timeout", () => {
  try {
    s.destroy();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
s.on("error", () => process.exit(1));
NODE
    then
      export MCP_PROXY_DOWNSTREAM_URL="http://127.0.0.1:${_port}/mcp"
      echo "[neotoma-mcp-signed-shim] NEOTOMA_MCP_USE_LOCAL_PORT_FILE: using port ${_port} from ${_pf}" >&2
      _resolved=1
      break
    fi
  done
  if [ "$_resolved" != "1" ]; then
    echo "[neotoma-mcp-signed-shim] NEOTOMA_MCP_USE_LOCAL_PORT_FILE: no reachable port from port files (profile=${_profile:-legacy}); falling back to ${_fallback}" >&2
    export MCP_PROXY_DOWNSTREAM_URL="$_fallback"
  fi
else
  export MCP_PROXY_DOWNSTREAM_URL="${MCP_PROXY_DOWNSTREAM_URL:-http://127.0.0.1:3080/mcp}"
fi
unset _use_pf _profile _pf _port _port_files _resolved _fallback

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
