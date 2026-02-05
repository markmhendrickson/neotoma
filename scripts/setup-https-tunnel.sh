#!/bin/bash
# Setup HTTPS tunnel for MCP server testing
# Uses ngrok to create an HTTPS tunnel to localhost:8080

set -euo pipefail

HTTP_PORT="${HTTP_PORT:-8080}"
NGROK_PORT="${NGROK_PORT:-4040}"

echo "🔒 Setting up HTTPS tunnel for MCP server testing..."
echo ""

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
  echo "❌ ngrok is not installed."
  echo ""
  echo "Install options:"
  echo "  1. Homebrew: brew install ngrok/ngrok/ngrok"
  echo "  2. Download: https://ngrok.com/download"
  echo "  3. Sign up: https://dashboard.ngrok.com/signup (free account)"
  echo ""
  exit 1
fi

# Check if ngrok is authenticated
if ! ngrok config check &> /dev/null; then
  echo "⚠️  ngrok is not authenticated."
  echo ""
  echo "To authenticate:"
  echo "  1. Sign up at https://dashboard.ngrok.com/signup"
  echo "  2. Get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken"
  echo "  3. Run: ngrok config add-authtoken YOUR_AUTHTOKEN"
  echo ""
  exit 1
fi

# Check if port 8080 is in use (skip prompt when TUNNEL_NONINTERACTIVE=1, e.g. dev:api/dev:mcp)
if ! lsof -Pi :${HTTP_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
  if [[ "${TUNNEL_NONINTERACTIVE:-}" == "1" ]]; then
    echo "⚠️  Port ${HTTP_PORT} not in use yet; tunnel will start anyway (server starting in parallel)."
  else
    echo "⚠️  Port ${HTTP_PORT} is not in use. Make sure the MCP server is running:"
    echo "   npm run dev:mcp"
    echo ""
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      exit 1
    fi
  fi
fi

# Optional: fixed domain (e.g. dev.neotoma.io). Requires ngrok reserved domain.
# Set NGROK_DOMAIN in .env or when running: NGROK_DOMAIN=dev.neotoma.io npm run dev:server+api
NGROK_DOMAIN="${NGROK_DOMAIN:-}"

if [ -n "$NGROK_DOMAIN" ]; then
  NGROK_URL="https://${NGROK_DOMAIN}"
  echo "✅ Starting ngrok tunnel on port ${HTTP_PORT} (domain: ${NGROK_DOMAIN})..."
else
  echo "✅ Starting ngrok tunnel on port ${HTTP_PORT}..."
fi
echo "   Web interface: http://localhost:${NGROK_PORT}"
echo ""

# Start ngrok in background (with --domain if NGROK_DOMAIN set)
if [ -n "$NGROK_DOMAIN" ]; then
  ngrok http ${HTTP_PORT} --domain="${NGROK_DOMAIN}" --log=stdout > /tmp/ngrok.log 2>&1 &
else
  ngrok http ${HTTP_PORT} --log=stdout > /tmp/ngrok.log 2>&1 &
fi
NGROK_PID=$!

# When using a fixed domain we already have the URL; otherwise get it from ngrok API
if [ -z "$NGROK_DOMAIN" ]; then
  sleep 2
  NGROK_URL=""
  MAX_RETRIES=10
  RETRY_COUNT=0

  while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    NGROK_URL=$(curl -s http://localhost:${NGROK_PORT}/api/tunnels 2>/dev/null | grep -o '"public_url":"https://[^"]*"' | head -1 | cut -d'"' -f4 || echo "")
    
    if [ -n "$NGROK_URL" ]; then
      break
    fi
    
    RETRY_COUNT=$((RETRY_COUNT + 1))
    sleep 1
  done

  if [ -z "$NGROK_URL" ]; then
    echo "❌ Failed to get ngrok URL. Check ngrok logs:"
    echo "   tail -f /tmp/ngrok.log"
    kill $NGROK_PID 2>/dev/null || true
    exit 1
  fi
else
  # Give ngrok a moment to bind the domain
  sleep 2
fi

# Write URL and PID early so the server (if waiting for this file) can start with API_BASE_URL set
echo "$NGROK_PID" > /tmp/ngrok-mcp.pid
echo "$NGROK_URL" > /tmp/ngrok-mcp-url.txt

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
# Check cwd .env too (e.g. Cursor workspace root may differ from repo root)
if [ ! -f "${ENV_FILE}" ] && [ -f ".env" ]; then
  ENV_FILE=".env"
fi

# No need to prompt for API_BASE_URL when it's already set to this tunnel or to dev.neotoma.io
ENV_MATCHES_TUNNEL=0
API_BASE_IN_ENV=0
if [ -f "${ENV_FILE}" ]; then
  if grep -q "API_BASE_URL=" "${ENV_FILE}" 2>/dev/null; then
    API_BASE_IN_ENV=1
    LINE=$(grep "API_BASE_URL=" "${ENV_FILE}" 2>/dev/null | head -1)
    if echo "$LINE" | grep -qF "${NGROK_URL}"; then
      ENV_MATCHES_TUNNEL=1
    elif echo "$LINE" | grep -qE "dev\.neotoma\.io"; then
      ENV_MATCHES_TUNNEL=1
    fi
  fi
fi

CURSOR_ALREADY_SET=0
CURSOR_CONFIG="${REPO_ROOT}/.cursor/mcp.json"
if [ -f "${CURSOR_CONFIG}" ]; then
  if grep -qF "${NGROK_URL}" "${CURSOR_CONFIG}" 2>/dev/null; then
    CURSOR_ALREADY_SET=1
  fi
fi

# Prefix width for alignment: "  ℹ️  " / "  ⚠️  " / "  ✅  " (same length)
echo "✅ HTTPS tunnel established!"
echo ""
echo "📋 Configuration:"
echo "   ℹ️  HTTPS URL: ${NGROK_URL}"
echo "   ℹ️  Local URL: http://localhost:${HTTP_PORT}"
echo ""

if [ "$ENV_MATCHES_TUNNEL" -eq 1 ] && [ "$CURSOR_ALREADY_SET" -eq 1 ]; then
  echo "ℹ️  Context: API_BASE_URL and Cursor already point to this tunnel. No config changes needed."
else
  echo "🔧 Next steps (only what’s needed):"
  echo ""

  if [ "$ENV_MATCHES_TUNNEL" -eq 0 ]; then
    if [ "$API_BASE_IN_ENV" -eq 1 ]; then
      echo "  ℹ️  API_BASE_URL is in .env but points elsewhere. To use this tunnel, set it to:"
    else
      echo "  ℹ️  Set API_BASE_URL so the server and Add to Cursor use the tunnel (e.g. in .env or export):"
    fi
    echo "      API_BASE_URL=${NGROK_URL}"
    if [ "${TUNNEL_NONINTERACTIVE:-}" = "1" ]; then
      echo ""
      echo "  ℹ️  Restart this process (Ctrl+C, then run again) so the server picks up the URL:"
      echo "      API_BASE_URL=${NGROK_URL} npm run dev:server+api   # or dev:mcp / dev:api"
    else
      echo ""
      echo "  ℹ️  Restart the server (if running) so it picks up the URL."
    fi
    echo ""
  fi

  if [ "$CURSOR_ALREADY_SET" -eq 0 ]; then
    echo "  ℹ️  Update .cursor/mcp.json or use Add to Cursor in the Neotoma UI:"
    echo "      {\"mcpServers\": {\"neotoma\": {\"url\": \"${NGROK_URL}/mcp\"}}}"
    echo "      Then restart Cursor to load the config."
    echo ""
  fi
fi

echo "  ⚠️  Keep this terminal open to maintain the tunnel. Free-tier URLs change each run."
echo "      Press Ctrl+C to stop ngrok"
echo ""

# Wait for user interrupt
trap 'echo ""; echo "🛑 Stopping ngrok tunnel..."; kill "$(cat /tmp/ngrok-mcp.pid 2>/dev/null)" 2>/dev/null || true; rm -f /tmp/ngrok-mcp.pid /tmp/ngrok-mcp-url.txt; exit 0' INT TERM

wait $NGROK_PID
