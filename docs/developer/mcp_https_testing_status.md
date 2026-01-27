# MCP HTTPS Testing Status

**Date:** 2026-01-27  
**Status:** ✅ **READY FOR TESTING**

## Configuration Complete

### 1. ngrok Setup ✅
- **Authtoken configured:** `NGROK_AUTHTOKEN` synced from 1Password
- **Tunnel active:** `https://melissia-introrse-correspondently.ngrok-free.dev`
- **Local port:** 8080
- **Tunnel PID:** Stored in `/tmp/ngrok-mcp.pid`

### 2. Cursor Configuration ✅
- **`.cursor/mcp.json` updated** with HTTPS URL:
  ```json
  {
    "mcpServers": {
      "neotoma": {
        "url": "https://melissia-introrse-correspondently.ngrok-free.dev/mcp"
      }
    }
  }
  ```

### 3. Server Configuration ⚠️
- **MCP server running:** Port 8080 (confirmed)
- **API_BASE_URL:** Needs to be set to HTTPS URL for OAuth redirects
- **Action required:** Restart MCP server with `API_BASE_URL` environment variable

## Next Steps

### Step 1: Restart MCP Server with HTTPS URL

**Stop current server** (if running in terminal, press Ctrl+C), then:

```bash
# Set API_BASE_URL to ngrok HTTPS URL
export API_BASE_URL="https://melissia-introrse-correspondently.ngrok-free.dev"

# Restart MCP server
npm run dev:mcp
```

**Or add to `.env` file:**
```bash
echo 'API_BASE_URL="https://melissia-introrse-correspondently.ngrok-free.dev"' >> .env
```

Then restart the server.

### Step 2: Restart Cursor

1. **Quit Cursor completely** (Cmd+Q on Mac)
2. **Reopen Cursor** to load new MCP configuration
3. **Check MCP status** - should show "Authentication needed" with Connect button

### Step 3: Test Connect Button

1. **Open Cursor MCP settings** or check MCP status
2. **Verify** "Authentication needed" message appears
3. **Click Connect button** (should appear with HTTPS URL)
4. **Complete OAuth flow** in browser
5. **Verify** connection is established

## Tunnel Management

### Check Tunnel Status
```bash
# View ngrok web interface
open http://localhost:4040

# Check tunnel is running
ps aux | grep "[n]grok http"

# Get tunnel URL
cat /tmp/ngrok-mcp-url.txt
```

### Stop Tunnel
```bash
# Kill ngrok process
kill $(cat /tmp/ngrok-mcp.pid 2>/dev/null) 2>/dev/null || pkill -f "ngrok http"
rm -f /tmp/ngrok-mcp.pid /tmp/ngrok-mcp-url.txt
```

### Restart Tunnel
```bash
npm run tunnel:https
```

## Troubleshooting

### Connect Button Still Not Appearing

1. **Verify HTTPS URL is correct** in `.cursor/mcp.json`
2. **Verify API_BASE_URL is set** and server restarted
3. **Check tunnel is active:** `curl https://melissia-introrse-correspondently.ngrok-free.dev/.well-known/oauth-authorization-server`
4. **Clear Cursor's MCP cache:** Remove and re-add server
5. **Check server logs** for 401 responses

### OAuth Redirect Fails

- **Verify API_BASE_URL** matches ngrok URL exactly
- **Check discovery endpoints** return HTTPS URLs:
  ```bash
  curl https://melissia-introrse-correspondently.ngrok-free.dev/.well-known/oauth-authorization-server
  ```

### Tunnel URL Changes

**Note:** ngrok free tier assigns new URLs on each restart. If you restart ngrok:
1. Update `.cursor/mcp.json` with new URL
2. Update `API_BASE_URL` environment variable
3. Restart MCP server
4. Restart Cursor

## Current Configuration

- **HTTPS URL:** `https://melissia-introrse-correspondently.ngrok-free.dev`
- **MCP Endpoint:** `https://melissia-introrse-correspondently.ngrok-free.dev/mcp`
- **Tunnel Status:** Active (PID in `/tmp/ngrok-mcp.pid`)
- **Server Status:** Running on port 8080
- **API_BASE_URL:** Needs to be set to HTTPS URL

## References

- HTTPS Testing Guide: `docs/developer/mcp_https_testing.md`
- Troubleshooting: `docs/developer/mcp_connect_button_troubleshooting.md`
- Notion MCP Example: `https://mcp.notion.com/mcp`
