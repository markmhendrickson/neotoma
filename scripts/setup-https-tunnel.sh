#!/bin/bash
# Setup HTTPS tunnel for MCP server testing
# Supports ngrok (default) or Cloudflare. Set NEOTOMA_TUNNEL_PROVIDER=cloudflare to use cloudflared.

set -euo pipefail

HTTP_PORT="${HTTP_PORT:-8080}"
# When CLI session spawns, API may bind to a different port on EADDRINUSE; wait for port file
if [ -n "${NEOTOMA_SESSION_PORT_FILE:-}" ]; then
  _wait=0
  while [ "$_wait" -lt 30 ]; do
    if [ -s "$NEOTOMA_SESSION_PORT_FILE" ]; then
      _p=$(cat "$NEOTOMA_SESSION_PORT_FILE" 2>/dev/null | tr -d '\n')
      if [[ "$_p" =~ ^[0-9]+$ ]]; then
        HTTP_PORT="$_p"
        break
      fi
    fi
    sleep 1
    _wait=$((_wait + 1))
  done
fi
NGROK_PORT="${NGROK_PORT:-4040}"
NGROK_PID_FILE="${NGROK_PID_FILE:-/tmp/ngrok-mcp.pid}"
NGROK_URL_FILE="${NGROK_URL_FILE:-/tmp/ngrok-mcp-url.txt}"

# Provider: explicit env wins; else ngrok if installed and authenticated; else Cloudflare if available
# (Prefer ngrok when both are present so "neotoma api start --tunnel" works without extra config.)
TUNNEL_PROVIDER="${NEOTOMA_TUNNEL_PROVIDER:-${TUNNEL_PROVIDER:-}}"
if [ -z "$TUNNEL_PROVIDER" ]; then
  if command -v ngrok &> /dev/null && ngrok config check &> /dev/null 2>&1; then
    TUNNEL_PROVIDER="ngrok"
  elif command -v cloudflared &> /dev/null; then
    TUNNEL_PROVIDER="cloudflare"
  else
    TUNNEL_PROVIDER="ngrok"
  fi
fi

echo "🔒 Setting up HTTPS tunnel for MCP server testing..."
echo "   Forwarding to http://localhost:${HTTP_PORT}"
echo ""

# Port-in-use check (skip prompt when TUNNEL_NONINTERACTIVE=1, e.g. dev:api)
if ! lsof -Pi :${HTTP_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
  if [[ "${TUNNEL_NONINTERACTIVE:-}" == "1" ]]; then
    echo "⚠️  Port ${HTTP_PORT} not in use yet; tunnel will start anyway (server starting in parallel)."
  else
    echo "⚠️  Port ${HTTP_PORT} is not in use. Make sure the MCP server is running:"
    echo "   npm run dev:api"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 1
    fi
  fi
fi

if [ "$TUNNEL_PROVIDER" = "cloudflare" ]; then
  # -------------------------------------------------------------------------
  # Cloudflare Tunnel: named tunnel (e.g. neotoma) or quick tunnel
  # -------------------------------------------------------------------------
  if ! command -v cloudflared &> /dev/null; then
    echo "❌ cloudflared is not installed." >&2
    echo "" >&2
    echo "Install: brew install cloudflare/cloudflare/cloudflared" >&2
    echo "Or: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
    echo "" >&2
    [ "${TUNNEL_NONINTERACTIVE:-}" = "1" ] && echo "Tunnel exited (API is still running on port ${HTTP_PORT}). Install cloudflared or ngrok to enable tunnel." >&2
    exit 1
  fi

  # Named tunnel: from env or .env (so .env-only config works when CLI spawns script)
  CLOUDFLARED_NAMED="${CLOUDFLARE_TUNNEL_NAME:-}"
  if [ -z "$CLOUDFLARED_NAMED" ]; then
    if [ -z "${EARLY_REPO_ROOT:-}" ]; then
      EARLY_REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
      EARLY_ENV_FILE="${EARLY_REPO_ROOT}/.env"
      [ ! -f "${EARLY_ENV_FILE}" ] && [ -f ".env" ] && EARLY_ENV_FILE=".env"
    fi
    if [ -f "${EARLY_ENV_FILE:-}" ]; then
      _tname=$(grep -E '^CLOUDFLARE_TUNNEL_NAME=' "${EARLY_ENV_FILE}" 2>/dev/null | head -1 | sed 's/^[^=]*=//' | tr -d '"' | tr -d "'" | xargs)
      [ -n "$_tname" ] && CLOUDFLARED_NAMED="$_tname"
    fi
  fi
  if [ -n "$CLOUDFLARED_NAMED" ]; then
    # Named tunnel (e.g. neotoma). Requires ~/.cloudflared configured and tunnel URL in env or .env.
    NAMED_URL="${CLOUDFLARE_TUNNEL_URL:-}"
    if [ -z "$NAMED_URL" ] && [ -z "${EARLY_REPO_ROOT:-}" ]; then
      EARLY_REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
      EARLY_ENV_FILE="${EARLY_REPO_ROOT}/.env"
      [ ! -f "${EARLY_ENV_FILE}" ] && [ -f ".env" ] && EARLY_ENV_FILE=".env"
    fi
    if [ -z "$NAMED_URL" ] && [ -f "${EARLY_ENV_FILE:-}" ]; then
      _line=""
      grep -q "HOST_URL=" "${EARLY_ENV_FILE}" 2>/dev/null && _line=$(grep "HOST_URL=" "${EARLY_ENV_FILE}" 2>/dev/null | head -1)
      [ -z "$_line" ] && grep -q "API_BASE_URL=" "${EARLY_ENV_FILE}" 2>/dev/null && _line=$(grep "API_BASE_URL=" "${EARLY_ENV_FILE}" 2>/dev/null | head -1)
      if [ -n "$_line" ]; then
        _val=$(echo "$_line" | sed 's/^[^=]*=//' | tr -d '"' | tr -d "'" | xargs)
        [ -n "$_val" ] && NAMED_URL="${_val}"
      fi
    fi
    if [ -z "$NAMED_URL" ]; then
      echo "❌ Named tunnel $CLOUDFLARED_NAMED requires CLOUDFLARE_TUNNEL_URL or HOST_URL in .env (e.g. https://mcp.neotoma.io)" >&2
      [ "${TUNNEL_NONINTERACTIVE:-}" = "1" ] && echo "   To use ngrok instead: neotoma api start --env dev --tunnel --tunnel-provider ngrok" >&2
      exit 1
    fi
    # Normalize: no trailing slash
    NAMED_URL="${NAMED_URL%/}"
    echo "✅ Starting Cloudflare named tunnel \"$CLOUDFLARED_NAMED\" (port ${HTTP_PORT})..."
    echo "   Ensure ~/.cloudflared/config.yml ingress points to http://localhost:${HTTP_PORT}"
    CLOUDFLARED_LOG="${NGROK_URL_FILE%.txt}.log"
    rm -f "$CLOUDFLARED_LOG"
    cloudflared tunnel run "$CLOUDFLARED_NAMED" > "$CLOUDFLARED_LOG" 2>&1 &
    NGROK_PID=$!
    sleep 3
    if ! kill -0 $NGROK_PID 2>/dev/null; then
      echo "❌ cloudflared exited. Check: tail -f $CLOUDFLARED_LOG"
      exit 1
    fi
    NGROK_URL="$NAMED_URL"
  else
    # Quick tunnel (ephemeral; can hit 429 rate limit)
    echo "✅ Starting Cloudflare quick tunnel on port ${HTTP_PORT}..."
    CLOUDFLARED_LOG="${NGROK_URL_FILE%.txt}.log"
    rm -f "$CLOUDFLARED_LOG"
    cloudflared tunnel --url "http://localhost:${HTTP_PORT}" > "$CLOUDFLARED_LOG" 2>&1 &
    NGROK_PID=$!
    NGROK_URL=""
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      sleep 2
      NGROK_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$CLOUDFLARED_LOG" 2>/dev/null | head -1 || true)
      [ -n "$NGROK_URL" ] && break
    done
    if [ -z "$NGROK_URL" ]; then
      echo "❌ Failed to get Cloudflare tunnel URL. Check: tail -f $CLOUDFLARED_LOG" >&2
      echo "   Tip: use named tunnel to avoid 429: CLOUDFLARE_TUNNEL_NAME=neotoma CLOUDFLARE_TUNNEL_URL=https://your-hostname" >&2
      [ "${TUNNEL_NONINTERACTIVE:-}" = "1" ] && echo "   To use ngrok instead: neotoma api start --env dev --tunnel --tunnel-provider ngrok" >&2
      kill $NGROK_PID 2>/dev/null || true
      exit 1
    fi
  fi
else
  # -------------------------------------------------------------------------
  # ngrok (default)
  # -------------------------------------------------------------------------
  if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed." >&2
    echo "" >&2
    echo "Install options:" >&2
    echo "  1. Homebrew: brew install ngrok/ngrok/ngrok" >&2
    echo "  2. Download: https://ngrok.com/download" >&2
    echo "  3. Sign up: https://dashboard.ngrok.com/signup (free account)" >&2
    echo "" >&2
    echo "Or use Cloudflare: set NEOTOMA_TUNNEL_PROVIDER=cloudflare and install cloudflared." >&2
    echo "" >&2
    [ "${TUNNEL_NONINTERACTIVE:-}" = "1" ] && echo "Tunnel exited (API is still running on port ${HTTP_PORT}). Install ngrok or cloudflared to enable tunnel." >&2
    exit 1
  fi
  if ! ngrok config check &> /dev/null; then
    echo "⚠️  ngrok is not authenticated." >&2
    echo "" >&2
    echo "To authenticate:" >&2
    echo "  1. Sign up at https://dashboard.ngrok.com/signup" >&2
    echo "  2. Get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken" >&2
    echo "  3. Run: ngrok config add-authtoken YOUR_AUTHTOKEN" >&2
    echo "" >&2
    [ "${TUNNEL_NONINTERACTIVE:-}" = "1" ] && echo "Tunnel exited (API is still running on port ${HTTP_PORT}). Run 'ngrok config add-authtoken <token>' to enable tunnel." >&2
    exit 1
  fi

  # Fixed domain: derived from HOST_URL in .env so tunnel URL matches. Requires ngrok reserved/custom domain.
  TUNNEL_DOMAIN=""
  if [ -z "${EARLY_REPO_ROOT:-}" ]; then
    EARLY_REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
    EARLY_ENV_FILE="${EARLY_REPO_ROOT}/.env"
    [ ! -f "${EARLY_ENV_FILE}" ] && [ -f ".env" ] && EARLY_ENV_FILE=".env"
  fi
  if [ -f "${EARLY_ENV_FILE}" ]; then
    _line=""
    grep -q "HOST_URL=" "${EARLY_ENV_FILE}" 2>/dev/null && _line=$(grep "HOST_URL=" "${EARLY_ENV_FILE}" 2>/dev/null | head -1)
    [ -z "$_line" ] && grep -q "API_BASE_URL=" "${EARLY_ENV_FILE}" 2>/dev/null && _line=$(grep "API_BASE_URL=" "${EARLY_ENV_FILE}" 2>/dev/null | head -1)
    if [ -n "$_line" ]; then
      _val=$(echo "$_line" | sed 's/^[^=]*=//' | tr -d '"' | tr -d "'" | xargs)
      if [ -n "$_val" ]; then
        _host=$(echo "$_val" | sed -e 's|^[^:]*://||' -e 's|/.*||' -e 's|:.*||')
        [ -n "$_host" ] && TUNNEL_DOMAIN="$_host"
      fi
    fi
  fi

  if [ -n "$TUNNEL_DOMAIN" ]; then
    NGROK_URL="https://${TUNNEL_DOMAIN}"
    echo "✅ Starting ngrok tunnel on port ${HTTP_PORT} (domain from HOST_URL: ${TUNNEL_DOMAIN})..."
    echo "   (ensure ${TUNNEL_DOMAIN} is a reserved/custom domain in your ngrok account)"
  else
    echo "✅ Starting ngrok tunnel on port ${HTTP_PORT}..."
  fi
  echo "   Web interface: http://localhost:${NGROK_PORT}"
  echo ""

  if [ -n "$TUNNEL_DOMAIN" ]; then
    ngrok http ${HTTP_PORT} --domain="${TUNNEL_DOMAIN}" --log=stdout > /tmp/ngrok.log 2>&1 &
  else
    ngrok http ${HTTP_PORT} --log=stdout > /tmp/ngrok.log 2>&1 &
  fi
  NGROK_PID=$!

  if [ -z "$TUNNEL_DOMAIN" ]; then
    sleep 2
    NGROK_URL=""
    MAX_RETRIES=10
    RETRY_COUNT=0
    while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
      NGROK_URL=$(curl -s http://localhost:${NGROK_PORT}/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4 || echo "")
      [ -n "$NGROK_URL" ] && break
      RETRY_COUNT=$((RETRY_COUNT + 1))
      sleep 1
    done
    if [ -z "$NGROK_URL" ]; then
      echo "❌ Failed to get ngrok URL. Check ngrok logs: tail -f /tmp/ngrok.log"
      kill $NGROK_PID 2>/dev/null || true
      exit 1
    fi
  else
    sleep 2
  fi
fi

# Write URL and PID early so the server (if waiting for this file) can start with API_BASE_URL set
echo "$NGROK_PID" > "$NGROK_PID_FILE"
echo "$NGROK_URL" > "$NGROK_URL_FILE"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
# Check cwd .env too (e.g. Cursor workspace root may differ from repo root)
if [ ! -f "${ENV_FILE}" ] && [ -f ".env" ]; then
  ENV_FILE=".env"
fi

# Host URL from .env (HOST_URL); used for display and to see if already set to tunnel
ENV_MATCHES_TUNNEL=0
API_BASE_IN_ENV=0
ENV_API_BASE_VALUE=""
if [ -f "${ENV_FILE}" ]; then
  LINE=""
  grep -q "HOST_URL=" "${ENV_FILE}" 2>/dev/null && LINE=$(grep "HOST_URL=" "${ENV_FILE}" 2>/dev/null | head -1)
  [ -z "$LINE" ] && grep -q "API_BASE_URL=" "${ENV_FILE}" 2>/dev/null && LINE=$(grep "API_BASE_URL=" "${ENV_FILE}" 2>/dev/null | head -1)
  if [ -n "$LINE" ]; then
    API_BASE_IN_ENV=1
    ENV_API_BASE_VALUE=$(echo "$LINE" | sed 's/^[^=]*=//' | tr -d '"' | tr -d "'" | xargs)
    if echo "$LINE" | grep -qF "${NGROK_URL}"; then
      ENV_MATCHES_TUNNEL=1
    elif echo "$LINE" | grep -qE "dev\.neotoma\.io"; then
      ENV_MATCHES_TUNNEL=1
    fi
  fi
fi

# URL the server uses (from .env if set, else tunnel); use same for Cursor recommendation
if [ -n "${ENV_API_BASE_VALUE}" ]; then
  BASE_URL_FOR_CURSOR="${ENV_API_BASE_VALUE}"
else
  BASE_URL_FOR_CURSOR="${NGROK_URL}"
fi
CURSOR_ALREADY_SET=0
CURSOR_CONFIG="${REPO_ROOT}/.cursor/mcp.json"
if [ -f "${CURSOR_CONFIG}" ]; then
  if grep -qF "${BASE_URL_FOR_CURSOR}" "${CURSOR_CONFIG}" 2>/dev/null; then
    CURSOR_ALREADY_SET=1
  fi
fi

# Prefix width for alignment: "  ℹ️  " / "  ⚠️  " / "  ✅  " (same length)
echo "✅ HTTPS tunnel established!"
echo ""

if [ "${TUNNEL_NONINTERACTIVE:-}" != "1" ]; then
echo "📋 Configuration:"
echo "   ℹ️  Local URL: http://localhost:${HTTP_PORT}"
if [ -n "${ENV_API_BASE_VALUE}" ]; then
  echo "   ℹ️  Server uses .env: HOST_URL=${ENV_API_BASE_VALUE}"
  echo "   ℹ️  Tunnel forwards to localhost:${HTTP_PORT}; use ${ENV_API_BASE_VALUE} in Cursor (e.g. ${ENV_API_BASE_VALUE}/mcp)"
else
  echo "   ℹ️  HOST_URL (server and Cursor): ${NGROK_URL}"
fi
echo ""

if [ "$ENV_MATCHES_TUNNEL" -eq 1 ] && [ "$CURSOR_ALREADY_SET" -eq 1 ]; then
  echo "ℹ️  Context: HOST_URL and Cursor already point to this tunnel. No config changes needed."
else
  echo "🔧 Next steps (only what’s needed):"
  echo ""

  if [ "$ENV_MATCHES_TUNNEL" -eq 0 ]; then
    if [ "$API_BASE_IN_ENV" -eq 1 ]; then
      echo "  ℹ️  HOST_URL is in .env but points elsewhere. To use this tunnel, set it to:"
    else
      echo "  ℹ️  Server auto-discovers tunnel URL. For fixed domain, set HOST_URL in .env:"
    fi
    echo "      HOST_URL=${NGROK_URL}"
    if [ "${TUNNEL_NONINTERACTIVE:-}" = "1" ]; then
      echo ""
      echo "  ℹ️  Restart this process (Ctrl+C, then run again) so the server picks up the URL:"
      echo "      HOST_URL=${NGROK_URL} npm run dev:server+api   # or dev:api"
    else
      echo ""
      echo "  ℹ️  Restart the server (if running) so it picks up the URL."
    fi
    echo ""
  fi

  if [ "$CURSOR_ALREADY_SET" -eq 0 ]; then
    echo "  ℹ️  Update .cursor/mcp.json or use Add to Cursor in the Neotoma UI:"
    echo "      {\"mcpServers\": {\"neotoma\": {\"url\": \"${BASE_URL_FOR_CURSOR}/mcp\"}}}"
    echo "      Then restart Cursor to load the config."
    echo ""
  fi
fi

echo "  ⚠️  Keep this terminal open to maintain the tunnel. Free-tier URLs change each run."
echo "      Press Ctrl+C to stop the tunnel"
echo ""
fi

# Wait for user interrupt
trap 'echo ""; echo "🛑 Stopping tunnel..."; kill "$(cat "$NGROK_PID_FILE" 2>/dev/null)" 2>/dev/null || true; rm -f "$NGROK_PID_FILE" "$NGROK_URL_FILE"; exit 0' INT TERM

wait $NGROK_PID
