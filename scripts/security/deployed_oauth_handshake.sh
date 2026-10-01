#!/usr/bin/env bash
# Deployed MCP OAuth handshake probe.
#
# Walks the exact six-step chain an MCP client performs to authenticate against
# a DEPLOYED instance, over real network paths. Complements
# `tests/integration/wellknown_discovery_unauthenticated.test.ts`, which asserts
# the same contract against a locally-booted app.
#
# WHY BOTH EXIST — this is the gap that motivated this script. On 2026-08-06 the
# #2049 discovery deadlock was fixed and merged (#2050), the local test passed,
# CI was green, and main was tagged v0.21.3 — while a deployed client instance
# still served v0.21.2 and still returned 401 on
# `/.well-known/oauth-protected-resource`. Nothing caught it. A local test
# cannot: it proves the code is right, not that the running instance has it.
#
# The chain probed here, in order:
#   1. POST /mcp unauthenticated       -> 401 carrying a WWW-Authenticate
#                                          challenge with resource_metadata
#   2. GET  <resource_metadata>        -> 200 naming authorization_servers
#                                          (a 401 here is the #2049 deadlock:
#                                           the client is told to look here for
#                                           how to authenticate, so gating it
#                                           means login can never begin)
#   3. GET  /.well-known/oauth-authorization-server
#                                      -> 200 with authorization_endpoint,
#                                         token_endpoint, PKCE S256
#   4. POST <registration_endpoint>    -> 201 issuing a client_id for a
#                                          localhost redirect URI (how desktop
#                                          clients receive the callback)
#   5. GET  <authorization_endpoint>   -> 302 toward a sign-in surface
#   6. GET  <that surface>             -> 200 rendering an actual sign-in
#
# SCOPE BOUNDARY — read this before trusting a green run. This asserts the
# SERVER side only. It does NOT prove that any particular client (Claude
# Desktop, Claude Code, Cursor, Codex) completes the flow: client behaviour is
# unobservable from here. A pass means nothing on our side forces a fallback
# such as a terminal detour; it does not mean a given app works.
#
# Usage:
#   scripts/security/deployed_oauth_handshake.sh --hosts "https://example.fly.dev"
#   NEOTOMA_PROBE_HOSTS="https://a https://b" scripts/security/deployed_oauth_handshake.sh
#
# Exit codes:
#   0 — every step matched expectations on every host
#   1 — at least one step failed (the failing step is named)
#   2 — invocation error (curl/python3 missing, no hosts)

set -uo pipefail

HOSTS="${NEOTOMA_PROBE_HOSTS:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --hosts) HOSTS="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

command -v curl >/dev/null || { echo "curl not found" >&2; exit 2; }
command -v python3 >/dev/null || { echo "python3 not found" >&2; exit 2; }
[[ -n "$HOSTS" ]] || { echo "no hosts: set NEOTOMA_PROBE_HOSTS or pass --hosts" >&2; exit 2; }

FAILED=0

probe_host() {
  local base="${1%/}"
  local hdrs body status
  echo "── $base"

  # 1 ── unauthenticated /mcp must challenge with a resource_metadata pointer.
  hdrs=$(curl -s -D- -o /dev/null --max-time 30 -X POST "$base/mcp" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' 2>/dev/null)
  status=$(printf '%s' "$hdrs" | head -1 | grep -oE '[0-9]{3}' | head -1)
  local rm
  rm=$(printf '%s' "$hdrs" | grep -io 'resource_metadata="[^"]*"' | sed 's/.*="//;s/"//')
  if [[ "$status" == "401" && -n "$rm" ]]; then
    echo "   1. challenge                       ✓ 401 -> $rm"
  elif [[ "$status" == "200" ]]; then
    # An instance admitting anonymous callers never issues a challenge, so
    # there is no chain to walk. Not a failure of THIS contract, but say so
    # loudly: it is the configuration in which the deadlock hides.
    echo "   1. challenge                       — instance admits anonymous callers; no OAuth chain to probe"
    return 0
  else
    echo "   1. challenge                       ✗ expected 401 + resource_metadata, got ${status:-no response}"
    FAILED=1; return 1
  fi

  # 2 ── the document the challenge names MUST be reachable unauthenticated.
  body=$(curl -s -w '\n%{http_code}' --max-time 30 "$rm" 2>/dev/null)
  status=$(printf '%s' "$body" | tail -1)
  if [[ "$status" != "200" ]]; then
    echo "   2. protected-resource metadata     ✗ $status — THE #2049 DEADLOCK: the challenge points at a gated document"
    FAILED=1; return 1
  fi
  local authsrv
  authsrv=$(printf '%s' "$body" | sed '$d' | python3 -c \
    'import json,sys
try:
    d=json.load(sys.stdin); a=d.get("authorization_servers") or []
    print(a[0] if a else "")
except Exception: print("")' 2>/dev/null)
  if [[ -z "$authsrv" ]]; then
    echo "   2. protected-resource metadata     ✗ 200 but no authorization_servers — client still cannot find login"
    FAILED=1; return 1
  fi
  echo "   2. protected-resource metadata     ✓ 200 -> $authsrv"

  # 3 ── authorization-server metadata, with the endpoints the client needs.
  body=$(curl -s -w '\n%{http_code}' --max-time 30 "${authsrv%/}/.well-known/oauth-authorization-server" 2>/dev/null)
  status=$(printf '%s' "$body" | tail -1)
  local endpoints
  endpoints=$(printf '%s' "$body" | sed '$d' | python3 -c \
    'import json,sys
try:
    d=json.load(sys.stdin)
    print("%s|%s|%s" % (d.get("authorization_endpoint",""), d.get("registration_endpoint",""),
                        "S256" if "S256" in (d.get("code_challenge_methods_supported") or []) else ""))
except Exception: print("||")' 2>/dev/null)
  local authep regep pkce
  IFS='|' read -r authep regep pkce <<<"$endpoints"
  if [[ "$status" != "200" || -z "$authep" ]]; then
    echo "   3. authorization-server metadata   ✗ $status / missing authorization_endpoint"
    FAILED=1; return 1
  fi
  echo "   3. authorization-server metadata   ✓ 200  PKCE=${pkce:-none}"

  # 4 ── dynamic registration with a localhost redirect: how desktop clients
  #      receive the callback. Optional per RFC, so absence is not a failure.
  if [[ -n "$regep" ]]; then
    body=$(curl -s -w '\n%{http_code}' --max-time 30 -X POST "$regep" \
      -H 'Content-Type: application/json' \
      -d '{"client_name":"deployed-handshake-probe","redirect_uris":["http://localhost:33418/callback"],"grant_types":["authorization_code"],"response_types":["code"],"token_endpoint_auth_method":"none"}' 2>/dev/null)
    status=$(printf '%s' "$body" | tail -1)
    if [[ "$status" == "200" || "$status" == "201" ]]; then
      echo "   4. dynamic registration            ✓ $status (localhost redirect accepted)"
    else
      echo "   4. dynamic registration            ✗ $status — desktop clients cannot self-register"
      FAILED=1; return 1
    fi
  else
    echo "   4. dynamic registration            — not offered (optional)"
  fi

  # 5 ── authorize with PKCE should move the user toward a sign-in surface.
  local chal="E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
  local loc
  loc=$(curl -s -o /dev/null -D- --max-time 30 \
    "$authep?response_type=code&client_id=deployed-handshake-probe&redirect_uri=http%3A%2F%2Flocalhost%3A33418%2Fcallback&code_challenge=$chal&code_challenge_method=S256&state=probe&scope=mcp" \
    2>/dev/null | grep -i '^location:' | head -1 | sed 's/^[Ll]ocation: *//' | tr -d '\r')
  if [[ -z "$loc" ]]; then
    echo "   5. authorize                       ✗ no redirect toward sign-in"
    FAILED=1; return 1
  fi
  echo "   5. authorize                       ✓ 302"

  # 6 ── the sign-in surface must actually render.
  [[ "$loc" == /* ]] && loc="$base$loc"
  body=$(curl -s -w '\n%{http_code}' --max-time 30 "$loc" 2>/dev/null)
  status=$(printf '%s' "$body" | tail -1)
  if [[ "$status" == "200" ]] && printf '%s' "$body" | grep -qiE 'sign in|log in|google'; then
    echo "   6. sign-in surface renders         ✓ 200"
  else
    echo "   6. sign-in surface renders         ✗ $status or no sign-in affordance"
    FAILED=1; return 1
  fi
  return 0
}

for h in $HOSTS; do
  probe_host "$h" || true
  echo
done

if [[ "$FAILED" -eq 0 ]]; then
  echo "OAuth handshake: all steps passed."
  echo "NOTE: server side only — this does not prove any specific client completes the flow."
  exit 0
fi
echo "OAuth handshake: FAILURES above. A client hitting this instance may fall back to a manual flow."
exit 1
