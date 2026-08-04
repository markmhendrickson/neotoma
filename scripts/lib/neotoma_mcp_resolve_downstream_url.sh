#!/usr/bin/env bash
# Resolve MCP_PROXY_DOWNSTREAM_URL from local port files + TCP probe (same
# behavior as the signed/unsigned stdio shims). Prerequisites: REPO_ROOT set.
#
# Usage (after sourcing):
#   neotoma_mcp_resolve_mcp_proxy_downstream "neotoma-mcp-signed-shim"
# Argument is the stderr log tag (bracketed prefix without []).

: "${REPO_ROOT:?neotoma_mcp_resolve_downstream_url.sh requires REPO_ROOT to be set}"

neotoma_mcp_resolve_mcp_proxy_downstream() {
  local _label="${1:-neotoma-mcp-shim}"
  local _use_pf="${NEOTOMA_MCP_USE_LOCAL_PORT_FILE:-}"
  local _profile="${NEOTOMA_MCP_LOCAL_HTTP_PORT_PROFILE:-}"
  local _fallback
  local _port_files
  local _resolved=0
  local _pf
  local _port

  # Cursor's MCP harness has been observed to silently drop env entries whose
  # value is `"1"` (apparently treating the JSON string as numeric) when
  # populating the child env, while still honoring sibling string values like
  # `"prod"`. That stripped NEOTOMA_MCP_USE_LOCAL_PORT_FILE and pushed the
  # prod-profile shim down the legacy `else` branch, which defaults to the
  # dev port (3080) and looks like an intermittent prod outage. Treat an
  # explicit `prod`/`dev` profile as sufficient to enable port-file mode even
  # when the boolean flag is missing.
  if [ "$_use_pf" = "1" ] || [ "$_use_pf" = "true" ] \
     || [ "$_profile" = "prod" ] || [ "$_profile" = "dev" ]; then
    # Profile-aware defaults — when port-file mode is on, the profile is the
    # source of truth, so an inherited MCP_PROXY_DOWNSTREAM_URL must NOT cross
    # profiles. (A stale dev URL inherited into a prod-profile shim used to
    # silently route prod traffic at the dev port.) Honour an explicit override
    # only when its host:port matches the profile's expected default port.
    case "$_profile" in
      prod)
        _fallback="http://127.0.0.1:3180/mcp"
        _port_files="${REPO_ROOT}/.dev-serve/local_http_port_prod"
        ;;
      dev)
        _fallback="http://127.0.0.1:3080/mcp"
        _port_files="${REPO_ROOT}/.dev-serve/local_http_port_dev ${REPO_ROOT}/.dev-serve/local_http_port"
        ;;
      *)
        _fallback="${MCP_PROXY_DOWNSTREAM_URL:-http://127.0.0.1:3080/mcp}"
        _port_files="${REPO_ROOT}/.dev-serve/local_http_port"
        ;;
    esac
    if [ -n "${MCP_PROXY_DOWNSTREAM_URL:-}" ] \
       && { [ "$_profile" = "prod" ] || [ "$_profile" = "dev" ]; } \
       && [ "$MCP_PROXY_DOWNSTREAM_URL" != "$_fallback" ]; then
      echo "[${_label}] ignoring inherited MCP_PROXY_DOWNSTREAM_URL=${MCP_PROXY_DOWNSTREAM_URL} for profile=${_profile}; using profile default ${_fallback} when port file probe fails" >&2
    fi
    for _pf in $_port_files; do
      if [ ! -f "$_pf" ]; then
        continue
      fi
      # shellcheck disable=SC2002
      _port="$(sed 's/#.*//' "$_pf" | tr -d '[:space:]' || true)"
      case "$_port" in
        '' | *[!0-9]*) _port="" ;;
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
        echo "[${_label}] NEOTOMA_MCP_USE_LOCAL_PORT_FILE: using port ${_port} from ${_pf}" >&2
        _resolved=1
        break
      fi
    done
    # Self-heal: when no port file yields a reachable port, DISCOVER the port the
    # server is actually listening on rather than trusting a stale hardcoded
    # fallback. A port file last written weeks ago (e.g. 3180) while the server
    # binds elsewhere (e.g. 9180) otherwise produces a silent, confusing
    # "Could not attach to MCP server" with no indication the port was wrong.
    # Probes the canonical ports for each profile, then rewrites the port file
    # so the next start resolves on the fast path.
    if [ "$_resolved" != "1" ]; then
      _candidates=""
      case "$_profile" in
        prod) _candidates="9180 3180" ;;
        dev)  _candidates="9080 3080" ;;
        *)    _candidates="3080 3180 9080 9180" ;;
      esac
      for _port in $_candidates; do
        if _NEOTOMA_SHIM_PROBE_HOST=127.0.0.1 \
          _NEOTOMA_SHIM_PROBE_PORT="$_port" \
          node -e '
const net=require("node:net");
const port=Number(process.env._NEOTOMA_SHIM_PROBE_PORT);
const s=net.createConnection({host:"127.0.0.1",port},()=>{s.end();process.exit(0)});
s.setTimeout(1200);
s.on("timeout",()=>{try{s.destroy()}catch{};process.exit(1)});
s.on("error",()=>process.exit(1));
'
        then
          export MCP_PROXY_DOWNSTREAM_URL="http://127.0.0.1:${_port}/mcp"
          echo "[${_label}] port files stale/unreachable; DISCOVERED live port ${_port} by probe" >&2
          _resolved=1
          _pf="$(echo $_port_files | awk '{print $1}')"
          if [ -n "$_pf" ] && [ -w "$(dirname "$_pf")" ]; then
            printf '%s' "$_port" > "$_pf" 2>/dev/null \
              && echo "[${_label}] self-healed ${_pf} -> ${_port}" >&2
          fi
          break
        fi
      done
    fi
    if [ "$_resolved" != "1" ]; then
      echo "[${_label}] NEOTOMA_MCP_USE_LOCAL_PORT_FILE: no reachable port from port files or discovery (profile=${_profile:-legacy}); falling back to ${_fallback}" >&2
      export MCP_PROXY_DOWNSTREAM_URL="$_fallback"
    fi
  else
    export MCP_PROXY_DOWNSTREAM_URL="${MCP_PROXY_DOWNSTREAM_URL:-http://127.0.0.1:3080/mcp}"
  fi
}
