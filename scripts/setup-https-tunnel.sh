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

# Check if port 8080 is in use
if ! lsof -Pi :${HTTP_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "⚠️  Port ${HTTP_PORT} is not in use. Make sure the MCP server is running:"
  echo "   npm run dev:mcp"
  echo ""
  read -p "Continue anyway? (y/n) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

echo "✅ Starting ngrok tunnel on port ${HTTP_PORT}..."
echo "   Web interface: http://localhost:${NGROK_PORT}"
echo ""

# Start ngrok in background
ngrok http ${HTTP_PORT} --log=stdout > /tmp/ngrok.log 2>&1 &
NGROK_PID=$!

# Wait for ngrok to start
sleep 2

# Get the HTTPS URL from ngrok API
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

echo "✅ HTTPS tunnel established!"
echo ""
echo "📋 Configuration:"
echo "   HTTPS URL: ${NGROK_URL}"
echo "   Local URL: http://localhost:${HTTP_PORT}"
echo ""
echo "🔧 Next steps:"
echo ""
echo "1. Set MCP_PROXY_URL and API_BASE_URL (Add to Cursor uses MCP_PROXY_URL):"
echo "   export MCP_PROXY_URL=${NGROK_URL}"
echo "   export API_BASE_URL=${NGROK_URL}"
echo ""
echo "2. Restart the MCP server (if running):"
echo "   # Stop current server (Ctrl+C), then:"
echo "   MCP_PROXY_URL=${NGROK_URL} API_BASE_URL=${NGROK_URL} npm run dev:mcp"
echo ""
echo "3. Update .cursor/mcp.json to use HTTPS URL, or use Add to Cursor in the Neotoma UI."
echo "   {"
echo "     \"mcpServers\": {"
echo "       \"neotoma\": {"
echo "         \"url\": \"${NGROK_URL}/mcp\""
echo "       }"
echo "     }"
echo "   }"
echo ""
echo "4. Restart Cursor to load the new configuration"
echo ""
echo "⚠️  Keep this terminal open to maintain the tunnel. Free-tier URLs change each run."
echo "   Press Ctrl+C to stop ngrok"
echo ""

# Save PID and URL to file for cleanup
echo "$NGROK_PID" > /tmp/ngrok-mcp.pid
echo "$NGROK_URL" > /tmp/ngrok-mcp-url.txt

# Wait for user interrupt
trap 'echo ""; echo "🛑 Stopping ngrok tunnel..."; kill "$(cat /tmp/ngrok-mcp.pid 2>/dev/null)" 2>/dev/null || true; rm -f /tmp/ngrok-mcp.pid /tmp/ngrok-mcp-url.txt; exit 0' INT TERM

wait $NGROK_PID
